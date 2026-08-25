import type { OrderSubmitted } from "../contracts/order-events.js";
import type { Scheduler } from "../scheduling/scheduler.js";

export class AnalyticsProjector {
  constructor(private readonly scheduler: Scheduler) {}

  async record(event: OrderSubmitted): Promise<void> {
    if (this.scheduler.isScheduled(event.orderId)) return;
    console.log("analytics", event.eventId);
  }
}
