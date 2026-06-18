// ─── Minimal STORE-only ZIP writer ────────────────────────────────────────────
// Dependency-free, pure, works identically in the browser and Node. Every entry
// is stored uncompressed (method 0) — the ZIP spec permits it, and a manuscript
// is text, so the size cost is negligible. This is all an EPUB needs: the spec
// *requires* the `mimetype` entry to be stored, and stored-everything sidesteps
// pulling in a DEFLATE implementation. Callers pass entries in the desired order
// (for EPUB, `mimetype` first).

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

/** Build a ZIP archive (all entries stored/uncompressed) as a single byte array. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    // Local file header (30 bytes + name) + data.
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // local file header signature
    lh.setUint16(4, 20, true);         // version needed to extract
    lh.setUint16(6, 0, true);          // general purpose bit flag
    lh.setUint16(8, 0, true);          // compression method = store
    lh.setUint16(10, 0, true);         // mod time
    lh.setUint16(12, 0, true);         // mod date
    lh.setUint32(14, crc, true);       // crc-32
    lh.setUint32(18, size, true);      // compressed size
    lh.setUint32(22, size, true);      // uncompressed size
    lh.setUint16(26, nameBytes.length, true); // file name length
    lh.setUint16(28, 0, true);         // extra field length
    locals.push(new Uint8Array(lh.buffer), nameBytes, e.data);

    // Central directory header (46 bytes + name).
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); // central dir signature
    ch.setUint16(4, 20, true);         // version made by
    ch.setUint16(6, 20, true);         // version needed
    ch.setUint16(8, 0, true);          // flags
    ch.setUint16(10, 0, true);         // method = store
    ch.setUint16(12, 0, true);         // mod time
    ch.setUint16(14, 0, true);         // mod date
    ch.setUint32(16, crc, true);       // crc-32
    ch.setUint32(20, size, true);      // compressed size
    ch.setUint32(24, size, true);      // uncompressed size
    ch.setUint16(28, nameBytes.length, true); // name length
    ch.setUint16(30, 0, true);         // extra length
    ch.setUint16(32, 0, true);         // comment length
    ch.setUint16(34, 0, true);         // disk number start
    ch.setUint16(36, 0, true);         // internal attrs
    ch.setUint32(38, 0, true);         // external attrs
    ch.setUint32(42, offset, true);    // local header offset
    centrals.push(new Uint8Array(ch.buffer), nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const centralStart = offset;
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);

  // End of central directory record (22 bytes).
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);  // entries on this disk
  eocd.setUint16(10, entries.length, true); // total entries
  eocd.setUint32(12, centralSize, true);    // central dir size
  eocd.setUint32(16, centralStart, true);   // central dir offset

  const parts = [...locals, ...centrals, new Uint8Array(eocd.buffer)];
  const total = parts.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const b of parts) { out.set(b, pos); pos += b.length; }
  return out;
}

/** UTF-8 encode a string to bytes (for text entries). */
export function utf8(s: string): Uint8Array {
  return enc.encode(s);
}
