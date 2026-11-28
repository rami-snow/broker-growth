import type { Appointment } from "@/platform/appointments/models";
import type { Contact } from "@/platform/contacts/models";
import type { UserIdentity } from "@/platform/core/models";
import type { Organisation } from "@/platform/organisations/models";
import type { Task } from "@/platform/tasks/models";
import type { ConsentRecord } from "@/platform/consent/models";
import type { ApprovalRecord, AudienceSnapshot, Campaign, CampaignActivityEvent, CampaignVersion, SuppressionRecord } from "@/platform/campaigns/models";
import type { MortgageApplicationCapability, MortgageOrganisationMembership } from "@/verticals/mortgage/brokerage/models";
import type { Household, HouseholdMember } from "@/verticals/mortgage/households/models";
import type { MortgageLead, MortgageLeadStatus, LoanPurpose } from "@/verticals/mortgage/leads/models";
import type { MinimalLoanRecord } from "@/verticals/mortgage/loans/models";
import type { ReferralPartner } from "@/verticals/mortgage/referrals/models";
import type { ReviewOpportunity } from "@/verticals/mortgage/review-opportunities/models";
import { generateReviewOpportunities } from "@/verticals/mortgage/review-opportunities/services";
import { mortgageVerticalDefinition } from "@/verticals/mortgage/definition";
import type { MortgageActivityEvent } from "@/verticals/mortgage/audit/models";
import { annualReviewPurposeKey, annualReviewSourceKey, fixedExpiryPurposeKey, fixedExpirySourceKey } from "@/verticals/mortgage/campaigns/extensions";

export const organisations: Organisation[] = [
  { id: "brk_harbour", name: "Harbourlight Mortgage Co.", shortName: "HM", verticalKey:"mortgage", status:"Active", region: "NSW" },
  { id: "brk_ranges", name: "Ranges Home Finance", shortName: "RF", verticalKey:"mortgage", status:"Active", region: "VIC" },
];

export const users: UserIdentity[] = [
  { id: "usr_alex", name: "Alex Morgan", email: "alex@example.test" },
  { id: "usr_priya", name: "Priya Shah", email: "priya@example.test" },
  { id: "usr_dana", name: "Dana Ellis", email: "dana@example.test" },
  { id: "usr_marcus", name: "Marcus Bell", email: "marcus@example.test" },
  { id: "usr_niamh", name: "Niamh Cole", email: "niamh@example.test" },
  { id: "usr_theo", name: "Theo Nguyen", email: "theo@example.test" },
  { id: "usr_sasha", name: "Sasha Reid", email: "sasha@example.test" },
  { id: "usr_jo", name: "Jo Park", email: "jo@example.test" },
];

const all=[...mortgageVerticalDefinition.capabilityBundles.administrator] as MortgageApplicationCapability[];
const broker=[...mortgageVerticalDefinition.capabilityBundles.broker] as MortgageApplicationCapability[];
const support=[...mortgageVerticalDefinition.capabilityBundles.support] as MortgageApplicationCapability[];

