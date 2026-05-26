// Structured, discriminated commands Kit emits to edit a quote tool. Parsed from the COMMAND block in
// Kit's reply and executed deterministically by executeKitCommand (no API calls, no eval).
export type KitFieldType = "toggle" | "number" | "select";

export type KitCommand =
  | { type: "UPDATE_RATE"; fieldIdentifier: string; newRate: number; unit?: string }
  | { type: "RENAME_FIELD"; fieldIdentifier: string; newLabel: string }
  | { type: "CHANGE_FIELD_TYPE"; fieldIdentifier: string; newType: KitFieldType }
  | { type: "ADD_FIELD"; sectionIdentifier: string; label: string; rate: number; unit: string; fieldType: KitFieldType }
  | { type: "REMOVE_FIELD"; fieldIdentifier: string }
  | { type: "ADD_SECTION"; name: string; pattern: string }
  | { type: "REMOVE_SECTION"; sectionIdentifier: string }
  | { type: "UPDATE_DEPOSIT"; percent: number }
  | { type: "UPDATE_TRADE"; trade: string }
  | { type: "ADD_ADDON"; label: string; price: number; unit?: string }
  | { type: "REMOVE_ADDON"; addonIdentifier: string }
  | { type: "UPDATE_ADDON"; addonIdentifier: string; newPrice?: number; newLabel?: string }
  | { type: "NO_CHANGE" };

export interface KitCommandResult {
  success: boolean;
  command: KitCommand;
  description: string;
  error?: string;
}
