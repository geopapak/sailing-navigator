/**
 * Greek texts of the in-session Live per kind and of the per-kind alert
 * settings (P-034), in one place so they are easy to find and move (P-041/P-042).
 * The wording follows the approved prototype `design/session-home-2026-11/`.
 */
export const LIVE_TEXT = {
  noInstRace: 'Χωρίς όργανα: ταχύτητα από GPS, άνεμος από το χειροκίνητο. Οι ειδοποιήσεις στροφής ανέμου είναι κλειστές.',
  noInstTraining:
    'Χωρίς όργανα: ταχύτητα από GPS, άνεμος χειροκίνητα. Τα νούμερα είναι ενδεικτικά λόγω ρεύματος. Η ειδοποίηση στροφής ανέμου είναι κλειστή.',
  indicative: 'ενδεικτικό',
  waitingSpeed: 'περιμένει ταχύτητα',
  pctTitle: '% του στόχου',
  pctMean: 'μέσος όρος 15″',
  speed: 'Ταχύτητα',
  windAngle: 'Γωνία ανέμου',
  target: 'στόχος',
  manualWind: 'χειροκίνητος άνεμος',
  manualShort: '(χειρ.)',
  leg: 'σκέλος',
  sogFromGps: 'SOG από GPS',
  sogGround: 'SOG · ως προς βυθό',
  course: 'πορεία',
  depth: 'Βάθος',
  depthSounder: 'βυθόμετρο',
  depthChart: 'από χάρτη · ενδεικτικό, όχι για ναυσιπλοΐα',
  weather: 'Καιρός',
  forecastOffline: (hhmm: string) => `Πρόγνωση από ${hhmm} (χωρίς ίντερνετ).`,
  stillOffline: (hhmm: string) => `Ακόμα χωρίς ίντερνετ. Κρατάμε την πρόγνωση των ${hhmm}`,
  noForecast: 'Δεν υπάρχει πρόγνωση για σήμερα.',
  noForecastOffline: 'Ακόμα χωρίς ίντερνετ. Δεν υπάρχει αποθηκευμένη πρόγνωση.',
  retry: 'Ξανά',
  toCruise: '⇄ Γίνε Βόλτα',
  toTraining: '⇄ Γίνε Προπόνηση',
  polarTrim: 'Polar και τριμάρισμα',
  targetsFor: (tws: string) => `Στόχοι για ${tws} κν`,
  wholePolar: 'Όλο το polar',
  sail: 'Πανί',
  trim: 'Τριμάρισμα',
  noPolar: 'Το σκάφος δεν έχει polars, άρα ούτε στόχους. Πρόσθεσε polars από Σκάφη → Επεξεργασία.',
  noWind: 'Χρειάζεται άνεμος: από τα όργανα ή χειροκίνητα στη Γρήγορη ματιά.',
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
    race: ['Ποια πλευρά ευνοείται ως την επόμενη σημαδούρα;', 'Πότε ανεβάζουμε μπαλόνι;'],
    training: ['Γιατί είμαι κάτω από τον στόχο;', 'Τι τριμάρισμα θέλει στους 14 κν;'],
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
  markSub: '1′ πριν, και ο τερματισμός',
  gps: 'Χάθηκε το GPS ή η καταγραφή',
  gpsQuick: 'Χάθηκε το GPS',
  gpsSub: 'για να μη μείνει τρύπα στο ίχνος',
  below: 'Κάτω από 90% του στόχου',
  belowSub: 'για πάνω από 30″ · κλειστό από προεπιλογή',
  belowNoInst: 'μόνο με όργανα: χωρίς αυτά το % είναι πολύ ενδεικτικό',
  layNow: 'Layline «τώρα»',
  layNowSub: 'μόνο όταν η προπόνηση έχει σημαδούρες',
  trainingBeepOnly: 'Στην προπόνηση ακούγεται μόνο μπιπ, χωρίς φωνή.',
  trainingNote: 'Τουλάχιστον 60″ ανάμεσα σε δύο ειδοποιήσεις. Χωρίς «σημαδούρα σε 1′» και χωρίς φωνή σε κάθε αναστροφή.',
  cruiseNone: 'Η βόλτα δεν έχει ειδοποιήσεις μανούβρας. Οι ειδοποιήσεις ασφάλειας (ρηχά, άφιξη) έρχονται σύντομα.',
} as const;
