export type Role = "admin" | "rep" | "superadmin";
export type Screen = "splash"|"welcome"|"get_started"|"signup"|"signup_brand"|"login"|"rep_join"|"set_username"|"upgrade_password"|"setup"|"choose_setup"|"wizard"|"import"|"meet_kit"|"building"|"confirm_schema"|"done"|"quote"|"history"|"pipeline"|"users"|"settings"|"stats"|"master"|"super_analytics"|"view_as"|"paywall"|"schema_editor";
export interface User { id: string; name: string; role: Role; businessCode: string; username?: string; pinHash?: string;
  // Multi-location foundation (data model only): which location this rep works at.
  assignedLocationCode?: string; }
export interface BrandConfig { primaryColor: string; secondaryColor: string; logoUri: string|null; tagline: string; phone: string; email: string; address: string; backgroundColor?: string; }
// Controls what the customer sees on the quote document (PDF + in-app ClosingCard). Unset => detailed/all.
export interface DocPrefs { style: "detailed"|"summary"|"custom"; showLineItems: boolean; showPricing: boolean; showSubtotal: boolean; showContact: boolean; }
// Accepted payment methods (admin sets once in Settings, shown on every quote). `methods` holds the
// selected built-in labels; `other` is free text for the "Other" option. Unset => nothing shown.
export interface PaymentMethods { methods: string[]; other?: string; }
// "trial" = trial started WITHOUT a card (legacy); "trialing" = card on file, Stripe-managed trial,
// auto-charges on day 3; "active" = paying; "veraa" = partner; "expired" = ended/payment lapsed.
export type SubscriptionStatus = "active" | "veraa" | "trial" | "trialing" | "expired";
export interface Business { code: string; name: string; ownerName: string; ownerEmail?: string; ownerPhone?: string; adminPin: string; brand: BrandConfig; schema: QuoteSchema|null; createdAt: number; kitUpdates?: number; kitSummary?: string; brandConfigured?: boolean; termsAndConditions?: string; username?: string; adminPinHash?: string; docPrefs?: DocPrefs; members?: User[]; paymentMethods?: PaymentMethods; hasGeneratedQuote?: boolean; notificationEmail?: string; requireSmsVerification?: boolean; suspended?: boolean;
  // Billing / partner (stored in config jsonb; subscription_status also mirrored to a column — migration 0007).
  isVeraaClient?: boolean; promoCode?: string; subscriptionStatus?: SubscriptionStatus; stripeCustomerId?: string; stripeSubscriptionId?: string; paymentFailed?: boolean; trialStartedAt?: number; partnerCodeUsed?: string; selectedPlan?: "monthly" | "annual";
  // Kit conversation history (per business; cross-device when cloud is configured).
  kitChatHistory?: { role: "user" | "assistant"; content: string; timestamp: number }[];
  // Quote validity window (days) — default 30; undefined/0 with "Never" selected → no expiry.
  quoteExpiryDays?: number;
  // Expo push token for client-signed / quote-viewed / trial notifications.
  pushToken?: string;
  // Multi-location / franchise foundation (data model only — no UI yet). A "headquarters" business
  // can have child "location" businesses; a "single" business stands alone.
  locationType?: "single" | "headquarters" | "location"; parentBusinessCode?: string; locationName?: string; childLocationCodes?: string[];
  // Saved quote templates + schema version history (both stored in config jsonb — no migration).
  quoteTemplates?: QuoteTemplate[]; schemaVersions?: SchemaVersion[];
  // Free-text business-type the user entered in the custom-trade flow (e.g. "Property Management").
  // Purely cosmetic — used to personalize labels. Schema/field behavior never depends on this.
  tradeName?: string;
  // The contractor's saved tool templates (the SHAPE of the tool, not a quote draft).
  // Distinct from quoteTemplates (which stores fieldValues for a starting-point quote).
  savedToolTemplates?: SavedToolTemplate[];
  // Optional Google-reviews URL. When set, the signing page's existing 5-star "Trusted contractor"
  // row becomes a tappable link. When empty, the row renders exactly as before (not tappable).
  googleReviewUrl?: string;
  // Optional payment passthrough — contractor's own provider (QuickBooks/Square/PayPal/Stripe/Venmo/…).
  // FULLY optional: OFF by default; quote tool builds/sends/signs without any payment setup. Pricr never
  // touches the money — the Pay button just opens the contractor's existing payment link in a browser.
  payment?: PaymentConfig; }

