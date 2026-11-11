import { knowledgeHints } from '../knowledge/match';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { useNav } from './NavContext';
import { useStoredState } from './hooks';
import { Icon } from './Icons';
import { openTab } from './openTab';
import { advisorConfig, advisorReady, askChat, AdvisorError } from '../ai/client';
import { modelsContext, type ChatContext, type ChatMessage, type ChatSource } from '../ai/chat';
import { buildPlanContext, localIso } from '../ai/context';
import { getLiveSnapshot } from '../ai/snapshot';
import { modelLabel } from '../weather/models';

interface Entry extends ChatMessage {
  at: number;
  tools?: string[];
  sources?: ChatSource[];
  fallback?: boolean;
}

const SUGGESTIONS = [
  'Τι κάνω τώρα;',
  'Τι πανί για 16 kt στις 50°;',
  'Πώς θα είναι ο άνεμος στην Αίγινα αύριο 11:00–17:00;',
  'Εγώ αριστερές, αυτός δεξιές, στη ζώνη της πάνω σημαδούρας. Ποιος έχει δικαίωμα;',
  'Πώς ρυθμίζω μαΐστρα και τζένοα σε 20 kt με κοντό κύμα;',
  'Πόσο χρόνο δίνουμε στους αντιπάλους για 20 NM;',
];

const TOOL_LABEL: Record<string, string> = {
  boat_targets: 'polars',
  ratings_math: 'χρονοδιόρθωση',
  weather_models: 'μοντέλα καιρού',
  distance_bearing: 'αποστάσεις',
  web_search: 'αναζήτηση web',
};

/** Minimal, safe rendering of the advisor's text: paragraphs, "- " lists, **bold**. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <b key={i}>{part.slice(2, -2)}</b> : part,
  );
}

function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>);
    para = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) {
      flushPara();
      list.push(m[1]);
    } else if (!line) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^#+\s*/, ''));
    }
  }
  flushPara();
  flushList();
  return <div className="rich">{blocks}</div>;
}

