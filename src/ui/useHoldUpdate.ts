import { useEffect, useId } from 'react';
import { setHold, type HoldKind } from '../pwa/update';

/**
 * P-043: while `active`, a waiting app update is not applied. `input` = unsaved
 * input («Ενημέρωση τώρα» asks first), `undo` = the 10″ undo after a session.
 */
export function useHoldUpdate(active: boolean, kind: HoldKind = 'input') {
  const id = useId();
  useEffect(() => {
    setHold(id, active, kind);
    return () => setHold(id, false);
  }, [id, active, kind]);
}
