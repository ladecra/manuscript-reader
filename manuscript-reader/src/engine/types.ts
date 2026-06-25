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
  publishing?: PublishingMetadata; // author-supplied publishing data, applied to exported artifacts
  favorite?: boolean;        // author-flagged in the library (a starred shelf, not a status)
}

// ─── Publishing metadata (author-supplied, flows into exported artifacts) ──────
//
// The non-prose data a manuscript needs to become a *publishable* artifact: the
// title page, copyright page, and document properties of an export. Every field
// is author-entered and deterministic — none is inferred. The author maintains it
// on the manuscript page; the manuscript/DOCX & Markdown exports render it into
// front matter. Empty fields are simply omitted from the artifact (no blank
// "ISBN:" lines). Extend deliberately — a field added here must be consumed by an
// export, or it's a promise the artifact breaks.
export interface PublishingMetadata {
  genre?: string;
  synopsis?: string;
  subtitle?: string;
  publisher?: string;
  imprint?: string;
  isbn?: string;
  edition?: string;          // e.g. "First edition"
  series?: string;           // e.g. "The Hollow Cycle, Book 1"
  publicationDate?: string;  // free text, e.g. "Spring 2027"
  language?: string;         // e.g. "English"
  copyrightYear?: string;
  copyrightHolder?: string;
  rights?: string;           // e.g. "All rights reserved"
  dedication?: string;       // rendered as its own front-matter page
}

export const PUBLISHING_FIELDS: { key: keyof PublishingMetadata; label: string; placeholder: string; long?: boolean }[] = [
  { key: 'genre',           label: 'Genre',           placeholder: 'Literary fiction, memoir, thriller…' },
  { key: 'synopsis',        label: 'Synopsis',        placeholder: 'A short description for your title page and exports (Pandoc: description).', long: true },
  { key: 'subtitle',        label: 'Subtitle',        placeholder: 'A subtitle, if any' },
  { key: 'series',          label: 'Series',          placeholder: 'The Hollow Cycle, Book 1' },
  { key: 'publisher',       label: 'Publisher',       placeholder: 'Publishing house' },
  { key: 'imprint',         label: 'Imprint',         placeholder: 'Imprint' },
  { key: 'isbn',            label: 'ISBN',            placeholder: '978-…' },
  { key: 'edition',         label: 'Edition',         placeholder: 'First edition' },
  { key: 'publicationDate', label: 'Publication date', placeholder: 'Spring 2027' },
  { key: 'language',        label: 'Language',        placeholder: 'English' },
  { key: 'copyrightYear',   label: 'Copyright year',  placeholder: String(new Date().getFullYear()) },
  { key: 'copyrightHolder', label: 'Copyright holder', placeholder: 'Author or estate name' },
  { key: 'rights',          label: 'Rights',          placeholder: 'All rights reserved' },
  { key: 'dedication',      label: 'Dedication',      placeholder: 'For…', long: true },
];

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
  | 'structural'
  | 'pacing'
  | 'voice';

export const ANNOTATION_TYPES: AnnotationType[] = [
  'highlight', 'note', 'bookmark', 'question', 'continuity', 'structural', 'pacing', 'voice',
];

/** Editorial *concern* types — developmental flags that ask for revision
 *  attention (the work of editing), as opposed to engagement marks
 *  (highlight/bookmark) or neutral notes. Shared by the report engine, insights,
 *  and the panel so "developmental density" is computed exactly one way. */
export const DEVELOPMENTAL_TYPES: AnnotationType[] = ['question', 'continuity', 'structural', 'pacing', 'voice'];
/** Engagement marks — where readers leaned in, not where work is needed. */
export const ENGAGEMENT_TYPES: AnnotationType[] = ['highlight', 'bookmark'];

export const ANNOTATION_LABELS: Record<AnnotationType, string> = {
  highlight:  'Highlight',
  note:       'Note',
  bookmark:   'Bookmark',
  question:   'Question',
  continuity: 'Continuity',
  structural: 'Structural',
  pacing:     'Pacing',
  voice:      'Voice / Tone',
};

