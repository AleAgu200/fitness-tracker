import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/constants/colors';
import { Meal, MealStatus, useApp } from '@/context/app-state';

function statusColor(s: MealStatus | undefined) {
  if (s === 'cumplido')   return C.yellow;
  if (s === 'sustituido') return C.cyan;
  return C.textTertiary;
}

function statusLabel(s: MealStatus | undefined) {
  if (s === 'cumplido')   return 'CUMPLIDO';
  if (s === 'sustituido') return 'SUSTITUIDO';
  return 'PENDIENTE';
}

function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', ...style }}>
      {children}
    </Text>
  );
}

function MealCard({ m, state, setMeal, setMealNote }: {
  m: Meal;
  state: ReturnType<typeof useApp>['state'];
  setMeal: (id: string, st: MealStatus) => void;
  setMealNote: (id: string, txt: string) => void;
}) {
  const s = state.mealStatus[m.id] as MealStatus | undefined;
  const sc = statusColor(s);
  const sl = statusLabel(s);
  const note = state.mealNotes[m.id] || '';

  return (
    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: sc, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingBottom: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.textPrimary }}>{m.label}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>{m.time}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: sc, textTransform: 'uppercase' }}>{sl}</Text>
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 11 }}>
        <Text style={{ fontFamily: F.interMed, fontSize: 14, color: C.textPrimary, marginBottom: 3 }}>{m.n}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>
          {m.kcal} kcal · P {m.p}g · C {m.c}g · G {m.g}g
        </Text>
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border }}>
        {(['cumplido', 'sustituido', 'pendiente'] as MealStatus[]).map((action, i) => (
          <TouchableOpacity
            key={action}
            onPress={() => setMeal(m.id, action)}
            style={{
              flex: 1, padding: 11,
              backgroundColor: s === action ? (action === 'cumplido' ? C.yellow : action === 'sustituido' ? C.cyan : C.border) : C.card,
              borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.border,
              alignItems: 'center',
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.5, color: s === action ? C.bg : C.textSecondary, textTransform: 'uppercase' }}>
              {action === 'cumplido' ? 'CUMPLIDO' : action === 'sustituido' ? 'SUSTITUIR' : 'PENDIENTE'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {s === 'sustituido' && (
        <View style={{ padding: 11, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'rgba(61,220,255,0.05)' }}>
          <Label style={{ color: C.cyan, marginBottom: 7 }}>¿CON QUÉ LO SUSTITUISTE?</Label>
          <TextInput
            value={note}
            onChangeText={txt => setMealNote(m.id, txt)}
            placeholder="Ej: yogur griego en vez del licuado"
            placeholderTextColor={C.textTertiary}
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.inter, fontSize: 13 }}
          />
          <Label style={{ marginTop: 6 }}>EL COACH VE TU NOTA</Label>
        </View>
      )}
    </View>
  );
}

export default function DietaScreen() {
  const { state, setMeal, setMealNote, setWater } = useApp();
  const insets = useSafeAreaInsets();

  const hasPlan = state.meals.length > 0;

  const consumed = state.meals.reduce((acc, m) => {
    const s = state.mealStatus[m.id];
    if (s === 'cumplido' || s === 'sustituido') {
      return { kcal: acc.kcal + m.kcal, p: acc.p + m.p, c: acc.c + m.c, g: acc.g + m.g };
    }
    return acc;
  }, { kcal: 0, p: 0, c: 0, g: 0 });

  const totalKcal = state.meals.reduce((a, m) => a + m.kcal, 0);
  const totalP    = state.meals.reduce((a, m) => a + m.p, 0);
  const totalC    = state.meals.reduce((a, m) => a + m.c, 0);
  const totalG    = state.meals.reduce((a, m) => a + m.g, 0);

  const macroBars = hasPlan ? [
    { k: 'KCAL',     v: consumed.kcal,        t: totalKcal,        fill: totalKcal > 0 ? Math.min(1, consumed.kcal / totalKcal) : 0, color: C.yellow },
    { k: 'PROTEÍNA', v: `${consumed.p}g`,      t: `${totalP}g`,     fill: totalP > 0 ? Math.min(1, consumed.p / totalP) : 0,          color: C.cyan },
    { k: 'CARBOS',   v: `${consumed.c}g`,      t: `${totalC}g`,     fill: totalC > 0 ? Math.min(1, consumed.c / totalC) : 0,          color: C.orange },
    { k: 'GRASAS',   v: `${consumed.g}g`,      t: `${totalG}g`,     fill: totalG > 0 ? Math.min(1, consumed.g / totalG) : 0,          color: '#A855F7' },
  ] : [];

  const macroPct = totalKcal > 0 ? Math.round((consumed.kcal / totalKcal) * 100) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <Label style={{ marginBottom: 6 }}>PLAN NUTRICIONAL</Label>
        <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary, marginBottom: 16 }}>Nutrición</Text>

        {hasPlan ? (
          <>
            {/* MACROS */}
            <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
                <Label>CONSUMIDO vs META</Label>
                <Label>{macroPct}% del día</Label>
              </View>
              {macroBars.map(b => (
                <View key={b.k} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.8, color: C.textMid, textTransform: 'uppercase' }}>{b.k}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>
                      {b.v} / <Text style={{ color: b.color }}>{b.t}</Text>
                    </Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
                    <View style={{ height: '100%', backgroundColor: b.color, width: `${b.fill * 100}%` }} />
                  </View>
                </View>
              ))}
            </View>

            {/* MEALS */}
            {state.meals.map(m => (
              <MealCard key={m.id} m={m} state={state} setMeal={setMeal} setMealNote={setMealNote} />
            ))}
          </>
        ) : (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 24, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 10 }}>
              SIN PLAN NUTRICIONAL
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Tu coach asignará tu plan de comidas aquí cuando esté listo.
            </Text>
          </View>
        )}

        {/* AGUA — always visible */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: hasPlan ? 4 : 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.cyan, textTransform: 'uppercase' }}>HIDRATACIÓN</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.textPrimary }}>
              <Text style={{ fontFamily: F.monoXBold }}>{(state.water * 0.35).toFixed(2)}</Text>
              <Text style={{ color: C.textTertiary, fontSize: 11 }}> / 3.5 L</Text>
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: 10 }, (_, i) => {
              const filled = i < state.water;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => setWater(i + 1)}
                  style={{
                    flex: 1, height: 36,
                    backgroundColor: filled ? 'rgba(61,220,255,0.25)' : C.bgEl,
                    borderWidth: 1, borderColor: filled ? C.cyan : C.border,
                  }}
                  activeOpacity={0.7}
                />
              );
            })}
          </View>
          <Label style={{ marginTop: 10, textAlign: 'center' }}>TOCÁ UN VASO · 0.35 L C/U</Label>
        </View>
      </View>
    </ScrollView>
  );
}
