/**
 * Client list projection (Figma frame 04). Retention-only: lender, loan purpose and
 * fixed-rate expiry date. No rates, balances, loan amounts or recommendations.
 */
export interface ClientLoanInput { householdId: string; lenderName: string; loanPurpose: string; fixedRateExpiryDate?: string; status: string }
export interface ClientOpportunityInput { householdId: string; type: string; triggerDate: string; status: string }
export interface ClientRetentionSummary { lenderName?: string; loanPurpose?: string; fixedRateExpiryDate?: string; opportunity?: { label: "Fixed-rate expiry" | "Annual review due"; status: string } }

const CLOSED = ["Completed", "Dismissed"];

/** Picks the active loan with the soonest fixed-rate expiry, and the most pressing open opportunity. */
export function summariseClientRetention(loans: ClientLoanInput[], opportunities: ClientOpportunityInput[]): ClientRetentionSummary {
  const active = loans.filter(loan => loan.status !== "Discharged");
  const loan = [...active].sort((a, b) => (a.fixedRateExpiryDate ?? "9999").localeCompare(b.fixedRateExpiryDate ?? "9999"))[0];
  const open = opportunities.filter(item => !CLOSED.includes(item.status)).sort((a, b) => a.triggerDate.localeCompare(b.triggerDate));
  const fixed = open.find(item => item.type === "Fixed-rate expiry"), annual = open.find(item => item.type === "Annual review" && item.status !== "Upcoming");
  const opportunity = fixed ? { label: "Fixed-rate expiry" as const, status: fixed.status } : annual ? { label: "Annual review due" as const, status: annual.status } : undefined;
  return { lenderName: loan?.lenderName, loanPurpose: loan?.loanPurpose, fixedRateExpiryDate: loan?.fixedRateExpiryDate, opportunity };
}

const addDays = (isoDate: string, days: number) => { const date = new Date(`${isoDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

/** Summary cards: active clients (people in active households), fixed rates ending in 90 days, reviews overdue, households. */
export function clientBookSummary(input: { businessDate: string; households: Array<{ id: string; status: string }>; members: Array<{ householdId: string; contactId: string }>; loans: ClientLoanInput[]; opportunities: ClientOpportunityInput[] }) {
  const activeIds = new Set(input.households.filter(item => item.status === "Active").map(item => item.id));
  const horizon = addDays(input.businessDate, 90);
  return {
    activeClients: new Set(input.members.filter(item => activeIds.has(item.householdId)).map(item => item.contactId)).size,
    fixedEndingIn90Days: input.loans.filter(loan => activeIds.has(loan.householdId) && loan.status !== "Discharged" && loan.fixedRateExpiryDate && loan.fixedRateExpiryDate >= input.businessDate && loan.fixedRateExpiryDate <= horizon).length,
    reviewsOverdue: input.opportunities.filter(item => activeIds.has(item.householdId) && item.type === "Annual review" && !CLOSED.includes(item.status) && item.status !== "Review booked" && item.triggerDate < input.businessDate).length,
    households: input.households.filter(item => item.status !== "Archived").length,
  };
}
