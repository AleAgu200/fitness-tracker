import { NativeModule, requireNativeModule } from 'expo';

export type PulsoWatchEvents = {
  /** A command arrived; drain the queue with takePendingCommands. */
  onCommand: (event: { pending: boolean }) => void;
};

declare class PulsoWatchModule extends NativeModule<PulsoWatchEvents> {
  publishState(json: string): Promise<boolean>;
  sendAck(json: string): Promise<number>;
  takePendingCommands(): string[];
  isPaired(): Promise<boolean>;
}

export default requireNativeModule<PulsoWatchModule>('PulsoWatch');
