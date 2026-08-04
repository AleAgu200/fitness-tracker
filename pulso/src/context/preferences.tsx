import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';

import {
  DEFAULT_ACCENT,
  DEFAULT_THEME_MODE,
  DEFAULT_WEIGHT_UNIT,
  loadAccentColor,
  loadThemeMode,
  loadWeightUnit,
  setAccentColor as persistAccentColor,
  setThemeMode as persistThemeMode,
  setWeightUnit as persistWeightUnit,
  ThemeMode,
  WeightUnit,
} from '@/lib/settings';

interface PreferencesValue {
  accent: string;
  weightUnit: WeightUnit;
  themeMode: ThemeMode;
  setAccent: (hex: string) => void;
  setWeightUnit: (unit: WeightUnit) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Applies the mode app-wide via RN's Appearance override — `useColorScheme()`
 *  everywhere (including `useColors()`) reacts immediately, no restart needed.
 *  This RN version's `setColorScheme` resets to the OS scheme via 'unspecified',
 *  not `null` (unlike some other versions/docs). */
function applyThemeMode(mode: ThemeMode) {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);
  const [weightUnit, setWeightUnitState] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);

  useEffect(() => {
    Promise.all([loadAccentColor(), loadWeightUnit(), loadThemeMode()])
      .then(([savedAccent, savedUnit, savedThemeMode]) => {
        setAccentState(savedAccent);
        setWeightUnitState(savedUnit);
        setThemeModeState(savedThemeMode);
        applyThemeMode(savedThemeMode);
      })
      .catch(e => console.error('[preferences]', e));
  }, []);

  const setAccent = useCallback((hex: string) => {
    setAccentState(hex);
    persistAccentColor(hex).catch(e => console.error('[preferences]', e));
  }, []);

  const setWeightUnit = useCallback((unit: WeightUnit) => {
    setWeightUnitState(unit);
    persistWeightUnit(unit).catch(e => console.error('[preferences]', e));
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    applyThemeMode(mode);
    persistThemeMode(mode).catch(e => console.error('[preferences]', e));
  }, []);

  const value = useMemo(
    () => ({ accent, weightUnit, themeMode, setAccent, setWeightUnit, setThemeMode }),
    [accent, weightUnit, themeMode, setAccent, setWeightUnit, setThemeMode],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
