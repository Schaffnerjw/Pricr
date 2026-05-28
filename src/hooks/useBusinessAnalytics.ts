import { useEffect, useState } from "react";
import { getQuotes } from "../storage";
import { SavedQuote } from "../types";
import { sumLineItems } from "../utils/pricingEngine";

const HOUR = 3600000;
const DAY = 86400000;
const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);
const inMonth = (ts: number, ref: Date) => { const d = new Date(ts); return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear(); };
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const changePct = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : now > 0 ? 100 : 0);

export interface MetricPair { now: number; prev: number; change: number; }
export interface TopService { name: string; count: number; avg: number; }
export interface RepStat { name: string; sent: number; accepted: number; closeRate: number; total: number; }
export interface Badge { icon: string; label: string; }

export interface BusinessAnalytics {
  loading: boolean;
  totalQuoted: number;        // all-time quoted $
  quotesAllTime: number;
  quotesThisMonth: number;
  accepted: number;           // jobs closed (won/signed)
  declined: number;
  sent: number;               // quotes that reached the client
  drafted: number;
  closeRate: number;          // accepted / sent %
  avgQuoteValue: number;
  timeToSignHours: number;    // avg over signed
  largestQuote: number;
  commonRange: { low: number; high: number } | null;
  streakDays: number;
  fastestCloseMin: number | null;
  topServices: TopService[];
  reps: RepStat[];
  discountPctOfQuotes: number;
  avgDiscountPct: number;
  totalDiscounted: number;
  hoursSaved: number;
  badges: Badge[];
  monthly: { sent: MetricPair; revenue: MetricPair; closed: MetricPair; closeRate: MetricPair };
  // Win/loss analysis (Feature 4): outcomes the contractor recorded + why quotes were lost.
  outcomesRecorded: number;
  lossReasons: { too_expensive: number; competitor: number; project_cancelled: number; no_response: number; other: number };
  lostTotal: number;
}

const EMPTY_LOSS = { too_expensive: 0, competitor: 0, project_cancelled: 0, no_response: 0, other: 0 };

const EMPTY: BusinessAnalytics = {
  loading: true, totalQuoted: 0, quotesAllTime: 0, quotesThisMonth: 0, accepted: 0, declined: 0, sent: 0, drafted: 0,
  closeRate: 0, avgQuoteValue: 0, timeToSignHours: 0, largestQuote: 0, commonRange: null, streakDays: 0, fastestCloseMin: null,
  topServices: [], reps: [], discountPctOfQuotes: 0, avgDiscountPct: 0, totalDiscounted: 0, hoursSaved: 0, badges: [],
  monthly: { sent: { now: 0, prev: 0, change: 0 }, revenue: { now: 0, prev: 0, change: 0 }, closed: { now: 0, prev: 0, change: 0 }, closeRate: { now: 0, prev: 0, change: 0 } },
  outcomesRecorded: 0, lossReasons: { ...EMPTY_LOSS }, lostTotal: 0,
};

// A quote counts as "accepted/closed" if it's won or has a signature; "declined" if lost.
const isAccepted = (q: SavedQuote) => q.status === "won" || !!q.signedAt;
const isDeclined = (q: SavedQuote) => q.status === "lost";
// "Sent" (reached the client): has a rendered presentation, or has an outcome. Drafts have neither.
const isSent = (q: SavedQuote) => !!q.presentation || isAccepted(q) || isDeclined(q);

