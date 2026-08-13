import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { CatalogSuggestion, catalogMediaUrl, searchExerciseCatalog } from '@/lib/exercise-catalog';

function CatalogResult({ suggestion, onSelect }: {
  suggestion: CatalogSuggestion;
  onSelect: (suggestion: CatalogSuggestion) => void;
}) {
  const C = useColors();
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
        {!imageFailed ? (
          <Image
            source={{ uri: catalogMediaUrl(suggestion.gifPath) }}
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
          {suggestion.muscleGroup} · {suggestion.equipment}
        </Text>
        <Text style={{ fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.6, color: C.cyan }}>
          SELECCIONAR EJERCICIO
        </Text>
      </View>
    </PressableScale>
  );
}

function SelectedCatalogResult({ suggestion }: { suggestion: CatalogSuggestion }) {
  const { accent } = usePreferences();
  const C = useColors();
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
        borderColor: accent,
        backgroundColor: withAlpha(accent, 0.05),
        overflow: 'hidden',
      }}
    >
      <View style={{ width: 108, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}>
        {!imageFailed ? (
          <Image
            source={{ uri: catalogMediaUrl(suggestion.gifPath) }}
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
        <Text style={{ fontFamily: F.monoBold, fontSize: 8, letterSpacing: 1, color: accent }}>
          ✓ EJERCICIO SELECCIONADO
        </Text>
        <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary, lineHeight: 19 }}>
          {suggestion.name}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
          {suggestion.muscleGroup} · {suggestion.equipment}
        </Text>
        <Text style={{ fontFamily: F.inter, fontSize: 10, color: C.textSecondary, lineHeight: 14 }}>
          Configurá series, repeticiones y peso abajo.
        </Text>
      </View>
    </Animated.View>
  );
}

export function ExerciseCatalogSearch({ query, enabled, onSelect }: {
  query: string;
  enabled: boolean;
  onSelect: (suggestion: CatalogSuggestion) => void;
}) {
  const C = useColors();
  const [results, setResults] = useState<CatalogSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [selected, setSelected] = useState<CatalogSuggestion | null>(null);
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
      searchExerciseCatalog(q, controller.signal)
        .then(data => {
          setResults(data.slice(0, 5));
          setSearchedQuery(q);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setSearchedQuery(q);
          setError('No se pudo buscar en el catálogo de ejercicios');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, q, selected?.name]);

  if (!enabled || q.length < 2) return null;
  if (selected && q === selected.name) {
    return <SelectedCatalogResult suggestion={selected} />;
  }

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={{ marginTop: -4, marginBottom: 10, borderWidth: 1, borderColor: C.cyan, backgroundColor: C.bgEl }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 1.2, color: C.cyan }}>
          RESULTADOS · CATÁLOGO
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
        <CatalogResult
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
