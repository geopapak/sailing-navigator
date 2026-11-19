/**
 * Greek texts of the in-session Live per kind and of the per-kind alert
 * settings (P-034), in one place so they are easy to find and move (P-041/P-042).
 * The wording follows the approved prototype `design/session-home-2026-11/`.
 */
export const LIVE_TEXT = {
  noInstRace: 'Χωρίς όργανα: ταχύτητα από GPS, άνεμος χειροκίνητα. Οι ειδοποιήσεις στροφής ανέμου είναι κλειστές.',
  noInstTraining:
    'Χωρίς όργανα: ταχύτητα από GPS, άνεμος χειροκίνητα. Τα νούμερα είναι ενδεικτικά λόγω ρεύματος. Η ειδοποίηση στροφής ανέμου είναι κλειστή.',
  indicative: 'ενδεικτικό',
  waitingSpeed: 'περιμένει ταχύτητα',
  pctTitle: '% του στόχου',
  pctMean: 'μέσος όρος 15″',
  speed: 'Ταχύτητα',
  windAngle: 'Γωνία ανέμου',
  target: 'στόχος',
  leg: 'σκέλος',
  sogFromGps: 'SOG από GPS',
  sogGround: 'SOG · ως προς βυθό',
  course: 'πορεία',
  depth: 'Βάθος',
  depthSounder: 'βυθόμετρο',
  depthChart: 'από χάρτη · ενδεικτικό, όχι για ναυσιπλοΐα',
  weather: 'Καιρός',
  forecastOffline: (hhmm: string) => `Πρόγνωση των ${hhmm} (χωρίς ίντερνετ).`,
  stillOffline: (hhmm: string) => `Ακόμα χωρίς ίντερνετ. Κρατάμε την πρόγνωση των ${hhmm}.`,
  noForecast: 'Δεν υπάρχει πρόγνωση για σήμερα.',
  noForecastOffline: 'Ακόμα χωρίς ίντερνετ. Δεν υπάρχει αποθηκευμένη πρόγνωση.',
  retry: 'Ξανά',
  toCruise: '⇄ Άλλαξε σε Αναψυχή',
  toTraining: '⇄ Άλλαξε σε Προπόνηση',
  polarTrim: 'Polar και τριμάρισμα',
  targetsFor: (tws: string) => `Στόχοι για ${tws} kt`,
  wholePolar: 'Όλο το polar',
  sail: 'Πανί',
  trim: 'Τριμάρισμα',
  noPolar: 'Το σκάφος δεν έχει polars, άρα ούτε στόχους. Πρόσθεσε polars από Σκάφη → Επεξεργασία.',
  // L10 (P-053)
  noWind: 'Χρειάζεται άνεμος: από τα όργανα ή με «Βάλε άνεμο».',
  next: 'Επόμενο',
  ranking: 'Κατάταξη (εκτίμηση)',
  finish: 'Τερματισμός',
  markShort: (i: number) => `Σημ. ${i}`,
} as const;

/** «Χάρτης» inside a session (P-034 AC 9). */
export const MAP_TEXT = {
  noFix: 'Χωρίς θέση GPS. Ο χάρτης δείχνει την τελευταία γνωστή θέση.',
  sessionCourse: 'Διαδρομή της εξόδου',
  noMarks: 'Η έξοδος δεν έχει σημαδούρες.',
  readOnlyRace: 'Η διαδρομή της εξόδου αλλάζει από τον αγώνα. Οι αποθηκευμένες διαδρομές δεν αλλάζουν όσο τρέχει η έξοδος.',
  readOnlyOther: 'Οι σημαδούρες μπαίνουν στο ξεκίνημα της εξόδου. Οι αποθηκευμένες διαδρομές δεν αλλάζουν όσο τρέχει η έξοδος.',
} as const;

