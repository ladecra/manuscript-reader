import { useMemo } from 'react';
import { buildImportSummary } from '../../engine/ingestion/importSummary';
import type { ImportSection } from '../../engine/ingestion/importSummary';
import { renameChapter, reclassifyChapterAsMatter, reclassifyMatterAsChapter } from '../../engine/manuscript/structureEdit';
import type { MatterRegion, MatterRole } from '../../engine/types';
import { PlusIcon } from '../ui/Icons';

// ─── The Structure editor — the author's correction surface for what ingestion
// detected, simplified (reframe) to ONE decision: is this a chapter, or set aside?
// The nine matter-roles are retired from the UI — set-aside is untyped here; the
// engine still records a role under the hood (region 'back' / 'other') so exports
// stay well-formed, but the author never picks one. Controlled: renders
// buildImportSummary(markdown) and hands a fresh markdown to onChange for each
// pure engine transform (rename · set-aside · make-a-chapter). Detection still
// runs; its smell flags surface at the top. ───

// Kept for read-only display of what a set-aside section is (never editable here).
const ROLE_LABELS: Record<string, string> = {
  'half-title': 'Half title', 'title-page': 'Title page', 'about-author': 'About the author',
  'author-note': "Author's note", 'reading-group-guide': 'Reading group guide',
  'list-of-illustrations': 'List of illustrations', 'also-by': 'Also by the author',
  'other': 'Set aside',
};
const roleLabel = (role: string): string =>
  ROLE_LABELS[role] ?? role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const words = (n: number) => `${n.toLocaleString()} word${n === 1 ? '' : 's'}`;

// A chapter the author sets aside becomes untyped back-matter ("other"). Region only
// affects export ordering; set-aside is left out of the reading view regardless.
const SET_ASIDE_REGION: MatterRegion = 'back';
const SET_ASIDE_ROLE: MatterRole = 'other';

interface StructureEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
}

export function StructureEditor({ markdown, onChange }: StructureEditorProps) {
  const summary = useMemo(() => buildImportSummary(markdown), [markdown]);
  const aside = [...summary.front, ...summary.back];

  return (
    <div className="se">
      {summary.flags.length > 0 && (
        <ul className="se-flags">
          {summary.flags.map((f, i) => (
            <li key={i} className={`ir-flag ir-flag--${f.level}`}>{f.message}</li>
          ))}
        </ul>
      )}

      <div className="se-buckets">
        {/* ── Chapters ── */}
        <div className="se-bucket">
          <div className="se-bucket-head">
            <span className="se-bucket-name">Chapters · <span className="tnum">{summary.chapters.length}</span></span>
            <span className="se-bucket-hint">Rename inline</span>
          </div>
          <div className="se-bucket-list">
            {summary.chapters.length === 0 && <div className="se-empty">No chapters detected.</div>}
            {summary.chapters.map((s, i) => (
              <ChapterRow
                key={`c${s.chapterIndex}:${s.title}`}
                section={s}
                ordinal={i + 1}
                onRename={title => onChange(renameChapter(markdown, s.chapterIndex!, title))}
                onSetAside={() => onChange(reclassifyChapterAsMatter(markdown, s.chapterIndex!, SET_ASIDE_REGION, SET_ASIDE_ROLE))}
              />
            ))}
          </div>
        </div>

        {/* ── Set aside ── */}
        <div className="se-bucket">
          <div className="se-bucket-head">
            <span className="se-bucket-name">Set aside · <span className="tnum">{aside.length}</span></span>
            <span className="se-bucket-hint">Kept, not shared</span>
          </div>
          <div className="se-bucket-list">
            {aside.length === 0 && <div className="se-empty">Nothing set aside — every section is a chapter.</div>}
            {aside.map((s, i) => (
              <AsideRow
                key={`a${s.region}:${s.matterIndex}:${i}`}
                section={s}
                onMakeChapter={() => onChange(reclassifyMatterAsChapter(markdown, s.region!, s.matterIndex!))}
              />
            ))}
            <p className="se-aside-note">
              Front &amp; back matter (title page, dedication, TOC, acknowledgements…) are kept with the
              manuscript but left out of the reading view. Promote anything that should be a chapter.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── A chapter row: number · inline rename · words · "Set aside". ──
function ChapterRow({ section, ordinal, onRename, onSetAside }: {
  section: ImportSection;
  ordinal: number;
  onRename: (title: string) => void;
  onSetAside: () => void;
}) {
  // Uncontrolled + re-seeded via the row's `key` (which includes the title): a
  // committed rename rebuilds the summary and remounts the row with the new value.
  const commit = (value: string) => {
    const v = value.trim();
    if (v && v !== section.title) onRename(v);
  };
  return (
    <div className="se-row">
      <span className="se-num tnum">{ordinal}</span>
      <input
        className="se-title-input"
        defaultValue={section.title}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        placeholder="Untitled chapter"
        aria-label={`Chapter ${ordinal} title`}
      />
      <span className="se-row-words">{words(section.words)}</span>
      <button type="button" className="se-move" onClick={onSetAside}>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 12h14" /></svg> Set aside
      </button>
    </div>
  );
}

// ── A set-aside row: what it is (read-only) · "Make a chapter". ──
function AsideRow({ section, onMakeChapter }: {
  section: ImportSection;
  onMakeChapter: () => void;
}) {
  return (
    <div className="se-aside-row">
      <span className="se-aside-name">
        {section.title || roleLabel(section.role)}
        {section.title && section.role !== 'other' && <span className="se-aside-role"> · {roleLabel(section.role)}</span>}
      </span>
      <button type="button" className="se-move" onClick={onMakeChapter}>
        <PlusIcon size={12} /> Make a chapter
      </button>
    </div>
  );
}
