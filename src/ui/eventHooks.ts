import { useMemo } from 'react';
import { eventRaces, raceNumbers } from '../race/event';
import type { Race, RaceEvent } from '../race/types';
import { useRace } from './RaceContext';

/** The event of a race and the race's number in it (P-040; computed, AC 7). */
export function useRaceEvent(r: Pick<Race, 'id' | 'eventId'> | undefined): { event?: RaceEvent; n?: number; races: Race[] } {
  const { events, races } = useRace();
  return useMemo(() => {
    const event = r?.eventId ? events.find((e) => e.id === r.eventId) : undefined;
    if (!event || !r) return { races: [] };
    const list = eventRaces(event.id, races);
    return { event, n: raceNumbers(list)[r.id], races: list };
  }, [events, races, r?.id, r?.eventId]); // eslint-disable-line react-hooks/exhaustive-deps
}
