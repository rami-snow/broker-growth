import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/platform/database/database.types";
import type { TenantContext } from "@/platform/core/models";
import { selectCurrentEffectiveEvidence } from "@/platform/consent/effective-evidence";
import type { ClientBookContactOption, ClientBookDetailSnapshot, ClientBookListItem, ClientBookListQuery, ClientBookListSnapshot, DuplicateMatch, LoanDateOperationInput, ManualHouseholdOperationInput, MinimalLoanOperationInput, PersistentConversionInput, RetentionTodayRow, RetentionTodaySnapshot } from "@/verticals/mortgage/repositories/client-book-port";

type Client = SupabaseClient<Database>;
const PAGE_SIZE = 25;
const householdColumns = "id,organisation_id,display_name,primary_contact_id,owner_membership_id,referral_partner_id,status,created_at,updated_at,version";
const contactColumns = "id,organisation_id,given_name,family_name,email,email_normalized,phone,phone_normalized,preferred_contact_method,status,created_at,updated_at,version";

export class SupabaseClientBookRepository {
  constructor(private readonly client: Client, private readonly now: () => Date = () => new Date()) {}

  async list(context: TenantContext, query: ClientBookListQuery = {}): Promise<ClientBookListSnapshot> {
    const page = Math.max(1, Number.isInteger(query.page) ? query.page! : 1);
    const [households, memberships, profiles, referrals] = await Promise.all([
      this.client.rpc("list_mortgage_households", {
        p_organisation_id: context.organisationId,
        p_search: optionalFilter(query.search),
        p_status: optionalFilter(query.status),
        p_owner_membership_id: optionalFilter(query.ownerMembershipId),
        p_sort: query.sort ?? "name",
        p_page: page,
        p_page_size: PAGE_SIZE,
      }),
      this.client.from("organisation_memberships").select("id,display_name").eq("organisation_id", context.organisationId).eq("status", "Active"),
      this.client.from("mortgage_membership_profiles").select("membership_id,position").eq("organisation_id",context.organisationId),
      this.client.from("mortgage_referral_partners").select("id,name,organisation_name").eq("organisation_id",context.organisationId).eq("status","Active").order("name"),
    ]);
    fail([households.error, memberships.error, profiles.error, referrals.error], "Unable to load the Client Book");
    const payload = object(households.data as Json);
    const rows = jsonArray(payload.rows).map(mapListItem);
    return {
      rows,
      total: jsonNumber(payload.total, "total"),
      page: jsonNumber(payload.page, "page"),
      pageSize: jsonNumber(payload.pageSize, "pageSize"),
      memberships:(memberships.data ?? []).map(row => ({ id:row.id, displayName:row.display_name })),
      brokers:(memberships.data ?? []).filter(row => profiles.data?.some(profile=>profile.membership_id===row.id&&profile.position==="Broker")).map(row=>({id:row.id,displayName:row.display_name})),
      referralPartners:(referrals.data??[]).map(row=>({id:row.id,name:row.name,organisationName:row.organisation_name??undefined})),
    };
  }

