// Shared narrowing of a before→after pair in rendered (or any tokenized) text.

const CTX_WORDS = 4;

export function narrowRenderedPair(
  prev: string,
  cur: string,
): Pick<{ previous: string; current: string; startEllipsis: boolean; endEllipsis: boolean }, 'previous' | 'current' | 'startEllipsis' | 'endEllipsis'> {
  const a = prev.split(' ');
  const b = cur.split(' ');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const start = Math.max(0, i - CTX_WORDS);
  const endA = Math.min(a.length, a.length - j + CTX_WORDS);
  const endB = Math.min(b.length, b.length - j + CTX_WORDS);
  return {
    previous: a.slice(start, endA).join(' '),
    current: b.slice(start, endB).join(' '),
    startEllipsis: start > 0,
    endEllipsis: endA < a.length || endB < b.length,
  };
}