export function computeBusinessAnalytics(all: SavedQuote[]): BusinessAnalytics {
  const quotes = (all || []).filter(q => !q.isSample);
  const now = new Date();
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const totals = quotes.map(q => q.total || 0).filter(n => n > 0).sort((a, b) => a - b);

  const accepted = quotes.filter(isAccepted);
  const declined = quotes.filter(isDeclined);
  const sent = quotes.filter(isSent);
  const totalQuoted = sumLineItems(quotes); // shared reducer (pricingEngine) — SavedQuote has a numeric total
  const avgQuoteValue = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
  const largestQuote = totals.length ? totals[totals.length - 1] : 0;
  const commonRange = totals.length >= 4 ? { low: Math.round(totals[Math.floor(totals.length * 0.25)]), high: Math.round(totals[Math.floor(totals.length * 0.75)]) } : null;

  // Time to sign (hours), per signed quote.
  const signTimes = quotes.filter(q => q.signedAt && q.timestamp).map(q => (q.signedAt! - q.timestamp) / HOUR).filter(h => h >= 0);
  const timeToSignHours = signTimes.length ? Math.round((signTimes.reduce((a, b) => a + b, 0) / signTimes.length) * 10) / 10 : 0;
  const fastestCloseMin = signTimes.length ? Math.round(Math.min(...signTimes) * 60) : null;

  // Streak: consecutive days (ending today or yesterday) with at least one quote.
  const days = new Set(quotes.map(q => dayKey(q.timestamp)));
  let streakDays = 0;
  let cursor = Date.now();
  if (!days.has(dayKey(cursor))) cursor -= DAY; // allow a streak that ended yesterday
  while (days.has(dayKey(cursor))) { streakDays++; cursor -= DAY; }

  // Top services: count string field values (selector choices) across quotes, with avg quote value.
  const svc: Record<string, { count: number; sum: number }> = {};
  for (const q of quotes) {
    for (const v of Object.values(q.fieldValues || {})) {
      if (typeof v === "string" && v.trim() && v.length < 40) {
        const k = v.trim();
        svc[k] = svc[k] || { count: 0, sum: 0 };
        svc[k].count++; svc[k].sum += q.total || 0;
      }
    }
  }
  const topServices: TopService[] = Object.entries(svc).map(([name, d]) => ({ name, count: d.count, avg: Math.round(d.sum / d.count) }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // Rep performance.
  const repMap: Record<string, RepStat> = {};
  for (const q of quotes) {
    const name = q.repName || "Unknown";
    const r = repMap[name] || (repMap[name] = { name, sent: 0, accepted: 0, closeRate: 0, total: 0 });
    if (isSent(q)) r.sent++;
    if (isAccepted(q)) { r.accepted++; r.total += q.total || 0; }
  }
  const reps = Object.values(repMap).map(r => ({ ...r, closeRate: pct(r.accepted, r.sent) })).sort((a, b) => b.total - a.total);

  // Discounts.
  const withDiscount = quotes.filter(q => q.discount && q.discount.value > 0);
  const discountPctOfQuotes = pct(withDiscount.length, quotes.length);
  const pctDiscounts = withDiscount.filter(q => q.discount!.mode === "percent").map(q => q.discount!.value);
  const avgDiscountPct = pctDiscounts.length ? Math.round(pctDiscounts.reduce((a, b) => a + b, 0) / pctDiscounts.length) : 0;
  const totalDiscounted = withDiscount.reduce((s, q) => {
    const d = q.discount!; return s + (d.mode === "amount" ? d.value : Math.round((q.total || 0) * (d.value / 100)));
  }, 0);

  // This month vs last month.
  const sentNow = sent.filter(q => inMonth(q.timestamp, now)).length;
  const sentPrev = sent.filter(q => inMonth(q.timestamp, lastMonthRef)).length;
  const revNow = quotes.filter(q => inMonth(q.timestamp, now)).reduce((s, q) => s + (q.total || 0), 0);
  const revPrev = quotes.filter(q => inMonth(q.timestamp, lastMonthRef)).reduce((s, q) => s + (q.total || 0), 0);
  const closedNow = accepted.filter(q => inMonth(q.timestamp, now)).length;
  const closedPrev = accepted.filter(q => inMonth(q.timestamp, lastMonthRef)).length;
  const crNow = pct(closedNow, sentNow);
  const crPrev = pct(closedPrev, sentPrev);

  const quotesAllTime = quotes.length;
  const quotesThisMonth = quotes.filter(q => inMonth(q.timestamp, now)).length;
  const closeRate = pct(accepted.length, sent.length);
  const hoursSaved = quotesAllTime * 2;

  // Win/loss: tally recorded outcomes and why quotes were lost.
  const withOutcome = quotes.filter(q => !!q.outcome);
  const lossReasons = { ...EMPTY_LOSS };
  for (const q of quotes) { if (q.lostReason && q.lostReason in lossReasons) lossReasons[q.lostReason]++; }
  const lostTotal = Object.values(lossReasons).reduce((a, b) => a + b, 0);

  // Milestone badges (show up to 3, most impressive first).
  const badges: Badge[] = [];
  // Feather icon names (chrome rendered with <Feather name={b.icon}/> — never emoji on the brag card).
  if (streakDays >= 2) badges.push({ icon: "zap", label: `${streakDays} day streak` });
  if (revNow >= 10000) badges.push({ icon: "dollar-sign", label: "First $10K month" });
  if (fastestCloseMin != null && fastestCloseMin > 0) badges.push({ icon: "clock", label: `Fastest close: ${fastestCloseMin} min` });
  const thisYear = quotes.filter(q => new Date(q.timestamp).getFullYear() === now.getFullYear()).length;
  if (thisYear >= 10) badges.push({ icon: "award", label: `${thisYear} quotes this year` });
  if (sentPrev > 0 && sentNow > sentPrev) badges.push({ icon: "trending-up", label: `${changePct(sentNow, sentPrev)}% better than last month` });

  return {
    loading: false, totalQuoted: Math.round(totalQuoted), quotesAllTime, quotesThisMonth,
    accepted: accepted.length, declined: declined.length, sent: sent.length, drafted: Math.max(0, quotesAllTime - sent.length),
    closeRate, avgQuoteValue, timeToSignHours, largestQuote: Math.round(largestQuote), commonRange, streakDays, fastestCloseMin,
    topServices, reps, discountPctOfQuotes, avgDiscountPct, totalDiscounted: Math.round(totalDiscounted), hoursSaved,
    badges: badges.slice(0, 3),
    monthly: {
      sent: { now: sentNow, prev: sentPrev, change: changePct(sentNow, sentPrev) },
      revenue: { now: Math.round(revNow), prev: Math.round(revPrev), change: changePct(revNow, revPrev) },
      closed: { now: closedNow, prev: closedPrev, change: changePct(closedNow, closedPrev) },
      closeRate: { now: crNow, prev: crPrev, change: Math.round(crNow - crPrev) },
    },
    outcomesRecorded: withOutcome.length, lossReasons, lostTotal,
  };
}

// Per-business analytics from the business's own quotes (storage abstracts cloud/local/demo).
export function useBusinessAnalytics(businessCode: string): BusinessAnalytics {
  const [data, setData] = useState<BusinessAnalytics>(EMPTY);
  useEffect(() => {
    let mounted = true;
    getQuotes(businessCode).then(qs => { if (mounted) setData(computeBusinessAnalytics(qs)); }).catch(() => { if (mounted) setData({ ...EMPTY, loading: false }); });
    return () => { mounted = false; };
  }, [businessCode]);
  return data;
}
