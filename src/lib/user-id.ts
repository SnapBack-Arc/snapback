/**
 * Display-facing user ID: the account's permanent signup-order sequence
 * number (users.user_seq — "1" for the very first account), shown in hex.
 * Admin accounts get a lowercase "a" prefix, which is also what the UI uses
 * to tell an admin id apart from a normal one at a glance.
 */
export function formatUserId(userSeq: number, isAdmin: boolean): string {
  const hex = userSeq.toString(16).toUpperCase();
  return isAdmin ? `a${hex}` : hex;
}
