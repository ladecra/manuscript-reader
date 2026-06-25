import { useEffect, useState } from 'react';
import { CoverImage } from '../ui/CoverImage';
import { XIcon } from '../ui/Icons';

interface LibraryCardEditModalProps {
  manuscriptId: string;
  title: string;
  genre: string;
  onClose: () => void;
  onSave: (patch: { title: string; genre: string }) => void;
}

export function LibraryCardEditModal({
  manuscriptId, title, genre, onClose, onSave,
}: Omit<LibraryCardEditModalProps, 'open'>) {
  const [titleInput, setTitleInput] = useState(title);
  const [genreInput, setGenreInput] = useState(genre);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function save() {
    onSave({
      title: titleInput.trim() || 'Untitled',
      genre: genreInput.trim(),
    });
    onClose();
  }

  return (
    <div
      className="modal-overlay visible"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="modal-card lib-card-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit manuscript"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">Edit manuscript</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <XIcon size={14} />
          </button>
        </div>
        <div className="modal-body lib-card-edit-body">
          <div className="lib-card-edit-cover">
            <CoverImage manuscriptId={manuscriptId} title={titleInput || title} editable />
          </div>
          <label className="lib-card-edit-field">
            <span className="instrument-field-label">Title</span>
            <input
              id="lib-card-edit-title"
              className="pub-field-input"
              value={titleInput}
              maxLength={200}
              onChange={e => setTitleInput(e.target.value)}
            />
          </label>
          <label className="lib-card-edit-field">
            <span className="instrument-field-label">Genre</span>
            <input
              id="lib-card-edit-genre"
              className="pub-field-input"
              value={genreInput}
              maxLength={100}
              placeholder="Literary fiction, memoir, thriller…"
              onChange={e => setGenreInput(e.target.value)}
            />
          </label>
          <p className="lib-card-edit-hint">
            Cover saves when you choose an image. Title and genre save when you tap Save.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-primary-btn" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
