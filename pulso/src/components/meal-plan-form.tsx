import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { FoodPicker } from '@/components/food-picker';
import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { describeFoods, PickedFood, totalsFor } from '@/lib/foods';

export interface MealPlanFormValues {
  label: string;
  time: string;
  n: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
}

interface Props {
  editing: boolean;
  initial: MealPlanFormValues;
  onCancel: () => void;
  onSave: (values: MealPlanFormValues) => void;
  onDelete?: () => void;
}

/** Add/edit form for a single meal slot — shared by today's DIETA flow and the
 *  per-weekday editor for other days, same as ExercisePlanForm is shared across
 *  ENTRENO's days. Fully self-contained: callers only get the final values on save. */
export function MealPlanForm({ editing, initial, onCancel, onSave, onDelete }: Props) {
  const C = useColors();
  const [label, setLabel] = useState(initial.label);
  const [time, setTime] = useState(initial.time);
  const [n, setN] = useState(initial.n);
  const [kcal, setKcal] = useState(initial.kcal ? String(initial.kcal) : '');
  const [p, setP] = useState(initial.p ? String(initial.p) : '');
  const [c, setC] = useState(initial.c ? String(initial.c) : '');
  const [g, setG] = useState(initial.g ? String(initial.g) : '');
  const [picked, setPicked] = useState<PickedFood[]>([]);
  const usingPicker = picked.length > 0;

  const applyPicked = useCallback((items: PickedFood[]) => {
    setPicked(items);
    if (items.length === 0) return;
    const totals = totalsFor(items);
    setN(describeFoods(items));
    setKcal(String(totals.kcal));
    setP(String(totals.p));
    setC(String(totals.c));
    setG(String(totals.g));
  }, []);

  function save() {
    if (!label.trim() || !n.trim()) { onCancel(); return; }
    onSave({
      label: label.trim().toUpperCase(),
      time: time.trim(),
      n: n.trim(),
      kcal: Math.max(0, parseInt(kcal, 10) || 0),
      p: Math.max(0, parseInt(p, 10) || 0),
      c: Math.max(0, parseInt(c, 10) || 0),
      g: Math.max(0, parseInt(g, 10) || 0),
    });
  }

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
            value={label}
            onChangeText={setLabel}
            placeholder="DESAYUNO"
            autoCapitalize="characters"
            placeholderTextColor={C.textTertiary}
            style={inputStyle}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Label style={{ marginBottom: 6 }}>HORA</Label>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="07:30"
            placeholderTextColor={C.textTertiary}
            style={inputStyle}
          />
        </View>
      </View>
      <FoodPicker items={picked} onChange={applyPicked} />

      <Label style={{ marginBottom: 6 }}>DESCRIPCIÓN</Label>
      <TextInput
        value={n}
        onChangeText={setN}
        placeholder="Avena con banana y huevos"
        placeholderTextColor={C.textTertiary}
        style={{ ...inputStyle, marginBottom: 10 }}
      />

      {/* Once foods are picked the macros are computed from them, so showing
          editable fields would invite edits the next gram change silently
          overwrites. Meals without picked foods keep the manual path. */}
      {!usingPicker && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 13 }}>
          {([['KCAL', kcal, setKcal], ['P g', p, setP], ['C g', c, setC], ['G g', g, setG]] as const).map(([lbl, val, setter]) => (
            <View key={lbl} style={{ flex: 1 }}>
              <Label style={{ marginBottom: 6 }}>{lbl}</Label>
              <TextInput
                keyboardType="numeric"
                value={val}
                onChangeText={setter}
                placeholder="0"
                placeholderTextColor={C.textTertiary}
                style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 14, textAlign: 'center' }}
              />
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PressableScale onPress={onCancel} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>CANCELAR</Text>
        </PressableScale>
        {editing && onDelete && (
          <PressableScale onPress={onDelete} haptic="medium" style={{ paddingHorizontal: 13, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(255,61,90,0.06)', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red, textTransform: 'uppercase' }}>ELIMINAR</Text>
          </PressableScale>
        )}
        <PressableScale onPress={save} haptic="medium" style={{ flex: 1.5, padding: 12, backgroundColor: C.cyan, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
            {editing ? 'GUARDAR' : 'AGREGAR'}
          </Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}
