import { describe, expect, it } from 'vitest';
import { normalizeTab } from './openTab';

describe('normalizeTab (P-033)', () => {
  it('maps the old six tabs to the new ones', () => {
    expect(normalizeTab('live')).toBe('home');
    expect(normalizeTab('map')).toBe('home');
    expect(normalizeTab('chat')).toBe('home');
    expect(normalizeTab('scoring')).toBe('history');
    expect(normalizeTab('polar')).toBe('boats');
    expect(normalizeTab('guide')).toBe('settings');
  });

  it('keeps the new values and falls back to home', () => {
    for (const t of ['home', 'history', 'boats', 'settings', 'quick'] as const) expect(normalizeTab(t)).toBe(t);
    expect(normalizeTab(undefined)).toBe('home');
    expect(normalizeTab('nonsense')).toBe('home');
  });

  it('never opens a session tab outside a session', () => {
    expect(normalizeTab('session:map')).toBe('home');
  });

  it('inside a session leads to Live, Χάρτης or Σύμβουλος', () => {
    expect(normalizeTab('home', true)).toBe('session:live');
    expect(normalizeTab('live', true)).toBe('session:live');
    expect(normalizeTab('map', true)).toBe('session:map');
    expect(normalizeTab('chat', true)).toBe('session:chat');
    expect(normalizeTab('history', true)).toBe('session:live');
    expect(normalizeTab('quick', true)).toBe('session:live');
    expect(normalizeTab('session:chat', true)).toBe('session:chat');
    // Links like «σύνδεσε όργανα από τις Ρυθμίσεις» still open, with a way back.
    expect(normalizeTab('settings', true)).toBe('settings');
    expect(normalizeTab('guide', true)).toBe('settings');
    expect(normalizeTab('boats', true)).toBe('boats');
  });
});
