import { useEffect, useSyncExternalStore } from 'react';
import { useRace } from './RaceContext';
import { APPLY_DELAY_MS, applyUpdate, getUpdateState, subscribeUpdate, updatePhase } from '../pwa/update';

/**
 * P-043: applies a waiting app version only when no session runs. With no
 * session or unsaved input: «Ενημερώνουμε την εφαρμογή…» for ~2,5″, then reload.
 * During a session: a one-line note in the session strip, and the update right after it ends.
 */
export function AppUpdater() {
  const race = useRace();
  const s = useSyncExternalStore(subscribeUpdate, getUpdateState);
  const phase = updatePhase(s.ready, !!race.session || s.hold);
  useEffect(() => {
    if (phase !== 'applying') return;
    const t = window.setTimeout(applyUpdate, APPLY_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [phase]);
  // While waiting, the session strip shows a one-line note (SessionBar); nothing floats over the screen.
  if (phase !== 'applying') return null;
  return (
    <div className="app-update applying" role="status" aria-live="polite">
      <span className="spin" aria-hidden="true" />
      Ενημερώνουμε την εφαρμογή…
    </div>
  );
}
