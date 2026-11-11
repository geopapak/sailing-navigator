// Makes an existing account an admin (with AI), straight in the database.
// ADMIN_EMAIL only sets up the first admin; use this for a second one.
// Needs `npx wrangler login` (for --remote).
//
//   npm run make-admin -- name@example.gr            (production database)
//   npm run make-admin -- name@example.gr --local    (local database)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const local = args.includes('--local');
const email = (args.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase();
if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)) {
  console.error('Χρήση: npm run make-admin -- <email> [--local]');
  process.exit(1);
}
const sql =
  `UPDATE users SET is_admin=1, ai_allowed=1, ai_limit=MAX(ai_limit, 1000) WHERE email='${email}';` +
  ` SELECT COUNT(*) AS found FROM users WHERE email='${email}' AND is_admin=1;`;
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const r = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'sailing-navigator', local ? '--local' : '--remote', '--json', '--command', sql], { encoding: 'utf8' });
const out = `${r.stdout ?? ''}`;
if (r.status !== 0) {
  console.error(out, r.stderr);
  console.error(local ? 'Αποτυχία στην τοπική βάση.' : 'Αποτυχία. Έκανες `npx wrangler login`;');
  process.exit(1);
}
let found = 0;
try {
  found = JSON.parse(out.slice(out.indexOf('['))).at(-1).results[0].found;
} catch {
  /* reported below */
}
if (!found) {
  console.error(`Δεν βρέθηκε λογαριασμός με email ${email} (${local ? 'τοπική' : 'παραγωγή'}). Κάνε πρώτα εγγραφή στην εφαρμογή.`);
  process.exit(1);
}
console.log(`Ο ${email} είναι πλέον διαχειριστής (${local ? 'τοπική βάση' : 'παραγωγή'}). Αποσυνδέσου και συνδέσου ξανά στην εφαρμογή.`);
