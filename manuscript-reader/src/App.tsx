import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useUIStore, readerModeOf, type ReaderMode } from './state/uiStore';
import { useLibraryStore } from './state/libraryStore';
import { useReaderStore } from './state/readerStore';
import { LandingScreen } from './screens/LandingScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { LoadModal } from './screens/LoadScreen';
import { ReaderScreen } from './screens/ReaderScreen';
import { ManuscriptHubScreen } from './screens/ManuscriptHubScreen';
import { ReaderRail } from './components/layout/ReaderRail';
import { Toast, useToast } from './components/ui/Toast';
import { SettingsMenu } from './components/ui/SettingsMenu';
import { AppShell, type LibraryNavFilter } from './components/layout/AppShell';
import { QuillIcon, MenuIcon, LibraryIcon, UndoIcon, RedoIcon } from './components/ui/Icons';
import { parseMarkdown } from './engine/ingestion/parseMarkdown';
import { workspaceRailOpenByDefault, WORKSPACE_RAIL_MOBILE_MAX_PX } from './engine/ui/workspaceRail';
import type { Manuscript } from './engine/types';

function IconBtn({ onClick, active, title, label, disabled, children }: {
  onClick?: () => void;
  active?: boolean;
  title?: string;
  label?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className={`btn-icon${active ? ' active' : ''}`} onClick={onClick} title={title} aria-label={title} disabled={disabled}>
      {children}
      {label && <span className="btn-icon-label">{label}</span>}
    </button>
  );
}

