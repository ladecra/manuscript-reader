// ─── Ingestion Engine: DOCX layout-signal extraction ─────────────────────────
// mammoth converts a .docx to Markdown for prose fidelity, but it deliberately
// discards presentation: alignment, font hierarchy, page breaks, paragraph
// styles. Those are exactly the cues a human uses to mark structure in a
// manuscript that lacks Word heading styles ("PART ONE" centered on its own
// page; a title page as the largest centered text on page one). Re-inferring
// that intent from flattened Markdown is information-theoretically impossible —
// the entropy was destroyed upstream.
//
// This module reads the ORIGINAL OOXML (word/document.xml inside the .docx zip)
// and returns one record per paragraph carrying the layout + style signals the
// segmenter needs. It is deliberately NOT a general OOXML parser (mammoth already
// is one): paragraphs (`<w:p>`) never nest, so a targeted scan over the paragraph
// blocks is robust and keeps the engine dependency-neutral and isomorphic
// (browser + Node), pulling only the handful of properties that carry structural
// signal. It makes no decisions — it surfaces evidence for the classifier.

/** Layout + style signals for a single DOCX paragraph, in document order. */
export interface DocxParagraph {
  /** 0-based position among all paragraphs in the body, in document order. */
  index: number;
  /** Concatenated run text, whitespace-collapsed. Empty for spacer paragraphs. */
  text: string;
  /** The paragraph style name (`w:pStyle`), if any (e.g. "Heading 1", "Title"). */
  styleName?: string;
  /** Paragraph justification (`w:jc`): 'left' | 'center' | 'right' | 'both'. */
  alignment?: 'left' | 'center' | 'right' | 'both';
  /** True if the paragraph forces a page break before it, OR follows an explicit
   *  page/section break. Word stores explicit breaks, not reflowed pagination, so
   *  this means "starts a new page by author intent" — not a rendered page number. */
  pageBreakBefore: boolean;
  /** Dominant run font size in half-points (`w:sz`), if declared. 24 = 12pt. */
  fontSizeHalfPts?: number;
  /** True if every text run is all-caps (real caps or `w:caps`), given any text. */
  allCaps: boolean;
  /** True if every text run is bold (`w:b`), given any text. */
  bold: boolean;
  /** True if every text run is italic (`w:i`), given any text. */
  italic: boolean;
  /** True if the paragraph has no visible text (spacer / blank line). */
  empty: boolean;
}

/** Per-document context the segmenter needs to read a paragraph's signals in
 *  relative terms (a font is only "large" against the body's own baseline). */
