import type { MembershipId } from "@/platform/core/models";
import type { HouseholdId, JointContactInput } from "./models";
import type { NewLoanInput } from "@/verticals/mortgage/loans/models";
import type { ReferralPartnerId } from "@/verticals/mortgage/referrals/models";
export interface ConvertMortgageLeadInput{displayName:string;ownerMembershipId:MembershipId;referralPartnerId?:ReferralPartnerId;duplicateDecision:"create-new"|"add-existing";existingHouseholdId?:HouseholdId;jointContact?:JointContactInput;initialLoan?:Omit<NewLoanInput,"householdId"|"ownerMembershipId">;}