/** «Σύμβουλος» inside a session (P-034 AC 10). */
export const CHAT_TEXT = {
  intro: (kind: 'race' | 'training' | 'cruise') =>
    `Ρώτα για ${kind === 'cruise' ? 'καιρό και ασφάλεια' : 'τακτική, πανιά και τριμάρισμα'}. Ο σύμβουλος βλέπει τα νούμερα του Live.`,
  questions: {
    race: ['Ποια πλευρά ευνοείται ως την επόμενη σημαδούρα;', 'Πότε σηκώνουμε μπαλόνι;'],
    training: ['Γιατί είμαι κάτω από τον στόχο;', 'Τι τριμάρισμα θέλει στους 14 kt;'],
    cruise: ['Θα δυναμώσει ο καιρός ως τις 17:00;', 'Πού έχει απάγκιο με Βοριά;'],
  },
  offline: 'Χωρίς ίντερνετ: ο σύμβουλος δεν απαντά τώρα. Τα νούμερα του Live δουλεύουν κανονικά.',
  retry: 'Ξανά',
  stillOffline: 'Ακόμα χωρίς ίντερνετ.',
} as const;

export const ALERT_SETTINGS_TEXT = {
  raceTitle: 'Ειδοποιήσεις · Αγώνας',
  trainingTitle: 'Ειδοποιήσεις · Προπόνηση',
  soundTitle: 'Ήχος ειδοποιήσεων',
  layline: 'Layline',
  laylineSub: (tack: string, gybe: string) => `${tack} ή ${gybe} σε 2′, 1′, τώρα`,
  shift: 'Στροφή ανέμου',
  shiftSub: (deg: number) => `από ${deg}° και πάνω, μόνο με όργανα`,
  shiftQuick: (deg: number) => `Στροφή ανέμου (από ${deg}°)`,
  shiftDegs: 'Κατώφλι στροφής ανέμου',
  mark: 'Σημαδούρα',
  markSub: '1′ πριν, και στον τερματισμό',
  gps: 'Χάθηκε το GPS ή η καταγραφή',
  gpsQuick: 'Χάθηκε το GPS',
  gpsSub: 'για να μη μείνει τρύπα στο ίχνος',
  below: 'Κάτω από 90% του στόχου',
  belowSub: 'για πάνω από 30″ · αρχικά κλειστό',
  belowNoInst: 'μόνο με όργανα: χωρίς αυτά το % είναι πολύ ενδεικτικό',
  layNow: 'Layline «τώρα»',
  layNowSub: 'μόνο όταν η προπόνηση έχει σημαδούρες',
  startCd: 'Αντίστροφη μέτρηση εκκίνησης',
  startCdSub: 'μόνο με στόχο «Εκκινήσεις»',
  trainingBeepOnly: 'Στην προπόνηση ακούγεται μόνο μπιπ, χωρίς φωνή.',
  trainingNote: 'Τουλάχιστον 60″ ανάμεσα σε δύο ειδοποιήσεις. Χωρίς «σημαδούρα σε 1′» και χωρίς φωνή σε κάθε αναστροφή.',
  cruiseTitle: 'Ειδοποιήσεις · Αναψυχή',
  shallow: 'Ρηχά μπροστά',
  shallowSub: 'κάτω από 5 m · ενδεικτικό, όχι για ναυσιπλοΐα',
  shallowPrivacy: 'Στέλνει ένα σημείο μπροστά από το σκάφος στο EMODnet για το βάθος, χωρίς τα στοιχεία σου.',
  shallowOffline: 'χωρίς ίντερνετ: μόνο με βυθόμετρο',
  arrive: 'Άφιξη',
  arriveSub: '0,5 NM πριν από τον προορισμό',
  cruiseNote: 'Μόνο ειδοποιήσεις ασφάλειας, τουλάχιστον 60″ μεταξύ τους. Καμία ειδοποίηση μανούβρας στην αναψυχή.',
  trackTitle: 'Ίχνος',
  trackFixed: 'Αγώνας: κάθε 5″ · Προπόνηση: κάθε 15″',
  trackCruise: 'Αναψυχή',
  every: (s: number) => `κάθε ${s}″`,
  forgottenTitle: 'Ξεχασμένη έξοδος',
  forgottenText: 'Ρωτάμε «Τελείωσε;» όταν το σκάφος δεν κινείται 2 ώρες, και σε κάθε περίπτωση μετά από 24 ώρες.',
} as const;

