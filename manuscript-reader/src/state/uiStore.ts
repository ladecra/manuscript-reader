import { create } from 'zustand';
import { loadTheme, saveTheme, loadFontSize, saveFontSize } from '../engine/storage';

export type Screen = 'landing' | 'library' | 'load' | 'reader';

interface UIStore {
  screen: Screen;
  theme: 'light' | 'dark';
  fontSize: number;

  // Panel state (reader)
  navOpen: boolean;
  annSidebarOpen: boolean;
  reportPanelOpen: boolean;

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

  openReportPanel: () => void;
  closeReportPanel: () => void;
  toggleReportPanel: () => void;

  closeAllPanels: () => void;
}

const FONT_MIN = 15;
const FONT_MAX = 26;

export const useUIStore = create<UIStore>((set, get) => ({
  screen: 'library',
  theme: loadTheme(),
  fontSize: loadFontSize(),
  navOpen: false,
  annSidebarOpen: false,
  reportPanelOpen: false,

  setScreen(s) {
    set({ screen: s, navOpen: false, annSidebarOpen: false, reportPanelOpen: false });
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

  openAnnSidebar()   { set({ annSidebarOpen: true, reportPanelOpen: false }); },
  closeAnnSidebar()  { set({ annSidebarOpen: false }); },
  toggleAnnSidebar() {
    if (get().annSidebarOpen) get().closeAnnSidebar();
    else get().openAnnSidebar();
  },

  openReportPanel()   { set({ reportPanelOpen: true, annSidebarOpen: false }); },
  closeReportPanel()  { set({ reportPanelOpen: false }); },
  toggleReportPanel() {
    if (get().reportPanelOpen) get().closeReportPanel();
    else get().openReportPanel();
  },

  closeAllPanels() { set({ navOpen: false, annSidebarOpen: false, reportPanelOpen: false }); },
}));
