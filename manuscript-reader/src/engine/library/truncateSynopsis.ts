import type { PublishingMetadata } from '../types';

/** Truncate prose for library rows (two-line clamp in CSS; engine caps length). */
export function truncateSynopsis(text: string | undefined, maxLength = 160): string {
  const t = text?.trim();
  if (!t) return '';
  if (t.length <= maxLength) return t;
  const slice = t.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 48 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

export function manuscriptListSynopsis(publishing: PublishingMetadata | undefined): string {
  if (!publishing) return '';
  return truncateSynopsis(publishing.synopsis) || truncateSynopsis(publishing.subtitle, 120);
}
