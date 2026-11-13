import { useMemo, useState } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { offerUndo } from './Dialogs';
import { MapView, type WindArrow } from './MapView';
import { NumberStepper, NumField } from './NumberStepper';
import { GRID_MODELS, modelLabel, normalizeModel } from '../weather/models';
import { ModelCompareCard } from './ModelCompareCard';
import { gridField } from '../weather/field';
import { positionAt } from '../routing/geojson';
import type { LegResult, Mark, RouteResult } from '../routing/isochrones';
import { formatDM } from '../nav/geo';
import { knowledgeHints } from '../knowledge/match';
import { corrected, formatDuration } from '../scoring/corrected';
import { STANDARD_SCORING_OPTIONS } from '../boat/scoringOptions';
import { sailColor } from './PolarChart';
import { Icon } from './Icons';
import { useStoredState } from './hooks';
import { AdvisorCard } from './AdvisorCard';
import { buildPlanContext, localIso } from '../ai/context';
import { openTab } from './openTab';
import type { BoatProfile } from '../boat/types';
import { useLaylines } from './useLaylines';
import { useSessionMarks } from './useSession';
import { useRace } from './RaceContext';
import { MAP_TEXT } from './sessionText';

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleString('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const fmtHM = (sec: number) => {
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}'`;
};
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function PlanView() {
  const { activeBoat: boat } = useApp();
  const nav = useNav();
  const lay = useLaylines();
  // P-034: inside a session the map shows the session's own marks (read only), not the saved course.
  const sm = useSessionMarks();
  const inSession = sm.from === 'session';
  const race = useRace();
  const track = inSession ? race.session?.track : undefined;
  const lastPoint = track?.length ? track[track.length - 1] : undefined;
  // Without GPS the map keeps the last known position of the session.
  const noFix = inSession && !nav.gps.fix;
  const { course, plan, setPlan, forecast } = nav;
  const [addMode, setAddMode] = useState(false);
  const [simT, setSimT] = useState<number>();
  const [fitKey, setFitKey] = useState(course?.id ?? '');
  const [ui, setUi] = useStoredState<{ bigMap: boolean }>('plan-ui', { bigMap: false });

  const marks = course?.marks ?? [];
  const setMarks = (m: Mark[]) => course && nav.updateCourse({ ...course, marks: m });

  // Time shown on the map (wind arrows + simulated boat position).
  const route = nav.planned;
  const tMin = route?.start ?? forecast?.times[0] ?? Date.now();
  const tMax = route?.end ?? forecast?.times[forecast.times.length - 1] ?? Date.now();
  const t = simT !== undefined ? Math.min(Math.max(simT, tMin), tMax) : route?.start ?? tMin;

  const windArrows = useMemo<WindArrow[] | undefined>(() => {
    if (!plan.showWind || plan.windSource !== 'forecast' || !forecast) return undefined;
    const f = gridField(forecast);
    const out: WindArrow[] = [];
    forecast.lats.forEach((lat, iy) =>
      forecast.lons.forEach((lon, ix) => {
        if ((iy + ix) % 1 !== 0) return;
        const w = f.at(lat, lon, t);
        out.push({ lat, lon, tws: w.tws, twd: w.twd });
      }),
    );
    return out;
  }, [plan.showWind, plan.windSource, forecast, t]);

  const sim = positionAt(route, t);

  // Sails used on the route, in order of first use, for the map legend.
  const legendSails = useMemo(() => {
    const ids: string[] = [];
    route?.legs.forEach((l) => l.sails.forEach((s) => !ids.includes(s.sailId) && ids.push(s.sailId)));
    return ids;
  }, [route]);

  if (!boat) return null;

  const canCompute = marks.length >= 2 && !nav.planStatus.busy;
  const computeLabel = nav.planStatus.busy ? 'Υπολογισμός…' : route ? '↻ Ξανά υπολογισμός' : 'Υπολογισμός βέλτιστης πορείας';

  return (
    <div className={`plan ${ui.bigMap ? 'big-map' : ''}`}>
      {noFix && (
        <p className="msg warn" role="status">
          {MAP_TEXT.noFix}
        </p>
      )}
      <div className="plan-map">
        <MapView
          boat={boat}
          marks={inSession ? sm.marks : marks}
          editable={!inSession}
          addMode={addMode && !inSession}
          onAdd={(p) => {
            if (!course) return;
            const n = marks.length;
            setMarks([...marks, { id: `m-${Date.now().toString(36)}`, name: n === 0 ? 'Εκκίνηση' : `Σημαδούρα ${n}`, lat: p.lat, lon: p.lon }]);
          }}
          onMove={(id, p) => setMarks(marks.map((m) => (m.id === id ? { ...m, ...p } : m)))}
          planned={route}
          live={nav.liveRoute}
          showIsochrones={plan.showIsochrones}
          showSeamarks={plan.showSeamarks}
          chart={plan.mapChart}
          showDepth={plan.showDepth}
          wind={windArrows}
          boatPos={nav.gps.fix ?? (inSession ? lastPoint : undefined)}
          track={track}
          laylines={lay?.result}
          simPos={route ? sim : undefined}
          fitKey={fitKey}
        >
          <button
            type="button"
            className="map-fab map-fab-size"
            aria-label={ui.bigMap ? 'Κανονικός χάρτης' : 'Χάρτης σε όλη την οθόνη'}
            title={ui.bigMap ? 'Κανονικός χάρτης' : 'Όλη η οθόνη'}
            onClick={() => setUi({ bigMap: !ui.bigMap })}
          >
            <Icon name={ui.bigMap ? 'shrink' : 'expand'} />
          </button>
          {ui.bigMap && (
            <button type="button" className="map-fab map-fab-go btn primary" disabled={!canCompute} onClick={nav.computePlan}>
              {computeLabel}
            </button>
          )}
          {legendSails.length > 0 && (
            <div className="map-legend" aria-label="Πανιά στη διαδρομή">
              {legendSails.map((id) => (
                <span key={id}>
                  <i style={{ background: sailColor(boat, id) }} />
                  {boat.sails.find((x) => x.id === id)?.name ?? id}
                </span>
              ))}
            </div>
          )}
        </MapView>
        {(route || forecast) && (
          <div className="time-slider card">
            <input
              type="range"
              min={tMin}
              max={tMax}
              step={5 * 60_000}
              value={t}
              onChange={(e) => setSimT(Number(e.target.value))}
              aria-label="Χρόνος"
            />
            <div className="small">
              {fmtTime(t)}
              {sim && ` · ${sim.tp.tws.toFixed(0)} kt από ${sim.tp.twd.toFixed(0)}° · ${sim.tp.sailId ?? ''}`}
            </div>
          </div>
        )}
      </div>

      <div className="plan-panel">
        {inSession ? (
          <section className="card">
            <h3>{MAP_TEXT.sessionCourse}</h3>
            {sm.marks.length ? (
              <ol className="marks">
                {sm.marks.map((m, i) => (
                  <li key={m.id}>
                    <span className="mark-idx">{i === 0 ? 'Ε' : i}</span>
                    <span>{m.name}</span>
                    <span className="muted small coords">
                      {formatDM(m.lat, true)} {formatDM(m.lon, false)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">{MAP_TEXT.noMarks}</p>
            )}
            <p className="muted small">{race.kind === 'race' ? MAP_TEXT.readOnlyRace : MAP_TEXT.readOnlyOther}</p>
          </section>
        ) : (
        <section className="card">
          <h3>Διαδρομή</h3>
          <div className="row">
            <select
              value={course?.id ?? ''}
              onChange={(e) => {
                nav.selectCourse(e.target.value || undefined);
                setFitKey(e.target.value);
              }}
              aria-label="Διαδρομή"
            >
              {nav.courses.length === 0 && <option value="">—</option>}
              {nav.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="btn"
              onClick={() => {
                const c = nav.newCourse(`Διαδρομή ${new Date().toLocaleDateString('el-GR')}`);
                setFitKey(c.id);
                setAddMode(true);
              }}
            >
              + Νέα
            </button>
          </div>
          {course && (
            <>
              <label className="stack">
                Όνομα
                <input value={course.name} onChange={(e) => nav.updateCourse({ ...course, name: e.target.value })} />
              </label>
              <ol className="marks">
                {marks.map((m, i) => (
                  <li key={m.id}>
                    <span className="mark-idx">{i === 0 ? 'Ε' : i}</span>
                    <input value={m.name} onChange={(e) => setMarks(marks.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} aria-label="Όνομα σημαδούρας" />
                    <span className="muted small coords">
                      {formatDM(m.lat, true)} {formatDM(m.lon, false)}
                    </span>
                    <span className="nowrap">
                      <button
                        className="icon-btn mark-btn"
                        aria-label="Πάνω"
                        disabled={i === 0}
                        onClick={() => {
                          const c = [...marks];
                          [c[i - 1], c[i]] = [c[i], c[i - 1]];
                          setMarks(c);
                        }}
                      >
                        ↑
                      </button>
                      <button className="icon-btn mark-btn" aria-label="Αφαίρεση" onClick={() => setMarks(marks.filter((x) => x.id !== m.id))}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="btn-row">
                <button className={`btn ${addMode ? 'primary' : ''}`} onClick={() => setAddMode(!addMode)}>
                  {addMode ? '✓ Τέλος προσθήκης' : '+ Σημαδούρα στον χάρτη'}
                </button>
                {nav.gps.fix && (
                  <button
                    className="btn"
                    onClick={() =>
                      setMarks([...marks, { id: `m-${Date.now().toString(36)}`, name: marks.length === 0 ? 'Εκκίνηση' : 'Θέση GPS', lat: nav.gps.fix!.lat, lon: nav.gps.fix!.lon }])
                    }
                  >
                    + Από GPS
                  </button>
                )}
                {marks.length > 1 && (
                  <button className="btn" onClick={() => setMarks([...marks].reverse())}>
                    Αντίστροφη φορά
                  </button>
                )}
                <button
                  className="btn danger"
                  onClick={async () => {
                    const gone = course;
                    await nav.removeCourse(gone.id);
                    offerUndo(`Διαγράφηκε η διαδρομή «${gone.name}»`, () => nav.restoreCourse(gone));
                  }}
                >
                  Διαγραφή
                </button>
              </div>
            </>
          )}
          {!course && <p className="muted small">Φτιάξε μια διαδρομή και άγγιξε τον χάρτη για να βάλεις εκκίνηση, σημαδούρες και τερματισμό με τη σειρά.</p>}
        </section>
        )}

        <section className="card form-grid">
          <h3>Άνεμος & εκκίνηση</h3>
          <label>
            Ώρα εκκίνησης
            <input type="datetime-local" value={plan.startLocal} onChange={(e) => setPlan({ startLocal: e.target.value })} />
          </label>
          <label>
            Πηγή ανέμου
            <div className="seg">
              <button className={plan.windSource === 'forecast' ? 'on' : ''} onClick={() => setPlan({ windSource: 'forecast' })}>
                Πρόγνωση
              </button>
              <button className={plan.windSource === 'uniform' ? 'on' : ''} onClick={() => setPlan({ windSource: 'uniform' })}>
                Σταθερός
              </button>
            </div>
          </label>
          {plan.windSource === 'forecast' ? (
            <>
              <label>
                Μοντέλο
                <select value={normalizeModel(plan.model)} onChange={(e) => setPlan({ model: e.target.value })}>
                  {GRID_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="full">
                <button className="btn primary" disabled={nav.forecastStatus.busy} onClick={nav.loadForecast}>
                  {nav.forecastStatus.busy ? 'Λήψη…' : forecast ? 'Ανανέωση πρόγνωσης' : 'Λήψη πρόγνωσης'}
                </button>
                {forecast && (
                  <p className="muted small">
                    {modelLabel(forecast.model)} · λήψη {new Date(forecast.fetchedAt).toLocaleString('el-GR')} · έως{' '}
                    {fmtTime(forecast.times[forecast.times.length - 1])}
                  </p>
                )}
                {nav.forecastStatus.error && <p className="warn-text">{nav.forecastStatus.error}</p>}
              </div>
            </>
          ) : (
            <div className="full">
              <NumberStepper label="TWS" unit="kt" value={plan.tws} onChange={(v) => setPlan({ tws: v ?? 0 })} small={1} big={3} min={0} max={50} />
              <NumberStepper label="TWD" unit="° αληθ." value={plan.twd} onChange={(v) => setPlan({ twd: v ?? 0 })} small={5} big={20} wrap />
            </div>
          )}
          <details className="full">
            <summary>Ρυθμίσεις υπολογισμού</summary>
            <div className="form-grid">
              <label>
                Βήμα υπολογισμού (λεπτά)
                <NumField value={plan.stepMin} onChange={(v) => setPlan({ stepMin: Math.min(30, Math.max(2, v ?? 10)) })} />
              </label>
              <label>
                Απώλεια ανά αναστροφή (s)
                <NumField value={plan.tackPenaltySec} onChange={(v) => setPlan({ tackPenaltySec: v ?? 0 })} />
              </label>
              <label>
                Απώλεια ανά υποσταύρωση (s)
                <NumField value={plan.gybePenaltySec} onChange={(v) => setPlan({ gybePenaltySec: v ?? 0 })} />
              </label>
            </div>
          </details>
          <div className="full seg map-kind" role="radiogroup" aria-label="Είδος χάρτη">
            {(
              [
                ['nautical', 'Ναυτικός'],
                ['road', 'Οδικός'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={plan.mapChart === v}
                className={plan.mapChart === v ? 'on' : ''}
                onClick={() => setPlan({ mapChart: v })}
              >
                {label} χάρτης
              </button>
            ))}
          </div>
          <div className="full toggles">
            {plan.mapChart === 'nautical' && (
              <label className="check">
                <input type="checkbox" checked={plan.showDepth} onChange={(e) => setPlan({ showDepth: e.target.checked })} /> Βάθη
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={plan.showWind} onChange={(e) => setPlan({ showWind: e.target.checked })} /> Βέλη ανέμου
            </label>
            <label className="check">
              <input type="checkbox" checked={plan.showSeamarks} onChange={(e) => setPlan({ showSeamarks: e.target.checked })} /> Σημαντήρες & φάροι
            </label>
            <label className="check">
              <input type="checkbox" checked={plan.showIsochrones} onChange={(e) => setPlan({ showIsochrones: e.target.checked })} /> Ισόχρονες
            </label>
          </div>
        </section>

        <ModelCompareCard />

        <div className="compute-bar">
          <button className="btn primary big-btn" disabled={!canCompute} onClick={nav.computePlan}>
            {computeLabel}
          </button>
        </div>
        {marks.length < 2 && <p className="muted small">Βάλε τουλάχιστον εκκίνηση και μία σημαδούρα ή τερματισμό.</p>}
        {nav.planStatus.error && <p className="errors">{nav.planStatus.error}</p>}

        {route && <RouteSummary route={route} boat={boat} scoringOptionId={plan.scoringOptionId} onScoring={(id) => setPlan({ scoringOptionId: id })} />}
        {route && (
          <AdvisorCard
            storageKey="advisor-plan"
            title="Ανάλυση σχεδίου (AI)"
            presets={['Ποια πλευρά πληρώνει;', 'Κίνδυνοι;', 'Πανιά;']}
            onOpenSettings={() => openTab('settings')}
            build={(question) => {
              const opt = boat.scoring.find((o) => o.id === plan.scoringOptionId);
              const ctx = buildPlanContext(
                boat,
                {
                  courseName: course?.name ?? '',
                  windSource: plan.windSource,
                  model: plan.windSource === 'forecast' ? forecast && modelLabel(forecast.model) : undefined,
                  forecastFetched: plan.windSource === 'forecast' && forecast ? localIso(forecast.fetchedAt) : undefined,
                  route,
                  corrected: opt
                    ? {
                        option: STANDARD_SCORING_OPTIONS.find((o) => o.id === opt.id)?.label ?? opt.id,
                        tot: formatDuration(corrected('ToT', route.elapsedSec, opt, route.rhumbNm)),
                        tod: formatDuration(corrected('ToD', route.elapsedSec, opt, route.rhumbNm)),
                      }
                    : undefined,
                },
                question,
              );
              // The crew's notes along the course (any wind: the plan spans hours).
              if (course?.marks.length) ctx.localKnowledge = knowledgeHints(course.marks);
              return ctx;
            }}
          />
        )}
      </div>
    </div>
  );
}

function RouteSummary({ route, boat, scoringOptionId, onScoring }: { route: RouteResult; boat: BoatProfile; scoringOptionId: string; onScoring: (id: string) => void }) {
  const opt = boat.scoring.find((o) => o.id === scoringOptionId);
  return (
    <>
      <section className="card">
        <h3>Αποτέλεσμα</h3>
        <div className="summary-grid">
          <div>
            <div className="tile-label">Χρόνος</div>
            <div className="big-num">{fmtHM(route.elapsedSec)}</div>
          </div>
          <div>
            <div className="tile-label">Τερματισμός</div>
            <div className="big-num">{fmtTime(route.end)}</div>
          </div>
          <div>
            <div className="tile-label">Απόσταση</div>
            <div className="big-num">{route.rhumbNm.toFixed(1)} NM</div>
            <div className="muted small">πλεύση {route.sailedNm.toFixed(1)} NM</div>
          </div>
        </div>
        <label className="stack">
          Διορθωμένος χρόνος (εκτίμηση)
          <select value={scoringOptionId} onChange={(e) => onScoring(e.target.value)}>
            {STANDARD_SCORING_OPTIONS.filter((o) => boat.scoring.some((s) => s.id === o.id)).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {opt && (
          <p>
            ToT: <strong>{formatDuration(corrected('ToT', route.elapsedSec, opt, route.rhumbNm))}</strong> · ToD:{' '}
            <strong>{formatDuration(corrected('ToD', route.elapsedSec, opt, route.rhumbNm))}</strong>
          </p>
        )}
      </section>
      {route.legs.map((leg, i) => (
        <LegCard key={i} leg={leg} index={i + 1} boat={boat} />
      ))}
    </>
  );
}

function LegCard({ leg, index, boat }: { leg: LegResult; index: number; boat: BoatProfile }) {
  const m = leg.modeShare;
  const modes = [
    m.upwind > 0.05 && `όρτσα ${pct(m.upwind)}`,
    m.reach > 0.05 && `ανοιχτά ${pct(m.reach)}`,
    m.downwind > 0.05 && `πρίμα ${pct(m.downwind)}`,
  ].filter(Boolean);
  return (
    <section className="card leg">
      <h3>
        {index}. {leg.from.name} → {leg.to.name}
      </h3>
      <div className="leg-grid">
        <span>⏱ {fmtHM(leg.durationSec)}</span>
        <span>ETA {fmtTime(leg.end)}</span>
        <span>{leg.rhumbNm.toFixed(1)} NM</span>
        <span>
          {leg.avgTws.toFixed(0)} kt (max {leg.maxTws.toFixed(0)}) από {leg.avgTwd.toFixed(0)}°
        </span>
        <span>{modes.join(' · ')}</span>
        <span>
          {leg.tacks > 0 && `${leg.tacks} ${leg.tacks === 1 ? 'αναστροφή' : 'αναστροφές'}`} {leg.gybes > 0 && `${leg.gybes} ${leg.gybes === 1 ? 'υποσταύρωση' : 'υποσταυρώσεις'}`}
          {leg.tacks + leg.gybes === 0 && 'χωρίς μανούβρες'}
        </span>
      </div>
      <div className="chips">
        {leg.sails.map((s, i) => (
          <span key={i} className="chip static" style={{ borderColor: sailColor(boat, s.sailId) }}>
            {boat.sails.find((x) => x.id === s.sailId)?.name ?? s.sailId}
            <span className="muted small"> {new Date(s.from).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
