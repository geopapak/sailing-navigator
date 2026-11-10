import { describe, expect, it } from 'vitest';
import { normalizeSailNo, orcPolar, orcScoring, orcToBoat, type OrcRms } from './orc';
import { TRE_IRENE } from './treIrene';
import { validateBoat } from './validate';

/** An ORC JSON record built from TRE IRENE's certificate (allowances = 3600 / speed). */
function treIreneRms(): OrcRms {
  const p = TRE_IRENE.polar!;
  const s = (kts: number[]) => kts.map((v) => 3600 / v);
  const ap = TRE_IRENE.scoring.find((o) => o.id === 'allPurpose')!;
  const co = TRE_IRENE.scoring.find((o) => o.id === 'coastal')!;
  return {
    RefNo: '0342000504Q',
    SailNo: 'GRE-4711',
    YachtName: 'TRE IRENE',
    Class: 'FIRST 45 SD',
    C_Type: 'INTL',
    GPH: 505,
    CDL: 11.498,
    APHD: ap.tod,
    APHT: ap.tot,
    OSN: co.tod,
    TMF_Offshore: co.tot,
    TND_Offshore_Low: 700,
    TN_Offshore_Low: 600 / 700,
    GRE_S_ALL_TOD: 610,
    GRE_S_ALL_TOT: 600 / 610,
    Allowances: {
      WindSpeeds: p.tws,
      WindAngles: Object.keys(p.speeds).map(Number),
      ...Object.fromEntries(Object.entries(p.speeds).map(([a, v]) => [`R${a}`, s(v)])),
      Beat: s(p.beatVMG),
      Run: s(p.runVMG),
      BeatAngle: p.beatAngle,
      GybeAngle: p.gybeAngle,
    },
  };
}

describe('ORC API data', () => {
  it('rebuilds the polar from time allowances', () => {
    const polar = orcPolar(treIreneRms().Allowances)!;
    expect(polar.tws).toEqual(TRE_IRENE.polar!.tws);
    expect(polar.beatVMG[3]).toBeCloseTo(TRE_IRENE.polar!.beatVMG[3], 2);
    expect(polar.speeds['90'][4]).toBeCloseTo(TRE_IRENE.polar!.speeds['90'][4], 2);
    expect(polar.gybeAngle).toEqual(TRE_IRENE.polar!.gybeAngle);
  });

  it('maps single numbers, triple numbers and national options to ToT/ToD', () => {
    const opts = orcScoring(treIreneRms(), [
      { CountryId: 'GRE', Kind: 'TOD', Fieldname: 'GRE_S_ALL_TOD', Name: 'Saronikos S All' },
      { CountryId: 'GRE', Kind: 'TOT', Fieldname: 'GRE_S_ALL_TOT', Name: 'Saronikos S All' },
      { CountryId: 'ORC', Kind: 'TOD', Fieldname: 'APHD', Name: 'All Purpose' },
    ]);
    const by = Object.fromEntries(opts.map((o) => [o.id, o]));
    expect(by.allPurpose).toMatchObject({ tod: 505, tot: 1.1882 });
    expect(by.coastal.tot).toBe(TRE_IRENE.scoring.find((o) => o.id === 'coastal')!.tot);
    expect(by.tripleCoastalLow.tod).toBe(700);
    expect(by.saronikosSAll).toMatchObject({ label: 'Saronikos S All', tod: 610 });
    expect(by.saronikosSAll.tot).toBeCloseTo(600 / 610, 6);
  });

  it('produces a valid boat profile', () => {
    const b = orcToBoat(treIreneRms(), [], false);
    expect(b.name).toBe('TRE IRENE');
    expect(b.sailNumber).toBe('GRE-4711');
    expect(validateBoat(b)).toEqual([]);
    expect(b.isOwn).toBe(false);
  });

  it('normalises sail numbers', () => {
    expect(normalizeSailNo('gre 1234')).toBe('GRE-1234');
    expect(normalizeSailNo('GRE1234')).toBe('GRE-1234');
    expect(normalizeSailNo('882')).toBe('GRE-882');
    expect(normalizeSailNo('ITA-12')).toBe('ITA-12');
  });
});
