import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { ExerciseAnimationModal } from '@/components/exercise-animation-modal';
import { PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { CatalogSuggestion, catalogMediaUrl, searchExerciseCatalog } from '@/lib/exercise-catalog';

function CatalogResult({ suggestion, index, onPreview }: {
  suggestion: CatalogSuggestion;
  index: number;
  onPreview: (suggestion: CatalogSuggestion) => void;
}) {
  const C = useColors();
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Animated.View entering={FadeInDown.duration(180).delay(index * 35).easing(Easing.out(Easing.cubic)).reduceMotion(ReduceMotion.System)}>
      <PressableScale
        haptic="light"
        onPress={() => onPreview(suggestion)}
        accessibilityLabel={`Ver demostración e instrucciones de ${suggestion.name}`}
        style={{
          flexDirection: 'row',
          minHeight: 98,
          borderTopWidth: 1,
          borderTopColor: C.borderLight,
          backgroundColor: C.bgEl,
        }}
      >
        <View style={{ width: 98, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {!imageFailed ? (
            <Image
              source={{ uri: catalogMediaUrl(suggestion.gifPath) }}
              style={{ width: 98, height: 98 }}
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
          <Text style={{ fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary, lineHeight: 18 }} numberOfLines={2}>
            {suggestion.name}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textTransform: 'uppercase' }} numberOfLines={1}>
            {suggestion.muscleGroup} · {suggestion.equipment}
          </Text>
          <Text style={{ fontFamily: F.monoBold, fontSize: 8, letterSpacing: 0.5, color: C.cyan }}>
            VER GIF + INSTRUCCIONES  →
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

function SelectedCatalogResult({ suggestion, onPreview }: {
  suggestion: CatalogSuggestion;
  onPreview: () => void;
}) {
  const { accent } = usePreferences();
  const C = useColors();
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Animated.View
      entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
      style={{
        flexDirection: 'row',
        minHeight: 116,
        marginTop: -4,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: withAlpha(accent, 0.05),
        overflow: 'hidden',
      }}
    >
      <PressableScale
        haptic="light"
        onPress={onPreview}
        accessibilityLabel={`Ver la guía de ${suggestion.name}`}
        style={{ width: 116, minHeight: 116, backgroundColor: C.bgEl, alignItems: 'center', justifyContent: 'center' }}
      >
        {!imageFailed ? (
          <Image
            source={{ uri: catalogMediaUrl(suggestion.gifPath) }}
            style={{ width: 116, height: 116 }}
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
      </PressableScale>
      <View style={{ flex: 1, justifyContent: 'center', padding: 12, gap: 5 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: 8, letterSpacing: 1, color: accent }}>
          ✓ EJERCICIO SELECCIONADO
        </Text>
        <Text style={{ fontFamily: F.interSemi, fontSize: 14, color: C.textPrimary, lineHeight: 19 }} numberOfLines={2}>
          {suggestion.name}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary, textTransform: 'uppercase' }} numberOfLines={1}>
          {suggestion.muscleGroup} · {suggestion.equipment}
        </Text>
        <PressableScale
          haptic="light"
          onPress={onPreview}
          accessibilityLabel={`Volver a ver la guía de ${suggestion.name}`}
          style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: C.cyan, paddingHorizontal: 9, paddingVertical: 6, marginTop: 2 }}
        >
          <Text style={{ fontFamily: F.monoBold, fontSize: 8, letterSpacing: 0.5, color: C.cyan }}>
            ▶  VER CÓMO SE HACE
          </Text>
        </PressableScale>
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
  const [preview, setPreview] = useState<CatalogSuggestion | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (!enabled || q.length < 2 || q === selected?.name) {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
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

  const visibleResults = searchedQuery === q ? results : [];

  if (!enabled || q.length < 2) return null;
  if (selected && q === selected.name) {
    return (
      <>
        <SelectedCatalogResult suggestion={selected} onPreview={() => setPreview(selected)} />
        {preview && (
          <ExerciseAnimationModal
            nombre={preview.name}
            gifPath={preview.gifPath}
            instructions={preview.instructions}
            muscleGroup={preview.muscleGroup}
            equipment={preview.equipment}
            onClose={() => setPreview(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}
        style={{ marginTop: -4, marginBottom: 10, borderWidth: 1, borderColor: C.cyan, backgroundColor: C.bgEl }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 1.2, color: C.cyan }}>
            RESULTADOS · TOCÁ PARA APRENDER
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

        {visibleResults.map((result, index) => (
          <CatalogResult key={result.id} suggestion={result} index={index} onPreview={setPreview} />
        ))}
      </Animated.View>

      {preview && (
        <ExerciseAnimationModal
          nombre={preview.name}
          gifPath={preview.gifPath}
          instructions={preview.instructions}
          muscleGroup={preview.muscleGroup}
          equipment={preview.equipment}
          onClose={() => setPreview(null)}
          onSelect={() => {
            setSelected(preview);
            setResults([]);
            onSelect(preview);
            setPreview(null);
          }}
        />
      )}
    </>
  );
}