  async detail(context: TenantContext, householdId: string): Promise<ClientBookDetailSnapshot | null> {
    const organisationId = context.organisationId;
    const household = await this.client.from("mortgage_households").select(householdColumns).eq("organisation_id", organisationId).eq("id", householdId).maybeSingle();
    if (household.error) throw new Error(`Unable to load client household: ${household.error.message}`);
    if (!household.data) return null;
    const [links, memberships, profiles, loans, conversion, tasks, reviewOpportunities, activities, referrals] = await Promise.all([
      this.client.from("mortgage_household_members").select("contact_id,relationship,is_primary").eq("organisation_id", organisationId).eq("household_id", householdId),
      this.client.from("organisation_memberships").select("id,display_name").eq("organisation_id", organisationId).eq("status", "Active"),
      this.client.from("mortgage_membership_profiles").select("membership_id,position").eq("organisation_id", organisationId),
      this.client.from("mortgage_minimal_loan_records").select("id,external_reference,lender_name,loan_purpose,settlement_date,fixed_rate_expiry_date,last_review_date,next_review_date,status,source,data_confidence,version").eq("organisation_id", organisationId).eq("household_id", householdId),
      this.client.from("mortgage_lead_household_conversions").select("id,lead_id,converted_at,converted_by_membership_id").eq("organisation_id", organisationId).eq("household_id", householdId).order("converted_at", { ascending:false }).limit(1).maybeSingle(),
      this.client.from("tasks").select("id,title,due_at,status,priority,assigned_membership_id,version").eq("organisation_id", organisationId).eq("household_id", householdId).order("due_at"),
      this.client.rpc("list_mortgage_household_review_opportunities" as never, { p_organisation_id:organisationId, p_household_id:householdId } as never),
      this.client.from("activity_events").select("id,event_type,summary,occurred_at,actor_membership_id").eq("organisation_id", organisationId).eq("entity_type", "mortgage.household").eq("entity_id", householdId).order("occurred_at", { ascending:false }).limit(100),
      this.client.from("mortgage_referral_partners").select("id,name,organisation_name").eq("organisation_id",organisationId).eq("status","Active").order("name"),
    ]);
    fail([links.error,memberships.error,profiles.error,loans.error,conversion.error,tasks.error,reviewOpportunities.error,activities.error,referrals.error], "Unable to load client household");
    const contactIds = (links.data ?? []).map(row => row.contact_id);
    const contacts = contactIds.length ? await this.client.from("contacts").select(contactColumns).eq("organisation_id", organisationId).in("id", contactIds) : { data:[], error:null };
    const consent = contactIds.length ? await this.client.from("consent_evidence").select("id,contact_id,channel,status,source,effective_at,recorded_at").eq("organisation_id", organisationId).in("contact_id", contactIds).order("effective_at", { ascending:false }) : { data:[], error:null };
    fail([contacts.error,consent.error], "Unable to load client household");
    const contactMap = new Map((contacts.data ?? []).map(row => [row.id,row]));
    const linkedReferral=household.data.referral_partner_id&&!referrals.data?.some(row=>row.id===household.data!.referral_partner_id)?await this.client.from("mortgage_referral_partners").select("id,name,organisation_name,status").eq("organisation_id",organisationId).eq("id",household.data.referral_partner_id).maybeSingle():{data:null,error:null};
    if(linkedReferral.error)throw new Error(`Unable to load linked referral partner: ${linkedReferral.error.message}`);
    const primary = contactMap.get(household.data.primary_contact_id);
    const membershipMap = new Map((memberships.data ?? []).map(row => [row.id,row.display_name]));
    const positionMap = new Map((profiles.data ?? []).map(row => [row.membership_id,row.position]));
    return {
      household:{ id:household.data.id, displayName:household.data.display_name, status:household.data.status, ownerMembershipId:household.data.owner_membership_id, ownerName:membershipMap.get(household.data.owner_membership_id) ?? "Unavailable", referralPartnerId:household.data.referral_partner_id ?? undefined, primaryContact:{ id:household.data.primary_contact_id, name:primary ? `${primary.given_name} ${primary.family_name}` : "Contact unavailable", email:primary?.email ?? undefined, phone:primary?.phone ?? undefined, preferredContactMethod:primary?.preferred_contact_method??undefined, version:primary?.version??1 }, createdAt:household.data.created_at, version:household.data.version },
      members:(links.data ?? []).map(link => { const person=contactMap.get(link.contact_id); return { contactId:link.contact_id, name:person ? `${person.given_name} ${person.family_name}` : "Contact unavailable", email:person?.email ?? undefined, phone:person?.phone ?? undefined, relationship:link.relationship, isPrimary:link.is_primary }; }),
      consent:selectCurrentHouseholdConsent(
        consent.data ?? [],
        (links.data ?? []).map(link => ({ contactId:link.contact_id, contactName:contactMap.has(link.contact_id) ? `${contactMap.get(link.contact_id)!.given_name} ${contactMap.get(link.contact_id)!.family_name}` : "Contact unavailable" })),
        this.now(),
      ),
      loans:(loans.data ?? []).map(row => ({ id:row.id, externalReference:row.external_reference ?? undefined, lenderName:row.lender_name, loanPurpose:row.loan_purpose, settlementDate:row.settlement_date ?? undefined, fixedRateExpiryDate:row.fixed_rate_expiry_date ?? undefined, lastReviewDate:row.last_review_date ?? undefined, nextReviewDate:row.next_review_date ?? undefined, status:row.status, source:row.source, dataConfidence:row.data_confidence, version:row.version })),
      conversion:conversion.data ? { id:conversion.data.id, leadId:conversion.data.lead_id, convertedAt:conversion.data.converted_at, convertedByMembershipId:conversion.data.converted_by_membership_id } : undefined,
      tasks:(tasks.data ?? []).map(row => ({ id:row.id, title:row.title, dueAt:row.due_at, status:row.status, priority:row.priority, assignedMembershipId:row.assigned_membership_id, version:row.version })),
      opportunities:((reviewOpportunities.data ?? []) as unknown as ReviewOpportunityRow[]).map(row => ({ id:row.opportunity_id, loanRecordId:row.loan_record_id, type:row.trigger_type, triggerDate:row.trigger_date, status:row.effective_status, ownerMembershipId:row.owner_membership_id ?? undefined, ownerName:row.owner_name ?? undefined, version:row.version, completedAt:row.completed_at ?? undefined, dismissalReason:row.dismissal_reason ?? undefined })),
      memberships:(memberships.data ?? []).map(row => ({ id:row.id, displayName:row.display_name, position:positionMap.get(row.id) ?? "Unavailable" })),
      referralPartners:[...(referrals.data??[]).map(row=>({id:row.id,name:row.name,organisationName:row.organisation_name??undefined,status:"Active" as const})),...(linkedReferral.data?[{id:linkedReferral.data.id,name:linkedReferral.data.name,organisationName:linkedReferral.data.organisation_name??undefined,status:linkedReferral.data.status as "Active"|"Inactive"}]:[])],
      activities:(activities.data ?? []).map(row => ({ id:row.id, eventType:row.event_type, summary:row.summary, occurredAt:row.occurred_at, actorMembershipId:row.actor_membership_id ?? undefined })),
    };
  }

