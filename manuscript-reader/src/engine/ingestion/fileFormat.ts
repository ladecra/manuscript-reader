// ─── Upload format detection (pure, browser-independent) ─────────────────────
// The ingestion pipeline understands three things: Word `.docx` (OOXML zip, via
// mammoth), and plain `.md`/`.txt`. Everything else is a binary container that,
// if read as UTF-8 text, degrades silently into mojibake and gets wrapped as one
// junk "chapter." We refuse those explicitly instead — sniffing the magic bytes
// (not the extension, which lies both ways: a `.doc` renamed to `.docx`, a real
// `.docx` with the wrong suffix, a Word `~$` lock file).
//
// This module makes no decision that needs a browser; it takes the leading bytes
// of a file and returns a verdict. `fileReader` supplies the bytes.

/** Thrown when a file can't be ingested. `.message` is safe to show the user. */
export class UnsupportedFileError extends Error {
  readonly fileName: string;
  constructor(fileName: string, message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
    this.fileName = fileName;
  }
}

export type FileSignature = 'ole' | 'zip' | 'pdf' | 'rtf' | 'other';

function startsWith(head: Uint8Array, sig: number[]): boolean {
  if (head.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (head[i] !== sig[i]) return false;
  return true;
}

/** Identify a file container from its leading bytes. */
export function sniffSignature(head: Uint8Array): FileSignature {
  // Legacy MS Office (.doc/.xls/.ppt) — OLE2 / Compound File Binary.
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  // ZIP local-file header — .docx/.odt/.pages/.epub are all zips.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWith(head, [0x50, 0x4b, 0x05, 0x06]) ||
      startsWith(head, [0x50, 0x4b, 0x07, 0x08])) return 'zip';
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46])) return 'pdf';           // %PDF
  if (startsWith(head, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return 'rtf';     // {\rtf
  return 'other';
}

const SAVE_AS_DOCX =
  'Open it in Word or Pages and choose File → Save As → Word Document (.docx), then upload the .docx.';

/**
 * Throw `UnsupportedFileError` if the file can't be ingested. Guards the two
 * silent-failure modes: a known binary container read as text, and a `.docx`
 * whose bytes aren't actually a Word document (renamed `.doc`, `~$` lock file,
 * corruption). Returns normally for real `.docx` and for plain text.
 */
export function assertIngestibleFormat(fileName: string, head: Uint8Array): void {
  const sig = sniffSignature(head);
  const isDocxName = /\.docx$/i.test(fileName);

  switch (sig) {
    case 'ole':
      throw new UnsupportedFileError(
        fileName,
        `“${fileName}” looks like a legacy Word “.doc” file, which can't be imported directly. ${SAVE_AS_DOCX}`,
      );
    case 'pdf':
      throw new UnsupportedFileError(
        fileName,
        `“${fileName}” is a PDF. PDFs can't be imported yet — upload a .docx, .md, or .txt instead.`,
      );
    case 'rtf':
      throw new UnsupportedFileError(
        fileName,
        `“${fileName}” is an RTF file, which can't be imported. ${SAVE_AS_DOCX}`,
      );
    case 'zip':
      // A zip that isn't named .docx is another word processor's format
      // (.odt / .pages) — those are zips but not OOXML, mammoth can't read them.
      if (!isDocxName) {
        throw new UnsupportedFileError(
          fileName,
          `“${fileName}” looks like a document from another word processor (e.g. Pages or OpenOffice). ${SAVE_AS_DOCX}`,
        );
      }
      return; // real .docx — hand to mammoth
    case 'other':
      // A .docx whose bytes are NOT a zip is not a real Word document (renamed
      // .doc, corrupt, or a Word ~$ lock file). Catch it before mammoth throws
      // an opaque "is this a zip file?" error.
      if (isDocxName) {
        throw new UnsupportedFileError(
          fileName,
          `“${fileName}” has a .docx name but isn't a valid Word document (it may be corrupt, or a temporary Word lock file). Re-save it from Word as .docx and try again.`,
        );
      }
      return; // plain text (.md/.txt or unknown) — the caller's binary heuristic guards the rest
  }
}

/**
 * Heuristic last line of defense for the text branch: unknown binaries that
 * carry no recognizable signature but clearly aren't text (NUL bytes, dense
 * control characters). Runs on the decoded string, cheap on a prefix.
 */
export function looksBinary(text: string): boolean {
  const sample = text.slice(0, 4096);
  if (!sample) return false;
  let suspect = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    // NUL, or a C0 control that isn't tab/newline/carriage-return, or the
    // Unicode replacement char (undecodable bytes).
    if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 0xfffd) suspect++;
  }
  return suspect / sample.length > 0.1;
}