/** Cruise v1 (P-036), as in the prototype `design/session-home-2026-11/`. */
export const CRUISE_TEXT = {
  whereTo: 'Πού πάμε;',
  saved: 'αποθηκευμένη',
  about: (nm: string) => `περίπου ${nm} NM`,
  aboutFromHere: (nm: string) => `περίπου ${nm} NM από εδώ`,
  at: (dur: string, kt: string) => ` · ~${dur} με ${kt} kt`,
  needsGps: 'η απόσταση φαίνεται με θέση GPS',
  recent: 'πρόσφατος',
  noDest: 'Χωρίς προορισμό',
  tapMap: 'Πάτα στον χάρτη',
  mapHint: 'Πάτα στη θάλασσα για τον προορισμό.',
  pointName: (hhmm: string) => `Σημείο ${hhmm}`,
  name: 'Όνομα',
  onLand: 'Το σημείο φαίνεται στη στεριά. Έλεγξέ το.',
  usePoint: 'Αυτός ο προορισμός',
  cancel: 'Άκυρο',
  setupNote: (sec: number, withDest: boolean) =>
    `Ίχνος κάθε ${sec}″, μένει μόνο στο κινητό. Η αναψυχή δεν μοιράζεται. Ειδοποιήσεις μόνο ασφάλειας: ρηχά και άφιξη${withDest ? '' : ' (άφιξη μόνο με προορισμό)'}.`,
  start: '● Έναρξη αναψυχής',
  // Live
  left: 'απομένουν',
  route: 'διαδρομή',
  eta: (hhmm: string, dur: string) => `ETA ${hhmm} · σε ${dur}`,
  etaWaitGps: 'ETA: περιμένει GPS',
  etaStill: 'ETA: —',
  etaPaused: 'σε παύση · η ETA παγώνει',
  noDestTitle: 'Χωρίς προορισμό',
  noDestSub: 'Βάλε έναν για απόσταση και ETA',
  set: 'Βάλε',
  change: 'Άλλαξε προορισμό',
  shallowHint: 'ρηχά: ειδοποίηση κάτω από 5 m',
  // Bar
  toward: (name: string) => `προς ${name}`,
  noDestSmall: 'χωρίς προορισμό',
  destSet: (name: string) => `Προορισμός: ${name}`,
  destCleared: 'Χωρίς προορισμό',
  // Map
  legendTrack: 'ίχνος',
  legendDest: 'προς προορισμό',
  legendShallow: 'ρηχά (5 m)',
  destLine: (name: string, nm: string, eta?: string) => `${name} · ${nm} NM${eta ? ` · ETA ${eta}` : ''}`,
  noGps: 'χωρίς GPS',
  depthHere: 'Βάθος εδώ',
  depthChart: (m: string) => `~${m} m (χάρτης)`,
  setDest: 'Βάλε προορισμό',
  notNav: 'Ενδεικτικό, όχι για ναυσιπλοΐα',
  // Summary
  duration: 'διάρκεια',
  distance: 'απόσταση',
  avg: 'μέση ταχύτητα',
  max: 'μέγιστη',
  arrival: 'άφιξη',
  track: 'ίχνος',
  private: 'Η αναψυχή δεν μοιράζεται. Το ίχνος μένει μόνο σε αυτό το κινητό.',
  gpx: 'Εξαγωγή GPX',
  noPauses: (t: string) => `Χωρίς τις παύσεις (${t}): δεν μετράνε στη διάρκεια, στα μίλια και στη μέση ταχύτητα.`,
} as const;

