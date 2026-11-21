import { useCallback, useEffect, useState } from 'react';
import { INVITE_SLOW_MS, INVITE_TEXT, inviteError } from '../crew/inviteText';
import { useApp } from './AppContext';
import { DEFAULT_SERVER } from './settings';
import { askConfirm, showAlert } from './Dialogs';
import {
  ROLES,
  ROLE_LABEL,
  clearPendingInvite,
  crewApi,
  entryListText,
  inviteLink,
  shareText,
  type CrewPlace,
  type InvitePreview,
  type MemberCrew,
  type OwnedCrew,
  type RacePlan,
  type Role,
} from '../crew/api';
import type { BoatProfile } from '../boat/types';
import type { Race } from '../race/types';
import { isTrainingShare, type TrainingShare } from '../race/training';
import { SharedTrainingView } from './TrainingSummary';
import { dayStr } from './SessionBar';
import { BtnIcon } from './Icons';
import { dayTime } from '../format';

/** Loads my crews (P-022) when signed in. */
export function useCrews() {
  const { settings, account } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const token = settings.authToken;
  const [data, setData] = useState<{
    owned: OwnedCrew[];
    member: MemberCrew[];
  }>();
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    if (!account || !token) return;
    try {
      setData(await crewApi.list(server, token));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [account, server, token]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return {
    data,
    error,
    refresh,
    server,
    token,
    signedIn: !!account && !!token,
  };
}

const shareResult = (r: 'shared' | 'copied' | 'failed', what: string) =>
  r === 'copied' ? showAlert(`${what} αντιγράφηκε. Επικόλλησέ το στο WhatsApp ή όπου θέλεις.`) : r === 'failed' ? showAlert('Δεν στάλθηκε. Δοκίμασε ξανά.') : undefined;

/** Athlete card number with its own small save button. */
function CardField({ value, onSave, label }: { value: string | null; onSave: (v: string) => Promise<void>; label: string }) {
  const [v, setV] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(value ?? ''), [value]);
  return (
    <span className="crew-card-field">
      <input aria-label={label} placeholder="Αριθμός δελτίου" value={v} maxLength={20} onChange={(e) => setV(e.target.value)} />
      {v.trim() !== (value ?? '') && (
        <button
          className="btn small-btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(v.trim());
            } catch (e) {
              await showAlert((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Αποθήκευση
        </button>
      )}
    </span>
  );
}

/** Boats tab: the crew of my own boats, invitations, and the crews I sail with. */
export function CrewCard({ boats }: { boats: BoatProfile[] }) {
  const c = useCrews();
  const own = boats.filter((b) => b.isOwn);
  const [busy, setBusy] = useState(false);
  if (!c.signedIn) return null;

  const invite = async (b: BoatProfile) => {
    setBusy(true);
    try {
      const { crew } = await crewApi.ensure(c.server, c.token, {
        boatId: b.id,
        boatName: b.name,
        sailNo: b.sailNumber,
      });
      const inv = await crewApi.invite(c.server, c.token, crew.id, 'crew');
      const r = await shareText(`Πλήρωμα ${b.name}`, `Έλα στο πλήρωμα του σκάφους «${b.name}» στο Sailing Navigator. Ο σύνδεσμος ισχύει μία φορά, για 7 μέρες.`, inviteLink(inv.token));
      await shareResult(r, 'Ο σύνδεσμος');
      await c.refresh();
    } catch (e) {
      await showAlert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {own.map((b) => {
        const crew = c.data?.owned.find((x) => x.boatId === b.id);
        const members = crew?.members ?? [];
        const permanent = members.filter((m) => m.kind === 'crew');
        const noCard = permanent.filter((m) => !m.athleteCard).length;
        return (
          <section key={b.id} className="card crew">
            <h3>Πλήρωμα · {b.name}</h3>
            {permanent.length === 0 ? (
              <p className="muted small">Κανένα μέλος ακόμα. Στείλε πρόσκληση με σύνδεσμο (π.χ. στο WhatsApp). Τα μέλη μόνο βλέπουν τους αγώνες που τους στέλνεις.</p>
            ) : (
              <ul className="rows crew-list">
                {permanent.map((m) => (
                  <li key={m.userId}>
                    <span className="crew-name">
                      <strong>{m.name}</strong>
                      {!m.athleteCard && (
                        <span className="warn-text small">
                          {' '}
                          <BtnIcon name="warn" />
                          χωρίς δελτίο
                        </span>
                      )}
                    </span>
                    <CardField
                      label={`Αριθμός δελτίου αθλητή για ${m.name}`}
                      value={m.athleteCard}
                      onSave={async (v) => {
                        await crewApi.setCard(c.server, c.token, crew!.id, m.userId, v);
                        await c.refresh();
                      }}
                    />
                    <button
                      className="btn small-btn danger"
                      onClick={async () => {
                        if (!(await askConfirm(`Αφαίρεση του μέλους «${m.name}» από το πλήρωμα; Δεν θα βλέπει πια τους αγώνες σου.`, { ok: 'Αφαίρεση', danger: true }))) return;
                        await crewApi.remove(c.server, c.token, crew!.id, m.userId).catch((e) => showAlert((e as Error).message));
                        await c.refresh();
                      }}
                    >
                      Αφαίρεση
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {noCard > 0 && <p className="small muted">{noCard === 1 ? '1 μέλος δεν έχει' : `${noCard} μέλη δεν έχουν`} αριθμό δελτίου αθλητή. Τον βλέπετε μόνο εσύ και το μέλος.</p>}
            <div className="btn-row">
              <button className="btn primary" disabled={busy} onClick={() => invite(b)}>
                ＋ Πρόσκληση στο πλήρωμα
              </button>
              {permanent.length > 0 && (
                <button
                  className="btn"
                  onClick={async () => shareResult(await shareText(`Πλήρωμα ${b.name}`, entryListText(b.name, permanent)), 'Η λίστα')}
                >
                  <BtnIcon name="list" />
                  Λίστα για τη δήλωση συμμετοχής
                </button>
              )}
            </div>
          </section>
        );
      })}
      {(c.data?.member.length ?? 0) > 0 && (
        <section className="card crew">
          <h3>Πληρώματα όπου είμαι μέλος</h3>
          <ul className="rows crew-list">
            {c.data!.member.map((m) => (
              <li key={m.id}>
                <span className="crew-name">
                  <strong>{m.boatName}</strong>
                  <span className="muted small">
                    {' '}
                    · του/της {m.owner} · {m.kind === 'guest' ? 'καλεσμένος για έναν αγώνα' : 'μόνιμο πλήρωμα'}
                  </span>
                </span>
                {m.kind === 'crew' && (
                  <CardField
                    label="Ο αριθμός δελτίου αθλητή μου"
                    value={m.athleteCard}
                    onSave={async (v) => {
                      await crewApi.setCard(c.server, c.token, m.id, 'me', v);
                      await c.refresh();
                    }}
                  />
                )}
                <button
                  className="btn small-btn"
                  onClick={async () => {
                    if (!(await askConfirm(`Να φύγεις από το πλήρωμα του σκάφους «${m.boatName}»;`, { ok: 'Αποχώρηση', danger: true }))) return;
                    await crewApi.remove(c.server, c.token, m.id, 'me').catch((e) => showAlert((e as Error).message));
                    await c.refresh();
                  }}
                >
                  Αποχώρηση
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {c.error && <p className="warn-text small">Πλήρωμα: {c.error}</p>}
    </>
  );
}

const when = (t: number) => dayTime(t);

/** «Οι έξοδοί μου»: races and trainings that boat owners shared with me (read-only). */
export function SharedRaces() {
  const c = useCrews();
  const all = (c.data?.member ?? []).flatMap((m) =>
    // A guest sees only the race of the invitation; trainings are for the permanent crew (AC 28).
    m.races.filter((r) => m.kind === 'crew' || !isTrainingShare(r.data)).map((r) => ({ ...r, boat: m.boatName, owner: m.owner })),
  );
  const trainings = all.flatMap((r) => (isTrainingShare(r.data) ? [{ ...r, data: r.data }] : [])).sort((a, b) => b.data.start - a.data.start);
  const list = all.flatMap((r) => (isTrainingShare(r.data) ? [] : [{ ...r, data: r.data as RacePlan }]));
  if (!list.length && !trainings.length) return null;
  list.sort((a, b) => a.data.start - b.data.start);
  return (
    <>
      {trainings.length > 0 && <SharedTrainings list={trainings} />}
      {list.length > 0 && (
    <section className="card crew">
      <h3>Αγώνες του πληρώματος</h3>
      <p className="muted small">Τους στέλνει ο ιδιοκτήτης του σκάφους. Εδώ μόνο τους βλέπεις.</p>
      <ul className="rows shared-races">
        {list.map((r) => (
          <li key={`${r.boat}-${r.raceId}`}>
            <details>
              <summary>
                <strong>{r.data.name}</strong>
                <span className="muted small">
                  {' '}
                  · {r.boat} · {when(r.data.start)}
                </span>
              </summary>
              {r.data.courseName && <p className="small">Διαδρομή: {r.data.courseName}{r.data.marks.length ? ` (${r.data.marks.map((m) => m.name).join(' → ')})` : ''}</p>}
              {r.data.note && <p className="crew-note">«{r.data.note}» — {r.owner}</p>}
              {r.data.crew.length > 0 && (
                <ul className="small">
                  {r.data.crew.map((p, i) => (
                    <li key={i}>
                      {p.role ? <b>{ROLE_LABEL[p.role]}:</b> : null} {p.name}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ul>
    </section>
      )}
    </>
  );
}

/** Trainings shared with me: «Προπόνηση · <σκάφος> · <ημέρα>», summary and notes, never the track. */
function SharedTrainings({ list }: { list: { raceId: string; boat: string; owner: string; data: TrainingShare }[] }) {
  return (
    <section className="card crew">
      <h3>Προπονήσεις του πληρώματος</h3>
      <p className="muted small">Τις μοιράζεται ο ιδιοκτήτης του σκάφους: σύνοψη και σημειώσεις, όχι το ίχνος. Εδώ μόνο τις βλέπεις.</p>
      <ul className="rows shared-races">
        {list.map((r) => (
          <li key={`${r.boat}-${r.raceId}`}>
            <details>
              <summary>
                <strong>
                  Προπόνηση · {r.boat} · {dayStr(r.data.start)}
                </strong>
              </summary>
              <SharedTrainingView s={r.data.summary} goal={r.data.goal} note={r.data.note} owner={r.owner} />
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Owner: who sails this race and in which position; sends the plan to the crew. */
export function RaceCrew({ race, boat, onChange }: { race: Race; boat?: BoatProfile; onChange: (p: Partial<Race>) => void }) {
  const c = useCrews();
  const [busy, setBusy] = useState(false);
  if (!c.signedIn || !boat?.isOwn) return null;
  const crew = c.data?.owned.find((x) => x.boatId === boat.id);
  const permanent = crew?.members.filter((m) => m.kind === 'crew' || m.raceId === race.id) ?? [];
  const places = race.crew ?? [];
  const placeOf = (userId: string) => places.find((p) => p.userId === userId);
  const setPlace = (userId: string, name: string, on: boolean, role?: Role) => {
    const rest = places.filter((p) => p.userId !== userId);
    onChange({ crew: on ? [...rest, { userId, name, role }] : rest });
  };
  const going = places.length;
  const noHelm = going > 0 && !places.some((p) => p.role === 'helm');
  const missingCard = places.filter((p) => !permanent.find((m) => m.userId === p.userId)?.athleteCard).length;

  const plan = (): RacePlan => ({
    name: race.name,
    start: race.start,
    courseName: race.courseName,
    marks: race.marks.map((m) => ({ name: m.name, lat: m.lat, lon: m.lon })),
    note: race.crewNote,
    crew: places.map((p) => ({ userId: p.userId, name: p.name, role: p.role })),
  });
  const send = async () => {
    setBusy(true);
    try {
      const { crew: cr } = await crewApi.ensure(c.server, c.token, {
        boatId: boat.id,
        boatName: boat.name,
        sailNo: boat.sailNumber,
      });
      await crewApi.shareRace(c.server, c.token, cr.id, race.id, plan());
      onChange({ crewSharedAt: Date.now() });
      return cr.id;
    } catch (e) {
      await showAlert((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const inviteGuest = async () => {
    const crewId = await send();
    if (!crewId) return;
    try {
      const inv = await crewApi.invite(c.server, c.token, crewId, 'guest', race.id);
      const r = await shareText(
        race.name,
        `Είσαι καλεσμένος στο σκάφος «${boat.name}» για τον αγώνα «${race.name}» (${when(race.start)}). Ο σύνδεσμος ισχύει μία φορά.`,
        inviteLink(inv.token),
      );
      await shareResult(r, 'Ο σύνδεσμος');
      await c.refresh();
    } catch (e) {
      await showAlert((e as Error).message);
    }
  };

  return (
    <section className="card crew race-crew">
      <h3>Πλήρωμα αγώνα</h3>
      {permanent.length === 0 ? (
        <p className="muted small">Δεν έχεις μέλη πληρώματος ακόμα. Πρόσθεσέ τα από «Σκάφη» → «Πρόσκληση στο πλήρωμα», ή κάλεσε κάποιον μόνο για αυτόν τον αγώνα.</p>
      ) : (
        <ul className="rows crew-list">
          {permanent.map((m) => {
            const p = placeOf(m.userId);
            return (
              <li key={m.userId}>
                <label className="check">
                  <input type="checkbox" checked={!!p} onChange={(e) => setPlace(m.userId, m.name, e.target.checked, p?.role)} />
                  {m.name}
                  {m.kind === 'guest' && <span className="muted small"> (καλεσμένος)</span>}
                </label>
                {p && (
                  <select aria-label={`Θέση για ${m.name}`} value={p.role ?? ''} onChange={(e) => setPlace(m.userId, m.name, true, (e.target.value || undefined) as Role | undefined)}>
                    <option value="">Θέση…</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {noHelm && (
        <p className="warn-text small">
          <BtnIcon name="warn" />
          Δεν έχεις βάλει τιμονιέρη.
        </p>
      )}
      {going > 0 && missingCard > 0 && <p className="warn-text small"><BtnIcon name="warn" />{missingCard === 1 ? '1 μέλος δεν έχει' : `${missingCard} μέλη δεν έχουν`} αριθμό δελτίου αθλητή.</p>}
      <label className="field">
        <span>Σημείωση για το πλήρωμα</span>
        <textarea rows={2} maxLength={500} value={race.crewNote ?? ''} placeholder="π.χ. Στις 10:00 στη μαρίνα, φέρτε αδιάβροχα" onChange={(e) => onChange({ crewNote: e.target.value })} />
      </label>
      <div className="btn-row">
        <button className="btn primary" disabled={busy} onClick={send}>
          {race.crewSharedAt && <BtnIcon name="rotate" />}
          {race.crewSharedAt ? 'Στείλε ξανά στο πλήρωμα' : 'Στείλε στο πλήρωμα'}
        </button>
        <button className="btn" disabled={busy} onClick={inviteGuest}>
          ＋ Καλεσμένος για αυτόν τον αγώνα
        </button>
        {going > 0 && (
          <button
            className="btn"
            onClick={async () =>
              shareResult(
                await shareText(
                  race.name,
                  entryListText(
                    boat.name,
                    places.map((p) => ({
                      ...p,
                      athleteCard: permanent.find((m) => m.userId === p.userId)?.athleteCard,
                    })),
                  ),
                ),
                'Η λίστα',
              )
            }
          >
            <BtnIcon name="list" />
            Λίστα για τη δήλωση συμμετοχής
          </button>
        )}
      </div>
      <p className="muted small">
        {race.crewSharedAt ? `Στάλθηκε ${when(race.crewSharedAt)} · ` : ''}Στο πλήρωμα πηγαίνουν μόνο όνομα, ώρα, διαδρομή, θέσεις και η σημείωση· όχι ίχνος ή θέση GPS.
      </p>
    </section>
  );
}

/** Opening an invitation link: preview, optional athlete card, accept or not. */
export function InviteScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const { settings } = useApp();
  const server = settings.aiUrl || DEFAULT_SERVER;
  const [p, setP] = useState<InvitePreview>();
  // P-056 §Δ: a failed preview is its own page (404 / 410 / no answer), never a line above other content.
  const [err, setErr] = useState<{ text: string; retry: boolean }>();
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [card, setCard] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setErr(undefined);
    setSlow(false);
    const t = window.setTimeout(() => live && setSlow(true), INVITE_SLOW_MS);
    crewApi.preview(server, settings.authToken, token).then(
      (x) => live && setP(x),
      (e) => live && setErr(inviteError(e as { status?: number; message?: string })),
    );
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [server, settings.authToken, token, attempt]);
  const close = () => {
    clearPendingInvite();
    onDone();
  };
  if (!p && (err || slow)) {
    const text = err?.text ?? INVITE_TEXT.slow;
    const retry = err ? err.retry : true;
    return (
      <section className="errpage" data-testid="invite-error">
        <h1 className="screen-title">{INVITE_TEXT.title}</h1>
        <div className="msgb" role={retry ? 'status' : 'alert'}>
          <p>{text}</p>
        </div>
        <div className="acts bstack">
          {retry && (
            <button type="button" className="btn primary big-btn" onClick={() => setAttempt((n) => n + 1)}>
              {INVITE_TEXT.retry}
            </button>
          )}
          <button type="button" className="btn big-btn" onClick={close}>
            {INVITE_TEXT.home}
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="card invite">
      <h2>{INVITE_TEXT.title}</h2>
      {!p && <p className="muted">{INVITE_TEXT.loading}</p>}
      {err && p && <p className="warn-text">{err.text}</p>}
      {p && (
        <>
          <p>
            {p.owner} σε καλεί στο σκάφος <b>{p.boatName}</b>
            {p.kind === 'guest' ? (
              <>
                {' '}
                για τον αγώνα <b>{p.raceName ?? ''}</b>
                {p.raceStart ? ` (${when(p.raceStart)})` : ''}. Θα βλέπεις μόνο αυτόν τον αγώνα, ως δύο μέρες μετά.
              </>
            ) : (
              ' ως μόνιμο πλήρωμα. Θα βλέπεις τους αγώνες που σου στέλνει: ώρα, διαδρομή, θέσεις και σημειώσεις.'
            )}
          </p>
          <label className="field">
            <span>Αριθμός δελτίου αθλητή (προαιρετικό)</span>
            <input value={card} maxLength={20} onChange={(e) => setCard(e.target.value)} placeholder="π.χ. 12345" />
          </label>
          <p className="muted small">Τον βλέπετε μόνο εσύ και ο ιδιοκτήτης του σκάφους, για τη δήλωση συμμετοχής. Μπορείς να τον αλλάξεις ή να τον σβήσεις αργότερα στα «Σκάφη».</p>
          <div className="btn-row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await crewApi.accept(server, settings.authToken, token, card.trim() || undefined);
                  await showAlert(`Είσαι στο πλήρωμα του σκάφους «${p.boatName}».`);
                  close();
                } catch (e) {
                  setErr({ text: (e as Error).message, retry: false });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Μπαίνω στο πλήρωμα
            </button>
            <button className="btn" onClick={close}>
              Όχι τώρα
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export type { CrewPlace };
