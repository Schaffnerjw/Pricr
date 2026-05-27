import { Business, QuoteSchema, SavedQuote } from "../types";
import { KitCommand } from "./kitCommands";

// Proactive insights Kit surfaces on the dashboard — patterns noticed without being asked.
export interface KitInsight {
  id: string;
  type: "pricing" | "follow_up" | "pattern" | "milestone";
  message: string;
  action?: { label: string; command: KitCommand };
  priority: "high" | "medium" | "low";
  generatedAt: number;
}

const DAY = 24 * 60 * 60 * 1000;
const money = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");
const PRIORITY_RANK: Record<KitInsight["priority"], number> = { high: 0, medium: 1, low: 2 };

// True if the quote counts as "won" (signed in person → status won, or explicitly recorded).
const isWon = (q: SavedQuote) => q.outcome === "won" || q.status === "won" || !!q.signedAt;

// Generate insights from the last 30 days of quotes + the current schema. Pure + defensive — it
// never throws and returns [] when there isn't enough signal. Sorted highest-priority first.
export function generateKitInsights(quotes: SavedQuote[], schema: QuoteSchema | null, business: Business): KitInsight[] {
  const out: KitInsight[] = [];
  const now = Date.now();
  const real = (quotes || []).filter(q => !q.isSample);
  const recent = real.filter(q => now - q.timestamp < 30 * DAY);
  const sent = real.length;
  const won = real.filter(isWon).length;
  const closeRate = sent > 0 ? Math.round((won / sent) * 100) : 0;

  // 1. Low close rate (high).
  if (sent >= 5 && closeRate < 40) {
    out.push({ id: `closerate-${sent}-${closeRate}`, type: "pricing", priority: "high", generatedAt: now,
      message: `You've closed ${closeRate}% of your last ${sent} quotes. Want me to analyze your pricing against similar contractors?`,
      action: { label: "Review my pricing", command: { type: "NO_CHANGE" } } });
  }

  // 2. Expired without response in the last 30 days (high).
  const expired = recent.filter(q => q.outcome === "expired" || (!!q.expiresAt && q.expiresAt < now && !isWon(q) && q.outcome !== "won" && q.outcome !== "lost"));
  if (expired.length >= 3) {
    out.push({ id: `expired-${expired.length}`, type: "follow_up", priority: "high", generatedAt: now,
      message: `${expired.length} quotes expired without a response. Want me to draft a follow-up message you can send?` });
  }

  // 3. Pricing objection from win/loss (high): 5+ lost as too expensive.
  const tooPricey = real.filter(q => q.outcome === "lost" && q.lostReason === "too_expensive");
  if (tooPricey.length >= 5) {
    const matField = schema?.sections?.find(s => s.pattern === "MATERIAL_MEASUREMENT" && s.materialFieldId);
    const rate = matField?.options?.[0]?.rate ?? (matField?.materialFieldId ? schema?.pricing?.[matField.materialFieldId] : undefined);
    const matName = matField?.name || "your top material";
    const rateBit = typeof rate === "number" && rate > 0 ? ` Your ${matName} rate is ${money(rate)}/unit.` : "";
    out.push({ id: `pricing-objection-${tooPricey.length}`, type: "pricing", priority: "high", generatedAt: now,
      message: `${tooPricey.length} quotes were lost due to price.${rateBit} Want to add a budget option?`,
      action: { label: "Add a budget option", command: { type: "NO_CHANGE" } } });
  }

  // 4. Material pattern (medium): one selector option in >80% of quotes.
  const sec = schema?.sections?.find(s => s.pattern === "MATERIAL_MEASUREMENT" && s.materialFieldId);
  if (sec?.materialFieldId && real.length >= 5) {
    const counts = new Map<string, number>();
    let withValue = 0;
    for (const q of real) {
      const v = q.fieldValues?.[sec.materialFieldId];
      if (v == null || v === "") continue;
      withValue++;
      const key = String(v);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (withValue >= 5) {
      for (const [opt, c] of counts) {
        const pct = Math.round((c / withValue) * 100);
        if (pct > 80) {
          out.push({ id: `material-default-${opt}`, type: "pattern", priority: "medium", generatedAt: now,
            message: `${opt} is in ${pct}% of your quotes. Consider making it your default selection to speed up quoting.` });
          break;
        }
      }
    }
  }

  // 5. Milestone (low): total quoted crosses a threshold.
  const totalQuoted = real.reduce((sum, q) => sum + (q.total || 0), 0);
  const milestones = [500000, 100000, 50000, 10000];
  const crossed = milestones.find(m => totalQuoted >= m);
  if (crossed) {
    out.push({ id: `milestone-${crossed}`, type: "milestone", priority: "low", generatedAt: now,
      message: `You've now quoted over ${money(crossed)} in jobs with Pricr. 🎉` });
  }

  return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}
