import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Label, PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { ApiError } from '@/lib/api';
import { fetchUnread } from '@/lib/messages';
import { fetchTeam, redeemInvite, TeamMember } from '@/lib/team';

const KIND_LABELS = { coach: 'ENTRENADOR', nutritionist: 'NUTRICIONISTA' } as const;

function TeamSection() {
  const { accent } = usePreferences();
  const C = useColors();
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [offline, setOffline] = useState(false);
  const [code, setCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeam(await fetchTeam());
      setOffline(false);
      try {
        setUnread((await fetchUnread()).bySender);
      } catch {
        // unread badge is best-effort
      }
    } catch {
      setOffline(true);
      setTeam([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function link() {
    if (code.trim().length < 4 || linking) return;
    setLinking(true);
    setError(null);
    setJustLinked(null);
    try {
      const res = await redeemInvite(code);
      setCode('');
      setJustLinked(`${KIND_LABELS[res.kind]}: ${res.professionalName}`);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'invalid_code') setError('Código inválido o ya usado');
      else if (e instanceof ApiError && e.code === 'already_linked') setError('Ya tenés un profesional de ese tipo vinculado');
      else setError('No se pudo conectar con el servidor');
    } finally {
      setLinking(false);
    }
  }

  const coach = team?.find(t => t.kind === 'coach');
  const nutri = team?.find(t => t.kind === 'nutritionist');
  const missingAny = team != null && (!coach || !nutri);

  return (
    <Card index={0} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Label>EQUIPO · SUPERVISIÓN</Label>
        {offline && <Label style={{ color: C.orange }}>SIN CONEXIÓN</Label>}
      </View>

      {team == null ? (
        <View style={{ padding: 18, alignItems: 'center' }}>
          <ActivityIndicator color={C.textTertiary} size="small" />
        </View>
      ) : (
        <>
          {([['coach', coach], ['nutritionist', nutri]] as const).map(([kind, member]) => {
            const unreadCount = member ? unread[member.userId] ?? 0 : 0;
            const row = (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.borderLight }}>
                <View style={{ width: 34, height: 34, backgroundColor: C.bgEl, borderWidth: 1, borderColor: member ? C.cyan : C.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: member ? C.cyan : C.textTertiary }}>
                    {kind === 'coach' ? '◆' : '✚'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Label>{KIND_LABELS[kind]}</Label>
                  <Text style={{ fontFamily: F.interMed, fontSize: 13, color: member ? C.textPrimary : C.textTertiary, marginTop: 3 }}>
                    {member ? member.name : 'Sin vincular'}
                  </Text>
                </View>
                {member && unreadCount > 0 && (
                  <View style={{ backgroundColor: C.red, borderRadius: 9, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textPrimary }}>{unreadCount}</Text>
                  </View>
                )}
                {member && (
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.cyan }}>CHAT →</Text>
                )}
              </View>
            );
            return member ? (
              <PressableScale
                key={kind}
                haptic="light"
                onPress={() => router.push({ pathname: '/mensajes', params: { with: member.userId } } as any)}
              >
                {row}
              </PressableScale>
            ) : (
              <View key={kind}>{row}</View>
            );
          })}

          {missingAny && !offline && (
            <View style={{ padding: 12, paddingHorizontal: 14 }}>
              <Label style={{ marginBottom: 8 }}>¿TENÉS UN CÓDIGO DE INVITACIÓN?</Label>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={code}
                  onChangeText={t => { setCode(t.toUpperCase()); setError(null); }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  placeholder="ABC123"
                  placeholderTextColor={C.textTertiary}
                  style={{
                    flex: 1, backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border,
                    height: 48, paddingHorizontal: 10, color: C.textPrimary, fontFamily: F.monoBold, fontSize: 15,
                    letterSpacing: 3, textAlign: 'center',
                  }}
                />
                <PressableScale
                  onPress={link}
                  haptic="medium"
                  disabled={linking || code.trim().length < 4}
                  style={{ backgroundColor: C.cyan, paddingHorizontal: 20, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
                >
                  {linking
                    ? <ActivityIndicator color={C.bg} size="small" />
                    : <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.bg }}>VINCULAR</Text>}
                </PressableScale>
              </View>
              {error && (
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.red, marginTop: 8 }}>{error}</Text>
              )}
              {justLinked && (
                <Animated.View entering={FadeIn.duration(250)}>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: accent, marginTop: 8 }}>
                    ✓ Vinculado — {justLinked}
                  </Text>
                </Animated.View>
              )}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

export default function EquipoScreen() {
  const C = useColors();
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
            <Label>SUPERVISIÓN</Label>
            <Text style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary, marginTop: 3 }}>Equipo</Text>
          </View>
        </View>

        <TeamSection />
      </View>
    </ScrollView>
  );
}
