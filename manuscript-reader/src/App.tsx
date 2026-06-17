import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useUIStore } from './state/uiStore';
import { useLibraryStore } from './state/libraryStore';
import { useReaderStore } from './state/readerStore';
import { LandingScreen } from './screens/LandingScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { LoadScreen } from './screens/LoadScreen';
import { ReaderScreen } from './screens/ReaderScreen';
import { ManuscriptHubScreen } from './screens/ManuscriptHubScreen';
import { ManuscriptWorkspaceRail, type HubPane } from './components/layout/ManuscriptWorkspaceRail';
import { Toast, useToast } from './components/ui/Toast';
import { SettingsMenu } from './components/ui/SettingsMenu';
import { AppShell, type LibraryNavFilter } from './components/layout/AppShell';
import { QuillIcon, MenuIcon, AnnotateIcon, LibraryIcon, PencilIcon, UndoIcon, RedoIcon, PanelIcon } from './components/ui/Icons';
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
    <button className={`icon-btn${active ? ' active-btn' : ''}`} onClick={onClick} title={title} aria-label={title} disabled={disabled}>
      {children}
      {label && <span className="icon-btn-label">{label}</span>}
    </button>
  );
}

export function App() {
  const {
    screen, theme, fontSize, annSidebarOpen, editMode, workspaceRailOpen,
    setScreen, toggleNav, toggleAnnSidebar, toggleEditMode, toggleWorkspaceRail,
    setHubPane, openAnnSidebar, closeWorkspaceRail,
  } = useUIStore();
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

  const [topbarHidden, setTopbarHidden] = React.useState(false);
  const [chapterLabel, setChapterLabel] = React.useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryNavFilter>('all');

  const shellActive = screen === 'library' || screen === 'manuscript' || screen === 'load';
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

  function goLibrary(filter: LibraryNavFilter = libraryFilter) {
    setLibraryFilter(filter);
    setScreen('library');
    closeManuscript();
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.style.setProperty('--body-size', `${fontSize}px`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply persisted theme/font once on mount; later changes go through uiStore
  }, []);

  // Enforce closed rail on narrow viewports when landing on the manuscript page
  // (setScreen already sets the default; this catches devtools resize and any drift).
  useLayoutEffect(() => {
    if (screen !== 'manuscript') return;
    const want = workspaceRailOpenByDefault('manuscript');
    if (useUIStore.getState().workspaceRailOpen !== want) {
      useUIStore.setState({ workspaceRailOpen: want });
    }
  }, [screen, manuscript?.id]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${WORKSPACE_RAIL_MOBILE_MAX_PX}px)`);
    function onBreakpointChange() {
      if (mq.matches && useUIStore.getState().screen === 'manuscript') {
        useUIStore.getState().closeWorkspaceRail();
      }
    }
    mq.addEventListener('change', onBreakpointChange);
    return () => mq.removeEventListener('change', onBreakpointChange);
  }, []);

  useEffect(() => {
    function onScroll() {
      const sy = window.scrollY;
      setTopbarHidden(sy > 80 && screen === 'reader');
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [screen]);

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
      if (active?.closest?.('.chapter-block[contenteditable="true"]')) return; // native undo while typing
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
    setScreen('reader');
    showToast(`Loaded ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}.`);
  }

  // Open a manuscript's page (its home) — the title page + publishing workbench.
  // The card lands here; the reader ("Play") is entered from the page.
  function handleOpenHub(ms: Manuscript) {
    if (!ms.metadata.combinedMarkdown) {
      showToast('Files need reloading — use Load to re-import.');
      setScreen('load');
      return;
    }
    const { chapters } = parseMarkdown(ms.metadata.combinedMarkdown);
    openManuscript(ms, chapters);
    setHubPane('contents');
    setScreen('manuscript');
    window.scrollTo(0, 0);
  }

  // Read straight from the library card — enter the reader without the page stop.
  function handleReadFromLibrary(ms: Manuscript) {
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

  const workspaceSavedLabel = manuscript?.metadata.lastOpened
    ? `Auto-saved · ${new Date(manuscript.metadata.lastOpened).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    : 'Auto-saved';

  const handleReaderRailPane = React.useCallback((id: HubPane) => {
    if (id === 'feedback') {
      closeWorkspaceRail();
      openAnnSidebar();
      return;
    }
    setHubPane(id);
    setScreen('manuscript');
    window.scrollTo(0, 0);
  }, [closeWorkspaceRail, openAnnSidebar, setHubPane, setScreen]);

  // The marketing front door owns the full viewport — no app topbar.
  if (screen === 'landing') {
    return <LandingScreen onOpenApp={handleLibraryNav} />;
  }

  const toolsToggle = (screen === 'reader' || screen === 'manuscript') && (
    <IconBtn
      onClick={toggleWorkspaceRail}
      active={workspaceRailOpen}
      title="Manuscript tools"
    >
      <PanelIcon />
    </IconBtn>
  );

  return (
    <>
      <header id="topbar" className={topbarHidden ? 'hidden' : ''}>
        <div id="topbar-left">
          {screen === 'reader' ? (
            <>
              <IconBtn onClick={toggleNav} title="Chapters"><MenuIcon /></IconBtn>
              <button id="topbar-title" className="topbar-title-btn" onClick={() => setScreen('manuscript')} title="Manuscript page">{title}</button>
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

        <div id="topbar-right">
          {screen === 'reader' && (
            <>
              <span id="topbar-chapter">{chapterLabel}</span>
              <div style={{ position:'relative', display:'inline-flex' }}>
                <IconBtn onClick={toggleAnnSidebar} active={annSidebarOpen} title="Annotations (⌘E)" label="Annotations"><AnnotateIcon /></IconBtn>
                {hasAnnotations && <span id="revision-mode-badge" className="visible" />}
              </div>
              <IconBtn onClick={toggleEditMode} active={editMode} title="Edit prose" label="Edit"><PencilIcon /></IconBtn>
              {editMode && (
                <>
                  <IconBtn onClick={handleUndo} disabled={undoStack.length === 0} title="Undo edit (⌘Z)"><UndoIcon /></IconBtn>
                  <IconBtn onClick={handleRedo} disabled={redoStack.length === 0} title="Redo edit (⇧⌘Z)"><RedoIcon /></IconBtn>
                </>
              )}
              <span aria-hidden="true" style={{ width: '1px', height: '18px', background: 'var(--border)', margin: '0 6px', alignSelf: 'center' }} />
            </>
          )}
          {toolsToggle}
          {screen === 'load' && (
            <IconBtn onClick={handleLibraryNav} title="Library" label="Library"><LibraryIcon /></IconBtn>
          )}
          <SettingsMenu />
        </div>
      </header>

      {screen === 'reader' && <div id="progress-track"><div id="progress-fill" /></div>}

      {workspaceRailOpen && (screen === 'reader' || screen === 'manuscript') && (
        <button
          type="button"
          className="workspace-rail-backdrop"
          aria-label="Close manuscript tools"
          onClick={toggleWorkspaceRail}
        />
      )}

      {shellActive ? (
        <AppShell
          variant={screen === 'manuscript' ? 'manuscript' : screen === 'load' ? 'library' : 'library'}
          libraryFilter={libraryFilter}
          onLibraryFilter={f => goLibrary(f)}
          manuscriptCount={library.length}
          favoritesCount={favCount}
          activeManuscriptId={manuscript?.id}
          workspaceManuscripts={workspaceManuscripts}
          onSwitchManuscript={handleSwitchManuscript}
          onNewManuscript={() => setScreen('load')}
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
                  onNew={() => setScreen('load')}
                  onDelete={deleteManuscript}
                  onCycleStatus={cycleStatus}
                  onToggleFavorite={toggleFavorite}
                  getReadingPosition={getReadingPosition}
                />
              </div>
            </div>
          )}
          {screen === 'load' && (
            <div id="screen-load" className="active app-shell-screen">
              <div className="screen-inner">
                <LoadScreen onLoad={handleLoad} />
              </div>
            </div>
          )}
          {screen === 'manuscript' && manuscript && (
            <ManuscriptHubScreen
              key={manuscript.id}
              workspaceRailOpen={workspaceRailOpen}
              onRead={() => { setScreen('reader'); window.scrollTo(0, 0); }}
              onExit={handleLibraryNav}
            />
          )}
        </AppShell>
      ) : null}

      {screen === 'reader' && manuscript && (
        <div className={`reader-workspace${workspaceRailOpen ? ' reader-workspace--rail-open' : ''}`}>
          <ReaderScreen onChapterLabelChange={setChapterLabel} />
          {workspaceRailOpen && (
            <ManuscriptWorkspaceRail
              context="reader"
              pane="contents"
              annotationCount={annotations.length}
              savedLabel={workspaceSavedLabel}
              onTogglePane={handleReaderRailPane}
              onLibrary={handleLibraryNav}
            />
          )}
        </div>
      )}

      <Toast message={toastState.message} visible={toastState.visible} />
    </>
  );
}
