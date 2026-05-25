export type Role = "admin" | "rep" | "superadmin";
export type Screen = "splash"|"welcome"|"get_started"|"signup"|"signup_brand"|"login"|"rep_join"|"set_username"|"setup"|"meet_kit"|"building"|"done"|"quote"|"history"|"pipeline"|"users"|"settings"|"master";
export interface User { id: string; name: string; role: Role; businessCode: string; username?: string; pinHash?: string; }
export interface BrandConfig { primaryColor: string; secondaryColor: string; logoUri: string|null; tagline: string; phone: string; email: string; address: string; backgroundColor?: string; }
// Controls what the customer sees on the quote document (PDF + in-app ClosingCard). Unset => detailed/all.
export interface DocPrefs { style: "detailed"|"summary"|"custom"; showLineItems: boolean; showPricing: boolean; showSubtotal: boolean; showContact: boolean; }
export interface Business { code: string; name: string; ownerName: string; adminPin: string; brand: BrandConfig; schema: QuoteSchema|null; createdAt: number; kitUpdates?: number; kitSummary?: string; brandConfigured?: boolean; termsAndConditions?: string; username?: string; adminPinHash?: string; docPrefs?: DocPrefs; members?: User[]; }
export interface QuoteSchema { trade: string; fields: SchemaField[]; pricing: Record<string,number>; addOns: AddOn[]; calculation: string; summaryLines: SummaryLine[]; }
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
}
export interface SavedQuote { id: string; timestamp: number; customerName: string; trade: string; total: number; deposit: number; fieldValues: Record<string,any>; userId: string; repName: string; isSample?: boolean; status?: QuoteStatus; signatureData?: string; signedAt?: number; presentation?: QuotePresentation; }
export interface DemoBusiness { name: string; trade: string; color: string; emoji: string; tagline: string; phone: string; schema: QuoteSchema; }
export interface CardTheme { cardBg: string; cardBorder: string; bizColor: string; customerColor: string; lineColor: string; valueColor: string; dividerColor: string; totalColor: string; depositBg: string; depositBorder: string; depositLabelColor: string; depositAmountColor: string; }
