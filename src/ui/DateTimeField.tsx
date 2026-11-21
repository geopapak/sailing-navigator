import { useEffect, useId, useRef, useState } from 'react';
import { autoDate, autoTime, date as fmtDate, parseDate, parseTime, time as fmtTime } from '../format';

/**
 * Date and time typed as the app shows them, «23/11/2026» and «11:00» (P-064 §Κ), in every
 * browser language: the native `datetime-local` shows «11/23/2026 10:05 AM» in an English browser.
 * Never a silent «now»: an empty or wrong field gives `undefined` and a message.
 */

export const DATE_TEXT = {
  datePh: 'ηη/μμ/εεεε',
  timePh: 'ΩΩ:ΛΛ',
  badDate: 'Γράψε ημερομηνία όπως 23/11/2026',
  badTime: 'Γράψε ώρα όπως 11:00',
  date: 'Ημερομηνία',
  time: 'Ώρα',
} as const;

/** What a DateTimeField holds: the moment when both parts are there, and the day alone. */
export interface DateTimeValue {
  /** Date and time (local), when both are valid. */
  ms?: number;
  /** Midnight of the typed day, when the date is valid (also without a time). */
  day?: number;
  /** The time field is empty. */
  noTime: boolean;
}

/** «2026-11-23» ↔ ms of local midnight (the stored form of a date-only field). */
export const isoDayToMs = (s: string | undefined): number | undefined => {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : undefined;
};
export const msToIsoDay = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Reads the two texts (pure, for tests and the field). */
export function readDateTime(dateText: string, timeText: string): DateTimeValue & { dateError?: string; timeError?: string } {
  const d = parseDate(dateText);
  const noTime = timeText.trim() === '';
  const t = noTime ? undefined : parseTime(timeText);
  const day = d ? new Date(d.y, d.m - 1, d.d).getTime() : undefined;
  return {
    day,
    noTime,
    ms: d && t ? new Date(d.y, d.m - 1, d.d, t.h, t.min).getTime() : undefined,
    dateError: dateText.trim() && !d ? DATE_TEXT.badDate : undefined,
    timeError: !noTime && !t ? DATE_TEXT.badTime : undefined,
  };
}

/** Date + time in two text fields (sketch `design/fixes-0.19.1/`, frame 3). Checked when the field is left. */
export function DateTimeField({
  label,
  value,
  onChange,
  testId,
  help,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: DateTimeValue) => void;
  testId?: string;
  help?: string;
}) {
  const id = useId();
  const [dText, setD] = useState(value === undefined ? '' : fmtDate(value));
  const [tText, setT] = useState(value === undefined ? '' : fmtTime(value));
  const [left, setLeft] = useState({ d: false, t: false });
  const editing = useRef(false);
  // A value set from outside (another race, a copied event race) replaces the texts.
  useEffect(() => {
    if (editing.current) return;
    const cur = readDateTime(dText, tText);
    if (value !== undefined && cur.ms !== value) {
      setD(fmtDate(value));
      setT(fmtTime(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const r = readDateTime(dText, tText);
  const emit = (d: string, t: string) => {
    const x = readDateTime(d, t);
    onChange({ ms: x.ms, day: x.day, noTime: x.noTime });
  };
  const dErr = left.d ? r.dateError : undefined;
  const tErr = left.t ? r.timeError : undefined;
  return (
    <div className="fl dt-field" role="group" aria-labelledby={`${id}-l`} data-testid={testId}>
      <span id={`${id}-l`}>{label}</span>
      <div className="dtf">
        <input
          aria-label={`${label}, ${DATE_TEXT.date.toLowerCase()}`}
          aria-describedby={dErr ? `${id}-de` : undefined}
          aria-invalid={dErr ? true : undefined}
          className="d"
          inputMode="numeric"
          autoComplete="off"
          placeholder={DATE_TEXT.datePh}
          maxLength={10}
          value={dText}
          onFocus={() => (editing.current = true)}
          onChange={(e) => {
            const v = autoDate(e.target.value);
            setD(v);
            emit(v, tText);
          }}
          onBlur={() => {
            editing.current = false;
            setLeft((x) => ({ ...x, d: true }));
            const p = parseDate(dText);
            if (p) setD(fmtDate(new Date(p.y, p.m - 1, p.d).getTime()));
          }}
        />
        <input
          aria-label={`${label}, ${DATE_TEXT.time.toLowerCase()}`}
          aria-describedby={tErr ? `${id}-te` : undefined}
          aria-invalid={tErr ? true : undefined}
          className="t"
          inputMode="numeric"
          autoComplete="off"
          placeholder={DATE_TEXT.timePh}
          maxLength={5}
          value={tText}
          onFocus={() => (editing.current = true)}
          onChange={(e) => {
            const v = autoTime(e.target.value);
            setT(v);
            emit(dText, v);
          }}
          onBlur={() => {
            editing.current = false;
            setLeft((x) => ({ ...x, t: true }));
            const p = parseTime(tText);
            if (p) {
              const v = `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
              setT(v);
              emit(dText, v);
            }
          }}
        />
      </div>
      {dErr && (
        <span className="ferr" id={`${id}-de`}>
          {dErr}
        </span>
      )}
      {tErr && (
        <span className="ferr" id={`${id}-te`}>
          {tErr}
        </span>
      )}
      {help && <span className="help small muted">{help}</span>}
    </div>
  );
}

/** A date alone («Λήξη πιστοποιητικού»), stored as «2026-11-23»; empty → undefined. */
export function DateField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (iso: string | undefined) => void }) {
  const id = useId();
  const [text, setText] = useState(() => {
    const ms = isoDayToMs(value);
    return ms === undefined ? '' : fmtDate(ms);
  });
  const [left, setLeft] = useState(false);
  const p = parseDate(text);
  const err = left && text.trim() && !p ? DATE_TEXT.badDate : undefined;
  return (
    <div className="fl dt-field" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`}>{label}</span>
      <div className="dtf">
        <input
          className="d"
          aria-label={`${label}, ${DATE_TEXT.date.toLowerCase()}`}
          aria-describedby={err ? `${id}-de` : undefined}
          aria-invalid={err ? true : undefined}
          inputMode="numeric"
          autoComplete="off"
          placeholder={DATE_TEXT.datePh}
          maxLength={10}
          value={text}
          onChange={(e) => {
            const v = autoDate(e.target.value);
            setText(v);
            const q = parseDate(v);
            if (q) onChange(msToIsoDay(new Date(q.y, q.m - 1, q.d).getTime()));
            else if (!v.trim()) onChange(undefined);
          }}
          onBlur={() => {
            setLeft(true);
            if (p) setText(fmtDate(new Date(p.y, p.m - 1, p.d).getTime()));
          }}
        />
      </div>
      {err && (
        <span className="ferr" id={`${id}-de`}>
          {err}
        </span>
      )}
    </div>
  );
}
