// Generates public/icon-192.png and public/icon-512.png (same design as icon.svg)
// with no dependencies: a tiny rasterizer + PNG encoder on top of zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const NAVY = [0x0b, 0x2a, 0x4a];
const WHITE = [0xff, 0xff, 0xff];
const GOLD = [0xf2, 0xb7, 0x05];

// Shapes in the 512x512 design space.
const shapes = [
  { color: WHITE, poly: [[256, 70], [256, 380], [120, 380]] },
  { color: GOLD, poly: [[276, 110], [276, 380], [392, 380]] },
  { color: WHITE, poly: [[96, 404], [416, 404], [380, 448], [132, 448]] },
];

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function render(size) {
  const s = 512 / size;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 2x2 supersampling for smoother edges
      const acc = [0, 0, 0];
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const px = (x + ox) * s;
        const py = (y + oy) * s;
        let col = NAVY;
        for (const sh of shapes) if (inside(sh.poly, px, py)) col = sh.color;
        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = acc[0] / 4; raw[o + 1] = acc[1] / 4; raw[o + 2] = acc[2] / 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), render(size));
  console.log(`public/icon-${size}.png`);
}
