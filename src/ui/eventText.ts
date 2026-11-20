/**
 * Greek texts of the multi-race event («Διοργάνωση», P-040) and of the finish line, in one place
 * for the copywriter (P-041). Wording: spec `docs/product/specs/P-040-events.md` and the glossary
 * (NM, «πριν από», guillemets, decimal comma), not the older prototype where they differ.
 */
import type { ResultCode, ResultSource } from '../race/types';

/** «1,5» */
export const dec = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** «1 βαθμός», «2,5 βαθμοί»; `n` already written with a decimal comma. */
export const pointsText = (n: string | number) => {
  const s = typeof n === 'number' ? dec(n) : n;
  return `${s} ${s === '1' ? 'βαθμός' : 'βαθμοί'}`;
};

export const EVENT_TEXT = {
  // E01 setup (AC 1–4)
  partOf: 'Μέρος διοργάνωσης',
  noneTitle: 'Όχι',
  noneSub: 'ένας αγώνας',
  newTitle: 'Νέα διοργάνωση',
  newSub: 'π.χ. διήμερος',
  existing: (name: string, n: number) => `${name} · ${n}η ιστιοδρομία`,
  existingSub: (n: number) => `${n}η ιστιοδρομία`,
  eventName: 'Όνομα διοργάνωσης',
  eventNamePh: 'π.χ. Διήμερος Σαρωνικού',
  noEventName: 'Δώσε όνομα στη διοργάνωση',
  noRaceName: 'Δώσε όνομα ιστιοδρομίας.',
  scoring: 'Βαθμολογία',
  points: 'Παράρτημα A (θέσεις)',
  time: 'Άθροισμα διορθωμένων χρόνων',
  scoringHelp: 'Όπως λέει η οδηγία πλου.',
  discards: 'Απορρίψεις',
  discardFrom: 'από',
  completedRaces: 'ολοκληρωμένες ιστιοδρομίες',
  classSize: 'Σκάφη στην κλάση (προαιρετικό)',
  classHelp: 'Αν δεν έβαλες όλα τα σκάφη της κλάσης σου. Οι DNC, DNF κ.λπ. παίρνουν τόσους βαθμούς + 1.',
  raceName: 'Όνομα ιστιοδρομίας',
  raceNamePh: 'π.χ. Αίγινα–Πειραιάς',
  newRace: 'Νέα ιστιοδρομία',
  race: 'Ιστιοδρομία',
  sameEntries: (m: number, prev: number) => `ίδιοι ${m} με την ${prev}η ιστιοδρομία`,
  onlyClass: 'Βάλε μόνο τα σκάφη της κλάσης σου.',
  setupNote: (deg: number) =>
    `Η καταγραφή ξεκινά μόνη της 10′ πριν από την εκκίνηση. Στον τερματισμό η εφαρμογή ρωτά «Τερματίσατε στις …;». Κάθε ιστιοδρομία είναι δική της έξοδος: το βράδυ στο λιμάνι δεν καταγράφεται. Ειδοποιήσεις: layline, στροφή ανέμου από ${deg}°, σημαδούρα.`,
  // E02 home (AC 10)
  afterN: (name: string, n: number, place: string, est: boolean) => `${name} · μετά την ${n}η: ${place}ος στη γενική${est ? ' (εκτ.)' : ''}`,
  noneYet: (name: string) => `${name} · καμία ιστιοδρομία ακόμα`,
  nextRace: (n: number, name?: string) => `→ ${n}η ιστιοδρομία${name ? `: ${name}` : ''}`,
  when: (w: string, same: boolean) => `${w}${same ? ' · ίδιο σκάφος και αντίπαλοι' : ''}`,
  notSet: 'δεν έχει στηθεί',
  openRace: (n: number) => `Άνοιξε την ${n}η ιστιοδρομία`,
  setupRace: (n: number) => `Στήσε την ${n}η ιστιοδρομία`,
  seeEvent: 'Δες τη διοργάνωση',
  // E03 inside the race (AC 12)
  running: (n: number, name?: string) => `${n}η ιστιοδρομία${name ? ` · ${name}` : ''}`,
  live: (name: string, place: string) => `${name} · ${place}ος στη γενική (εκτ.)`,
  liveNone: (name: string) => `${name} · γενική: —`,
  endTitle: (n: number) => `Τερματισμός ${n}ης ιστιοδρομίας;`,
  endText: 'Σταματά η καταγραφή και οι ειδοποιήσεις. Η επόμενη ιστιοδρομία είναι νέα έξοδος· το βράδυ στο λιμάνι δεν καταγράφεται. Θα έχεις 10″ για αναίρεση.',
  // E04 results editor (AC 29, design/events-2026-11: a list, one sheet per boat with its own keypad)
  resultsTitle: (n: number) => `Αποτελέσματα · ${n}η ιστιοδρομία`,
  results: 'Αποτελέσματα',
  resultsIntro: 'Γράψε τα επίσημα από τον πίνακα της επιτροπής. Η κατάταξη αλλάζει αμέσως.',
  overallNow: 'Συνολικά τώρα:',
  src: {
    line: 'από τη γραμμή',
    manual: 'χειροκίνητα',
    official: 'επίσημο',
    est: 'εκτίμηση',
  } as Record<ResultSource, string>,
  noResult: 'χωρίς αποτέλεσμα',
  srcLineApprox: 'περίπου, από τη γραμμή',
  notInRace: 'δεν ήταν στην ιστιοδρομία',
  pts: (p: string) => pointsText(p),
  finishAt: (t: string) => `τερμ. ${t}`,
  rowLabel: (name: string, place: string, value: string) => `${name}, θέση ${place}, ${value}. Άλλαξε.`,
  classFoot: (n: number, pts: number, given: boolean) =>
    `Σκάφη στην κλάση: ${n}${given ? '' : ' (όσα είναι στις «Συμμετοχές»)'}. Κάθε κωδικός = ${pointsText(pts)}. Ίσος διορθωμένος = ίδια θέση με «=».`,
  done: 'Έτοιμο',
  noChange: 'Καμία αλλαγή',
  modes: {
    clock: ['Ώρα', 'τερματισμού'],
    elapsed: ['Χρόνος', 'πραγματικός'],
    code: ['Κωδικός', 'DNF, DNS…'],
  } as const,
  whatTyped: 'Τι γράφεις',
  clockLabel: 'Ώρα τερματισμού (ΩΩ:ΛΛ:ΔΔ), όπως στον πίνακα της επιτροπής',
  elapsedLabel: 'Πραγματικός χρόνος (Ω:ΛΛ:ΔΔ)',
  keypad: 'Πληκτρολόγιο',
  keyClear: 'Καθάρισε',
  keyClearAria: 'Καθάρισμα',
  keyBackAria: 'Σβήσε το τελευταίο ψηφίο',
  codesAria: 'Κωδικός αποτελέσματος',
  why: {
    emptyclock: 'Γράψε την ώρα τερματισμού.',
    emptyelapsed: 'Γράψε τον πραγματικό χρόνο.',
    minsec: 'Λεπτά και δευτερόλεπτα έως 59.',
    hour: 'Η ώρα είναι έως 23:59:59.',
    zero: 'Ο χρόνος πρέπει να είναι πάνω από 0.',
    code: 'Διάλεξε κωδικό.',
  },
  codeIs: (c: string, pts: number) => `${c} = ${pointsText(pts)}${c === 'DNE' ? ' · δεν απορρίπτεται' : ''}`,
  calcElapsed: (t: string) => `Πραγματικός ${t}`,
  calcClock: (t: string) => `Τερματισμός ${t}`,
  nextDay: 'την επόμενη μέρα',
  calcCorr: (t: string) => `διορθωμένος ${t}`,
  calcPlace: (p: number, tied: boolean) => `${p}η θέση${tied ? ' (ισοβαθμία)' : ''}`,
  noRating: 'χωρίς βαθμολόγηση ORC',
  startNote: (t: string) => `Εκκίνηση ${t}.`,
  digitsNote: 'Τα ψηφία μπαίνουν από δεξιά.',
  codeNote: (pts: number, n: number) => `Κάθε κωδικός = ${pointsText(pts)} (${n} ${n === 1 ? 'σκάφος' : 'σκάφη'} + 1).`,
  clearResult: (est: boolean) => (est ? 'Σβήσε το αποτέλεσμα (μένει εκτίμηση)' : 'Σβήσε το αποτέλεσμα'),
  cleared: (name: string, est: boolean) => `${name}: ${est ? 'μένει εκτίμηση' : 'χωρίς αποτέλεσμα'}`,
  savedOne: (name: string, what: string, where: string) => `${name}: ${what} · ${where}`,
  save: 'Αποθήκευση',
  saveNext: 'Αποθήκευση · επόμενο ›',
  cancel: 'Άκυρο',
  saveFailed: 'Δεν αποθηκεύτηκε.',
  retry: 'Ξανά',
  us: 'εμείς',
  // E05 summary (AC 30)
  ended: 'Η ιστιοδρομία τελείωσε',
  place: 'θέση',
  estPlace: 'εκτίμηση θέσης',
  afterCard: (name: string, n: number) => `${name} · μετά την ${n}η`,
  // E06 standing (AC 34)
  standing: 'Γενική κατάταξη',
  finalStanding: 'Τελική κατάταξη',
  colPlace: '#',
  colBoat: 'σκάφος',
  colTotal: 'σύνολο',
  swipe: '⇆ Σύρε τον πίνακα για όλες τις ιστιοδρομίες',
  pointsFoot: (d: number, k: number, on: boolean) =>
    `Παράρτημα A (θέσεις) · ισοβαθμία: Παράρτημα A8 · ${
      d === 0
        ? 'χωρίς απορρίψεις.'
        : on
          ? `απορρίψεις: ${d} από ${k} ολοκληρωμένες ιστιοδρομίες, σε παρένθεση.`
          : `απορρίψεις: ${d} από ${k} ολοκληρωμένες ιστιοδρομίες (ακόμα καμία).`
    }`,
  codesFoot: (pts: number) => `DNC, DNS, OCS, DNF, RET, DSQ, DNE: ${pointsText(pts)} (σκάφη στην κλάση + 1). Το DNE δεν απορρίπτεται.`,
  timeFoot:
    'Άθροισμα διορθωμένων χρόνων · χωρίς απορρίψεις · ισοβαθμία: καλύτερη θέση στην τελευταία ιστιοδρομία. Σκάφη με DNF, DNS κ.λπ. μπαίνουν μετά από όσα έχουν χρόνο σε όλες.',
  hasEst: 'Περιέχει εκτιμήσεις (εκτ.). Βάλε τα επίσημα από τα «Αποτελέσματα».',
  hasMissing: 'Λείπουν αποτελέσματα. Βάλε τα επίσημα από τα «Αποτελέσματα».',
  noRaces: 'Καμία ιστιοδρομία ακόμα.',
  tieLine: (upper: string, lower: string, total: string, rule: 'A8.1' | 'A8.2') =>
    `«${upper}» και «${lower}»: ${pointsText(total)}. Πάνω: «${upper}» (${rule === 'A8.1' ? 'A8.1: καλύτερες θέσεις' : 'A8.2: τελευταία ιστιοδρομία'}).`,
  raceLine: (day: string, own: string, what: string, est: number) => `${day} · ${own} ${what}${est ? ` · ${est} εκτ.` : ''}`,
  est: '(εκτ.)',
  // E07 event screen and History (AC 33, 35–38)
  eventKind: 'Διοργάνωση',
  header: (m: number, scoring: 'points' | 'time', d: number, k: number, open: boolean) =>
    `${m} ${m === 1 ? 'ιστιοδρομία' : 'ιστιοδρομίες'} · ${scoring === 'points' ? 'Παράρτημα A (θέσεις)' : 'Άθροισμα διορθωμένων χρόνων'} · ${
      scoring === 'points' ? `απορρίψεις ${d} από ${k}` : 'χωρίς απορρίψεις'
    }${open ? ' · σε εξέλιξη' : ''}`,
  histSub: (m: number, open: boolean) => `Διοργάνωση · ${m} ${m === 1 ? 'ιστιοδρομία' : 'ιστιοδρομίες'} · ${open ? 'σε εξέλιξη' : 'έκλεισε'}`,
  histLine: (n: number, name: string, corr: string, place: string) => `${n}η: ${name} · ${corr} · ${place}ος`,
  histNotYet: (n: number, name: string) => `${n}η: ${name} · δεν έγινε ακόμα`,
  histOverall: (place: string, of: number) => `Γενική: ${place}ος από ${of}`,
  change: 'Αλλαγή',
  raceCard: (n: number, name: string) => `${n}η ιστιοδρομία · ${name}`,
  colCorrected: 'διορθωμένος',
  analysis: 'Ανάλυση',
  notYet: 'Δεν έγινε ακόμα.',
  runningNow: 'Σε εξέλιξη.',
  cancelled: (name: string, day: string) => `Ακυρώθηκε · ${name} · ${day} · δεν μετρά`,
  heldBtn: 'Η ιστιοδρομία έγινε χωρίς εμάς',
  close: 'Η διοργάνωση τελείωσε',
  closeAsk: 'Κλείσιμο διοργάνωσης; Δεν θα προτείνεται πια στην αρχική ούτε στο «Μέρος διοργάνωσης». Τα αποτελέσματα διορθώνονται και μετά.',
  closeYes: 'Ναι, η διοργάνωση τελείωσε',
  closed: 'Η διοργάνωση έκλεισε · μένει στο Ιστορικό',
  closedBadge: 'Έκλεισε',
  reopen: 'Άνοιξε ξανά τη διοργάνωση',
  reopened: 'Η διοργάνωση άνοιξε ξανά',
  notFound: 'Η διοργάνωση δεν βρέθηκε.',
  back: 'Οι έξοδοί μου',
  backEvent: 'Διοργάνωση',
  deleteRace: 'Διαγραφή ιστιοδρομίας',
  deleteAsk: (n: number, name: string, only: boolean) =>
    `Διαγραφή ${n}ης ιστιοδρομίας; Η «${name}» σβήνει μαζί με το ίχνος και τα αποτελέσματά της. Οι επόμενες αλλάζουν αριθμό.${only ? ' Ήταν η μόνη ιστιοδρομία: σβήνει και η διοργάνωση.' : ''} Θα έχεις 8″ για αναίρεση.`,
  deleteYes: 'Ναι, διαγραφή',
  deleted: (race: string) => `Διαγράφηκε η ιστιοδρομία «${race}»`,
  deletedBoth: (race: string, event: string) => `Διαγράφηκε η ιστιοδρομία «${race}» και η διοργάνωση «${event}»`,
} as const;

