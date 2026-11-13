/**
 * «Ανάλυση και μαθήματα» after a failed call: offline it waits for the internet (and asks again
 * when it is back); any other failure shows the error with «Ξανά» and no longer waits.
 */
export function lessonsFailure(status: number | undefined, message: string, offline: boolean): { waiting: boolean; err?: string } {
  if (status === 0 && offline) return { waiting: true };
  return { waiting: false, err: message };
}
