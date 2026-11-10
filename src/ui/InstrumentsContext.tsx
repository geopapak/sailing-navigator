import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { InstrumentClient, type ConnStatus } from '../instruments/client';
import type { AisTarget, InstrumentValues } from '../instruments/types';

export interface InstrumentsState {
  /** Connection state; `live` adds whether data is actually arriving. */
  status: ConnStatus;
  message?: string;
  /** True when connected and a message came in the last 10 s. */
  live: boolean;
  /** Fresh values only (stale ones are dropped). */
  values: InstrumentValues;
  /** Seconds since the newest message. */
  ageSec?: number;
  /** Receive time of each raw field (for the "what I get" list). */
  at: Partial<Record<keyof InstrumentValues, number>>;
  ais: AisTarget[];
}

const OFF: InstrumentsState = { status: 'off', live: false, values: {}, at: {}, ais: [] };
const Ctx = createContext<InstrumentsState>(OFF);

/** Runs the instrument connection from Settings and publishes a snapshot every second. */
export function InstrumentsProvider({ children }: { children: ReactNode }) {
  const { settings, ready } = useApp();
  const cfg = settings.instruments;
  const [snap, setSnap] = useState<InstrumentsState>(OFF);
  const statusRef = useRef<{ status: ConnStatus; message?: string }>({ status: 'off' });
  const client = useRef<InstrumentClient>();

  useEffect(() => {
    if (!ready || !cfg?.enabled) {
      client.current?.stop();
      client.current = undefined;
      setSnap(OFF);
      return;
    }
    const c = new InstrumentClient({
      onStatus: (status, message) => {
        statusRef.current = { status, message };
      },
      onData: () => undefined,
    });
    client.current = c;
    c.start(cfg);
    const publish = () => {
      const now = Date.now();
      const age = c.state.ageSec(now);
      setSnap({
        ...statusRef.current,
        live: statusRef.current.status === 'connected' && age !== undefined && age <= 10,
        values: c.state.live(now),
        ageSec: age,
        at: { ...c.state.at },
        ais: [...c.state.ais.values()].filter((t) => now - t.at < 30 * 60_000),
      });
    };
    publish();
    const t = setInterval(publish, 1000);
    return () => {
      clearInterval(t);
      c.stop();
    };
  }, [ready, cfg?.enabled, cfg?.source, cfg?.url, cfg?.aisOpponents]);

  const value = useMemo(() => snap, [snap]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInstruments(): InstrumentsState {
  return useContext(Ctx);
}
