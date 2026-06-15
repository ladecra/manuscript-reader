import { preprocessMarkdown, hasHeading, MAMMOTH_STYLE_MAP } from './preprocessMarkdown';

function readAsText(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res((e.target?.result as string) ?? '');
    reader.onerror = rej;
    reader.readAsText(file, 'UTF-8');
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = (e) => res(e.target?.result as ArrayBuffer);
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

async function readDocx(file: File): Promise<string> {
  // mammoth's npm types don't declare convertToMarkdown, but it exists at runtime.
  // We use type assertion to access it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = await import('mammoth') as any;
  const ab = await readAsArrayBuffer(file);
  const fn = mammoth.convertToMarkdown ?? mammoth.default?.convertToMarkdown;
  if (!fn) throw new Error('mammoth.convertToMarkdown not found');
  const result = await fn({ arrayBuffer: ab }, { styleMap: MAMMOTH_STYLE_MAP });
  let text = preprocessMarkdown(result.value.trim());
  const title = file.name.replace(/\.docx$/i, '').replace(/[-_]/g, ' ').trim();
  if (!hasHeading(text)) {
    // No structure at all — wrap the whole thing under a filename heading.
    text = `# ${title}\n\n${text}`;
  } else if (!/<!--\s*title:/i.test(text)) {
    // Chapters were found but the document had no title page (common for DOCX
    // exports). Use the filename as the book title so the library/topbar don't
    // show the first chapter's name as the manuscript title.
    text = `<!-- title: ${title} -->\n\n${text}`;
  }
  return text;
}

async function readFile(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) return readDocx(file);
  let text = preprocessMarkdown((await readAsText(file)).trim());
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
