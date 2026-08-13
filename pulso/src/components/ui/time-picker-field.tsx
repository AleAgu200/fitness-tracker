import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Text, useColorScheme } from 'react-native';

import { PressableScale } from '@/components/ui/kit';
import { BRAND, F, useColors } from '@/constants/colors';

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
 * Native time-of-day picker — hour + minute + AM/PM, never 24h/military
 * (`is24Hour={false}`, forced regardless of the device's system setting).
 * iOS renders an always-inline compact pill (tap to expand the wheel). Android's
 * DateTimePicker only supports a dialog, so there we show a small chip and mount
 * a "spinner" dialog on demand (the 3-column hour/minute/AM-PM wheel, not the
 * circular clock face) — same one shown in the OS alarm app.
 */
export function TimePickerField({ value, onChange, accentColor = BRAND.yellow }: {
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
}) {
  const C = useColors();
  const scheme = useColorScheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const date = timeStringToDate(value);

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={date}
        mode="time"
        display="compact"
        is24Hour={false}
        accentColor={accentColor}
        themeVariant={scheme === 'light' ? 'light' : 'dark'}
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
          display="spinner"
          presentation="dialog"
          is24Hour={false}
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
