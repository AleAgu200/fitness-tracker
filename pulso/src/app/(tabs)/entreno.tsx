import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/constants/colors';
import { useApp } from '@/context/app-state';

const RPE_VALUES = [6, 7, 8, 9, 10];

function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', ...style }}>
      {children}
    </Text>
  );
}

function Stepper({ label, value, onInc, onDec }: { label: string; value: string | number; onInc: () => void; onDec: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, padding: 12 }}>
      <Label style={{ textAlign: 'center', marginBottom: 9 }}>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <TouchableOpacity onPress={onDec} style={{ width: 30, height: 30, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.7}>
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.textPrimary }}>−</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: F.monoXBold, fontSize: 22, color: C.textPrimary, width: 54, textAlign: 'center', fontVariant: ['tabular-nums'] as any }}>
          {value}
        </Text>
        <TouchableOpacity onPress={onInc} style={{ width: 30, height: 30, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }} activeOpacity={0.7}>
          <Text style={{ fontFamily: F.mono, fontSize: 18, color: C.textPrimary }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function EntrenoScreen() {
  const {
    state, selectEx, incPeso, decPeso, incReps, decReps, setRpe, guardarSet,
    startEditEx, startAddEx, cancelExForm, setDraft, saveEditEx, saveAddEx, deleteEx,
    addRest, skipRest, dismissPrFlash,
  } = useApp();
  const insets = useSafeAreaInsets();
  const { exercises, exIndex, log, curPeso, curReps, curRpe, restActive, restLeft, prFlash, prMap, editingEx, addingEx, draft } = state;

  const activeEx = exercises[exIndex];
  const doneSets = (log[activeEx?.id] || []).length;
  const totalTonelaje = exercises.reduce((a, e) => {
    const sets = log[e.id] || [];
    return a + sets.reduce((b, s) => b + s.peso * s.reps, 0);
  }, 0);

  const restPct = (restLeft / 90) * 100;
  const restMins = Math.floor(restLeft / 60);
  const restSecs = restLeft % 60;
  const restMMSS = `${restMins}:${restSecs.toString().padStart(2, '0')}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* PR FLASH */}
        {prFlash && (
          <TouchableOpacity onPress={dismissPrFlash} activeOpacity={0.9} style={{ borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(255,61,90,0.1)', padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 22, color: C.red }}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 13, letterSpacing: 1.4, color: C.red, textTransform: 'uppercase' }}>¡NUEVO RÉCORD!</Text>
                <Text style={{ fontFamily: F.interSemi, fontSize: 15, color: C.textPrimary, marginTop: 3 }}>
                  {prFlash.ej} — {prFlash.val}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <View>
            <Label style={{ marginBottom: 6 }}>SESIÓN A · FULL BODY</Label>
            <Text style={{ fontFamily: F.grotesk, fontSize: 27, color: C.textPrimary }}>Entreno</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 20, color: C.yellow, fontVariant: ['tabular-nums'] as any }}>
              {totalTonelaje.toLocaleString()}
            </Text>
            <Label style={{ marginTop: 4 }}>TONELAJE kg</Label>
          </View>
        </View>

        {/* REST TIMER */}
        {restActive && (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.cyan, padding: 13, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, color: C.cyan, textTransform: 'uppercase' }}>DESCANSO</Text>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 24, color: C.cyan, fontVariant: ['tabular-nums'] as any }}>{restMMSS}</Text>
            </View>
            <View style={{ height: 6, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 11 }}>
              <View style={{ height: '100%', backgroundColor: C.cyan, width: `${restPct}%` }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={addRest} style={{ flex: 1, padding: 9, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }} activeOpacity={0.7}>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, color: C.textPrimary, textTransform: 'uppercase' }}>+30 S</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={skipRest} style={{ flex: 1, padding: 9, borderWidth: 1, borderColor: C.cyan, backgroundColor: 'rgba(61,220,255,0.06)', alignItems: 'center' }} activeOpacity={0.7}>
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.6, color: C.cyan, textTransform: 'uppercase' }}>SALTAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ACTIVE EXERCISE LOGGER */}
        {activeEx && (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View>
                <Text style={{ fontFamily: F.grotesk, fontSize: 18, color: C.textPrimary }}>{activeEx.nombre}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 4 }}>
                  {activeEx.sub} · PR {prMap[activeEx.id] || activeEx.basePR} kg
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <TouchableOpacity onPress={startEditEx} style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }} activeOpacity={0.7}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>✎ EDITAR</Text>
                </TouchableOpacity>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.yellow }}>{doneSets}/{activeEx.target}</Text>
              </View>
            </View>

            {/* STEPPERS */}
            <View style={{ flexDirection: 'row', gap: 1, backgroundColor: C.border }}>
              <Stepper label="PESO kg" value={curPeso} onInc={incPeso} onDec={decPeso} />
              <Stepper label="REPS" value={curReps} onInc={incReps} onDec={decReps} />
            </View>

            {/* RPE */}
            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.border }}>
              <Label style={{ marginBottom: 9 }}>RPE · ESFUERZO PERCIBIDO</Label>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {RPE_VALUES.map(v => {
                  const sel = curRpe === v;
                  const rpeColor = v >= 9 ? C.red : v === 8 ? C.orange : C.yellow;
                  return (
                    <TouchableOpacity
                      key={v}
                      onPress={() => setRpe(v)}
                      style={{
                        flex: 1, padding: 9, borderWidth: 1,
                        borderColor: sel ? rpeColor : C.border,
                        backgroundColor: sel ? `${rpeColor}22` : C.card,
                        alignItems: 'center',
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontFamily: F.monoBold, fontSize: 12, color: sel ? rpeColor : C.textSecondary }}>{v}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity onPress={guardarSet} style={{ padding: 15, backgroundColor: C.yellow, alignItems: 'center' }} activeOpacity={0.8}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.bg, textTransform: 'uppercase' }}>✓ GUARDAR SET</Text>
            </TouchableOpacity>

            {/* LOGGED SETS */}
            {(log[activeEx.id] || []).length > 0 && (
              <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
                {(log[activeEx.id] || []).map((s, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary, width: 40 }}>SET {idx + 1}</Text>
                    <Text style={{ flex: 1, fontFamily: F.monoBold, fontSize: 13, color: C.textPrimary }}>
                      {s.peso} kg × {s.reps}
                    </Text>
                    <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textSecondary }}>RPE {s.rpe}</Text>
                    {s.pr ? (
                      <View style={{ borderWidth: 1, borderColor: C.red, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.red }}>PR</Text>
                      </View>
                    ) : (
                      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.yellow }}>✓</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* EXERCISE FORM */}
        {(editingEx || addingEx) && (
          <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.yellow, padding: 14, marginBottom: 12 }}>
            <Label style={{ color: C.yellow, marginBottom: 12 }}>
              {editingEx ? 'EDITAR EJERCICIO' : 'NUEVO EJERCICIO'}
            </Label>
            <TextInput
              value={draft.nombre}
              onChangeText={v => setDraft('nombre', v)}
              placeholder="Nombre del ejercicio"
              placeholderTextColor={C.textTertiary}
              style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14, marginBottom: 10 }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 13 }}>
              {[{ label: 'SERIES', field: 'target' as const }, { label: 'REPS', field: 'reps' as const }, { label: 'PESO kg', field: 'peso' as const }].map(item => (
                <View key={item.field} style={{ flex: 1 }}>
                  <Label style={{ marginBottom: 6 }}>{item.label}</Label>
                  <TextInput
                    keyboardType="numeric"
                    value={String(draft[item.field])}
                    onChangeText={v => setDraft(item.field, v)}
                    style={{ backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border, padding: 9, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15, textAlign: 'center' }}
                  />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={cancelExForm} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }} activeOpacity={0.7}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>CANCELAR</Text>
              </TouchableOpacity>
              {editingEx && (
                <TouchableOpacity onPress={deleteEx} style={{ paddingHorizontal: 13, padding: 12, borderWidth: 1, borderColor: C.red, backgroundColor: 'rgba(255,61,90,0.06)', alignItems: 'center' }} activeOpacity={0.7}>
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.red, textTransform: 'uppercase' }}>ELIMINAR</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={editingEx ? saveEditEx : saveAddEx} style={{ flex: 1.5, padding: 12, backgroundColor: C.yellow, alignItems: 'center' }} activeOpacity={0.8}>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>
                  {editingEx ? 'GUARDAR' : 'AGREGAR'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* EXERCISE LIST */}
        <Label style={{ marginTop: 16, marginBottom: 9 }}>EJERCICIOS DE HOY</Label>
        {exercises.map((e, i) => {
          const sets = log[e.id] || [];
          const done = sets.length;
          const ton = sets.reduce((a, s) => a + s.peso * s.reps, 0);
          const isActive = i === exIndex;
          const complete = done >= e.target;
          return (
            <TouchableOpacity
              key={e.id}
              onPress={() => selectEx(i)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: C.card,
                borderWidth: 1, borderColor: isActive ? C.yellow : C.border,
                padding: 12, paddingHorizontal: 14, marginBottom: 7,
              }}
              activeOpacity={0.8}
            >
              <View style={{ width: 6, height: 6, backgroundColor: complete ? C.yellow : isActive ? C.cyan : C.border }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary }}>{e.nombre}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 2 }}>
                  {e.sub} · {ton} kg
                </Text>
              </View>
              <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: complete ? C.yellow : isActive ? C.cyan : C.textSecondary }}>
                {done}/{e.target}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          onPress={startAddEx}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#3a3a40', borderStyle: 'dashed', backgroundColor: C.bgEl, padding: 14, marginTop: 3 }}
          activeOpacity={0.7}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 11, letterSpacing: 0.6, color: C.textSecondary, textTransform: 'uppercase' }}>
            + AGREGAR EJERCICIO
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
