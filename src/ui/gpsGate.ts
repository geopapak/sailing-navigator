/**
 * When the phone's GPS may be watched.
 *
 * `watchPosition` asks for the location permission whenever the browser has not
 * stored it (iOS Safari / PWA with «Ερώτηση», Chrome after «μόνο αυτή τη φορά»).
 * So at load the GPS starts only when the permission is already known; otherwise
 * it waits for a user action that needs the position (a session starts, the GPS
 * switch, «Γρήγορη ματιά», «Από GPS»).
 */
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface GpsGateInput {
  /** The user's GPS switch (Live → GPS «ενεργό»). */
  enabled: boolean;
  permission: GeoPermission;
  /** Something the user did needs the position. */
  requested: boolean;
}

export function shouldWatchGps(i: GpsGateInput): boolean {
  if (!i.enabled) return false;
  if (i.requested) return true;
  // Granted: no prompt. Denied: the browser answers with an error at once, no prompt,
  // and the app shows how to allow it.
  return i.permission === 'granted' || i.permission === 'denied';
}

export function toGeoPermission(state: unknown): GeoPermission {
  return state === 'granted' || state === 'denied' || state === 'prompt' ? state : 'unknown';
}

interface PermissionsLike {
  query: (d: { name: 'geolocation' }) => Promise<{ state: unknown; addEventListener?: unknown; onchange?: unknown }>;
}

/**
 * Reads the geolocation permission without asking for it. Missing Permissions API
 * (older Safari), a query that throws or never answers, or an odd state all give 'unknown'.
 */
export async function queryGeoPermission(
  perms: PermissionsLike | undefined = typeof navigator !== 'undefined' ? (navigator.permissions as unknown as PermissionsLike | undefined) : undefined,
  timeoutMs = 2000,
): Promise<{ permission: GeoPermission; status?: PermissionStatus }> {
  if (!perms || typeof perms.query !== 'function') return { permission: 'unknown' };
  try {
    const status = await Promise.race([
      perms.query({ name: 'geolocation' }),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs)),
    ]);
    if (!status) return { permission: 'unknown' };
    return { permission: toGeoPermission(status.state), status: status as unknown as PermissionStatus };
  } catch {
    return { permission: 'unknown' };
  }
}
