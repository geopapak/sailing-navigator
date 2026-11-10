// Gives an account a temporary password straight in the database — for when the
// admin is the one who forgot it (nobody else can reset it from the app).
// Needs `npx wrangler login` (for --remote). The temporary password is printed
// only in your terminal; at the next sign-in the app asks for a new one.
//
//   npm run reset-password -- name@example.gr            (production database)
//   npm run reset-password -- name@example.gr --local    (local database)
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Same hash as server/accounts.ts: PBKDF2-SHA256, 100 000 iterations, 32 bytes, hex. */
export function hashPassword(password, saltHex) {
  return pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 100_000, 32, 'sha256').toString('hex');
}

function main() {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  const email = (args.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase();
  if (!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)) {
    console.error('Χρήση: npm run reset-password -- <email> [--local]');
    process.exit(1);
  }
  const temp = randomBytes(6).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(temp, salt);
  const sql =
    `UPDATE users SET pass_hash='${hash}', pass_salt='${salt}', must_change_password=1, failed_logins=0, locked_until=0, reset_requested_at=NULL WHERE email='${email}';` +
    ` DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email='${email}');` +
    ` SELECT COUNT(*) AS found FROM users WHERE email='${email}';`;
  // Run the project's wrangler with node directly (no shell: the SQL stays one argument on every OS).
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const r = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'sailing-navigator', local ? '--local' : '--remote', '--json', '--command', sql], {
    encoding: 'utf8',
  });
  const out = `${r.stdout ?? ''}`;
  if (r.status !== 0) {
    console.error(out, r.stderr);
    console.error(local ? 'Αποτυχία στην τοπική βάση.' : 'Αποτυχία. Έκανες `npx wrangler login`;');
    process.exit(1);
  }
  let found = 0;
  try {
    const results = JSON.parse(out.slice(out.indexOf('[')));
    found = results.at(-1).results[0].found;
  } catch {
    /* parse below */
  }
  if (!found) {
    console.error(`Δεν βρέθηκε λογαριασμός με email ${email} (${local ? 'τοπική' : 'παραγωγή'}). Τίποτα δεν άλλαξε.`);
    process.exit(1);
  }
  console.log(`\nΠροσωρινός κωδικός για ${email} (${local ? 'τοπική βάση' : 'παραγωγή'}):\n\n    ${temp}\n`);
  console.log('Συνδέσου με αυτόν· η εφαρμογή θα σου ζητήσει αμέσως νέο κωδικό. Όλες οι συνδεδεμένες συσκευές αποσυνδέθηκαν.');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main();