/** Training v1 and the pause (P-035, P-039), as in the prototype `design/session-home-2026-11/`. */
export const TRAINING_TEXT = {
  goalTitle: 'Τι δουλεύουμε',
  goalDefault: 'προεπιλογή',
  goalNote: 'Αλλάζει μόνο τι δείχνει μεγάλο στο Live και τι μπαίνει πρώτο στη σύνοψη.',
  share: 'Μοιράσου με το πλήρωμα',
  shareSetup: 'Τα μέλη βλέπουν τη σύνοψη και τις σημειώσεις, όχι το ίχνος',
  shareOff: 'Αν τη μοιραστείς, τα μέλη βλέπουν σύνοψη και σημειώσεις, όχι το ίχνος',
  shareOn: 'Κοινή: τα μέλη βλέπουν σύνοψη και σημειώσεις, όχι το ίχνος',
  shareNeedsCrew: 'Χρειάζεται σύνδεση και πλήρωμα στο σκάφος («Σκάφη» → «Πρόσκληση στο πλήρωμα»).',
  setupAlerts: (deg: number, starts: boolean, lay: boolean) =>
    `Ίχνος κάθε 15″. Ειδοποιήσεις: στροφή ανέμου από ${deg}°, απώλεια GPS${starts ? ', αντίστροφη μέτρηση εκκίνησης' : ''}${lay ? ', layline μόνο «τώρα»' : ''}. Το «κάτω από 90% του στόχου» ανοίγει από τις Ρυθμίσεις. Χωρίς αντιπάλους και διορθωμένο χρόνο.`,
  vmg: 'VMG',
  vmgAb: 'πρόοδος στον άνεμο',
  recovery: 'Ανάκαμψη στο 90%',
  last: (w: string) => `τελευταία ${w}`,
  overMax: '>1:30',
  start: 'Εκκίνηση',
  startAb: 'άσκηση εκκινήσεων',
  startIdle: 'πάτα με το σήμα της «επιτροπής»',
  startRunning: 'αντίστροφη μέτρηση',
  startGone: 'ΕΚΚΙΝΗΣΗ · ο γύρος ξεκίνησε',
  cdStart: '▶ Αντίστροφη 5′',
  cdRestart: '↺ Από 5′',
  cdSync: 'Συγχρ. λεπτού',
  lapBtn: (n: number, t: string) => `⏱ Γύρος ${n} · ${t}`,
  lapAria: (n: number, t: string) => `Νέος γύρος. Ο γύρος ${n} τρέχει ${t}`,
  undo: (s: number) => `↶ Αναίρεση (${s}″)`,
  noteNow: '✎ Σημείωση γύρου',
  noteFor: (n: number) => `✎ Σημείωση για τον γύρο ${n}`,
  lapsHint: 'Πάτα «Γύρος» από σημείο σε σημείο. Τα σκέλη (όρτσα, πλαγιοδρομία, πρίμα) βγαίνουν μόνα τους από τη γωνία ανέμου.',
  noteTitle: (n: number, t: string) => `Σημείωση · γύρος ${n} (${t})`,
  sail: 'Πανί',
  helm: 'Τιμονιέρης',
  trim: 'Τριμάρισμα',
  trimPh: 'π.χ. μπάρμπας +2 εκ., μαΐστρα πιο σφιχτή',
  done: 'Έτοιμο',
  pausedTitle: '⏸ Σε παύση',
  pausedText: 'Δεν καταγράφεται ίχνος και δεν βγαίνουν ειδοποιήσεις. Ο χρόνος της παύσης δεν μετράει στη διάρκεια, στα μίλια και στο % του στόχου.',
  resume: '▶ Συνέχεια',
  resumed: 'Συνέχεια · η καταγραφή ξανάρχισε',
  // Summary
  worked: 'Τι δουλέψαμε',
  noPauses: (t: string) => `Χωρίς τις παύσεις (${t}): δεν μετράνε στη διάρκεια, στα μίλια και στο % του στόχου.`,
  laps: 'Γύροι',
  oneLap: 'Ένας γύρος: όλη η προπόνηση.',
  bestLegend: '★ καλύτερος γύρος',
  pctCard: '% του στόχου ανά πλεύση και άνεμο',
  pctNote: 'Δεν μετράνε τα 25″ μετά από κάθε μανούβρα.',
  manCard: 'Μανούβρες',
  tacks: 'Αναστροφές',
  gybes: 'Υποσταυρώσεις',
  trackCard: 'Ίχνος',
  notNav: 'Ενδεικτικό, όχι για ναυσιπλοΐα',
  above95: 'πάνω από 95%',
  mid: '90–95%',
  below90: 'κάτω από 90%',
  lessons: 'Ανάλυση και μαθήματα',
  lessonsOffline: 'Χωρίς ίντερνετ: τα μαθήματα θα φτιαχτούν όταν επιστρέψει. Οι αριθμοί είναι έτοιμοι.',
  sharedPart: (hhmm: string) =>
    `Το κομμάτι της προπόνησης ως τις ${hhmm} είναι κοινό με το πλήρωμα (σύνοψη και σημειώσεις). Η αναψυχή δεν μοιράζεται. Το ίχνος μένει μόνο σε αυτό το κινητό.`,
  sharedTag: ' · κοινή με το πλήρωμα',
} as const;

