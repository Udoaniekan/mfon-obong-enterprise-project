export class FinancialUtils {
  static calculateDiscount(
    amount: number,
    discountPercent?: number,
    discountAmount?: number,
  ): number {
    if (discountPercent) {
      return amount * (discountPercent / 100);
    }
    if (discountAmount) {
      return Math.min(amount, discountAmount);
    }
    return 0;
  }

  static formatCurrency(
    amount: number,
    currency: string = 'NGN',
    locale: string = 'en-NG',
  ): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }

  static calculateBalance(credits: number[], debits: number[]): number {
    const totalCredits = credits.reduce((sum, credit) => sum + credit, 0);
    const totalDebits = debits.reduce((sum, debit) => sum + debit, 0);
    return totalCredits - totalDebits;
  }

  static roundToDecimalPlaces(number: number, places: number = 2): number {
    const factor = Math.pow(10, places);
    return Math.round(number * factor) / factor;
  }

  static calculatePaymentPlan(
    totalAmount: number,
    numberOfInstallments: number,
    interestRate: number = 0,
  ): { installmentAmount: number; totalPayable: number } {
    const interest = (totalAmount * interestRate) / 100;
    const totalPayable = totalAmount + interest;
    const installmentAmount = this.roundToDecimalPlaces(
      totalPayable / numberOfInstallments,
    );

    return {
      installmentAmount,
      totalPayable,
    };
  }
}
