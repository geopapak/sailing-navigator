/**
 * P-064: every number and date on screen goes through `src/format`. The project has no
 * ESLint, so this test plays the `no-restricted-syntax` rule: no `toFixed` / `toLocale*`
 * in `src/ui/**` and `src/race/**` (QA: the race texts reach the screen too), except for machine text
 * (SVG paths, keys, URLs, the GPX / CSV / AI JSON numbers of P-064 KA-K7) and lines marked `fmt-ok`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const ROOTS = ['ui', 'race'].map((d) => join(SRC, d));
/** Machine text: SVG path data, store/compare keys with coordinates, request URLs. */
const MACHINE = [
  /[MLA]\$\{/, // SVG path commands
  /\.toFixed\(1\)\},\$\{/, // SVG «x,y»
  /'L' : 'M'/,
  /\.toFixed\(1\)\)\.join\(','\)/,
  /\* sc\)\.toFixed\(1\)/, // SVG scale
  /(lat|lon)\??\.toFixed\([3-6]\)/, // keys and URLs with coordinates
  /\|\$\{/, // change keys
  /\bfmt-ok\b/,
  /\+[\w.]+\.toFixed\(\d\)/, // «+x.toFixed(1)»: a rounded number for the AI JSON, not text
  /String\(\+v\.toFixed\(5\)\)/, // CSV cells
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('screen formats go through src/format (P-064)', () => {
  it('no toFixed / toLocale*String for the screen in src/ui and src/race', () => {
    const bad: string[] = [];
    for (const f of ROOTS.flatMap(files)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (!/\.toFixed\(|\.toLocale\w*String\(/.test(line)) return;
          if (MACHINE.some((re) => re.test(line))) return;
          bad.push(`${f.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
