/**
 * Every Greek text about app updates (P-043, P-044b), in one place for the
 * copywriter / i18n work (P-041, P-042).
 */
export const UPDATE_TEXT = {
  /** Home card while a new version waits for 02:00. */
  available: 'Νέα έκδοση διαθέσιμη — θα ενημερωθεί αυτόματα στις 02:00 (τοπική ώρα)',
  /** Home card when the version is due (02:00 passed, critical or «τώρα») but a form or the 10″ undo holds it. */
  heldOutside: 'Νέα έκδοση — θα ενημερωθεί μόλις τελειώσεις αυτό που κάνεις',
  /** Button on the Home card. */
  now: 'Ενημέρωση τώρα',
  /** Accessible label of the card's close button. */
  dismiss: 'Απόκρυψη μηνύματος ενημέρωσης',
  /** Asked before «Ενημέρωση τώρα» when only unsaved input holds the update. */
  confirmLoss: 'Θα χαθούν όσα δεν αποθήκευσες. Ενημέρωση τώρα;',
  confirmOk: 'Ενημέρωση',
  confirmCancel: 'Όχι τώρα',
  /** Session strip: waiting for 02:00. */
  sessionWaiting: 'Νέα έκδοση — θα ενημερωθεί στις 02:00',
  /** Session strip: due (02:00 passed, critical or «τώρα»), waits for the end of the session. */
  sessionAfter: 'Νέα έκδοση — θα ενημερωθεί όταν τελειώσει η έξοδος',
  /** The 2,5″ banner right before the reload. */
  applying: 'Ενημερώνουμε την εφαρμογή…',
} as const;
