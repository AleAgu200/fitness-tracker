import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { NotificationSettings } from '@/components/notification-settings';
import { PreferencesSettings } from '@/components/preferences-settings';
import { C, F, withAlpha } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { displayWeight, toKg } from '@/lib/units';

type Sexo = 'M' | 'F' | 'X';
const SEX_LABELS: Record<Sexo, string> = { M: 'HOMBRE', F: 'MUJER', X: 'OTRO' };

function formatDob(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
  if (digits.length > 2) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}

function ProfileSection() {
  const { state, saveProfile } = useApp();
  const { accent, weightUnit } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState('');
  const [sexo, setSexo] = useState<Sexo | null>(null);
  const [dob, setDob] = useState('');
  const [altura, setAltura] = useState('');
  const [meta, setMeta] = useState('');

  const p = state.profileData;

  function startEdit() {
    setNombre(p?.fullName ?? '');
    setSexo(p?.sex ?? null);
    setDob(p?.dateOfBirth ?? '');
    setAltura(p?.heightCm != null ? String(p.heightCm) : '');
    setMeta(p?.goalWeightKg != null ? String(displayWeight(p.goalWeightKg, weightUnit)) : '');
    setEditing(true);
  }

  function save() {
    if (!nombre.trim()) return;
    const metaValue = parseFloat(meta);
    saveProfile({
      fullName: nombre,
      sex: sexo,
      dateOfBirth: dob.trim() || null,
      heightCm: parseFloat(altura) || null,
      goalWeightKg: Number.isFinite(metaValue) ? toKg(metaValue, weightUnit) : null,
    });
    setEditing(false);
  }

  const inputStyle = {
    backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border,
    padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14,
  } as const;

  if (editing) {
    return (
      <Animated.View entering={FadeIn.duration(220)} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: accent, padding: 14, marginBottom: 14 }}>
        <Label style={{ color: accent, marginBottom: 12 }}>EDITAR PERFIL</Label>

        <Label style={{ marginBottom: 6 }}>NOMBRE COMPLETO</Label>
        <TextInput
          value={nombre} onChangeText={setNombre}
          autoCapitalize="words"
          placeholder="Kevin Lozano" placeholderTextColor={C.textTertiary}
          style={{ ...inputStyle, marginBottom: 10 }}
        />

        <Label style={{ marginBottom: 6 }}>SEXO</Label>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {(['M', 'F', 'X'] as Sexo[]).map(s => {
            const sel = sexo === s;
            return (
              <PressableScale
                key={s}
                onPress={() => setSexo(sel ? null : s)}
                style={{
                  flex: 1, padding: 10, borderWidth: 1,
                  borderColor: sel ? accent : C.border,
                  backgroundColor: sel ? withAlpha(accent, 0.13) : C.bgEl,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.4, color: sel ? accent : C.textSecondary }}>
                  {SEX_LABELS[s]}
                </Text>
              </PressableScale>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 13 }}>
          <View style={{ flex: 1.2 }}>
            <Label style={{ marginBottom: 6 }}>NACIMIENTO</Label>
            <TextInput
              value={dob} onChangeText={t => setDob(formatDob(t))}
              keyboardType="numeric" maxLength={10}
              placeholder="DD/MM/AAAA" placeholderTextColor={C.textTertiary}
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 6 }}>ALTURA cm</Label>
            <TextInput
              value={altura} onChangeText={setAltura}
              keyboardType="numeric"
              placeholder="170" placeholderTextColor={C.textTertiary}
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 6 }}>{`META ${weightUnit}`}</Label>
            <TextInput
              value={meta} onChangeText={setMeta}
              keyboardType="decimal-pad"
              placeholder="78.0" placeholderTextColor={C.textTertiary}
              style={inputStyle}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PressableScale onPress={() => setEditing(false)} style={{ flex: 1, padding: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>CANCELAR</Text>
          </PressableScale>
          <PressableScale onPress={save} haptic="medium" style={{ flex: 1.5, padding: 12, backgroundColor: accent, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.monoXBold, fontSize: 11, letterSpacing: 0.6, color: C.bg, textTransform: 'uppercase' }}>GUARDAR</Text>
          </PressableScale>
        </View>
      </Animated.View>
    );
  }

  const rows: { k: string; v: string }[] = [
    { k: 'NOMBRE',     v: p?.fullName ?? '—' },
    { k: 'SEXO',       v: p?.sex ? SEX_LABELS[p.sex] : '—' },
    { k: 'NACIMIENTO', v: p?.dateOfBirth || '—' },
    { k: 'ALTURA',     v: p?.heightCm != null ? `${p.heightCm} cm` : '—' },
    { k: 'PESO META',  v: p?.goalWeightKg != null ? `${displayWeight(p.goalWeightKg, weightUnit).toFixed(1)} ${weightUnit}` : '—' },
  ];

  return (
    <Card index={0} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Label>MI PERFIL</Label>
        <PressableScale onPress={startEdit} style={{ paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgEl }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.4, color: C.textSecondary, textTransform: 'uppercase' }}>✎ EDITAR</Text>
        </PressableScale>
      </View>
      {rows.map((r, i) => (
        <View key={r.k} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
          <Label>{r.k}</Label>
          <Text style={{ fontFamily: F.interMed, fontSize: 13, color: C.textPrimary }}>{r.v}</Text>
        </View>
      ))}
    </Card>
  );
}

export default function ConfiguracionScreen() {
  const { signOut } = useSession();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* HEADER */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <PressableScale onPress={() => router.back()} style={{ width: 34, height: 34, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <Label>AJUSTES</Label>
            <Text style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 3 }}>Configuración</Text>
          </View>
        </View>

        <ProfileSection />

        <NotificationSettings />

        <PreferencesSettings />

        {/* CUENTA */}
        <View style={{ marginTop: 4 }}>
          <Label style={{ marginBottom: 9 }}>CUENTA</Label>
          <PressableScale
            onPress={signOut}
            haptic="medium"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, paddingHorizontal: 16 }}
          >
            <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.red }}>Cerrar sesión</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.red }}>→</Text>
          </PressableScale>
        </View>
      </View>
    </ScrollView>
  );
}
