import { Image } from 'expo-image';

/**
 * PULSO's logo mark (runner + pulse line), transparent so it sits on either
 * theme. Rendered from assets/brand/pulso-mark.svg; the PNG is 3:2.
 */
export function BrandMark({ height = 32 }: { height?: number }) {
  return (
    <Image
      source={require('../../assets/brand/pulso-mark.png')}
      style={{ width: Math.round(height * 1.5), height }}
      contentFit="contain"
      accessibilityLabel="PULSO"
    />
  );
}
