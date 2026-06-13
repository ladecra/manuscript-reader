import { useState, useEffect, useCallback } from 'react';
import { loadTheme, saveTheme, loadFontSize, saveFontSize } from '../engine/storage';

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => loadTheme());

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const setTheme = useCallback((t: 'light' | 'dark') => {
    saveTheme(t);
    setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}

const FONT_MIN = 15;
const FONT_MAX = 26;

export function useFontSize() {
  const [fontSize, setFontSizeState] = useState(() => loadFontSize());

  useEffect(() => {
    document.documentElement.style.setProperty('--body-size', `${fontSize}px`);
  }, [fontSize]);

  const setFontSize = useCallback((size: number) => {
    const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, size));
    saveFontSize(clamped);
    setFontSizeState(clamped);
  }, []);

  const increase = useCallback(() => setFontSize(fontSize + 1), [fontSize, setFontSize]);
  const decrease = useCallback(() => setFontSize(fontSize - 1), [fontSize, setFontSize]);

  return { fontSize, increase, decrease };
}
