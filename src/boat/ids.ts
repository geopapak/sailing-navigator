/** Readable unique id for a boat, from its name. */
export function newBoatId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9α-ω]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'boat'}-${Math.random().toString(36).slice(2, 7)}`;
}
