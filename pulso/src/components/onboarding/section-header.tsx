import type { ReactNode } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';
import { Text, View } from 'react-native';

import { F, type ColorTokens, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';

interface SectionHeaderProps {
  label: string;
  accent?: string;
  style?: ViewStyle;
}

export function SectionHeader({ label, accent: accentOverride, style }: SectionHeaderProps) {
  const C = useColors();
  const { accent } = usePreferences();

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: F.mono,
          fontSize: 9,
          letterSpacing: 2,
          color: accentOverride ?? accent,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
    </View>
  );
}

export function FieldLabel({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const C = useColors();

  return (
    <Text
      style={[
        {
          fontFamily: F.mono,
          fontSize: 9,
          letterSpacing: 1.4,
          color: C.textTertiary,
          textTransform: 'uppercase',
          marginBottom: 7,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Theme-aware version of the text-input style used by the signup form. */
export function inputStyle(colors: ColorTokens): TextStyle {
  return {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    color: colors.textPrimary,
    fontFamily: F.inter,
    fontSize: 15,
  };
}

/** Convenience hook for screens that do not otherwise need the color tokens. */
export function useInputStyle(): TextStyle {
  return inputStyle(useColors());
}
