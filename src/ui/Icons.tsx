/** Line icons drawn with currentColor, so they follow the theme (night mode stays red). */
const P = {
  live: 'M12 3v15M12 3l7 13H12M12 6 6 16h6M4 19h16l-2 2H6z',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  polar: 'M12 21a9 9 0 0 1 0-18M12 3v18M12 12l6-5M12 12h9',
  clock: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l3 2M10 2h4',
  boats: 'M4 6h16M4 12h16M4 18h16',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  dusk: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  // Sessions (P-033), from design/session-home-2026-11.
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  history: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  race: 'M5 21V4M5 4h12l-3 4 3 4H5',
  training: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 13V9M9 2h6',
  cruise: 'M12 3v13M12 4l7 11h-7M3 18h18l-2 3H5z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  // Manual wind (P-053), from design/manual-wind-2026-11. «warn» replaces the «⚠» emoji (red at night).
  warn: 'M12 3L2 21h20zM12 10v5M12 18v.01',
  pen: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  close: 'M6 6l12 12M18 6L6 18',
  // P-049 Φ-A (design/refresh-2026-11/HANDOFF-A.md §8): the emoji and arrows of buttons become lines.
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  'chev-down': 'M6 9l6 6 6-6',
  boat: 'M11 3v13H4zM13 6l6 10h-6zM3 18h18l-3 3H6z',
  check: 'M5 12l5 5 9-10',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 13V9M9 2h6',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  stop: 'M6 6h12v12H6z',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  rotate: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  swap: 'M7 7h13l-3-3M17 17H4l3 3',
  mute: 'M11 5L6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6',
  sound: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  lock: 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
} as const;

/** A small icon in front of a button's words (P-049 A16): the words stay the accessible name. */
export function BtnIcon({ name }: { name: IconName }) {
  return <Icon name={name} size="1.15em" stroke={2.2} className="bi" />;
}

export type IconName = keyof typeof P;

export function Icon({ name, size = 24, stroke = 2, className }: { name: IconName; size?: number | string; stroke?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name]} />
    </svg>
  );
}
