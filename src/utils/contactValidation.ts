// Pure validators/formatters for the signup contact fields. No deps, fully testable.

// Valid if it has an @ with text on both sides and a dotted domain. Intentionally lenient (not RFC).
export function isValidEmail(email: string): boolean {
  const e = (email || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Digits only.
export const phoneDigits = (phone: string): string => (phone || "").replace(/\D/g, "");

// Valid US-style phone: at least 10 digits.
export function isValidPhone(phone: string): boolean {
  return phoneDigits(phone).length >= 10;
}

// Progressive (XXX) XXX-XXXX formatting as the user types. Keeps at most 10 digits.
export function formatPhone(input: string): string {
  const d = phoneDigits(input).slice(0, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
