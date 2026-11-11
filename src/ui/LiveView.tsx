import { useEffect, useMemo, useRef, useState } from 'react';
import { TILE_HELP } from './guideText';
import { useApp } from './AppContext';
import { NumberStepper } from './NumberStepper';
import { PolarChart, sailColor } from './PolarChart';
import { useStoredState, useWakeLock } from './hooks';
import { useNav } from './NavContext';
import { NextMarkCard } from './NextMarkCard';
import { computeLive } from '../performance/targets';
import { sailOutlook, selectableSails } from '../performance/sails';
import { adviceFor } from '../performance/advice';
import { magToTrue, trueToMag, twaFromTwd, twdFromTwa } from '../performance/angles';
import { bearingDeg, distanceNm, formatDM, vmc } from '../nav/geo';
import { AdvisorCard } from './AdvisorCard';
import { buildLiveContext, localIso, routeSnapshot } from '../ai/context';
import type { NavSnapshot } from '../ai/types';
import { gridField } from '../weather/field';
import { modelLabel } from '../weather/models';
import { openTab } from './openTab';
import { setLiveSnapshot } from '../ai/snapshot';
import { useInstruments } from './InstrumentsContext';
import { knowledgeHints } from '../knowledge/match';
import { InstrumentBar, type LockField } from './InstrumentBar';

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

const MODE_LABEL = { upwind: 'Όρτσα', reach: 'Ανοιχτά', downwind: 'Πρίμα' } as const;

/** Plain-Greek meaning under each abbreviation (the label itself stays for experienced crews). */
const TILE_HINT: Record<string, string> = {
  '% target': 'πόσο κοντά είσαι στη σωστή ταχύτητα',
  'Target BSP': 'ταχύτητα-στόχος',
  'Target TWA': 'γωνία-στόχος από τον άνεμο',
  'VMG / target': 'πρόοδος προς/από τον άνεμο',
  'Polar @ TWA': 'ταχύτητα polar στη γωνία σου',
  Πανί: 'προτείνεται',
};

function Label({ text }: { text: string }) {
  return (
    <>
      <div className="tile-label">{text}</div>
      <div className="tile-hint">{TILE_HINT[text]}</div>
    </>
  );
}

/** Scrolls to a stepper and puts the cursor in it. */
function goToField(id: string) {
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => el?.querySelector('input')?.focus({ preventScroll: true }), 350);
}