export function ChatView() {
  const { settings, activeBoat, boats } = useApp();
  const nav = useNav();
  const [log, setLog] = useStoredState<{ entries: Entry[] }>('advisor-chat', { entries: [] });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [useData, setUseData] = useStoredState<{ live: boolean; plan: boolean; models: boolean }>('advisor-chat-data', {
    live: true,
    plan: true,
    models: true,
  });
  const endRef = useRef<HTMLDivElement>(null);
  const cfg = advisorConfig(settings);
  const configured = advisorReady(cfg);

  const live = getLiveSnapshot();
  const planned = nav.planned;
  const comparison = nav.comparison;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [log.entries.length, busy]);

  const buildContext = (): ChatContext => {
    const ctx: ChatContext = { now: localIso(Date.now()) };
    if (activeBoat) {
      ctx.boat = activeBoat;
      ctx.others = boats
        .filter((b) => b.id !== activeBoat.id && b.scoring?.length)
        .slice(0, 30)
        .map((b) => ({ name: b.name, gph: b.gph, scoring: b.scoring }));
    }
    if (useData.live && live) {
      ctx.live = live.ctx.live;
      ctx.nav = live.ctx.nav;
    }
    if (useData.plan && planned && activeBoat) {
      const p = nav.plan;
      ctx.plan = buildPlanContext(activeBoat, {
        courseName: nav.course?.name ?? "—",
        windSource: p.windSource,
        model: p.windSource === 'forecast' && nav.forecast ? modelLabel(nav.forecast.model) : undefined,
        forecastFetched: p.windSource === 'forecast' && nav.forecast ? localIso(nav.forecast.fetchedAt) : undefined,
        route: planned,
      }).plan;
    }
    if (useData.models && comparison) ctx.models = modelsContext(comparison);
    // Local knowledge near us (or along the course) that fits the wind we know.
    const pos = live?.ctx.nav?.position;
    const where = pos ? pos : nav.course?.marks.length ? nav.course.marks : undefined;
    const wind = live?.ctx.live ? { tws: live.ctx.live.tws, twd: live.ctx.nav?.observedTwd } : undefined;
    ctx.localKnowledge = knowledgeHints(where, wind);
    return ctx;
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const user: Entry = { role: 'user', text: q, at: Date.now() };
    const history = [...log.entries, user];
    setLog({ entries: history });
    setDraft('');
    setBusy(true);
    setError(undefined);
    try {
      // Keep the last turns that fit the server's limit, starting with a question.
      let msgs = history.map(({ role, text: t }) => ({ role, text: t }));
      if (msgs.length > 23) msgs = msgs.slice(-23);
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      const res = await askChat(cfg, { messages: msgs, context: buildContext() });
      setLog({
        entries: [...history, { role: 'assistant', text: res.text, at: Date.now(), tools: res.tools, sources: res.sources, fallback: res.fallback }],
      });
    } catch (e) {
      // Drop the unanswered question so the conversation stays question/answer pairs.
      setLog({ entries: log.entries });
      setDraft(q);
      setError(e instanceof AdvisorError ? e.message : 'Απρόσμενο σφάλμα.');
    } finally {
      setBusy(false);
    }
  };

  const ago = (ms: number) => {
    const m = Math.round((Date.now() - ms) / 60_000);
    return m < 1 ? 'τώρα' : `πριν ${m}′`;
  };

  return (
    <div className="chat">
      <section className="card chat-head">
        <div className="advisor-head">
          <h3>✦ Σύμβουλος</h3>
          {log.entries.length > 0 && (
            <button className="link inline" onClick={() => setLog({ entries: [] })} disabled={busy}>
              Νέα συζήτηση
            </button>
          )}
        </div>
        <p className="muted small">
          Ρώτα ό,τι θες: κανόνες, τακτική, πανιά, καιρό, ORC. Τα νούμερα τα υπολογίζει η εφαρμογή· ο σύμβουλος τα εξηγεί.
        </p>
        <div className="chips chat-data" aria-label="Δεδομένα που στέλνονται">
          <button className={`chip small-chip ${useData.live && live ? 'on' : ''}`} disabled={!live} onClick={() => setUseData({ ...useData, live: !useData.live })}>
            Live {live ? `(${ago(live.at)})` : '—'}
          </button>
          <button className={`chip small-chip ${useData.plan && planned ? 'on' : ''}`} disabled={!planned} onClick={() => setUseData({ ...useData, plan: !useData.plan })}>
            Σχέδιο {planned ? `(${new Date(planned.start).toLocaleDateString('el-GR', { weekday: 'short' })})` : '—'}
          </button>
          <button
            className={`chip small-chip ${useData.models && comparison ? 'on' : ''}`}
            disabled={!comparison}
            onClick={() => setUseData({ ...useData, models: !useData.models })}
          >
            Μοντέλα {comparison ? `(${comparison.series.length})` : '—'}
          </button>
        </div>
        {comparison && planned && Math.abs(comparison.start - planned.start) > 3_600_000 && (
          <p className="muted small">Η σύγκριση μοντέλων είναι για άλλη ώρα εκκίνησης από το σχέδιο ({localIso(comparison.start).slice(11, 16)}).</p>
        )}
        {nav.plan.startLocal && !planned && <p className="muted small">Χωρίς υπολογισμένη διαδρομή — ο σύμβουλος δεν θα ξέρει το σχέδιο.</p>}
        {!configured && (
          <p className="small">
            Για να μιλήσεις με τον σύμβουλο, συνδέσου στον λογαριασμό σου.{' '}
            <button className="link inline" onClick={() => openTab('settings')}>
              Άνοιξε τις Ρυθμίσεις →
            </button>
          </p>
        )}
      </section>

      {log.entries.length === 0 && configured && (
        <section className="chat-suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </section>
      )}

      <div className="chat-log" aria-live="polite">
        {log.entries.map((e, i) => (
          <div key={i} className={`bubble ${e.role}`}>
            {e.role === 'assistant' ? <RichText text={e.text} /> : <p>{e.text}</p>}
            {e.role === 'assistant' && (
              <div className="bubble-meta muted small">
                {e.tools && e.tools.length > 0 && <span>Χρησιμοποίησε: {e.tools.map((t) => TOOL_LABEL[t] ?? t).join(', ')} · </span>}
                {e.fallback && <span>εναλλακτικό μοντέλο · </span>}
                <span>{new Date(e.at).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}</span>
                {e.sources && e.sources.length > 0 && (
                  <ul className="sources">
                    {e.sources.slice(0, 5).map((s) => (
                      <li key={s.url}>
                        <a href={s.url} target="_blank" rel="noreferrer noopener">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="bubble assistant thinking">
            <p className="muted">Σκέφτεται και υπολογίζει…</p>
          </div>
        )}
        {error && <p className="warn-text">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
              e.preventDefault();
              send(draft);
            }
          }}
          placeholder={configured ? 'Γράψε ερώτηση…' : 'Συνδέσου πρώτα στις Ρυθμίσεις'}
          disabled={!configured}
          maxLength={4000}
          rows={2}
          aria-label="Ερώτηση στον σύμβουλο"
        />
        <button className="btn primary" disabled={busy || !draft.trim() || !configured} aria-label="Αποστολή">
          <Icon name="send" />
        </button>
      </form>
      <p className="muted small chat-foot">Συμβουλή AI — η απόφαση είναι του κυβερνήτη. Κόστος περίπου €0,05–0,15 ανά ερώτηση.</p>
    </div>
  );
}


