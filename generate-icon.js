const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePNG(size, bg, fg) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const raw = Buffer.alloc(size * (size * 3 + 1));
  const cx = size / 2, cy = size / 2, r = size * 0.38;

  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const off = y * (size * 3 + 1) + 1 + x * 3;
      const inCircle = Math.hypot(x - cx, y - cy) <= r;
      const col = inCircle ? fg : bg;
      raw[off] = col[0]; raw[off + 1] = col[1]; raw[off + 2] = col[2];
    }
  }

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const bg = [245, 245, 247]; // light gray
const fg = [28, 28, 30];    // near black

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), makePNG(192, bg, fg));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), makePNG(512, bg, fg));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), makePNG(180, bg, fg));
console.log('Icons generated.');
