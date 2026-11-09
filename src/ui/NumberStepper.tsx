import { useEffect, useState } from 'react';

interface Props {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  small: number;
  big: number;
  min?: number;
  max?: number;
  decimals?: number;
  /** Wrap around (for compass directions 0–359). */
  wrap?: boolean;
}

function clamp(v: number, min?: number, max?: number) {
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}

/** Large touch-friendly numeric input: −big −small [value] +small +big. Tap the value to type. */
export function NumberStepper({ label, unit, value, onChange, small, big, min, max, decimals = 0, wrap }: Props) {
  const fmt = (v: number | null) => (v === null ? '' : v.toFixed(decimals));
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing]);

  const step = (d: number) => {
    navigator.vibrate?.(10); // short tick so presses register with wet hands / gloves
    const base = value ?? (min !== undefined && min > 0 ? min : 0);
    let v = Math.round((base + d) * 10 ** decimals) / 10 ** decimals;
    if (wrap) v = ((v % 360) + 360) % 360;
    else v = clamp(v, min, max);
    onChange(v);
  };

  const commit = () => {
    setEditing(false);
    const t = text.replace(',', '.').trim();
    if (t === '') return onChange(null);
    const n = Number(t);
    if (!Number.isFinite(n)) return setText(fmt(value));
    onChange(wrap ? ((n % 360) + 360) % 360 : clamp(n, min, max));
  };

  return (
    <div className="stepper">
      <div className="stepper-label">
        {label}
        {unit && <span className="unit"> {unit}</span>}
      </div>
      <div className="stepper-row">
        <button type="button" className="step big" onClick={() => step(-big)} aria-label={`${label} −${big}`}>
          −{big}
        </button>
        <button type="button" className="step" onClick={() => step(-small)} aria-label={`${label} −${small}`}>
          −
        </button>
        <input
          className="stepper-value"
          inputMode="decimal"
          value={text}
          placeholder="—"
          aria-label={label}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        <button type="button" className="step" onClick={() => step(small)} aria-label={`${label} +${small}`}>
          +
        </button>
        <button type="button" className="step big" onClick={() => step(big)} aria-label={`${label} +${big}`}>
          +{big}
        </button>
      </div>
    </div>
  );
}

/** Compact numeric field for editors: keeps its own text while typing, commits on blur. */
export function NumField({
  value,
  onChange,
  width,
  placeholder,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  width?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  return (
    <input
      className="numfield"
      style={width ? { width } : undefined}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.replace(',', '.').trim();
        if (t === '') return onChange(undefined);
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
        else setText(value === undefined ? '' : String(value));
      }}
    />
  );
}
