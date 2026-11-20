import type { Theme } from './settings';

/**
 * The browser bar colour (`<meta name="theme-color">`, P-049 §7), from the theme value itself so it
 * never reads the previous theme's CSS: the light top bar outside a session (Μέρα `--surface`,
 * Σούρουπο `--bg`, Νύχτα black), the session bar's colour while recording.
 */
export function themeColor(theme: Theme, inSession: boolean): string {
  if (theme === 'night') return '#000000';
  if (inSession) return theme === 'dark' ? '#7cb4ff' : '#0b2a4a';
  return theme === 'dark' ? '#0b1220' : '#f2f4f7';
}
