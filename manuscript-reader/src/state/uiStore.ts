import { create } from 'zustand';
import { loadTheme, saveTheme, loadFontSize, saveFontSize } from '../engine/storage';

export type Screen = 'landing' | 'library' | 'load' | 'manuscript' | 'reader';

interface UIStore {
  screen: Screen;
  theme: 'light' | 'dark';
  fontSize: number;

  // Panel state (reader)
  navOpen: boolean;
  annSidebarOpen: boolean;
  editMode: boolean;

  // A chapter index the reader should scroll to on its next mount, set when the
  // hub (e.g. a Report chip) sends the author into the prose at a specific spot.
  // The reader consumes and clears it, so it fires exactly once.
  pendingChapterIndex: number | null;

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
  exitEditMode: () => void;

  closeAllPanels: () => void;

  setPendingChapterIndex: (n: number | null) => void;
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
  pendingChapterIndex: null,

  setScreen(s) {
    set({ screen: s, navOpen: false, annSidebarOpen: false, editMode: false });
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
  exitEditMode()   { set({ editMode: false }); },

  closeAllPanels() { set({ navOpen: false, annSidebarOpen: false }); },

  setPendingChapterIndex(n) { set({ pendingChapterIndex: n }); },
}));
