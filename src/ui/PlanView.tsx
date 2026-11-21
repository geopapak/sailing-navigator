import { useEffect, useMemo, useState } from 'react';
import { useApp } from './AppContext';
import { localToMs, msToLocal, useNav } from './NavContext';
import { DateTimeField } from './DateTimeField';
import { useOnline } from './CruiseViews';
import { PLAN_TEXT, coverage, forecastStatus, planState, type PlanTarget } from '../routing/planTarget';
import type { Race } from '../race/types';
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
import { optionLabel, scoringChoices, scoringOptionFor } from '../scoring/options';
import { sailColor } from './PolarChart';
import { BtnIcon, Icon } from './Icons';
import { useStoredState } from './hooks';
import { AdvisorCard } from './AdvisorCard';
import { buildPlanContext, localIso } from '../ai/context';
import { openTab } from './openTab';
import type { BoatProfile } from '../boat/types';
import { useLaylines } from './useLaylines';
import { useSessionMarks } from './useSession';
import { useRace } from './RaceContext';
import { MAP_TEXT } from './sessionText';
import { date, dayTime, dir, num, pct as fpct, qty, span, time } from '../format';

const fmtTime = (ms: number) => dayTime(ms);
const fmtHM = (sec: number) => span(sec);
const pct = (x: number) => fpct(x * 100);

/** P-067 §Μ: the map of the race setup, before «Έναρξη» (the race as typed, not saved). */
export interface PlanPrep {
  race: Pick<Race, 'id' | 'name' | 'marks' | 'scoringOptionId'>;
  start?: number;
  /** The start day when the time is missing. */
  day?: number;
  onBack: () => void;
}

