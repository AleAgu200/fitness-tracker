import { getRandomBytes } from 'expo-crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export function nanoid(size = 21): string {
  // Hermes has no global `crypto` — use expo-crypto's native RNG
  const bytes = getRandomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) {
    id += ALPHABET[bytes[i] & 63];
  }
  return id;
}
