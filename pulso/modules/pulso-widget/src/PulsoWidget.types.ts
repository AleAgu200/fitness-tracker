/** Wall-clock rest deadline shared between the app and the home-screen widget. */
export interface WidgetRestState {
  /** Epoch ms when rest ends, or null when no timer is running. */
  restEndAt: number | null;
  restTotal: number;
}

export type PulsoWidgetEvents = {
  /** Emitted when a widget button moved the timer while the app happened to be running. */
  onRestChanged: (state: WidgetRestState) => void;
};
