import React, { useEffect } from 'react';
import { useUIStore } from './state/uiStore';
import { useLibraryStore } from './state/libraryStore';
import { useReaderStore } from './state/readerStore';
import { LibraryScreen } from './screens/LibraryScreen';
import { LoadScreen } from './screens/LoadScreen';
import { ReaderScreen } from './screens/ReaderScreen';
import { Toast, useToast } from './components/ui/Toast';
import { SettingsMenu } from './components/ui/SettingsMenu';
import { QuillIcon, MenuIcon, AnnotateIcon, ReportIcon, LibraryIcon } from './components/ui/Icons';
import { parseMarkdown } from './engine/ingestion/parseMarkdown';
import type { Manuscript } from './engine/types';

function IconBtn({ onClick, active, title, label, children }: {
  onClick?: () => void;
  active?: boolean;
  title?: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button className={`icon-btn${active ? ' active-btn' : ''}`} onClick={onClick} title={title} aria-label={title}>
      {children}
      {label && <span className="icon-btn-label">{label}</span>}
    </button>
  );
}

export function App() {
  const { screen, theme, fontSize, annSidebarOpen, reportPanelOpen, setScreen, toggleNav, toggleAnnSidebar, toggleReportPanel } = useUIStore();
  const { library, upsertManuscript, updateManuscript, cycleStatus, deleteManuscript, replaceMarkdown, getReadingPosition } = useLibraryStore();
  const { manuscript, annotations, openManuscript, closeManuscript } = useReaderStore();
  const { toastState, showToast } = useToast();

  const [topbarHidden, setTopbarHidden] = React.useState(false);
  const [chapterLabel, setChapterLabel] = React.useState('');

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.setProperty('--body-size', `${fontSize}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply persisted theme/font once on mount; later changes go through uiStore
  }, []);

  useEffect(() => {
    function onScroll() {
      const sy = window.scrollY;
      setTopbarHidden(sy > 80 && screen === 'reader');
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [screen]);

  function handleLoad(combinedMarkdown: string) {
    const ms = upsertManuscript(combinedMarkdown);
    const { chapters } = parseMarkdown(combinedMarkdown);
    openManuscript(ms, chapters);
    setScreen('reader');
    showToast(`Loaded ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}.`);
  }

  function handleOpenFromLibrary(ms: Manuscript) {
    if (!ms.metadata.combinedMarkdown) {
      showToast('Files need reloading — use Load to re-import.');
      setScreen('load');
      return;
    }
    const { chapters } = parseMarkdown(ms.metadata.combinedMarkdown);
    openManuscript(ms, chapters);
    setScreen('reader');
  }

  function handleLibraryNav() {
    setScreen('library');
    closeManuscript();
    window.scrollTo(0, 0);
  }

  const title = manuscript?.metadata.title ?? '';
  const hasAnnotations = annotations.length > 0;

  return (
    <>
      <header id="topbar" className={topbarHidden ? 'hidden' : ''}>
        <div id="topbar-left">
          {screen === 'reader' ? (
            <>
              <IconBtn onClick={toggleNav} title="Chapters"><MenuIcon /></IconBtn>
              <span id="topbar-title">{title}</span>
            </>
          ) : (
            <button id="brand" className="show" onClick={handleLibraryNav}>
              <QuillIcon size={18} />
              <span className="brand-word">VELLIBRIS</span>
            </button>
          )}
        </div>

        <div id="topbar-right">
          {screen === 'reader' && (
            <>
              <span id="topbar-chapter">{chapterLabel}</span>
              <div style={{ position:'relative', display:'inline-flex' }}>
                <IconBtn onClick={toggleAnnSidebar} active={annSidebarOpen} title="Annotations (⌘E)" label="Annotations"><AnnotateIcon /></IconBtn>
                {hasAnnotations && <span id="revision-mode-badge" className="visible" />}
              </div>
              <IconBtn onClick={toggleReportPanel} active={reportPanelOpen} title="Report" label="Report"><ReportIcon /></IconBtn>
              {/* Divider fences the per-manuscript panel toggles off from the
                  leave-the-reader / settings controls, so Library isn't a stray click away. */}
              <span aria-hidden="true" style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 6px', alignSelf: 'center' }} />
            </>
          )}
          {(screen === 'reader' || screen === 'load') && (
            <IconBtn onClick={handleLibraryNav} title="Library" label="Library"><LibraryIcon /></IconBtn>
          )}
          <SettingsMenu />
        </div>
      </header>

      {screen === 'reader' && <div id="progress-track"><div id="progress-fill" /></div>}

      {screen === 'library' && (
        <div id="screen-library" className="active">
          <div className="screen-inner">
            <LibraryScreen library={library} onOpen={handleOpenFromLibrary} onNew={() => setScreen('load')} onDelete={deleteManuscript} onUpdate={(id, p) => updateManuscript(id, p as Parameters<typeof updateManuscript>[1])} onCycleStatus={cycleStatus} onReplaceMarkdown={(id, md) => { replaceMarkdown(id, md); }} getReadingPosition={getReadingPosition} />
          </div>
        </div>
      )}

      {screen === 'load' && (
        <div id="screen-load" className="active">
          <div className="screen-inner">
            <LoadScreen onLoad={handleLoad} />
          </div>
        </div>
      )}

      {screen === 'reader' && <ReaderScreen onChapterLabelChange={setChapterLabel} />}

      <Toast message={toastState.message} visible={toastState.visible} />
    </>
  );
}
