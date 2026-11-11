/**
 * Manoeuvre alerts during a race (P-023), code only, no AI. Three kinds:
 * - layline: tack (upwind) or gybe (downwind) in 2′, 1′ and "now";
 * - wind shift over 7° in the 20″ mean (instruments only);
 * - mark or finish in 1′.
 * The engine is pure: give it the situation every few seconds, it returns at
 * most one alert to show. Everything is a suggestion; the skipper decides.
 */
export type AlertType = 'lay' | 'shift' | 'mark';
export type AlertKind = 'warn' | 'now' | 'info';
export type Lead = 120 | 60 | 6;

export interface AlertSettings {
  on: Record<AlertType, boolean>;
  /** Seconds before the layline: 2′, 1′ and "now". */
  leads: Record<Lead, boolean>;
  sound: 'beep' | 'voice' | 'off';
  vibrate: boolean;
  /** Least seconds between two alerts ("now" and marks always pass). */
  gapSec: 20 | 30 | 60;
  /** Labels: Greek (default, per glossary) or the English loan words. */
  words: 'gr' | 'slang';
}

export const DEFAULT_ALERTS: AlertSettings = {
  on: { lay: true, shift: true, mark: true },
  leads: { 120: true, 60: true, 6: true },
  sound: 'beep',
  vibrate: true,
  gapSec: 30,
  words: 'gr',
};

export interface Alert {
  key: string;
  type: AlertType;
  kind: AlertKind;
  /** Big line, upper case, e.g. "ΑΝΑΣΤΡΟΦΗ σε 1′". */
  big: string;
  sub: string;
  /** Short spoken text (Greek). */
  say: string;
  at: number;
}

export interface Situation {
  now: number;
  /** Index of the mark we sail to (resets layline alerts when it changes). */
  markIndex: number;
  markName: string;
  isFinish: boolean;
  leg?: 'up' | 'down' | 'reach';
  /** Board we are on now. */
  board?: 'stbd' | 'port';
  /** Seconds to the layline on this board (undefined: not ahead). */
  layInSec?: number;
  /** Seconds to the mark at the current speed. */
  markInSec?: number;
  /** 20″ mean true wind direction from the instruments (undefined without instruments). */
  instTwd?: number;
}

export interface EngineState {
  fired: Set<string>;
  last: number;
  refTwd?: number;
  muteUntil: number;
}

export const newEngine = (): EngineState => ({ fired: new Set(), last: -Infinity, muteUntil: 0 });

const LEADS: Lead[] = [120, 60, 6];
export const SHIFT_DEG = 7;

export function words(s: AlertSettings) {
  return s.words === 'slang'
    ? { tack: 'τακ', gybe: 'τζάιμπ', TACK: 'ΤΑΚ', GYBE: 'ΤΖΑΪΜΠ' }
    : { tack: 'αναστροφή', gybe: 'υποσταύρωση', TACK: 'ΑΝΑΣΤΡΟΦΗ', GYBE: 'ΥΠΟΣΤΑΥΡΩΣΗ' };
}

const boardGen = (b: 'stbd' | 'port') => (b === 'stbd' ? 'δεξιών' : 'αριστερών');
const diff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** One step of the engine; returns the alert to show now, if any. */
export function step(st: EngineState, s: AlertSettings, x: Situation): Alert | undefined {
  const w = words(s);
  const out: Alert[] = [];

  // 1. Layline.
  if (s.on.lay && x.layInSec !== undefined && x.leg && x.leg !== 'reach' && x.board) {
    const reached = [...LEADS].reverse().find((l) => x.layInSec! <= l);
    if (reached !== undefined) {
      const k = (l: Lead) => `lay-${x.markIndex}-${x.board}-${l}`;
      // Earlier leads that we skipped (e.g. started inside 1′) do not fire afterwards.
      for (const l of LEADS) if (l > reached) st.fired.add(k(l));
      if (!st.fired.has(k(reached))) {
        if (!s.leads[reached]) st.fired.add(k(reached));
        else {
          const up = x.leg === 'up';
          const word = up ? w.TACK : w.GYBE;
          const w2 = up ? w.tack : w.gybe;
          const other = boardGen(x.board === 'stbd' ? 'port' : 'stbd');
          const when = reached === 6 ? 'ΤΩΡΑ' : reached === 120 ? 'σε 2′' : 'σε 1′';
          out.push({
            key: k(reached),
            type: 'lay',
            kind: reached === 6 ? 'now' : 'warn',
            big: `${word} ${when}`,
            sub: `Layline ${other} για ${x.isFinish ? 'τον τερματισμό' : x.markName} · πρόταση`,
            say: reached === 6 ? `${cap(w2)} τώρα` : `${cap(w2)} σε ${reached === 120 ? 'δύο λεπτά' : 'ένα λεπτό'}`,
            at: x.now,
          });
        }
      }
    }
  }

  // 2. Wind shift (instruments only).
  if (x.instTwd !== undefined) {
    if (st.refTwd === undefined) st.refTwd = x.instTwd;
    const d = diff(x.instTwd, st.refTwd);
    if (Math.abs(d) >= SHIFT_DEG) {
      st.refTwd = x.instTwd;
      if (s.on.shift) {
        // Header: the wind comes more from ahead on our board (upwind).
        const header = x.leg === 'up' && x.board !== undefined && ((x.board === 'stbd' && d < 0) || (x.board === 'port' && d > 0));
        const n = Math.round(Math.abs(d));
        out.push({
          key: `shift-${x.now}`,
          type: 'shift',
          kind: header ? 'warn' : 'info',
          big: `ΣΤΡΟΦΗ ΑΝΕΜΟΥ ${n}°`,
          sub: header ? `Δυσμενής, σε κατεβάζει · πρόταση: ${w.tack}` : 'Ευνοϊκή ή ουδέτερη · μείνε στο ίδιο σκέλος',
          say: header ? `Δυσμενής στροφή ανέμου ${n} μοίρες. Σκέψου ${w.tack}.` : `Στροφή ανέμου ${n} μοίρες.`,
          at: x.now,
        });
      }
    }
  } else st.refTwd = undefined;

  // 3. Mark or finish in 1′.
  if (s.on.mark && x.markInSec !== undefined && x.markInSec <= 60) {
    const key = `mk-${x.markIndex}`;
    if (!st.fired.has(key)) {
      out.push(
        x.isFinish
          ? { key, type: 'mark', kind: 'info', big: 'ΤΕΡΜΑΤΙΣΜΟΣ σε 1′', sub: 'Η γραμμή είναι μπροστά · κράτα την πορεία', say: 'Τερματισμός σε ένα λεπτό.', at: x.now }
          : { key, type: 'mark', kind: 'info', big: 'ΣΗΜΑΔΟΥΡΑ σε 1′', sub: `${x.markName} · ετοίμασε την επόμενη μανούβρα`, say: 'Σημαδούρα σε ένα λεπτό.', at: x.now },
      );
    }
  }

  // Most urgent first; the rest are dropped (and marked as done).
  const order: AlertKind[] = ['now', 'warn', 'info'];
  out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  let shown: Alert | undefined;
  for (const a of out) {
    st.fired.add(a.key);
    if (shown) continue;
    const always = a.kind === 'now' || a.type === 'mark';
    if (!always && x.now - st.last < s.gapSec * 1000) continue;
    shown = a;
  }
  if (shown) st.last = x.now;
  return shown;
}

export const isMuted = (st: EngineState, now: number) => now < st.muteUntil;
export const MUTE_MS = 5 * 60_000;

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
