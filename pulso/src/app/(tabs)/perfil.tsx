import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GlowPulse, Label, PressableScale } from '@/components/ui/kit';
import { C, F } from '@/constants/colors';
import { useApp } from '@/context/app-state';
import { useSession } from '@/context/session';
import { ApiError } from '@/lib/api';
import { fetchUnread } from '@/lib/messages';
import { fetchTeam, redeemInvite, TeamMember } from '@/lib/team';
import { router } from 'expo-router';

const ALL_BADGES = [
  { key: 'first_pr',  icon: '⚡', label: 'PRIMER PR' },
  { key: 'streak_10', icon: '🔥', label: 'RACHA 10D' },
  { key: 'minus_3kg', icon: '▲',  label: '−3 KG' },
  { key: 'full_week', icon: '◆',  label: '100% SEM' },
  { key: 'squat_140', icon: '★',  label: '140 SQUAT' },
  { key: 'recomp',    icon: '◇',  label: 'RECOMP' },
];

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
    setMeta(p?.goalWeightKg != null ? String(p.goalWeightKg) : '');
    setEditing(true);
  }

  function save() {
    if (!nombre.trim()) return;
    saveProfile({
      fullName: nombre,
      sex: sexo,
      dateOfBirth: dob.trim() || null,
      heightCm: parseFloat(altura) || null,
      goalWeightKg: parseFloat(meta) || null,
    });
    setEditing(false);
  }

  const inputStyle = {
    backgroundColor: C.bgEl, borderWidth: 1, borderColor: C.border,
    padding: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14,
  } as const;

  if (editing) {
    return (
      <Animated.View entering={FadeIn.duration(220)} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.yellow, padding: 14, marginBottom: 14 }}>
        <Label style={{ color: C.yellow, marginBottom: 12 }}>EDITAR PERFIL</Label>

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
                  borderColor: sel ? C.yellow : C.border,
                  backgroundColor: sel ? `${C.yellow}22` : C.bgEl,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: 10, letterSpacing: 0.4, color: sel ? C.yellow : C.textSecondary }}>
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
            <Label style={{ marginBottom: 6 }}>META kg</Label>
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
          <PressableScale onPress={save} haptic="medium" style={{ flex: 1.5, padding: 12, backgroundColor: C.yellow, alignItems: 'center' }}>
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
    { k: 'PESO META',  v: p?.goalWeightKg != null ? `${p.goalWeightKg.toFixed(1)} kg` : '—' },
  ];

  return (
    <Card index={3} style={{ marginBottom: 14 }}>
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

const KIND_LABELS = { coach: 'ENTRENADOR', nutritionist: 'NUTRICIONISTA' } as const;

function TeamSection() {
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
    <Card index={4} style={{ marginBottom: 14 }}>
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
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.yellow, marginTop: 8 }}>
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

  const prHistory = state.prHistory;
  const totalPRs = prHistory.length;
  const earnedCount = Object.keys(state.earned).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16 }}>

        {/* USER HEADER */}
        <Animated.View entering={FadeInDown.duration(320)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <View style={{ width: 58, height: 58, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: 18, color: C.yellow }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.grotesk, fontSize: 23, color: C.textPrimary }}>{name}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary, marginTop: 6 }}>
              Atleta · {earnedCount}/{ALL_BADGES.length} logros
            </Text>
          </View>
        </Animated.View>

        {/* STATS ROW */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {[
            { val: state.racha,         label: 'RACHA d',  color: C.orange },
            { val: totalPRs,            label: 'PRs',      color: C.red },
            { val: state.sessionsCount, label: 'SESIONES', color: C.yellow },
          ].map((s, i) => (
            <Card key={s.label} index={i} style={{ flex: 1, padding: 13, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.monoXBold, fontSize: 24, color: s.color, fontVariant: ['tabular-nums'] as any }}>{s.val}</Text>
              <Label style={{ marginTop: 6 }}>{s.label}</Label>
            </Card>
          ))}
        </View>

        {/* MI PERFIL */}
        <ProfileSection />

        {/* EQUIPO */}
        <TeamSection />

        {/* PROGRAMA */}
        <Card index={5} style={{ padding: 16, marginBottom: 14, alignItems: 'center' }}>
          <Label style={{ marginBottom: 10 }}>FASE DEL PROGRAMA</Label>
          {state.exercises.length > 0 ? (
            <>
              <Text style={{ fontFamily: F.groteskMed, fontSize: 16, color: C.textPrimary }}>Plan personal · Full Body</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, marginTop: 6 }}>
                {state.exercises.length} EJERCICIOS · {state.sessionsCount} SESIONES COMPLETADAS
              </Text>
            </>
          ) : (
            <Text style={{ fontFamily: F.inter, fontSize: 13, color: C.textTertiary, textAlign: 'center', lineHeight: 19 }}>
              Sin plan de entreno.{'\n'}Armá el tuyo en la pestaña ENTRENO.
            </Text>
          )}
        </Card>

        {/* LOGROS */}
        <Label style={{ marginBottom: 9 }}>LOGROS</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {ALL_BADGES.map((b, i) => {
            const earnedAt = state.earned[b.key];
            const earned = earnedAt != null;
            const inner = (
              <>
                <Text style={{ fontSize: 20, lineHeight: 24 }}>{b.icon}</Text>
                <Label style={{ marginTop: 8, textAlign: 'center', lineHeight: 14, ...(earned ? { color: C.yellow } : {}) }}>{b.label}</Label>
                {earned && (
                  <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 4 }}>
                    {new Date(earnedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                  </Text>
                )}
              </>
            );
            return (
              <Animated.View
                key={b.key}
                entering={FadeInDown.duration(280).delay(i * 40).easing(Easing.out(Easing.cubic))}
                style={{ width: '30.5%' }}
              >
                {/* opacity lives on a plain child so the entering animation owns the Animated.View's */}
                <View style={{ opacity: earned ? 1 : 0.4 }}>
                  {earned ? (
                    // Unlocked badges glow with a slow golden pulse
                    <GlowPulse color={C.yellow} intensity={0.12} period={1400} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.yellow, padding: 13, alignItems: 'center' }}>
                      {inner}
                    </GlowPulse>
                  ) : (
                    <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.borderLight, padding: 13, alignItems: 'center' }}>
                      {inner}
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </View>

        {/* PR HISTORY */}
        <Card index={4} style={{ marginBottom: 14 }}>
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
              <Animated.View
                key={p.exerciseId}
                entering={FadeInDown.duration(250).delay(i * 40)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, paddingHorizontal: 14, borderBottomWidth: i < prHistory.length - 1 ? 1 : 0, borderBottomColor: C.borderLight }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.yellow, width: 14 }}>◆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }}>{p.nombre}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, marginTop: 2 }}>
                    ×{p.reps} · {p.achievedAt.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.monoXBold, fontSize: 15, color: C.textPrimary }}>{p.weightKg} kg</Text>
              </Animated.View>
            ))
          )}
        </Card>

        {/* HEATMAP */}
        <Card index={5} style={{ padding: 14, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Label>ENTRENOS · 12 SEM</Label>
            <Label>L M M J V S D</Label>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {state.heatmap.map((col, wi) => (
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
        </Card>

        {/* CUENTA */}
        <View style={{ marginTop: 8 }}>
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
