import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Label, PressableScale } from '@/components/ui/kit';
import { C, F, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { useSession } from '@/context/session';
import { ChatMessage, fetchMessages, markConversationRead, sendChatMessage } from '@/lib/messages';
import { fetchTeam, TeamMember } from '@/lib/team';

const KIND_LABELS = { coach: 'ENTRENADOR', nutritionist: 'NUTRICIONISTA' } as const;

export default function MensajesScreen() {
  const insets = useSafeAreaInsets();
  const { accent } = usePreferences();
  const { userId } = useSession();
  const params = useLocalSearchParams<{ with?: string }>();

  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [active, setActive] = useState<TeamMember | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const lastRef = useRef(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Load team and preselect conversation
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await fetchTeam();
        if (cancelled) return;
        setTeam(t);
        setActive(t.find(m => m.userId === params.with) ?? t[0] ?? null);
      } catch {
        if (!cancelled) { setTeam([]); setOffline(true); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poll = useCallback(async (withId: string) => {
    try {
      const incoming = await fetchMessages(withId, lastRef.current);
      if (incoming.length) {
        setMessages(m => {
          const seen = new Set(m.map(x => x.id));
          return [...m, ...incoming.filter(x => !seen.has(x.id))];
        });
        lastRef.current = Math.max(lastRef.current, ...incoming.map(m => m.sentAt));
        markConversationRead(withId).catch(() => {});
      }
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  // Poll the active conversation while the screen is open
  useEffect(() => {
    if (!active) return;
    setMessages([]);
    lastRef.current = 0;
    poll(active.userId);
    const t = setInterval(() => poll(active.userId), 4000);
    return () => clearInterval(t);
  }, [active, poll]);

  async function send() {
    const content = draft.trim();
    if (!content || !active || sending) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await sendChatMessage(active.userId, content);
      setMessages(m => (m.some(x => x.id === msg.id) ? m : [...m, msg]));
      lastRef.current = Math.max(lastRef.current, msg.sentAt);
    } catch {
      setDraft(content);
      setOffline(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PressableScale onPress={() => router.back()} style={{ width: 34, height: 34, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.mono, fontSize: 15, color: C.textPrimary }}>←</Text>
        </PressableScale>
        <View style={{ flex: 1 }}>
          <Label>MENSAJES</Label>
          <Text style={{ fontFamily: F.grotesk, fontSize: 19, color: C.textPrimary, marginTop: 3 }}>
            {active ? active.name : 'Sin conversaciones'}
          </Text>
        </View>
        {offline && <Label style={{ color: C.orange }}>SIN CONEXIÓN</Label>}
      </View>

      {/* Conversation switcher when both professionals are linked */}
      {team != null && team.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 6, padding: 10, paddingHorizontal: 16 }}>
          {team.map(m => {
            const sel = active?.userId === m.userId;
            return (
              <PressableScale
                key={m.userId}
                onPress={() => setActive(m)}
                style={{
                  flex: 1, padding: 8, borderWidth: 1,
                  borderColor: sel ? C.cyan : C.border,
                  backgroundColor: sel ? 'rgba(61,220,255,0.08)' : C.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: sel ? C.cyan : C.textSecondary }}>
                  {KIND_LABELS[m.kind]}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      )}

      {/* Messages */}
      {team == null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.textTertiary} />
        </View>
      ) : !active ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary, textAlign: 'center', lineHeight: 18 }}>
            Todavía no tenés un profesional vinculado.{'\n'}Ingresá un código en PERFIL → EQUIPO.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1, justifyContent: messages.length ? 'flex-end' : 'center' }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textTertiary, textAlign: 'center' }}>
              Sin mensajes todavía — escribí el primero
            </Text>
          }
          renderItem={({ item }) => {
            const mine = item.senderId === userId;
            return (
              <Animated.View
                entering={FadeInDown.duration(220).easing(Easing.out(Easing.cubic))}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '78%',
                  backgroundColor: mine ? withAlpha(accent, 0.10) : C.card,
                  borderWidth: 1,
                  borderColor: mine ? accent : C.border,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ fontFamily: F.inter, fontSize: 14, color: C.textPrimary, lineHeight: 20 }}>
                  {item.content}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary, marginTop: 4, textAlign: 'right' }}>
                  {new Date(item.sentAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Animated.View>
            );
          }}
        />
      )}

      {/* Composer */}
      {active && (
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: C.border }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Escribí un mensaje…"
            placeholderTextColor={C.textTertiary}
            multiline
            style={{
              flex: 1, maxHeight: 110, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
              paddingHorizontal: 12, paddingVertical: 10, color: C.textPrimary, fontFamily: F.inter, fontSize: 14,
            }}
          />
          <PressableScale
            onPress={send}
            haptic="light"
            disabled={sending || !draft.trim()}
            style={{ backgroundColor: C.cyan, paddingHorizontal: 20, minHeight: 46, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' }}
          >
            {sending
              ? <ActivityIndicator color={C.bg} size="small" />
              : <Text style={{ fontFamily: F.monoXBold, fontSize: 12, letterSpacing: 0.8, color: C.bg }}>ENVIAR</Text>}
          </PressableScale>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
