import type { ChatResponse } from '../../../src/ai/chat';

/** Fixed lessons for /analysis (never a real AI call). */
export const LESSONS = {
  lessons: [
    { text: 'Δοκιμαστικό μάθημα 1: κράτα σταθερή γωνία στην όρτσα.', impact: 'μεσαίο' },
    { text: 'Δοκιμαστικό μάθημα 2: πιο γρήγορες αναστροφές.' },
  ],
  model: 'e2e-fixture',
};

export const CHAT_REPLY: ChatResponse = {
  text: 'Δοκιμαστική απάντηση συμβούλου: μείνε στη δεξιά πλευρά.',
  model: 'e2e-fixture',
  fallback: false,
  tools: [],
  sources: [],
};

export const ADVICE_REPLY = {
  reply: { summary: 'Δοκιμαστική συμβουλή.', actions: [] },
  model: 'e2e-fixture',
};
