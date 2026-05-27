export type Role = "admin" | "rep" | "superadmin";
export type Screen = "splash"|"welcome"|"get_started"|"signup"|"signup_brand"|"login"|"rep_join"|"set_username"|"upgrade_password"|"setup"|"choose_setup"|"wizard"|"import"|"meet_kit"|"building"|"confirm_schema"|"done"|"quote"|"history"|"pipeline"|"users"|"settings"|"stats"|"master"|"super_analytics"|"view_as"|"paywall";
export interface User { id: string; name: string; role: Role; businessCode: string; username?: string; pinHash?: string; }
export interface BrandConfig { primaryColor: string; secondaryColor: string; logoUri: string|null; tagline: string; phone: string; email: string; address: string; backgroundColor?: string; }
// Controls what the customer sees on the quote document (PDF + in-app ClosingCard). Unset => detailed/all.
export interface DocPrefs { style: "detailed"|"summary"|"custom"; showLineItems: boolean; showPricing: boolean; showSubtotal: boolean; showContact: boolean; }
// Accepted payment methods (admin sets once in Settings, shown on every quote). `methods` holds the
// selected built-in labels; `other` is free text for the "Other" option. Unset => nothing shown.
export interface PaymentMethods { methods: string[]; other?: string; }
export type SubscriptionStatus = "active" | "veraa" | "trial" | "expired";
export interface Business { code: string; name: string; ownerName: string; adminPin: string; brand: BrandConfig; schema: QuoteSchema|null; createdAt: number; kitUpdates?: number; kitSummary?: string; brandConfigured?: boolean; termsAndConditions?: string; username?: string; adminPinHash?: string; docPrefs?: DocPrefs; members?: User[]; paymentMethods?: PaymentMethods; hasGeneratedQuote?: boolean; notificationEmail?: string; requireSmsVerification?: boolean; suspended?: boolean;
  // Billing / partner (stored in config jsonb; subscription_status also mirrored to a column — migration 0007).
  isVeraaClient?: boolean; promoCode?: string; subscriptionStatus?: SubscriptionStatus; stripeCustomerId?: string; trialStartedAt?: number; partnerCodeUsed?: string; selectedPlan?: "monthly" | "annual";
  // Kit conversation history (per business; cross-device when cloud is configured).
  kitChatHistory?: { role: "user" | "assistant"; content: string; timestamp: number }[];
  // Quote validity window (days) — default 30; undefined/0 with "Never" selected → no expiry.
  quoteExpiryDays?: number;
  // Expo push token for client-signed / quote-viewed / trial notifications.
  pushToken?: string; }
// Optional render metadata for the single-page job walkthrough. When absent (legacy/demo schemas),
// QuoteScreen falls back to the classic flat field list. Field ids referenced here exist in fields[].
export type SectionPattern = "MATERIAL_MEASUREMENT" | "SYSTEM_CONFIG_QUANTITY" | "FLAT_RATE" | "LABOR";
export interface QuoteSection {
  id: string; name: string; pattern: SectionPattern;
  materialFieldId?: string;   // selector field (MATERIAL_MEASUREMENT)
  quantityFieldId?: string;   // number field (quantity / hours)
  unit?: string;              // display unit
  itemFieldIds?: string[];    // FLAT_RATE toggle field ids
  laborRate?: number;         // LABOR / per-unit single rate (also lives in pricing)
  // Strict pricing-engine fields (added in the foundation rebuild): rates looked up by option ID,
  // never by name. `allowMultiSelect` is explicit, never inferred from the section name.
  options?: import("./schema").SchemaOption[];
  allowMultiSelect?: boolean;
}
export interface QuoteSchema { trade: string; fields: SchemaField[]; pricing: Record<string,number>; addOns: AddOn[]; calculation: string; summaryLines: SummaryLine[]; sections?: QuoteSection[]; }
export type FieldUnit = "sqft"|"lf"|"each"|"hr"|"flat"|"percent"|"load"|"room"|"vehicle"|"ton";
export type FieldGroup = "dimensions"|"materials"|"railings"|"lighting"|"fencing"|"extras"|"fees"|"details";
export interface SchemaField { id: string; label: string; type: "number"|"selector"|"toggle"|"area"; options?: string[]; placeholder?: string; unit?: FieldUnit; group?: FieldGroup; }
export interface AddOn { id: string; label: string; price: number; }
export interface SummaryLine { label: string; value: string; showIf?: string; }
export type QuoteStatus = "open"|"won"|"lost";
// A rendered snapshot of a quote (line items + totals + branding). Stored on the quote so
// the PDF and the remote signing page can render it without the schema/formula engine.
export interface QuotePresentation {
  businessName: string; brandColor: string; logoUri?: string|null;
  phone?: string; email?: string; address?: string;
  customerName: string; trade?: string; date: number; validThrough: number;
  lineItems: { label: string; amount: number }[];
  taxRate: number; tax: number; total: number; depositPct: number; deposit: number; balanceDue: number;
  docPrefs?: DocPrefs;
  paymentMethods?: string[]; // resolved accepted-payment labels, shown on the proposal/PDF
}
export interface QuoteDiscount { mode: "amount"|"percent"; value: number; reason?: string }
export interface SavedQuote { id: string; timestamp: number; customerName: string; trade: string; total: number; deposit: number; fieldValues: Record<string,any>; userId: string; repName: string; isSample?: boolean; status?: QuoteStatus; signatureData?: string; signedAt?: number; presentation?: QuotePresentation; discount?: QuoteDiscount; expiresAt?: number; firstViewedAt?: number; viewCount?: number; }
export interface DemoBusiness { name: string; trade: string; color: string; emoji: string; tagline: string; phone: string; schema: QuoteSchema; }
export interface CardTheme { cardBg: string; cardBorder: string; bizColor: string; customerColor: string; lineColor: string; valueColor: string; dividerColor: string; totalColor: string; depositBg: string; depositBorder: string; depositLabelColor: string; depositAmountColor: string; }
