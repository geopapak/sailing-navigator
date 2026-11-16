// Writes the E2E result to the GitHub job summary (P-045 criteria 7, 57):
// failed tests, then the flaky ones (passed only on a retry) in their own list «Ασταθή».
// Usage: node e2e/summary.mjs [e2e/.out/results.json]   (reads only the Playwright JSON report)
import { readFileSync, appendFileSync } from 'node:fs';

const file = process.argv[2] ?? 'e2e/.out/results.json';
let report;
try {
  report = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  report = undefined;
}

const lines = ['## E2E (Playwright)', ''];
if (!report) {
  lines.push('Δεν βρέθηκε αναφορά: το build ή η εκκίνηση των tests απέτυχε. Δες το log του βήματος.');
} else {
  const failed = [];
  const flaky = [];
  const fixme = [];
  const walk = (suite, path) => {
    for (const s of suite.suites ?? []) walk(s, [...path, s.title]);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const name = `${[...path, spec.title].filter(Boolean).join(' › ')} [${t.projectName}]`;
        if (t.status === 'unexpected') failed.push(name);
        else if (t.status === 'flaky') flaky.push(name);
        else if (t.status === 'skipped' && (t.annotations ?? []).some((a) => a.type === 'fixme')) fixme.push(name);
      }
    }
  };
  walk(report, []);
  const st = report.stats ?? {};
  const secs = Math.round((st.duration ?? 0) / 1000);
  lines.push(`Πέρασαν: ${st.expected ?? 0} · Απέτυχαν: ${st.unexpected ?? 0} · Ασταθή: ${st.flaky ?? 0} · Παραλείφθηκαν: ${st.skipped ?? 0} · Χρόνος tests: ${Math.floor(secs / 60)}′${secs % 60}″`, '');
  if (failed.length) lines.push('### Απέτυχαν', ...failed.map((n) => `- ${n}`), '');
  if (flaky.length) lines.push('### Ασταθή', '(πέρασαν μόνο σε επανάληψη: ο qa-tester τα κοιτά, κανόνας καραντίνας P-045)', ...flaky.map((n) => `- ${n}`), '');
  if (fixme.length) lines.push('<details><summary>test.fixme (δεν ελέγχονται αυτόματα)</summary>', '', ...fixme.map((n) => `- ${n}`), '', '</details>', '');
  if (!failed.length && !flaky.length) lines.push('Όλα πράσινα.');
}
const out = `${lines.join('\n')}\n`;
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out);
else process.stdout.write(out);
