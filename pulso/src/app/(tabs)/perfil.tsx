import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { useSession } from '@/context/session';

const ALL_BADGES = [
  { key: 'first_pr',  icon: '⚡', label: 'PRIMER PR' },
  { key: 'streak_10', icon: '🔥', label: 'RACHA 10D' },
  { key: 'minus_3kg', icon: '▲',  label: '−3 KG' },
  { key: 'full_week', icon: '◆',  label: '100% SEM' },
  { key: 'squat_140', icon: '★',  label: '140 SQUAT' },
  { key: 'recomp',    icon: '◇',  label: 'RECOMP' },
];

function Label({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.4, color: C.textTertiary, textTransform: 'uppercase', ...style }}>
      {children}
    </Text>
  );
}

function genHeat(): number[][] {
  const cols: number[][] = [];
  for (let w = 0; w < 12; w++) {
    cols.push(Array.from({ length: 7 }, () => 0));
  }
  return cols;
}

function heatColor(v: number) {
  if (v === 0) return C.bgEl;
  if (v === 1) return 'rgba(232,255,89,0.3)';
  if (v === 2) return 'rgba(232,255,89,0.6)';
  return C.yellow;
}

function heatBorder(v: number) {
  return v === 0 ? C.border : 'transparent';
}

export default function PerfilScreen() {
  const { state } = useApp();
  const { signOut } = useSession();
  const insets = useSafeAreaInsets();

  const name     = state.profile?.name     || 'Atleta';
  const initials = state.profile?.initials || '?';

  const totalPRs = Object.keys(state.prMap).length;

  // PR history derived from logged sets
  const prHistory = state.exercises
    .filter(e => state.prMap[e.id])
    .map(e => ({
      ej:  e.nombre,
      val: `${state.prMap[e.id]} kg`,
    }));

  const HEAT_COLS = genHeat();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* USER HEADER */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <View style={{ width: 58, height: 58, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.yellow }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary }}>{name}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary, marginTop: 6 }}>
              Atleta
            </Text>
          </View>
        </View>

        {/* STATS ROW */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {[
            { val: state.racha, label: 'RACHA d',  color: C.orange },
            { val: totalPRs,    label: 'PRs',       color: C.red },
            { val: 0,           label: 'SESIONES',  color: C.yellow },
          ].map(s => (
            <View key={s.label} style={{ flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 13, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 24, color: s.color, fontVariant: ['tabular-nums'] as any }}>{s.val}</Text>
              <Label style={{ marginTop: 6 }}>{s.label}</Label>
            </View>
          ))}
        </View>

        {/* PROGRAMA */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 14, alignItems: 'center' }}>
          <Label style={{ marginBottom: 10 }}>FASE DEL PROGRAMA</Label>
          <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textTertiary, textAlign: 'center', lineHeight: 19 }}>
            Sin programa asignado.{'\n'}Tu coach configurará tu plan aquí.
          </Text>
        </View>

        {/* LOGROS */}
        <Label style={{ marginBottom: 9 }}>LOGROS</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {ALL_BADGES.map((b, i) => (
            <View
              key={i}
              style={{
                width: '30.5%', backgroundColor: C.card,
                borderWidth: 1, borderColor: C.borderLight,
                padding: 13, alignItems: 'center', opacity: 0.4,
              }}
            >
              <Text style={{ fontSize: 20, lineHeight: 24 }}>{b.icon}</Text>
              <Label style={{ marginTop: 8, textAlign: 'center', lineHeight: 14 }}>{b.label}</Label>
            </View>
          ))}
        </View>

        {/* PR HISTORY */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginBottom: 14 }}>
          <View style={{ padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Label>HISTORIAL DE PRs</Label>
          </View>
          {prHistory.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary }}>
                Aún no tenés PRs registrados
              </Text>
            </View>
          ) : (
            prHistory.map((p, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, paddingHorizontal: 14, borderBottomWidth: i < prHistory.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.yellow, width: 14 }}>◆</Text>
                <Text style={{ flex: 1, fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{p.ej}</Text>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 15, color: C.textPrimary }}>{p.val}</Text>
              </View>
            ))
          )}
        </View>

        {/* HEATMAP */}
        <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Label>ENTRENOS · 12 SEM</Label>
            <Label>L M M J V S D</Label>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {HEAT_COLS.map((col, wi) => (
              <View key={wi} style={{ flex: 1, gap: 3 }}>
                {col.map((cell, di) => (
                  <View
                    key={di}
                    style={{
                      aspectRatio: 1,
                      backgroundColor: heatColor(cell),
                      borderWidth: 1, borderColor: heatBorder(cell),
                    }}
                  />
                ))}
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
            <Label>menos</Label>
            {[0, 1, 2, 3].map(v => (
              <View key={v} style={{ width: 11, height: 11, backgroundColor: heatColor(v), borderWidth: 1, borderColor: heatBorder(v) }} />
            ))}
            <Label>más</Label>
          </View>
        </View>

        {/* CUENTA */}
        <View style={{ marginTop: 8 }}>
          <Label style={{ marginBottom: 9 }}>CUENTA</Label>
          <TouchableOpacity
            onPress={signOut}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14, paddingHorizontal: 16 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.red }}>Cerrar sesión</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.red }}>→</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