  async searchContactOptions(context:TenantContext,searchTerm:string,excludeHouseholdId?:string):Promise<ClientBookContactOption[]>{
    const{data,error}=await this.client.rpc("search_mortgage_contact_options" as never,{p_organisation_id:context.organisationId,p_search_term:searchTerm,p_exclude_household_id:excludeHouseholdId??null} as never);
    if(error)throw operationError(error.message);
    return ((data??[]) as unknown as ContactOptionRow[]).map(row=>({id:row.contact_id,name:row.contact_name,email:row.email??undefined,phone:row.phone??undefined}));
  }

  async duplicates(context: TenantContext, leadId: string): Promise<DuplicateMatch[]> {
    const { data, error } = await this.client.rpc("find_mortgage_lead_household_duplicates", {
      p_organisation_id: context.organisationId,
      p_lead_id: leadId,
    });
    if (error) throw new Error(`Unable to review duplicates: ${error.message}`);
    return (data ?? []).map(row => ({
      householdId: row.household_id,
      householdName: row.household_name,
      contactId: row.contact_id,
      contactName: row.contact_name,
      reasons: row.reasons as DuplicateMatch["reasons"],
    }));
  }

  async previewManualDuplicates(context:TenantContext,input:{firstName:string;lastName:string;email?:string;phone?:string}):Promise<DuplicateMatch[]>{
    const{data,error}=await this.client.rpc("preview_mortgage_manual_contact_duplicates" as never,{p_organisation_id:context.organisationId,p_given_name:input.firstName,p_family_name:input.lastName,p_email:input.email??null,p_phone:input.phone??null} as never);
    if(error)throw operationError(error.message);
    return ((data??[]) as unknown as ManualDuplicateRow[]).map(row=>({householdId:row.households[0]?.householdId??"",householdName:row.households[0]?.householdName??"No household",contactId:row.contact_id,contactName:row.contact_name,email:row.email??undefined,phone:row.phone??undefined,reasons:row.reasons,households:row.households}));
  }

