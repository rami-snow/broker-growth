import type { ActivityEvent, SharedActivityType } from "@/platform/audit/models";

export type MortgageActivityType = SharedActivityType
  | "lead.converted"
  | "conversion.duplicate_decision"
  | "household.created"
  | "household.updated"
  | "household.archived"
  | "household.member_added"
  | "loan.created"
  | "loan.updated"
  | "opportunity.generated"
  | "opportunity.assigned"
  | "opportunity.status_changed"
  | "household.note_added"
  | "loan.rate_type_set"
  | "referral_partner.next_step_set";

export type MortgageActivityEvent = ActivityEvent<MortgageActivityType>;
