/**
 * Connection to the boat's gateway (Signal K or NMEA 0183 over WebSocket)
 * or the built-in simulator. Reconnects on its own; reports status changes.
 */
import { Nmea0183Parser } from './nmea0183';
import { SIGNALK_SUBSCRIBE, parseSignalK } from './signalk';
import { Simulator } from './simulator';
import { InstrumentState } from './state';
import type { InstrumentSettings } from './types';

export type ConnStatus = 'off' | 'connecting' | 'connected' | 'error';

export interface ClientEvents {
  onStatus: (s: ConnStatus, message?: string) => void;
  onData: () => void;
}

/** A ws:// address from an https:// page is blocked by the browser. */
export function mixedContentProblem(url: string, pageProtocol = typeof location !== 'undefined' ? location.protocol : 'http:'): string | undefined {
  if (pageProtocol === 'https:' && /^ws:\/\//i.test(url.trim())) {
    return 'Η εφαρμογή ανοίγει με https, οπότε ο browser επιτρέπει μόνο wss:// (ασφαλή σύνδεση). Ενεργοποίησε SSL στο gateway (π.χ. Signal K → Settings → SSL) και βάλε wss://… — ή δοκίμασε την προσομοίωση.';
  }
  return undefined;
}

export class InstrumentClient {
  readonly state = new InstrumentState();
  private ws?: WebSocket;
  private timer?: ReturnType<typeof setInterval>;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private selfId?: string;
  private nmea = new Nmea0183Parser();

  constructor(private ev: ClientEvents) {}

  start(cfg: InstrumentSettings) {
    this.stop();
    this.stopped = false;
    if (cfg.source === 'simulator') {
      const sim = new Simulator();
      this.ev.onStatus('connected');
      this.timer = setInterval(() => {
        const r = sim.step();
        this.state.apply(r.update);
        if (cfg.aisOpponents) r.ais.forEach((t) => this.state.applyAis(t));
        this.ev.onData();
      }, 1000);
      return;
    }
    const problem = mixedContentProblem(cfg.url);
    if (problem) {
      this.ev.onStatus('error', problem);
      return;
    }
    this.open(cfg);
  }

  private open(cfg: InstrumentSettings) {
    if (this.stopped) return;
    this.ev.onStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(cfg.url.trim());
    } catch {
      this.ev.onStatus('error', 'Άκυρη διεύθυνση gateway.');
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.ev.onStatus('connected');
      if (cfg.source === 'signalk') ws.send(SIGNALK_SUBSCRIBE);
    };
    ws.onmessage = (m) => {
      const data = typeof m.data === 'string' ? m.data : '';
      if (!data) return;
      if (cfg.source === 'signalk') {
        const r = parseSignalK(data, this.selfId);
        if (r.selfId) this.selfId = r.selfId;
        if (r.self) this.state.apply(r.self);
        if (cfg.aisOpponents) r.ais?.forEach((t) => this.state.applyAis(t));
      } else {
        for (const line of data.split(/\r?\n/)) {
          const r = this.nmea.parse(line);
          if (r.update) this.state.apply(r.update);
          if (r.ais && !r.own && cfg.aisOpponents) this.state.applyAis(r.ais);
        }
      }
      this.ev.onData();
    };
    ws.onerror = () => this.ev.onStatus('error', 'Δεν απαντά το gateway. Είσαι στο Wi-Fi του σκάφους;');
    ws.onclose = () => {
      if (this.stopped) return;
      this.ev.onStatus('connecting', 'Επανασύνδεση…');
      this.retry = setTimeout(() => this.open(cfg), 3000);
    };
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.retry) clearTimeout(this.retry);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = undefined;
    this.ev.onStatus('off');
  }
}