export const memberships: MortgageOrganisationMembership[] = [
  { id: "mem_h_admin", organisationId: "brk_harbour", userId: "usr_alex", displayName: "Alex Morgan", mortgageProfile:{position:"Brokerage administrator"}, capabilities: all, status:"Active" },
  { id: "mem_h_broker1", organisationId: "brk_harbour", userId: "usr_dana", displayName: "Dana Ellis", mortgageProfile:{position:"Broker"}, capabilities: broker, status:"Active" },
  { id: "mem_h_broker2", organisationId: "brk_harbour", userId: "usr_marcus", displayName: "Marcus Bell", mortgageProfile:{position:"Broker"}, capabilities: broker, status:"Active" },
  { id: "mem_h_support", organisationId: "brk_harbour", userId: "usr_sasha", displayName: "Sasha Reid", mortgageProfile:{position:"Support person"}, capabilities: support, status:"Active" },
  { id: "mem_r_admin", organisationId: "brk_ranges", userId: "usr_priya", displayName: "Priya Shah", mortgageProfile:{position:"Brokerage administrator"}, capabilities: all, status:"Active" },
  { id: "mem_r_broker1", organisationId: "brk_ranges", userId: "usr_niamh", displayName: "Niamh Cole", mortgageProfile:{position:"Broker"}, capabilities: broker, status:"Active" },
  { id: "mem_r_broker2", organisationId: "brk_ranges", userId: "usr_theo", displayName: "Theo Nguyen", mortgageProfile:{position:"Broker"}, capabilities: broker, status:"Active" },
  { id: "mem_r_support", organisationId: "brk_ranges", userId: "usr_jo", displayName: "Jo Park", mortgageProfile:{position:"Support person"}, capabilities: support, status:"Active" },
  { id: "mem_r_alex", organisationId: "brk_ranges", userId: "usr_alex", displayName: "Alex Morgan", mortgageProfile:{position:"Broker"}, capabilities: broker, status:"Active" },
];

const names = [
  ["Mila", "Hart"], ["Noah", "Vale"], ["Asha", "Quinn"], ["Eli", "Stone"], ["Ruby", "March"],
  ["Leo", "West"], ["Ivy", "Lake"], ["Finn", "Arden"], ["Zoe", "Lane"], ["Kai", "Field"],
  ["Maya", "North"], ["Owen", "Banks"], ["Tara", "Wren"], ["Luca", "Dean"], ["Evie", "Blake"],
  ["Arlo", "Moss"], ["Nina", "Fox"], ["Hugo", "Reed"], ["Lena", "Day"], ["Remy", "Clarke"],
] as const;
const statuses: MortgageLeadStatus[] = ["New", "New", "Contact attempted", "Contacted", "Discovery booked", "Nurture", "Closed", "Converted", "New", "Nurture"];
const purposes: LoanPurpose[] = ["Purchase", "Refinance", "Investment purchase", "Construction loan", "Asset finance", "Commercial finance", "Other"];
const sources = ["Website enquiry", "Referral partner", "Client referral", "Google", "Community event"];

