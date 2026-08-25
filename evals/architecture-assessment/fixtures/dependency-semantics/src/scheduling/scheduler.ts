import type { AnalyticsProjector } from "../analytics/analytics-projector.js";
import type { OrderSubmitted } from "../contracts/order-events.js";

export class Scheduler {
  #analytics?: AnalyticsProjector;
  readonly #scheduled = new Set<string>();

  attachAnalytics(analytics: AnalyticsProjector): void {
    this.#analytics = analytics;
  }

  async schedule(event: OrderSubmitted): Promise<void> {
    this.#scheduled.add(event.orderId);
  }

  isScheduled(orderId: string): boolean {
    return this.#scheduled.has(orderId);
  }
}
