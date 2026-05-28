// Sentinel for typed-confirmation destructive actions (currently the master-dashboard's
// "Delete Business" flow). The previous gate required typing the EXACT business name, which
// failed silently on businesses whose names had trailing whitespace, special characters
// (smart quotes from copy/paste), unicode, or autocorrect-munged casing — the "Delete forever"
// button stayed greyed and the admin couldn't tell why. Switching to a fixed sentinel both
// removes that footgun AND prevents accidental deletion (typing "delete" lowercase or "Delete"
// title-case won't enable the button).
export const DELETE_SENTINEL = "DELETE";

// Strict, case-sensitive match — typing "delete" / "Delete" / " DELETE " all fail. The intent
// is to make the admin pause and type the all-caps word deliberately.
export function isDeleteConfirmed(typed: string): boolean {
  return typed === DELETE_SENTINEL;
}
