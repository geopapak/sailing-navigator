/** Builds index.md of the tour from the caption files (`<name>.caption.txt`: caption, flow). */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tourOut } from './out';

export default async function indexTeardown() {
  const dir = tourOut();
  if (!existsSync(dir)) return;
  const files = readdirSync(dir);
  const pngs = files.filter((f) => f.endsWith('.png')).sort();
  const rows: string[] = [];
  const small: string[] = [];
  let flow = '';
  for (const png of pngs) {
    const base = png.slice(0, -4);
    const cap = join(dir, `${base}.caption.txt`);
    const [caption = '', flowName = ''] = existsSync(cap) ? readFileSync(cap, 'utf8').split('\n') : [];
    if (flowName !== flow) {
      flow = flowName;
      rows.push('', `## ${flow}`, '', '| # | Αρχείο | Λεζάντα | Ροή |', '|---|---|---|---|');
    }
    const size = statSync(join(dir, png)).size;
    if (size < 8000) small.push(png);
    rows.push(`| ${base.slice(0, 5)} | [${png}](${png}) | ${caption.replace(/\|/g, '\\|')} | ${flowName} |`);
  }
  const missing = files.filter((f) => f.endsWith('.missing.txt')).sort();
  const notes = missing.flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n').map((l) => `- ${l}`));
  const md = [
    '# Sailing Navigator: οπτική περιήγηση',
    '',
    `${pngs.length} στιγμιότυπα. Δίπλα σε κάθε PNG: \`.caption.txt\` (λεζάντα, ροή) και \`.text.txt\` (ορατό κείμενο της σελίδας, innerText).`,
    'Προεπιλογή: 375×812, Μέρα, «Κανονικά». Οι παραλλαγές (320 «Πολύ μεγάλα», Νύχτα, tablet 768) είναι στη ροή 17.',
    ...rows,
    '',
    '## Ό,τι δεν καταγράφηκε',
    '',
    ...(notes.length ? notes : ['- Τίποτα.']),
    ...(small.length ? ['', '## Ύποπτα μικρά αρχεία (< 8 KB, ίσως κενή εικόνα)', '', ...small.map((s) => `- ${s}`)] : []),
    '',
  ].join('\n');
  writeFileSync(join(dir, 'index.md'), md, 'utf8');
}
