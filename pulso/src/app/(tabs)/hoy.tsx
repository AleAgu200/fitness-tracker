import { router } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/constants/colors';
import { useApp } from '@/context/app-state';

const DIAS  = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', ...style }}>
      {children}
    </Text>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, ...style }}>
      {children}
    </View>
  );
}

export default function HoyScreen() {
  const { state } = useApp();
  const insets = useSafeAreaInsets();

  const today = new Date();
  const dateHeader = `${DIAS[today.getDay()]} ${today.getDate()} ${MESES[today.getMonth()]}`;

  const totalSets   = Object.values(state.log).reduce((a, sets) => a + sets.length, 0);
  const totalTarget = state.exercises.reduce((a, e) => a + e.target, 0);
  const misionPct   = totalTarget > 0 ? Math.round((totalSets / totalTarget) * 100) : 0;

  const mealsDone     = state.meals.filter(m => ['cumplido', 'sustituido'].includes(state.mealStatus[m.id] ?? '')).length;
  const nutricionPct  = state.meals.length > 0 ? Math.round((mealsDone / state.meals.length) * 100) : 0;
  const hidratacionPct = Math.min(100, Math.round((state.water / 10) * 100));

  const loadBars = [
    { k: 'ENTRENAMIENTO', fill: misionPct / 100,     color: C.yellow, val: `${misionPct}%` },
    { k: 'NUTRICIÓN',     fill: nutricionPct / 100,  color: C.cyan,   val: state.meals.length > 0 ? `${nutricionPct}%` : '—' },
    { k: 'HIDRATACIÓN',   fill: hidratacionPct / 100, color: C.orange, val: `${hidratacionPct}%` },
  ];
  const loadPct = Math.round((misionPct + nutricionPct + hidratacionPct) / 3);

  const firstName = state.profile?.firstName || '';
  const initials  = state.profile?.initials || '?';

  // Week indicators — all blank until DB-backed session history
  const WEEK_DAYS = [
    { l: 'L', done: false }, { l: 'M', done: false }, { l: 'M', done: false },
    { l: 'J', done: false }, { l: 'V', done: false }, { l: 'S', done: false }, { l: 'D', done: false },
  ];

  const hasPlan = state.exercises.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <View>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 2.4, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 6 }}>
              {dateHeader}
            </Text>
            <Text style={{ fontFamily: F.grotesk, fontSize: 27, lineHeight: 27, color: C.textPrimary, letterSpacing: -0.3 }}>
              {firstName ? `Hola, ${firstName}` : 'Bienvenido'}
            </Text>
          </View>
          <View style={{ width: 42, height: 42, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: C.yellow }}>{initials}</Text>
          </View>
        </View>

        {/* CARGA DEL DÍA */}
        <Card style={{ padding: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
            <Label>CARGA DEL DÍA</Label>
            <Label>META 100%</Label>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 54, lineHeight: 44, color: C.yellow, letterSpacing: -1 }}>
              {loadPct}
            </Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: 22, color: C.yellow }}>%</Text>
            <Text style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>
              promedio
            </Text>
          </View>
          {loadBars.map(b => (
            <View key={b.k} style={{ marginBottom: 11 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Label>{b.k}</Label>
                <Label>{b.val}</Label>
              </View>
              <View style={{ height: 8, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                <View style={{ height: '100%', backgroundColor: b.color, width: `${b.fill * 100}%` }} />
              </View>
            </View>
          ))}
        </Card>

        {/* RACHA + PESO */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Card style={{ flex: 1.15, padding: 14 }}>
            <Label style={{ marginBottom: 8 }}>RACHA ACTIVA</Label>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 38, lineHeight: 32, color: C.orange }}>{state.racha}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.orange }}>días</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 3, marginTop: 11 }}>
              {WEEK_DAYS.map((d, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1, height: 18, backgroundColor: d.done ? C.orange : C.bgEl,
                    borderWidth: 1, borderColor: d.done ? C.orange : C.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 8, color: d.done ? C.bg : C.textTertiary }}>{d.l}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Card style={{ flex: 1, padding: 14 }}>
            <Label style={{ marginBottom: 8 }}>PESO ACTUAL</Label>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 30, lineHeight: 26, color: C.textPrimary }}>
                {state.weighIn.toFixed(1)}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.textTertiary }}>kg</Text>
            </View>
            {state.pesoHist.length > 1 && (
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.yellow, marginTop: 10 }}>
                {(() => {
                  const delta = state.pesoHist[state.pesoHist.length - 1] - state.pesoHist[0];
                  return `${delta <= 0 ? '▼' : '▲'} ${Math.abs(delta).toFixed(1)} kg`;
                })()}
              </Text>
            )}
          </Card>
        </View>

        {/* MISIÓN DE HOY */}
        {hasPlan ? (
          <Card style={{ padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.yellow, textTransform: 'uppercase' }}>★ MISIÓN DE HOY</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.yellow }}>{misionPct}%</Text>
            </View>
            <Text style={{ fontFamily: F.groteskMed, fontSize: 16, color: C.textPrimary, lineHeight: 22, marginBottom: 12 }}>
              Completar {state.exercises.length} ejercicio{state.exercises.length !== 1 ? 's' : ''} · registrá cada set
            </Text>
            <View style={{ height: 10, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
              <View style={{ height: '100%', backgroundColor: C.yellow, width: `${misionPct}%` }} />
            </View>
            <TouchableOpacity
              onPress={() => router.push('/entreno')}
              style={{ marginTop: 12, backgroundColor: C.yellow, padding: 11, alignItems: 'center' }}
              activeOpacity={0.8}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.5, color: C.bg, textTransform: 'uppercase' }}>
                EMPEZAR ENTRENO →
              </Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card style={{ padding: 20, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 10 }}>
              SIN PLAN DE ENTRENO
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 14 }}>
              Agregá tus ejercicios para empezar a registrar tus entrenos
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/entreno')}
              style={{ borderWidth: 1, borderColor: C.yellow, paddingVertical: 10, paddingHorizontal: 20 }}
              activeOpacity={0.8}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.5, color: C.yellow, textTransform: 'uppercase' }}>
                IR A ENTRENO →
              </Text>
            </TouchableOpacity>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}
