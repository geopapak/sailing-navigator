import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRace } from './RaceContext';
import { askConfirm } from './Dialogs';
import {
  APPLY_DELAY_MS,
  applyUpdate,
  dismissUpdateCard,
  forceUpdateNow,
  getUpdateState,
  nowAction,
  requestUpdateNow,
  subscribeUpdate,
  updatePhase,
  type UpdatePhase,
} from '../pwa/update';
import { UPDATE_TEXT } from '../pwa/updateText';

/** While a version waits for 02:00, look at the clock this often (also on focus). */
const TICK_MS = 30_000;

/** The current update phase; re-evaluated as the clock passes 02:00. */
export function useUpdatePhase(): { phase: UpdatePhase; session: boolean } {
  const race = useRace();
  const s = useSyncExternalStore(subscribeUpdate, getUpdateState);
  const [now, setNow] = useState(() => Date.now());
  const waitingClock = s.ready && !s.critical && !s.requested && s.dueAt !== undefined && now < s.dueAt;
  useEffect(() => {
    if (!waitingClock) return;
    const tick = () => setNow(Date.now());
    const t = window.setInterval(tick, TICK_MS);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tick);
    };
  }, [waitingClock]);
  const session = !!race.session;
  const due = s.dueAt !== undefined && now >= s.dueAt;
  return { phase: updatePhase({ ...s, session, due }), session };
}

/**
 * P-043/P-044b: applies a waiting app version at 02:00 local time (critical: as
 * soon as the device is free), never during a session or over unsaved input.
 * When it applies: «Ενημερώνουμε την εφαρμογή…» for ~2,5″, then reload.
 */
export function AppUpdater() {
  const { phase } = useUpdatePhase();
  useEffect(() => {
    if (phase !== 'applying') return;
    const t = window.setTimeout(applyUpdate, APPLY_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [phase]);
  // While waiting: a card on Home (UpdateCard) or a line in the session strip (SessionBar).
  if (phase !== 'applying') return null;
  return (
    <div className="app-update applying" role="status" aria-live="polite">
      <span className="spin" aria-hidden="true" />
      {UPDATE_TEXT.applying}
    </div>
  );
}

/** «Ενημέρωση τώρα»: at once, after the session / undo, or after a confirm when unsaved input would be lost. */
export async function updateNow(session: boolean) {
  const s = getUpdateState();
  const a = nowAction({ session, inputHold: s.inputHold, hold: s.hold });
  if (a !== 'confirm') return requestUpdateNow();
  const ok = await askConfirm(UPDATE_TEXT.confirmLoss, { ok: UPDATE_TEXT.confirmOk, cancel: UPDATE_TEXT.confirmCancel });
  if (ok) forceUpdateNow();
}

/** P-044b: a small dismissible card on Home while a new version waits (outside a session). */
export function UpdateCard() {
  const { phase, session } = useUpdatePhase();
  const s = useSyncExternalStore(subscribeUpdate, getUpdateState);
  if (session || s.dismissed || (phase !== 'waiting' && phase !== 'deferred')) return null;
  const text = phase === 'waiting' ? UPDATE_TEXT.available : UPDATE_TEXT.heldOutside;
  return (
    <section className="card update-card" role="status">
      <span className="update-badge" aria-hidden="true">
        ↻
      </span>
      <p className="small">{text}</p>
      <button type="button" className="update-x" aria-label={UPDATE_TEXT.dismiss} onClick={dismissUpdateCard}>
        <span aria-hidden="true">✕</span>
      </button>
      {phase === 'waiting' && (
        <button type="button" className="btn small-btn update-now" onClick={() => void updateNow(session)}>
          {UPDATE_TEXT.now}
        </button>
      )}
    </section>
  );
}
