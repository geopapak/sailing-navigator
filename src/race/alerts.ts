import type { SessionKind } from './types';

/**
 * Manoeuvre alerts during a session (P-023, per kind since P-034), code only, no AI.
 * - race: layline (2′, 1′, "now"), wind shift (5/7/10°, instruments only), mark or finish in 1′;
 * - training: wind shift (7/10/15°), GPS lost, layline "now" only, below 90% of target
 *   (off by default, instruments only); at least 60″ between two alerts, except the layline
 *   "now" (10″, dropped after 15″ of waiting); beep only;
 * - cruise: none yet (shallow water and arrival come in Φ4).
 * The engine is pure: give it the situation every few seconds and the kind's
 * profile, it returns at most one alert to show. Everything is a suggestion; the skipper decides.
 */
export type RaceAlertType = 'lay' | 'shift' | 'mark';
export type AlertType = RaceAlertType | 'gps' | 'below' | 'shallow' | 'arrive';
export type AlertKind = 'warn' | 'now' | 'info';
export type Lead = 120 | 60 | 6;

export interface AlertSettings {
  /** Race alerts switched on. */
  on: Record<RaceAlertType, boolean>;
  /** Seconds before the layline: 2′, 1′ and "now". */
  leads: Record<Lead, boolean>;
  sound: 'beep' | 'voice' | 'off';
  /** Beep loudness (P-033 quick settings): «Χαμηλά» / «Δυνατά». «Σίγαση» is `sound: 'off'`. */
  volume: 'low' | 'high';
  /** What «Σίγαση» silenced, so unmuting brings it back (e.g. the voice). */
  soundBeforeMute?: 'beep' | 'voice';
  vibrate: boolean;
  /** Least seconds between two race alerts ("now" and marks always pass). */
  gapSec: 20 | 30 | 60;
  /** Labels: Greek (default, per glossary) or the English loan words. */
  words: 'gr' | 'slang';
}

export const DEFAULT_ALERTS: AlertSettings = {
  on: { lay: true, shift: true, mark: true },
  leads: { 120: true, 60: true, 6: true },
  sound: 'beep',
  volume: 'high',
  vibrate: true,
  gapSec: 30,
  words: 'gr',
};

/** Wind shift thresholds offered per kind (P-034). */
export const RACE_SHIFT_DEGS = [5, 7, 10] as const;
export const TRAINING_SHIFT_DEGS = [7, 10, 15] as const;
export type RaceShiftDeg = (typeof RACE_SHIFT_DEGS)[number];
export type TrainingShiftDeg = (typeof TRAINING_SHIFT_DEGS)[number];

/** Training alerts (P-034). `startCountdown` is used by the «Εκκινήσεις» goal (Φ3). */
export interface TrainingAlerts {
  shift: boolean;
  shiftDeg: TrainingShiftDeg;
  gps: boolean;
  below90: boolean;
  layNow: boolean;
  startCountdown: boolean;
}

export const DEFAULT_TRAINING_ALERTS: TrainingAlerts = { shift: true, shiftDeg: 10, gps: true, below90: false, layNow: true, startCountdown: true };

/** Cruise safety alerts (used from Φ4). */
export interface CruiseAlerts {
  shallow: boolean;
  arrive: boolean;
}

export const DEFAULT_CRUISE_ALERTS: CruiseAlerts = { shallow: true, arrive: true };

/** The alert settings of every kind, as kept in the app settings. */
export interface KindAlertSettings {
  alerts: AlertSettings;
  raceShiftDeg: RaceShiftDeg;
  training: TrainingAlerts;
  cruiseAlerts: CruiseAlerts;
}

/** What the engine may do for one kind of session. */
export interface AlertProfile {
  kind: SessionKind;
  types: AlertType[];
  shiftDeg: number;
  /** Layline leads that fire. */
  layLeads: Lead[];
  minGapSec: number;
  /** No exception to the gap, not even "now" or the mark. */
  strictGap: boolean;
  /** Spoken words allowed (training: beep only). */
  voice: boolean;
}

