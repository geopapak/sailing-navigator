import { newCourseState, stepCourse, type Course, type CourseState } from '../race/manualWind';
import type { InstrumentValues } from '../instruments/types';

/** One course tracker for every view (P-053): the GPS course hysteresis needs the history. */
let courseState: CourseState = newCourseState();

/** The course for the manual wind's TWA now: the instruments' heading, else the GPS course (2,5 / 2 kt, 30″). */
export function currentCourse(inst: { live: boolean; values: InstrumentValues }, fix: { cog?: number; sog?: number } | undefined, declination: number, now = Date.now()): Course {
  const iv = inst.live ? inst.values : {};
  const r = stepCourse(
    courseState,
    { instLive: inst.live, hdgTrue: iv.hdgTrue, hdgMag: iv.hdgMag, variation: iv.variation, declination, cog: fix?.cog, sog: fix?.sog },
    now,
  );
  courseState = r.state;
  return r.course;
}

