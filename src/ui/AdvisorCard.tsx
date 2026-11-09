import { useState } from 'react';
import { useApp } from './AppContext';
import { useStoredState } from './hooks';
import { askAdvisor, AdvisorError } from '../ai/client';
import type { AdvisorContext, AdvisorResponse, AdvisorWhen } from '../ai/types';

const WHEN: Record<AdvisorWhen, string> = { now: 'Τώρα', soon: 'Σύντομα', watch: 'Πρόσεξε' };

interface Stored {
  res?: AdvisorResponse;
  at?: number;
  question?: string;
}

/**
 * Asks the AI tactician about the current numbers. The parent builds the
 * context (all calculations stay in the app); this card only sends it and
 * shows the reply.
 */
export function AdvisorCard({
  storageKey,
  title,
  presets,
  build,
  disabledReason,
  onOpenSettings,
}: {
  storageKey: string;
  title: string;
  presets: string[];
  build: (question?: string) => AdvisorContext | undefined;
  disabledReason?: string;
  onOpenSettings?: () => void;
}) {
  const { settings } = useApp();
  const [stored, setStored] = useStoredState<Stored>(storageKey, {});
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const configured = settings.aiUrl.trim() !== '' && settings.aiCode.trim() !== '';

  const ask = async (q?: string) => {
    const ctx = build(q?.trim() || undefined);
    if (!ctx) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await askAdvisor({ url: settings.aiUrl, code: settings.aiCode }, ctx);
      setStored({ res, at: Date.now(), question: q?.trim() || undefined });
      setQuestion('');
    } catch (e) {
      setError(e instanceof AdvisorError ? e.message : 'Απρόσμενο σφάλμα.');
    } finally {
      setBusy(false);
    }
  };

  const ageMin = stored.at ? Math.round((Date.now() - stored.at) / 60_000) : undefined;
  const reply = stored.res?.reply;

  return (
    <section className="card advisor" aria-busy={busy}>
      <div className="advisor-head">
        <h3>✦ {title}</h3>
        {ageMin !== undefined && <span className="muted small">{ageMin < 1 ? 'μόλις τώρα' : `πριν ${ageMin}′`}</span>}
      </div>

      {!configured ? (
        <p className="small">
          Ο σύμβουλος AI χρειάζεται τη διεύθυνση του server και κωδικό πρόσβασης.{' '}
          {onOpenSettings && (
            <button className="link inline" onClick={onOpenSettings}>
              Άνοιξε τις Ρυθμίσεις →
            </button>
          )}
        </p>
      ) : (
        <>
          <div className="chips advisor-presets">
            <button className="chip small-chip primary-chip" disabled={busy || !!disabledReason} onClick={() => ask()}>
              {busy ? 'Σκέφτεται…' : 'Τι να κάνω;'}
            </button>
            {presets.map((p) => (
              <button key={p} className="chip small-chip" disabled={busy || !!disabledReason} onClick={() => ask(p)}>
                {p}
              </button>
            ))}
          </div>
          <form
            className="row advisor-ask"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ή γράψε ερώτηση…"
              maxLength={500}
              enterKeyHint="send"
              aria-label="Ερώτηση στον σύμβουλο"
            />
            <button className="btn" disabled={busy || !question.trim() || !!disabledReason}>
              Ρώτα
            </button>
          </form>
          {disabledReason && <p className="muted small">{disabledReason}</p>}
        </>
      )}

      {error && <p className="warn-text">{error}</p>}

      {reply && (
        <div className={`advisor-reply ${busy ? 'stale' : ''}`}>
          {stored.question && <p className="muted small">«{stored.question}»</p>}
          <p className="advisor-summary">{reply.summary}</p>
          {reply.actions.length > 0 && (
            <ol className="advisor-actions">
              {reply.actions.map((a, i) => (
                <li key={i} className={`when-${a.when}`}>
                  <span className="when">{WHEN[a.when]}</span>
                  {a.text}
                </li>
              ))}
            </ol>
          )}
          {reply.caution && <p className="advisor-caution">⚠ {reply.caution}</p>}
          <p className="muted small">
            Συμβουλή AI με βάση τα νούμερα της εφαρμογής — η απόφαση είναι του κυβερνήτη.
            {stored.res?.fallback && ' (απάντησε εναλλακτικό μοντέλο)'}
          </p>
        </div>
      )}
    </section>
  );
}
