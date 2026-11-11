import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { LOCAL_CHANGE, deleteNote, getKV, listNotes, restoreNote, saveNote, setKV } from '../boat/store';
import type { KnowledgeNote } from '../knowledge/types';
import { setKnowledgeCache } from '../knowledge/match';
import { REMOTE_CHANGE } from '../sync/sync';
import { accountApi } from '../sync/api';
import { useApp } from './AppContext';
import { DEFAULT_SERVER } from './settings';

interface KnowledgeState {
  mine: KnowledgeNote[];
  crew: KnowledgeNote[];
  crewError?: string;
  save: (n: KnowledgeNote) => Promise<void>;
  remove: (id: string) => Promise<void>;
  restore: (n: KnowledgeNote) => Promise<void>;
  refreshCrew: () => Promise<void>;
}

const Ctx = createContext<KnowledgeState | null>(null);

/** The crew's local-knowledge notes: own ones (synced) and those shared by crew mates. */
export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const { account, settings } = useApp();
  const [mine, setMine] = useState<KnowledgeNote[]>([]);
  const [crew, setCrew] = useState<KnowledgeNote[]>([]);
  const [crewError, setCrewError] = useState<string>();

  const reload = useCallback(async () => setMine(await listNotes()), []);
  useEffect(() => {
    reload();
    getKV<KnowledgeNote[]>('crew-notes', []).then(setCrew);
    window.addEventListener(REMOTE_CHANGE, reload);
    window.addEventListener(LOCAL_CHANGE, reload);
    return () => {
      window.removeEventListener(REMOTE_CHANGE, reload);
      window.removeEventListener(LOCAL_CHANGE, reload);
    };
  }, [reload]);

  const refreshCrew = useCallback(async () => {
    if (!account || !settings.authToken) return;
    try {
      const r = await accountApi.crewNotes(settings.aiUrl || DEFAULT_SERVER, settings.authToken);
      setCrew(r.notes);
      setCrewError(undefined);
      await setKV('crew-notes', r.notes);
    } catch (e) {
      setCrewError((e as Error).message);
    }
  }, [account, settings.aiUrl, settings.authToken]);

  useEffect(() => {
    refreshCrew();
  }, [refreshCrew]);

  useEffect(() => setKnowledgeCache(mine, crew), [mine, crew]);

  const save = useCallback(async (n: KnowledgeNote) => saveNote(n), []);
  const remove = useCallback(async (id: string) => deleteNote(id), []);
  const restore = useCallback(async (n: KnowledgeNote) => restoreNote(n), []);

  return <Ctx.Provider value={{ mine, crew, crewError, save, remove, restore, refreshCrew }}>{children}</Ctx.Provider>;
}

export function useKnowledge(): KnowledgeState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useKnowledge outside KnowledgeProvider');
  return c;
}