  async createManualHousehold(context:TenantContext,input:ManualHouseholdOperationInput){return this.operation("create_mortgage_household_manual",{organisation_id:context.organisationId,command_id:input.commandId,display_name:input.displayName,owner_membership_id:input.ownerMembershipId,referral_partner_id:input.referralPartnerId??null,primary_existing_contact_id:input.primary.existingContactId??null,primary_first_name:input.primary.firstName??null,primary_last_name:input.primary.lastName??null,primary_email:input.primary.email??null,primary_phone:input.primary.phone??null,primary_preferred_contact_method:input.primary.preferredContactMethod??null,primary_name_match_acknowledged:input.primary.nameMatchAcknowledged??false,joint_mode:input.joint?(input.joint.existingContactId?"existing":"new"):"none",joint_existing_contact_id:input.joint?.existingContactId??null,joint_first_name:input.joint?.firstName??null,joint_last_name:input.joint?.lastName??null,joint_email:input.joint?.email??null,joint_phone:input.joint?.phone??null,joint_preferred_contact_method:input.joint?.preferredContactMethod??null,joint_relationship:input.joint?.relationship??null,joint_name_match_acknowledged:input.joint?.nameMatchAcknowledged??false});}

  async convert(context: TenantContext, input: PersistentConversionInput) {
    const { data, error } = await this.client.rpc("convert_mortgage_lead_to_household", {
      organisation_id:context.organisationId, command_id:input.commandId, lead_id:input.leadId, expected_version:input.expectedVersion, duplicate_decision:input.duplicateDecision, display_name:input.displayName, owner_membership_id:input.ownerMembershipId, referral_partner_id:input.referralPartnerId, existing_household_id:input.existingHouseholdId, joint_contact_id:input.joint?.existingContactId, joint_first_name:input.joint?.firstName, joint_last_name:input.joint?.lastName, joint_email:input.joint?.email, joint_phone:input.joint?.phone, joint_preferred_contact_method:input.joint?.preferredContactMethod, joint_relationship:input.joint?.relationship, loan_external_reference:input.loan?.externalReference, loan_lender_name:input.loan?.lenderName, loan_purpose:input.loan?.loanPurpose, loan_settlement_date:input.loan?.settlementDate, loan_fixed_rate_expiry_date:input.loan?.fixedRateExpiryDate, loan_last_review_date:input.loan?.lastReviewDate, loan_next_review_date:input.loan?.nextReviewDate, loan_status:input.loan?.status, loan_data_confidence:input.loan?.dataConfidence,
    });
    if (error) throw conversionError(error.message);
    const result = object(data as Json);
    if (typeof result.householdId !== "string" || typeof result.leadId !== "string" || typeof result.version !== "number") throw new Error("The conversion returned an invalid result.");
    return { householdId:result.householdId, leadId:result.leadId, version:result.version };
  }

  async retentionToday(context:TenantContext):Promise<RetentionTodaySnapshot>{
    const {data,error}=await this.client.rpc("read_mortgage_retention_today" as never,{p_organisation_id:context.organisationId,p_limit:25} as never);
    if(error)throw new Error(`Unable to load retention queues: ${error.message}`);
    const payload=object(data as Json);
    return {businessDate:jsonString(payload.businessDate,"business date"),annualDueTotal:jsonNumber(payload.annualDueTotal,"annual total"),fixedApproachingTotal:jsonNumber(payload.fixedApproachingTotal,"fixed total"),unassignedTotal:jsonNumber(payload.unassignedTotal,"unassigned total"),annualDue:jsonArray(payload.annualDue).map(mapRetentionRow),fixedApproaching:jsonArray(payload.fixedApproaching).map(mapRetentionRow),unassigned:jsonArray(payload.unassigned).map(mapRetentionRow)};
  }

