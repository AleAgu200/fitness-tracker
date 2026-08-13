import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { F, useColors, withAlpha } from '@/constants/colors';
import { usePreferences } from '@/context/preferences';

import { PressableScale } from './kit';
import { TimePickerField } from './time-picker-field';

export interface ChipOption {
  label: string;
  value: string;
}

export interface ChipSelectProps {
  options: readonly ChipOption[];
  selected: string | string[];
  onChange: (next: string | string[]) => void;
  multi?: boolean;
}

export function ChipSelect({ options, selected, onChange, multi = false }: ChipSelectProps) {
  const C = useColors();
  const { accent } = usePreferences();
  const selectedValues = Array.isArray(selected) ? selected : selected ? [selected] : [];

  function toggle(value: string) {
    if (!multi) {
      onChange(value);
      return;
    }

    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter(item => item !== value)
        : [...selectedValues, value],
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map(option => {
        const isSelected = selectedValues.includes(option.value);
        return (
          <PressableScale
            key={option.value}
            onPress={() => toggle(option.value)}
            style={{
              minHeight: 40,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: isSelected ? accent : C.border,
              backgroundColor: isSelected ? withAlpha(accent, 0.13) : C.bgEl,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: isSelected ? accent : C.textSecondary,
                fontFamily: F.monoBold,
                fontSize: 10,
                letterSpacing: 0.35,
                textTransform: 'uppercase',
              }}
            >
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export interface FreeTextChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  maxLength?: number;
}

/** A compact chip editor for free-form lists such as allergies or injuries. */
export function FreeTextChipInput({
  value,
  onChange,
  placeholder = 'Escribí y agregá',
  addLabel = 'AGREGAR',
  maxLength = 80,
}: FreeTextChipInputProps) {
  const C = useColors();
  const { accent } = usePreferences();
  const [draft, setDraft] = useState('');

  function addDraft() {
    const nextItem = draft.trim();
    if (!nextItem) return;
    const alreadyExists = value.some(
      item => item.trim().toLocaleLowerCase('es') === nextItem.toLocaleLowerCase('es'),
    );
    if (!alreadyExists) onChange([...value, nextItem]);
    setDraft('');
  }

  function removeItem(index: number) {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <View style={{ gap: 10 }}>
      {value.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {value.map((item, index) => (
            <PressableScale
              key={`${item}-${index}`}
              onPress={() => removeItem(index)}
              style={{
                minHeight: 36,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: accent,
                backgroundColor: withAlpha(accent, 0.13),
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Text style={{ color: accent, fontFamily: F.interMed, fontSize: 12 }}>{item}</Text>
              <Text style={{ color: accent, fontFamily: F.monoBold, fontSize: 13 }}>×</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addDraft}
          placeholder={placeholder}
          placeholderTextColor={C.textTertiary}
          returnKeyType="done"
          blurOnSubmit={false}
          maxLength={maxLength}
          style={{
            flex: 1,
            minHeight: 44,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: C.border,
            paddingHorizontal: 13,
            paddingVertical: 10,
            color: C.textPrimary,
            fontFamily: F.inter,
            fontSize: 14,
          }}
        />
        <PressableScale
          onPress={addDraft}
          disabled={!draft.trim()}
          style={{
            minWidth: 88,
            minHeight: 44,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: draft.trim() ? accent : C.border,
            backgroundColor: draft.trim() ? withAlpha(accent, 0.13) : C.bgEl,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: draft.trim() ? accent : C.textTertiary,
              fontFamily: F.monoBold,
              fontSize: 9,
              letterSpacing: 0.6,
            }}
          >
            {addLabel}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

export interface TimeChipInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  addLabel?: string;
}

/** Same chip list as FreeTextChipInput, but the "add" control is the native
 *  time picker instead of a text field — for lists of times of day. */
export function TimeChipInput({ value, onChange, addLabel = 'AGREGAR' }: TimeChipInputProps) {
  const { accent } = usePreferences();
  const [draft, setDraft] = useState('07:00');

  function addDraft() {
    const alreadyExists = value.includes(draft);
    if (!alreadyExists) onChange([...value, draft]);
  }

  function removeItem(index: number) {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <View style={{ gap: 10 }}>
      {value.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {value.map((item, index) => (
            <PressableScale
              key={`${item}-${index}`}
              onPress={() => removeItem(index)}
              style={{
                minHeight: 36,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: accent,
                backgroundColor: withAlpha(accent, 0.13),
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Text style={{ color: accent, fontFamily: F.interMed, fontSize: 12 }}>{item}</Text>
              <Text style={{ color: accent, fontFamily: F.monoBold, fontSize: 13 }}>×</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TimePickerField value={draft} onChange={setDraft} accentColor={accent} />
        <PressableScale
          onPress={addDraft}
          style={{
            minWidth: 88,
            minHeight: 44,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: accent,
            backgroundColor: withAlpha(accent, 0.13),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: accent, fontFamily: F.monoBold, fontSize: 9, letterSpacing: 0.6 }}>
            {addLabel}
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}
