import { useMemo, useState } from 'react';
import { buildImportSummary } from '../../engine/ingestion/importSummary';
import type { ImportSection, ImportSummary } from '../../engine/ingestion/importSummary';
import {
  renameChapter, mergeChapterUp, reclassifyChapterAsMatter, reclassifyMatterAsChapter,
  reclassifyMatterRole,
} from '../../engine/manuscript/structureEdit';
import { MATTER_ROLES_BY_REGION } from '../../engine/manuscript/matterEdit';
import type { MatterRegion, MatterRole } from '../../engine/types';
import { ChevronRightIcon } from '../ui/Icons';

// ─── The Structure editor — the author's correction surface for what ingestion
// detected. Controlled: it renders buildImportSummary(markdown) and, for every
// structural edit, hands a fresh markdown to onChange (each op is a pure engine
// transform). Built ONCE and mounted in two places: the pre-save import screen
// (working buffer) and the Studio (persisted via replaceMarkdown). Ingestion
// proposes; here the author disposes — rename, merge, and reclassify chapter⇄matter,
// with a prose preview so the decision is informed. ───

const ROLE_LABELS: Record<string, string> = {
  'half-title': 'Half title', 'title-page': 'Title page', 'about-author': 'About the author',
  'author-note': "Author's note", 'reading-group-guide': 'Reading group guide',
  'list-of-illustrations': 'List of illustrations', 'also-by': 'Also by the author',
};
const roleLabel = (role: string): string =>
  ROLE_LABELS[role] ?? role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const words = (n: number) => `${n.toLocaleString()} word${n === 1 ? '' : 's'}`;

/** Detected publishing values, shown so the author reviews them AT import (not
 *  buried in Studio → Details later). Read-only here — the fields are applied
 *  downstream; the point is that they're seen. */
const META_LABELS: [keyof ImportSummary['metadata'] | string, string][] = [
  ['copyrightYear', 'Copyright'], ['copyrightHolder', '© holder'], ['publisher', 'Publisher'],
  ['isbn', 'ISBN'], ['edition', 'Edition'], ['publicationDate', 'Published'],
];

interface StructureEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
}

