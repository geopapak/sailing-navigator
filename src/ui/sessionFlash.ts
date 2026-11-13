/** A short line in the session strip («Γύρος 2: 6:28», «Παύση · δεν καταγράφεται»), from anywhere. */
export const SESSION_FLASH = 'session-flash';
export const flashSession = (msg: string) => window.dispatchEvent(new CustomEvent<string>(SESSION_FLASH, { detail: msg }));
