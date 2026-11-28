import type { AudienceCandidate, AudienceSourceDefinition, CampaignPurposeDefinition, MergeFieldDefinition } from "@/platform/campaigns/contracts";
import type { Contact } from "@/platform/contacts/models";
import type { Organisation } from "@/platform/organisations/models";
import type { MortgageOrganisationMembership } from "@/verticals/mortgage/brokerage/models";
import type { Household } from "@/verticals/mortgage/households/models";
import type { MinimalLoanRecord } from "@/verticals/mortgage/loans/models";
import type { ReviewOpportunity } from "@/verticals/mortgage/review-opportunities/models";

export const annualReviewPurposeKey="mortgage.annual-review-reminder";
export const fixedExpiryPurposeKey="mortgage.fixed-rate-expiry-reminder";
export const annualReviewSourceKey="mortgage.annual-review-opportunities";
export const fixedExpirySourceKey="mortgage.fixed-rate-expiry-opportunities";

export interface MortgageCampaignDependencies{organisations:Organisation[];memberships:MortgageOrganisationMembership[];contacts:Contact[];households:Household[];loanRecords:MinimalLoanRecord[];reviewOpportunities:ReviewOpportunity[];}
export interface MortgageCampaignCandidateData{organisation:Organisation;household:Household;contact:Contact;loan:MinimalLoanRecord;opportunity:ReviewOpportunity;owner?:MortgageOrganisationMembership;}

const sharedFields=["contact.firstName","household.displayName","brokerage.name","broker.displayName","review.dueDate","loan.lenderName"] as const;
export const mortgageCampaignPurposes=[
  // Phase 1 campaigns are email only. SMS consent is still recorded on leads and clients.
  {key:annualReviewPurposeKey,verticalKey:"mortgage",displayName:"Annual review reminder",description:"Invite eligible clients to arrange their annual review.",supportedChannels:["Email"],audienceSourceKeys:[annualReviewSourceKey],permittedMergeFields:sharedFields},
  {key:fixedExpiryPurposeKey,verticalKey:"mortgage",displayName:"Fixed-rate expiry review reminder",description:"Invite eligible clients to discuss an approaching fixed-rate expiry.",supportedChannels:["Email"],audienceSourceKeys:[fixedExpirySourceKey],permittedMergeFields:[...sharedFields,"loan.fixedRateExpiryDate"]},
]as const satisfies readonly CampaignPurposeDefinition[];
export const mortgageAudienceSources=[
  {key:annualReviewSourceKey,verticalKey:"mortgage",displayName:"Annual review opportunities",subjectType:"mortgage.review-opportunity"},
  {key:fixedExpirySourceKey,verticalKey:"mortgage",displayName:"Fixed-rate expiry opportunities",subjectType:"mortgage.review-opportunity"},
]as const satisfies readonly AudienceSourceDefinition[];
export const mortgageMergeFields=[
  {key:"contact.firstName",verticalKey:"shared",displayName:"Contact first name",valueType:"text"},
  {key:"household.displayName",verticalKey:"mortgage",displayName:"Household display name",valueType:"text"},
  {key:"brokerage.name",verticalKey:"mortgage",displayName:"Brokerage name",valueType:"text"},
  {key:"broker.displayName",verticalKey:"mortgage",displayName:"Broker or owner name",valueType:"text"},
  {key:"review.dueDate",verticalKey:"mortgage",displayName:"Review due date",valueType:"date"},
  {key:"loan.fixedRateExpiryDate",verticalKey:"mortgage",displayName:"Fixed-rate expiry date",valueType:"date"},
  {key:"loan.lenderName",verticalKey:"mortgage",displayName:"Lender name",valueType:"text"},
]as const satisfies readonly MergeFieldDefinition[];

function candidates(type:"Annual review"|"Fixed-rate expiry",request:{organisationId:string},dependencies:MortgageCampaignDependencies):AudienceCandidate<MortgageCampaignCandidateData>[] {return dependencies.reviewOpportunities.filter(opportunity=>opportunity.organisationId===request.organisationId&&opportunity.typeKey===type&&(["Upcoming","Due","Overdue"] as string[]).includes(opportunity.lifecycleStatus)).flatMap(opportunity=>{const household=dependencies.households.find(item=>item.id===opportunity.householdId&&item.organisationId===request.organisationId),loan=dependencies.loanRecords.find(item=>item.id===opportunity.loanRecordId&&item.organisationId===request.organisationId),organisation=dependencies.organisations.find(item=>item.id===request.organisationId);if(!household||!loan||!organisation)return[];const contact=dependencies.contacts.find(item=>item.id===household.primaryContactId&&item.organisationId===request.organisationId);if(!contact)return[];const owner=dependencies.memberships.find(item=>item.id===household.ownerMembershipId&&item.organisationId===request.organisationId),eligible=household.status==="Active";return[{candidateKey:opportunity.id,subjectId:opportunity.id,subjectDisplayName:household.displayName,contactId:contact.id,contextLabel:`${opportunity.typeKey} · ${opportunity.triggerDate}`,purposeDecision:eligible?{eligible:true}:{eligible:false,reasonCode:"mortgage_household_ineligible",displayReason:"Household is inactive or archived"},data:{organisation,household,contact,loan,opportunity,owner}}];});}

export const mortgageCampaignRuntime={
  audienceProviders:[
    {sourceKey:annualReviewSourceKey,getCandidates:(request:Parameters<typeof candidates>[1],dependencies:MortgageCampaignDependencies)=>candidates("Annual review",request,dependencies)},
    {sourceKey:fixedExpirySourceKey,getCandidates:(request:Parameters<typeof candidates>[1],dependencies:MortgageCampaignDependencies)=>candidates("Fixed-rate expiry",request,dependencies)},
  ],
  mergeFieldResolvers:[
    {mergeFieldKey:"contact.firstName",resolve:(candidate:AudienceCandidate<MortgageCampaignCandidateData>)=>candidate.data.contact.firstName},
    {mergeFieldKey:"household.displayName",resolve:(candidate:AudienceCandidate<MortgageCampaignCandidateData>)=>candidate.data.household.displayName},
    {mergeFieldKey:"brokerage.name",resolve:(candidate:AudienceCandidate<MortgageCampaignCandidateData>)=>candidate.data.organisation.name},
    {mergeFieldKey:"broker.displayName",resolve:(candidate:AudienceCandidate<MortgageCampaignCandidateData>)=>candidate.data.owner?.displayName??null},
    {mergeFieldKey:"review.dueDate",resolve:(candidate:AudienceCandidate<MortgageCampaignCandidateData>)=>candidate.data.opportunity.triggerDate},
    {mergeFieldKey:"loan.fixedRateExpiryDate",resolve:(candidate:AudienceCandidate<MortgageCampaignCandidateData>)=>candidate.data.loan.fixedRateExpiryDate??null},
    {mergeFieldKey:"loan.lenderName",resolve:(candidate:AudienceCandidate<MortgageCampaignCandidateData>)=>candidate.data.loan.lenderName},
  ],
}as const;