export type PaymentProvider = "quickbooks" | "square" | "paypal" | "stripe" | "venmo" | "cashapp" | "other" | "none";
export interface PaymentConfig {
  enabled: boolean;       // can only be true once `link` is set; defaults to false
  provider?: PaymentProvider;
  link?: string;          // contractor's own payment/invoice link
  instructions?: string;  // e.g. "Pay 50% deposit to confirm your install date"
}

// A saved quote configuration the rep can start a new quote from.
export interface QuoteTemplate { id: string; name: string; fieldValues: Record<string, any>; activeSections?: Record<string, boolean>; selectedAddOns?: string[]; createdAt: number; }
// A saved snapshot of the WHOLE tool shape — restorable / duplicable from Settings.
export interface SavedToolTemplate { id: string; name: string; timestamp: number; schema: QuoteSchema; tradeName?: string; }
// One entry in the quote-tool version history (last 5 kept).
export type SchemaVersionSource = "Kit" | "Import" | "Manual edit";
export interface SchemaVersion { timestamp: number; source: SchemaVersionSource; schema: QuoteSchema; }
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
  // When true, this section is pre-selected (toggled on + expanded) on a new quote.
  defaultOn?: boolean;
}
export interface QuoteSchema { trade: string; fields: SchemaField[]; pricing: Record<string,number>; addOns: AddOn[]; calculation: string; summaryLines: SummaryLine[]; sections?: QuoteSection[];
  // Ids of sections pre-selected on a new quote (set in the schema editor). Stable across re-derivation.
  defaultSectionIds?: string[]; }
export type FieldUnit = "sqft"|"lf"|"each"|"hr"|"flat"|"percent"|"load"|"room"|"vehicle"|"ton"|"day"|"week"|"month"|"project";
export type FieldGroup = "dimensions"|"materials"|"railings"|"lighting"|"fencing"|"extras"|"fees"|"details";
export interface SchemaField { id: string; label: string; type: "number"|"selector"|"toggle"|"area"; options?: string[]; placeholder?: string; unit?: FieldUnit; group?: FieldGroup;
  // Linked/derived pricing: this field's quantity is the linked field's quantity, priced at `multiplier`
  // per unit (e.g. Frame Protection = Frame Materials sq ft × $0.50). Read by the pricing engine.
  linkedTo?: string; multiplier?: number; isOptional?: boolean; }
export interface AddOn { id: string; label: string; price: number; }
export interface SummaryLine { label: string; value: string; showIf?: string; }
export type QuoteStatus = "open"|"won"|"lost";
// A rendered snapshot of a quote (line items + totals + branding). Stored on the quote so
// the PDF and the remote signing page can render it without the schema/formula engine.
export interface QuotePresentation {
  businessName: string; brandColor: string; logoUri?: string|null;
  phone?: string; email?: string; address?: string;
  customerName: string; trade?: string; date: number; validThrough: number;
  notes?: string; // free-text job notes, shown on the proposal/PDF/signing page
  lineItems: { label: string; amount: number }[];
  taxRate: number; tax: number; total: number; depositPct: number; deposit: number; balanceDue: number;
  docPrefs?: DocPrefs;
  paymentMethods?: string[]; // resolved accepted-payment labels, shown on the proposal/PDF
}
export interface QuoteDiscount { mode: "amount"|"percent"; value: number; reason?: string }
export type QuoteOutcome = "won" | "lost" | "expired" | "cancelled";
export type LostReason = "too_expensive" | "competitor" | "project_cancelled" | "no_response" | "other";
export interface SavedQuote { id: string; timestamp: number; customerName: string; trade: string; total: number; deposit: number; fieldValues: Record<string,any>; userId: string; repName: string; isSample?: boolean; status?: QuoteStatus; signatureData?: string; signedAt?: number; presentation?: QuotePresentation; discount?: QuoteDiscount; expiresAt?: number; firstViewedAt?: number; viewCount?: number; notes?: string;
  // Win/loss tracking — `outcome` is set automatically on sign (won) or recorded by the contractor.
  outcome?: QuoteOutcome; lostReason?: LostReason; lostNote?: string;
  // Contractor-only manual payment status (Pricr can't auto-detect external payments). Tracking only —
  // NEVER gates anything (quote validity is independent of payment state).
  paymentStatus?: "none" | "deposit_paid" | "paid_full"; paymentAmount?: number; paymentDate?: number; }
export interface DemoBusiness { name: string; trade: string; color: string; emoji: string; tagline: string; phone: string; schema: QuoteSchema; }
export interface CardTheme { cardBg: string; cardBorder: string; bizColor: string; customerColor: string; lineColor: string; valueColor: string; dividerColor: string; totalColor: string; depositBg: string; depositBorder: string; depositLabelColor: string; depositAmountColor: string; }
