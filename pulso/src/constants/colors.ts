export const C = {
  bg: '#0A0A0B',
  card: '#141416',
  border: '#26262A',
  borderLight: '#1B1B1E',
  bgEl: '#0E0E10',

  yellow: '#E8FF59',
  cyan: '#3DDCFF',
  red: '#FF3D5A',
  orange: '#FFA62B',

  textPrimary: '#FAFAFA',
  textMid: '#C7C7CE',
  textSecondary: '#8A8A93',
  textTertiary: '#5A5A62',
} as const;

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
