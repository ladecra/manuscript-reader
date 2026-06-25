// ─── Beta feedback import — version alignment (pure) ─────────────────────────
// Warn when imported notes were written against a different draft than the live
// manuscript, using content version ids and saved snapshots for human labels.

import type { SnapshotMeta } from './types';
import { manuscriptVersionId } from './manuscript/manuscriptVersion';
import type { ReaderExportPayload } from './sessions';

export type FeedbackImportAlignment = 'match' | 'unknown' | 'mismatch';

export interface FeedbackImportValidation {
  alignment: FeedbackImportAlignment;
  feedbackVersionId?: string;
  liveVersionId?: string;
  /** Snapshot whose frozen prose matches the feedback, if any. */
  feedbackSnapshot?: SnapshotMeta;
  /** Short line for UI (toast / confirm). */
  message: string;
}

function snapshotLabel(snap: SnapshotMeta): string {
  return snap.label?.trim() || 'saved version';
}

export function validateFeedbackImport(
  payload: ReaderExportPayload,
  liveMarkdown: string | undefined,
  snapshots: SnapshotMeta[],
): FeedbackImportValidation {
  const feedbackVersionId = payload.manuscriptVersionId?.trim() || undefined;
  const liveVersionId = liveMarkdown ? manuscriptVersionId(liveMarkdown) : undefined;

  if (!feedbackVersionId) {
    return {
      alignment: 'unknown',
      liveVersionId,
      message: 'This file has no draft stamp (older reader export). Notes will import, but version alignment is unknown.',
    };
  }

  const feedbackSnapshot = snapshots.find(s => s.versionId === feedbackVersionId);

  if (liveVersionId && feedbackVersionId === liveVersionId) {
    const snapNote = feedbackSnapshot ? ` (${snapshotLabel(feedbackSnapshot)})` : '';
    return {
      alignment: 'match',
      feedbackVersionId,
      liveVersionId,
      feedbackSnapshot,
      message: `Feedback matches your current draft${snapNote}.`,
    };
  }

  const feedbackName = feedbackSnapshot
    ? `“${snapshotLabel(feedbackSnapshot)}”`
    : `draft ${feedbackVersionId}`;
  const liveName = liveVersionId
    ? (snapshots.find(s => s.versionId === liveVersionId)
      ? `“${snapshotLabel(snapshots.find(s => s.versionId === liveVersionId)!)}”`
      : 'your current draft')
    : 'the manuscript (source unavailable)';

  return {
    alignment: 'mismatch',
    feedbackVersionId,
    liveVersionId,
    feedbackSnapshot,
    message:
      `This feedback is for ${feedbackName}, but you are on ${liveName}. ` +
      'Anchors and quotes may not land reliably.',
  };
}

/** Gate import in the browser; returns whether to proceed. */
export function confirmFeedbackImportIfNeeded(
  validation: FeedbackImportValidation,
): boolean {
  if (validation.alignment === 'match') return true;
  if (validation.alignment === 'unknown') {
    return window.confirm(
      `${validation.message}\n\nImport anyway?`,
    );
  }
  return window.confirm(
    `${validation.message}\n\nImport anyway?`,
  );
}
