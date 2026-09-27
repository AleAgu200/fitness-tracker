import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { AnimatedBar, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { DETAILED_MUSCLE_LABELS } from '@/lib/muscles';
import { WeightUnit } from '@/lib/settings';
import { displayWeight } from '@/lib/units';
import type { WeeklyPage } from '@/lib/weekly-summary';
import { CARD_FAMILIES } from './labels';
import { cardText } from './session-result-card';

const lower = (key: keyof typeof DETAILED_MUSCLE_LABELS) => DETAILED_MUSCLE_LABELS[key].toLowerCase();

function Big({ children, highlight, color }: { children: string; highlight?: string; color: string }) {
  const C = useColors();
  const [before, after] = highlight ? children.split('{}') : [children, ''];
  return (
    <Text accessibilityRole="header" style={{ fontFamily: F.grotesk, fontSize: 36, lineHeight: 40, color: C.textPrimary }}>
      {before}
      {highlight != null && <Text style={{ color }}>{highlight}</Text>}
      {after}
    </Text>
  );
}

function Body({ children }: { children: string }) {
  const C = useColors();
  return <Text style={{ fontFamily: F.inter, fontSize: 14, lineHeight: 21, color: C.textSecondary, maxWidth: 320 }}>{children}</Text>;
}

/** One idea per page. Copy is written here; the page data comes from lib/weekly-summary. */
export function WeeklyStoryPage({ page, accent, weightUnit }: { page: WeeklyPage; accent: string; weightUnit: WeightUnit }) {
  const C = useColors();

  switch (page.kind) {
    case 'intro':
      return (
        <View style={{ gap: 18 }}>
          <Label style={{ color: accent }}>TU SEMANA EN PULSO</Label>
          <Big highlight={`${page.activeDays} ${page.activeDays === 1 ? 'día' : 'días'}`} color={accent}>{'{}\ncon pulso.'}</Big>
          <Body>
            {page.sessions
              ? `${page.sessions} ${page.sessions === 1 ? 'sesión' : 'sesiones'} de entrenamiento y todo lo que registraste alrededor.`
              : 'Esta semana tus señales vinieron de la nutrición y la hidratación.'}
          </Body>
        </View>
      );

    case 'movement': {
      const change = page.previousTonnageKg ? Math.round((page.tonnageKg / page.previousTonnageKg - 1) * 100) : null;
      const rpeNote = page.avgRpe != null && page.previousAvgRpe != null
        ? Math.abs(page.avgRpe - page.previousAvgRpe) < 0.5 ? ', con un esfuerzo medio similar'
          : page.avgRpe < page.previousAvgRpe ? ', con menos esfuerzo percibido' : ', con más esfuerzo percibido'
        : '';
      return (
        <View style={{ gap: 18 }}>
          <Label>MOVIMIENTO</Label>
          {page.tonnageKg > 0
            ? <Big highlight={`${Math.round(displayWeight(page.tonnageKg, weightUnit)).toLocaleString()} ${weightUnit}`} color={accent}>{'Moviste\n{}\nesta semana.'}</Big>
            : <Big highlight={`${page.sets} series`} color={accent}>{'Registraste\n{}\nesta semana.'}</Big>}
          <View style={{ alignSelf: 'center', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: accent, backgroundColor: withAlpha(accent, 0.08), alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 48, color: accent }}>{page.sessions}</Text>
            <Label>{page.sessions === 1 ? 'SESIÓN' : 'SESIONES'}</Label>
          </View>
          <Body>
            {change != null
              ? `${change >= 0 ? '+' : ''}${change}% de volumen frente a tu semana anterior${rpeNote}.`
              : `${page.sets} series registradas. La próxima semana vas a tener con qué compararte.`}
          </Body>
        </View>
      );
    }

    case 'muscles': {
      const max = Math.max(...page.top.map(item => item.sets), 1);
      return (
        <View style={{ gap: 18 }}>
          <Label>MÚSCULOS</Label>
          <Big highlight={lower(page.top[0].muscle)} color={accent}>{'Tu foco fue\n{}.'}</Big>
          <View style={{ gap: 10 }}>
            {page.top.map(item => (
              <View key={item.muscle} accessible accessibilityLabel={`${lower(item.muscle)}: ${item.sets} series efectivas`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Label>{DETAILED_MUSCLE_LABELS[item.muscle]}</Label>
                  <Label>{`${item.sets} SERIES`}</Label>
                </View>
                <AnimatedBar fill={item.sets / max} color={C.orange} height={6} />
              </View>
            ))}
          </View>
          <Body>Series efectivas: cuentan completas para el músculo principal y a la mitad para los que ayudan.</Body>
        </View>
      );
    }

    case 'moment': {
      const family = CARD_FAMILIES[page.card.type];
      const color = family.color(accent, C);
      const text = cardText(
        { id: '', sessionId: page.sessionId, type: page.card.type, metric: page.card.metric, serial: 0, earnedAt: new Date(), sharedWithTeamAt: null },
        weightUnit,
      );
      return (
        <View style={{ gap: 18 }}>
          <Label>MOMENTO DE LA SEMANA</Label>
          <View style={{ borderWidth: 1, borderColor: color, padding: 16, gap: 8, backgroundColor: C.card }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1, color }}>{family.label}</Text>
            <Label>{text.eyebrow}</Label>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 30, color }}>{text.headline}</Text>
            <Body>{text.detail}</Body>
          </View>
          <PressableScale
            onPress={() => router.push({ pathname: '/resultado-sesion', params: { sessionId: page.sessionId, origin: 'history' } })}
            style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 1, color: C.textSecondary }}>VER TARJETA →</Text>
          </PressableScale>
        </View>
      );
    }

    case 'consistency':
      return (
        <View style={{ gap: 18 }}>
          <Label style={{ color: C.orange }}>CONSTANCIA</Label>
          <Big highlight={`${page.activeDays}/7`} color={C.orange}>{'{} días\ncon alguna señal.'}</Big>
          <View style={{ gap: 10 }}>
            {[
              { label: 'ENTRENO', days: page.workoutDays },
              { label: 'NUTRICIÓN', days: page.nutritionDays },
              { label: 'HIDRATACIÓN', days: page.hydrationDays },
            ].map(item => (
              <View key={item.label} accessible accessibilityLabel={`${item.label.toLowerCase()}: ${item.days} de 7 días`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Label>{item.label}</Label>
                  <Label>{`${item.days}/7`}</Label>
                </View>
                <AnimatedBar fill={item.days / 7} color={C.orange} height={6} />
              </View>
            ))}
          </View>
          <Body>Cada día cuenta con cualquiera de las tres señales. Un día sin registro no borra lo demás.</Body>
        </View>
      );

    case 'recovery':
      return (
        <View style={{ gap: 18 }}>
          <Label style={{ color: C.cyan }}>RECUPERACIÓN</Label>
          <Big highlight={page.muscles.map(lower).join(' y ')} color={C.cyan}>{'Lo que más cargaste:\n{}.'}</Big>
          <Body>
            Si esta semana vuelven a tocar, alterná con otros grupos o bajá un poco el volumen. Es una referencia de entrenamiento, no una evaluación médica.
          </Body>
        </View>
      );

    case 'next':
      return (
        <View style={{ gap: 18 }}>
          <Label style={{ color: accent }}>PRÓXIMO PULSO</Label>
          {page.goal === 'reactivate' && <Big highlight="Una sesión corta" color={accent}>{'{}\nreactiva tu núcleo.'}</Big>}
          {page.goal === 'add_one' && <Big highlight={`${page.target} sesiones`} color={accent}>{'Esta semana:\n{}.'}</Big>}
          {page.goal === 'repeat' && <Big highlight={`${page.target} sesiones`} color={accent}>{'Repetí tu ritmo:\n{}.'}</Big>}
          <Body>Un objetivo pequeño y alcanzable. Si no sale, no se pierde nada: se vuelve a empezar.</Body>
        </View>
      );
  }
}