/**
 * Manual wind inside a session (P-053): the final texts of design/manual-wind-2026-11/HANDOFF.md §7
 * (copywriter 17/11/2026), with their ids. ⟨…⟩ are filled in by the code.
 */
/**
 * Where the wind of the small Live labels comes from, in the card's words (W03/W04):
 * «TWA · άνεμος χειροκίνητα», «TWS kt · χειροκίνητα»; nothing for instruments or no wind.
 */
export function liveWindTags(from: 'manual' | 'instruments' | 'quick' | 'none'): { twa: string; tws: string } {
  if (from === 'manual') return { twa: ' · άνεμος χειροκίνητα', tws: ' · χειροκίνητα' };
  if (from === 'quick') return { twa: ' · άνεμος Γρήγορης ματιάς', tws: ' · Γρήγορη ματιά' };
  return { twa: '', tws: '' };
}

export const WIND_TEXT = {
  // Card and Live
  title: 'Άνεμος', // W01
  fromInst: 'όργανα', // W02
  fromQuick: 'από τη Γρήγορη ματιά', // W03
  manual: (age: string) => `χειροκίνητα · ${age}`, // W04
  check: ' · έλεγξέ τον', // W05
  change: 'Αλλαγή', // W06
  set: 'Βάλε', // W07
  tapToSet: 'Πάτα για να βάλεις άνεμο', // W08
  /** W09 */
  aria: (tws: string, twd: string, src: string, stale: boolean) => `Άνεμος: TWS ${tws} kt, TWD ${twd}, ${src}${stale ? ', παλιός, έλεγξέ τον' : ''}. Αλλαγή`,
  ariaInst: 'από τα όργανα',
  ariaQuick: 'από τη Γρήγορη ματιά',
  ariaManual: (ageWords: string) => `χειροκίνητα, ${ageWords}`,
  ariaNone: 'Άνεμος: κανένας. Βάλε άνεμο', // W09b
  manualStrip: 'Άνεμος χειροκίνητα: χωρίς ειδοποιήσεις στροφής ανέμου και «κάτω από 90%».', // L01
  noWindLead: 'Χωρίς άνεμο:', // L02 (bold part)
  noWindText: 'δεν υπάρχουν όργανα και δεν έχεις βάλει άνεμο. Δεν βγαίνουν στόχοι και %.', // L02
  setWind: 'Βάλε άνεμο', // L03
  needsWind: 'χρειάζεται άνεμο', // L04
  needsSog: 'χρειάζεται SOG 2,5 kt', // L05
  layManual: 'άνεμος χειροκίνητα · χωρίς πρόσπτωση/ρεύμα', // L06
  layStale: (age: string) => `άνεμος ${age} · χωρίς πρόσπτωση/ρεύμα`, // L07
  layForecast: 'άνεμος από την πρόγνωση', // L08
  // Sheet
  nowInst: 'Τώρα: από τα όργανα', // S02
  nowQuick: 'Τώρα: από τη Γρήγορη ματιά', // S03
  nowNone: 'Τώρα: χωρίς άνεμο', // S04
  sheetManual: (age: string) => `Χειροκίνητα · ${age}`, // S05
  instConnected: 'Όργανα συνδεδεμένα. Ο άνεμος μένει χειροκίνητος.', // S06
  fromInstPrefill: 'Αρχικές τιμές από τα όργανα. Διόρθωσέ τις.', // S07
  fromForecast: (hhmm: string) => `Αρχικές τιμές από την πρόγνωση των ${hhmm}. Διόρθωσέ τις.`, // S08
  emptyHint: 'Πάτα ± για να αλλάξεις. Η TWA βγαίνει από την πορεία GPS.', // S09
  twdLabel: 'TWD · από πού φυσάει', // S10 (+ «(°M)»)
  decl0: 'Απόκλιση 0°: σωστό; Στον Σαρωνικό είναι περίπου +5°. Άλλαξέ τη στις Ρυθμίσεις.', // S12
  twsLabel: 'TWS · ένταση αληθούς ανέμου', // S13 (+ «(kt)»)
  twsHint: 'Στην όρτσα νιώθεις περισσότερο (φαινόμενος άνεμος). Βάλε τον αληθή.', // S14
  use: 'Χρήση χειροκίνητου ανέμου', // S15
  onSession: 'Ανοιχτό: στόχοι και laylines με αυτόν τον άνεμο.', // S16
  onBasic: 'Ανοιχτό: η TWA βγαίνει από αυτόν τον άνεμο.', // S17
  ifOff: (to: string) => `Αν το κλείσεις: ${to}.`, // S18
  off: (to: string) => `Κλειστό: ${to}.`, // S19
  offToInst: 'άνεμος από τα όργανα',
  offToQuick: 'άνεμος από τη Γρήγορη ματιά',
  offToNone: 'χωρίς άνεμο',
  needValues: 'Βάλε TWD και TWS.', // S20
  twaHdg: (twa: string, side: string, hdg: string) => `TWA ${twa}° ${side} · από πλώρη οργάνων ${hdg}`, // S21
  twaCog: (twa: string, side: string, cog: string) => `TWA ${twa}° ${side} · από πορεία GPS ${cog}`, // S22
  twaHold: ' · τελευταία τιμή (κράτημα 30″)', // S23
  cogNote: 'Από την πορεία GPS: στην όρτσα η πραγματική TWA είναι περίπου 5° μικρότερη (πρόσπτωση, ρεύμα).', // S24
  twaNone: 'TWA: — · χρειάζεται πορεία GPS (SOG 2,5 kt και πάνω)', // S25
  help: 'Πώς βρίσκεις την TWD: στην όρτσα, ο μέσος όρος της πλώρης με δεξιές και με αριστερές. Ή, πριν από την εκκίνηση, πλώρη στον άνεμο και διάβασε την πυξίδα.', // S26
  stillValid: '✓ Ισχύει ακόμα', // S27
  done: 'Έτοιμο', // S28
  close: 'Κλείσιμο', // S29
  ariaTwd: (unit: string) => `TWD σε ${unit}, γράψε τιμή`, // S30
  ariaTws: 'TWS σε kt, γράψε τιμή', // S30
  stbd: 'δεξιές',
  port: 'αριστερές',
  // Messages and screen reader
  nOn: 'Χειροκίνητος άνεμος: ανοιχτός', // N01
  nOff: 'Χειροκίνητος άνεμος: κλειστός', // N02
  nInst: 'Ο άνεμος έρχεται ξανά από τα όργανα', // N03
  nValid: 'Ο άνεμος ισχύει ακόμα', // N04
  undo: 'Αναίρεση', // N05
  staleSay: 'Ο χειροκίνητος άνεμος μπήκε πριν από 15 λεπτά. Έλεγξέ τον.', // A04
} as const;