  async addLoan(context:TenantContext,input:MinimalLoanOperationInput){return this.operation("add_mortgage_minimal_loan_record",{organisation_id:context.organisationId,command_id:input.commandId,household_id:input.householdId,external_reference:input.externalReference??null,lender_name:input.lenderName,loan_purpose:input.loanPurpose,settlement_date:input.settlementDate??null,fixed_rate_expiry_date:input.fixedRateExpiryDate??null,last_review_date:input.lastReviewDate??null,next_review_date:input.nextReviewDate??null,loan_status:input.status,data_confidence:input.dataConfidence});}
  async updateLoanDates(context:TenantContext,input:LoanDateOperationInput){return this.operation("update_mortgage_loan_review_dates",{organisation_id:context.organisationId,command_id:input.commandId,loan_record_id:input.loanRecordId,expected_version:input.expectedVersion,next_review_date:input.nextReviewDate??null,fixed_rate_expiry_date:input.fixedRateExpiryDate??null,last_review_date:input.lastReviewDate??null});}
  async claimOpportunity(context:TenantContext,input:{commandId:string;opportunityId:string;expectedVersion:number}){return this.operation("claim_mortgage_review_opportunity",{organisation_id:context.organisationId,command_id:input.commandId,opportunity_id:input.opportunityId,expected_version:input.expectedVersion});}
  async assignOpportunity(context:TenantContext,input:{commandId:string;opportunityId:string;expectedVersion:number;targetMembershipId:string}){return this.operation("assign_mortgage_review_opportunity",{organisation_id:context.organisationId,command_id:input.commandId,opportunity_id:input.opportunityId,expected_version:input.expectedVersion,target_membership_id:input.targetMembershipId});}
  async transitionOpportunity(context:TenantContext,input:{commandId:string;opportunityId:string;expectedVersion:number;targetStatus:string;dismissalReason?:string}){return this.operation("transition_mortgage_review_opportunity",{organisation_id:context.organisationId,command_id:input.commandId,opportunity_id:input.opportunityId,expected_version:input.expectedVersion,target_status:input.targetStatus,dismissal_reason:input.dismissalReason??null});}
  async createHouseholdTask(context:TenantContext,input:{commandId:string;householdId:string;title:string;dueAt:string;priority:string;assignedMembershipId:string}){return this.operation("create_mortgage_household_task",{organisation_id:context.organisationId,command_id:input.commandId,household_id:input.householdId,title:input.title,due_at:input.dueAt,priority:input.priority,assigned_membership_id:input.assignedMembershipId});}
  async updateHouseholdDetails(context:TenantContext,input:{commandId:string;householdId:string;expectedVersion:number;displayName:string;referralPartnerId?:string}){return this.operation("update_mortgage_household_details",{organisation_id:context.organisationId,command_id:input.commandId,household_id:input.householdId,expected_version:input.expectedVersion,display_name:input.displayName,referral_partner_id:input.referralPartnerId??null});}
  async assignHouseholdOwner(context:TenantContext,input:{commandId:string;householdId:string;expectedVersion:number;targetMembershipId:string}){return this.operation("assign_mortgage_household_owner",{organisation_id:context.organisationId,command_id:input.commandId,household_id:input.householdId,expected_version:input.expectedVersion,target_membership_id:input.targetMembershipId});}
  async updatePrimaryContact(context:TenantContext,input:{commandId:string;householdId:string;expectedHouseholdVersion:number;expectedContactVersion:number;email?:string;phone?:string;preferredContactMethod:string}){return this.operation("update_mortgage_primary_contact",{organisation_id:context.organisationId,command_id:input.commandId,household_id:input.householdId,expected_household_version:input.expectedHouseholdVersion,expected_contact_version:input.expectedContactVersion,email:input.email??null,phone:input.phone??null,preferred_contact_method:input.preferredContactMethod});}
  async addHouseholdMember(context:TenantContext,input:{commandId:string;householdId:string;expectedHouseholdVersion:number;existingContactId?:string;firstName?:string;lastName?:string;email?:string;phone?:string;preferredContactMethod?:string;relationship:string;nameMatchAcknowledged?:boolean}){return this.operation("add_mortgage_household_member",{organisation_id:context.organisationId,command_id:input.commandId,household_id:input.householdId,expected_household_version:input.expectedHouseholdVersion,member_mode:input.existingContactId?"existing":"new",existing_contact_id:input.existingContactId??null,first_name:input.firstName??null,last_name:input.lastName??null,email:input.email??null,phone:input.phone??null,preferred_contact_method:input.preferredContactMethod??null,relationship:input.relationship,name_match_acknowledged:input.nameMatchAcknowledged??false});}
  async transitionHousehold(context:TenantContext,input:{commandId:string;householdId:string;expectedVersion:number;targetStatus:"Active"|"Archived"}){return this.operation("transition_mortgage_household_status",{organisation_id:context.organisationId,command_id:input.commandId,household_id:input.householdId,expected_version:input.expectedVersion,target_status:input.targetStatus});}
  async transitionHouseholdTask(context:TenantContext,input:{commandId:string;taskId:string;expectedVersion:number;targetStatus:"Completed"|"Cancelled"}){return this.operation("transition_mortgage_household_task",{organisation_id:context.organisationId,command_id:input.commandId,task_id:input.taskId,expected_version:input.expectedVersion,target_status:input.targetStatus});}

