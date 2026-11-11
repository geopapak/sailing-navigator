import { useEffect, useRef, useState } from 'react';

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
  undo: () => void | Promise<void>;
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

/** Shows "<text> — Αναίρεση" for a few seconds; tapping it runs `undo`. */
export function offerUndo(text: string, undo: () => void | Promise<void>) {
  listener?.undo({ id: ++seq, text, undo });
}

export function Dialogs() {
  const [ask, setAsk] = useState<ConfirmReq>();
  const [snack, setSnack] = useState<UndoReq>();
  const timer = useRef<number>();
  const okRef = useRef<HTMLButtonElement>(null);

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
        timer.current = window.setTimeout(() => setSnack((s) => (s?.id === r.id ? undefined : s)), UNDO_MS);
      },
    };
    return () => {
      listener = undefined;
      window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!ask) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const close = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(undefined);
  };

  return (
    <>
      {ask && (
        <div className="sheet-backdrop" onClick={() => close(false)}>
          <div className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="sheet-text" onClick={(e) => e.stopPropagation()}>
            <p id="sheet-text">{ask.text}</p>
            <div className="sheet-actions">
              {ask.kind === 'confirm' && (
                <button className="btn big-btn" onClick={() => close(false)}>
                  {ask.cancel}
                </button>
              )}
              <button ref={okRef} className={`btn big-btn ${ask.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
                {ask.ok}
              </button>
            </div>
          </div>
        </div>
      )}
      {snack && (
        <div className="snack" role="status">
          <span>{snack.text}</span>
          <button
            onClick={async () => {
              window.clearTimeout(timer.current);
              setSnack(undefined);
              await snack.undo();
            }}
          >
            Αναίρεση
          </button>
        </div>
      )}
    </>
  );
}
