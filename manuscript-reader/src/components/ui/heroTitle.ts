// Length-bucketed sizing class for the hub/studio hero title. CSS clamp() can't
// see the title length, so a long title and a one-word title would otherwise share
// a font size — the long one then dwarfs the page. This returns a modifier class
// the hero stylesheet maps to a smaller clamp range as titles get longer. Shared by
// the Manuscript Hub and the Publishing Studio so they size identically.
export function heroTitleClass(title: string): string {
  const n = title.trim().length;
  if (n > 64) return 'hub-hero-title hub-hero-title--xlong';
  if (n > 44) return 'hub-hero-title hub-hero-title--long';
  if (n > 24) return 'hub-hero-title hub-hero-title--medium';
  return 'hub-hero-title';
}
