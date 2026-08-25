import type { EventPublisher, OrderSubmission } from "../contracts/order-events.js";

export class OrderRuntime implements OrderSubmission {
  constructor(private readonly events: EventPublisher) {}

  async submit(orderId: string): Promise<{ acknowledgement: "accepted"; eventId: string }> {
    const eventId = `evt-${orderId}`;
    await this.events.publish({ type: "order.submitted", version: 1, eventId, orderId });
    return { acknowledgement: "accepted", eventId };
  }
}