export function PlanView({ prep }: { prep?: PlanPrep } = {}) {
  const { activeBoat: boat, settings } = useApp();
  const nav = useNav();
  const online = useOnline();
  const lay = useLaylines();
  // P-034: inside a session the map shows the session's own marks (read only), not the saved course.
  const sm = useSessionMarks();
  const inSession = !prep && sm.from === 'session';
  const race = useRace();
  // P-067 §Λ: the plan target. A race (setup, or its session): its start and marks; else «Διαδρομές μου».
  const sessionRace = inSession && race.kind === 'race' ? race.session : undefined;
  const target: PlanTarget = prep
    ? { raceId: prep.race.id, start: prep.start, day: prep.day, marks: prep.race.marks, label: prep.race.name }
    : sessionRace
      ? { raceId: sessionRace.id, start: sessionRace.start, marks: sessionRace.marks, label: sessionRace.name }
      : nav.coursesTarget;
  const raceTarget = !!target.raceId;
  useEffect(() => {
    if (target.raceId) nav.loadRacePlan(target.raceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.raceId]);
  const stored = target.raceId ? (nav.racePlans[target.raceId] ?? undefined) : undefined;
  const pState = raceTarget ? planState(stored, target, nav.forecast?.fetchedAt) : 'none';
  const track = inSession ? race.session?.track : undefined;
  const lastPoint = track?.length ? track[track.length - 1] : undefined;
  // Without GPS the map keeps the last known position of the session.
  const noFix = inSession && !nav.gps.fix;
  const { course, plan, setPlan, forecast } = nav;
  const [addMode, setAddMode] = useState(false);
  const [simT, setSimT] = useState<number>();
  const [fitKey, setFitKey] = useState(course?.id ?? '');
  const [ui, setUi] = useStoredState<{ bigMap: boolean }>('plan-ui', { bigMap: false });

  const marks = raceTarget ? target.marks : (course?.marks ?? []);
  const setMarks = (m: Mark[]) => !raceTarget && course && nav.updateCourse({ ...course, marks: m });
  // Inside a race that started, «Υπολογισμός» goes from the boat's position (as «Ξανά από εδώ», KA-Λ4).
  const fix = nav.gps.fix;
  const fromHere = !!sessionRace && Date.now() > sessionRace.start && !!fix && sm.index < sessionRace.marks.length;
  const computeTarget: PlanTarget = fromHere
    ? { start: Date.now(), marks: [{ id: 'gps', name: 'Θέση', lat: fix!.lat, lon: fix!.lon }, ...sessionRace!.marks.slice(Math.max(1, sm.index))], label: target.label }
    : target;
  const compute = () => nav.computePlan(computeTarget, fromHere ? { transient: true } : undefined);

  // Time shown on the map (wind arrows + simulated boat position).
  const route = raceTarget ? ((fromHere && nav.transientPlan) || stored?.route) : nav.planned;
  const tMin = route?.start ?? forecast?.times[0] ?? Date.now();
  const tMax = route?.end ?? forecast?.times[forecast.times.length - 1] ?? Date.now();
  // Before a route exists the arrows show the wind at the start (QA Μ3), not the forecast's first hour.
  const clampT = (x: number) => Math.min(Math.max(x, tMin), tMax);
  const t = simT !== undefined ? clampT(simT) : (route?.start ?? (target.start !== undefined ? clampT(target.start) : tMin));

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

  const fs = raceTarget
    ? forecastStatus({
        target,
        forecast,
        modelLabel: forecast ? modelLabel(forecast.model) : '',
        now: Date.now(),
        online,
        model: normalizeModel(plan.model),
        estEnd: stored?.route.end,
      })
    : undefined;
  const forecastOk = plan.windSource === 'uniform' || !fs || fs.canCompute;
  const timeOk = computeTarget.start !== undefined;
  const canCompute = marks.length >= 2 && !nav.planStatus.busy && forecastOk && timeOk;
  const computeLabel = nav.planStatus.busy ? 'Υπολογισμός…' : route ? PLAN_TEXT.again : 'Υπολογισμός βέλτιστης πορείας';
  const fsLines = fs ? (plan.windSource === 'uniform' ? fs.lines.filter((l) => !l.startsWith('Η πρόγνωση φτάνει') && l !== PLAN_TEXT.none) : fs.lines) : [];
  const forecastLabel = fsLines.length > 0 && (
    <div className="plan-fc">
      {fsLines.map((l) => (
        <div key={l} className={`fc ${fs!.warn && l !== fsLines[0] ? 'warn' : ''} ${l.startsWith('Η ώρα') || l.startsWith('Η πρόγνωση φτάνει') || l.startsWith('Χωρίς ίντερνετ') ? 'warn' : ''}`} data-testid="forecast-label" role="status">
          <span>{l}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`plan ${ui.bigMap ? 'big-map' : ''} ${prep ? 'prep' : ''}`}>
      {prep && (
        <header className="phead" data-testid="prep-head">
          <button type="button" className="btn backb" aria-label="Πίσω στον αγώνα" onClick={prep.onBack}>
            <BtnIcon name="back" />
            Αγώνας
          </button>
          <h1 title={`Βέλτιστη διαδρομή · ${prep.race.name}`}>Βέλτιστη διαδρομή · {prep.race.name || 'Αγώνας'}</h1>
          {forecastLabel}
        </header>
      )}
      {noFix && (
        <p className="msg warn" role="status">
          {MAP_TEXT.noFix}
        </p>
      )}
      <div className="plan-map">
        <MapView
          boat={boat}
          marks={inSession ? sm.marks : marks}
          editable={!inSession && !raceTarget}
          addMode={addMode && !inSession && !raceTarget}
          onAdd={(p) => {
            if (!course) return;
            const n = marks.length;
            setMarks([...marks, { id: `m-${Date.now().toString(36)}`, name: n === 0 ? 'Εκκίνηση' : `Σημαδούρα ${n}`, lat: p.lat, lon: p.lon }]);
          }}
          onMove={(id, p) => setMarks(marks.map((m) => (m.id === id ? { ...m, ...p } : m)))}
          planned={route}
          plannedFaded={raceTarget && !fromHere && pState === 'stale'}
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
            <button type="button" className="map-fab map-fab-go btn primary" disabled={!canCompute} onClick={compute}>
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
              {sim && ` · ${qty(sim.tp.tws, 'kt', 0)} από ${dir(sim.tp.twd, settings)} · ${sim.tp.sailId ?? ''}`}
            </div>
          </div>
        )}
      </div>

      <div className="plan-panel">
        {prep ? (
          <section className="card">
            <h3>Διαδρομή</h3>
            {marks.length ? (
              <ol className="marks" aria-label="Σημεία του αγώνα, μόνο για ανάγνωση">
                {marks.map((m, i) => (
                  <li key={m.id}>
                    <span className="mark-idx">{i === 0 ? 'Ε' : i === marks.length - 1 ? 'Τ' : i}</span>
                    <span>{m.name}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted small">{MAP_TEXT.noMarks}</p>
            )}
          </section>
        ) : inSession ? (
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
                const c = nav.newCourse(`Διαδρομή ${date(Date.now())}`);
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
                        <Icon name="close" size={20} />
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
          <h3>{raceTarget ? 'Πηγή ανέμου' : 'Άνεμος & εκκίνηση'}</h3>
          {sessionRace && forecastLabel}
          {!raceTarget && (
            // «Διαδρομές μου» only (KA-Λ14): a race has its own start.
            <DateTimeField
              label="Ώρα εκκίνησης"
              testId="plan-start"
              value={localToMs(plan.startLocal)}
              onChange={(v) => setPlan({ startLocal: v.ms !== undefined ? msToLocal(v.ms) : '' })}
            />
          )}
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
                <div className="brow">
                  <button className="btn primary" disabled={nav.forecastStatus.busy || (raceTarget && !online)} onClick={() => nav.loadForecast(target)}>
                    {nav.forecastStatus.busy ? 'Λήψη…' : forecast ? 'Ανανέωση πρόγνωσης' : 'Λήψη πρόγνωσης'}
                  </button>
                  {nav.forecastStatus.busy && (
                    <button type="button" className="btn" onClick={nav.cancelForecast}>
                      Άκυρο
                    </button>
                  )}
                </div>
                {forecast && !raceTarget && (
                  <p className="muted small">
                    {modelLabel(forecast.model)} · λήψη {dayTime(forecast.fetchedAt)} · έως{' '}
                    {fmtTime(forecast.times[forecast.times.length - 1])}
                  </p>
                )}
                {nav.forecastStatus.error && <p className="warn-text">{nav.forecastStatus.error}</p>}
              </div>
            </>
          ) : (
            <div className="full">
              <NumberStepper label="TWS" unit="kt" value={plan.tws} onChange={(v) => setPlan({ tws: v ?? 0 })} small={1} big={3} min={0} max={50} />
              <NumberStepper label="TWD" unit="°T" value={plan.twd} onChange={(v) => setPlan({ twd: v ?? 0 })} small={5} big={20} wrap />
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

        <ModelCompareCard target={target} />

        <div className="compute-bar">
          <button className="btn primary big-btn" disabled={!canCompute} onClick={compute} data-testid="plan-compute">
            {computeLabel}
          </button>
        </div>
        {marks.length < 2 && <p className="muted small">Βάλε τουλάχιστον εκκίνηση και μία σημαδούρα ή τερματισμό.</p>}
        {!timeOk && marks.length >= 2 && (
          <ul className="miss">
            <li>{PLAN_TEXT.noTime}</li>
          </ul>
        )}
        {nav.planStatus.error && (
          <div className="fc warn" role="alert">
            <span>{nav.planStatus.error.startsWith('Βάλε') ? nav.planStatus.error : `${PLAN_TEXT.failed} ${nav.planStatus.error}`}</span>
            {canCompute && (
              <button type="button" className="btn small-btn" onClick={compute}>
                Ξανά
              </button>
            )}
          </div>
        )}
        {raceTarget && route && !fromHere && pState === 'stale' && (
          <p className="calc" data-testid="plan-stale">
            {PLAN_TEXT.stale}
          </p>
        )}
        {raceTarget && route && !fromHere && pState === 'oldForecast' && stored?.forecastAt !== undefined && (
          <p className="calc" data-testid="plan-old-forecast">
            {PLAN_TEXT.oldForecast(stored.forecastAt)}
          </p>
        )}
        {raceTarget && route && fs && coverage(forecast, target.start, route.end) === 'partial' && plan.windSource === 'forecast' && forecast && (
          <div className="fc warn" role="status">
            <span>{PLAN_TEXT.partial(forecast.times[forecast.times.length - 1])}</span>
          </div>
        )}

        {route && (
          <div className={raceTarget && !fromHere && pState === 'stale' ? 'faded' : ''} data-testid="plan-result">
            <RouteSummary route={route} boat={boat} scoringOptionId={plan.scoringOptionId} onScoring={(id) => setPlan({ scoringOptionId: id })} />
          </div>
        )}
        {route && (
          <AdvisorCard
            storageKey="advisor-plan"
            title="Ανάλυση σχεδίου (AI)"
            presets={['Ποια πλευρά πληρώνει;', 'Κίνδυνοι;', 'Πανιά;']}
            onOpenSettings={() => openTab('settings')}
            build={(question) => {
              const ids = planScoringIds(boat);
              const optId = ids.includes(plan.scoringOptionId) ? plan.scoringOptionId : ids[0];
              const opt = scoringOptionFor({ boat }, { scoringOptionId: optId });
              const ctx = buildPlanContext(
                boat,
                {
                  courseName: raceTarget ? target.label : (course?.name ?? ''),
                  windSource: plan.windSource,
                  model: plan.windSource === 'forecast' ? forecast && modelLabel(forecast.model) : undefined,
                  forecastFetched: plan.windSource === 'forecast' && forecast ? localIso(forecast.fetchedAt) : undefined,
                  route,
                  corrected: opt
                    ? {
                        option: optionLabel(optId),
                        tot: formatDuration(corrected('ToT', route.elapsedSec, opt, route.rhumbNm)),
                        tod: formatDuration(corrected('ToD', route.elapsedSec, opt, route.rhumbNm)),
                      }
                    : undefined,
                },
                question,
              );
              // The crew's notes along the course (any wind: the plan spans hours).
              if (marks.length) ctx.localKnowledge = knowledgeHints(marks);
              return ctx;
            }}
          />
        )}
      </div>
    </div>
  );
}

/** The scoring ids of the plan's select: the boat's certificate options, else GPH, and «Χωρίς διόρθωση» (P-056 §Α). */
export function planScoringIds(boat: BoatProfile): string[] {
  return [...new Set(scoringChoices(boat).map((c) => c.id))];
}

function RouteSummary({ route, boat, scoringOptionId: wanted, onScoring }: { route: RouteResult; boat: BoatProfile; scoringOptionId: string; onScoring: (id: string) => void }) {
  const ids = planScoringIds(boat);
  const scoringOptionId = ids.includes(wanted) ? wanted : ids[0];
  const opt = scoringOptionFor({ boat }, { scoringOptionId });
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
            <div className="big-num">{qty(route.rhumbNm, 'NM')}</div>
            <div className="muted small">πλέουμε {qty(route.sailedNm, 'NM')}</div>
          </div>
        </div>
        <label className="stack">
          Διορθωμένος χρόνος (εκτίμηση)
          <select value={scoringOptionId} onChange={(e) => onScoring(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {optionLabel(id)}
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
  const { settings } = useApp();
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
        <span>
          <BtnIcon name="timer" />
          {fmtHM(leg.durationSec)}
        </span>
        <span>ETA {fmtTime(leg.end)}</span>
        <span>{qty(leg.rhumbNm, 'NM')}</span>
        <span>
          {qty(leg.avgTws, 'kt', 0)} (έως {num(leg.maxTws, 0)}) από <span data-dir>{dir(leg.avgTwd, settings)}</span>
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
            <span className="muted small"> {time(s.from)}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
