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
  reports: Report[];        // computed on demand, cached here
  exports: ExportRecord[];  // log of generated exports
}

export interface ManuscriptMetadata {
  title: string;
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
}

// ─── Report ──────────────────────────────────────────────────────────────────

export interface ChapterStat {
  title: string;
  index: number;
  count: number;
  counts: Partial<Record<AnnotationType, number>>;
  words: number;     // chapter word count (0 if unknown)
  density: number;   // annotations per 1,000 words
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
  annotations: string[]; // annotation IDs
  signal: 'confusion' | 'engagement' | 'continuity-break' | 'structural-issue';
  severity: 'low' | 'medium' | 'high';
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
