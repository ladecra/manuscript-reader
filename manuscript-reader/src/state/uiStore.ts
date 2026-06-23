import { create } from 'zustand';
import { loadTheme, saveTheme, loadFontSize, saveFontSize } from '../engine/storage';
import type { HubPane } from '../components/layout/ManuscriptWorkspaceRail';
import { workspaceRailOpenByDefault, WORKSPACE_RAIL_MOBILE_MAX_PX } from '../engine/ui/workspaceRail';

export type Screen = 'landing' | 'library' | 'load' | 'manuscript' | 'reader';

/** The reader's three postures (Vellibris model). Derived from the existing
 *  editMode / annSidebarOpen booleans so all legacy effects keep working:
 *    reading      → clean immersive prose (annotation column faded out)
 *    manuscript   → the editing surface (was: editMode)
 *    annotations  → annotation column active (was: annSidebarOpen) */
export type ReaderMode = 'reading' | 'manuscript' | 'annotations';

export function readerModeOf(s: { editMode: boolean; annSidebarOpen: boolean }): ReaderMode {
  if (s.editMode) return 'manuscript';
  if (s.annSidebarOpen) return 'annotations';
  return 'reading';
}

interface UIStore {
  screen: Screen;
  theme: 'light' | 'dark';
  fontSize: number;

  // Panel state (reader)
  navOpen: boolean;
  annSidebarOpen: boolean;
  annSidebarCollapsed: boolean;
  editMode: boolean;
  workspaceRailOpen: boolean;
  hubPane: HubPane;

  // A chapter index the reader should scroll to on its next mount, set when the
  // hub (e.g. a Report chip) sends the author into the prose at a specific spot.
  // The reader consumes and clears it, so it fires exactly once.
  pendingChapterIndex: number | null;

  // A posture the reader should adopt on its next mount, set when the hub's
  // chapter-list hover actions send the author in to *annotate* or *edit* a
  // chapter rather than just read it. Consumed once, alongside pendingChapterIndex.
  pendingReaderIntent: 'annotate' | 'edit' | null;

  // Actions
  setScreen: (s: Screen) => void;
  toggleTheme: () => void;
  setFontSize: (n: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;

  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;

  openAnnSidebar: () => void;
  closeAnnSidebar: () => void;
  collapseAnnSidebar: () => void;
  toggleAnnSidebar: () => void;

  toggleEditMode: () => void;
  enterEditMode: () => void;
  exitEditMode: () => void;
  setReaderMode: (m: ReaderMode) => void;

  toggleWorkspaceRail: () => void;
  openWorkspaceRail: () => void;
  closeWorkspaceRail: () => void;
  setHubPane: (p: HubPane) => void;

  closeAllPanels: () => void;

  setPendingChapterIndex: (n: number | null) => void;
  setPendingReaderIntent: (i: 'annotate' | 'edit' | null) => void;
}

const FONT_MIN = 15;
const FONT_MAX = 26;

export const useUIStore = create<UIStore>((set, get) => ({
  screen: 'library',
  theme: loadTheme(),
  fontSize: loadFontSize(),
  navOpen: false,
  annSidebarOpen: false,
  annSidebarCollapsed: false,
  editMode: false,
  workspaceRailOpen: false,
  hubPane: 'contents',
  pendingChapterIndex: null,
  pendingReaderIntent: null,

  setScreen(s) {
    let workspaceRailOpen = get().workspaceRailOpen;
    if (s === 'manuscript') workspaceRailOpen = workspaceRailOpenByDefault('manuscript', window.innerWidth <= WORKSPACE_RAIL_MOBILE_MAX_PX);
    else if (s === 'reader') workspaceRailOpen = workspaceRailOpenByDefault('reader', false);

    set({
      screen: s,
      navOpen: false,
      annSidebarOpen: false,
      editMode: false,
      workspaceRailOpen,
    });
    // Apply theme class whenever screen changes (safe to re-apply)
    document.documentElement.classList.toggle('light', get().theme === 'light');
  },

  toggleTheme() {
    const next = get().theme === 'light' ? 'dark' : 'light';
    saveTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    set({ theme: next });
  },

  setFontSize(n) {
    const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, n));
    saveFontSize(clamped);
    document.documentElement.style.setProperty('--body-size', `${clamped}px`);
    set({ fontSize: clamped });
  },

  increaseFontSize() { get().setFontSize(get().fontSize + 1); },
  decreaseFontSize() { get().setFontSize(get().fontSize - 1); },

  openNav:   () => set({ navOpen: true }),
  closeNav:  () => set({ navOpen: false }),
  toggleNav: () => set(s => ({ navOpen: !s.navOpen })),

  openAnnSidebar()     { set({ annSidebarOpen: true, annSidebarCollapsed: false }); },
  closeAnnSidebar()    { set({ annSidebarOpen: false, annSidebarCollapsed: false }); },
  collapseAnnSidebar() { set({ annSidebarCollapsed: true }); },
  toggleAnnSidebar() {
    if (get().annSidebarOpen) get().closeAnnSidebar();
    else get().openAnnSidebar();
  },

  // Edit mode is exclusive with the side panels — editing is its own posture.
  toggleEditMode() { set(s => ({ editMode: !s.editMode, navOpen: false, annSidebarOpen: false })); },
  enterEditMode()  { set({ editMode: true, navOpen: false, annSidebarOpen: false }); },
  exitEditMode()   { set({ editMode: false }); },

  // The single entry point for the 3-mode switch. Maps each posture onto the
  // existing booleans so legacy reader effects (DOM edit-mode class, mark
  // stripping, sidebar) continue to drive off the same state.
  setReaderMode(m) {
    if (m === 'manuscript')       set({ editMode: true,  annSidebarOpen: false, annSidebarCollapsed: false, navOpen: false });
    else if (m === 'annotations') set({ editMode: false, annSidebarOpen: true,  annSidebarCollapsed: false, navOpen: false });
    else                          set({ editMode: false, annSidebarOpen: false, annSidebarCollapsed: false });
  },

  toggleWorkspaceRail() { set(s => ({ workspaceRailOpen: !s.workspaceRailOpen })); },
  openWorkspaceRail()   { set({ workspaceRailOpen: true }); },
  closeWorkspaceRail()  { set({ workspaceRailOpen: false }); },
  setHubPane(p) { set({ hubPane: p }); },

  closeAllPanels() { set({ navOpen: false, annSidebarOpen: false }); },

  setPendingChapterIndex(n) { set({ pendingChapterIndex: n }); },
  setPendingReaderIntent(i) { set({ pendingReaderIntent: i }); },
}));
