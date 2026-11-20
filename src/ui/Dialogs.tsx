import { useEffect, useRef, useState } from 'react';
import { SheetFrame } from './Sheet';

/**
 * Themed replacements for window.confirm / window.alert (which are white and
 * ignore night mode) and an "Αναίρεση" snackbar for deletes.
 * Call the functions from anywhere; <Dialogs /> renders them once in the shell.
 */

interface ConfirmReq {
  kind: 'confirm' | 'alert';
  text: string;
  ok: string;
  cancel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface UndoReq {
  id: number;
  text: string;
  /** Without it: a short message only (no button). */
  undo?: () => void | Promise<void>;
  ms: number;
}

type Listener = { confirm: (r: ConfirmReq) => void; undo: (r: UndoReq) => void };
let listener: Listener | undefined;
let seq = 0;

/** How long the "Αναίρεση" stays on screen. */
export const UNDO_MS = 8000;

export function askConfirm(text: string, opts: { ok?: string; cancel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (!listener) return resolve(window.confirm(text));
    listener.confirm({ kind: 'confirm', text, ok: opts.ok ?? 'Ναι', cancel: opts.cancel ?? 'Άκυρο', danger: opts.danger, resolve });
  });
}

export function showAlert(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!listener) {
      window.alert(text);
      return resolve();
    }
    listener.confirm({ kind: 'alert', text, ok: 'Εντάξει', cancel: '', resolve: () => resolve() });
  });
}

/** Shows "<text> — Αναίρεση" for a few seconds (`ms`, default 8″); tapping it runs `undo`. */
export function offerUndo(text: string, undo: () => void | Promise<void>, ms = UNDO_MS) {
  listener?.undo({ id: ++seq, text, undo, ms });
}

/** A short message in the same place, without «Αναίρεση» (e.g. «Ο άνεμος ισχύει ακόμα»). */
export function showNote(text: string, ms = 4000) {
  listener?.undo({ id: ++seq, text, ms });
}

export function Dialogs() {
  const [ask, setAsk] = useState<ConfirmReq>();
  const [snack, setSnack] = useState<UndoReq>();
  const timer = useRef<number>();
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    listener = {
      confirm: (r) =>
        setAsk((prev) => {
          prev?.resolve(false);
          return r;
        }),
      undo: (r) => {
        window.clearTimeout(timer.current);
        setSnack(r);
        timer.current = window.setTimeout(() => setSnack((s) => (s?.id === r.id ? undefined : s)), r.ms);
      },
    };
    return () => {
      listener = undefined;
      window.clearTimeout(timer.current);
    };
  }, []);

  const close = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(undefined);
  };

  return (
    <>
      {ask && (
        // A question that needs an answer: always in the middle, closed by its buttons or Escape (= «Άκυρο»).
        <SheetFrame key={ask.text} kind="confirm" labelledBy="sheet-text" testId="confirm-sheet" initialFocus={ask.danger && ask.kind === 'confirm' ? cancelRef : okRef} onClose={() => close(false)}>
          <p id="sheet-text">{ask.text}</p>
          <div className="sheet-actions">
            {ask.kind === 'confirm' && (
              // A destructive question never starts on «Ναι»: the focus waits on «Άκυρο».
              <button ref={cancelRef} type="button" className="btn big-btn" onClick={() => close(false)}>
                {ask.cancel}
              </button>
            )}
            <button ref={okRef} type="button" className={`btn big-btn ${ask.danger ? 'danger-fill' : 'primary'}`} onClick={() => close(true)}>
              {ask.ok}
            </button>
          </div>
        </SheetFrame>
      )}
      {snack && (
        <div className="snack" role="status">
          <span>{snack.text}</span>
          {snack.undo && (
            <button
              onClick={async () => {
                window.clearTimeout(timer.current);
                setSnack(undefined);
                await snack.undo?.();
              }}
            >
              Αναίρεση
            </button>
          )}
        </div>
      )}
    </>
  );
}
