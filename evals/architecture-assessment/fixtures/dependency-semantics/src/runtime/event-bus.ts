import type { OrderSubmitted } from "../contracts/order-events.js";

type Handler = (event: OrderSubmitted) => Promise<void>;

export class EventBus {
  readonly #handlers: Handler[] = [];

  subscribe(handler: Handler): void {
    this.#handlers.push(handler);
  }

  async publish(event: OrderSubmitted): Promise<void> {
    for (const handler of this.#handlers) await handler(event);
  }
}