  private async operation(name:string,args:Record<string,string|number|boolean|null>){const{data,error}=await this.client.rpc(name as never,args as never);if(error)throw operationError(error.message);return object(data as Json);}
}

function object(value:Json):Record<string,Json|undefined>{ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function jsonArray(value:Json|undefined):Json[]{ return Array.isArray(value) ? value : []; }
function jsonString(value:Json|undefined, label:string):string { if(typeof value!=="string") throw new Error(`The Client Book returned an invalid ${label}.`); return value; }
function jsonNumber(value:Json|undefined, label:string):number { if(typeof value!=="number") throw new Error(`The Client Book returned an invalid ${label}.`); return value; }
function optionalString(value:Json|undefined):string|undefined { return typeof value==="string" ? value : undefined; }
function optionalFilter(value:string|undefined):string|undefined { const normalized=value?.trim(); return normalized || undefined; }
function mapListItem(value:Json):ClientBookListItem { const row=object(value); return { id:jsonString(row.id,"household ID"),displayName:jsonString(row.displayName,"display name"),status:jsonString(row.status,"status"),ownerMembershipId:jsonString(row.ownerMembershipId,"owner membership ID"),ownerName:jsonString(row.ownerName,"owner name"),primaryContact:{id:jsonString(row.primaryContactId,"primary contact ID"),name:jsonString(row.primaryContactName,"primary contact name"),email:optionalString(row.primaryContactEmail),phone:optionalString(row.primaryContactPhone)},referralPartnerId:optionalString(row.referralPartnerId),referralPartnerName:optionalString(row.referralPartnerName),referralPartnerStatus:optionalString(row.referralPartnerStatus) as "Active"|"Inactive"|undefined,createdAt:jsonString(row.createdAt,"created timestamp"),version:typeof row.version==="number"?row.version:1 }; }
function mapRetentionRow(value:Json):RetentionTodayRow{const row=object(value);return{opportunityId:jsonString(row.opportunityId,"opportunity ID"),householdId:jsonString(row.householdId,"household ID"),householdName:jsonString(row.householdName,"household name"),triggerType:jsonString(row.triggerType,"trigger type"),triggerDate:jsonString(row.triggerDate,"trigger date"),effectiveStatus:jsonString(row.effectiveStatus,"effective status"),ownerMembershipId:optionalString(row.ownerMembershipId),ownerName:optionalString(row.ownerName),version:jsonNumber(row.version,"version")};}
function fail(errors:Array<{message:string}|null>, prefix:string){ const error=errors.find(Boolean); if(error) throw new Error(`${prefix}: ${error.message}`); }
function conversionError(message:string){ if(message.includes("STALE_LEAD_VERSION")) return new Error("This lead changed while you were reviewing it. Refresh and try again."); if(message.includes("CAPABILITY_REQUIRED")||message.includes("OWNERSHIP_REQUIRED")||message.includes("OWNER_MUST")) return new Error("You do not have permission to convert this lead with those selections."); if(message.includes("JOINT_CONTACT_DUPLICATE")) return new Error("That joint client already exists. Select the existing contact instead of creating a duplicate."); return new Error(message.replace(/^.*?([A-Z][A-Z0-9_:-]+).*$/s,"$1").replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase())); }
function operationError(message:string){if(message.includes("STALE_"))return new Error("This record changed while you were reviewing it. Refresh and try again.");if(message.includes("EXACT_CONTACT_MATCH_REQUIRES_EXISTING"))return new Error("An exact email or phone match already exists. Select that existing contact instead.");if(message.includes("NAME_MATCH_ACKNOWLEDGEMENT_REQUIRED"))return new Error("A contact with the same name exists. Review the match and explicitly acknowledge it before creating another contact.");if(message.includes("CONTACT_DETAIL_COLLISION"))return new Error("That email or phone belongs to another contact. Select the existing contact or enter different details.");if(message.includes("HOUSEHOLD_ARCHIVE_OPEN_OPPORTUNITIES"))return new Error("Complete or dismiss every open review opportunity before archiving this household.");if(message.includes("HOUSEHOLD_ARCHIVE_OPEN_TASKS"))return new Error("Complete or cancel every open household task before archiving this household.");if(message.includes("ARCHIVED_HOUSEHOLD")||message.includes("ACTIVE_HOUSEHOLD_REQUIRED"))return new Error("Reactivate this household before making ordinary changes.");if(message.includes("TASK_TERMINAL"))return new Error("Completed and cancelled tasks cannot be changed.");if(message.includes("ALREADY_ASSIGNED"))return new Error("This opportunity was claimed or assigned by another user. Refresh to see its current owner.");if(message.includes("REVIEW_BOOKED_DATE_CHANGE_BLOCKED"))return new Error("Complete or dismiss the booked review before changing its trigger date.");if(message.includes("OWNERSHIP_REQUIRED")||message.includes("CAPABILITY_REQUIRED")||message.includes("ASSIGNEE_OR_ADMIN_REQUIRED"))return new Error("You do not have permission to perform this action.");if(message.includes("DISMISSAL_REASON_REQUIRED"))return new Error("Enter a reason before dismissing this opportunity.");if(message.includes("COMPLETED_OPPORTUNITY_TERMINAL"))return new Error("Completed opportunities cannot be changed.");if(message.includes("COMMAND_ID_REUSE_CONFLICT"))return new Error("This action token was already used for different changes. Close the dialog and try again.");return new Error(message.replace(/^.*?([A-Z][A-Z0-9_:-]+).*$/s,"$1").replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase()));}

