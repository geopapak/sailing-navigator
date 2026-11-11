import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { D1Database, D1PreparedStatement, UserRow } from './accounts';
import { MAX_CREW_NOTES, crewNotes } from './analysis';

/** Crew notes privacy (P-015): SQL filter, author must own the boat too, no 500-row blind spot. */
function setup() {
  const sql = new DatabaseSync(':memory:');
  for (const f of ['0001_accounts.sql', '0002_terms_reset_pdf.sql']) sql.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  const stmt = (q: string, args: unknown[] = []): D1PreparedStatement => ({
    bind: (...v: unknown[]) => stmt(q, v),
    first: async <T,>() => (sql.prepare(q).get(...(args as never[])) as T) ?? null,
    all: async <T,>() => ({ results: sql.prepare(q).all(...(args as never[])) as T[] }),
    run: async () => {
      const r = sql.prepare(q).run(...(args as never[]));
      return { results: [], meta: { changes: Number(r.changes) } };
    },
  });
  const DB: D1Database = { prepare: (q) => stmt(q), batch: async (l) => Promise.all(l.map((s) => s.run())) };
  let t = 1;
  const user = (id: string, name: string) =>
    sql.prepare('INSERT INTO users (id, email, name, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, `${id}@example.test`, name, 'h', 's', 1);
  const item = (uid: string, kind: string, id: string, data: object) =>
    sql.prepare('INSERT INTO items (user_id, kind, id, data, updated_at, server_at) VALUES (?, ?, ?, ?, ?, ?)').run(uid, kind, id, JSON.stringify(data), t, t++);
  return { env: { DB }, user, item, sql };
}
const me = { id: 'reader' } as UserRow;

describe('crewNotes (P-015)', () => {
  it('shows notes only from authors who also have the boat as their own', async () => {
    const { env, user, item } = setup();
    user('reader', 'Νίκος');
    user('mate', 'Μαρία Παπά');
    user('stranger', 'Κώστας');
    item('reader', 'boat', 'b1', { isOwn: true, sailNumber: 'GRE-4711' });
    item('mate', 'boat', 'b2', { isOwn: true, sailNumber: 'gre 4711' });
    item('mate', 'note', 'n1', { scope: 'crew', sailNo: '4711', text: 'ρεύμα στο Φλέβες' });
    item('mate', 'note', 'n2', { scope: 'me', sailNo: '4711', text: 'ιδιωτικό' });
    // The stranger only tagged a note with our public sail number, without owning the boat.
    item('stranger', 'note', 'n3', { scope: 'crew', sailNo: 'GRE4711', text: 'όχι' });
    const { notes } = await crewNotes(env, me);
    expect(notes.map((n) => n.text)).toEqual(['ρεύμα στο Φλέβες']);
    expect(notes[0].author).toBe('Μαρία');
  });

  it('does not lose our crew notes behind many newer notes of other boats', async () => {
    const { env, user, item } = setup();
    user('reader', 'Νίκος');
    user('mate', 'Μαρία');
    user('other', 'Άλλος');
    item('reader', 'boat', 'b1', { isOwn: true, sailNumber: 'GRE 100' });
    item('mate', 'boat', 'b2', { isOwn: true, sailNumber: '100' });
    item('other', 'boat', 'b3', { isOwn: true, sailNumber: '999' });
    item('mate', 'note', 'old', { scope: 'crew', sailNo: '100', text: 'παλιά' });
    for (let i = 0; i < 600; i++) item('other', 'note', `x${i}`, { scope: 'crew', sailNo: '999', text: 'x' });
    const { notes } = await crewNotes(env, me);
    expect(notes.map((n) => n.text)).toEqual(['παλιά']);
  });

  it('no own boat → nothing, and at most MAX_CREW_NOTES', async () => {
    const { env, user, item } = setup();
    user('reader', 'Νίκος');
    user('mate', 'Μαρία');
    expect((await crewNotes(env, me)).notes).toEqual([]);
    item('reader', 'boat', 'b1', { isOwn: true, sailNumber: '7' });
    item('mate', 'boat', 'b2', { isOwn: true, sailNumber: '7' });
    for (let i = 0; i < MAX_CREW_NOTES + 5; i++) item('mate', 'note', `n${i}`, { scope: 'crew', sailNo: '7', text: `${i}` });
    expect((await crewNotes(env, me)).notes).toHaveLength(MAX_CREW_NOTES);
  });
});
