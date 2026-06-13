import { useEffect } from 'react';
import type { Chapter } from '../../engine/types';

interface ChapterNavProps {
  open: boolean;
  chapters: Chapter[];
  activeChapterIndex: number;
  onClose: () => void;
  onJump: (chapterId: string) => void;
  onAddChapters?: () => void;
}

export function ChapterNav({
  open,
  chapters,
  activeChapterIndex,
  onClose,
  onJump,
  onAddChapters,
}: ChapterNavProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {open && (
        <div id="nav-overlay" className="visible" onClick={onClose} />
      )}

      <nav id="chapter-nav" className={open ? 'open' : ''}>
        <div className="nav-section-label">Chapters</div>
        <div id="chapter-links">
          {chapters.map(ch => (
            <button
              key={ch.id}
              className={`chapter-link${ch.index === activeChapterIndex ? ' active' : ''}`}
              data-id={ch.id}
              onClick={() => {
                onClose();
                setTimeout(() => onJump(ch.id), 220);
              }}
            >
              <span className="ch-num">Chapter {String(ch.index).padStart(2, '0')}</span>
              {ch.title}
            </button>
          ))}
        </div>

        {onAddChapters && (
          <div style={{ padding: '20px 24px 0', borderTop: '1px solid var(--border)', marginTop: '16px' }}>
            <button
              style={{
                background: 'none', border: '1px solid var(--border)',
                fontFamily: "'Geist', sans-serif", fontSize: '10px',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--dim)', padding: '8px 14px', cursor: 'pointer',
                width: '100%', textAlign: 'left',
                transition: 'border-color 0.2s, color 0.2s',
              }}
              id="nav-add-chapter-btn"
              onClick={() => { onClose(); onAddChapters(); }}
            >
              + Add chapters
            </button>
          </div>
        )}
      </nav>
    </>
  );
}
