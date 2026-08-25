import { Ledger } from "../shared/ledger.js";

export class InvoiceBook {
  constructor(private readonly ledger: Ledger) {}

  correct(invoiceId: string, amount: number): "corrected" | "rejected" {
    return this.ledger.authorizeInvoiceCorrection(invoiceId, amount)
      ? "corrected"
      : "rejected";
  }

  charge(invoiceId: string, amount: number): void {
    this.ledger.recordDebit(invoiceId, amount);
  }
}
