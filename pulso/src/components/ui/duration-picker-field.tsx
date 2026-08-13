import { Picker } from '@expo/ui/community/picker';

/** "45 min" below an hour, "1:15" / "1:30" once it crosses into hours. */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/**
 * Native picker (iOS wheel / Android dropdown) for a duration in fixed steps —
 * there's no cross-platform native "countdown" clock mode, so this offers a
 * discrete list of durations instead, same idea as the reloj nativo elsewhere.
 */
export function DurationPickerField({ value, onChange, min, max, step = 15 }: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const options: number[] = [];
  for (let m = min; m <= max; m += step) options.push(m);

  return (
    <Picker
      selectedValue={value}
      onValueChange={next => onChange(Number(next))}
      style={{ width: '100%' }}
    >
      {options.map(m => (
        <Picker.Item key={m} label={formatDuration(m)} value={m} />
      ))}
    </Picker>
  );
}
