/**
 * ORC certificate import: the JSON shape the AI fills from the PDF, its
 * conversion to a BoatProfile, and plausibility checks that flag values for
 * the user to confirm. Shared by the server (schema) and the app (checks).
 */
import type { BoatProfile, PolarTable, Sail, SailKind } from './types';
import { STANDARD_SCORING_OPTIONS } from './scoringOptions';
import { newBoatId } from './ids';

export interface CertificateExtract {
  isCertificate: boolean;
  boat: {
    name: string;
    sailNumber: string;
    design: string;
    orcRef: string;
    certificateType: string;
    /** YYYY-MM-DD or "". */
    validUntil: string;
    loa: number;
    beam: number;
    draft: number;
    displacement: number;
    crewWeight: number;
    gph: number;
    cdl: number;
  };
  polar: {
    tws: number[];
    beatAngle: number[];
    beatVMG: number[];
    rows: { twa: number; speeds: number[] }[];
    runVMG: number[];
    gybeAngle: number[];
  };
  scoring: { label: string; tod: number; tot: number }[];
  sails: { name: string; kind: SailKind; area: number }[];
  uncertain: { field: string; reason: string }[];
}

const num = { type: 'number' } as const;
const nums = { type: 'array', items: num } as const;
const str = { type: 'string' } as const;

/** Structured-output schema for the extraction (strict: every key required). */
export const CERTIFICATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isCertificate', 'boat', 'polar', 'scoring', 'sails', 'uncertain'],
  properties: {
    isCertificate: { type: 'boolean' },
    boat: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'sailNumber', 'design', 'orcRef', 'certificateType', 'validUntil', 'loa', 'beam', 'draft', 'displacement', 'crewWeight', 'gph', 'cdl'],
      properties: {
        name: str,
        sailNumber: str,
        design: str,
        orcRef: str,
        certificateType: str,
        validUntil: str,
        loa: num,
        beam: num,
        draft: num,
        displacement: num,
        crewWeight: num,
        gph: num,
        cdl: num,
      },
    },
    polar: {
      type: 'object',
      additionalProperties: false,
      required: ['tws', 'beatAngle', 'beatVMG', 'rows', 'runVMG', 'gybeAngle'],
      properties: {
        tws: nums,
        beatAngle: nums,
        beatVMG: nums,
        rows: {
          type: 'array',
          items: { type: 'object', additionalProperties: false, required: ['twa', 'speeds'], properties: { twa: num, speeds: nums } },
        },
        runVMG: nums,
        gybeAngle: nums,
      },
    },
    scoring: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['label', 'tod', 'tot'], properties: { label: str, tod: num, tot: num } },
    },
    sails: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'area'],
        properties: { name: str, kind: { type: 'string', enum: ['main', 'headsail', 'spinnaker', 'reaching', 'other'] }, area: num },
      },
    },
    uncertain: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['field', 'reason'], properties: { field: str, reason: str } },
    },
  },
} as const;

export const CERTIFICATE_PROMPT = `Διαβάζεις πιστοποιητικό ORC (ORC International ή ORC Club) και επιστρέφεις τα στοιχεία του ακριβώς όπως είναι τυπωμένα, χωρίς να υπολογίζεις ή να συμπληρώνεις τίποτα από μνήμης.

- isCertificate: false αν το έγγραφο δεν είναι πιστοποιητικό ORC (τότε τα υπόλοιπα κενά/0).
- boat: όνομα σκάφους, αριθμός πανιού, σχέδιο/τύπος (builder/designer αν υπάρχουν), Ref No, τύπος πιστοποιητικού, ημερομηνία λήξης (YYYY-MM-DD), LOA/Beam/Draft (m), Displacement (kg), Crew weight (kg), GPH (s/NM), CDL. Ό,τι δεν υπάρχει: "" ή 0.
- polar: από τον πίνακα «Velocity Prediction» / «Selected Course Time Allowances». tws = οι εντάσεις ανέμου των στηλών (kt). beatAngle και beatVMG = γραμμές Beat Angles / Beat VMG. rows = μία ανά σταθερή γωνία (52°, 60°, 75°, 90°, 110°, 120°, 135°, 150° κ.λπ.) με τις ταχύτητες σκάφους (kt) ανά TWS. runVMG και gybeAngle = Run VMG / Gybe Angles. Κάθε γραμμή έχει όσες τιμές έχει το tws. ΠΡΟΣΟΧΗ: ο πίνακας ταχυτήτων είναι σε κόμβους· αν το πιστοποιητικό δίνει μόνο χρόνους σε s/NM, μην τους μετατρέψεις — βάλε κενούς πίνακες και γράψε το στο uncertain.
- scoring: κάθε επιλογή βαθμολογίας με Time on Distance (s/NM) και Time on Time, με το label όπως είναι τυπωμένο (All purpose, Windward/Leeward, Coastal/Long Distance, Triple Number Low/Medium/High, τοπικές επιλογές π.χ. Saronikos).
- sails: τα πανιά με το εμβαδόν τους (m²) αν αναφέρονται· kind: main, headsail, spinnaker (συμμετρικό ή ασύμμετρο) ή reaching.
- uncertain: κάθε τιμή που ήταν δυσανάγνωστη, θολή ή που δεν είσαι σίγουρος, με field (σύντομη ελληνική περιγραφή, π.χ. «Γωνία όρτσας 6 kt») και reason (γιατί).`;

