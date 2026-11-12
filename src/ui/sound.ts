import type { Alert } from '../race/alerts';

/**
 * Beeps, Greek voice and vibration for race alerts (P-023). Browsers only play
 * sound after a tap, so the first tap during a race unlocks the audio.
 */
let ac: AudioContext | undefined;
/** Loudness of the beeps: «Χαμηλά» is about a third of «Δυνατά». */
let gain = 1;

export function audioReady(): boolean {
  return !!ac && ac.state === 'running';
}

export function unlockAudio(): boolean {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return false;
    ac ??= new C();
    if (ac.state === 'suspended') void ac.resume();
    return true;
  } catch {
    ac = undefined;
    return false;
  }
}

function tone(f: number, at: number, dur: number, vol0 = 0.16) {
  if (!ac) return;
  const vol = vol0 * gain;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'square';
  o.frequency.value = f;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.01);
  g.gain.setValueAtTime(vol, at + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, at + dur);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** A different pattern per kind, so the crew knows what it is without looking. Returns its length (s). */
export function beep(a: Pick<Alert, 'kind' | 'type'>): number {
  if (!ac) return 0;
  const n = ac.currentTime + 0.03;
  if (a.kind === 'now') {
    [0, 0.18, 0.36].forEach((d) => tone(1320, n + d, 0.12));
    return 0.6;
  }
  if (a.type === 'lay') {
    [0, 0.25].forEach((d) => tone(880, n + d, 0.14));
    return 0.5;
  }
  if (a.type === 'shift') {
    tone(660, n, 0.18);
    tone(990, n + 0.22, 0.22);
    return 0.5;
  }
  tone(740, n, 0.45);
  return 0.55;
}

export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'el-GR';
    u.rate = 1.05;
    u.volume = gain < 1 ? 0.5 : 1;
    const v = speechSynthesis.getVoices().find((x) => /^el/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch {
    /* no voice on this device */
  }
}

/** iPhones cannot vibrate from a web app; Android can. */
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function notify(a: Alert, how: { sound: 'beep' | 'voice' | 'off'; vibrate: boolean; volume?: 'low' | 'high' }): void {
  gain = how.volume === 'low' ? 0.35 : 1;
  if (how.sound !== 'off') {
    const d = beep(a);
    if (how.sound === 'voice') window.setTimeout(() => speak(a.say), d * 1000 + 80);
  }
  if (how.vibrate && canVibrate()) {
    try {
      navigator.vibrate(a.kind === 'now' ? [250, 100, 250, 100, 250] : [200, 120, 200]);
    } catch {
      /* ignore */
    }
  }
}