const LEADS: Lead[] = [120, 60, 6];
/** Default race wind shift threshold (degrees). */
export const SHIFT_DEG = 7;
/** Training: at least this many seconds between two alerts. */
export const TRAINING_GAP_SEC = 60;
/** Training: «κάτω από 90%» when the 15″ mean stays below this percent … */
export const BELOW_PCT = 90;
/** … for more than this many seconds. */
export const BELOW_SEC = 30;
/** Training layline "now": passes the 60″ gap but keeps at least this many seconds after the last alert … */
export const LAY_NOW_GAP_SEC = 10;
/** … and is dropped when it has waited longer than this. */
export const LAY_NOW_MAX_AGE_SEC = 15;

/** Race profile from the race switches; the threshold defaults to today's 7°. */
export function raceProfile(s: AlertSettings, shiftDeg: number = SHIFT_DEG): AlertProfile {
  return {
    kind: 'race',
    types: (['lay', 'shift', 'mark'] as const).filter((t) => s.on[t]),
    shiftDeg,
    layLeads: LEADS.filter((l) => s.leads[l]),
    minGapSec: s.gapSec,
    strictGap: false,
    voice: true,
  };
}

/** The alert profile of a session kind (P-034). */
export function profileFor(kind: SessionKind, s: KindAlertSettings): AlertProfile {
  if (kind === 'race') return raceProfile(s.alerts, s.raceShiftDeg ?? SHIFT_DEG);
  if (kind === 'training') {
    const t = { ...DEFAULT_TRAINING_ALERTS, ...(s.training ?? {}) };
    const types: AlertType[] = [];
    if (t.shift) types.push('shift');
    if (t.gps) types.push('gps');
    if (t.layNow) types.push('lay');
    if (t.below90) types.push('below');
    return { kind, types, shiftDeg: t.shiftDeg, layLeads: [6], minGapSec: TRAINING_GAP_SEC, strictGap: true, voice: false };
  }
  // Cruise: shallow water and arrival come in Φ4; no manoeuvre alerts ever.
  return { kind, types: [], shiftDeg: Infinity, layLeads: [], minGapSec: TRAINING_GAP_SEC, strictGap: true, voice: false };
}

/** How to sound an alert under a profile: a profile without voice turns «Μπιπ + φωνή» into a beep. */
export function soundFor(p: Pick<AlertProfile, 'voice'>, sound: AlertSettings['sound']): AlertSettings['sound'] {
  return sound === 'voice' && !p.voice ? 'beep' : sound;
}

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
  /** Recording waits for a position or has stalled (training «ΧΑΘΗΚΕ ΤΟ GPS»). */
  gpsLost?: boolean;
  /** 15″ mean of the speed as % of target (training). */
  pct15?: number;
  /** Wind and speed come from the boat's instruments («κάτω από 90%» needs them). */
  instruments?: boolean;
}

export interface EngineState {
  fired: Set<string>;
  last: number;
  refTwd?: number;
  muteUntil: number;
  /** Key of the current GPS loss, while it lasts. */
  gpsKey?: string;
  /** Since when the 15″ mean has been below 90%. */
  belowSince?: number;
  /** First time a held-back alert was due (training layline "now"). */
  heldSince: Map<string, number>;
}

export const newEngine = (): EngineState => ({ fired: new Set(), last: -Infinity, muteUntil: 0, heldSince: new Map() });

export function words(s: AlertSettings) {
  return s.words === 'slang'
    ? { tack: 'τακ', gybe: 'τζάιμπ', TACK: 'ΤΑΚ', GYBE: 'ΤΖΑΪΜΠ' }
    : { tack: 'αναστροφή', gybe: 'υποσταύρωση', TACK: 'ΑΝΑΣΤΡΟΦΗ', GYBE: 'ΥΠΟΣΤΑΥΡΩΣΗ' };
}

