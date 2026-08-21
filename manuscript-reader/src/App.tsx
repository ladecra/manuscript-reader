import React, { useEffect, useMemo, useState } from 'react';
import { useUIStore, readerModeOf } from './state/uiStore';
import type { ReaderMode } from './engine/reader/positionIntent';
import { useLibraryStore } from './state/libraryStore';
import { useReaderStore } from './state/readerStore';
import { useSnapshotStore } from './state/snapshotStore';
import { LandingScreen } from './screens/LandingScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { LoadModal } from './screens/LoadScreen';
import { ImportStructureScreen } from './screens/ImportStructureScreen';
import { ReaderScreen } from './screens/ReaderScreen';
import { ManuscriptHubScreen } from './screens/ManuscriptHubScreen';
import { ReaderRail } from './components/layout/ReaderRail';
import { Toast, useToast } from './components/ui/Toast';
import { SettingsMenu } from './components/ui/SettingsMenu';
import { AppShell, type LibraryNavFilter } from './components/layout/AppShell';
import { QuillIcon, MenuIcon, LibraryIcon, UndoIcon, RedoIcon, ChevronLeftIcon, AnnotateIcon, PencilIcon, FontDownIcon, PlusIcon } from './components/ui/Icons';
import { getParsedManuscript } from './engine/ingestion/parseCache';
import type { Manuscript } from './engine/types';

function IconBtn({ onClick, active, title, label, disabled, className, children }: {
  onClick?: () => void;
  active?: boolean;
  title?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button className={`btn-icon${active ? ' active' : ''}${className ? ` ${className}` : ''}`} onClick={onClick} title={title} aria-label={title} disabled={disabled}>
      {children}
      {label && <span className="btn-icon-label">{label}</span>}
    </button>
  );
}

/** The reader's display (Aa) menu — a small popover for adjusting the reading
 *  type size. The full display panel is a later slice; this is the quiet,
 *  functional minimum the mockup's "Aa" control implies. */
