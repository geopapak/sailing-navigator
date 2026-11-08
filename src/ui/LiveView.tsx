import { useMemo } from 'react';
import { useApp } from './AppContext';
import { NumberStepper } from './NumberStepper';
import { PolarChart, sailColor } from './PolarChart';
import { useGps, useStoredState, useWakeLock } from './hooks';
import { computeLive } from '../performance/targets';
import { sailOutlook, selectableSails } from '../performance/sails';
import { adviceFor } from '../performance/advice';
import { magToTrue, trueToMag, twaFromTwd } from '../performance/angles';
import { formatDM } from '../nav/geo';

interface LiveState {
  windInput: 'twa' | 'twd';
  tws: number | null;
  twa: number | null;
  side: 'stbd' | 'port';
  twd: number | null;
  headingSource: 'gps' | 'manual';
  heading: number | null;
  bsp: number | null;
  sailId?: string;
  gps: boolean;
  showPolar: boolean;
}

const INITIAL: LiveState = {
  windInput: 'twa',
  tws: 10,
  twa: 42,
  side: 'stbd',
  twd: null,
  headingSource: 'gps',
  heading: null,
  bsp: null,
  gps: true,
  showPolar: false,
};

const f1 = (v?: number) => (v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1));
const f0 = (v?: number) => (v === undefined || !Number.isFinite(v) ? '—' : Math.round(v).toString());
const pct = (v?: number) => (v === undefined ? '—' : `${Math.round(v * 100)}%`);

function pctClass(v?: number) {
  if (v === undefined) return '';
  if (v >= 0.98) return 'good';
  if (v >= 0.93) return 'fair';
  return 'bad';
}

const MODE_LABEL = { upwind: 'Όρτσα', reach: 'Ανοιχτά', downwind: 'Πρύμα' } as const;

