// ─── Workflow status — where a manuscript sits in the beta-reader loop ───────
//
// The spine both the Library row and the manuscript Hub hang their status off
// (loop-completion brief). The problem this fixes: `metadata.shared` is a
// *transport* fact ("a share link is live"), but the Library used it as the
// primary status label — so a manuscript with returned feedback (imported JSON
// or pulled from the worker) that was never share-flagged reads "Not shared,"
// which is technically true and functionally the opposite of the truth.
//
// The fix is one derived status that folds transport (share state) + feedback
// (returned reader sessions) into a single lifecycle position. It is a PURE
// function of facts the callers already hold — no storage, no browser — so it
// lives in the engine and is golden-file checkable (`check-workflow-status`).
//
// `shared` (boolean) and `share.state` survive as sub-facts that FEED this; they
// stop being the label. The author's manual `ManuscriptStatus` (Draft / In
// Progress / Complete) is a SEPARATE axis — an editorial shelf the author sets —
// and is deliberately not mixed in here.

/** The lifecycle stages the loop's facts can *honestly* distinguish. The brief
 *  sketches a six-label lifecycle (Draft → Ready to share → Shared → Awaiting
 *  responses → Responses available → Report ready); two of those pairs are not
 *  separable from the facts we store (a fresh import and a "ready" one are the
 *  same fact; a live link with zero responses is both "Shared" and "Awaiting"),
 *  so we collapse to the four provable stages and label them informatively. */
export type WorkflowStage =
  | 'draft'         // no share link, no returned feedback — imported, in the library
  | 'shared'        // a share is live/frozen, no reader has responded yet
  | 'responses'     // reader feedback has returned (live share OR JSON import)
  | 'report-ready'; // the author froze the feedback set to work the report

/** Styling intent for the stage — a coarse tone the Library/Hub map to their own
 *  pips/colors, so the palette decision stays in the view, not the engine. */
export type WorkflowTone = 'neutral' | 'active' | 'attention' | 'done';

export interface WorkflowStatus {
  stage: WorkflowStage;
  /** Display label. Adjustable in the view; the stage is the stable contract. */
  label: string;
  tone: WorkflowTone;
  /** Distinct beta readers whose sessions have returned (feedback), not link reach. */
  readerCount: number;
  /** Responses unseen since the author's last visit — drives the "N new" pip. */
  newResponses: number;
  /** The transport sub-fact, carried through for the view (badge / freeze copy). */
  shareState?: 'live' | 'frozen' | 'revoked';
}

export interface WorkflowStatusInput {
  /** `ShareHandle.state` when a hosted share exists; undefined when none does. */
  shareState?: 'live' | 'frozen' | 'revoked';
  /** Legacy/seed `metadata.shared` — a live link before the ShareHandle existed. */
  legacyShared?: boolean;
  /** Distinct reader sessions that have RETURNED (merged/imported), not link reach. */
  readerCount: number;
  /** `metadata.newResponses` — unseen since last visit. */
  newResponses?: number;
}

const LABELS: Record<WorkflowStage, string> = {
  'draft': 'Ready to share',
  'shared': 'Shared',
  'responses': 'Responses available',
  'report-ready': 'Report ready',
};

const TONES: Record<WorkflowStage, WorkflowTone> = {
  'draft': 'neutral',
  'shared': 'active',
  'responses': 'attention',
  'report-ready': 'done',
};

/** Derive the loop lifecycle position. Pure; first-match-wins from most- to
 *  least-progressed, so a manuscript never reads *below* where its feedback puts
 *  it (the bug this replaces). A revoked share is treated as "no live link": the
 *  stage then rests entirely on whether feedback has returned — revoked with
 *  responses is still "Responses available" (the report stands), revoked with
 *  none falls back to "Ready to share." */
export function deriveWorkflowStatus(input: WorkflowStatusInput): WorkflowStatus {
  const readerCount = Math.max(0, Math.floor(input.readerCount || 0));
  const newResponses = Math.max(0, Math.floor(input.newResponses ?? 0));
  const shareState = input.shareState;
  const frozen = shareState === 'frozen';
  // A live link, for staging: an explicit live/frozen share, or the legacy
  // `shared` flag from before ShareHandle existed. Revoked is NOT live.
  const liveLink =
    shareState === 'live' || shareState === 'frozen' || input.legacyShared === true;

  let stage: WorkflowStage;
  if (readerCount >= 1 && frozen) stage = 'report-ready';
  else if (readerCount >= 1) stage = 'responses';
  else if (liveLink) stage = 'shared';
  else stage = 'draft';

  return {
    stage,
    label: LABELS[stage],
    tone: TONES[stage],
    readerCount,
    newResponses,
    shareState,
  };
}
