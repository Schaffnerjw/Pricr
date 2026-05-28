// Trade-template registry. Only the roadside template ships in this batch; the other four trades
// (handyman, construction, decks, generic) remain Kit-built / Import-built for now and are listed
// here as placeholders so a future TradePickerScreen can fold them in without touching call sites.
import { QuoteSchema } from "../../types";
import { roadsideTemplate, ROADSIDE_META } from "./roadside";

export type TradeId = "handyman" | "construction" | "decks" | "roadside" | "generic";

export interface TradeMeta {
  id: TradeId;
  label: string;
  icon: string;          // Feather icon name (canonical icon set used app-wide)
  depositDefault: number;
  urgencyAware?: boolean;
}

// Each entry pairs metadata with a builder so a future picker can lazily instantiate the template.
export interface TradeTemplate { meta: TradeMeta; build: () => QuoteSchema }

export const TRADE_TEMPLATES: Record<TradeId, TradeTemplate | null> = {
  roadside: { meta: ROADSIDE_META, build: () => roadsideTemplate },
  // Placeholders — Kit/Import still drives these until dedicated templates are added.
  handyman: null,
  construction: null,
  decks: null,
  generic: null,
};

export const TRADE_PICKER_ORDER: TradeId[] = ["handyman", "construction", "roadside", "decks", "generic"];

// Convenience: get a template (or null if not yet implemented for this trade).
export function getTradeTemplate(id: TradeId): TradeTemplate | null {
  return TRADE_TEMPLATES[id];
}

export { roadsideTemplate, ROADSIDE_META };
