import type { HealthProviderAdapter } from './types';

// Platforms without a health store (web). Metro picks provider.android.ts or
// provider.ios.ts on phones; TypeScript resolves this file for the shared type.
export const healthProvider: HealthProviderAdapter | null = null;
