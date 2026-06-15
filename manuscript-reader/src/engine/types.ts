// ─── Manuscript Intelligence Platform — Canonical Types ───────────────────────
//
// The Manuscript is the product. Every screen, engine, and future client
// (desktop app, AI layer, collaborative workspace) consumes these types.
// React is one client. Never let the React layer own the data model.

// ─── Manuscript (canonical object) ───────────────────────────────────────────

export interface Manuscript {
  id: string;
  metadata: ManuscriptMetadata;
  chapters: Chapter[];
  annotations: Annotation[];
  edits: Edit[];            // author edit decisions (distinct from reader annotations)
  reports: Report[];        // computed on demand, cached here
  exports: ExportRecord[];  // log of generated exports
}

export interface ManuscriptMetadata {
  title: string;
  author?: string;
  wordCount: number;
  chapterCount: number;
  lastOpened: number;
  status: ManuscriptStatus;
  combinedMarkdown?: string; // source of truth; may be evicted to free localStorage
  uncached?: boolean;
  progress?: number;         // 0–1 reading position fraction
}

export type ManuscriptStatus =
  | 'Draft'
  | 'In Progress'
  | 'Final Polish'
  | 'Complete'
  | 'Archived';

export const MANUSCRIPT_STATUSES: ManuscriptStatus[] = [
  'Draft',
  'In Progress',
  'Final Polish',
  'Complete',
  'Archived',
];

// ─── Chapter ─────────────────────────────────────────────────────────────────

export interface Chapter {
  id: string;      // DOM anchor id, e.g. "ch-1"
  index: number;   // 1-based
  title: string;
  wordCount?: number;
}

// ─── Annotation ──────────────────────────────────────────────────────────────

export type AnnotationType =
  | 'highlight'
  | 'note'
  | 'bookmark'
  | 'question'
  | 'continuity'
  | 'structural';

export const ANNOTATION_TYPES: AnnotationType[] = [
  'highlight', 'note', 'bookmark', 'question', 'continuity', 'structural',
];

export const ANNOTATION_LABELS: Record<AnnotationType, string> = {
  highlight:  'Highlight',
  note:       'Note',
  bookmark:   'Bookmark',
  question:   'Question',
  continuity: 'Continuity',
  structural: 'Structural',
};

export const ANNOTATION_COLORS: Record<AnnotationType, string> = {
  highlight:  '#d9ac3c',
  note:       '#8e9192',
  bookmark:   '#6366f1',
  question:   '#ef6461',
  continuity: '#34d399',
  structural: '#fb923c',
};

/** Revision lifecycle of an annotation. Reserved now (no UI yet) so the data
 *  model is ready when beta-reader feedback and open/resolved workflows land
 *  (dev-plan Phase 4/5). Absent = treat as 'open'. */
export type AnnotationStatus = 'open' | 'resolved';

export interface Annotation {
  id: string;
  type: AnnotationType;
  quote: string;             // selected text, up to 400 chars
  note: string;
  chapterTitle: string;
  chapterIndex: number;
  createdAt: number;         // Unix ms
  readerName: string | null; // null = author's own; named for beta reader imports
  imported?: boolean;
  status?: AnnotationStatus; // reserved for revision workflow; absent = 'open'
  anchor?: TextAnchor;       // durable re-location anchor (Phase 4); absent = legacy, re-anchor by quote alone
}

/**
 * A durable text anchor (Phase 4). Locates a quoted span by its surrounding
 * context rather than a bare first-match search, so an annotation survives
 * chapter reordering and text edits that don't touch the quote, and degrades
 * gracefully (to the right region, or to "orphaned") when the quote itself is
 * edited. Operates in the rendered-text domain the reader selects in.
 */
export interface TextAnchor {
  quote: string;   // the anchored text (mirrors Annotation.quote; kept here so the anchor is self-contained)
  prefix: string;  // rendered text immediately before the quote (context)
  suffix: string;  // rendered text immediately after the quote (context)
  offset: number;  // index of the quote within the anchor's text domain at creation time (a hint, not a guarantee)
  /** Durable chapter identity (Chapter.id, e.g. "ch-3"). When present, the anchor
   *  was captured in that chapter's rendered-text domain and re-location is scoped
   *  to it — so the anchor survives chapter reordering, and a sentence duplicated
   *  across chapters resolves to the right one. Absent = legacy whole-manuscript
   *  anchor (resolves against the full rendered text, as before). */
  chapterId?: string;
}

