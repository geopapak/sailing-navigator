import { useEffect, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useRace } from './RaceContext';
import { MapView } from './MapView';
import { fetchDepthInfo } from './nauticalStyle';
import { hhmm } from './SessionBar';
import { CRUISE_TEXT as CT, MAP_TEXT } from './sessionText';
import { DestSheet, depthNum, n1, useCruiseDepth } from './CruiseViews';
import { useCruiseNav } from './useSession';
import { SAMPLE_TIMEOUT_MS, type DestPoint } from '../race/cruise';
import type { LatLon } from '../nav/geo';

/**
 * Cruise maps (P-036), loaded lazily with MapLibre: «Πάτα στον χάρτη» to pick a
 * destination, and the session's «Χάρτης» with the line to the destination, the
 * 5 m line and «Βάθος εδώ». Always «Ενδεικτικό, όχι για ναυσιπλοΐα».
 */

/** Tap on the sea sets the point; its name is «Σημείο ΩΩ:ΛΛ» and can be changed (AC 1). */
export function MapPick({ onDone, onCancel }: { onDone: (p: DestPoint) => void; onCancel: () => void }) {
  const { activeBoat } = useApp();
  const nav = useNav();
  const [pt, setPt] = useState<LatLon>();
  const [name, setName] = useState(() => CT.pointName(hhmm(Date.now())));
  const [land, setLand] = useState(false);
  const req = useRef<AbortController>();
  useEffect(() => () => req.current?.abort(), []);

  const pick = (p: LatLon) => {
    setPt(p);
    setLand(false);
    // On land? One EMODnet answer for the point the user tapped (online only); offline we cannot tell.
    req.current?.abort();
    if (navigator.onLine === false) return;
    const ctl = new AbortController();
    req.current = ctl;
    const t = window.setTimeout(() => ctl.abort(), SAMPLE_TIMEOUT_MS);
    fetchDepthInfo(p.lat, p.lon, ctl.signal)
      .then((x) => req.current === ctl && setLand(x.land))
      .catch(() => undefined)
      .finally(() => window.clearTimeout(t));
  };

  return (
    <div className="map-pick">
      <p className="small">{CT.mapHint}</p>
      <div className="plan-map">
        <MapView
          boat={activeBoat}
          marks={pt ? [{ id: 'dest', name, lat: pt.lat, lon: pt.lon }] : []}
          editable={false}
          addMode
          addHint=""
          onAdd={pick}
          showIsochrones={false}
          showSeamarks={nav.plan.showSeamarks}
          chart={nav.plan.mapChart}
          showDepth={nav.plan.showDepth}
          boatPos={nav.gps.fix}
          shallowLine
        >
          <div className="map-disc">{CT.notNav}</div>
        </MapView>
      </div>
      {pt && (
        <>
          {land && (
            <p className="msg warn" role="status">
              {CT.onLand}
            </p>
          )}
          <label className="field">
            <span>{CT.name}</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
        </>
      )}
      <div className="g2 fit">
        <button type="button" className="btn big-btn primary" disabled={!pt} onClick={() => pt && onDone({ name: name.trim() || CT.pointName(hhmm(Date.now())), lat: pt.lat, lon: pt.lon })}>
          {CT.usePoint}
        </button>
        <button type="button" className="btn big-btn" onClick={onCancel}>
          {CT.cancel}
        </button>
      </div>
    </div>
  );
}

/** «Χάρτης» of a cruise (AC 6): track, line to the destination, 5 m line, depth here. */
export function CruiseMap() {
  const { activeBoat } = useApp();
  const nav = useNav();
  const race = useRace();
  const c = useCruiseNav();
  const depth = useCruiseDepth();
  const [sheet, setSheet] = useState(false);
  const r = race.session;
  const track = r?.track;
  const last = track?.length ? track[track.length - 1] : undefined;
  const fix = nav.gps.fix;
  const destLine = c.name && c.pos ? [c.pos, ...c.marks.slice(Math.min(c.next, c.marks.length - 1))] : undefined;
  const here =
    depth.sounder !== undefined
      ? `${depthNum(depth.sounder)} μ`
      : depth.chart?.d
        ? CT.depthChart(depthNum(depth.chart.d.depth))
        : '—';
  return (
    <div className="plan cruise-map" data-testid="cruise-map">
      {!fix && (
        <p className="msg warn" role="status">
          {MAP_TEXT.noFix}
        </p>
      )}
      <div className="plan-map">
        <MapView
          boat={activeBoat}
          marks={c.marks}
          editable={false}
          addMode={false}
          showIsochrones={false}
          showSeamarks={nav.plan.showSeamarks}
          chart={nav.plan.mapChart}
          showDepth={nav.plan.showDepth}
          boatPos={fix ?? last}
          track={track}
          destLine={destLine}
          fitWith={c.pos}
          fitKey={c.key}
          shallowLine
        >
          <div className="map-disc">{CT.notNav}</div>
        </MapView>
      </div>
      <div className="plan-panel">
        <p className="pct-legend small cruise-legend">
          <span>
            <i className="trk" />
            {CT.legendTrack}
          </span>
          {c.name && (
            <span>
              <i className="dst" />
              {CT.legendDest}
            </span>
          )}
          <span>
            <i className="shl" />
            {CT.legendShallow}
          </span>
        </p>
        {c.name ? (
          <div className="next-line">
            <span className="nl-name">{c.name}</span>
            <span>
              {n1(c.leftNm)} νμ · {c.eta ? `ETA ${hhmm(c.eta.at)}` : fix ? 'ETA —' : CT.noGps}
            </span>
          </div>
        ) : (
          <button type="button" className="btn big-btn wide" onClick={() => setSheet(true)}>
            {CT.setDest}
          </button>
        )}
        {c.name && race.paused && (
          <p className="small muted" role="status">
            {CT.etaPaused}
          </p>
        )}
        <div className="next-line" data-testid="depth-here">
          <span>{CT.depthHere}</span>
          <span>{here}</span>
        </div>
      </div>
      {sheet && <DestSheet onClose={() => setSheet(false)} />}
    </div>
  );
}
