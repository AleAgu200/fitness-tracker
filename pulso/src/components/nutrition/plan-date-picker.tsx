import { ScrollView, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/kit';
import { F, useColors } from '@/constants/colors';
import { addDays, dateStr, todayStr, WEEKDAY_LABELS, weekdayOf } from '@/lib/dates';

export interface PlanTarget {
  date: string;
  repeatWeekly: boolean;
}

const DAYS_AHEAD = 14;

function parseDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

/** "HOY", "MAÑANA", "LUN 6". */
export function shortDateLabel(date: string): string {
  if (date === todayStr()) return 'HOY';
  if (date === dateStr(addDays(new Date(), 1))) return 'MAÑANA';
  const d = parseDate(date);
  return `${WEEKDAY_LABELS[weekdayOf(d)]} ${d.getDate()}`;
}

/** Where a planned food goes: this concrete date, or every week on its weekday. */
export function describePlanTarget(target: PlanTarget): string {
  const weekday = WEEKDAY_LABELS[weekdayOf(parseDate(target.date))].toLowerCase();
  return target.repeatWeekly ? `todos los ${weekday}` : shortDateLabel(target.date).toLowerCase();
}

/**
 * Picks a date in the next two weeks and, separately, whether it repeats every
 * week. A date alone never changes the usual week.
 */
export function PlanDatePicker({ value, onChange, accent }: {
  value: PlanTarget;
  onChange: (value: PlanTarget) => void;
  accent: string;
}) {
  const C = useColors();
  const dates = Array.from({ length: DAYS_AHEAD }, (_, i) => dateStr(addDays(new Date(), i)));
  const weekday = WEEKDAY_LABELS[weekdayOf(parseDate(value.date))].toLowerCase();

  return (
    <View style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel="Fecha" contentContainerStyle={{ gap: 6 }}>
        {dates.map(date => {
          const selected = date === value.date;
          return (
            <PressableScale
              key={date}
              onPress={() => onChange({ ...value, date })}
              selected={selected}
              accessibilityRole="radio"
              accessibilityLabel={parseDate(date).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })}
              style={{
                minHeight: 40, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1,
                borderColor: selected ? accent : C.border,
                backgroundColor: selected ? `${accent}1A` : 'transparent',
              }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.6, color: selected ? C.textPrimary : C.textSecondary }}>{shortDateLabel(date)}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <PressableScale
        onPress={() => onChange({ ...value, repeatWeekly: !value.repeatWeekly })}
        accessibilityRole="checkbox"
        selected={value.repeatWeekly}
        style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 40 }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: value.repeatWeekly ? accent : C.textTertiary }}>{value.repeatWeekly ? '■' : '□'}</Text>
        <Text style={{ flex: 1, fontFamily: F.inter, fontSize: 13, color: C.textSecondary }}>
          {`Repetir todos los ${weekday} (semana habitual)`}
        </Text>
      </PressableScale>
    </View>
  );
}
