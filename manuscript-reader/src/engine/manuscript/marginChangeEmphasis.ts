// Word-level emphasis for the Changes margin — bold what moved between before/after.

export interface EmphasisSpan {
  text: string;
  emphasis: boolean;
}

function splitWords(s: string): string[] {
  return s.length ? s.split(' ') : [];
}

/** In a revised passage, bold words removed from the previous wording. */
export function emphasisInPrevious(previous: string, current: string): EmphasisSpan[] {
  const a = splitWords(previous);
  const b = splitWords(current);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const out: EmphasisSpan[] = [];
  const head = a.slice(0, i);
  const mid = a.slice(i, a.length - j);
  const tail = a.slice(a.length - j);
  if (head.length) out.push({ text: head.join(' '), emphasis: false });
  if (mid.length) {
    if (out.length) out.push({ text: ' ', emphasis: false });
    out.push({ text: mid.join(' '), emphasis: true });
  }
  if (tail.length) {
    if (out.length) out.push({ text: ' ', emphasis: false });
    out.push({ text: tail.join(' '), emphasis: false });
  }
  return out.length ? out : [{ text: previous, emphasis: false }];
}

/** In an addition, bold the new passage; deletions use plain removed text. */
export function emphasisInCurrent(previous: string, current: string, kind: 'revised' | 'added' | 'deleted'): EmphasisSpan[] {
  if (kind === 'deleted') return [{ text: previous, emphasis: false }];
  if (kind === 'added') return [{ text: current, emphasis: true }];
  return emphasisInPrevious(previous, current);
}
