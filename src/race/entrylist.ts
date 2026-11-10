/** Reading an entry list (PDF/photo) with the AI: schema, prompt and checks. */

export interface EntryListExtract {
  isEntryList: boolean;
  event: string;
  entries: { name: string; sailNo: string; className: string; mmsi: string; club: string }[];
}

const str = { type: 'string' } as const;

export const ENTRYLIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isEntryList', 'event', 'entries'],
  properties: {
    isEntryList: { type: 'boolean' },
    event: str,
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'sailNo', 'className', 'mmsi', 'club'],
        properties: { name: str, sailNo: str, className: str, mmsi: str, club: str },
      },
    },
  },
} as const;

export const ENTRYLIST_PROMPT = `Διαβάζεις λίστα συμμετοχών ιστιοπλοϊκού αγώνα (Entry list / Λίστα συμμετοχών / Δηλώσεις) και επιστρέφεις κάθε σκάφος όπως είναι γραμμένο.

- isEntryList: false αν το έγγραφο δεν είναι λίστα συμμετοχών (τότε entries κενό).
- event: όνομα αγώνα αν υπάρχει, αλλιώς "".
- Για κάθε σκάφος: name (όνομα σκάφους με κεφαλαία όπως γράφεται), sailNo (αριθμός πανιού, π.χ. GRE-1234· κράτα το πρόθεμα χώρας αν υπάρχει), className (κλάση/κατηγορία, π.χ. ORC B, ORC Club C, IRC), mmsi (9ψήφιο αν αναφέρεται, αλλιώς ""), club (όμιλος αν υπάρχει, αλλιώς "").
- Μην παραλείπεις σκάφη και μην επινοείς πεδία που δεν υπάρχουν· κενό "" όπου λείπει.`;

export function isEntryListExtract(x: unknown): x is EntryListExtract {
  const e = x as EntryListExtract;
  return !!e && typeof e === 'object' && typeof e.isEntryList === 'boolean' && Array.isArray(e.entries);
}

export interface CleanEntry {
  name: string;
  sailNo: string;
  className: string;
  mmsi: string;
  club: string;
}

/** Keeps valid-looking entries, MMSI only when it has 9 digits. */
export function cleanEntries(x: EntryListExtract): CleanEntry[] {
  return x.entries
    .filter((e) => e.name.trim() || e.sailNo.trim())
    .map((e) => ({
      name: e.name.trim(),
      sailNo: e.sailNo.trim(),
      className: e.className.trim(),
      mmsi: /^\d{9}$/.test(e.mmsi.replace(/\s/g, '')) ? e.mmsi.replace(/\s/g, '') : '',
      club: e.club.trim(),
    }));
}
