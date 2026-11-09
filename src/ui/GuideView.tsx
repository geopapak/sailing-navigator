import { GUIDE } from './guideText';
import { ReleaseHistory } from './WhatsNew';

export function GuideView() {
  return (
    <div className="guide">
      <h2>Οδηγός</h2>
      <p className="muted">Πάτα μια ενότητα για να ανοίξει. Στο Live, πάτα οποιοδήποτε πλακίδιο για σύντομη εξήγηση.</p>
      {GUIDE.map((s, i) => (
        <details key={s.title} className="card" open={i === 0}>
          <summary>
            <strong>{s.title}</strong>
          </summary>
          <ul>
            {s.items.map((t) => {
              const m = /^([^:]{1,24}): (.*)$/s.exec(t);
              return <li key={t}>{m ? <><strong>{m[1]}:</strong> {m[2]}</> : t}</li>;
            })}
          </ul>
        </details>
      ))}
      <ReleaseHistory />
    </div>
  );
}
