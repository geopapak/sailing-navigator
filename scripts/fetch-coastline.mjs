// Downloads OpenStreetMap coastline (natural=coastline) for the Saronic Gulf
// from Overpass, simplifies it and writes src/routing/data/coastline.json.
// Data © OpenStreetMap contributors, ODbL.
//
// Usage: node scripts/fetch-coastline.mjs [south west north east] [toleranceMeters]
import { writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2).map(Number);
const [S, W, N, E] = args.length >= 4 ? args.slice(0, 4) : [37.25, 22.9, 38.1, 24.15];
const TOL_M = args[4] ?? 25;

const query = `[out:json][timeout:180];way["natural"="coastline"](${S},${W},${N},${E});out geom;`;
console.log('Querying Overpass…', { S, W, N, E });
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: {
    'User-Agent': 'sailing-navigator-coastline-script/0.1',
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ data: query }),
});
if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
const json = await res.json();
const ways = json.elements.filter((e) => e.type === 'way' && Array.isArray(e.geometry));
console.log(`${ways.length} ways`);

// Stitch ways sharing endpoints into longer polylines.
const key = (p) => `${p.lon.toFixed(7)},${p.lat.toFixed(7)}`;
let lines = ways.map((w) => w.geometry.map((g) => ({ lat: g.lat, lon: g.lon })));
let merged = true;
while (merged) {
  merged = false;
  const byStart = new Map();
  lines.forEach((l, i) => byStart.set(key(l[0]), i));
  const used = new Set();
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    let cur = lines[i];
    used.add(i);
    let j;
    while ((j = byStart.get(key(cur[cur.length - 1]))) !== undefined && !used.has(j) && j !== i) {
      cur = cur.concat(lines[j].slice(1));
      used.add(j);
      merged = true;
    }
    out.push(cur);
  }
  lines = out;
}

// Douglas–Peucker in a local metric projection.
const lat0 = ((S + N) / 2) * (Math.PI / 180);
const MX = 111320 * Math.cos(lat0);
const MY = 110540;
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const xy = pts.map((p) => [p.lon * MX, p.lat * MY]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

let nIn = 0;
let nOut = 0;
const result = [];
for (const l of lines) {
  nIn += l.length;
  const s = simplify(l, TOL_M);
  if (s.length < 2) continue;
  nOut += s.length;
  result.push(s.map((p) => [Number(p.lon.toFixed(5)), Number(p.lat.toFixed(5))]));
}
console.log(`${lines.length} polylines, ${nIn} → ${nOut} points`);

mkdirSync(new URL('../src/routing/data/', import.meta.url), { recursive: true });
const data = {
  attribution: '© OpenStreetMap contributors (ODbL)',
  bbox: [W, S, E, N],
  toleranceMeters: TOL_M,
  generated: new Date().toISOString().slice(0, 10),
  lines: result,
};
writeFileSync(new URL('../src/routing/data/coastline.json', import.meta.url), JSON.stringify(data));
console.log('wrote src/routing/data/coastline.json');
