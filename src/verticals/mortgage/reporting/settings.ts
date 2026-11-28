/**
 * Reporting settings. One place for every reporting threshold so none is hard-coded in a rule.
 * Confirmed in the 4F.2 review: a lead is "recovered" after 30 days without a reply.
 */
export const reportingSettings = {
  recoveredLeadNoReplyDays: 30,
} as const;
export type ReportingSettings = { recoveredLeadNoReplyDays: number };
