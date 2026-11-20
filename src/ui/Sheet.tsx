import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSheetMode, type SheetMode } from './hooks';
import { Icon } from './Icons';

/**
 * One frame for every sheet and dialog of the app (P-049 A17–A19, design/refresh-2026-11/HANDOFF-A.md §6).
 *
 * - `kind="sheet"`: the shape comes from `useSheetMode()` (bottom < 34em, centred, side panel on wide
 *   or low landscape screens). Bottom / centre are modal (scrim, Tab trap, tap outside closes);
 *   the side panel is not (no scrim, the content makes room, closed by ✕ / its buttons / Escape).
 * - `kind="confirm"`: a question that needs an answer, always in the middle with the scrim, closed only
 *   by its buttons or Escape (= «Άκυρο»), never by a tap outside.
 *
 * The shape changes on rotation or a new text size without unmounting the children (A19): the
 * same two elements stay, only their classes change. Only the top sheet reacts to Escape, and a new
 * `sheet` closes the one already open (A18; a confirm may stand over a sheet).
 */

export type SheetKind = 'sheet' | 'confirm';

export interface SheetFrameProps {
  /** Visible title (h3 in the head, focused when the sheet opens). */
  title?: React.ReactNode;
  /** Accessible name; kept as an alias of `title` for the older sheets. */
  label?: string;
  onClose: () => void;
  kind?: SheetKind;
  testId?: string;
  /** Sticky buttons at the bottom. */
  footer?: React.ReactNode;
  /** Overrides `useSheetMode()` (e.g. the result sheet stays centred instead of a side panel). */
  mode?: SheetMode;
  className?: string;
  /** The sheet draws its own head (no shared head, no handle); its title has this id. */
  labelledBy?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  /** «Κλείσιμο» unless set. */
  closeLabel?: string;
  /** false: Escape does nothing and there is no ✕ (the finish question, P-040 AC 18). */
  dismissable?: boolean;
  /** Where the focus goes when the sheet closes and its opener is gone. */
  returnFocus?: () => HTMLElement | null | undefined;
  /** Extra class on the scrim (e.g. `finish-backdrop`, which stands over everything). */
  backdropClassName?: string;
  /** The element to focus on open instead of the title (e.g. «Ναι» of a confirm). */
  initialFocus?: React.RefObject<HTMLElement>;
}

interface Open {
  id: number;
  kind: SheetKind;
  close: () => void;
}
const stack: Open[] = [];
let seq = 0;

/** Counts the open sheets per root class, so two sheets do not remove each other's class. */
const rootCount: Record<string, number> = {};
function rootClass(name: string, on: boolean) {
  rootCount[name] = Math.max(0, (rootCount[name] ?? 0) + (on ? 1 : -1));
  document.documentElement.classList.toggle(name, rootCount[name] > 0);
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function SheetFrame({
  title,
  label,
  onClose,
  kind = 'sheet',
  testId,
  footer,
  mode: forced,
  className,
  labelledBy,
  style,
  children,
  closeLabel = 'Κλείσιμο',
  dismissable = true,
  returnFocus,
  backdropClassName,
  initialFocus,
}: SheetFrameProps) {
  const auto = useSheetMode();
  const confirm = kind === 'confirm';
  const mode: SheetMode = forced ?? auto;
  const side = !confirm && mode === 'side';
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const ownHead = !!labelledBy;
  const heading = title ?? label;
  const showHead = !ownHead && heading !== undefined;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const idRef = useRef(0);

  // Open: on the stack (a new sheet closes the open one), focus on the title; close: focus back.
  useEffect(() => {
    const id = ++seq;
    idRef.current = id;
    if (kind === 'sheet') for (const o of stack.filter((x) => x.kind === 'sheet')) o.close();
    stack.push({ id, kind, close: () => closeRef.current() });
    const opener = document.activeElement as HTMLElement | null;
    (initialFocus?.current ?? titleRef.current ?? ref.current)?.focus({ preventScroll: true });
    return () => {
      const i = stack.findIndex((x) => x.id === id);
      if (i >= 0) stack.splice(i, 1);
      const back = opener && opener.isConnected && opener !== document.body ? opener : returnFocus?.();
      back?.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1]?.id !== idRef.current) return;
      e.preventDefault();
      if (dismissable) closeRef.current();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [dismissable]);

  // The snack moves clear of a modal sheet; the content makes room for a side panel.
  useLayoutEffect(() => {
    const name = side ? 'side-open' : 'sheet-open';
    rootClass(name, true);
    return () => rootClass(name, false);
  }, [side]);

  // Side panel: under the top / session bar (and the recording strip), above a bottom tab bar.
  const [edges, setEdges] = useState<{ top: number; bottom: number }>();
  useLayoutEffect(() => {
    if (!side) return setEdges(undefined);
    const measure = () => {
      const top = [...document.querySelectorAll('.sbar, .topbar, [data-testid="session-strip"]')].reduce((m, el) => Math.max(m, el.getBoundingClientRect().bottom), 0);
      const tabs = document.querySelector('.tabbar')?.getBoundingClientRect();
      // A side rail (A11) starts at the top and leaves the bottom free.
      const bottom = tabs && tabs.top > 0 ? Math.max(0, window.innerHeight - tabs.top) : 0;
      setEdges({ top: Math.max(0, top), bottom });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [side]);

  const trap = !side;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!trap || e.key !== 'Tab' || !ref.current) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!f.length) return;
    const [first, last] = [f[0], f[f.length - 1]];
    if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const shape = confirm ? 'confirm' : `mode-${mode}`;
  // On <body>: a sheet opened from the sticky top bar (or any stacking context) still covers everything.
  return createPortal(
    <div
      className={`sheet-backdrop ${shape}${backdropClassName ? ` ${backdropClassName}` : ''}`}
      onClick={() => {
        if (!confirm && !side) closeRef.current();
      }}
    >
      <div
        ref={ref}
        className={`sheet session-sheet ${shape}${className ? ` ${className}` : ''}`}
        data-testid={testId}
        role={confirm ? 'alertdialog' : 'dialog'}
        aria-modal={side ? 'false' : 'true'}
        aria-label={showHead || labelledBy ? undefined : label}
        aria-labelledby={showHead ? titleId : labelledBy}
        tabIndex={-1}
        style={side && edges ? { top: edges.top, bottom: edges.bottom, ...style } : style}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {!ownHead && !confirm && mode === 'bottom' && (
          <div className="sh-hdl" aria-hidden="true">
            <i />
          </div>
        )}
        {showHead && (
          <div className="sh-head">
            <h3 id={titleId} ref={titleRef} tabIndex={-1}>
              {heading}
            </h3>
            {!confirm && dismissable && (
              <button type="button" className="sh-x" aria-label={closeLabel} onClick={() => closeRef.current()}>
                <Icon name="close" stroke={2.2} />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div className="sh-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
