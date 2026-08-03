import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Text } from 'react-native';

import { PressableScale } from '@/components/ui/kit';
import { C, F } from '@/constants/colors';

function timeStringToDate(value: string): Date {
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hour || 0, minute || 0, 0, 0);
  return date;
}

function dateToTimeString(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * Native time-of-day picker. iOS renders an always-inline compact pill (the
 * platform's own tap-to-expand wheel). Android's DateTimePicker only supports
 * a dialog that opens the instant it mounts, so there we show a small chip
 * and mount the dialog on demand, unmounting on selection/dismiss.
 */
export function TimePickerField({ value, onChange, accentColor = C.yellow }: {
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const date = timeStringToDate(value);

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={date}
        mode="time"
        display="compact"
        accentColor={accentColor}
        themeVariant="dark"
        onValueChange={(_, newDate) => onChange(dateToTimeString(newDate))}
      />
    );
  }

  return (
    <>
      <PressableScale
        onPress={() => setPickerOpen(true)}
        style={{
          width: 78,
          height: 38,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.bgEl,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: F.monoBold, fontSize: 13, color: C.textPrimary }}>{value}</Text>
      </PressableScale>
      {pickerOpen && (
        <DateTimePicker
          value={date}
          mode="time"
          presentation="dialog"
          accentColor={accentColor}
          onValueChange={(_, newDate) => {
            setPickerOpen(false);
            onChange(dateToTimeString(newDate));
          }}
          onDismiss={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
