import { ReactNode, useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';

/** Bottom sheet used by the nutrition flows: one title, one task, a close. */
export function Sheet({ visible, onClose, eyebrow, title, children }: {
  visible: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  const C = useColors();
  const insets = useSafeAreaInsets();
  // Android draws edge to edge, so the window no longer shrinks for the
  // keyboard: lift the sheet by the keyboard's height or it covers the fields.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', event => setKeyboardHeight(event.endCoordinates.height));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', paddingBottom: keyboardHeight }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Cerrar" accessibilityRole="button" />
          <View style={{ backgroundColor: C.bg, borderTopWidth: 1, borderColor: C.border, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
              <View style={{ flex: 1 }}>
                {eyebrow && <Label>{eyebrow}</Label>}
                <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 20, color: C.textPrimary, marginTop: eyebrow ? 2 : 0 }}>{title}</Text>
              </View>
              <PressableScale
                onPress={onClose}
                accessibilityLabel="Cerrar"
                style={{ width: 44, height: 44, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 14, color: C.textPrimary }}>✕</Text>
              </PressableScale>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, gap: 12 }}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Primary / secondary full-width action used inside sheets. */
export function SheetButton({ label, onPress, primary, disabled, accent, hint }: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  accent?: string;
  hint?: string;
}) {
  const C = useColors();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={primary ? 'success' : 'light'}
      accessibilityHint={hint}
      containerStyle={{ flex: 1 }}
      style={{
        minHeight: 46, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10,
        backgroundColor: primary && accent ? accent : 'transparent',
        borderWidth: primary && accent ? 0 : 1,
        borderColor: primary ? C.textSecondary : C.border,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: primary && accent ? C.onAccent : primary ? C.textPrimary : C.textSecondary, textAlign: 'center' }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Row of selectable chips (meal, unit, portion). */
export function ChipRow<K extends string>({ options, value, onChange, accent, label }: {
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (key: K) => void;
  accent: string;
  label?: string;
}) {
  const C = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(option => {
        const selected = option.key === value;
        return (
          <PressableScale
            key={option.key}
            onPress={() => onChange(option.key)}
            selected={selected}
            accessibilityRole="radio"
            style={{
              minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1,
              borderColor: selected ? accent : C.border,
              backgroundColor: selected ? `${accent}1A` : 'transparent',
            }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, color: selected ? C.textPrimary : C.textSecondary }}>{option.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
