import type { Course } from '../../../src/boat/store';

/** Three made-up marks off Faliro (synthetic coordinates, open water). */
export const COURSE: Course = {
  id: 'e2e-course-saronic',
  name: 'Δοκιμαστική Σαρωνικού',
  marks: [
    { id: 'm1', name: 'Εκκίνηση', lat: 37.9, lon: 23.66 },
    { id: 'm2', name: 'Πάνω σημαδούρα', lat: 37.93, lon: 23.67 },
    { id: 'm3', name: 'Τερματισμός', lat: 37.9, lon: 23.65 },
  ],
  updatedAt: 1_763_000_000_000,
};

export const LONG_RACE_NAME = 'Ιστιοπλοϊκός Αγώνας Ανοιχτής Θαλάσσης Σαρωνικού – Φθινοπωρινό Κύπελλο';
