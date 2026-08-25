export type Shipment = { orderId: string; carrier: string };

export class ShipmentManager {
  dispatch(orderId: string, carrier: string): Shipment {
    return { orderId, carrier };
  }
}
