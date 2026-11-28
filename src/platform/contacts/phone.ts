/**
 * Phone numbers as they are matched: digits only, with Australian international forms (+61, 0061, +61 (0))
 * written as the national number with its leading 0. Mirrors private.normalise_phone_number in the database.
 */
export function normalisePhoneNumber(value?: string | null): string | undefined {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0061")) digits = digits.slice(2);
  if (/^610\d{9}$/.test(digits)) digits = digits.slice(2);
  else if (/^61\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return digits || undefined;
}
