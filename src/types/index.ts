export type Role = "admin" | "rep" | "superadmin";
export type Screen = "splash"|"welcome"|"get_started"|"signup"|"signup_brand"|"login"|"rep_join"|"setup"|"meet_kit"|"building"|"done"|"quote"|"history"|"pipeline"|"users"|"settings"|"master";
export interface User { id: string; name: string; role: Role; businessCode: string; }
export interface BrandConfig { primaryColor: string; secondaryColor: string; logoUri: string|null; tagline: string; phone: string; email: string; address: string; backgroundColor?: string; }
export interface Business { code: string; name: string; ownerName: string; adminPin: string; brand: BrandConfig; schema: QuoteSchema|null; createdAt: number; kitUpdates?: number; kitSummary?: string; brandConfigured?: boolean; }
export interface QuoteSchema { trade: string; fields: SchemaField[]; pricing: Record<string,number>; addOns: AddOn[]; calculation: string; summaryLines: SummaryLine[]; }
export type FieldUnit = "sqft"|"lf"|"each"|"hr"|"flat"|"percent"|"load"|"room"|"vehicle"|"ton";
export type FieldGroup = "dimensions"|"materials"|"railings"|"lighting"|"fencing"|"extras"|"fees"|"details";
export interface SchemaField { id: string; label: string; type: "number"|"selector"|"toggle"|"area"; options?: string[]; placeholder?: string; unit?: FieldUnit; group?: FieldGroup; }
export interface AddOn { id: string; label: string; price: number; }
export interface SummaryLine { label: string; value: string; showIf?: string; }
export type QuoteStatus = "open"|"won"|"lost";
export interface SavedQuote { id: string; timestamp: number; customerName: string; trade: string; total: number; deposit: number; fieldValues: Record<string,any>; userId: string; repName: string; isSample?: boolean; status?: QuoteStatus; }
export interface DemoBusiness { name: string; trade: string; color: string; emoji: string; tagline: string; phone: string; schema: QuoteSchema; }
export interface CardTheme { cardBg: string; cardBorder: string; bizColor: string; customerColor: string; lineColor: string; valueColor: string; dividerColor: string; totalColor: string; depositBg: string; depositBorder: string; depositLabelColor: string; depositAmountColor: string; }
