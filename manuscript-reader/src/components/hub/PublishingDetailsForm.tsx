import { useState } from 'react';
import type { ManuscriptStatus, PublishingMetadata } from '../../engine/types';

// ── Publishing Details: title page + publishing metadata. Every field here flows
// into the manuscript's DOCX/Markdown exports (front matter, copyright page,
// dedication). Shared by the Manuscript Hub's details pane and the Publishing
// Studio's hero pane so the two stay byte-for-byte identical. ──

const STATUS_META: { s: ManuscriptStatus; icon: string }[] = [
  { s: 'Draft',        icon: '○' },
  { s: 'In Progress',  icon: '◑' },
  { s: 'Final Polish', icon: '✦' },
  { s: 'Complete',     icon: '✓' },
  { s: 'Archived',     icon: '⊡' },
];

function PubField({ label, id, value, onChange, placeholder = '', max, wide = false }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; max: number; wide?: boolean;
}) {
  return (
    <div className={`pub-field${wide ? ' pub-field--wide' : ''}`}>
      <label className="instrument-field-label" htmlFor={id}>{label}</label>
      <input id={id} className="pub-field-input" type="text" value={value}
        placeholder={placeholder} maxLength={max} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function PubTextarea({ label, id, value, onChange, placeholder = '', max, wide = false, counterNearLimit = false }: {
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; max: number; wide?: boolean; counterNearLimit?: boolean;
}) {
  const showCounter = counterNearLimit && value.length >= max * 0.85;
  return (
    <div className={`pub-field${wide ? ' pub-field--wide' : ''}`}>
      <label className="instrument-field-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="pub-field-input pub-field-textarea" value={value}
        placeholder={placeholder} maxLength={max} rows={4}
        onChange={e => onChange(e.target.value)} />
      {showCounter && (
        <span className="pub-field-counter" aria-live="polite">{value.length} / {max}</span>
      )}
    </div>
  );
}

export function PublishingDetailsForm({
  title, author, status, publishing, onSave,
}: {
  title: string; author: string; status: ManuscriptStatus; publishing: PublishingMetadata;
  onSave: (patch: { title: string; author: string; status: ManuscriptStatus; publishing: PublishingMetadata }) => void;
}) {
  const [titleInput, setTitleInput] = useState(title);
  const [authorInput, setAuthorInput] = useState(author);
  const [selectedStatus, setSelectedStatus] = useState<ManuscriptStatus>(status);
  const [pub, setPub] = useState<PublishingMetadata>(publishing);

  const sf = (key: keyof PublishingMetadata) => (v: string) => setPub(p => ({ ...p, [key]: v }));
  const save = () => onSave({ title: titleInput.trim() || 'Untitled', author: authorInput.trim(), status: selectedStatus, publishing: pub });
  const reset = () => { setTitleInput(title); setAuthorInput(author); setSelectedStatus(status); setPub(publishing); };

  return (
    <div className="hub-panel hub-details-form">
      <div className="pub-form-header">
        <div>
          <h2 className="hub-panel-title">Publishing Details</h2>
          <p className="hub-panel-lead">Title page and publishing data — applied to every artifact you export.</p>
        </div>
        <button type="button" className="pub-save-btn" onClick={save}>Save changes</button>
      </div>

      <div className="instrument-group-label">Work identification</div>
      <div className="pub-form-grid">
        <PubField label="Title" id="hub-detail-title" value={titleInput} onChange={setTitleInput} max={200} />
        <PubField label="Author" id="hub-detail-author" value={authorInput} onChange={setAuthorInput} max={200} placeholder="Author (optional)" />
        <PubField label="Subtitle" id="hub-pub-subtitle" value={pub.subtitle ?? ''} onChange={sf('subtitle')} max={200} placeholder="A subtitle, if any" />
        <PubField label="Series" id="hub-pub-series" value={pub.series ?? ''} onChange={sf('series')} max={200} placeholder="The Hollow Cycle, Book 1" />
        <PubField label="Publisher" id="hub-pub-publisher" value={pub.publisher ?? ''} onChange={sf('publisher')} max={200} placeholder="Publishing house" />
        <PubField label="Imprint" id="hub-pub-imprint" value={pub.imprint ?? ''} onChange={sf('imprint')} max={200} placeholder="Imprint" />
      </div>

      <div className="instrument-group-label pub-section-label">Classification</div>
      <div className="pub-form-grid">
        <PubField label="Genre" id="hub-pub-genre" value={pub.genre ?? ''} onChange={sf('genre')} max={100} placeholder="Literary fiction, memoir, thriller…" />
        <PubField label="Language" id="hub-pub-language" value={pub.language ?? ''} onChange={sf('language')} max={50} placeholder="English" />
      </div>

      <div className="instrument-group-label pub-section-label">Synopsis</div>
      <div className="pub-form-grid">
        <PubTextarea label="Short synopsis" id="hub-pub-synopsis" value={pub.synopsis ?? ''} onChange={sf('synopsis')} max={1000}
          placeholder="A short description for your title page and exports (Pandoc: description)." wide counterNearLimit />
      </div>

      <div className="instrument-group-label pub-section-label">Publication</div>
      <div className="pub-form-grid">
        <PubField label="ISBN" id="hub-pub-isbn" value={pub.isbn ?? ''} onChange={sf('isbn')} max={20} placeholder="978-…" />
        <PubField label="Edition" id="hub-pub-edition" value={pub.edition ?? ''} onChange={sf('edition')} max={100} placeholder="First edition" />
        <PubField label="Publication date" id="hub-pub-publicationDate" value={pub.publicationDate ?? ''} onChange={sf('publicationDate')} max={100} placeholder="Spring 2027" />
      </div>

      <div className="instrument-group-label pub-section-label">Copyright</div>
      <div className="pub-form-grid">
        <PubField label="Copyright year" id="hub-pub-copyrightYear" value={pub.copyrightYear ?? ''} onChange={sf('copyrightYear')} max={10} placeholder={String(new Date().getFullYear())} />
        <PubField label="Copyright holder" id="hub-pub-copyrightHolder" value={pub.copyrightHolder ?? ''} onChange={sf('copyrightHolder')} max={200} placeholder="Author or estate name" />
        <PubField label="Rights" id="hub-pub-rights" value={pub.rights ?? ''} onChange={sf('rights')} max={200} placeholder="All rights reserved" wide />
        <PubTextarea label="Dedication" id="hub-pub-dedication" value={pub.dedication ?? ''} onChange={sf('dedication')} max={1000} placeholder="For…" wide counterNearLimit />
      </div>

      <div className="instrument-group-label pub-section-label">Status</div>
      <div className="pub-status-options">
        {STATUS_META.map(({ s, icon }) => (
          <button key={s} type="button" className={`status-opt${selectedStatus === s ? ' selected' : ''}`}
            onClick={() => setSelectedStatus(s)}>
            <span className="status-opt-icon" aria-hidden="true">{icon}</span>
            {s}
          </button>
        ))}
      </div>

      <div className="pub-form-actions">
        <button type="button" className="btn-outline pub-reset-btn" onClick={reset}>Reset</button>
      </div>
    </div>
  );
}
