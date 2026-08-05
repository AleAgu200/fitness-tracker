import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Label, PressableScale } from '@/components/ui/kit';
import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';
import { FoodResult, PickedFood, searchFoods, totalsFor } from '@/lib/foods';

const DEFAULT_GRAMS = 100;
const SEARCH_DEBOUNCE_MS = 450;

function SearchResultRow({ food, onSelect }: {
  food: FoodResult;
  onSelect: (food: FoodResult) => void;
}) {
  const C = useColors();

  return (
    <PressableScale
      haptic="light"
      onPress={() => onSelect(food)}
      style={{
        borderTopWidth: 1,
        borderTopColor: C.borderLight,
        backgroundColor: C.bgEl,
        paddingHorizontal: 11,
        paddingVertical: 9,
        gap: 3,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontFamily: F.interSemi, fontSize: 13, color: C.textPrimary }} numberOfLines={2}>
          {food.name}
        </Text>
        {/* USDA entries are mostly English and less curated, so say where the
            numbers come from rather than presenting them as PULSO's own. */}
        <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 0.8, color: food.source === 'pulso' ? C.cyan : C.textTertiary }}>
          {food.source === 'pulso' ? 'PULSO' : 'USDA'}
        </Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.textTertiary }}>
        por 100 g · {Math.round(food.kcal)} kcal · P {food.proteinG}g · C {food.carbsG}g · G {food.fatG}g
      </Text>
    </PressableScale>
  );
}

function PickedRow({ item, onChangeGrams, onRemove }: {
  item: PickedFood;
  onChangeGrams: (grams: number) => void;
  onRemove: () => void;
}) {
  const C = useColors();
  const { accent } = usePreferences();

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 7,
        borderTopWidth: 1,
        borderTopColor: C.borderLight,
      }}
    >
      <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 12, color: C.textPrimary }} numberOfLines={2}>
        {item.food.name}
      </Text>
      {/* Derived straight from the prop rather than mirrored into local state:
          re-picking a food bumps its weight from outside this row, and a local
          copy would keep showing the old number. Empty renders as empty so the
          field can be cleared and retyped. */}
      <TextInput
        keyboardType="numeric"
        value={item.grams === 0 ? '' : String(item.grams)}
        onChangeText={value =>
          onChangeGrams(Math.max(0, parseInt(value.replace(/[^0-9]/g, '').slice(0, 4), 10) || 0))
        }
        accessibilityLabel={`Gramos de ${item.food.name}`}
        style={{
          width: 58,
          backgroundColor: C.bgEl,
          borderWidth: 1,
          borderColor: C.border,
          paddingVertical: 6,
          paddingHorizontal: 6,
          color: C.textPrimary,
          fontFamily: F.monoBold,
          fontSize: 13,
          textAlign: 'center',
        }}
      />
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.textTertiary, width: 14 }}>g</Text>
      <PressableScale
        haptic="medium"
        onPress={onRemove}
        accessibilityLabel={`Quitar ${item.food.name}`}
        style={{ paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: C.border, backgroundColor: withAlpha(accent, 0.05) }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>✕</Text>
      </PressableScale>
    </Animated.View>
  );
}

/** Search the catalog and build a meal out of foods and weights, so the athlete
 *  never types kcal/protein/carbs/fat by hand. The parent owns the picked list
 *  and derives the meal's description and totals from it. */
export function FoodPicker({ items, onChange }: {
  items: PickedFood[];
  onChange: (items: PickedFood[]) => void;
}) {
  const C = useColors();
  const { accent } = usePreferences();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const q = query.trim();

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      searchFoods(q, controller.signal)
        .then(data => {
          setResults(data);
          setSearchedQuery(q);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setSearchedQuery(q);
          setError('No pudimos buscar alimentos. Podés escribir los valores a mano abajo.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const totals = totalsFor(items);

  return (
    <View style={{ marginBottom: 13 }}>
      <Label style={{ marginBottom: 6 }}>ALIMENTOS</Label>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscá: pollo, frijol, tortilla…"
        placeholderTextColor={C.textTertiary}
        autoCorrect={false}
        style={{
          backgroundColor: C.bgEl,
          borderWidth: 1,
          borderColor: C.border,
          padding: 10,
          color: C.textPrimary,
          fontFamily: F.inter,
          fontSize: 14,
        }}
      />

      {q.length >= 2 && (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={{ borderWidth: 1, borderTopWidth: 0, borderColor: C.cyan, backgroundColor: C.bgEl }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 1.2, color: C.cyan }}>
              CATÁLOGO
            </Text>
            {loading && <Text style={{ fontFamily: F.mono, fontSize: 8, color: C.textTertiary }}>BUSCANDO…</Text>}
          </View>

          {!loading && error && (
            <Text style={{ padding: 10, borderTopWidth: 1, borderTopColor: C.borderLight, fontFamily: F.inter, fontSize: 12, color: C.red }}>
              {error}
            </Text>
          )}

          {!loading && !error && searchedQuery === q && results.length === 0 && (
            <Text style={{ padding: 10, borderTopWidth: 1, borderTopColor: C.borderLight, fontFamily: F.inter, fontSize: 12, color: C.textSecondary }}>
              No encontramos alimentos con “{q}”.
            </Text>
          )}

          {results.map(food => (
            <SearchResultRow
              key={`${food.source}:${food.id}`}
              food={food}
              onSelect={selected => {
                setQuery('');
                setResults([]);
                // Re-picking a food already in the meal adds to its weight
                // rather than creating a duplicate row.
                const existing = items.findIndex(
                  i => i.food.id === selected.id && i.food.source === selected.source,
                );
                if (existing >= 0) {
                  onChange(items.map((item, index) =>
                    index === existing ? { ...item, grams: item.grams + DEFAULT_GRAMS } : item,
                  ));
                } else {
                  onChange([...items, { food: selected, grams: DEFAULT_GRAMS }]);
                }
              }}
            />
          ))}
        </Animated.View>
      )}

      {items.length > 0 && (
        <Animated.View layout={LinearTransition.duration(200)} style={{ marginTop: 10 }}>
          {items.map((item, index) => (
            <PickedRow
              key={`${item.food.source}:${item.food.id}`}
              item={item}
              onChangeGrams={grams =>
                onChange(items.map((other, i) => (i === index ? { ...other, grams } : other)))
              }
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
          ))}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 9,
              padding: 9,
              borderWidth: 1,
              borderColor: accent,
              backgroundColor: withAlpha(accent, 0.05),
            }}
          >
            <Text style={{ fontFamily: F.monoBold, fontSize: 11, color: accent }}>
              {totals.kcal} KCAL
            </Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.textSecondary }}>
              P {totals.p}g · C {totals.c}g · G {totals.g}g
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
