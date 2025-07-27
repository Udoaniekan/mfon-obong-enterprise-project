export class StringUtils {
  static generateReference(prefix: string = 'REF'): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${timestamp.slice(-6)}${random}`;
  }

  static generateInvoiceNumber(
    prefix: string = 'INV',
    year?: string,
    month?: string,
  ): string {
    const date = new Date();
    const yr = year || date.getFullYear().toString().slice(-2);
    const mn = month || (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `${prefix}${yr}${mn}${random}`;
  }

  static sanitizePhone(phone: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Ensure it starts with country code (default to Nigeria)
    if (cleaned.startsWith('0')) {
      return '234' + cleaned.substring(1);
    }
    if (!cleaned.startsWith('234')) {
      return '234' + cleaned;
    }
    return cleaned;
  }

  static truncate(str: string, length: number = 50): string {
    if (str.length <= length) return str;
    return str.substring(0, length - 3) + '...';
  }

  static normalizeSearch(search: string): string {
    return search
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