export function LiveView() {
  const { activeBoat: boat, settings } = useApp();
  const [s, setS] = useStoredState<LiveState>('live-state', INITIAL);
  const set = (patch: Partial<LiveState>) => setS((p) => ({ ...p, ...patch }));
  const gps = useGps(s.gps);
  const wake = useWakeLock(settings.keepAwake);

  // Heading (true) used for TWD → TWA.
  const headingTrue =
    s.headingSource === 'gps'
      ? gps.fix?.cog
      : s.heading === null
        ? undefined
        : settings.manualMagnetic
          ? magToTrue(s.heading, settings.declination)
          : s.heading;

  const twdTrue = s.twd === null ? undefined : settings.manualMagnetic ? magToTrue(s.twd, settings.declination) : s.twd;

  const signedTwa: number | undefined =
    s.windInput === 'twa'
      ? s.twa === null
        ? undefined
        : s.side === 'port'
          ? -s.twa
          : s.twa
      : twdTrue !== undefined && headingTrue !== undefined
        ? twaFromTwd(twdTrue, headingTrue)
        : undefined;

  const result = useMemo(() => {
    if (!boat || s.tws === null || signedTwa === undefined) return null;
    return computeLive(boat, { tws: s.tws, twa: signedTwa, bsp: s.bsp ?? undefined });
  }, [boat, s.tws, signedTwa, s.bsp]);

  const outlook = useMemo(
    () => (boat && result ? sailOutlook(boat, result.tws, result.twa) : undefined),
    [boat, result],
  );
  const advice = useMemo(
    () => (result && outlook ? adviceFor(result, { ...outlook, currentSailId: s.sailId }) : []),
    [result, outlook, s.sailId],
  );

  if (!boat) return <p>Δεν υπάρχει σκάφος.</p>;
  if (!boat.polar)
    return <p className="card">Το σκάφος «{boat.name}» δεν έχει polars. Επίλεξε άλλο σκάφος ή πρόσθεσε polars στο προφίλ.</p>;

  const sails = selectableSails(boat);
  const headingDisplay =
    headingTrue === undefined ? '—' : `${f0(settings.manualMagnetic ? trueToMag(headingTrue, settings.declination) : headingTrue)}°`;

  return (
    <div className="live">
      <section className="results" aria-live="polite">
        <div className={`tile hero ${pctClass(result?.pctTarget)}`}>
          <div className="tile-label">% target</div>
          <div className="tile-value">{pct(result?.pctTarget)}</div>
          <div className="tile-sub">{result ? MODE_LABEL[result.mode] : ''}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Target BSP</div>
          <div className="tile-value">{f1(result?.targetBsp)}</div>
          <div className="tile-sub">kt</div>
        </div>
        <div className="tile">
          <div className="tile-label">Target TWA</div>
          <div className="tile-value">{result?.targetTwa !== undefined ? `${f0(result.targetTwa)}°` : '—'}</div>
          <div className="tile-sub">
            όρτσα {f0(result?.beat.angle)}° · πρύμα {f0(result?.run.angle)}°
          </div>
        </div>
        <div className={`tile ${pctClass(result?.pctVmg)}`}>
          <div className="tile-label">VMG / target</div>
          <div className="tile-value">
            {f1(result?.vmg)}
            <span className="slash">/</span>
            {f1(result?.targetVmg)}
          </div>
          <div className="tile-sub">{result?.pctVmg !== undefined ? pct(result.pctVmg) : 'kt'}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Polar @ TWA</div>
          <div className="tile-value">{f1(result?.polarBsp)}</div>
          <div className="tile-sub">{result?.pctPolar !== undefined ? pct(result.pctPolar) : 'kt'}</div>
        </div>
        <div className={`tile ${outlook?.recommended && s.sailId && outlook.recommended.id !== s.sailId ? 'bad' : ''}`}>
          <div className="tile-label">Πανί</div>
          <div className="tile-value">{outlook?.recommended?.name ?? '—'}</div>
          <div className="tile-sub">
            {outlook?.ifStronger ? `↑ ${outlook.ifStronger.name}` : ''}
            {outlook?.ifLighter ? ` ↓ ${outlook.ifLighter.name}` : ''}
          </div>
        </div>
      </section>

      {advice.length > 0 && (
        <ul className="advice">
          {advice.map((a) => (
            <li key={a.id} className={`advice-${a.level}`}>
              {a.text}
            </li>
          ))}
        </ul>
      )}

      <section className="inputs">
        <NumberStepper label="TWS" unit="kt" value={s.tws} onChange={(v) => set({ tws: v })} small={1} big={3} min={0} max={60} decimals={0} />

        <div className="seg" role="group" aria-label="Είσοδος ανέμου">
          <button className={s.windInput === 'twa' ? 'on' : ''} onClick={() => set({ windInput: 'twa' })}>
            TWA
          </button>
          <button className={s.windInput === 'twd' ? 'on' : ''} onClick={() => set({ windInput: 'twd' })}>
            TWD
          </button>
        </div>

        {s.windInput === 'twa' ? (
          <>
            <NumberStepper label="TWA" unit="°" value={s.twa} onChange={(v) => set({ twa: v })} small={1} big={5} min={0} max={180} />
            <div className="seg" role="group" aria-label="Αναστροφές">
              <button className={`stbd ${s.side === 'stbd' ? 'on' : ''}`} onClick={() => set({ side: 'stbd' })}>
                Δεξιές (stbd)
              </button>
              <button className={`port ${s.side === 'port' ? 'on' : ''}`} onClick={() => set({ side: 'port' })}>
                Αριστερές (port)
              </button>
            </div>
          </>
        ) : (
          <>
            <NumberStepper
              label={`TWD${settings.manualMagnetic ? ' (μαγν.)' : ''}`}
              unit="°"
              value={s.twd}
              onChange={(v) => set({ twd: v })}
              small={5}
              big={10}
              wrap
            />
            <div className="seg" role="group" aria-label="Πηγή πορείας">
              <button className={s.headingSource === 'gps' ? 'on' : ''} onClick={() => set({ headingSource: 'gps' })}>
                Πορεία από GPS
              </button>
              <button className={s.headingSource === 'manual' ? 'on' : ''} onClick={() => set({ headingSource: 'manual' })}>
                Πορεία με το χέρι
              </button>
            </div>
            {s.headingSource === 'manual' && (
              <NumberStepper
                label={`Πορεία${settings.manualMagnetic ? ' (πυξίδα)' : ''}`}
                unit="°"
                value={s.heading}
                onChange={(v) => set({ heading: v })}
                small={1}
                big={10}
                wrap
              />
            )}
            <p className="hint">
              Πορεία: {headingDisplay}
              {s.headingSource === 'gps' && headingTrue === undefined && ' (το GPS δίνει COG μόνο όταν κινείται το σκάφος)'}
              {' · '}TWA: {signedTwa === undefined ? '—' : `${f0(Math.abs(signedTwa))}° ${signedTwa >= 0 ? 'δεξιές' : 'αριστερές'}`}
            </p>
          </>
        )}

        <NumberStepper label="BSP" unit="kt" value={s.bsp} onChange={(v) => set({ bsp: v })} small={0.1} big={1} min={0} max={40} decimals={1} />

        <div className="field-label">Πανί που έχουμε</div>
        <div className="chips">
          {sails.map((sl) => (
            <button
              key={sl.id}
              className={`chip ${s.sailId === sl.id ? 'on' : ''}`}
              style={{ borderColor: sailColor(boat, sl.id) }}
              onClick={() => set({ sailId: s.sailId === sl.id ? undefined : sl.id })}
            >
              {sl.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card gps">
        <div className="gps-head">
          <strong>GPS</strong>
          <label className="switch">
            <input type="checkbox" checked={s.gps} onChange={(e) => set({ gps: e.target.checked })} /> ενεργό
          </label>
        </div>
        {gps.fix ? (
          <div className="gps-grid">
            <span>{formatDM(gps.fix.lat, true)}</span>
            <span>{formatDM(gps.fix.lon, false)}</span>
            <span>SOG {f1(gps.fix.sog)} kt</span>
            <span>COG {gps.fix.cog === undefined ? '—' : `${f0(gps.fix.cog)}°T`}</span>
            <span className="muted">±{f0(gps.fix.accuracy)} m</span>
            <span className="muted">{new Date(gps.fix.t).toLocaleTimeString('el-GR')}</span>
          </div>
        ) : (
          <p className="muted">{gps.message ?? (s.gps ? 'Αναμονή σήματος…' : 'Ανενεργό')}</p>
        )}
        {settings.keepAwake && <p className="muted small">Οθόνη πάντα αναμμένη: {wake ? 'ναι' : 'μη διαθέσιμο'}</p>}
      </section>

      <section className="card">
        <button className="link" onClick={() => set({ showPolar: !s.showPolar })}>
          {s.showPolar ? '▾' : '▸'} Polar διάγραμμα
        </button>
        {s.showPolar && result && (
          <PolarChart
            boat={boat}
            twsList={[]}
            tws={result.tws}
            point={result.bsp !== undefined ? { twa: result.twa, bsp: result.bsp } : undefined}
            compact
          />
        )}
      </section>
    </div>
  );
}
