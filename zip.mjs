// Minimal deterministic ZIP writer. No dependencies.
//
// An .xpi is a plain ZIP with manifest.json at the root, so the only thing that
// matters beyond correctness is that two builds of the same input produce the
// same bytes. zip(1) stamps every entry with the file's mtime, which would leave
// the tree dirty after every rebuild, so entries are written at the ZIP epoch
// (1980-01-01) instead. Entries are stored rather than deflated: these files are
// a few kilobytes, and deflate output is only stable for a given zlib build,
// which would make determinism depend on the Node version in use.

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const DOS_DATE = 0x0021; // 1980-01-01, the earliest a ZIP can express
const DOS_TIME = 0x0000;

/**
 * @param {Array<{name: string, data: Buffer|Uint8Array}>} entries
 * @returns {Buffer} the archive
 */
export function zip(entries) {
  const local = [], central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const body = Buffer.from(data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(body);
    // bit 11 marks the name as UTF-8; harmless for ASCII, correct if it is not
    const flags = 0x0800;

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);            // version needed
    lfh.writeUInt16LE(flags, 6);
    lfh.writeUInt16LE(0, 8);             // method 0: stored
    lfh.writeUInt16LE(DOS_TIME, 10);
    lfh.writeUInt16LE(DOS_DATE, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(body.length, 18);  // compressed size
    lfh.writeUInt32LE(body.length, 22);  // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);            // extra field length
    local.push(lfh, nameBuf, body);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);            // version made by
    cdh.writeUInt16LE(20, 6);            // version needed
    cdh.writeUInt16LE(flags, 8);
    cdh.writeUInt16LE(0, 10);            // method 0: stored
    cdh.writeUInt16LE(DOS_TIME, 12);
    cdh.writeUInt16LE(DOS_DATE, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(body.length, 20);
    cdh.writeUInt32LE(body.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);            // extra
    cdh.writeUInt16LE(0, 32);            // comment
    cdh.writeUInt16LE(0, 34);            // disk number start
    cdh.writeUInt16LE(0, 36);            // internal attributes
    cdh.writeUInt32LE(0, 38);            // external attributes
    cdh.writeUInt32LE(offset, 42);       // offset of local header
    central.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + body.length;
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // this disk
  eocd.writeUInt16LE(0, 6);              // disk with central directory
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);        // central directory offset
  eocd.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([...local, cd, eocd]);
}
