import { create } from 'zustand';
import { loadTheme, saveTheme, loadFontSize, saveFontSize } from '../engine/storage';
import type { HubPane } from '../components/layout/ManuscriptWorkspaceRail';

export type Screen = 'landing' | 'library' | 'load' | 'manuscript' | 'reader';

interface UIStore {
  screen: Screen;
  theme: 'light' | 'dark';
  fontSize: number;

  // Panel state (reader)
  navOpen: boolean;
  annSidebarOpen: boolean;
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
  toggleAnnSidebar: () => void;

  toggleEditMode: () => void;
  enterEditMode: () => void;
  exitEditMode: () => void;

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
  editMode: false,
  workspaceRailOpen: false,
  hubPane: 'contents',
  pendingChapterIndex: null,
  pendingReaderIntent: null,

  setScreen(s) {
    set({
      screen: s,
      navOpen: false,
      annSidebarOpen: false,
      editMode: false,
      workspaceRailOpen: s === 'manuscript' ? true : s === 'reader' ? false : get().workspaceRailOpen,
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

  openAnnSidebar()   { set({ annSidebarOpen: true }); },
  closeAnnSidebar()  { set({ annSidebarOpen: false }); },
  toggleAnnSidebar() {
    if (get().annSidebarOpen) get().closeAnnSidebar();
    else get().openAnnSidebar();
  },

  // Edit mode is exclusive with the side panels — editing is its own posture.
  toggleEditMode() { set(s => ({ editMode: !s.editMode, navOpen: false, annSidebarOpen: false })); },
  enterEditMode()  { set({ editMode: true, navOpen: false, annSidebarOpen: false }); },
  exitEditMode()   { set({ editMode: false }); },

  toggleWorkspaceRail() { set(s => ({ workspaceRailOpen: !s.workspaceRailOpen })); },
  openWorkspaceRail()   { set({ workspaceRailOpen: true }); },
  closeWorkspaceRail()  { set({ workspaceRailOpen: false }); },
  setHubPane(p) { set({ hubPane: p }); },

  closeAllPanels() { set({ navOpen: false, annSidebarOpen: false }); },

  setPendingChapterIndex(n) { set({ pendingChapterIndex: n }); },
  setPendingReaderIntent(i) { set({ pendingReaderIntent: i }); },
}));
