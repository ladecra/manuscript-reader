// ─── Upload-format guard check (assertions) ──────────────────────────────────
// Verifies the pure detector in engine/ingestion/fileFormat.ts refuses binary
// containers (legacy .doc, PDF, RTF, .odt/.pages, corrupt/lock .docx) instead of
// letting them slip into the text reader and become one junk chapter. Synthetic
// magic-byte buffers — no real manuscript needed. Run: npm run check-format
import {
  sniffSignature,
  assertIngestibleFormat,
  looksBinary,
  UnsupportedFileError,
} from '../src/engine/ingestion/fileFormat.ts';

let failures = 0;
const fail = (msg) => { console.log('   ❌', msg); failures++; };
const ok = (msg) => console.log('   ✅', msg);

const bytes = (...b) => new Uint8Array(b);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const RTF = bytes(0x7b, 0x5c, 0x72, 0x74, 0x66, 0x31);
const TXT = bytes(0x23, 0x20, 0x54, 0x69, 0x74, 0x6c, 0x65); // "# Title"

// ── signature sniffing ──
console.log('sniffSignature:');
for (const [name, buf, want] of [
  ['legacy .doc (OLE2)', OLE, 'ole'],
  ['zip / .docx',        ZIP, 'zip'],
  ['pdf',                PDF, 'pdf'],
  ['rtf',                RTF, 'rtf'],
  ['plain text',         TXT, 'other'],
]) {
  const got = sniffSignature(buf);
  got === want ? ok(`${name} → ${got}`) : fail(`${name}: got ${got}, want ${want}`);
}

// ── rejection / acceptance ──
console.log('assertIngestibleFormat:');
const rejects = (label, fileName, head) => {
  try {
    assertIngestibleFormat(fileName, head);
    fail(`${label}: expected rejection, none thrown`);
  } catch (e) {
    if (e instanceof UnsupportedFileError) ok(`${label} rejected — "${e.message.slice(0, 56)}…"`);
    else fail(`${label}: threw ${e?.name ?? e}, not UnsupportedFileError`);
  }
};
const accepts = (label, fileName, head) => {
  try { assertIngestibleFormat(fileName, head); ok(`${label} accepted`); }
  catch (e) { fail(`${label}: unexpectedly rejected — ${e?.message ?? e}`); }
};

rejects('legacy .doc',              'manuscript.doc',  OLE);
rejects('.doc renamed to .docx',    'manuscript.docx', OLE); // extension lies — bytes win
rejects('pdf',                      'manuscript.pdf',  PDF);
rejects('rtf',                      'manuscript.rtf',  RTF);
rejects('.odt/.pages (zip, non-docx)', 'manuscript.odt',  ZIP);
rejects('corrupt/lock .docx (not a zip)', '~$manuscript.docx', TXT);
accepts('real .docx',               'manuscript.docx', ZIP);
accepts('plain .md',                'manuscript.md',   TXT);
accepts('plain .txt',               'notes.txt',       TXT);

// ── binary heuristic (text branch fallback) ──
console.log('looksBinary:');
const mojibake = '�'.repeat(500) + 'a few real words';
looksBinary(mojibake) ? ok('mojibake (undecodable bytes) flagged') : fail('mojibake not flagged');
looksBinary('# A normal markdown manuscript\n\nWith prose.') ? fail('clean text wrongly flagged') : ok('clean text passes');

console.log('');
if (failures > 0) { console.error(`${failures} assertion(s) FAILED`); process.exit(1); }
console.log('All format-guard assertions passed.');
