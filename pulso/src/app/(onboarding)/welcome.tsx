import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';

interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  points: { label: string; detail: string }[];
}

// What PULSO does, before asking anything. Each page answers one question an
// athlete has on first launch, so the wizard that follows makes sense.
const SLIDES: Slide[] = [
  {
    eyebrow: 'TU PLAN',
    title: 'Entrenamiento y comidas que encajan con tu vida',
    body: 'En unos minutos armamos un plan a partir de tu cuerpo, tu objetivo, el tiempo que tenés y lo que comés.',
    points: [
      { label: 'Sesiones', detail: 'Ejercicios con animación y técnica, series y descansos.' },
      { label: 'Comidas', detail: 'Calorías y macros calculados para vos, con alimentos de la región.' },
      { label: 'Ajustes', detail: 'Lo revisás antes de aplicarlo y lo editás cuando quieras.' },
    ],
  },
  {
    eyebrow: 'TU REGISTRO',
    title: 'Cada serie y cada comida cuentan',
    body: 'Registrás en segundos, incluso sin conexión. PULSO convierte lo que hacés en progreso visible.',
    points: [
      { label: 'Hoy', detail: 'Lo que toca entrenar y comer, en una sola pantalla.' },
      { label: 'Progreso', detail: 'Récords, volumen semanal, peso y medidas.' },
      { label: 'Escáner', detail: 'Leé el código o la etiqueta de un alimento para sumarlo.' },
    ],
  },
  {
    eyebrow: 'TU EQUIPO',
    title: 'Sumá a tu entrenador o nutricionista',
    body: 'Si trabajás con un profesional, se conecta con un código y ve solo lo que vos decidas compartir.',
    points: [
      { label: 'Permisos', detail: 'Entrenamiento, nutrición o medidas: elegís por separado.' },
      { label: 'Mensajes', detail: 'Consultas y ajustes del plan sin salir de la app.' },
      { label: 'Control', detail: 'Retirás el acceso cuando quieras, en un toque.' },
    ],
  },
  {
    eyebrow: 'TU SALUD',
    title: 'Seguridad antes que velocidad',
    body: 'Lesiones, condiciones de salud y alergias se tienen en cuenta antes de recomendar cualquier cosa.',
    points: [
      { label: 'Límites', detail: 'Nunca bajamos de mínimos de energía seguros.' },
      { label: 'Señales', detail: 'Si algo requiere un profesional de salud, te lo decimos.' },
      { label: 'Privacidad', detail: 'Tus datos de salud no se venden ni se usan para publicidad.' },
    ],
  },
];

export default function OnboardingWelcomeScreen() {
  const C = useColors();
  const { accent } = usePreferences();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page && next >= 0 && next < SLIDES.length) {
      setPage(next);
      Haptics.selectionAsync();
    }
  }

  function goTo(index: number) {
    scrollRef.current?.scrollTo({ x: index * width, animated: !reduceMotion });
    setPage(index);
  }

  function start() {
    router.replace('/(onboarding)/account' as never);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, minHeight: 44 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 1.2, color: accent }}>
          BIENVENIDO A PULSO
        </Text>
        {!last && (
          <PressableScale onPress={start} accessibilityRole="button" accessibilityLabel="Saltar la introducción" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>SALTAR</Text>
          </PressableScale>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, index) => (
          <View key={slide.eyebrow} style={{ width, paddingHorizontal: 22, paddingTop: 28 }} accessibilityElementsHidden={index !== page} importantForAccessibility={index === page ? 'auto' : 'no-hide-descendants'}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2, color: C.cyan, marginBottom: 12 }}>
              {String(index + 1).padStart(2, '0')} · {slide.eyebrow}
            </Text>
            <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 30, lineHeight: 35, color: C.textPrimary, letterSpacing: -0.5 }}>
              {slide.title}
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 15, lineHeight: 22, color: C.textSecondary, marginTop: 12 }}>
              {slide.body}
            </Text>
            <View style={{ marginTop: 26, gap: 10 }}>
              {slide.points.map((point, pointIndex) => (
                <Animated.View
                  key={point.label}
                  entering={reduceMotion || index !== page ? undefined : FadeIn.duration(260).delay(80 + pointIndex * 70)}
                  style={{ flexDirection: 'row', gap: 14, padding: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card }}
                >
                  <View style={{ width: 4, backgroundColor: index % 2 === 0 ? accent : C.cyan }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1, color: C.textPrimary, marginBottom: 4 }}>
                      {point.label.toUpperCase()}
                    </Text>
                    <Text style={{ fontFamily: F.inter, fontSize: 13, lineHeight: 19, color: C.textSecondary }}>{point.detail}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 22, paddingBottom: insets.bottom + 18, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }} accessibilityRole="tablist">
          {SLIDES.map((slide, index) => (
            <PressableScale
              key={slide.eyebrow}
              onPress={() => goTo(index)}
              accessibilityRole="tab"
              accessibilityLabel={`Página ${index + 1} de ${SLIDES.length}: ${slide.eyebrow.toLowerCase()}`}
              selected={index === page}
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
              style={{ height: 4, width: index === page ? 28 : 12, backgroundColor: index === page ? accent : withAlpha(C.textTertiary, 0.6) }}
            >
              <View />
            </PressableScale>
          ))}
        </View>
        <PressableScale
          onPress={() => (last ? start() : goTo(page + 1))}
          haptic="medium"
          style={{ backgroundColor: accent, padding: 16, alignItems: 'center' }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 12, letterSpacing: 0.8, color: C.onAccent }}>
            {last ? 'ARMAR MI PLAN' : 'SIGUIENTE'}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}
