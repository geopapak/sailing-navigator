import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BoatProfile } from '../boat/types';
import { deleteBoat, ensureSeed, getKV, listBoats, saveBoat, setKV } from '../boat/store';
import { DEFAULT_SETTINGS, type Settings } from './settings';

interface AppState {
  ready: boolean;
  error?: string;
  boats: BoatProfile[];
  activeBoat?: BoatProfile;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  saveBoat: (b: BoatProfile) => Promise<void>;
  deleteBoat: (id: string) => Promise<void>;
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
        await ensureSeed();
        const s = await getKV<Partial<Settings>>('settings', {});
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
    };
  }, [ready, error, boats, settings, updateSettings, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
