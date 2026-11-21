import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the tour writes (outside git by default). */
export const tourOut = () => process.env.TOUR_OUT || resolve(fileURLToPath(new URL('.', import.meta.url)), '../.out/tour');
