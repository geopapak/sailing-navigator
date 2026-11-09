// Writes CHANGELOG.md from src/releases.json (the single source of release notes).
// Run: npm run changelog
import { readFileSync, writeFileSync } from 'node:fs';

const releases = JSON.parse(readFileSync(new URL('../src/releases.json', import.meta.url), 'utf8'));
const lines = ['# Σημειώσεις εκδόσεων', '', 'Δημιουργείται από το `src/releases.json` με `npm run changelog`. Νεότερη πρώτη.', ''];
for (const r of releases) {
  lines.push(`## ${r.version} — ${r.title} (${r.date})`, '');
  if (r.app.length) {
    lines.push('**Εφαρμογή**', '', ...r.app.map((x) => `- ${x}`), '');
  }
  if (r.server.length) {
    lines.push('**Server**', '', ...r.server.map((x) => `- ${x}`), '');
  }
}
writeFileSync(new URL('../CHANGELOG.md', import.meta.url), lines.join('\n'));
console.log(`CHANGELOG.md: ${releases.length} εκδόσεις`);
