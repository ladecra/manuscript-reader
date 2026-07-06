import { useEffect, useMemo, useState } from 'react';
import { buildImportSummary, applyImportEdits } from '../engine/ingestion/importSummary';
import { StructureEditor } from '../components/library/StructureEditor';
import { ChevronLeftIcon } from '../components/ui/Icons';

interface ImportStructureScreenProps {
  /** The ingested, post-preprocess combined markdown. */
  markdown: string;
  /** Proceed: create the manuscript from the reviewed/corrected markdown. */
  onConfirm: (finalMarkdown: string) => void;
  /** Back out to the load step to re-choose files. */
  onCancel: () => void;
}

/**
 * The Structure stage, entered automatically on first import (pre-save). A
 * full-screen, intentional assembly surface — NOT a modal — where the author
 * confirms title/author and corrects the spine ingestion proposed (rename,
 * merge, reclassify chapter⇄matter) before the manuscript exists. Nothing is
 * persisted until "Open manuscript": the markdown is a working buffer, so backing
 * out is lossless and no Draft-0 baseline is created for a spine the author hasn't
 * accepted. The same StructureEditor is reused, persisted, in the Studio.
 */
export function ImportStructureScreen({ markdown, onConfirm, onCancel }: ImportStructureScreenProps) {
  // Working buffer: structural edits rewrite this; title/author apply on confirm.
  const [md, setMd] = useState(markdown);
  const initial = useMemo(() => buildImportSummary(markdown), [markdown]);
  const [title, setTitle] = useState(initial.title);
  const [author, setAuthor] = useState(initial.author ?? '');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const confirm = () => onConfirm(applyImportEdits(md, { title, author }));

  return (
    <div className="import-structure" id="screen-import-structure">
      <div className="import-structure-inner">
        <button type="button" className="hub-back is-import-back" onClick={onCancel}>
          <ChevronLeftIcon size={10} />
          Choose different files
        </button>

        <header className="import-structure-head">
          <h1 className="import-structure-title">Review structure</h1>
          <p className="import-structure-lead">
            This is what we read from your manuscript. Confirm the title and author, then check the
            spine below — rename a chapter, merge a stray one, or move a section that isn’t really a
            chapter into front or back matter. What you set here is what opens, reads, and exports.
          </p>
        </header>

        <div className="import-structure-fields">
          <label className="ir-field">
            <span className="ir-field-label">Title</span>
            <input className="ir-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled manuscript" />
          </label>
          <label className="ir-field">
            <span className="ir-field-label">Author</span>
            <input className="ir-input" value={author} onChange={e => setAuthor(e.target.value)} placeholder="Unknown" />
          </label>
        </div>

        <StructureEditor markdown={md} onChange={setMd} />

        <div className="import-structure-footer">
          <button type="button" className="ir-back" onClick={onCancel}>Cancel</button>
          <button type="button" className="modal-primary-btn import-structure-open" onClick={confirm}>Open manuscript</button>
        </div>
      </div>
    </div>
  );
}