/** Maps a printed label to our scoring id (e.g. "Triple Number Coastal Low" → tripleCoastalLow). */
export function scoringId(label: string): string {
  const k = label.toLowerCase().replace(/[^a-z]/g, '');
  const known = STANDARD_SCORING_OPTIONS.find((o) => o.label.toLowerCase().replace(/[^a-z]/g, '') === k);
  if (known) return known.id;
  const triple = /triple|number/.test(k);
  const level = /low/.test(k) ? 'Low' : /medium|med/.test(k) ? 'Medium' : /high/.test(k) ? 'High' : '';
  if (triple && level) return /windward|wl|leeward/.test(k) ? `tripleWL${level}` : `tripleCoastal${level}`;
  if (/allpurpose/.test(k)) return 'allPurpose';
  if (/windward|leeward/.test(k)) return 'windwardLeeward';
  if (/coastal|longdistance/.test(k)) return 'coastal';
  return k.slice(0, 40) || 'option';
}

export interface Flag {
  field: string;
  reason: string;
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Plausibility checks on what the AI read; each problem becomes a flag for the user. */
export function checkExtract(x: CertificateExtract): Flag[] {
  const f: Flag[] = [];
  const p = x.polar;
  const n = p.tws.length;
  if (n === 0) f.push({ field: 'Polars', reason: 'Δεν βρέθηκε πίνακας ταχυτήτων· συμπλήρωσέ τον χειροκίνητα.' });
  for (let i = 1; i < n; i++) if (!(p.tws[i] > p.tws[i - 1])) f.push({ field: 'TWS', reason: 'Οι εντάσεις δεν είναι αύξουσες.' });
  const rows: [string, number[]][] = [
    ['Γωνία όρτσας', p.beatAngle],
    ['VMG όρτσας', p.beatVMG],
    ['VMG πρίμα', p.runVMG],
    ['Γωνία πρίμα', p.gybeAngle],
    ...p.rows.map((r) => [`Ταχύτητα ${r.twa}°`, r.speeds] as [string, number[]]),
  ];
  for (const [name, row] of rows) {
    if (row.length !== n) f.push({ field: name, reason: `Έχει ${row.length} τιμές αντί για ${n}.` });
  }
  p.beatAngle.forEach((a, i) => {
    if (!(a > 25 && a < 60)) f.push({ field: `Γωνία όρτσας ${p.tws[i]} kt`, reason: `${a}° είναι εκτός λογικών ορίων.` });
  });
  p.gybeAngle.forEach((a, i) => {
    if (!(a > 120 && a <= 180)) f.push({ field: `Γωνία πρίμα ${p.tws[i]} kt`, reason: `${a}° είναι εκτός λογικών ορίων.` });
  });
  // Speeds should grow with the wind up to the top of the table (small dips are possible at the top).
  for (const [name, row] of [['VMG όρτσας', p.beatVMG] as [string, number[]], ...p.rows.map((r) => [`Ταχύτητα ${r.twa}°`, r.speeds] as [string, number[]])]) {
    for (let i = 1; i < Math.min(row.length, n - 1); i++) {
      if (row[i] + 0.05 < row[i - 1]) f.push({ field: `${name}, ${p.tws[i]} kt`, reason: `${row[i]} kt είναι μικρότερο από ${row[i - 1]} kt με λιγότερο άνεμο.` });
    }
    row.forEach((v, i) => {
      if (!(v > 0 && v < 30)) f.push({ field: `${name}, ${p.tws[i] ?? '?'} kt`, reason: `${v} kt δεν στέκει.` });
    });
  }
  // On ORC certificates ToT × ToD ≈ 600.
  for (const s of x.scoring) {
    if (!(s.tod > 200 && s.tod < 1500) || !(s.tot > 0.4 && s.tot < 3)) {
      f.push({ field: `Βαθμολογία: ${s.label}`, reason: `ToD ${s.tod} / ToT ${s.tot} εκτός λογικών ορίων.` });
    } else if (Math.abs(s.tod * s.tot - 600) > 30) {
      f.push({ field: `Βαθμολογία: ${s.label}`, reason: `ToD × ToT = ${round(s.tod * s.tot, 0)}, ενώ συνήθως είναι ~600: έλεγξε τους συντελεστές.` });
    }
  }
  if (x.boat.validUntil && !/^\d{4}-\d\d-\d\d$/.test(x.boat.validUntil)) f.push({ field: 'Λήξη πιστοποιητικού', reason: 'Η ημερομηνία δεν διαβάστηκε καθαρά.' });
  if (x.boat.validUntil && /^\d{4}-\d\d-\d\d$/.test(x.boat.validUntil) && new Date(x.boat.validUntil).getTime() < Date.now()) {
    f.push({ field: 'Λήξη πιστοποιητικού', reason: 'Το πιστοποιητικό έχει λήξει.' });
  }
  if (!x.boat.name.trim()) f.push({ field: 'Όνομα', reason: 'Δεν βρέθηκε όνομα σκάφους.' });
  // De-duplicate, AI's own doubts first.
  const all = [...x.uncertain, ...f];
  const seen = new Set<string>();
  return all.filter((a) => {
    const k = `${a.field}|${a.reason}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Converts the extract into a new boat profile (the user reviews it before saving). */
export function extractToBoat(x: CertificateExtract, isOwn: boolean): BoatProfile {
  const p = x.polar;
  const n = p.tws.length;
  const polar: PolarTable | undefined =
    n >= 2 && p.rows.length
      ? {
          tws: p.tws,
          beatAngle: p.beatAngle.slice(0, n),
          beatVMG: p.beatVMG.slice(0, n),
          speeds: Object.fromEntries(p.rows.map((r) => [String(Math.round(r.twa)), r.speeds.slice(0, n)])),
          runVMG: p.runVMG.slice(0, n),
          gybeAngle: p.gybeAngle.slice(0, n),
        }
      : undefined;
  const sails: Sail[] = [{ id: 'main', name: 'Μεγίστη', kind: 'main' }];
  const used = new Set(['main']);
  for (const s of x.sails) {
    if (s.kind === 'main') {
      if (s.area > 0) sails[0].area = s.area;
      continue;
    }
    let id = s.name.trim().replace(/\s+/g, '') || s.kind;
    while (used.has(id)) id += "'";
    used.add(id);
    sails.push({ id, name: s.name.trim() || id, kind: s.kind, area: s.area > 0 ? s.area : undefined });
  }
  const opt = (v: number) => (v > 0 ? v : undefined);
  const seenIds = new Set<string>();
  return {
    id: newBoatId(x.boat.name || 'boat'),
    name: x.boat.name.trim(),
    sailNumber: x.boat.sailNumber.trim() || undefined,
    design: x.boat.design.trim() || undefined,
    orcRef: x.boat.orcRef.trim() || undefined,
    certificateValidUntil: /^\d{4}-\d\d-\d\d$/.test(x.boat.validUntil) ? x.boat.validUntil : undefined,
    loa: opt(x.boat.loa),
    beam: opt(x.boat.beam),
    draft: opt(x.boat.draft),
    displacement: opt(x.boat.displacement),
    crewWeight: opt(x.boat.crewWeight),
    gph: opt(x.boat.gph),
    cdl: opt(x.boat.cdl),
    notes: x.boat.certificateType ? `Από πιστοποιητικό ${x.boat.certificateType} (PDF).` : 'Από πιστοποιητικό ORC (PDF).',
    polar,
    performanceFactor: 1,
    sails,
    sailRules: [],
    scoring: x.scoring
      .map((s) => ({ id: scoringId(s.label), label: s.label.trim(), tod: s.tod, tot: s.tot }))
      .filter((s) => (seenIds.has(s.id) ? false : (seenIds.add(s.id), true))),
    isOwn,
    updatedAt: 0,
  };
}

/** Light shape check of what came back from the server. */
export function isExtract(x: unknown): x is CertificateExtract {
  const e = x as CertificateExtract;
  return !!e && typeof e === 'object' && typeof e.isCertificate === 'boolean' && !!e.boat && !!e.polar && Array.isArray(e.scoring) && Array.isArray(e.uncertain);
}
