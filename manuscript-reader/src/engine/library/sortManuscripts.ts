import type { Manuscript } from '../types';

export type LibrarySortKey = 'lastOpened' | 'title' | 'wordCount';

export function sortLibraryManuscripts(items: Manuscript[], key: LibrarySortKey): Manuscript[] {
  const copy = [...items];
  switch (key) {
    case 'title':
      return copy.sort((a, b) =>
        (a.metadata.title ?? '').localeCompare(b.metadata.title ?? '', undefined, { sensitivity: 'base' }),
      );
    case 'wordCount':
      return copy.sort((a, b) => (b.metadata.wordCount ?? 0) - (a.metadata.wordCount ?? 0));
    case 'lastOpened':
    default:
      return copy.sort((a, b) => (b.metadata.lastOpened ?? 0) - (a.metadata.lastOpened ?? 0));
  }
}
