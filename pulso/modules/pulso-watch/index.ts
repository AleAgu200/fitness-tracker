import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NativeModule = typeof import('./src/PulsoWatchModule').default;

/**
 * Absent in Expo Go and on web. Resolved through a lazy `require` because
 * `requireNativeModule` throws at import time wherever the native side isn't linked.
 */
function nativeModule(): NativeModule | null {
  if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || isRunningInExpoGo()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('./src/PulsoWatchModule') as { default: NativeModule }).default;
  } catch {
    return null;
  }
}

let cached: NativeModule | null | undefined;

function watch(): NativeModule | null {
  if (cached === undefined) cached = nativeModule();
  return cached;
}

export function watchBridgeAvailable(): boolean {
  return watch() != null;
}

export async function publishWatchState(json: string): Promise<boolean> {
  const module = watch();
  if (!module) return false;
  try {
    return await module.publishState(json);
  } catch {
    return false;
  }
}

export async function sendWatchAck(json: string): Promise<void> {
  try {
    await watch()?.sendAck(json);
  } catch {
    // The next published state carries the same results.
  }
}

export function takePendingWatchCommands(): string[] {
  try {
    return watch()?.takePendingCommands() ?? [];
  } catch {
    return [];
  }
}

export function addWatchCommandListener(listener: () => void): { remove: () => void } {
  const module = watch();
  if (!module) return { remove: () => {} };
  return module.addListener('onCommand', listener);
}