export const ANNOTATION_COLORS: Record<AnnotationType, string> = {
  highlight:  '#d9ac3c',
  note:       '#8e9192',
  bookmark:   '#6366f1',
  question:   '#ef6461',
  continuity: '#34d399',
  structural: '#fb923c',
  pacing:     '#38bdf8',
  voice:      '#c084fc',
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

// ─── Change list (Phase 8, Changes mode) ──────────────────────────────────────
// A coalesced, noise-filtered view of the Edit log for revision review. Repeated
// edits to the same passage chain into ONE entry (net before→after); changes that
// don't alter the RENDERED prose (formatting, whitespace, escape cleanup) are
// dropped. The reader marks revisions/additions in the prose and shows the
// before/after in the margin; deletions are listed (their text is gone).
export type ChangeKind = 'revised' | 'added' | 'deleted';

export interface ChangeEntry {
  id: string;               // the latest edit id in the chain (stable handle for the mark)
  kind: ChangeKind;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  // The CHANGED region only (common prefix/suffix trimmed for `revised`, so a
  // whole-chapter edit shows just the words that moved); '' for the absent side.
  previous: string;         // old wording ('' when added)
  current: string;          // new wording — also what the prose mark targets ('' when deleted)
  startEllipsis: boolean;   // context was trimmed before the changed region
  endEllipsis: boolean;     // context was trimmed after the changed region
  editCount: number;        // how many raw edits collapsed into this entry
  firstAt: number;
  lastAt: number;
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
  developmentalHotspots: ChapterStat[]; // chapters by developmental-flag density (concern types per 1k words) — the editorial-work lens, distinct from hotspots/engagement
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
  /** Flat, document-order structural blocks lifted from the SAME parse pass that
   *  produces `html`/`chapters` — the substrate the structural model groups. A
   *  single parse, so no second parser to drift. Additive: existing consumers
   *  destructure only `html`/`chapters` and ignore this. */
  blocks: StructuralBlock[];
}

// ─── Structural model (Stage 0 — the publish-ready linchpin) ──────────────────
// A canonical, browser-independent description of a manuscript's structure that
// every downstream stage (publish-ready renderer, tiering, query export) renders
// from — instead of each consumer re-deriving structure by re-parsing markdown.
// Built from `parseMarkdown`'s block stream; see engine/ingestion/manuscriptStructure.ts.

/** What a block IS, structurally. Mirrors exactly the block grammar parseMarkdown emits. */
export type BlockRole =
  | 'chapter-heading'  // `# ` (or setext ===) — opens a chapter
  | 'subheading'       // `## ` / `### `
  | 'paragraph'
  | 'blockquote'       // also the epigraph carrier
  | 'scene-break'      // a `<hr>` (`* * *`) inside a chapter
  | 'list'
  | 'code';

export interface StructuralBlock {
  role: BlockRole;
  /** Source span into the NORMALIZED markdown — identical domain to the parser's
   *  `data-md-start/end`, so edits and the renderer share one coordinate system. */
  sourceStart: number;
  sourceEnd: number;
  /** Plain text of the block (heading/paragraph/quote text); '' for scene-break. */
  text: string;
  /** Heading depth for subheadings (2 or 3); undefined otherwise. */
  level?: number;
  /** 1-based chapter this block belongs to; 0 = before the first chapter (the
   *  forematter region — sparse today, see the capture gap in the Stage-0 brief). */
  chapterIndex: number;
}

export interface ChapterSection {
  index: number;   // 1-based, aligns with Chapter.index / 'ch-N'
  id: string;
  title: string;
  blocks: StructuralBlock[];  // body blocks: paragraphs, subheadings, scene breaks, quotes…
  sceneBreakCount: number;
}

export interface ManuscriptStructure {
  title: string;
  /** Pre-first-chapter region. Sparse today: `structureManuscript` strips most
   *  front matter upstream (only the title survives, as a comment). Retaining it
   *  is the key Stage-0/1 follow-up before publish-ready export. */
  frontMatter: StructuralBlock[];
  chapters: ChapterSection[];
  /** Empty today: back matter is dropped by `structureManuscript` upstream.
   *  Same capture follow-up as `frontMatter`. */
  backMatter: StructuralBlock[];
  /** Full document-order substrate the groupings above project from. */
  blocks: StructuralBlock[];
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

// ─── Version snapshots (Phase 8) ──────────────────────────────────────────────
// An immutable, frozen copy of a manuscript's editorial state at a deliberate
// moment ("Draft 3", "After beta round") — the before/after axis the report
// engine's revision-impact features need. Uncapturable retroactively, so capture
// runs in the web app now even though the rich compare UI is a later (desktop)
// client. See raw/dev-plan-claude.md Phase 8.
//
// Two shapes for one storage split — large bodies are lazy, the light index is eager:
//   • SnapshotMeta — everything needed to LIST / label / compare WITHOUT loading the
//     (multi-MB) frozen markdown. Hydrated into the cache at startup.
//   • Snapshot     — the meta PLUS the frozen inputs. Loaded on demand (the cover
//     precedent: never held in the in-memory cache).
//
// Frozen INPUTS only (markdown + annotations + sessions). EditorialSignals are
// deliberately NOT frozen — they're a derivation, recomputed by the *current* engine
// at compare time so a Draft 2 ↔ Draft 4 diff never compares two engine versions
// (the same "derived caches are not truth" lesson as annotation chapter resolution).
// Bodies are content-addressed by `versionId`, so a "Save version" on unchanged prose
// costs zero new body bytes. Reader sessions bind back to the snapshot they read via
// matching `manuscriptVersionId` ↔ `versionId`.
export interface SnapshotMeta {
  id: string;
  manuscriptId: string;
  parentId?: string;            // the snapshot this draft was derived from (lineage; optional)
  label?: string;               // author-editable ("Draft 3"); the frozen content does not change
  createdAt: number;
  trigger: 'import' | 'manual'; // why it was captured: import baseline vs explicit "Save version"
  versionId: string;            // manuscriptVersionId(markdown) — the content address / dedup key
  wordCount: number;
  chapterCount: number;
}

/** A full immutable snapshot: the light meta plus the frozen inputs. The `markdown`
 *  is the content-addressed body (stored once per `versionId`); `annotations` and
 *  `sessions` are frozen as captured. No derived `signals` — recompute from these. */
export interface Snapshot extends SnapshotMeta {
  markdown: string;
  annotations: Annotation[];
  sessions: ReaderSession[];
}

// ─── Snapshot diff (Phase 8 — the revision-impact keystone) ───────────────────
// The structured, deterministic answer to "is this draft actually better, or does
// it just feel different?" Produced by diffSnapshots(from, to): each side's
// EditorialSignals is RECOMPUTED from its frozen inputs by the current engine
// (never read from a stored cache), then compared. No scores — only grounded
// deltas a reviser can act on. The output feeds the revision-impact report,
// History mode, and (eventually) the AI layer; it's also what will populate
// EditorialSignals.revisionImpact once a consumer pairs two snapshots.

/** A light reference to one side of a diff. */
export interface SnapshotRef {
  id: string;
  label?: string;
  versionId: string;
  createdAt: number;
  wordCount: number;
  chapterCount: number;
}

/** Per-chapter change across the interval. Chapters are aligned by title (with
 *  duplicate-title disambiguation by order); content change is detected by hashing
 *  each chapter's text, so `modified` means the prose actually changed. */
export interface SnapshotChapterDiff {
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  title: string;
  fromIndex: number | null;       // 1-based index in `from`, null if added
  toIndex: number | null;         // 1-based index in `to`, null if removed
  wordCountDelta: number;         // to − from (chapter words)
  annotationCountDelta: number;   // to − from (annotations homed to this chapter)
  engagementDelta: number;        // to − from (raw highlight+bookmark count; comparable across drafts)
}

/** Annotation lifecycle across the interval, keyed by annotation id — the literal
 *  "did the questions get addressed or persist?" signal. */
export interface AnnotationLifecycle {
  added: string[];           // ids present in `to`, absent in `from`
  removed: string[];         // ids in `from`, absent in `to` (deleted / addressed away)
  resolvedBetween: string[]; // id in both: open in `from`, resolved in `to`
  reopenedBetween: string[]; // id in both: resolved in `from`, open in `to`
  persistentOpen: string[];  // open in both (still unaddressed)
}

/** The structured diff of two snapshots — data, not presentation. */
export interface SnapshotDiff {
  from: SnapshotRef;
  to: SnapshotRef;
  identical: boolean;             // same versionId ⇒ prose unchanged (annotations/sessions may still differ)

  wordCountDelta: number;
  chapterCountDelta: number;
  unresolvedConcernsDelta: number;        // to − from (open question/continuity/structural)
  completionRateDelta: number | null;     // to − from, or null if either side had no readers

  chapters: SnapshotChapterDiff[];
  annotations: AnnotationLifecycle;
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

  // ── Annotation-derived substrate (the composed single-version Report) ──
  // The raw per-chapter stats, type totals, and engagement summary that the
  // curated findings below are derived from. Carried here so this object is the
  // SINGLE thing every consumer (panel, exports, AI) calls — they read raw stats
  // from `report.*` and multi-reader findings from the fields below, without ever
  // calling computeReport separately. Not duplication: the findings are the
  // projection, `report` is the substrate they project from.
  report: Report;

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

  // ── Prose-derived (text itself, not annotations; available on import) ──
  prose: ProseAnalysis | null;  // null when the source markdown isn't available

  // ── Cross-version (Phase 8) ──
  revisionImpact: null;         // placeholder until version snapshots exist; always null for now
}

// ─── Ranked insights (the evidence-linked layer the panel + exports lead with) ─
// A small, ranked list of "look here first" pointers, projected from the
// EditorialSignals substrate by engine/insights/rankInsights.ts. The ONE source
// of truth for the panel's Insights block and the exports' lead/takeaways, so
// download and on-screen never diverge. Each insight is a librarian pointer
// backed by numbers — counts vs this manuscript's own average, or reader actions
// — never an editorial verdict. Evidence stays STRUCTURED (numbers, not
// pre-formatted strings) so each surface formats for its own medium; the prose
// lives only in `headline`/`detail`.
export type InsightTier = 'consensus' | 'reaction' | 'prose';

export interface ManuscriptInsight {
  id: string;
  tier: InsightTier;
  headline: string;                  // one line, no hype
  detail?: string;                   // optional second line of context
  chapter: number | null;            // jump target (the low end of any range)
  chapterRange: [number, number] | null;
  evidence: InsightEvidence;
}

export interface InsightEvidence {
  kind: 'prose-length' | 'cluster' | 'agreement';
  label: string;                     // short structured tag for a chip, e.g. "2.1× avg", "3/4 readers", "5 questions"
  ratio?: number;                    // prose-length: chapter words / mean chapter words
  count?: number;                    // cluster: annotations of the signal in range
  readers?: [number, number];        // agreement: [annotated, reached]
  annotationIds?: string[];          // cluster: representative annotation ids for jump/export
}

// ─── Prose analysis (Phase A — deterministic metrics on the TEXT itself) ──────
// Derived from the manuscript prose, NOT annotations: available the moment a
// manuscript is parsed, needing no annotations, readers, or AI. Tier 1 only —
// pure counts and ratios, every figure traceable to the text. Baselines are the
// manuscript's OWN means, so a chapter is always framed self-relative ("2× your
// average"), never against an external "correct" style. Lexical flags (Tier 2)
// and inferential proxies (Tier 3) come later. See
// raw/prose-analysis-engine-brief.md.
export interface ProseAnalysis {
  generatedAt: number;
  chapters: ChapterProse[];
  baselines: ProseBaselines;
}

export interface ChapterProse {
  index: number;
  title: string;
  words: number;
  paragraphs: number;
  meanParagraphWords: number;
  scenes: number;                // sceneBreakCount + 1 (0 for a chapter with no prose)
  dialogueRatio: number;         // 0..1 — share of words in dialogue paragraphs
  sentences: number;
  meanSentenceWords: number;
  sentenceLengthVariance: number;// rhythm signal — high variance = varied sentence lengths
}

export interface ProseBaselines {
  chapterCount: number;
  totalWords: number;
  meanChapterWords: number;      // over chapters with prose (words > 0)
  meanSentenceWords: number;     // manuscript-wide: all sentence lengths
  dialogueRatio: number;         // manuscript-wide: dialogue words / total words
}
