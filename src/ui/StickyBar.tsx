import { useRef, type ReactNode } from 'react';
import { useOneRowSticky } from './hooks';

/**
 * The action bar of a form (P-056 §Ι): sticky at the bottom while its buttons are on one row; when
 * a word would not fit the buttons stack and the bar goes into the flow (class `flow`), never a cut word.
 */
export function StickyBar({ children, testId }: { children: ReactNode; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useOneRowSticky(ref);
  return (
    <div ref={ref} className="btn-row sticky-actions" data-testid={testId}>
      {children}
    </div>
  );
}
