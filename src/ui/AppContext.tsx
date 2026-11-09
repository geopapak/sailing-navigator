import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BoatProfile } from '../boat/types';
import { LOCAL_CHANGE, deleteBoat, getKV, listBoats, saveBoat, setKV } from '../boat/store';
import { DEFAULT_SERVER, DEFAULT_SETTINGS, type Settings } from './settings';
import { REMOTE_CHANGE, adoptAccount, syncNow } from '../sync/sync';
import { ApiError, accountApi, type PublicUser } from '../sync/api';

export interface SyncStatus {
  busy: boolean;
  at?: number;
  error?: string;
}

interface AppState {
  ready: boolean;
  error?: string;
  boats: BoatProfile[];
  activeBoat?: BoatProfile;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  saveBoat: (b: BoatProfile) => Promise<void>;
  deleteBoat: (id: string) => Promise<void>;

  /** Signed-in account, if any. */
  account?: PublicUser;
  syncStatus: SyncStatus;
  signedIn: (token: string, user: PublicUser) => Promise<void>;
  signOut: () => Promise<void>;
  sync: () => Promise<void>;
  refreshAccount: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  const [boats, setBoats] = useState<BoatProfile[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const reload = useCallback(async () => setBoats(await listBoats()), []);

  useEffect(() => {
    (async () => {
      try {
        const s = await getKV<Partial<Settings>>('settings', {});
        // Older installs stored an empty server address: use the project's server.
        if (!s.aiUrl) delete s.aiUrl;
        setSettings({ ...DEFAULT_SETTINGS, ...s });
        await reload();
      } catch (e) {
        setError(`Αποτυχία τοπικής αποθήκευσης: ${(e as Error).message}`);
      } finally {
        setReady(true);
      }
    })();
  }, [reload]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setKV('settings', next).catch(() => undefined);
      return next;
    });
  }, []);

  // ---- Account & sync ----
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ busy: false });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const sync = useCallback(async () => {
    const { aiUrl, authToken } = settingsRef.current;
    if (!authToken) return;
    setSyncStatus((s) => ({ ...s, busy: true, error: undefined }));
    try {
      const r = await syncNow(aiUrl || DEFAULT_SERVER, authToken);
      setSyncStatus({ busy: false, at: r.at });
      if (r.pulled) await reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // Session expired or revoked.
        updateSettings({ authToken: '', account: undefined });
        setSyncStatus({ busy: false, error: 'Η σύνδεση έληξε. Συνδέσου ξανά.' });
      } else {
        setSyncStatus((s) => ({ busy: false, at: s.at, error: (e as Error).message }));
      }
    }
  }, [reload, updateSettings]);

  const refreshAccount = useCallback(async () => {
    const { aiUrl, authToken } = settingsRef.current;
    if (!authToken) return;
    try {
      const { user } = await accountApi.me(aiUrl || DEFAULT_SERVER, authToken);
      updateSettings({ account: user });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) updateSettings({ authToken: '', account: undefined });
    }
  }, [updateSettings]);

  const signedIn = useCallback(
    async (token: string, user: PublicUser) => {
      await adoptAccount(user.id);
      settingsRef.current = { ...settingsRef.current, authToken: token, account: user };
      updateSettings({ authToken: token, account: user });
      await reload();
      await sync();
    },
    [updateSettings, reload, sync],
  );

  const signOut = useCallback(async () => {
    const { aiUrl, authToken } = settingsRef.current;
    if (authToken) await accountApi.logout(aiUrl || DEFAULT_SERVER, authToken).catch(() => undefined);
    settingsRef.current = { ...settingsRef.current, authToken: '', account: undefined };
    updateSettings({ authToken: '', account: undefined });
    setSyncStatus({ busy: false });
  }, [updateSettings]);

  // Sync on start, when coming back online/to the foreground, and shortly after local edits.
  useEffect(() => {
    if (!ready || !settings.authToken) return;
    sync();
    refreshAccount();
    let t: number | undefined;
    const soon = () => {
      window.clearTimeout(t);
      t = window.setTimeout(sync, 2500);
    };
    const onVisible = () => document.visibilityState === 'visible' && sync();
    window.addEventListener(LOCAL_CHANGE, soon);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(LOCAL_CHANGE, soon);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, settings.authToken, sync, refreshAccount]);

  useEffect(() => {
    const h = () => reload();
    window.addEventListener(REMOTE_CHANGE, h);
    return () => window.removeEventListener(REMOTE_CHANGE, h);
  }, [reload]);

  const value = useMemo<AppState>(() => {
    const activeBoat = boats.find((b) => b.id === settings.activeBoatId) ?? boats.find((b) => b.isOwn) ?? boats[0];
    return {
      ready,
      error,
      boats,
      activeBoat,
      settings,
      updateSettings,
      saveBoat: async (b) => {
        await saveBoat(b);
        await reload();
      },
      deleteBoat: async (id) => {
        await deleteBoat(id);
        await reload();
      },
      account: settings.authToken ? settings.account : undefined,
      syncStatus,
      signedIn,
      signOut,
      sync,
      refreshAccount,
    };
  }, [ready, error, boats, settings, updateSettings, reload, syncStatus, signedIn, signOut, sync, refreshAccount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
