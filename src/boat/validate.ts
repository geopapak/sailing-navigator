import type { BoatProfile, PolarTable } from './types';

/** Returns a list of human-readable (Greek) problems; empty when the polar is usable. */
export function validatePolar(p: PolarTable): string[] {
  const errs: string[] = [];
  const n = p.tws.length;
  if (n < 2) errs.push('Χρειάζονται τουλάχιστον 2 τιμές TWS.');
  for (let i = 1; i < n; i++) {
    if (!(p.tws[i] > p.tws[i - 1])) {
      errs.push('Οι τιμές TWS πρέπει να είναι αύξουσες.');
      break;
    }
  }
  const rows: [string, number[]][] = [
    ['beatAngle', p.beatAngle],
    ['beatVMG', p.beatVMG],
    ['runVMG', p.runVMG],
    ['gybeAngle', p.gybeAngle],
    ...Object.entries(p.speeds).map(([k, v]) => [`TWA ${k}°`, v] as [string, number[]]),
  ];
  for (const [name, row] of rows) {
    if (!Array.isArray(row) || row.length !== n) errs.push(`Η γραμμή ${name} πρέπει να έχει ${n} τιμές.`);
    else if (row.some((v) => !Number.isFinite(v) || v < 0)) errs.push(`Μη έγκυρη τιμή στη γραμμή ${name}.`);
  }
  for (const k of Object.keys(p.speeds)) {
    const a = Number(k);
    if (!Number.isFinite(a) || a <= 0 || a > 180) errs.push(`Μη έγκυρη γωνία TWA: ${k}.`);
  }
  p.beatAngle.forEach((a) => {
    if (a <= 0 || a >= 90) errs.push(`Γωνία όρτσας εκτός ορίων: ${a}°.`);
  });
  p.gybeAngle.forEach((a) => {
    if (a <= 90 || a > 180) errs.push(`Γωνία πρίμα εκτός ορίων: ${a}°.`);
  });
  return [...new Set(errs)];
}

export function validateBoat(b: BoatProfile): string[] {
  const errs: string[] = [];
  if (!b.name.trim()) errs.push('Το όνομα σκάφους είναι υποχρεωτικό.');
  if (!(b.performanceFactor > 0.5 && b.performanceFactor <= 1.2))
    errs.push('Ο συντελεστής απόδοσης πρέπει να είναι μεταξύ 0.5 και 1.2.');
  if (b.polar) errs.push(...validatePolar(b.polar));
  const ids = new Set(b.sails.map((s) => s.id));
  for (const r of b.sailRules) if (!ids.has(r.sailId)) errs.push(`Κανόνας για άγνωστο πανί: ${r.sailId}.`);
  for (const s of b.scoring) {
    if (!(s.tod > 0) || !(s.tot > 0)) errs.push(`Μη έγκυροι συντελεστές για ${s.label}.`);
  }
  return errs;
}
