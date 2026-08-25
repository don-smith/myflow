export class Ledger {
  readonly #debits = new Map<string, number>();

  authorizeInvoiceCorrection(invoiceId: string, amount: number): boolean {
    const recorded = this.#debits.get(invoiceId) ?? 0;
    return amount <= recorded;
  }

  recordDebit(invoiceId: string, amount: number): void {
    this.#debits.set(invoiceId, amount);
  }
}