export function StructureEditor({ markdown, onChange }: StructureEditorProps) {
  const summary = useMemo(() => buildImportSummary(markdown), [markdown]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey(k => (k === key ? null : key));

  const meta = META_LABELS.filter(([k]) => summary.metadata[k as string]);

  return (
    <div className="se">
      {meta.length > 0 && (
        <div className="se-meta">
          <div className="se-group-title">Detected details</div>
          <div className="se-meta-grid">
            {meta.map(([k, label]) => (
              <div className="se-meta-item" key={k as string}>
                <span className="se-meta-label">{label}</span>
                <span className="se-meta-value">{summary.metadata[k as string]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.flags.length > 0 && (
        <ul className="se-flags">
          {summary.flags.map((f, i) => (
            <li key={i} className={`ir-flag ir-flag--${f.level}`}>{f.message}</li>
          ))}
        </ul>
      )}

      <div className="se-spine">
        {summary.front.length > 0 && (
          <div className="se-group">
            <div className="se-group-title">Front matter</div>
            {summary.front.map((s, i) => (
              <MatterRow key={`f${i}`} section={s} open={openKey === `f${i}`} onToggle={() => toggle(`f${i}`)}
                onReclassifyAsChapter={() => onChange(reclassifyMatterAsChapter(markdown, s.region!, s.matterIndex!))}
                onReclassifyRole={(role) => onChange(reclassifyMatterRole(markdown, s.region!, s.matterIndex!, role))} />
            ))}
          </div>
        )}

        <div className="se-group">
          <div className="se-group-title">
            {summary.chapters.length} chapter{summary.chapters.length !== 1 ? 's' : ''}
          </div>
          {summary.chapters.length === 0 && <div className="ir-empty">No chapters detected.</div>}
          {summary.chapters.map((s, i) => (
            <ChapterRow
              key={`c${s.chapterIndex}:${s.title}`}
              section={s}
              open={openKey === `c${i}`}
              onToggle={() => toggle(`c${i}`)}
              onRename={title => onChange(renameChapter(markdown, s.chapterIndex!, title))}
              onMergeUp={i > 0 ? () => onChange(mergeChapterUp(markdown, s.chapterIndex!)) : undefined}
              onReclassify={(region, role) => onChange(reclassifyChapterAsMatter(markdown, s.chapterIndex!, region, role))}
            />
          ))}
        </div>

        {summary.back.length > 0 && (
          <div className="se-group">
            <div className="se-group-title">Back matter</div>
            {summary.back.map((s, i) => (
              <MatterRow key={`b${i}`} section={s} open={openKey === `b${i}`} onToggle={() => toggle(`b${i}`)}
                onReclassifyAsChapter={() => onChange(reclassifyMatterAsChapter(markdown, s.region!, s.matterIndex!))}
                onReclassifyRole={(role) => onChange(reclassifyMatterRole(markdown, s.region!, s.matterIndex!, role))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── A chapter row: inline rename, expandable drawer with preview + reclassify/merge ──
function ChapterRow({ section, open, onToggle, onRename, onMergeUp, onReclassify }: {
  section: ImportSection;
  open: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onMergeUp?: () => void;
  onReclassify: (region: MatterRegion, role: MatterRole) => void;
}) {
  // Uncontrolled + re-seeded via the row's `key` (which includes the title): a
  // committed rename rebuilds the summary and remounts the row with the new value,
  // so no setState-in-effect is needed to keep the field in sync.
  const commit = (value: string) => {
    const v = value.trim();
    if (v && v !== section.title) onRename(v);
  };

  return (
    <div className={`se-row${open ? ' se-row--open' : ''}`}>
      <div className="se-row-head">
        <button type="button" className="se-caret" onClick={onToggle} aria-expanded={open} aria-label="Details">
          <ChevronRightIcon size={12} />
        </button>
        <input
          className="se-title-input"
          defaultValue={section.title}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
          placeholder="Untitled chapter"
          aria-label="Chapter title"
        />
        <span className="se-row-meta">
          {section.sceneBreaks ? <span className="ir-scenes">{section.sceneBreaks} break{section.sceneBreaks !== 1 ? 's' : ''}</span> : null}
          <span className="ir-words">{words(section.words)}</span>
        </span>
      </div>
      {open && (
        <div className="se-drawer">
          {section.preview && <p className="se-preview">{section.preview}</p>}
          <div className="se-actions">
            {onMergeUp && (
              <button type="button" className="se-action" onClick={onMergeUp}>Merge into previous</button>
            )}
            <ReclassifyControl onApply={onReclassify} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── A matter row: role + title, expandable preview, one-click "make a chapter" ──
function MatterRow({ section, open, onToggle, onReclassifyAsChapter, onReclassifyRole }: {
  section: ImportSection;
  open: boolean;
  onToggle: () => void;
  onReclassifyAsChapter: () => void;
  onReclassifyRole: (role: MatterRole) => void;
}) {
  return (
    <div className={`se-row${open ? ' se-row--open' : ''}`}>
      <div className="se-row-head">
        <button type="button" className="se-caret" onClick={onToggle} aria-expanded={open} aria-label="Details">
          <ChevronRightIcon size={12} />
        </button>
        <span className="se-matter-label">
          {roleLabel(section.role)}
          {section.title && <span className="se-matter-title"> · {section.title}</span>}
        </span>
        <span className="se-row-meta"><span className="ir-words">{words(section.words)}</span></span>
      </div>
      {open && (
        <div className="se-drawer">
          {section.preview && <p className="se-preview">{section.preview}</p>}
          <div className="se-actions">
            <button type="button" className="se-action" onClick={onReclassifyAsChapter}>Make this a chapter</button>
            <MatterReclassifyControl currentRole={section.role as MatterRole} onApply={onReclassifyRole} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Reclassify matter in place (e.g. mis-filed title page → foreword). */
function MatterReclassifyControl({ currentRole, onApply }: { currentRole: MatterRole; onApply: (role: MatterRole) => void }) {
  const region = MATTER_ROLES_BY_REGION.front.includes(currentRole) ? 'front' : 'back';
  const roles = MATTER_ROLES_BY_REGION[region];
  const [role, setRole] = useState<MatterRole>(roles.includes(currentRole) ? currentRole : roles[0]);
  return (
    <div className="se-reclassify">
      <span className="se-reclassify-lead">Wrong type? Change to</span>
      <select className="se-select" value={role} onChange={e => setRole(e.target.value as MatterRole)} aria-label="Matter role">
        {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
      </select>
      <button type="button" className="se-action" disabled={role === currentRole}
        onClick={() => onApply(role)}>Update</button>
    </div>
  );
}

// ── Reclassify a chapter → front/back matter: pick a region + a role, then move. ──
function ReclassifyControl({ onApply }: { onApply: (region: MatterRegion, role: MatterRole) => void }) {
  const [region, setRegion] = useState<MatterRegion>('back');
  const roles = MATTER_ROLES_BY_REGION[region];
  const [role, setRole] = useState<MatterRole>('about-author');
  const onRegionChange = (next: MatterRegion) => {
    setRegion(next);
    const nextRoles = MATTER_ROLES_BY_REGION[next];
    setRole(r => (nextRoles.includes(r) ? r : nextRoles[0]));
  };
  return (
    <div className="se-reclassify">
      <span className="se-reclassify-lead">Not a chapter? Move to</span>
      <select className="se-select" value={region} onChange={e => onRegionChange(e.target.value as MatterRegion)} aria-label="Region">
        <option value="front">Front matter</option>
        <option value="back">Back matter</option>
      </select>
      <select className="se-select" value={role} onChange={e => setRole(e.target.value as MatterRole)} aria-label="Role">
        {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
      </select>
      <button type="button" className="se-action" onClick={() => onApply(region, role)}>Move</button>
    </div>
  );
}
