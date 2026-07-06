import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedBar, Card, Label, PressableScale } from '@/components/ui/kit';
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

function MealCard({ m, index }: { m: Meal; index: number }) {
  const { state, setMeal, setMealNote, startEditMeal } = useApp();
  const s = state.mealStatus[m.id] as MealStatus | undefined;
  const sc = statusColor(s);
  const sl = statusLabel(s);
  const note = state.mealNotes[m.id] || '';

  return (
    <Animated.View layout={LinearTransition.duration(220)}>
    <Animated.View
      entering={FadeInDown.duration(280).delay(index * 45).easing(Easing.out(Easing.cubic))}
      style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, borderLeftColor: sc, marginBottom: 10 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingBottom: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, color: C.textPrimary }}>{m.label}</Text>
          {!!m.time && <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>{m.time}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: sc, textTransform: 'uppercase' }}>{sl}</Text>
          <PressableScale onPress={() => startEditMeal(m.id)} style={{ paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textSecondary }}>✎</Text>
          </PressableScale>
        </View>
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 11 }}>
        <Text style={{ fontFamily: F.interMed, fontSize: 14, color: C.textPrimary, marginBottom: 3 }}>{m.n}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary }}>
          {m.kcal} kcal · P {m.p}g · C {m.c}g · G {m.g}g
        </Text>
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border }}>
        {(['cumplido', 'sustituido', 'pendiente'] as MealStatus[]).map((action, i) => (
          <PressableScale
            key={action}
            onPress={() => setMeal(m.id, action)}
            style={{
              flex: 1, padding: 11,
              backgroundColor: s === action ? (action === 'cumplido' ? C.yellow : action === 'sustituido' ? C.cyan : C.border) : C.card,
              borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.border,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.5, color: s === action ? C.bg : C.textSecondary, textTransform: 'uppercase' }}>
              {action === 'cumplido' ? 'CUMPLIDO' : action === 'sustituido' ? 'SUSTITUIR' : 'PENDIENTE'}
            </Text>
          </PressableScale>
        ))}
      </View>
      {s === 'sustituido' && (
        <Animated.View entering={FadeIn.duration(250)} style={{ padding: 11, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: 'rgba(61,220,255,0.05)' }}>
          <Label style={{ color: C.cyan, marginBottom: 7 }}>¿CON QUÉ LO SUSTITUISTE?</Label>
          <TextInput
            value={note}
            onChangeText={txt => setMealNote(m.id, txt)}
            placeholder="Ej: yogur griego en vez del licuado"
            placeholderTextColor={C.textTertiary}
            style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.inter, fontSize: 13 }}
          />
          <Label style={{ marginTop: 6 }}>TU NOTA QUEDA GUARDADA</Label>
        </Animated.View>
      )}
    </Animated.View>
    </Animated.View>
  );
}