const boardGen = (b: 'stbd' | 'port') => (b === 'stbd' ? 'δεξιών' : 'αριστερών');
const diff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/** One step of the engine; returns the alert to show now, if any. */
export function step(st: EngineState, s: AlertSettings, x: Situation, p: AlertProfile = raceProfile(s)): Alert | undefined {
  const w = words(s);
  const has = (t: AlertType) => p.types.includes(t);
  const training = p.kind === 'training';
  const out: Alert[] = [];

  // 1. Layline.
  if (has('lay') && x.layInSec !== undefined && x.leg && x.leg !== 'reach' && x.board) {
    const reached = [...LEADS].reverse().find((l) => x.layInSec! <= l);
    if (reached !== undefined) {
      const k = (l: Lead) => `lay-${x.markIndex}-${x.board}-${l}`;
      // Earlier leads that we skipped (e.g. started inside 1′) do not fire afterwards.
      for (const l of LEADS) if (l > reached) st.fired.add(k(l));
      if (!st.fired.has(k(reached))) {
        if (!p.layLeads.includes(reached)) st.fired.add(k(reached));
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
            big: training ? 'LAYLINE ΤΩΡΑ' : `${word} ${when}`,
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
    if (Math.abs(d) >= p.shiftDeg) {
      st.refTwd = x.instTwd;
      if (has('shift')) {
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
  if (has('mark') && x.markInSec !== undefined && x.markInSec <= 60) {
    const key = `mk-${x.markIndex}`;
    if (!st.fired.has(key)) {
      out.push(
        x.isFinish
          ? { key, type: 'mark', kind: 'info', big: 'ΤΕΡΜΑΤΙΣΜΟΣ σε 1′', sub: 'Η γραμμή είναι μπροστά · κράτα την πορεία', say: 'Τερματισμός σε ένα λεπτό.', at: x.now }
          : { key, type: 'mark', kind: 'info', big: 'ΣΗΜΑΔΟΥΡΑ σε 1′', sub: `${x.markName} · ετοίμασε την επόμενη μανούβρα`, say: 'Σημαδούρα σε ένα λεπτό.', at: x.now },
      );
    }
  }

  // 4. GPS lost (training): once per loss.
  if (x.gpsLost) {
    st.gpsKey ??= `gps-${x.now}`;
    if (has('gps') && !st.fired.has(st.gpsKey))
      out.push({ key: st.gpsKey, type: 'gps', kind: 'now', big: 'ΧΑΘΗΚΕ ΤΟ GPS', sub: 'Η καταγραφή περιμένει θέση · κράτα την οθόνη ανοιχτή', say: 'Χάθηκε το GPS.', at: x.now });
  } else st.gpsKey = undefined;

  // 5. Below 90% of target for more than 30″ (training, off by default): once per stretch.
  // Only with instruments: with GPS speed and manual or forecast wind the % is too rough.
  if (x.instruments === true && x.pct15 !== undefined && x.pct15 < BELOW_PCT) {
    st.belowSince ??= x.now;
    const sec = (x.now - st.belowSince) / 1000;
    const key = `below-${st.belowSince}`;
    if (has('below') && sec > BELOW_SEC && !st.fired.has(key))
      out.push({
        key,
        type: 'below',
        kind: 'warn',
        big: `ΚΑΤΩ ΑΠΟ ${BELOW_PCT}%`,
        sub: `${Math.round(x.pct15)}% του στόχου για ${Math.round(sec)}″`,
        say: 'Κάτω από ενενήντα τοις εκατό του στόχου.',
        at: x.now,
      });
  } else st.belowSince = undefined;

  // Most urgent first. Race: the rest are dropped (and marked as done); "now" and the mark
  // pass the gap. Strict (training): no exception, and a held-back alert may come later.
  const order: AlertKind[] = ['now', 'warn', 'info'];
  out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  let shown: Alert | undefined;
  for (const a of out) {
    const always = !p.strictGap && (a.kind === 'now' || a.type === 'mark');
    // Strict (training): the layline "now" needs only a short gap, and is dropped once stale.
    const layNow = p.strictGap && a.type === 'lay' && a.kind === 'now';
    if (layNow) {
      const since = st.heldSince.get(a.key) ?? x.now;
      st.heldSince.set(a.key, since);
      if (x.now - since > LAY_NOW_MAX_AGE_SEC * 1000) {
        st.fired.add(a.key);
        continue;
      }
    }
    const gap = (layNow ? LAY_NOW_GAP_SEC : p.minGapSec) * 1000;
    const held = !!shown || (!always && x.now - st.last < gap);
    if (!held) shown = a;
    if (!held || !p.strictGap) st.fired.add(a.key);
  }
  if (shown) st.last = x.now;
  return shown;
}

export const isMuted = (st: EngineState, now: number) => now < st.muteUntil;
export const MUTE_MS = 5 * 60_000;

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
