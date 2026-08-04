import { useColorScheme } from 'react-native';

// Brand accents stay identical across themes (identity/glow colors, per design
// direction) — only surface/text tokens flip between light and dark. Note:
// `yellow` as a *text* color on light-mode white cards has weak contrast at
// small sizes (it's designed for dark backgrounds); this is a known follow-up
// for the light-mode visual pass, not fixed here.
// Exported for the rare case a module-scope (non-component) function needs a
// brand color without pulling in the theme-reactive hook — e.g. lightning-bg's
// `boltsFor`. Prefer `useColors()` for anything that also uses surface/text tokens.
export const BRAND = {
  yellow: '#E8FF59',
  cyan: '#3DDCFF',
  red: '#FF3D5A',
  orange: '#FFA62B',
};

export interface ColorTokens {
  bg: string;
  card: string;
  border: string;
  borderLight: string;
  bgEl: string;

  yellow: string;
  cyan: string;
  red: string;
  orange: string;

  textPrimary: string;
  textMid: string;
  textSecondary: string;
  textTertiary: string;
}

export const DARK: ColorTokens = {
  bg: '#0A0A0B',
  card: '#141416',
  border: '#26262A',
  borderLight: '#1B1B1E',
  bgEl: '#0E0E10',

  ...BRAND,

  textPrimary: '#FAFAFA',
  textMid: '#C7C7CE',
  textSecondary: '#8A8A93',
  textTertiary: '#5A5A62',
};

export const LIGHT: ColorTokens = {
  bg: '#F5F5F6',
  card: '#FFFFFF',
  border: '#E3E3E7',
  borderLight: '#ECECEF',
  bgEl: '#ECECEE',

  ...BRAND,

  textPrimary: '#0A0A0B',
  textMid: '#3A3A3F',
  textSecondary: '#6B6B72',
  textTertiary: '#9A9AA1',
};

/** Reactive surface/text tokens for the current color scheme. Re-renders
 *  automatically on system-theme change or on `Appearance.setColorScheme()`
 *  (used by the in-app Sistema/Claro/Oscuro preference) — no restart needed. */
export function useColors(): ColorTokens {
  const scheme = useColorScheme();
  return scheme === 'light' ? LIGHT : DARK;
}

/** Blends a `#rrggbb` hex color with the given alpha (0..1) into an `rgba(...)` string. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const F = {
  grotesk: 'SpaceGrotesk_700Bold',
  groteskMed: 'SpaceGrotesk_500Medium',
  mono: 'JetBrainsMono_400Regular',
  monoBold: 'JetBrainsMono_700Bold',
  monoXBold: 'JetBrainsMono_800ExtraBold',
  monoMed: 'JetBrainsMono_500Medium',
  inter: 'Inter_400Regular',
  interMed: 'Inter_500Medium',
  interSemi: 'Inter_600SemiBold',
} as const;
