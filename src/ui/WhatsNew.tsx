import { useEffect, useState } from 'react';
import RELEASES from '../releases.json';

export interface Release {
  version: string;
  date: string;
  title: string;
  app: string[];
  server: string[];
}

export const releases = RELEASES as Release[];

const KEY = 'seen-version';

/** -1 / 0 / 1 for dotted versions. */
export function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Releases newer than `seen` up to `current`, newest first. */
export function releasesSince(seen: string, current: string): Release[] {
  return releases.filter((r) => cmpVersion(r.version, seen) > 0 && cmpVersion(r.version, current) <= 0);
}

function ReleaseItems({ r }: { r: Release }) {
  return (
    <>
      <p className="release-title">
        <b>{r.version}</b> · {r.title} <span className="muted small">{new Date(r.date).toLocaleDateString('el-GR')}</span>
      </p>
      <ul>
        {[...r.app, ...r.server].map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </>
  );
}

/** Shown once after the app updates: what changed since the version last seen on this device. */
export function WhatsNew() {
  const current = __APP_VERSION__;
  const [news, setNews] = useState<Release[]>([]);
  useEffect(() => {
    try {
      const seen = localStorage.getItem(KEY);
      if (seen && cmpVersion(current, seen) > 0) setNews(releasesSince(seen, current).slice(0, 3));
      // A fresh install has nothing "new": just remember the version.
      if (!seen) localStorage.setItem(KEY, current);
    } catch {
      /* storage unavailable */
    }
  }, [current]);
  if (!news.length) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, current);
    } catch {
      /* ignore */
    }
    setNews([]);
  };
  return (
    <section className="card whats-new" role="status">
      <h3>Τι νέο</h3>
      {news.map((r) => (
        <ReleaseItems key={r.version} r={r} />
      ))}
      <button className="btn primary" onClick={close}>
        OK
      </button>
    </section>
  );
}

/** Full history for the guide. */
export function ReleaseHistory() {
  return (
    <section className="card release-history">
      <h3>Ιστορικό εκδόσεων</h3>
      <p className="muted small">Τρέχουσα έκδοση: {__APP_VERSION__}</p>
      {releases.map((r) => (
        <div key={r.version}>
          <p className="release-title">
            <b>{r.version}</b> · {r.title} <span className="muted small">{new Date(r.date).toLocaleDateString('el-GR')}</span>
          </p>
          {r.app.length > 0 && (
            <ul>
              {r.app.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          {r.server.length > 0 && (
            <>
              <p className="muted small">Server:</p>
              <ul className="muted">
                {r.server.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