export const leads: MortgageLead[] = names.map(([firstName, lastName], index) => {
  const harbour = index < 10;
  const organisationId = harbour ? "brk_harbour" : "brk_ranges";
  const ownerPool = harbour ? [undefined, "mem_h_broker1", "mem_h_broker2"] as const : [undefined, "mem_r_broker1", "mem_r_broker2"] as const;
  const day = 14 - (index % 8);
  return {
    id: `lead_${String(index + 1).padStart(3, "0")}`,
    organisationId,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.test`,
    phone: `0400 000 ${String(index + 1).padStart(3, "0")}`,
    source: sources[index % sources.length],
    referralPartnerName: index % 5 === 1 ? "Bright Path Buyers Agency" : undefined,
    loanPurpose: purposes[index % purposes.length],
    timeframe: ["Immediately", "Within 1 month", "1–3 months", "3–6 months", "Researching"][index % 5] as MortgageLead["timeframe"],
    preferredContactMethod: ["Phone", "Email", "SMS"][index % 3] as MortgageLead["preferredContactMethod"],
    ownerMembershipId: ownerPool[index % ownerPool.length],
    status: statuses[index % statuses.length],
    consentSummary: { email: index % 4 === 0 ? "Not recorded" : "Recorded", sms: index % 5 === 0 ? "Opted out" : "Recorded", phone: "Recorded", source: "Lead enquiry form", recordedAt: `2026-11-${String(day).padStart(2, "0")}T09:00:00+11:00` },
    nextActionAt: `2026-11-${String(index === 5 || index === 9 ? 14 : index % 4 === 0 ? 13 : 14 + (index % 4)).padStart(2, "0")}T${String(9 + (index % 6)).padStart(2, "0")}:00:00+11:00`,
    createdAt: `2026-11-${String(day).padStart(2, "0")}T08:30:00+11:00`,
    updatedAt: `2026-11-${String(Math.min(14, day + 1)).padStart(2, "0")}T10:15:00+11:00`,
    version: 1,
    convertedHouseholdId: statuses[index % statuses.length] === "Converted" ? (harbour ? "household_004" : "household_010") : undefined,
  } satisfies MortgageLead;
});

export const tasks: Task[] = [
  { id: "task_001", organisationId: "brk_harbour", leadId: "lead_004", assignedMembershipId: "mem_h_broker1", title: "Confirm discovery availability", dueAt: "2026-11-13T16:00:00+11:00", priority: "High", status: "Open", version: 1, createdBy: "mem_h_support", createdAt: "2026-11-12T10:00:00+11:00" },
  { id: "task_002", organisationId: "brk_harbour", leadId: "lead_006", assignedMembershipId: "mem_h_broker2", title: "Nurture follow-up", dueAt: "2026-11-14T11:00:00+11:00", priority: "Normal", status: "Open", version: 1, createdBy: "mem_h_support", createdAt: "2026-11-10T09:00:00+11:00" },
  { id: "task_003", organisationId: "brk_ranges", leadId: "lead_016", assignedMembershipId: "mem_r_broker1", title: "Check timing", dueAt: "2026-11-13T14:00:00+11:00", priority: "Normal", status: "Open", version: 1, createdBy: "mem_r_support", createdAt: "2026-11-10T09:00:00+11:00" },
];

export const appointments: Appointment[] = [
  { id: "apt_001", organisationId: "brk_harbour", leadId: "lead_005", assignedMembershipId: "mem_h_broker1", startsAt: "2026-11-14T13:00:00+11:00", durationMinutes: 45, meetingMethod: "Video", locationOrLink: "Prototype video room", notes: "Discovery conversation", status: "Booked" },
  { id: "apt_002", organisationId: "brk_ranges", leadId: "lead_015", assignedMembershipId: "mem_r_broker2", startsAt: "2026-11-14T15:30:00+11:00", durationMinutes: 45, meetingMethod: "Phone", notes: "Discovery conversation", status: "Booked" },
];

const fixtureNow="2026-11-14T12:00:00+11:00";
export const referralPartners:ReferralPartner[]=[
  ["harbour_accounting","Morgan Lee","North Quay Accounting","Accountant","brk_harbour","mem_h_broker1"],
  ["harbour_buyers","Casey Rowan","Bright Path Buyers Agency","Buyer’s agent","brk_harbour","mem_h_broker2"],
  ["harbour_conveyancing","Taylor Finch","Finch Conveyancing","Conveyancer","brk_harbour","mem_h_broker1"],
  ["ranges_agent","Jordan Pike","Ranges Property Co.","Real estate agent","brk_ranges","mem_r_broker1"],
  ["ranges_adviser","Sam Hollow","Hollow Advice","Financial adviser","brk_ranges","mem_r_broker2"],
  ["ranges_client","Jamie Brook",undefined,"Existing client","brk_ranges","mem_r_broker1"],
].map(([slug,name,organisationName,type,organisationId,ownerMembershipId])=>({id:`referral_${slug}`,organisationId,name,organisationName,type,ownerMembershipId,status:"Active",version:1,email:`${String(name).toLowerCase().replace(" ",".")}@example.test`,createdAt:fixtureNow,updatedAt:fixtureNow} as ReferralPartner));
leads.filter(lead=>lead.source==="Referral partner").forEach(lead=>{const options=referralPartners.filter(partner=>partner.organisationId===lead.organisationId);const partner=options[Number(lead.id.slice(-3))%options.length];lead.referralPartnerId=partner.id;lead.referralPartnerName=partner.name;lead.referralPartnerStatus=partner.status;});

const clientNames=[["Ruby","March"],["Ben","March"],["Amelia","Cove"],["Jonah","Cove"],["Sienna","Ford"],["Miles","Ford"],["Grace","Linden"],["Aria","Pace"],["Felix","Pace"],["Mae","River"],["Otis","Wells"],["Nora","Wells"],["Pia","Summit"],["Rory","Summit"],["Ada","Fern"],["Max","Vale"],["Elle","Vale"],["Sol","Bay"]] as const;
export const contacts:Contact[]=clientNames.map(([firstName,lastName],index)=>{const harbour=index<10;return{id:`person_${String(index+1).padStart(3,"0")}`,organisationId:harbour?"brk_harbour":"brk_ranges",firstName,lastName,email:index===0?"ruby.march@example.test":`${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.test`,phone:`0490 100 ${String(index+1).padStart(3,"0")}`,preferredContactMethod:["Phone","Email","SMS"][index%3],status:"Active",createdAt:fixtureNow,updatedAt:fixtureNow} as Contact;});
contacts.find(item=>item.id==="person_005")!.phone="";

const householdBlueprints=[
  ["March household",0,[1]],["Cove household",2,[3]],["Ford household",4,[5]],["Grace Linden",6,[]],["Pace household",7,[8]],["Mae River",9,[]],
  ["Wells household",10,[11]],["Summit household",12,[13]],["Ada Fern",14,[]],["Vale household",15,[]],["Sol Bay",17,[]],["Harper household",16,[]],
] as const;
export const households:Household[]=householdBlueprints.map(([displayName,primaryIndex],index)=>{const harbour=index<6;return{id:`household_${String(index+1).padStart(3,"0")}`,organisationId:harbour?"brk_harbour":"brk_ranges",displayName,primaryContactId:contacts[primaryIndex].id,ownerMembershipId:harbour?(index%2?"mem_h_broker2":"mem_h_broker1"):(index%2?"mem_r_broker2":"mem_r_broker1"),sourceLeadId:index===3?"lead_008":index===9?"lead_018":undefined,referralPartnerId:referralPartners[harbour?index%3:3+(index%3)].id,status:index===9?"Inactive":"Active",createdAt:`2026-0${index%4+7}-10T09:00:00+10:00`,updatedAt:fixtureNow,version:1} as Household;});
export const householdMembers:HouseholdMember[]=householdBlueprints.flatMap(([,primaryIndex,jointIndexes],index)=>[{organisationId:households[index].organisationId,householdId:households[index].id,contactId:contacts[primaryIndex].id,relationship:"Primary applicant"} as HouseholdMember,...jointIndexes.map(personIndex=>({organisationId:households[index].organisationId,householdId:households[index].id,contactId:contacts[personIndex].id,relationship:"Joint applicant"} as HouseholdMember))]);

export const loanRecords:MinimalLoanRecord[]=Array.from({length:14},(_,index)=>{const household=households[index%households.length];const fixedDates=["2026-11-20","2026-12-20","2027-01-25",undefined,"2027-05-01","2026-11-10",undefined,"2027-02-11","2026-12-01",undefined,"2026-11-30","2027-06-01",undefined,"2026-12-14"];const reviewDates=["2026-11-14","2026-11-21","2026-12-10","2026-11-10",undefined,"2026-11-18","2027-03-01","2026-11-13","2026-12-01",undefined,"2026-11-28","2027-01-20","2026-11-16","2026-11-08"];return{id:`loan_${String(index+1).padStart(3,"0")}`,organisationId:household.organisationId,householdId:household.id,ownerMembershipId:household.ownerMembershipId,externalReference:`RET-${String(index+1).padStart(4,"0")}`,lenderName:["Example Mutual","Fictional Bank","Sample Credit Union"][index%3],loanPurpose:["Purchase","Refinance","Investment purchase"][index%3],settlementDate:`202${2+index%4}-0${index%8+1}-15`,fixedRateExpiryDate:fixedDates[index],lastReviewDate:index%3===0?"2025-11-14":undefined,nextReviewDate:reviewDates[index],status:index===5?"Discharged":index===8?"Unknown":"Active",source:"Imported fixture",dataConfidence:index%4===0?"Unverified":"Confirmed",createdAt:fixtureNow,updatedAt:fixtureNow,version:1} as MinimalLoanRecord;});

export const consentRecords:ConsentRecord[]=contacts.flatMap((person,index)=>{const householdMember=householdMembers.find(item=>item.contactId===person.id);if(!householdMember)return[];return(["Email","SMS","Phone"] as const).map((channel,channelIndex)=>({id:`consent_${person.id}_${channel.toLowerCase()}`,organisationId:person.organisationId,subjectReference:{type:"mortgage.household",id:householdMember.householdId},contactId:person.id,channel,status:(index+channelIndex)%7===0?"Opted out":(index+channelIndex)%4===0?"Not recorded":"Recorded",originalSource:"Imported fictional client-book fixture",originalRecordedAt:fixtureNow,recordedAt:fixtureNow,provenance:"Imported fixture"} as ConsentRecord));});
const historicalOpportunities:ReviewOpportunity[]=[
  {id:"review_001_completed",organisationId:"brk_harbour",subjectReference:{type:"mortgage.household",id:"household_001"},householdId:"household_001",loanRecordId:"loan_001",ownerMembershipId:"mem_h_broker1",typeKey:"Annual review",triggerDate:"2026-10-01",lifecycleStatus:"Completed",createdAt:fixtureNow,updatedAt:fixtureNow,completedAt:fixtureNow},
  {id:"review_002_dismissed",organisationId:"brk_harbour",subjectReference:{type:"mortgage.household",id:"household_002"},householdId:"household_002",loanRecordId:"loan_002",ownerMembershipId:"mem_h_broker2",typeKey:"Fixed-rate expiry",triggerDate:"2026-10-10",lifecycleStatus:"Dismissed",createdAt:fixtureNow,updatedAt:fixtureNow,dismissalReason:"Client requested contact next year"},
];
export const reviewOpportunities:ReviewOpportunity[]=[...historicalOpportunities,...generateReviewOpportunities(loanRecords,households,historicalOpportunities,new Date(fixtureNow))];
for(const opportunity of reviewOpportunities){if(!opportunity.ownerMembershipId){opportunity.ownerMembershipId=loanRecords.find(item=>item.id===opportunity.loanRecordId)?.ownerMembershipId;}}
const firstOpenOpportunity=reviewOpportunities.find(item=>item.lifecycleStatus!=="Completed"&&item.lifecycleStatus!=="Dismissed");if(firstOpenOpportunity)firstOpenOpportunity.ownerMembershipId=undefined;

export const activities: MortgageActivityEvent[] = leads.flatMap((lead, index) => {
  const actor = lead.organisationId === "brk_harbour" ? "mem_h_support" : "mem_r_support";
  const created: MortgageActivityEvent = { id: `evt_created_${index}`, organisationId: lead.organisationId, leadId: lead.id, actorMembershipId: actor, occurredAt: lead.createdAt, type: "lead.created", summary: "Lead recorded" };
  if (lead.status === "New") return [created];
  return [created, { id: `evt_status_${index}`, organisationId: lead.organisationId, leadId: lead.id, actorMembershipId: actor, occurredAt: lead.updatedAt, type: "lead.status_changed", summary: `Status changed to ${lead.status}`, oldStatus: "New", newStatus: lead.status } satisfies MortgageActivityEvent];
});

const campaignBlueprints=[
  ["campaign_001","Annual review outreach plan","Draft",annualReviewPurposeKey,annualReviewSourceKey,"Email","mem_h_admin"],
  ["campaign_002","Fixed-rate expiry check-in","Ready for review",fixedExpiryPurposeKey,fixedExpirySourceKey,"Email","mem_h_broker1"],
  ["campaign_003","Approved annual review plan","Approved",annualReviewPurposeKey,annualReviewSourceKey,"Email","mem_h_admin"],
  ["campaign_004","Rejected fixed expiry plan","Rejected",fixedExpiryPurposeKey,fixedExpirySourceKey,"Email","mem_h_broker2"],
]as const;
export const campaigns:Campaign[]=campaignBlueprints.map(([idValue,name,status,,, ,ownerMembershipId],index)=>({id:idValue,organisationId:"brk_harbour",name,ownerMembershipId,status,currentVersionId:`campaign_version_${String(index+1).padStart(3,"0")}`,submittedVersionId:status==="Draft"?undefined:`campaign_version_${String(index+1).padStart(3,"0")}`,createdAt:fixtureNow,updatedAt:fixtureNow} as Campaign));
export const campaignVersions:CampaignVersion[]=campaignBlueprints.map(([, ,status,purposeKey,audienceSourceKey,channel],index)=>({id:`campaign_version_${String(index+1).padStart(3,"0")}`,campaignId:`campaign_${String(index+1).padStart(3,"0")}`,organisationId:"brk_harbour",versionNumber:1,state:status==="Draft"?"Draft":"Frozen",purposeKey,audienceSourceKey,content:{channel,subject:channel!=="Email"?undefined:purposeKey===fixedExpiryPurposeKey?"Your fixed-rate period is ending: time for a review with {{brokerage.name}}":"A review invitation from {{brokerage.name}}",body:channel==="Email"?"Hi {{contact.firstName}}, it may be time to arrange your review with {{broker.displayName}}. [Unsubscribe instructions]":"Hi {{contact.firstName}}, please contact {{brokerage.name}} about your review. [Unsubscribe instructions]",selectedMergeFieldKeys:["contact.firstName","brokerage.name","broker.displayName"]},submittedSnapshotId:status==="Ready for review"?"audience_snapshot_001":status==="Approved"?"audience_snapshot_002":undefined,createdAt:fixtureNow,createdByMembershipId:"mem_h_admin",frozenAt:status==="Draft"?undefined:fixtureNow} as CampaignVersion));
const snapshotRecipient=(input:{id:string;candidateKey:string;subjectId:string;subjectDisplayName:string;contactId:string;contextLabel:string;maskedDestination:string;consentStatus:"Recorded"|"Not recorded"|"Opted out";eligible:boolean;reasonCode?:"consent_opted_out"|"missing_destination";displayReason?:string;fields:Record<string,string>})=>({id:input.id,candidateKey:input.candidateKey,subjectId:input.subjectId,subjectDisplayName:input.subjectDisplayName,contactId:input.contactId,contextLabel:input.contextLabel,maskedDestination:input.maskedDestination,consentStatus:input.consentStatus,suppressionStatus:"None",evaluation:{eligible:input.eligible,primaryReason:input.reasonCode?{code:input.reasonCode,displayReason:input.displayReason!}:undefined,reasons:input.reasonCode?[{code:input.reasonCode,displayReason:input.displayReason!}]:[],evaluatedAt:fixtureNow},resolvedMergeFields:input.fields}) as AudienceSnapshot["recipients"][number];
export const audienceSnapshots:AudienceSnapshot[]=[
  // Generated by the real eligibility evaluator for the email-only campaign_002 (see campaigns.test.ts, "seeded audience matches a fresh evaluation").
  {"id": "audience_snapshot_001", "campaignId": "campaign_002", "campaignVersionId": "campaign_version_002", "organisationId": "brk_harbour", "stage": "Submission", "recipients": [{"id": "recipient_fixture_101", "candidateKey": "review_001_fixed_20261120", "subjectId": "review_001_fixed_20261120", "subjectDisplayName": "March household", "contactId": "person_001", "contextLabel": "Fixed-rate expiry · 2026-11-20", "maskedDestination": "ru•••@example.test", "consentStatus": "Opted out", "suppressionStatus": "None", "evaluation": {"eligible": false, "primaryReason": {"code": "consent_opted_out", "displayReason": "Email consent is opted out"}, "reasons": [{"code": "consent_opted_out", "displayReason": "Email consent is opted out"}], "evaluatedAt": "2026-11-14T01:00:00.000Z"}, "resolvedMergeFields": {"contact.firstName": "Ruby", "brokerage.name": "Harbourlight Mortgage Co.", "broker.displayName": "Dana Ellis"}}, {"id": "recipient_fixture_102", "candidateKey": "review_002_fixed_20261220", "subjectId": "review_002_fixed_20261220", "subjectDisplayName": "Cove household", "contactId": "person_003", "contextLabel": "Fixed-rate expiry · 2026-12-20", "maskedDestination": "am•••@example.test", "consentStatus": "Recorded", "suppressionStatus": "None", "evaluation": {"eligible": true, "reasons": [], "evaluatedAt": "2026-11-14T01:00:00.000Z"}, "resolvedMergeFields": {"contact.firstName": "Amelia", "brokerage.name": "Harbourlight Mortgage Co.", "broker.displayName": "Marcus Bell"}}, {"id": "recipient_fixture_103", "candidateKey": "review_003_fixed_20270125", "subjectId": "review_003_fixed_20270125", "subjectDisplayName": "Ford household", "contactId": "person_005", "contextLabel": "Fixed-rate expiry · 2027-01-25", "maskedDestination": "si•••@example.test", "consentStatus": "Not recorded", "suppressionStatus": "None", "evaluation": {"eligible": false, "primaryReason": {"code": "consent_not_recorded", "displayReason": "Email consent is not recorded"}, "reasons": [{"code": "consent_not_recorded", "displayReason": "Email consent is not recorded"}], "evaluatedAt": "2026-11-14T01:00:00.000Z"}, "resolvedMergeFields": {"contact.firstName": "Sienna", "brokerage.name": "Harbourlight Mortgage Co.", "broker.displayName": "Dana Ellis"}}, {"id": "recipient_fixture_104", "candidateKey": "review_014_fixed_20261214", "subjectId": "review_014_fixed_20261214", "subjectDisplayName": "Cove household", "contactId": "person_003", "contextLabel": "Fixed-rate expiry · 2026-12-14", "maskedDestination": "am•••@example.test", "consentStatus": "Recorded", "suppressionStatus": "None", "evaluation": {"eligible": false, "primaryReason": {"code": "duplicate_recipient", "displayReason": "Duplicate recipient within this campaign version"}, "reasons": [{"code": "duplicate_recipient", "displayReason": "Duplicate recipient within this campaign version"}], "evaluatedAt": "2026-11-14T01:00:00.000Z"}, "resolvedMergeFields": {"contact.firstName": "Amelia", "brokerage.name": "Harbourlight Mortgage Co.", "broker.displayName": "Marcus Bell"}}], "eligibleCount": 1, "excludedCount": 3, "previousSnapshotId": "audience_snapshot_001", "changedSincePrevious": true, "changesSincePrevious": [{"candidateKey": "review_001_fixed_20261120", "contactId": "person_001", "subjectDisplayName": "March household", "type": "Added", "displaySummary": "March household was added to the evaluated audience"}, {"candidateKey": "review_002_fixed_20261220", "contactId": "person_003", "subjectDisplayName": "Cove household", "type": "Added", "displaySummary": "Cove household was added to the evaluated audience"}, {"candidateKey": "review_003_fixed", "contactId": "person_003", "subjectDisplayName": "Cove household", "type": "Removed", "displaySummary": "Cove household was removed from the evaluated audience"}, {"candidateKey": "review_003_fixed_20270125", "contactId": "person_005", "subjectDisplayName": "Ford household", "type": "Added", "displaySummary": "Ford household was added to the evaluated audience"}, {"candidateKey": "review_005_fixed", "contactId": "person_005", "subjectDisplayName": "Ford household", "type": "Removed", "displaySummary": "Ford household was removed from the evaluated audience"}, {"candidateKey": "review_014_fixed_20261214", "contactId": "person_003", "subjectDisplayName": "Cove household", "type": "Added", "displaySummary": "Cove household was added to the evaluated audience"}],"evaluatedAt":fixtureNow} as AudienceSnapshot,
  {id:"audience_snapshot_002",campaignId:"campaign_003",campaignVersionId:"campaign_version_003",organisationId:"brk_harbour",stage:"Approval",evaluatedAt:fixtureNow,eligibleCount:1,excludedCount:1,changedSincePrevious:false,recipients:[
    snapshotRecipient({id:"recipient_fixture_003",candidateKey:"review_003_annual",subjectId:"review_003_annual",subjectDisplayName:"Cove household",contactId:"person_003",contextLabel:"Annual review · 2026-12-10",maskedDestination:"am•••@example.test",consentStatus:"Recorded",eligible:true,fields:{"contact.firstName":"Amelia","brokerage.name":"Harbourlight Mortgage Co.","broker.displayName":"Marcus Bell"}}),
    snapshotRecipient({id:"recipient_fixture_004",candidateKey:"review_001_annual",subjectId:"review_001_annual",subjectDisplayName:"March household",contactId:"person_001",contextLabel:"Annual review · 2026-11-14",maskedDestination:"ru•••@example.test",consentStatus:"Opted out",eligible:false,reasonCode:"consent_opted_out",displayReason:"Email consent is opted out",fields:{"contact.firstName":"Ruby","brokerage.name":"Harbourlight Mortgage Co.","broker.displayName":"Dana Ellis"}}),
  ]},
];
export const approvalRecords:ApprovalRecord[]=[{id:"campaign_approval_001",campaignId:"campaign_003",campaignVersionId:"campaign_version_003",reviewedAudienceSnapshotId:"audience_snapshot_002",audienceSnapshotId:"audience_snapshot_002",organisationId:"brk_harbour",approvingMembershipId:"mem_h_admin",approvedAt:fixtureNow,eligibleRecipientCount:1,excludedRecipientCount:1,noDeliveryOccurred:true}];
export const suppressionRecords:SuppressionRecord[]=[{id:"suppression_001",organisationId:"brk_harbour",contactId:"person_007",scope:"Contact",status:"Active",source:"External suppression fixture",effectiveAt:"2026-11-01T09:00:00+11:00",recordedAt:fixtureNow,actorMembershipId:"mem_h_admin",reason:"Client requested no campaign outreach"}];
export const campaignActivities:CampaignActivityEvent[]=campaignBlueprints.flatMap(([idValue,,status],index)=>{const created={id:`campaign_event_fixture_${index}_created`,campaignId:idValue,campaignVersionId:`campaign_version_${String(index+1).padStart(3,"0")}`,organisationId:"brk_harbour",actorMembershipId:"mem_h_admin",occurredAt:fixtureNow,type:"campaign.created",summary:"Campaign plan created"}as CampaignActivityEvent;if(status==="Rejected")return[created,{...created,id:`campaign_event_fixture_${index}_rejected`,type:"campaign.rejected",summary:"Campaign plan rejected",note:"Revise the sender identification wording"}as CampaignActivityEvent];if(status==="Approved")return[created,{...created,id:`campaign_event_fixture_${index}_approved`,type:"campaign.approved",summary:"Campaign plan approved; no delivery occurred"}as CampaignActivityEvent];return[created];});

export function createFixtureState() {
  return {
    organisations: structuredClone(organisations), users: structuredClone(users), memberships: structuredClone(memberships),
    leads: structuredClone(leads), tasks: structuredClone(tasks), appointments: structuredClone(appointments), activities: structuredClone(activities),
    contacts:structuredClone(contacts),households:structuredClone(households),householdMembers:structuredClone(householdMembers),loanRecords:structuredClone(loanRecords),referralPartners:structuredClone(referralPartners),consentRecords:structuredClone(consentRecords),reviewOpportunities:structuredClone(reviewOpportunities),
    campaigns:structuredClone(campaigns),campaignVersions:structuredClone(campaignVersions),audienceSnapshots:structuredClone(audienceSnapshots),approvalRecords:structuredClone(approvalRecords),suppressionRecords:structuredClone(suppressionRecords),campaignActivities:structuredClone(campaignActivities),
  };
}
export type FixtureState = ReturnType<typeof createFixtureState>;