function MealForm() {
  const { state, cancelMealForm, setMealDraft, saveMealForm, deleteMeal } = useApp();
  const d = state.mealDraft;
  const editing = state.editingMealId != null;

  const inputStyle = {
    backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border,
    padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14,
  } as const;

  return (
    <Animated.View entering={FadeInDown.duration(280)} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.cyan, padding: 14, marginBottom: 12 }}>
      <Label style={{ color: C.cyan, marginBottom: 12 }}>
        {editing ? 'EDITAR COMIDA' : 'NUEVA COMIDA'}
      </Label>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1.4 }}>
          <Label style={{ marginBottom: 6 }}>NOMBRE (ej: DESAYUNO)</Label>
          <TextInput
            value={d.label}
            onChangeText={v => setMealDraft('label', v)}
            placeholder="DESAYUNO"
            autoCapitalize="characters"
            placeholderTextColor={C.textTertiary}
            style={inputStyle}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label style={{ marginBottom: 6 }}>HORA</Label>
          <TextInput
            value={d.time}
            onChangeText={v => setMealDraft('time', v)}
            placeholder="07:30"
            placeholderTextColor={C.textTertiary}
            style={inputStyle}
          />
        </View>
      </View>
      <Label style={{ marginBottom: 6 }}>DESCRIPCIÓN</Label>
      <TextInput
        value={d.n}
        onChangeText={v => setMealDraft('n', v)}
        placeholder="Avena con banana y huevos"
        placeholderTextColor={C.textTertiary}
        style={{ ...inputStyle, marginBottom: 10 }}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 13 }}>
        {([['KCAL', 'kcal'], ['P g', 'p'], ['C g', 'c'], ['G g', 'g']] as const).map(([label, field]) => (
          <View key={field} style={{ flex: 1 }}>
            <Label style={{ marginBottom: 6 }}>{label}</Label>
            <TextInput
              keyboardType="numeric"
              value={d[field]}
              onChangeText={v => setMealDraft(field, v)}
              placeholder="0"
              placeholderTextColor={C.textTertiary}
              style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 14, textAlign: 'center' }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PressableScale onPress={cancelMealForm} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>CANCELAR</Text>
        </PressableScale>
        {editing && (
          <PressableScale onPress={deleteMeal} haptic="medium" style={{ paddingHorizontal: 13, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(255,61,90,0.06)', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red, textTransform: 'uppercase' }}>ELIMINAR</Text>
          </PressableScale>
        )}
        <PressableScale onPress={saveMealForm} haptic="medium" style={{ flex: 1.5, padding: 12, backgroundColor: C.cyan, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
            {editing ? 'GUARDAR' : 'AGREGAR'}
          </Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

export default function DietaScreen() {
  const { state, setWater, startAddMeal } = useApp();
  const insets = useSafeAreaInsets();

  const hasPlan = state.meals.length > 0;
  const formOpen = state.addingMeal || state.editingMealId != null;

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
    { k: 'KCAL',     v: consumed.kcal,    t: totalKcal,    fill: totalKcal > 0 ? Math.min(1, consumed.kcal / totalKcal) : 0, color: C.yellow },
    { k: 'PROTEÍNA', v: `${consumed.p}g`, t: `${totalP}g`, fill: totalP > 0 ? Math.min(1, consumed.p / totalP) : 0,          color: C.cyan },
    { k: 'CARBOS',   v: `${consumed.c}g`, t: `${totalC}g`, fill: totalC > 0 ? Math.min(1, consumed.c / totalC) : 0,          color: C.orange },
    { k: 'GRASAS',   v: `${consumed.g}g`, t: `${totalG}g`, fill: totalG > 0 ? Math.min(1, consumed.g / totalG) : 0,          color: '#A855F7' },
  ] : [];

  const macroPct = totalKcal > 0 ? Math.round((consumed.kcal / totalKcal) * 100) : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>
        <Label style={{ marginBottom: 6 }}>PLAN NUTRICIONAL</Label>
        <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary, marginBottom: 16 }}>Nutrición</Text>

        {formOpen && <MealForm />}

        {hasPlan ? (
          <>
            {/* MACROS */}
            <Card index={0} style={{ padding: 14, marginBottom: 14 }}>
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
                  <AnimatedBar fill={b.fill} color={b.color} />
                </View>
              ))}
            </Card>

            {/* MEALS */}
            {state.meals.map((m, i) => (
              <MealCard key={m.id} m={m} index={i + 1} />
            ))}
          </>
        ) : !formOpen && (
          <Card index={0} style={{ padding: 24, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.8, color: C.textTertiary, textTransform: 'uppercase', marginBottom: 10 }}>
              SIN PLAN NUTRICIONAL
            </Text>
            <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
              Armá tu plan de comidas del día: agregá cada comida con sus macros y marcá tu cumplimiento.
            </Text>
            <PressableScale
              onPress={startAddMeal}
              haptic="medium"
              style={{ backgroundColor: C.cyan, paddingVertical: 12, paddingHorizontal: 22 }}
            >
              <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
                + CREAR MI PLAN
              </Text>
            </PressableScale>
          </Card>
        )}

        {hasPlan && !formOpen && (
          <PressableScale
            onPress={startAddMeal}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#3a3a40', borderStyle: 'dashed', backgroundColor: C.bgEl, padding: 14, marginBottom: 14 }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary, textTransform: 'uppercase' }}>
              + AGREGAR COMIDA
            </Text>
          </PressableScale>
        )}

        {/* AGUA — always visible */}
        <Card index={hasPlan ? 2 : 1} style={{ padding: 14 }}>
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
                <PressableScale
                  key={i}
                  onPress={() => setWater(i + 1)}
                  style={{
                    flex: 1, height: 36,
                    backgroundColor: filled ? 'rgba(61,220,255,0.25)' : C.bgEl,
                    borderWidth: 1, borderColor: filled ? C.cyan : C.border,
                  }}
                >
                  <View />
                </PressableScale>
              );
            })}
          </View>
          <Label style={{ marginTop: 10, textAlign: 'center' }}>TOCÁ UN VASO · 0.35 L C/U</Label>
        </Card>
      </View>
    </ScrollView>
  );
}
