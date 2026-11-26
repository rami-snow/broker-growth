/** A lead attributed to a referral partner. Attribution is an operational record, not proof of causation. */
export interface ReferredLead { referralPartnerId: string; createdAt: string; status: string }
export type RelationshipStatus = "New" | "Strong" | "Active" | "Cooling" | "Dormant" | "Inactive";
const DAY = 86400000;

/**
 * Relationship status is based only on time since the last referral (Figma frame 05 footnote):
 * Strong ≤30 days, Active ≤60, Cooling ≤120, Dormant beyond that. A partner added in the last
 * 60 days with no referral yet is New. Inactive partners stay Inactive.
 */
export function relationshipStatus(partner: { status: string; createdAt: string }, lastReferralAt: string | undefined, now: Date): RelationshipStatus {
  if (partner.status !== "Active") return "Inactive";
  if (!lastReferralAt) return now.getTime() - Date.parse(partner.createdAt) <= 60 * DAY ? "New" : "Dormant";
  const days = (now.getTime() - Date.parse(lastReferralAt)) / DAY;
  return days <= 30 ? "Strong" : days <= 60 ? "Active" : days <= 120 ? "Cooling" : "Dormant";
}

export function quarterStart(now: Date) { const month = now.getUTCMonth(); return new Date(Date.UTC(now.getUTCFullYear(), month - (month % 3), 1)); }

export function partnerStats(partnerId: string, leads: ReferredLead[], now: Date) {
  const own = leads.filter(lead => lead.referralPartnerId === partnerId);
  return {
    referrals90Days: own.filter(lead => now.getTime() - Date.parse(lead.createdAt) <= 90 * DAY).length,
    converted: own.filter(lead => lead.status === "Converted").length,
    lastReferralAt: own.map(lead => lead.createdAt).sort().at(-1),
  };
}

/** Summary cards. Conversion rate excludes Closed leads, matching the brief's Converted definition. */
export function partnerSummary(partners: Array<{ id: string; status: string }>, leads: ReferredLead[], now: Date) {
  const start = quarterStart(now).getTime();
  const attributed = leads.filter(lead => partners.some(partner => partner.id === lead.referralPartnerId));
  const converted = attributed.filter(lead => lead.status === "Converted").length, eligible = attributed.filter(lead => lead.status !== "Closed").length;
  return {
    activePartners: partners.filter(partner => partner.status === "Active").length,
    referralsThisQuarter: attributed.filter(lead => Date.parse(lead.createdAt) >= start).length,
    converted,
    conversionRate: eligible ? Math.round((converted / eligible) * 100) : null,
  };
}
