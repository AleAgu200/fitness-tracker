import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ReduceMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { catalogMediaUrl } from '@/lib/exercise-catalog';
import { workoutXGifSource, workoutXGifUrlFromId } from '@/lib/workoutx';

function instructionSteps(value?: string | null): string[] {
  if (!value?.trim()) return [];
  return (value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [value])
    .map(step => step.trim())
    .filter(Boolean);
}

/** Reusable exercise-learning flow. It is opened both from catalog search and
 * from a saved workout, so the GIF and its technique guide never drift apart. */
export function ExerciseAnimationModal({
  nombre,
  wxId,
  gifPath,
  instructions,
  muscleGroup,
  equipment,
  onSelect,
  onClose,
}: {
  nombre: string;
  wxId?: string | null;
  gifPath?: string | null;
  instructions?: string | null;
  muscleGroup?: string | null;
  equipment?: string | null;
  onSelect?: () => void;
  onClose: () => void;
}) {
  const C = useColors();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [imageFailed, setImageFailed] = useState(false);
  const [view, setView] = useState<'demo' | 'instructions'>('demo');
  const steps = useMemo(() => instructionSteps(instructions), [instructions]);
  const modalHeight = Math.min(720, Math.max(0, windowHeight - insets.top - insets.bottom - 24));
  const modalWidth = Math.min(390, Math.max(0, windowWidth - insets.left - insets.right - 24));
  const compact = modalHeight < 560;
  // expo-image can keep its intrinsic GIF height when a percentage-sized parent
  // is animated on native/web. Reserve the modal chrome explicitly so the media
  // and instruction panes receive a numeric, non-overflowing height.
  const chromeHeight = compact
    ? (onSelect ? 227 : 175)
    : (onSelect ? 247 : 195);
  const bodyHeight = Math.max(0, modalHeight - chromeHeight);
  const source = gifPath
    ? { uri: catalogMediaUrl(gifPath) }
    : wxId
      ? workoutXGifSource(workoutXGifUrlFromId(wxId))
      : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar guía del ejercicio"
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.84)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: insets.top + 12,
          paddingRight: insets.right + 12,
          paddingBottom: insets.bottom + 12,
          paddingLeft: insets.left + 12,
        }}
      >
        <Pressable onPress={() => {}} style={{ width: modalWidth, height: modalHeight }}>
          <Animated.View
            entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System)}
            style={{ flex: 1, minHeight: 0, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}
          >
            <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: compact ? 10 : 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ flex: 1, paddingRight: 12, gap: 5 }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 8, letterSpacing: 1.2, color: C.cyan }}>
                  GUÍA DE MOVIMIENTO
                </Text>
                <Text style={{ fontFamily: F.interSemi, fontSize: compact ? 15 : 16, lineHeight: compact ? 19 : 21, color: C.textPrimary }} numberOfLines={2}>
                  {nombre}
                </Text>
                {(muscleGroup || equipment) && (
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textTransform: 'uppercase' }} numberOfLines={1}>
                    {[muscleGroup, equipment].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <PressableScale
                haptic="light"
                onPress={onClose}
                accessibilityLabel="Cerrar guía"
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.textSecondary }}>×</Text>
              </PressableScale>
            </View>

            <View style={{ flexShrink: 0, flexDirection: 'row', padding: compact ? 6 : 8, gap: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
              {([
                ['demo', '▶  DEMOSTRACIÓN'],
                ['instructions', `≡  INSTRUCCIONES${steps.length ? ` · ${steps.length}` : ''}`],
              ] as const).map(([key, label]) => {
                const active = view === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setView(key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={key === 'demo' ? 'Ver demostración animada' : 'Ver instrucciones paso a paso'}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: active ? C.cyan : C.border,
                      backgroundColor: active ? withAlpha(C.cyan, 0.09) : C.bgEl,
                      paddingHorizontal: 6,
                      opacity: pressed ? 0.72 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: F.monoBold, fontSize: 8, letterSpacing: 0.5, color: active ? C.cyan : C.textTertiary, textAlign: 'center' }}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {view === 'demo' ? (
              <Animated.View
                key="demo"
                entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
                exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}
                style={{ width: '100%', height: bodyHeight, flexShrink: 0, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {source && !imageFailed ? (
                  <Image
                    source={source}
                    style={{ width: modalWidth - 2, height: bodyHeight }}
                    contentFit="contain"
                    autoplay
                    cachePolicy="memory-disk"
                    transition={150}
                    accessibilityLabel={`Demostración de ${nombre}`}
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <View style={{ alignItems: 'center', gap: 7, padding: 24 }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textTertiary }}>ANIMACIÓN NO DISPONIBLE</Text>
                    {steps.length > 0 && (
                      <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, textAlign: 'center', color: C.textSecondary }}>
                        Todavía podés consultar la ejecución paso a paso.
                      </Text>
                    )}
                  </View>
                )}
                <View pointerEvents="none" style={{ position: 'absolute', left: 10, right: 10, bottom: 10, backgroundColor: 'rgba(10,10,11,0.82)', paddingHorizontal: 10, paddingVertical: 7 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.5, color: C.textSecondary, textAlign: 'center' }}>
                    OBSERVÁ EL RECORRIDO COMPLETO · EL GIF SE REPITE
                  </Text>
                </View>
              </Animated.View>
            ) : (
              <Animated.View
                key="instructions"
                entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
                exiting={FadeOut.duration(100).reduceMotion(ReduceMotion.System)}
                style={{ width: '100%', height: bodyHeight, flexShrink: 0, backgroundColor: C.bgEl, overflow: 'hidden' }}
              >
                <ScrollView
                  style={{ width: '100%', height: bodyHeight }}
                  contentContainerStyle={{ padding: compact ? 12 : 16, gap: compact ? 11 : 14 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1, color: C.cyan }}>CÓMO SE HACE</Text>
                    <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                      Seguí el orden y compará cada paso con la animación.
                    </Text>
                  </View>
                  {steps.length ? steps.map((step, index) => (
                    <Animated.View
                      key={`${index}-${step.slice(0, 12)}`}
                      entering={FadeInDown.duration(180).delay(index * 35).reduceMotion(ReduceMotion.System)}
                      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}
                    >
                      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.cyan, backgroundColor: withAlpha(C.cyan, 0.08) }}>
                        <Text style={{ fontFamily: F.monoBold, fontSize: 9, color: C.cyan }}>{String(index + 1).padStart(2, '0')}</Text>
                      </View>
                      <Text selectable style={{ flex: 1, fontFamily: F.inter, fontSize: 13, lineHeight: 20, color: C.textPrimary }}>
                        {step}
                      </Text>
                    </Animated.View>
                  )) : (
                    <View style={{ borderWidth: 1, borderColor: C.border, padding: 14 }}>
                      <Text style={{ fontFamily: F.inter, fontSize: 12, lineHeight: 18, color: C.textSecondary }}>
                        Este ejercicio todavía no tiene instrucciones técnicas. Usá la demostración visual y consultá a tu profesional si necesitás adaptar la ejecución.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </Animated.View>
            )}

            <View style={{ flexShrink: 0, padding: compact ? 8 : 10, gap: 8, borderTopWidth: 1, borderTopColor: C.border }}>
              {onSelect && (
                <Pressable
                  onPress={onSelect}
                  accessibilityRole="button"
                  accessibilityLabel={`Usar ${nombre} en el plan`}
                  style={({ pressed }) => ({ minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cyan, paddingHorizontal: 14, opacity: pressed ? 0.78 : 1 })}
                >
                  <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.8, color: C.bg }}>USAR ESTE EJERCICIO →</Text>
                </Pressable>
              )}
              <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.5, color: C.textTertiary, textAlign: 'center' }}>
                TOCÁ FUERA PARA CERRAR
              </Text>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
