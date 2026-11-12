import { useEffect, useId } from 'react';
import { setHold } from '../pwa/update';

/** P-043: while `active`, a waiting app update is not applied (unsaved input, undo…). */
export function useHoldUpdate(active: boolean) {
  const id = useId();
  useEffect(() => {
    setHold(id, active);
    return () => setHold(id, false);
  }, [id, active]);
}