/** Short Greek hint next to each code (prototype `design/events-2026-11`). */
export const CODE_HINT: Record<ResultCode, string> = {
  DNC: 'δεν ήρθε στην εκκίνηση',
  DNS: 'δεν ξεκίνησε',
  OCS: 'πρόωρη εκκίνηση',
  DNF: 'δεν τερμάτισε',
  RET: 'αποσύρθηκε',
  DSQ: 'αποκλεισμός',
  DNE: 'αποκλεισμός που δεν απορρίπτεται',
};

export const FINISH_TEXT = {
  title: (t: string) => `Τερματίσατε στις ${t};`,
  approxTitle: (t: string) => `Τερματίσατε γύρω στις ${t};`,
  body: (ago: string) =>
    `Το σκάφος πέρασε τη γραμμή τερματισμού πριν από ${ago}. Για τον διορθωμένο χρόνο κρατάμε την ώρα του περάσματος, όσο αργά κι αν πατήσεις.`,
  approxBody: (min: number) =>
    `Η εφαρμογή ήταν στο παρασκήνιο ${min}′, άρα η ώρα του περάσματος είναι περίπου. Αν έχεις την επίσημη, βάλ' τη μετά στα «Αποτελέσματα».`,
  tones: '♪ ♪ γραμμή τερματισμού',
  yes: 'Ναι, τερματίσαμε',
  no: 'Όχι, συνεχίζουμε',
  goingOn: 'Συνεχίζουμε · η καταγραφή συνεχίζει',
  ended: (t: string, approx?: boolean) => `Τερματισμός ${approx ? 'περίπου ' : ''}${t} · από το πέρασμα της γραμμής, για τον διορθωμένο χρόνο`,
  forgotten: (t: string) => `Τέλος στο πέρασμα της γραμμής (${t})`,
} as const;

/** «2:05» for the live «πριν από m:ss». */
export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
