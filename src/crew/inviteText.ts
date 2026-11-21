/**
 * Texts of the crew invite before and after signing in (P-056 §Δ, sketch design/fixes-0.19.1/ frame 4).
 * The token is never part of a text.
 */
export const INVITE_TEXT = {
  title: 'Πρόσκληση στο πλήρωμα',
  hintTitle: 'Άνοιξες πρόσκληση πληρώματος',
  hintBody: 'Φτιάξε λογαριασμό ή συνδέσου. Μετά θα δεις ποιο σκάφος σε καλεί και θα αποφασίσεις αν θα μπεις.',
  offline: 'Χωρίς ίντερνετ. Η σύνδεση θέλει ίντερνετ· η πρόσκληση μένει για μετά.',
  notFound: 'Η πρόσκληση δεν βρέθηκε. Ίσως ο σύνδεσμος κόπηκε στο αντίγραφο. Ζήτα νέο σύνδεσμο από τον κυβερνήτη.',
  network: 'Δεν φορτώθηκε η πρόσκληση. Έλεγξε το ίντερνετ.',
  loading: 'Φόρτωση…',
  slow: 'Αργεί. Ξανά;',
  retry: 'Ξανά',
  home: 'Στην αρχική',
} as const;

/** After this long the preview says «Αργεί. Ξανά;». */
export const INVITE_SLOW_MS = 15_000;

/**
 * What the invite page says for a failed preview: 404 its own text, 410 the server's
 * («…έληξε. Ζήτα καινούργια.» / «…έχει ήδη χρησιμοποιηθεί…»), no answer the network text with «Ξανά».
 */
export function inviteError(e: { status?: number; message?: string }): { text: string; retry: boolean } {
  if (e.status === 404) return { text: INVITE_TEXT.notFound, retry: false };
  if (e.status === 410) return { text: e.message || INVITE_TEXT.notFound, retry: false };
  if (!e.status) return { text: INVITE_TEXT.network, retry: true };
  return { text: e.message || INVITE_TEXT.network, retry: true };
}
