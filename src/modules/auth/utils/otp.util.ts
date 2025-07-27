import * as crypto from 'crypto';

export function generateOTP(length = 6): string {
  // Generates a numeric OTP of specified length
  return crypto
    .randomInt(Math.pow(10, length - 1), Math.pow(10, length))
    .toString();
}

export function getOTPExpiry(minutes = 10): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + minutes);
  return expiry;
}
