import { useEffect, useRef } from 'react';

/**
 * The header «←» of a setup screen (P-056 Σ1): a sub-screen open inside it (the preparation map,
 * the course editor) takes the back for itself, so «←» closes only the sub-screen and the form
 * keeps what was typed. The last one registered wins.
 */
const stack: { run: () => void }[] = [];

/** Runs the newest back handler; false when none is registered (the caller goes back itself). */
export function runBackOverride(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}

/** While `active`, the header «←» calls `fn` instead of leaving the screen. */
export function useBackOverride(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const entry = { run: () => ref.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