// ─── Edit ────────────────────────────────────────────────────────────────────
//
// An author's edit decision, modelled as a first-class object distinct from an
// Annotation. The distinction is deliberate: an annotation is an *observation*
// (a reader reacting to a passage); an edit is a *decision* (the author changing
// it). Conflating them — "an edit is just a special annotation" — was tempting,
// but they have different lifecycles and different consumers. Keeping them apart
// gives us a revision log for free now, and a clean signal for version snapshots
// (Phase 8) and the AI interpretation layer (Phase 9) later.
//
// Edit mode rewrites the manuscript's source markdown in place; this record is
// the durable trail of *what changed*, captured at commit time.

export interface Edit {
  id: string;
  manuscriptId: string;
  chapterId: string;        // durable chapter identity (Chapter.id, e.g. "ch-1") — survives reordering
  chapterIndex: number;     // presentation only (parallels Annotation); for grouping/labels
  chapterTitle: string;     // presentation only
  /** Anchor in the *source-markdown* domain (not rendered text): locates the
   *  edited span by surrounding source context so the edit can be re-found in a
   *  later draft. quote === originalText. */
  anchor: TextAnchor;
  originalText: string;     // the source-markdown span before the edit
  replacementText: string;  // the source-markdown span after the edit
  createdAt: number;        // Unix ms
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface ChapterStat {
  title: string;
  index: number;
  count: number;
  counts: Partial<Record<AnnotationType, number>>;
  words: number;       // chapter word count (0 if unknown)
  density: number;     // annotations per 1,000 words
  readerCount: number; // distinct named (beta) readers who annotated this chapter
}

export interface Report {
  id: string;
  generatedAt: number;
  totalAnns: number;
  totalWords: number;
  typeTotals: Record<AnnotationType, number>;
  chapters: ChapterStat[];      // per-chapter stats, in order
  hotspots: ChapterStat[];
  silent: ChapterStat[];
  questionClusters: ChapterStat[];
  continuityFlags: ChapterStat[];
  readers: string[];            // distinct reader names
  avgDensity: number;
  coverage: number;             // fraction of chapters with >=1 annotation
  score: number;                // engagement score 0–100
  label: string;                // engagement label
  blurb: string;                // engagement blurb
  clusters: AnnotationCluster[];// detected editorial signals (confusion / continuity / structural / engagement)
  consensus: ChapterStat[];     // chapters multiple beta readers reacted to, sorted by reader agreement (empty for <2 readers)
  // Placeholders for Phase 2 report engine:
  engagementScore?: number;
  annotationClusters?: AnnotationCluster[];
  readerSessions?: ReaderSession[];
}

// ─── Export ──────────────────────────────────────────────────────────────────

export interface ExportRecord {
  id: string;
  type: ExportType;
  generatedAt: number;
  filename: string;
}

export type ExportType = 'revision-packet-md' | 'revision-packet-docx' | 'report-json' | 'reader-html' | 'annotations-json';

// ─── Parsed manuscript (transient — not persisted) ────────────────────────────

export interface ParsedManuscript {
  html: string;
  chapters: Chapter[];
}

// ─── Placeholder interfaces for future engine outputs ────────────────────────
// Defining boundaries now prevents the React layer from accidentally
// becoming the system architecture. These will be fleshed out in Phase 2–3.

/** A cluster of related annotations (e.g. question density in a chapter range). */
export interface AnnotationCluster {
  id: string;
  type: AnnotationType;
  chapterRange: [number, number];
  annotations: string[]; // annotation IDs, ordered for display
  signal: 'confusion' | 'engagement' | 'continuity-break' | 'structural-issue';
  severity: 'low' | 'medium' | 'high';
  count: number;         // annotations of this signal within the range
}

/** A beta reader's reading session — who read what and when. */
export interface ReaderSession {
  id: string;
  readerName: string;
  startedAt: number;
  completedAt?: number;
  progress: number; // 0–1
  annotationIds: string[];
}

/** A revision packet — the editorial deliverable for a reader session. */
export interface RevisionPacket {
  id: string;
  manuscriptId: string;
  manuscriptTitle: string;
  generatedAt: number;
  annotations: Annotation[];
  chapters: Chapter[];
  report: Report;
  format: 'markdown' | 'docx' | 'json';
}

/** An AI-interpretable set of editorial signals (Phase 6). */
export interface EditorialSignals {
  manuscriptId: string;
  hotspots: ChapterStat[];
  questionClusters: AnnotationCluster[];
  continuityBreaks: AnnotationCluster[];
  silentChapters: Chapter[];
  engagementCurve: number[]; // per-chapter normalized score
}