export function LiveView() {
  const { activeBoat: boat, settings, updateSettings } = useApp();
  const simple = settings.liveMode !== 'full';
  const [s, setS] = useStoredState<LiveState>('live-state', INITIAL);
  const set = (patch: Partial<LiveState>) => setS((p) => ({ ...p, ...patch }));
  // Instruments fill TWS / TWA / BSP while they are live; a field the user edits is locked to manual.
  const inst = useInstruments();
  const instOn = settings.instruments?.enabled ?? false;
  const [locks, setLocks] = useStoredState<Record<LockField, boolean>>('live-locks', { tws: false, twa: false, bsp: false });
  const lock = (f: LockField) => inst.live && !locks[f] && setLocks({ ...locks, [f]: true });
  const setManual = (f: LockField, patch: Partial<LiveState>) => {
    lock(f);
    set(patch);
  };
  const iv = inst.values;
  useEffect(() => {
    if (!inst.live) return;
    const patch: Partial<LiveState> = {};
    if (!locks.tws && iv.tws !== undefined) patch.tws = Math.round(iv.tws * 10) / 10;
    if (!locks.twa && iv.twa !== undefined) {
      patch.windInput = 'twa';
      patch.twa = Math.round(Math.abs(iv.twa));
      patch.side = iv.twa < 0 ? 'port' : 'stbd';
    }
    if (!locks.bsp && iv.bsp !== undefined) patch.bsp = Math.round(iv.bsp * 100) / 100;
    if (Object.keys(patch).length) setS((p) => ({ ...p, ...patch }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst.live, iv.tws, iv.twa, iv.bsp, locks.tws, locks.twa, locks.bsp]);
  const nav = useNav();
  const gps = nav.gps;
  const wake = useWakeLock(settings.keepAwake);
  const [help, setHelp] = useState<string>();
  // Show a compact strip of the key numbers once the result tiles scroll out of view.
  const resultsRef = useRef<HTMLElement>(null);
  const [tilesHidden, setTilesHidden] = useState(false);
  useEffect(() => {
    const el = resultsRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setTilesHidden(!e.isIntersecting), { rootMargin: '-60px 0px 0px 0px', threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [boat?.id, !!boat?.polar]);

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
    () => (result && outlook ? adviceFor(result, { ...outlook, currentSailId: s.sailId, currentSailName: boat?.sails.find((x) => x.id === s.sailId)?.name }) : []),
    [result, outlook, s.sailId],
  );

  // Observed true wind for re-routing: TWD typed in, or TWA + GPS course.
  const observedTwd =
    s.windInput === 'twd'
      ? twdTrue
      : gps.fix?.cog !== undefined && signedTwa !== undefined
        ? twdFromTwa(signedTwa, gps.fix.cog)
        : undefined;
  const observed = s.tws !== null && observedTwd !== undefined ? { tws: s.tws, twd: observedTwd } : undefined;

  // Publish the latest numbers for the advisor chat (buildRef is set further down, after the early returns).
  const buildRef = useRef<(q?: string) => ReturnType<typeof buildLiveContext> | undefined>();
  useEffect(() => {
    const c = buildRef.current?.();
    if (c) setLiveSnapshot(c);
  }, [result, s.sailId, gps.fix, nav.nextMark, nav.liveRoute, nav.course]);

  if (!boat) return <p className="card">Πρόσθεσε πρώτα το σκάφος σου στην καρτέλα «Σκάφη».</p>;
  if (!boat.polar)
    return <p className="card">Το σκάφος «{boat.name}» δεν έχει polars. Διάλεξε άλλο σκάφος επάνω ή πρόσθεσε polars (Σκάφη → Επεξεργασία).</p>;

  const sails = selectableSails(boat);
  const headingDisplay =
    headingTrue === undefined ? '—' : `${f0(settings.manualMagnetic ? trueToMag(headingTrue, settings.declination) : headingTrue)}°`;

  const buildCtx = (question?: string) => {
    if (!result) return undefined;
    const navSnap: NavSnapshot = { observedTwd: observed?.twd };
    const fix = gps.fix;
    if (fix) navSnap.position = { lat: fix.lat, lon: fix.lon, sog: fix.sog, cogTrue: fix.cog };
    if (fix && nav.forecast) {
      const now = Date.now();
      const f = nav.forecast;
      if (now >= f.times[0] && now <= f.times[f.times.length - 1]) {
        const w = gridField(f).at(fix.lat, fix.lon, now);
        navSnap.forecastHere = { tws: w.tws, twd: w.twd, model: modelLabel(f.model) };
      }
    }
    const course = nav.course;
    const mark = course?.marks[nav.nextMark];
    if (course && mark && course.marks.length > 1) {
      const dtw = fix ? distanceNm(fix, mark) : undefined;
      const btw = fix ? bearingDeg(fix, mark) : undefined;
      const v = fix?.sog !== undefined && fix.cog !== undefined && btw !== undefined ? vmc(fix.sog, fix.cog, btw) : undefined;
      navSnap.nextMark = {
        name: mark.name,
        index: nav.nextMark,
        of: course.marks.length - 1,
        distanceNm: dtw,
        bearingTrue: btw,
        vmcKt: v,
        eta: dtw !== undefined && v !== undefined && v > 0.3 ? localIso(Date.now() + (dtw / v) * 3600_000) : undefined,
      };
    }
    if (nav.liveRoute)
      navSnap.route = {
        ...routeSnapshot(nav.liveRoute, boat),
        computedMinAgo: nav.liveStatus.at ? (Date.now() - nav.liveStatus.at) / 60_000 : undefined,
      };
    const ctx = buildLiveContext({ boat, result, outlook, advice, currentSailId: s.sailId, nav: navSnap, question });
    const here = fix ? { lat: fix.lat, lon: fix.lon } : nav.course?.marks[nav.nextMark];
    ctx.localKnowledge = knowledgeHints(here, { tws: result.tws, twd: observed?.twd });
    return ctx;
};

  buildRef.current = buildCtx;

  return (
    <div className="live">
      {result && (
        <button
          type="button"
          className={`live-strip ${tilesHidden ? 'show' : ''}`}
          aria-hidden={!tilesHidden}
          tabIndex={tilesHidden ? 0 : -1}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <span className={`ls-pct ${pctClass(result.pctTarget)}`}>{pct(result.pctTarget)}</span>
          <span>
            <small>BSP</small> {f1(result.bsp)}/{f1(result.targetBsp)}
          </span>
          <span>
            <small>TWA</small> {f0(Math.abs(result.twa))}°/{f0(result.targetTwa)}°
          </span>
          <span>{outlook?.recommended?.name ?? '—'}</span>
        </button>
      )}
      <div className="seg live-mode" role="group" aria-label="Προβολή">
        <button className={simple ? 'on' : ''} aria-pressed={simple} onClick={() => updateSettings({ liveMode: 'simple' })}>
          Απλό
        </button>
        <button className={!simple ? 'on' : ''} aria-pressed={!simple} onClick={() => updateSettings({ liveMode: 'full' })}>
          Πλήρες
        </button>
      </div>
      <section
        ref={resultsRef}
        className={`results ${simple ? 'simple' : ''}`}
        aria-live="polite"
        onClick={(e) => {
          const label = (e.target as HTMLElement).closest('.tile')?.querySelector('.tile-label')?.textContent ?? '';
          setHelp((h) => (h === label ? undefined : label));
        }}
      >
        <div className={`tile hero ${pctClass(result?.pctTarget)}`}>
          <Label text="% target" />
          {!result ? (
            <button type="button" className="missing" onClick={(e) => (e.stopPropagation(), goToField('live-tws'))}>
              ⚠ Βάλε άνεμο (TWS και γωνία) ↓
            </button>
          ) : result.bsp === undefined ? (
            <button type="button" className="missing" onClick={(e) => (e.stopPropagation(), goToField('live-bsp'))}>
              ⚠ Βάλε ταχύτητα σκάφους (BSP) ↓
            </button>
          ) : (
            <>
              <div className="tile-value">{pct(result.pctTarget)}</div>
              <div className="tile-sub">
                {MODE_LABEL[result.mode]}
                {result.targetBsp !== undefined && ` · ${f1(result.bsp)} από ${f1(result.targetBsp)} kt`}
              </div>
            </>
          )}
        </div>
        <div className="tile">
          <Label text="Target BSP" />
          <div className="tile-value">{f1(result?.targetBsp)}</div>
          <div className="tile-sub">
            {result?.bsp !== undefined && result.targetBsp !== undefined
              ? `${result.bsp - result.targetBsp >= 0 ? '+' : '−'}${Math.abs(result.bsp - result.targetBsp).toFixed(1)} kt από target`
              : 'kt'}
          </div>
        </div>
        <div className="tile">
          <Label text="Target TWA" />
          <div className="tile-value">{result?.targetTwa !== undefined ? `${f0(result.targetTwa)}°` : '—'}</div>
          <div className="tile-sub">
            {simple
              ? result
                ? `τώρα ${f0(Math.abs(result.twa))}°`
                : ''
              : `όρτσα ${f0(result?.beat.angle)}° · πρίμα ${f0(result?.run.angle)}°`}
          </div>
        </div>
        {!simple && (
          <>
            <div className={`tile ${pctClass(result?.pctVmg)}`}>
              <Label text="VMG / target" />
              <div className="tile-value">
                {f1(result?.vmg)}
                <span className="slash">/</span>
                {f1(result?.targetVmg)}
              </div>
              <div className="tile-sub">{result?.pctVmg !== undefined ? pct(result.pctVmg) : 'kt'}</div>
            </div>
            <div className="tile">
              <Label text="Polar @ TWA" />
              <div className="tile-value">{f1(result?.polarBsp)}</div>
              <div className="tile-sub">{result?.pctPolar !== undefined ? pct(result.pctPolar) : 'kt'}</div>
            </div>
            <div className={`tile ${outlook?.recommended && s.sailId && outlook.recommended.id !== s.sailId ? 'bad' : ''}`}>
              <Label text="Πανί" />
              {result && !outlook?.recommended && sails.length <= 1 ? (
                <button type="button" className="missing" onClick={(e) => (e.stopPropagation(), openTab('boats'))}>
                  Δεν έχεις πανιά — Πρόσθεσε στα Σκάφη
                </button>
              ) : (
                <>
                  <div className="tile-value">{outlook?.recommended?.name ?? '—'}</div>
                  <div className="tile-sub">
                    {outlook?.ifStronger ? `↑ ${outlook.ifStronger.name}` : ''}
                    {outlook?.ifLighter ? ` ↓ ${outlook.ifLighter.name}` : ''}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {help && TILE_HELP[help] && (
        <p className="explain" onClick={() => setHelp(undefined)}>
          <strong>{help}:</strong> {TILE_HELP[help]}
        </p>
      )}

      {advice.length > 0 && (
        <ul className="advice">
          {advice.map((a) => (
            <li key={a.id} className={`advice-${a.level}`}>
              {a.text}
            </li>
          ))}
        </ul>
      )}

      {instOn && (
        <InstrumentBar
          inst={inst}
          locks={locks}
          manual={{ tws: s.tws ?? undefined, twa: s.twa === null ? undefined : s.side === 'port' ? -s.twa : s.twa, bsp: s.bsp ?? undefined }}
          onToggle={(f) => setLocks({ ...locks, [f]: !locks[f] })}
        />
      )}

      <section className="inputs">
        <NumberStepper id="live-tws" hint="άνεμος" label="TWS" unit="kt" value={s.tws} onChange={(v) => setManual('tws', { tws: v })} small={1} big={3} min={0} max={60} decimals={0} />

        <div className="seg" role="group" aria-label="Είσοδος ανέμου">
          <button className={s.windInput === 'twa' ? 'on' : ''} onClick={() => set({ windInput: 'twa' })}>
            TWA · γωνία
          </button>
          <button className={s.windInput === 'twd' ? 'on' : ''} onClick={() => set({ windInput: 'twd' })}>
            TWD · κατεύθυνση
          </button>
        </div>

        {s.windInput === 'twa' ? (
          <>
            <NumberStepper hint="γωνία ανέμου" label="TWA" unit="°" value={s.twa} onChange={(v) => setManual('twa', { twa: v })} small={1} big={5} min={0} max={180} />
            <div className="seg" role="group" aria-label="Ποδαρικό">
              <button className={`stbd ${s.side === 'stbd' ? 'on' : ''}`} onClick={() => setManual('twa', { side: 'stbd' })}>
                Δεξιές{!simple && ' (stbd)'}
              </button>
              <button className={`port ${s.side === 'port' ? 'on' : ''}`} onClick={() => setManual('twa', { side: 'port' })}>
                Αριστερές{!simple && ' (port)'}
              </button>
            </div>
          </>
        ) : (
          <>
            <NumberStepper
              label={`TWD${settings.manualMagnetic ? ' (μαγν.)' : ''}`}
              hint="από πού φυσάει"
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
                Πορεία χειροκίνητα
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

        <NumberStepper id="live-bsp" hint="ταχύτητα σκάφους" label="BSP" unit="kt" value={s.bsp} onChange={(v) => setManual('bsp', { bsp: v })} small={0.1} big={1} min={0} max={40} decimals={1} />

        <div className="field-label">Πανί που έχουμε</div>
        <div className="chips">
          {sails.map((sl) => (
            <button
              key={sl.id}
              className={`chip ${s.sailId === sl.id ? 'on' : ''}`}
              style={{ borderColor: sailColor(boat, sl.id), ['--sail' as string]: sailColor(boat, sl.id) }}
              onClick={() => set({ sailId: s.sailId === sl.id ? undefined : sl.id })}
            >
              {outlook?.recommended?.id === sl.id && <span className="chip-star" aria-label="προτεινόμενο">★</span>}
              {sl.name}
            </button>
          ))}
        </div>
      </section>

      <NextMarkCard observed={observed} />

      <AdvisorCard
        storageKey="advisor-live"
        title="Σύμβουλος AI"
        presets={['Αναστροφή τώρα;', 'Αλλαγή πανιού;', 'Πώς πάμε;']}
        disabledReason={result ? undefined : 'Βάλε άνεμο (TWS και TWA) για να ρωτήσεις.'}
        onOpenSettings={() => openTab('settings')}
        build={buildCtx}
      />

      <section className="card gps">
        <div className="gps-head">
          <strong>GPS</strong>
          <label className="switch">
            <input type="checkbox" checked={nav.gpsEnabled} onChange={(e) => nav.setGpsEnabled(e.target.checked)} /> ενεργό
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
          <p className="muted">{gps.message ?? (nav.gpsEnabled ? 'Αναμονή σήματος…' : 'Ανενεργό')}</p>
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