type ReviewOpportunityRow={opportunity_id:string;loan_record_id:string;trigger_type:string;trigger_date:string;effective_status:string;owner_membership_id:string|null;owner_name:string|null;version:number;completed_at:string|null;dismissal_reason:string|null};
type ManualDuplicateRow={contact_id:string;contact_name:string;email:string|null;phone:string|null;reasons:DuplicateMatch["reasons"];households:NonNullable<DuplicateMatch["households"]>};
type ContactOptionRow={contact_id:string;contact_name:string;email:string|null;phone:string|null};

type ConsentEvidenceRow = { id:string; contact_id:string; channel:string; status:string; source:string; effective_at:string; recorded_at:string };
type ConsentMember = { contactId:string; contactName:string };
const consentChannels = ["Email", "SMS", "Phone"] as const;

export function selectCurrentHouseholdConsent(
  rows: readonly ConsentEvidenceRow[],
  members: readonly ConsentMember[],
  referenceTime: Date,
): ClientBookDetailSnapshot["consent"] {
  return members.flatMap(member => consentChannels.map(channel => {
    const selected = selectCurrentEffectiveEvidence(
      rows.filter(row => row.contact_id === member.contactId && row.channel === channel)
        .map(row => ({ ...row, effectiveAt:row.effective_at, recordedAt:row.recorded_at })),
      referenceTime,
    );
    return selected ? {
      contactId:member.contactId,
      contactName:member.contactName,
      channel,
      status:selected.status as "Recorded"|"Not recorded"|"Opted out",
      evidenceId:selected.id,
      source:selected.source,
      effectiveAt:selected.effective_at,
      recordedAt:selected.recorded_at,
    } : { contactId:member.contactId, contactName:member.contactName, channel, status:"Missing" as const };
  }));
}