export interface DocxSignals {
  paragraphs: DocxParagraph[];
  /** The modal body font size in half-points, if determinable — the baseline a
   *  heading stands out against. Undefined when no sizes are declared. */
  bodyFontSizeHalfPts?: number;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

// Decode the five predefined XML entities plus numeric character references.
// Word emits real Unicode for most glyphs; entities appear mainly for the five
// reserved characters and the occasional numeric escape.
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Read the `w:val` attribute of the first matching `<tag .../>` or `<tag ...>`
 *  in a fragment. OOXML toggle properties default to "on" when present with no
 *  val, so a bare `<w:b/>` reads as true. Returns null when the tag is absent. */
function readVal(fragment: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(\\s[^>]*)?/?>`);
  const m = re.exec(fragment);
  if (!m) return null;
  const attrs = m[1] ?? '';
  const val = /\bw:val="([^"]*)"/.exec(attrs);
  return val ? val[1] : '';
}

/** An OOXML toggle (b, i, caps): present with no val, or val="1"/"true"/"on" is
 *  ON; val="0"/"false"/"off" is OFF; absent is null (inherit / unknown). */
function readToggle(fragment: string, tag: string): boolean | null {
  const val = readVal(fragment, tag);
  if (val === null) return null;
  return !(val === '0' || val === 'false' || val === 'off');
}

// ─── Paragraph parsing ───────────────────────────────────────────────────────

interface RunFlags { text: string; bold: boolean | null; italic: boolean | null; caps: boolean | null; size: number | null; }

/** Pull the runs (`<w:r>`) out of a paragraph body, each with its text + rPr. */
function parseRuns(paraBody: string): RunFlags[] {
  const runs: RunFlags[] = [];
  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(paraBody)) !== null) {
    const body = m[1];
    // Run properties live in the leading <w:rPr>…</w:rPr>; isolate it so bold on
    // the text isn't confused with bold anywhere else in the run.
    const rPr = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1] ?? '';
    // Text is the concatenation of <w:t> runs (xml:space="preserve" keeps spaces).
    let text = '';
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(body)) !== null) text += decodeXml(t[1]);
    if (!text) continue;
    const sizeStr = readVal(rPr, 'w:sz');
    runs.push({
      text,
      bold: readToggle(rPr, 'w:b'),
      italic: readToggle(rPr, 'w:i'),
      caps: readToggle(rPr, 'w:caps'),
      size: sizeStr ? parseInt(sizeStr, 10) || null : null,
    });
  }
  return runs;
}

/** True when a text string is all-caps (has letters, none lowercase). */
function isAllCapsText(s: string): boolean {
  return /[A-Za-zÀ-ÿ]/.test(s) && s === s.toUpperCase();
}

/** Parse word/document.xml into per-paragraph signal records. Pure: string in,
 *  records out — testable against a raw XML fixture with no zip/IO. */
export function parseDocxParagraphs(documentXml: string): DocxParagraph[] {
  // Restrict to the body; drop headers/footers (they live in separate parts, but
  // guard anyway) and the trailing section properties.
  const bodyMatch = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(documentXml);
  const body = bodyMatch ? bodyMatch[1] : documentXml;

  const paras: DocxParagraph[] = [];
  // Paragraphs never nest, so a non-greedy <w:p>…</w:p> scan is safe. Match both
  // the self-closing empty paragraph (<w:p/>) and the normal form.
  const pRe = /<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  let carryBreak = false; // an explicit page/section break seen since the last paragraph
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = pRe.exec(body)) !== null) {
    const paraBody = m[1] ?? '';
    const pPr = /<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/.exec(paraBody)?.[1] ?? '';

    const runs = parseRuns(paraBody);
    const text = runs.map(r => r.text).join('').replace(/\s+/g, ' ').trim();
    const empty = text.length === 0;

    const styleName = readVal(pPr, 'w:pStyle') || undefined;
    const jc = readVal(pPr, 'w:jc');
    const alignment =
      jc === 'center' ? 'center' :
      jc === 'right' || jc === 'end' ? 'right' :
      jc === 'both' || jc === 'distribute' ? 'both' :
      jc === 'left' || jc === 'start' ? 'left' : undefined;

    // A page break can be declared on the paragraph (pageBreakBefore), rendered
    // inline as a run break (<w:br w:type="page"/>), or implied by a section
    // break carried from the previous paragraph's sectPr.
    const ownBreak =
      readToggle(pPr, 'w:pageBreakBefore') === true ||
      /<w:br\b[^>]*w:type="page"/.test(paraBody);
    const pageBreakBefore = ownBreak || carryBreak;
    carryBreak = /<w:sectPr\b/.test(pPr) || /<w:br\b[^>]*w:type="page"/.test(paraBody);

    const withText = runs.filter(r => r.text.trim());
    const allCaps = withText.length > 0 &&
      withText.every(r => r.caps === true || isAllCapsText(r.text));
    const bold = withText.length > 0 && withText.every(r => r.bold === true);
    const italic = withText.length > 0 && withText.every(r => r.italic === true);
    // Dominant run size: the size covering the most characters.
    const sizeByChars = new Map<number, number>();
    for (const r of withText) if (r.size) sizeByChars.set(r.size, (sizeByChars.get(r.size) ?? 0) + r.text.length);
    let fontSizeHalfPts: number | undefined;
    let best = 0;
    for (const [sz, n] of sizeByChars) if (n > best) { best = n; fontSizeHalfPts = sz; }

    paras.push({ index: index++, text, styleName, alignment, pageBreakBefore, fontSizeHalfPts, allCaps, bold, italic, empty });
  }
  return paras;
}

/** The modal body font size: the size covering the most total characters across
 *  non-empty paragraphs — the baseline a heading's larger size stands out from. */
function computeBodyFontSize(paras: DocxParagraph[]): number | undefined {
  const charsBySize = new Map<number, number>();
  for (const p of paras) {
    if (p.empty || p.fontSizeHalfPts == null) continue;
    charsBySize.set(p.fontSizeHalfPts, (charsBySize.get(p.fontSizeHalfPts) ?? 0) + p.text.length);
  }
  let best = 0;
  let mode: number | undefined;
  for (const [sz, n] of charsBySize) if (n > best) { best = n; mode = sz; }
  return mode;
}

/** Unzip a .docx and extract its paragraph signals. Isomorphic (browser + Node)
 *  via jszip. `data` is the raw file bytes. Returns empty on a non-docx / no
 *  document.xml so callers can fall back to text-only ingestion. */
export async function extractDocxSignals(data: ArrayBuffer | Uint8Array): Promise<DocxSignals> {
  const JSZipMod = await import('jszip');
  const JSZip = (JSZipMod as unknown as { default: typeof import('jszip') }).default ?? (JSZipMod as unknown as typeof import('jszip'));
  let zip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return { paragraphs: [] };
  }
  const docFile = zip.file('word/document.xml');
  if (!docFile) return { paragraphs: [] };
  const xml = await docFile.async('string');
  const paragraphs = parseDocxParagraphs(xml);
  return { paragraphs, bodyFontSizeHalfPts: computeBodyFontSize(paragraphs) };
}
