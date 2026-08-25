export type OrderSubmitted = {
  type: "order.submitted";
  version: 1;
  eventId: string;
  orderId: string;
};

export interface EventPublisher {
  publish(event: OrderSubmitted): Promise<void>;
}

export interface OrderSubmission {
  submit(orderId: string): Promise<{ acknowledgement: "accepted"; eventId: string }>;
}
