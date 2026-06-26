// Position is mode-aware intent, not one global cursor. Where a scroll persists
// depends on what the author is *doing*, not just where the viewport sits:
//
//   reading      → the canonical reading progress (drives the library % and the
//                  reading-resume). The ONLY writer of progress.
//   annotations  → a private "annotation-work" bookmark — where you were working
//                  through margin notes. Pure wayfinding; never touches progress.
//   changes      → a private "changes-review" bookmark, parallel to annotations.
//   manuscript   → nothing. Editing has its own return-scroll handling, and an
//                  edit pass must never overwrite where the author was *reading*.
//
// These are deliberately pure so the decision is testable without a browser (the
// engine rule), separate from the localStorage that holds the bookmarks.

export type ReaderMode = 'reading' | 'manuscript' | 'annotations' | 'changes';

/** Modes that keep a private, disposable work bookmark (not the reading progress). */
export type WorkMode = 'annotations' | 'changes';

/** Which persistence channel a scroll in `mode` should write to (null = none). */
export type PositionChannel = 'reading-progress' | WorkMode | null;

export function positionChannelForMode(mode: ReaderMode): PositionChannel {
  switch (mode) {
    case 'reading':     return 'reading-progress';
    case 'annotations': return 'annotations';
    case 'changes':     return 'changes';
    case 'manuscript':  return null;
  }
}

export function isWorkMode(channel: PositionChannel): channel is WorkMode {
  return channel === 'annotations' || channel === 'changes';
}