/** The reader's 3-mode switch (Vellibris): Reading · Manuscript · Annotations. */
const READER_MODES: { key: ReaderMode; label: string; title: string }[] = [
  { key: 'reading',     label: 'Reading',     title: 'Reading mode — clean prose' },
  { key: 'manuscript',  label: 'Manuscript',  title: 'Manuscript view — edit prose' },
  { key: 'annotations', label: 'Annotations', title: 'Annotation mode — notes in the margin' },
];
function ReaderModeSwitch({ mode, hasAnnotations, onSet }: {
  mode: ReaderMode; hasAnnotations: boolean; onSet: (m: ReaderMode) => void;
}) {
  return (
    <div className="reader-mode-switch" role="tablist" aria-label="Reader mode">
      {READER_MODES.map(m => (
        <button
          key={m.key}
          role="tab"
          aria-selected={mode === m.key}
          className={`tab tab--reader${mode === m.key ? ' active' : ''}`}
          onClick={() => onSet(m.key)}
          title={m.title}
        >
          {m.label}
          {m.key === 'annotations' && hasAnnotations && <span className="reader-mode-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const {
    screen, theme, fontSize, annSidebarOpen, editMode,
    setScreen, toggleNav, setReaderMode, setHubPane,
  } = useUIStore();
  const readerMode = readerModeOf({ editMode, annSidebarOpen });
  const { library, upsertManuscript, cycleStatus, toggleFavorite, deleteManuscript, replaceMarkdown, getReadingPosition } = useLibraryStore();
  const { manuscript, annotations, openManuscript, closeManuscript, undoEdit, redoEdit, setEditReturnScroll, undoStack, redoStack } = useReaderStore();
  const { toastState, showToast } = useToast();

  // Undo/redo a committed prose edit: restore the snapshot markdown the store
  // returns, re-store it, and reopen (same id → history + scroll are preserved).
  const restoreEdit = React.useCallback((markdown: string | null, msg: string) => {
    if (markdown == null || !manuscript) return;
    setEditReturnScroll(window.scrollY);
    const updated = replaceMarkdown(manuscript.id, markdown);
    if (!updated) return;
    const { chapters } = parseMarkdown(updated.metadata.combinedMarkdown!);
    openManuscript(updated, chapters);
    showToast(msg);
  }, [manuscript, replaceMarkdown, openManuscript, setEditReturnScroll, showToast]);

  const handleUndo = React.useCallback(() => restoreEdit(undoEdit(), 'Edit undone.'), [restoreEdit, undoEdit]);
  const handleRedo = React.useCallback(() => restoreEdit(redoEdit(), 'Edit redone.'), [restoreEdit, redoEdit]);

  const [chapterLabel, setChapterLabel] = React.useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryNavFilter>('all');
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  // The reader rail is collapsed (icon-only) by default; the user can expand it.
  const [readerRailCollapsed, setReaderRailCollapsed] = useState(true);

  const shellActive = screen === 'library' || screen === 'manuscript';
  const favCount = library.filter(m => m.metadata.favorite).length;

  const workspaceManuscripts = useMemo(
    () =>
      [...library]
        .sort((a, b) => (b.metadata.lastOpened ?? 0) - (a.metadata.lastOpened ?? 0))
        .slice(0, 12)
        .map(m => ({ id: m.id, title: m.metadata.title })),
    [library],
  );

  function handleSwitchManuscript(id: string) {
    if (manuscript?.id === id) return;
    const ms = library.find(m => m.id === id);
    if (!ms) return;
    handleOpenHub(ms);
  }

  function resetShellScroll() {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('.app-shell-body')?.scrollTo(0, 0);
  }

  function goLibrary(filter: LibraryNavFilter = libraryFilter) {
    setLibraryFilter(filter);
    setScreen('library');
    closeManuscript();
    resetShellScroll();
  }

  useEffect(() => {
    document.documentElement.classList.toggle('shell-scroll-lock', shellActive);
    return () => document.documentElement.classList.remove('shell-scroll-lock');
  }, [shellActive]);

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.setProperty('--body-size', `${fontSize}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply persisted theme/font once on mount; later changes go through uiStore
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = screen === 'reader' ? 'reader' : 'studio';
  }, [screen]);

  // Enforce closed rail on narrow viewports when landing on the manuscript page
  // (setScreen already sets the default; this catches devtools resize and any drift).
  useLayoutEffect(() => {
    if (screen !== 'manuscript') return;
    const want = workspaceRailOpenByDefault('manuscript', window.innerWidth <= WORKSPACE_RAIL_MOBILE_MAX_PX);
    if (useUIStore.getState().workspaceRailOpen !== want) {
      useUIStore.setState({ workspaceRailOpen: want });
    }
  }, [screen]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${WORKSPACE_RAIL_MOBILE_MAX_PX}px)`);
    function onBreakpointChange() {
      const s = useUIStore.getState().screen;
      if (mq.matches && (s === 'manuscript' || s === 'reader')) {
        useUIStore.getState().closeWorkspaceRail();
      }
    }
    mq.addEventListener('change', onBreakpointChange);
    return () => mq.removeEventListener('change', onBreakpointChange);
  }, []);

  // Undo/redo committed edits: ⌘/Ctrl+Z, and ⇧⌘Z / Ctrl+Y to redo. While the
  // caret is inside a chapter being edited, defer to the browser's native
  // text-undo; our manuscript-level undo applies to already-committed edits.
  useEffect(() => {
    if (screen !== 'reader') return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      const isUndo = k === 'z' && !e.shiftKey;
      const isRedo = (k === 'z' && e.shiftKey) || k === 'y';
      if (!isUndo && !isRedo) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest?.('.chapter-block[contenteditable="true"], .chapter-block [contenteditable="true"]')) return; // native undo while typing
      e.preventDefault();
      if (isRedo) handleRedo(); else handleUndo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, handleUndo, handleRedo]);

  function handleLoad(combinedMarkdown: string) {
    const ms = upsertManuscript(combinedMarkdown);
    const { chapters } = parseMarkdown(combinedMarkdown);
    openManuscript(ms, chapters);
    setLoadModalOpen(false);
    setScreen('reader');
    showToast(`Loaded ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}.`);
  }

  // Open a manuscript's page (its home) — the title page + publishing workbench.
  // The card lands here; the reader ("Play") is entered from the page.
  function handleOpenHub(ms: Manuscript) {
    if (!ms.metadata.combinedMarkdown) {
      showToast('Files need reloading — use Load to re-import.');
      setLoadModalOpen(true);
      return;
    }
    const { chapters } = parseMarkdown(ms.metadata.combinedMarkdown);
    openManuscript(ms, chapters);
    setHubPane('contents');
    setScreen('manuscript');
    resetShellScroll();
  }

  // Read straight from the library card — enter the reader without the page stop.
  function handleReadFromLibrary(ms: Manuscript) {
    if (!ms.metadata.combinedMarkdown) {
      showToast('Files need reloading — use Load to re-import.');
      setLoadModalOpen(true);
      return;
    }
    const { chapters } = parseMarkdown(ms.metadata.combinedMarkdown);
    openManuscript(ms, chapters);
    setScreen('reader');
  }

  function handleLibraryNav() {
    goLibrary(libraryFilter);
  }

  // The wordmark is the "home" affordance — back out to the marketing landing.
  function handleHomeNav() {
    setScreen('landing');
    closeManuscript();
    window.scrollTo(0, 0);
  }

  const title = manuscript?.metadata.title ?? '';
  const hasAnnotations = annotations.length > 0;

  // Reader rail → this manuscript's hub (the page the old tools rail linked to).
  function goManuscriptPage() {
    setScreen('manuscript');
    resetShellScroll();
  }

  // The marketing front door owns the full viewport — no app topbar.
  if (screen === 'landing') {
    return <LandingScreen onOpenApp={handleLibraryNav} />;
  }

  // The library + manuscript hub are "bare": no global topbar — the rail carries
  // the wordmark and a single quiet settings control floats top-right (v3 mockups).
  const bareTop = screen === 'library' || screen === 'manuscript';

  return (
    <>
      {bareTop && (
        <div className="app-topctrl"><SettingsMenu /></div>
      )}
      {!bareTop && (
      <header id="topbar">
        <div id="topbar-left">
          {screen === 'reader' ? (
            <>
              <IconBtn onClick={toggleNav} title="Chapters"><MenuIcon /></IconBtn>
              <button id="topbar-title" className="topbar-title-btn" onClick={goManuscriptPage} title="Manuscript page">{title}</button>
              {chapterLabel && (
                <>
                  <span id="topbar-sep" aria-hidden="true">›</span>
                  <span id="topbar-chapter">{chapterLabel}</span>
                </>
              )}
            </>
          ) : (
            <button id="brand" className="show" onClick={handleHomeNav} title="Home">
              <QuillIcon size={18} />
              <span className="brand-name">
                <span className="brand-word">Vellibris</span>
                <span className="brand-sub">Manuscript Reader</span>
              </span>
            </button>
          )}
        </div>

        <div id="topbar-center">
          {screen === 'reader' && (
            <ReaderModeSwitch mode={readerMode} hasAnnotations={hasAnnotations} onSet={setReaderMode} />
          )}
        </div>

        <div id="topbar-right">
          {screen === 'reader' ? (
            editMode && (
              <>
                <IconBtn onClick={handleUndo} disabled={undoStack.length === 0} title="Undo edit (⌘Z)"><UndoIcon /></IconBtn>
                <IconBtn onClick={handleRedo} disabled={redoStack.length === 0} title="Redo edit (⇧⌘Z)"><RedoIcon /></IconBtn>
              </>
            )
          ) : (
            <>
              {screen === 'load' && (
                <IconBtn onClick={handleLibraryNav} title="Library"><LibraryIcon /></IconBtn>
              )}
              <SettingsMenu />
            </>
          )}
        </div>
      </header>
      )}

      {screen === 'reader' && <div id="progress-track"><div id="progress-fill" /></div>}

      {shellActive ? (
        <AppShell
          variant={screen === 'manuscript' ? 'manuscript' : 'library'}
          libraryFilter={libraryFilter}
          onLibraryFilter={f => goLibrary(f)}
          manuscriptCount={library.length}
          favoritesCount={favCount}
          activeManuscriptId={manuscript?.id}
          workspaceManuscripts={workspaceManuscripts}
          onSwitchManuscript={handleSwitchManuscript}
          onNewManuscript={() => setLoadModalOpen(true)}
          onHome={handleHomeNav}
          bareTop={bareTop}
        >
          {screen === 'library' && (
            <div id="screen-library" className="active app-shell-screen">
              <div className="screen-inner">
                <LibraryScreen
                  library={library}
                  libraryFilter={libraryFilter}
                  onLibraryFilter={f => setLibraryFilter(f)}
                  onOpen={handleOpenHub}
                  onRead={handleReadFromLibrary}
                  onNew={() => setLoadModalOpen(true)}
                  onDelete={deleteManuscript}
                  onCycleStatus={cycleStatus}
                  onToggleFavorite={toggleFavorite}
                  getReadingPosition={getReadingPosition}
                />
              </div>
            </div>
          )}
          {screen === 'manuscript' && manuscript && (
            <ManuscriptHubScreen
              key={manuscript.id}
              onRead={() => { setScreen('reader'); window.scrollTo(0, 0); }}
              onExit={handleLibraryNav}
            />
          )}
        </AppShell>
      ) : null}

      {screen === 'reader' && manuscript && (
        <>
          <ReaderRail
            collapsed={readerRailCollapsed}
            onToggleCollapsed={() => setReaderRailCollapsed(c => !c)}
            onHome={handleHomeNav}
            onLibrary={handleLibraryNav}
            onManuscriptPage={goManuscriptPage}
          />
          <div className={`reader-workspace${readerRailCollapsed ? '' : ' reader-workspace--rail-expanded'}`}>
            <ReaderScreen onChapterLabelChange={setChapterLabel} />
          </div>
        </>
      )}

      {loadModalOpen && (
        <LoadModal onLoad={handleLoad} onClose={() => setLoadModalOpen(false)} />
      )}

      <Toast message={toastState.message} visible={toastState.visible} />
    </>
  );
}
