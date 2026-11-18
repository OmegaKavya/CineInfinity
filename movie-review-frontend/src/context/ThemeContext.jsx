import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Dark mode.
 *
 * Two improvements over the previous inline state. The choice now persists,
 * so it survives a reload instead of resetting to light every visit. And a
 * first-time visitor gets whatever their operating system already asks for,
 * rather than always being shown light.
 *
 * The class still goes on <body>, which is what App.css expects.
 */
const ThemeContext = createContext(null);
const STORAGE_KEY = 'cineinfinity:theme';

function preferredTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Private browsing can throw on access; fall through to the OS setting.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(preferredTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the preference is not worth breaking over.
    }
  }, [theme, isDark]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, isDark, toggle }), [theme, isDark, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a <ThemeProvider>.');
  return context;
}
