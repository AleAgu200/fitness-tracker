import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';

import { AnimatedBar, PressableScale } from '../ui/kit';

const TOTAL_STEPS = 9;

export interface WizardShellProps {
  stepIndex: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onNext?: () => void | Promise<void>;
  onBack?: () => void | Promise<void>;
  canProceed?: boolean;
  nextLabel?: string;
  backLabel?: string;
  busy?: boolean;
}

export function WizardShell({
  stepIndex,
  title,
  subtitle,
  children,
  onNext,
  onBack,
  canProceed = true,
  nextLabel = 'CONTINUAR',
  backLabel = 'ATRÁS',
  busy = false,
}: WizardShellProps) {
  const C = useColors();
  const { accent } = usePreferences();
  const insets = useSafeAreaInsets();
  const disabled = !canProceed || busy;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 22,
          paddingBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: C.borderLight,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{
              color: accent,
              fontFamily: F.monoBold,
              fontSize: 9,
              letterSpacing: 1.2,
            }}
          >
            CONFIGURACIÓN INICIAL
          </Text>
          <Text
            style={{
              color: C.textTertiary,
              fontFamily: F.mono,
              fontSize: 9,
              letterSpacing: 0.7,
            }}
          >
            {Math.max(1, Math.min(TOTAL_STEPS, stepIndex))}/{TOTAL_STEPS}
          </Text>
        </View>
        <AnimatedBar fill={stepIndex / TOTAL_STEPS} color={accent} height={5} duration={320} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 22,
          paddingTop: 28,
          paddingBottom: 34,
        }}
      >
        <View style={{ marginBottom: 28 }}>
          <Text
            style={{
              color: C.textPrimary,
              fontFamily: F.grotesk,
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -0.7,
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                color: C.textSecondary,
                fontFamily: F.inter,
                fontSize: 13,
                lineHeight: 20,
                marginTop: 9,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View style={{ flexGrow: 1 }}>{children}</View>
      </ScrollView>

      {onBack || onNext ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            paddingTop: 14,
            paddingHorizontal: 22,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: C.borderLight,
            backgroundColor: C.bg,
          }}
        >
          {onBack ? (
            <View style={{ flex: 0.42 }}>
              <PressableScale
                onPress={() => { void onBack(); }}
                disabled={busy}
                style={{
                  minHeight: 50,
                  width: '100%',
                  borderWidth: 1,
                  borderColor: C.border,
                  backgroundColor: C.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: C.textSecondary,
                    fontFamily: F.monoBold,
                    fontSize: 10,
                    letterSpacing: 0.8,
                  }}
                >
                  {backLabel}
                </Text>
              </PressableScale>
            </View>
          ) : null}

          {onNext ? (
            <View style={{ flex: 1 }}>
              <PressableScale
                onPress={() => { void onNext(); }}
                disabled={disabled}
                haptic="medium"
                style={{
                  minHeight: 50,
                  width: '100%',
                  backgroundColor: disabled ? C.bgEl : accent,
                  borderWidth: 1,
                  borderColor: disabled ? C.border : accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                }}
              >
                {busy ? (
                  <ActivityIndicator color={C.textPrimary} size="small" />
                ) : (
                  <Text
                    style={{
                      color: disabled ? C.textTertiary : '#0A0A0B',
                      fontFamily: F.monoXBold,
                      fontSize: 10,
                      letterSpacing: 0.9,
                    }}
                  >
                    {nextLabel}
                  </Text>
                )}
              </PressableScale>
            </View>
          ) : null}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