function ReaderDisplayMenu({ fontSize, onSmaller, onLarger }: {
  fontSize: number; onSmaller: () => void; onLarger: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reader-aa">
      <button
        className={`btn-icon reader-aa-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Display settings"
        aria-label="Display settings"
        aria-expanded={open}
      >
        Aa
      </button>
      {open && (
        <>
          <div className="reader-aa-scrim" onMouseDown={() => setOpen(false)} />
          <div className="reader-aa-menu" role="menu">
            <span className="reader-aa-label">Text size</span>
            <div className="reader-aa-row">
              <button className="reader-aa-step" onClick={onSmaller} title="Smaller" aria-label="Smaller text"><FontDownIcon size={15} /></button>
              <span className="reader-aa-val tnum">{fontSize}</span>
              <button className="reader-aa-step" onClick={onLarger} title="Larger" aria-label="Larger text"><PlusIcon size={12} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Mobile reader postures. Desktop keeps icon controls; these segments are
 *  first-class on phone (READING / MANUSCRIPT / ANNOTATIONS). Changes stays
 *  hub-intent only — not a fourth tab. */
function ReaderModeSegments({ mode, onChange }: {
  mode: ReaderMode;
  onChange: (m: ReaderMode) => void;
}) {
  const items: { id: 'reading' | 'manuscript' | 'annotations'; label: string }[] = [
    { id: 'reading', label: 'Reading' },
    { id: 'manuscript', label: 'Manuscript' },
    { id: 'annotations', label: 'Annotations' },
  ];
  return (
    <div className="reader-mode-segments" role="tablist" aria-label="Reader mode">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          className={`reader-mode-seg${mode === item.id ? ' active' : ''}`}
          aria-selected={mode === item.id}
          aria-pressed={mode === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** Desktop reader controls: Aa, notes, and manuscript-edit. Hidden notes/edit
 *  icons on mobile — the mode segments cover those postures. */
function ReaderControls({
  fontSize, onSmaller, onLarger,
  annotationsActive, hasAnnotations, onToggleNotes,
  editActive, onToggleEdit,
  undoDisabled, redoDisabled, onUndo, onRedo,
}: {
  fontSize: number; onSmaller: () => void; onLarger: () => void;
  annotationsActive: boolean; hasAnnotations: boolean; onToggleNotes: () => void;
  editActive: boolean; onToggleEdit: () => void;
  undoDisabled: boolean; redoDisabled: boolean; onUndo: () => void; onRedo: () => void;
}) {
  return (
    <>
      {editActive && (
        <>
          <IconBtn onClick={onUndo} disabled={undoDisabled} title="Undo edit (⌘Z)"><UndoIcon /></IconBtn>
          <IconBtn onClick={onRedo} disabled={redoDisabled} title="Redo edit (⇧⌘Z)"><RedoIcon /></IconBtn>
          <span className="reader-ctrl-sep" aria-hidden="true" />
        </>
      )}
      <ReaderDisplayMenu fontSize={fontSize} onSmaller={onSmaller} onLarger={onLarger} />
      <button
        className={`btn-icon reader-notes-btn${annotationsActive ? ' active' : ''}`}
        onClick={onToggleNotes}
        title="My notes"
        aria-label="My notes"
        aria-pressed={annotationsActive}
      >
        <AnnotateIcon />
        {hasAnnotations && <span className="reader-mode-dot" aria-hidden="true" />}
      </button>
      <IconBtn className="reader-edit-btn" onClick={onToggleEdit} active={editActive} title={editActive ? 'Done editing' : 'Edit the manuscript'}>
        <PencilIcon />
      </IconBtn>
    </>
  );
}

export function App() {
  const {
    screen, theme, fontSize, annSidebarOpen, editMode, changesOpen,
    setScreen, toggleNav, toggleAnnSidebar, toggleEditMode, setReaderMode, increaseFontSize, decreaseFontSize,
  } = useUIStore();
  const readerMode = readerModeOf({ editMode, annSidebarOpen, changesOpen });
  const { library, importManuscript, updateManuscript, cycleStatus, toggleFavorite, deleteManuscript, replaceMarkdown, getReadingPosition, seedDemoLibrary } = useLibraryStore();
  const { manuscript, annotations, openManuscript, closeManuscript, undoEdit, redoEdit, setEditReturnScroll, undoStack, redoStack } = useReaderStore();
  const { toastState, showToast } = useToast();

  // Undo/redo a committed prose edit: restore the snapshot markdown the store
  // returns, re-store it, and reopen (same id → history + scroll are preserved).
  const restoreEdit = React.useCallback((markdown: string | null, msg: string) => {
    if (markdown == null || !manuscript) return;
    setEditReturnScroll(window.scrollY);
    const updated = replaceMarkdown(manuscript.id, markdown);
    if (!updated) return;
    const { chapters } = getParsedManuscript(updated.metadata.combinedMarkdown!);
    openManuscript(updated, chapters);
    showToast(msg);
  }, [manuscript, replaceMarkdown, openManuscript, setEditReturnScroll, showToast]);

  const handleUndo = React.useCallback(() => restoreEdit(undoEdit(), 'Edit undone.'), [restoreEdit, undoEdit]);
  const handleRedo = React.useCallback(() => restoreEdit(redoEdit(), 'Edit redone.'), [restoreEdit, redoEdit]);

  const [chapterLabel, setChapterLabel] = React.useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryNavFilter>('all');
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  // Ingested markdown awaiting the author's import-review confirmation (title,
  // author, structure) before the manuscript is created and opened.
  const [reviewMarkdown, setReviewMarkdown] = useState<string | null>(null);
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

  const continueManuscript = useMemo(() => {
    if (library.length === 0) return null;
    return [...library].sort((a, b) => (b.metadata.lastOpened ?? 0) - (a.metadata.lastOpened ?? 0))[0] ?? null;
  }, [library]);

  function handleContinueReading() {
    if (!continueManuscript) return;
    handleReadFromLibrary(continueManuscript);
  }

  function handleSwitchManuscript(id: string) {
    const ms = library.find(m => m.id === id);
    if (!ms) return;
    if (manuscript?.id === id && screen === 'reader') return;
    handleReadFromLibrary(ms);
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
    // DEV-only redesign evaluation: `?demo` seeds sample manuscripts (never in prod).
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')) {
      seedDemoLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply persisted theme/font once on mount; later changes go through uiStore
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = screen === 'reader' ? 'reader' : 'shell';
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
      if (active?.closest?.('.chapter-block[contenteditable="true"], .chapter-block [contenteditable="true"]')) return; // native undo while typing
      e.preventDefault();
      if (isRedo) handleRedo(); else handleUndo();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, handleUndo, handleRedo]);

  // Files/paste were ingested — hand off to the import review card for one-time
  // confirmation (title, author, structure) before creating the manuscript.
  function handleLoad(combinedMarkdown: string) {
    setLoadModalOpen(false);
    setReviewMarkdown(combinedMarkdown);
  }

  // The author confirmed the review (with any title/author corrections applied) —
  // create the manuscript, capture its import baseline, and drop into the reader.
  function confirmImport(finalMarkdown: string) {
    const ms = importManuscript(finalMarkdown);
    const { chapters } = getParsedManuscript(finalMarkdown);
    openManuscript(ms, chapters);
    // Capture the import baseline (Draft 0) for this fresh manuscript. The
    // version history the revision-impact features depend on can only start if
    // it starts now.
    useSnapshotStore.getState().captureBaseline(ms);
    setReviewMarkdown(null);
    setScreen('reader');
    showToast(`Loaded ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}.`);
  }

  // Manuscript record — structure, export, and secondary share (not the daily entry).
  function handleOpenRecord(ms: Manuscript) {
    if (!ms.metadata.combinedMarkdown) {
      showToast('Files need reloading — use Load to re-import.');
      setLoadModalOpen(true);
      return;
    }
    const { chapters } = getParsedManuscript(ms.metadata.combinedMarkdown);
    openManuscript(ms, chapters);
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
    const { chapters } = getParsedManuscript(ms.metadata.combinedMarkdown);
    openManuscript(ms, chapters);
    setScreen('reader');
  }

  function handleReplaceMarkdown(id: string, markdown: string) {
    const updated = replaceMarkdown(id, markdown);
    if (!updated) return;
    const { chapters } = getParsedManuscript(markdown);
    if (manuscript?.id === id) openManuscript(updated, chapters);
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

  // A fresh import takes over the viewport for the Structure stage — the author
  // confirms/corrects the spine before the manuscript is created (pre-save).
  if (reviewMarkdown !== null) {
    return (
      <>
        <ImportStructureScreen
          markdown={reviewMarkdown}
          onConfirm={confirmImport}
          onCancel={() => { setReviewMarkdown(null); setLoadModalOpen(true); }}
        />
        <Toast message={toastState.message} visible={toastState.visible} />
      </>
    );
  }

  // The library + manuscript hub are "bare": no global topbar — the rail carries
  // the wordmark and a single quiet settings control floats top-right (v3 mockups).
  const bareTop = screen === 'library' || screen === 'manuscript';

  return (
    <>
      {!bareTop && (
      <header id="topbar">
        <div id="topbar-left">
          {screen === 'reader' ? (
            <>
              <IconBtn onClick={toggleNav} title="Chapters"><MenuIcon /></IconBtn>
              <button className="topbar-back-hub" onClick={goManuscriptPage} title="Manuscript details" aria-label="Manuscript details">
                <ChevronLeftIcon size={12} />
              </button>
              <button id="topbar-title" className="topbar-title-btn" onClick={goManuscriptPage} title="Manuscript details">{title}</button>
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
            <ReaderModeSegments mode={readerMode} onChange={setReaderMode} />
          )}
        </div>

        <div id="topbar-right">
          {screen === 'reader' ? (
            <ReaderControls
              fontSize={fontSize}
              onSmaller={decreaseFontSize}
              onLarger={increaseFontSize}
              annotationsActive={annSidebarOpen}
              hasAnnotations={hasAnnotations}
              onToggleNotes={toggleAnnSidebar}
              editActive={editMode}
              onToggleEdit={toggleEditMode}
              undoDisabled={undoStack.length === 0}
              redoDisabled={redoStack.length === 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
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
          continueTitle={continueManuscript?.metadata.title}
          onContinue={continueManuscript ? handleContinueReading : undefined}
          bareTop={bareTop}
        >
          {screen === 'library' && (
            <div id="screen-library" className="active app-shell-screen">
              <div className="screen-inner">
                <LibraryScreen
                  library={library}
                  libraryFilter={libraryFilter}
                  onLibraryFilter={f => setLibraryFilter(f)}
                  onOpenRecord={handleOpenRecord}
                  onRead={handleReadFromLibrary}
                  onNew={() => setLoadModalOpen(true)}
                  onDelete={deleteManuscript}
                  onUpdateManuscript={updateManuscript}
                  onReplaceMarkdown={handleReplaceMarkdown}
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
