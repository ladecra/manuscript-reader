import { preprocessMarkdown, hasHeading, MAMMOTH_STYLE_MAP } from './preprocessMarkdown';
import { assertIngestibleFormat, looksBinary, UnsupportedFileError } from './fileFormat';
import { extractDocxSignals } from './docxSignals';
import { segmentDocx } from './docxSegment';
import { applySignalsToMarkdown, injectSignalStructure, textPipelineUnderSegmented } from './docxBridge';
import { getParsedManuscript } from './parseCache';
import { countWords } from './parseMarkdown';

export { UnsupportedFileError } from './fileFormat';

function decodeText(ab: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(ab);
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res(e.target?.result as ArrayBuffer);
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

async function readDocx(file: File, ab: ArrayBuffer): Promise<string> {
  // mammoth's npm types don't declare convertToMarkdown, but it exists at runtime.
  // We use type assertion to access it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = await import('mammoth') as any;
  const fn = mammoth.convertToMarkdown ?? mammoth.default?.convertToMarkdown;
  if (!fn) throw new Error('mammoth.convertToMarkdown not found');
  let result;
  try {
    result = await fn({ arrayBuffer: ab }, { styleMap: MAMMOTH_STYLE_MAP });
  } catch {
    // mammoth failed to open it as OOXML despite the .docx name / zip signature.
    throw new UnsupportedFileError(
      file.name,
      `“${file.name}” could not be read as a Word document — it may be corrupt. Re-save it from Word as .docx and try again.`,
    );
  }
  const raw = result.value.trim();
  let text = preprocessMarkdown(raw);

  // Augment with DOCX layout signals (augment-first): the title page's font
  // pyramid and centered author line — which mammoth flattens away — recover a
  // real title/author the text pipeline routinely misses; and when the text
  // pipeline fails to segment at all (a headingless book left as one giant
  // chapter), the signal-detected chapter/matter boundaries are injected so it
  // splits and its front/back matter strips. Best-effort: a signal failure must
  // never block a working text ingestion, so it's guarded.
  try {
    const signals = await extractDocxSignals(ab);
    const segmentation = segmentDocx(signals);

    // If the text pipeline collapsed the whole book into one chapter but the
    // signals found real structure, re-run the pipeline over signal-injected
    // markdown (headings the text layer couldn't see) so matter fences + title
    // recovery happen the normal way.
    const { chapters } = getParsedManuscript(text);
    if (segmentation.anchored && textPipelineUnderSegmented(chapters.length, countWords(text)) && segmentation.headings.length > 1) {
      const injected = injectSignalStructure(raw, signals, segmentation);
      text = preprocessMarkdown(injected);
    }

    text = applySignalsToMarkdown(text, segmentation);
  } catch {
    // Signals are an enhancement, not a requirement — fall through to text-only.
  }

  const title = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ').trim();
  if (!hasHeading(text)) {
    // No structure at all — wrap the whole thing under a filename heading.
    text = `# ${title}\n\n${text}`;
  } else if (!/<!--\s*title:/i.test(text)) {
    // Chapters were found but the document had no title page (common for DOCX
    // exports) and signals gave no confident title. Use the filename so the
    // library/topbar don't show the first chapter's name as the manuscript title.
    text = `<!-- title: ${title} -->\n\n${text}`;
  }
  return text;
}

async function readFile(file: File): Promise<string> {
  const ab = await readAsArrayBuffer(file);
  // Sniff the magic bytes before routing so a binary container (legacy .doc,
  // PDF, RTF, .odt/.pages, a ~$ lock file) is refused cleanly instead of being
  // silently read as UTF-8 text and wrapped as one junk chapter.
  assertIngestibleFormat(file.name, new Uint8Array(ab, 0, Math.min(ab.byteLength, 16)));

  if (/\.docx$/i.test(file.name)) return readDocx(file, ab);

  const decoded = decodeText(ab);
  if (looksBinary(decoded)) {
    throw new UnsupportedFileError(
      file.name,
      `“${file.name}” doesn't appear to be a text or Word document. Upload a .docx, .md, or .txt file.`,
    );
  }
  let text = preprocessMarkdown(decoded.trim());
  if (!hasHeading(text)) {
    const title = file.name.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ');
    text = `# ${title}\n\n${text}`;
  }
  return text;
}

export function sortFiles(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function readFilesToMarkdown(files: File[]): Promise<string> {
  const texts = await Promise.all(files.map(readFile));
  return texts.join('\n\n');
}
