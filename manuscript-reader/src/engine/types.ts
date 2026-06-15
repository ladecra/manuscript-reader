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
  readerId?: string;         // stable identity of the beta reader (Phase 5). Survives a renamed or blank name field; absent = author's own or a legacy import. Agreement analysis keys on this, not the display name.
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

/**
 * A reader's reading session — who read what, how far, and when (Phase 5). The
 * unit of multi-reader intelligence: the author is one session among several.
 *
 * Sessions are an *additive* layer over the flat annotation store — they record
 * the who/how-far/when that annotations alone can't (completion, abandonment),
 * and reference the annotations by id rather than owning them. (Phase 5.2 may
 * later invert this so the merged view becomes a projection over sessions; the
 * shape is ready for that without forcing it now.)
 *
 * Deliberately carries NO edits: editing is author-only and already modelled as
 * the first-class `Edit` entity on Manuscript — a session is reader *reactions*,
 * not author *decisions*.
 */
export interface ReaderSession {
  id: string;
  manuscriptId: string;
  readerId: string;            // stable identity (see Annotation.readerId); agreement joins on this
  readerName: string;
  manuscriptVersionId?: string;// content version the reader read — distinguishes a reader of Draft 2 from a reader of Draft 3 (Phase 8 maps to snapshots)
  startedAt: number;
  completedAt?: number;        // set when the reader reached the end
  progress: number;            // 0–1, furthest point reached
  annotationIds: string[];     // ids into the manuscript's annotation store
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

/** Per-chapter cross-reader agreement — the strongest revision signal: several
 *  readers independently reacting to the same chapter ≈ something real; one of
 *  many ≈ that reader's taste. */
export interface ChapterAgreementSignal {
  chapterIndex: number;
  chapterTitle: string;
  annotationCount: number;
  readersWhoAnnotated: number;  // distinct readers who reacted here
  readersWhoReached: number;    // readers whose progress reached this chapter (-1 if unknown — no word data)
  agreement: number;            // readersWhoAnnotated / readersWhoReached (falls back to /readerCount), 0–1
}

/**
 * The canonical structured output of the report engine (Phase 6) — the single
 * object that the in-app panel, the DOCX/HTML exports, and the future AI layer
 * all consume, so one computation never diverges into many. Deterministic; no
 * presentation. Composed from the annotation-derived report and the
 * session-derived multi-reader merge (see engine/editorialSignals.ts).
 *
 * Empty arrays / null fields are intentional when their inputs don't exist yet
 * (e.g. `revisionImpact` needs version snapshots — Phase 8). Consumers target
 * the shape now; the data fills in as later phases land.
 */
export interface EditorialSignals {
  manuscriptId: string;
  generatedAt: number;

  // ── Multi-reader context (from reader sessions) ──
  readerCount: number;
  completionRate: number;       // fraction of readers who finished
  versionsRead: string[];       // distinct manuscript versions read — did everyone read the same draft?

  // ── Where to look (annotation-derived) ──
  hotspots: ChapterStat[];
  silentChapters: ChapterStat[];// reached-but-quiet, when reach is known (abandonment-aware)
  questionClusters: AnnotationCluster[];
  continuityBreaks: AnnotationCluster[];

  // ── Cross-reader signal ──
  readerAgreement: ChapterAgreementSignal[]; // chapters ranked by independent-reader agreement
  unresolvedConcerns: number;   // open (not 'resolved') question/continuity/structural annotations

  // ── Engagement shape ──
  engagementCurve: number[];    // per-chapter normalized engagement, in chapter order
  engagementDrops: number[];    // chapter indices where engagement falls sharply vs the prior chapter

  // ── Cross-version (Phase 8) ──
  revisionImpact: null;         // placeholder until version snapshots exist; always null for now
}
