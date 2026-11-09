import { describe, expect, it } from 'vitest';
import { checkExtract, extractToBoat, scoringId, type CertificateExtract } from './certificate';
import { TRE_IRENE } from './treIrene';
import { validateBoat } from './validate';

/** What a perfect reading of TRE IRENE's certificate looks like. */
function treIreneExtract(): CertificateExtract {
  const p = TRE_IRENE.polar!;
  return {
    isCertificate: true,
    boat: {
      name: 'TRE IRENE',
      sailNumber: 'GRE-4711',
      design: 'First 45 SD',
      orcRef: '0342000504Q',
      certificateType: 'ORC International',
      validUntil: '2099-12-31',
      loa: 13.795,
      beam: 4.202,
      draft: 2.4,
      displacement: 11443,
      crewWeight: 850,
      gph: 505,
      cdl: 11.498,
    },
    polar: {
      tws: p.tws,
      beatAngle: p.beatAngle,
      beatVMG: p.beatVMG,
      rows: Object.entries(p.speeds).map(([twa, speeds]) => ({ twa: Number(twa), speeds })),
      runVMG: p.runVMG,
      gybeAngle: p.gybeAngle,
    },
    scoring: TRE_IRENE.scoring.map((s) => ({ label: s.label, tod: s.tod, tot: s.tot })),
    sails: [
      { name: 'Main', kind: 'main', area: 60.59 },
      { name: 'J1.5', kind: 'headsail', area: 53.78 },
      { name: 'S1', kind: 'spinnaker', area: 162.34 },
    ],
    uncertain: [],
  };
}

describe('certificate import', () => {
  it('turns a clean reading into a valid boat with no flags', () => {
    const x = treIreneExtract();
    expect(checkExtract(x)).toEqual([]);
    const b = extractToBoat(x, true);
    expect(validateBoat(b)).toEqual([]);
    expect(b.polar).toEqual(TRE_IRENE.polar);
    expect(b.scoring.map((s) => s.id)).toEqual(TRE_IRENE.scoring.map((s) => s.id));
    expect(b.isOwn).toBe(true);
    expect(b.sails.map((s) => s.id)).toEqual(['main', 'J1.5', 'S1']);
    expect(b.sails[0].area).toBe(60.59);
  });

  it('flags misreadings: a dip in speed, odd angles, ratings that do not fit, the AI\'s own doubts', () => {
    const x = treIreneExtract();
    x.polar.rows[0].speeds = [...x.polar.rows[0].speeds];
    x.polar.rows[0].speeds[3] = 5.53; // 7.53 misread
    x.polar.beatAngle = [...x.polar.beatAngle];
    x.polar.beatAngle[0] = 4.73; // 47.3 without the decimal point
    x.scoring[2] = { ...x.scoring[2], tot: 1.9 };
    x.boat.validUntil = '31/12/2026';
    x.uncertain = [{ field: 'GPH', reason: 'θολό' }];
    const flags = checkExtract(x);
    const fields = flags.map((f) => f.field);
    expect(fields[0]).toBe('GPH');
    expect(fields).toContain('Ταχύτητα 52°, 10 kt');
    expect(fields).toContain('Γωνία όρτσας 4 kt');
    expect(fields.some((f) => f.startsWith('Βαθμολογία: Coastal'))).toBe(true);
    expect(fields).toContain('Λήξη πιστοποιητικού');
  });

  it('maps printed scoring labels to our ids', () => {
    expect(scoringId('Coastal/Long Distance')).toBe('coastal');
    expect(scoringId('Triple Number Coastal Medium')).toBe('tripleCoastalMedium');
    expect(scoringId('Triple Number W/L High')).toBe('tripleWLHigh');
    expect(scoringId('Saronikos N Up')).toBe('saronikosNUp');
  });

  it('keeps a boat without a speed table (ratings only)', () => {
    const x = treIreneExtract();
    x.polar = { tws: [], beatAngle: [], beatVMG: [], rows: [], runVMG: [], gybeAngle: [] };
    expect(extractToBoat(x, false).polar).toBeUndefined();
    expect(checkExtract(x).map((f) => f.field)).toContain('Polars');
  });
});
