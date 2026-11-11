import { describe, expect, it } from 'vitest';
import { KNOWLEDGE } from './knowledge';

/** Sailing facts the advisor must not get backwards (reviewed by the team's sailor). */
describe('advisor knowledge', () => {
  it('reads jib telltales the right way round', () => {
    expect(KNOWLEDGE).toContain('αν η μέσα (προσήνεμη) σηκώνεται/τρεμοπαίζει → είσαι πολύ ψηλά ή η σκότα είναι πολύ λάσκα· πέσε λίγο (πρίμα) ή σφίξε');
    expect(KNOWLEDGE).toContain('Αν η έξω (υπήνεμη) πέφτει/στροβιλίζεται → είσαι πολύ χαμηλά ή η σκότα είναι πολύ σφιχτή· όρτσα λίγο ή λάσκα');
  });

  it('states rule 14 exoneration only for the right-of-way boat', () => {
    expect(KNOWLEDGE).toContain('απαλλάσσεται για παράβαση του 14 αν η επαφή δεν προκάλεσε ζημιά ή τραυματισμό');
    expect(KNOWLEDGE).not.toContain('Τιμωρείται μόνο αν η επαφή προκάλεσε ζημιά');
  });

  it('lists the rule 18 exceptions and the 6 m protest flag', () => {
    expect(KNOWLEDGE).toMatch(/σκάφος που πλησιάζει και σκάφος που απομακρύνεται/);
    expect(KNOWLEDGE).toContain('μήκος 6 m ή περισσότερο');
  });

  it('describes ToT/ToD without claiming ToT favours fast boats in slow races', () => {
    expect(KNOWLEDGE).not.toContain('Ευνοεί τα ταχύτερα σκάφη όταν ο αγώνας είναι αργός');
    expect(KNOWLEDGE).toMatch(/ToD.*σε πολύ ελαφρύ άνεμο αδικεί τα μικρά\/αργά σκάφη/s);
  });

  it('puts dirty air to leeward of the other boat', () => {
    expect(KNOWLEDGE).not.toContain('προσήνεμη σκιά');
    expect(KNOWLEDGE).toContain('υπήνεμα και πίσω του');
  });
});
