import { preprocessMarkdown, hasHeading, MAMMOTH_STYLE_MAP } from './preprocessMarkdown';
import { assertIngestibleFormat, looksBinary, UnsupportedFileError } from './fileFormat';
import { extractDocxSignals } from './docxSignals';
import { segmentDocx } from './docxSegment';
import { applySignalsToMarkdown, injectSignalStructure, textPipelineUnderSegmented } from './docxBridge';
import { getParsedManuscript } from './parseCache';
import { countWords } from './parseMarkdown';

export { UnsupportedFileError } from './fileFormat';

export interface PlainTextIngestOptions {
  /** The user's typed paste title, or a filename. */
  title?: string;
  /** When true (a deliberately-typed paste title), `title` overrides any title
   *  recovered from the text's own title page. When false/absent (a filename), a
   *  recovered title wins and `title` is only a fallback — as readDocx treats the
   *  filename. */
  titleAuthoritative?: boolean;
}

/**
 * Ingest plain text — a paste, or a .md/.txt file — into structured manuscript
 * markdown. This is the non-DOCX counterpart to readDocx and the SINGLE entry
 * point both the paste box and the md/txt file path funnel through, so all three
 * plain-text sources segment identically. (DOCX has its own entry because it
 * additionally mines layout signals mammoth flattens away.) Runs the shared
 * preprocessing pipeline, then guarantees a heading and a title so heading-less
 * input still becomes a titled, structured manuscript.
 */
export function ingestPlainText(raw: string, opts: PlainTextIngestOptions = {}): string {
  let text = preprocessMarkdown(raw.trim());
  const title = opts.title?.trim();
  if (!hasHeading(text)) {
    // No structure at all — wrap the whole thing under a title heading.
    text = `# ${title || 'Untitled'}\n\n${text}`;
  }
  const hasRecoveredTitle = /<!--\s*title:/i.test(text);
  if (title && (opts.titleAuthoritative || !hasRecoveredTitle)) {
    text = `<!-- title: ${title} -->\n${text}`;
  }
  return text;
}

/**
 * The environment-independent half of DOCX ingestion: everything after mammoth
 * has produced markdown. Takes the raw mammoth markdown plus the original bytes
 * (needed to mine the layout signals mammoth flattens away) and returns
 * structured manuscript markdown. Split out from `readDocx` so the browser path
 * and the Node fixture harness share ONE signal-rescue + title-fallback code
 * path — only the mammoth call itself differs by environment (browser
 * ArrayBuffer vs Node Buffer), and that half carries no drift-prone logic.
 */
export async function ingestDocxFromMarkdown(
  rawMarkdown: string,
  bytes: ArrayBuffer | Uint8Array,
  opts: { filename?: string } = {},
): Promise<string> {
  const raw = rawMarkdown.trim();
  let text = preprocessMarkdown(raw);

  // Augment with DOCX layout signals (augment-first): the title page's font
  // pyramid and centered author line — which mammoth flattens away — recover a
  // real title/author the text pipeline routinely misses; and when the text
  // pipeline fails to segment at all (a headingless book left as one giant
  // chapter), the signal-detected chapter/matter boundaries are injected so it
  // splits and its front/back matter strips. Best-effort: a signal failure must
  // never block a working text ingestion, so it's guarded.
  try {
    const signals = await extractDocxSignals(bytes);
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

  const title = (opts.filename ?? '').replace(/\.docx$/i, '').replace(/[-_]/g, ' ').trim();
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
  return ingestDocxFromMarkdown(result.value, ab, { filename: file.name });
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
  const title = file.name.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ').trim();
  return ingestPlainText(decoded, { title });
}

export function sortFiles(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function readFilesToMarkdown(files: File[]): Promise<string> {
  const texts = await Promise.all(files.map(readFile));
  return texts.join('\n\n');
}
