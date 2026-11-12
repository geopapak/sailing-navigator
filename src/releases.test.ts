import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { cmpVersion, releases, releasesSince } from './ui/WhatsNew';
import pkg from '../package.json';

describe('release notes', () => {
  it('has notes for the version being deployed', () => {
    expect(releases[0].version).toBe(pkg.version);
    expect(releases[0].app.length + releases[0].server.length).toBeGreaterThan(0);
  });

  it('lists releases newest first with unique versions and dates', () => {
    for (let i = 1; i < releases.length; i++) expect(cmpVersion(releases[i - 1].version, releases[i].version)).toBe(1);
    for (const r of releases) expect(r.date).toMatch(/^\d{4}-\d\d-\d\d$/);
  });

  it('marks critical versions only with a boolean (P-044b)', () => {
    for (const r of releases) expect(r.critical === undefined || typeof r.critical === 'boolean').toBe(true);
  });

  it('keeps CHANGELOG.md in sync with releases.json', () => {
    // Line endings may be CRLF in a Windows checkout; compare the text only.
    const lf = (t: string) => t.split('\r\n').join('\n');
    const before = lf(readFileSync('CHANGELOG.md', 'utf8'));
    execFileSync(process.execPath, ['scripts/changelog.mjs']);
    expect(lf(readFileSync('CHANGELOG.md', 'utf8'))).toBe(before);
  });

  it('picks what is new since the last seen version', () => {
    expect(cmpVersion('0.10.0', '0.9.9')).toBe(1);
    expect(releasesSince('0.5.0', '0.5.2').map((r) => r.version)).toEqual(['0.5.2', '0.5.1']);
  });
});
