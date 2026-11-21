import { describe, expect, it } from 'vitest';
import { TRE_IRENE } from '../boat/treIrene';
import { STANDARD_SCORING_OPTIONS } from '../boat/scoringOptions';
import { corrected } from './corrected';
import { defaultScoring, hasChoice, missingScoring, scoringChoices, scoringOptionFor } from './options';

describe('scoringOptionFor (P-056 §Α)', () => {
  it('certificate options first, then GPH, then no correction for everyone', () => {
    expect(scoringOptionFor({ boat: TRE_IRENE }, { scoringOptionId: 'coastal' })).toBe(TRE_IRENE.scoring.find((o) => o.id === 'coastal'));
    expect(scoringOptionFor({ boat: { gph: 600 } }, { scoringOptionId: 'gph' })).toEqual({ tod: 600, tot: 1 });
    const g = scoringOptionFor({ boat: { gph: 612 } }, { scoringOptionId: 'gph' })!;
    expect(g.tod).toBe(612);
    expect(g.tot).toBeCloseTo(600 / 612, 10);
    expect(scoringOptionFor({ boat: { scoring: [] } }, { scoringOptionId: 'gph' })).toBeUndefined();
    expect(scoringOptionFor({}, { scoringOptionId: 'none' })).toEqual({ tod: 0, tot: 1 });
    expect(scoringOptionFor({ boat: { gph: 612 } }, { scoringOptionId: 'coastal' })).toBeUndefined();
  });

  it('GPH: ToD = elapsed − GPH × NM, ToT = elapsed × 600 / GPH', () => {
    const o = scoringOptionFor({ boat: { gph: 612 } }, { scoringOptionId: 'gph' })!;
    expect(corrected('ToD', 10_000, o, 10)).toBe(10_000 - 6120);
    expect(corrected('ToT', 10_000, o, 10)).toBeCloseTo((10_000 * 600) / 612, 6);
  });

  it('none: corrected = elapsed (KA-A6)', () => {
    const o = scoringOptionFor({}, { scoringOptionId: 'none' })!;
    expect(corrected('ToT', 3600, o, 12)).toBe(3600);
    expect(corrected('ToD', 3600, o, 12)).toBe(3600);
  });

  it('says «χωρίς GPH» for the GPH option', () => {
    expect(missingScoring({ scoringOptionId: 'gph' })).toBe('χωρίς GPH');
    expect(missingScoring({ scoringOptionId: 'coastal' })).toBe('χωρίς βαθμολογία');
  });
});

describe('scoringChoices (KA-A1, A2, A7)', () => {
  it('a manual boat with GPH: GPH — ToD (default), GPH — ToT, no correction', () => {
    const b = { gph: 612, scoring: [] };
    expect(scoringChoices(b).map((c) => c.label)).toEqual(['GPH — ToD', 'GPH — ToT', 'Χωρίς διόρθωση (πραγματικός χρόνος)']);
    expect(defaultScoring(b, { id: 'coastal', method: 'ToT' })).toEqual({ scoringOptionId: 'gph', method: 'ToD' });
  });

  it('a boat with neither: only no correction', () => {
    expect(scoringChoices({ scoring: [] }).map((c) => c.value)).toEqual(['none|ToT']);
    expect(defaultScoring(undefined)).toEqual({ scoringOptionId: 'none', method: 'ToT' });
  });

  it('a PDF boat keeps the 0.19.0 options, plus no correction last', () => {
    const c = scoringChoices(TRE_IRENE);
    const old = TRE_IRENE.scoring.flatMap((o) =>
      (['ToT', 'ToD'] as const).map((m) => `${STANDARD_SCORING_OPTIONS.find((x) => x.id === o.id)?.label ?? o.id} — ${m}`),
    );
    expect(c.map((x) => x.label)).toEqual([...old, 'Χωρίς διόρθωση (πραγματικός χρόνος)']);
    // A stored race with «coastal» opens as before.
    expect(defaultScoring(TRE_IRENE, { id: 'coastal', method: 'ToT' })).toEqual({ scoringOptionId: 'coastal', method: 'ToT' });
    expect(hasChoice(TRE_IRENE, 'coastal', 'ToD')).toBe(true);
    expect(hasChoice(TRE_IRENE, 'gph', 'ToD')).toBe(false);
    expect(hasChoice(TRE_IRENE, 'none', 'ToD')).toBe(true);
  });
});
