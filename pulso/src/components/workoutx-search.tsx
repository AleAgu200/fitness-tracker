import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/kit';
import { C, F } from '@/constants/colors';
import { ApiError } from '@/lib/api';
import { searchWorkoutX, workoutXGifSource, WxSuggestion } from '@/lib/workoutx';

function WorkoutXResult({ suggestion, onSelect }: {
  suggestion: WxSuggestion;
  onSelect: (suggestion: WxSuggestion) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <PressableScale
      haptic="light"
      onPress={() => onSelect(suggestion)}
      style={{
        flexDirection: 'row',
        minHeight: 92,
        borderTopWidth: 1,
        borderTopColor: C.borderLight,
        backgroundColor: C.bgEl,
      }}
    >
      <View style={{ width: 92, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {suggestion.gifUrl && !imageFailed ? (
          <Image
            source={workoutXGifSource(suggestion.gifUrl)}
            style={{ width: 92, height: 92 }}
            contentFit="contain"
            autoplay
            cachePolicy="memory-disk"
            transition={150}
            recyclingKey={suggestion.id}
            accessibilityLabel={`Demostración de ${suggestion.name}`}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textTertiary }}>SIN GIF</Text>
        )}
      </View>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 5 }}>
        <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary, lineHeight: 18 }}>
          {suggestion.name}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
          {suggestion.muscleGroup} · {suggestion.localEquipment}
        </Text>
        <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.6, color: C.cyan }}>
          SELECCIONAR EJERCICIO
        </Text>
      </View>
    </PressableScale>
  );
}

function SelectedWorkoutXResult({ suggestion }: { suggestion: WxSuggestion }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{
        flexDirection: 'row',
        minHeight: 108,
        marginTop: -4,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: C.yellow,
        backgroundColor: 'rgba(232,255,89,0.05)',
        overflow: 'hidden',
      }}
    >
      <View style={{ width: 108, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
        {suggestion.gifUrl && !imageFailed ? (
          <Image
            source={workoutXGifSource(suggestion.gifUrl)}
            style={{ width: 108, height: 108 }}
            contentFit="contain"
            autoplay
            cachePolicy="memory-disk"
            transition={150}
            accessibilityLabel={`Demostración de ${suggestion.name}`}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={{ fontFamily: F.monoBold, fontSize: 10, color: C.textTertiary }}>SIN GIF</Text>
        )}
      </View>
      <View style={{ flex: 1, justifyContent: 'center', padding: 12, gap: 5 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 8, letterSpacing: 1, color: C.yellow }}>
          ✓ EJERCICIO SELECCIONADO
        </Text>
        <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary, lineHeight: 19 }}>
          {suggestion.name}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
          {suggestion.muscleGroup} · {suggestion.localEquipment}
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 10, color: C.textSecondary, lineHeight: 14 }}>
          Configurá series, repeticiones y peso abajo.
        </Text>
      </View>
    </Animated.View>
  );
}

export function WorkoutXSearch({ query, enabled, onSelect }: {
  query: string;
  enabled: boolean;
  onSelect: (suggestion: WxSuggestion) => void;
}) {
  const [results, setResults] = useState<WxSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [selected, setSelected] = useState<WxSuggestion | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!enabled || q.length < 2 || q === selected?.name) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      searchWorkoutX(q, controller.signal)
        .then(data => {
          setResults(data.slice(0, 5));
          setSearchedQuery(q);
        })
        .catch(cause => {
          if (controller.signal.aborted) return;
          setResults([]);
          setSearchedQuery(q);
          setError(cause instanceof ApiError && cause.status === 429
            ? 'Cuota mensual de WorkoutX agotada'
            : 'WorkoutX no está disponible ahora');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, q, selected?.name]);

  if (!enabled || q.length < 2) return null;
  if (selected && q === selected.name) {
    return <SelectedWorkoutXResult suggestion={selected} />;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={{ marginTop: -4, marginBottom: 10, borderWidth: 1, borderColor: C.cyan, backgroundColor: C.bgEl }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 1.2, color: C.cyan }}>
          RESULTADOS · WORKOUTX
        </Text>
        {loading && (
          <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary }}>BUSCANDO…</Text>
        )}
      </View>

      {!loading && error && (
        <Text selectable style={{ padding: 10, borderTopWidth: 1, borderTopColor: C.borderLight, fontFamily: F.inter, fontSize: 12, color: C.red }}>
          {error}
        </Text>
      )}

      {!loading && !error && searchedQuery === q && results.length === 0 && (
        <Text style={{ padding: 10, borderTopWidth: 1, borderTopColor: C.borderLight, fontFamily: F.inter, fontSize: 12, color: C.textSecondary }}>
          No encontramos ejercicios con “{q}”.
        </Text>
      )}

      {results.map(result => (
        <WorkoutXResult
          key={result.id}
          suggestion={result}
          onSelect={suggestion => {
            setSelected(suggestion);
            setResults([]);
            onSelect(suggestion);
          }}
        />
      ))}
    </Animated.View>
  );
}
