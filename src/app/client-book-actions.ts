"use server";

import { organisationTimeZone, zonedLocalToIso } from "@/platform/time/zoned";
import { rateTypes } from "@/verticals/mortgage/loans/models";
import { normaliseHouseholdNote } from "@/verticals/mortgage/households/models";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { resolveActiveOrganisationContext } from "@/platform/organisations/server-context";
import type { TenantContext, UserId } from "@/platform/core/models";
import { SupabaseClientBookRepository } from "@/verticals/mortgage/persistence/supabase-client-book-repository";
import type { ClientBookContactOption, DuplicateMatch } from "@/verticals/mortgage/repositories/client-book-port";

export interface ConversionActionState { ok:boolean; message:string; householdId?:string }
export interface ClientBookActionState { ok:boolean; message:string; householdId?:string }
export interface ManualDuplicateActionState { reviewed:boolean; message:string; primaryMatches:DuplicateMatch[]; jointMatches:DuplicateMatch[] }

export async function searchPersistentContactOptions(searchTerm:string,excludeHouseholdId?:string):Promise<{options:ClientBookContactOption[];message:string}>{
  try{
    const normalized=searchTerm.trim();
    if(normalized.replaceAll(/\s/g,"").length<2)return{options:[],message:"Enter at least two non-whitespace characters."};
    const{context,repository}=await persistentClientBookContext(excludeHouseholdId?`/client-book/${encodeURIComponent(excludeHouseholdId)}`:"/client-book");
    return{options:await repository.searchContactOptions(context,normalized,excludeHouseholdId),message:""};
  }catch(cause){return{options:[],message:cause instanceof Error?cause.message:"Contacts could not be searched."};}
}

export async function runPersistentLeadConversion(_state:ConversionActionState, data:FormData):Promise<ConversionActionState>{
  try {
    const { context, repository } = await persistentClientBookContext("/leads");
    const commandId=value(data,"commandId");
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId)) throw new Error("Close the conversion form and try again.");
    const jointMode=value(data,"jointMode");
    const lender=value(data,"lenderName");
    const result=await repository.convert(context,{
      commandId,leadId:value(data,"leadId"),expectedVersion:integer(data,"expectedVersion"),duplicateDecision:value(data,"duplicateDecision") as "create-new"|"add-existing",displayName:value(data,"displayName"),ownerMembershipId:value(data,"ownerMembershipId"),referralPartnerId:optional(data,"referralPartnerId"),existingHouseholdId:optional(data,"existingHouseholdId"),
      joint:jointMode==="existing"?{existingContactId:value(data,"jointContactId"),relationship:value(data,"jointRelationship") as "Joint applicant"|"Guarantor"|"Other"}:jointMode==="new"?{firstName:value(data,"jointFirstName"),lastName:value(data,"jointLastName"),email:value(data,"jointEmail"),phone:value(data,"jointPhone"),preferredContactMethod:value(data,"jointPreferred"),relationship:value(data,"jointRelationship") as "Joint applicant"|"Guarantor"|"Other"}:undefined,
      loan:lender?{externalReference:optional(data,"loanExternalReference"),lenderName:lender,loanPurpose:value(data,"loanPurpose"),settlementDate:optional(data,"settlementDate"),fixedRateExpiryDate:optional(data,"fixedRateExpiryDate"),lastReviewDate:optional(data,"lastReviewDate"),nextReviewDate:optional(data,"nextReviewDate"),status:"Active",dataConfidence:"Unverified"}:undefined,
    });
    revalidatePath("/today");revalidatePath("/leads");revalidatePath(`/leads/${result.leadId}`);revalidatePath("/client-book");revalidatePath(`/client-book/${result.householdId}`);
    return {ok:true,message:"Lead converted",householdId:result.householdId};
  }catch(cause){return {ok:false,message:cause instanceof Error?cause.message:"The lead could not be converted."};}
}

export async function runPersistentClientBookOperation(_state:ClientBookActionState,data:FormData):Promise<ClientBookActionState>{
  const householdId=value(data,"householdId");
  try{
    const{context,repository,activeMembership}=await persistentClientBookContext(`/client-book/${encodeURIComponent(householdId)}`);const timeZone=organisationTimeZone(activeMembership.organisation);
    const commandId=uuid(data,"commandId"),kind=value(data,"kind");
    if(kind==="add-loan")await repository.addLoan(context,{commandId,householdId,lenderName:required(data,"lenderName"),externalReference:optional(data,"externalReference"),loanPurpose:oneOf(data,"loanPurpose",["Purchase","Refinance","Investment purchase","Construction loan","Asset finance","Commercial finance","Other"]),settlementDate:optionalDate(data,"settlementDate"),lastReviewDate:optionalDate(data,"lastReviewDate"),nextReviewDate:optionalDate(data,"nextReviewDate"),fixedRateExpiryDate:optionalDate(data,"fixedRateExpiryDate"),status:oneOf(data,"status",["Active","Discharged","Unknown"]),dataConfidence:oneOf(data,"dataConfidence",["Confirmed","Unverified"])});
    else if(kind==="update-loan-dates")await repository.updateLoanDates(context,{commandId,loanRecordId:uuid(data,"loanRecordId"),expectedVersion:positiveInteger(data,"expectedVersion"),lastReviewDate:optionalDate(data,"lastReviewDate"),nextReviewDate:optionalDate(data,"nextReviewDate"),fixedRateExpiryDate:optionalDate(data,"fixedRateExpiryDate")});
    else if(kind==="claim-opportunity")await repository.claimOpportunity(context,{commandId,opportunityId:uuid(data,"opportunityId"),expectedVersion:positiveInteger(data,"expectedVersion")});
    else if(kind==="assign-opportunity")await repository.assignOpportunity(context,{commandId,opportunityId:uuid(data,"opportunityId"),expectedVersion:positiveInteger(data,"expectedVersion"),targetMembershipId:uuid(data,"targetMembershipId")});
    else if(kind==="transition-opportunity")await repository.transitionOpportunity(context,{commandId,opportunityId:uuid(data,"opportunityId"),expectedVersion:positiveInteger(data,"expectedVersion"),targetStatus:oneOf(data,"targetStatus",["Review booked","Completed","Dismissed","Reopen"]),dismissalReason:optional(data,"dismissalReason")});
    else if(kind==="create-task")await repository.createHouseholdTask(context,{commandId,householdId,title:required(data,"title"),dueAt:dateTime(data,"dueAt",timeZone),priority:oneOf(data,"priority",["Normal","High"]),assignedMembershipId:uuid(data,"assignedMembershipId")});
    else if(kind==="update-household")await repository.updateHouseholdDetails(context,{commandId,householdId,expectedVersion:positiveInteger(data,"expectedVersion"),displayName:required(data,"displayName"),referralPartnerId:optionalUuid(data,"referralPartnerId")});
    else if(kind==="assign-household")await repository.assignHouseholdOwner(context,{commandId,householdId,expectedVersion:positiveInteger(data,"expectedVersion"),targetMembershipId:uuid(data,"targetMembershipId")});
    else if(kind==="update-primary-contact")await repository.updatePrimaryContact(context,{commandId,householdId,expectedHouseholdVersion:positiveInteger(data,"expectedHouseholdVersion"),expectedContactVersion:positiveInteger(data,"expectedContactVersion"),email:optional(data,"email"),phone:optional(data,"phone"),preferredContactMethod:oneOf(data,"preferredContactMethod",["Phone","Email","SMS"])});
    else if(kind==="add-member")await repository.addHouseholdMember(context,{commandId,householdId,expectedHouseholdVersion:positiveInteger(data,"expectedHouseholdVersion"),existingContactId:value(data,"memberMode")==="existing"?uuid(data,"existingContactId"):undefined,firstName:optional(data,"firstName"),lastName:optional(data,"lastName"),email:optional(data,"email"),phone:optional(data,"phone"),preferredContactMethod:value(data,"memberMode")==="new"?oneOf(data,"preferredContactMethod",["Phone","Email","SMS"]):undefined,relationship:oneOf(data,"relationship",["Joint applicant","Guarantor","Other"]),nameMatchAcknowledged:value(data,"nameMatchAcknowledged")==="yes"});
    else if(kind==="transition-household")await repository.transitionHousehold(context,{commandId,householdId,expectedVersion:positiveInteger(data,"expectedVersion"),targetStatus:oneOf(data,"targetStatus",["Active","Archived"])});
    else if(kind==="add-note")await repository.addHouseholdNote(context,{commandId,householdId,body:normaliseHouseholdNote(required(data,"body"))});
    else if(kind==="set-rate-type"){const rateType=oneOf(data,"rateType",rateTypes);await repository.setLoanRateType(context,{commandId,loanRecordId:uuid(data,"loanRecordId"),expectedVersion:positiveInteger(data,"expectedVersion"),rateType});}
    else if(kind==="transition-task")await repository.transitionHouseholdTask(context,{commandId,taskId:uuid(data,"taskId"),expectedVersion:positiveInteger(data,"expectedVersion"),targetStatus:oneOf(data,"targetStatus",["Completed","Cancelled"])});
    else throw new Error("Choose a valid client-book action.");
    revalidatePath("/today");revalidatePath("/client-book");revalidatePath(`/client-book/${householdId}`);
    return{ok:true,message:"Changes saved"};
  }catch(cause){return{ok:false,message:cause instanceof Error?cause.message:"The change could not be saved."};}
}

export async function previewPersistentManualHousehold(_state:ManualDuplicateActionState,data:FormData):Promise<ManualDuplicateActionState>{
  try{
    const{context,repository}=await persistentClientBookContext("/client-book");
    const primaryMatches=value(data,"primaryMode")==="new"?await repository.previewManualDuplicates(context,{firstName:required(data,"primaryFirstName"),lastName:required(data,"primaryLastName"),email:optional(data,"primaryEmail"),phone:optional(data,"primaryPhone")}):[];
    const jointMatches=value(data,"jointMode")==="new"?await repository.previewManualDuplicates(context,{firstName:required(data,"jointFirstName"),lastName:required(data,"jointLastName"),email:optional(data,"jointEmail"),phone:optional(data,"jointPhone")}):[];
    return{reviewed:true,message:primaryMatches.length||jointMatches.length?"Review the potential matches before creating the household.":"No same-brokerage matches found.",primaryMatches,jointMatches};
  }catch(cause){return{reviewed:false,message:cause instanceof Error?cause.message:"Duplicate review could not be completed.",primaryMatches:[],jointMatches:[]};}
}

export async function runPersistentManualHousehold(_state:ClientBookActionState,data:FormData):Promise<ClientBookActionState>{
  try{
    const{context,repository}=await persistentClientBookContext("/client-book");
    const primaryMode=oneOf(data,"primaryMode",["new","existing"]),jointMode=oneOf(data,"jointMode",["none","new","existing"]);
    const result=await repository.createManualHousehold(context,{commandId:uuid(data,"commandId"),displayName:required(data,"displayName"),ownerMembershipId:uuid(data,"ownerMembershipId"),referralPartnerId:optionalUuid(data,"referralPartnerId"),primary:primaryMode==="existing"?{existingContactId:uuid(data,"primaryExistingContactId")}:{firstName:required(data,"primaryFirstName"),lastName:required(data,"primaryLastName"),email:optional(data,"primaryEmail"),phone:optional(data,"primaryPhone"),preferredContactMethod:oneOf(data,"primaryPreferredContactMethod",["Phone","Email","SMS"] as const),nameMatchAcknowledged:value(data,"primaryNameMatchAcknowledged")==="yes"},joint:jointMode==="none"?undefined:jointMode==="existing"?{existingContactId:uuid(data,"jointExistingContactId"),relationship:oneOf(data,"jointRelationship",["Joint applicant","Guarantor","Other"] as const)}:{firstName:required(data,"jointFirstName"),lastName:required(data,"jointLastName"),email:optional(data,"jointEmail"),phone:optional(data,"jointPhone"),preferredContactMethod:oneOf(data,"jointPreferredContactMethod",["Phone","Email","SMS"] as const),relationship:oneOf(data,"jointRelationship",["Joint applicant","Guarantor","Other"] as const),nameMatchAcknowledged:value(data,"jointNameMatchAcknowledged")==="yes"}});
    const householdId=typeof result.householdId==="string"?result.householdId:undefined;
    revalidatePath("/client-book");if(householdId)revalidatePath(`/client-book/${householdId}`);
    return{ok:true,message:"Client household created",householdId};
  }catch(cause){return{ok:false,message:cause instanceof Error?cause.message:"The household could not be created."};}
}

export async function persistentClientBookContext(returnPath:string){
  const user=await requireVerifiedCurrentUser(returnPath);const {activeMembership}=await resolveActiveOrganisationContext(user);if(!activeMembership)throw new Error("No active brokerage membership is available.");const client=await createServerSupabaseClient();return {user,activeMembership,context:{organisationId:activeMembership.organisationId,userId:user.id as UserId} as TenantContext,repository:new SupabaseClientBookRepository(client)};
}
function value(data:FormData,key:string){return String(data.get(key)??"").trim();}function optional(data:FormData,key:string){return value(data,key)||undefined;}function integer(data:FormData,key:string){const result=Number(value(data,key));if(!Number.isInteger(result))throw new Error("The lead version is invalid.");return result;}
function required(data:FormData,key:string){const result=value(data,key);if(!result)throw new Error("Complete all required fields.");return result;}
function uuid(data:FormData,key:string){const result=value(data,key);if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result))throw new Error("The action reference is invalid. Refresh and try again.");return result;}
function optionalUuid(data:FormData,key:string){const result=optional(data,key);return result?uuid(data,key):undefined;}
function positiveInteger(data:FormData,key:string){const result=Number(value(data,key));if(!Number.isInteger(result)||result<1)throw new Error("The record version is invalid. Refresh and try again.");return result;}
function oneOf<T extends string>(data:FormData,key:string,allowed:readonly T[]){const result=value(data,key);if(!allowed.includes(result as T))throw new Error("Choose a valid option.");return result as T;}
function optionalDate(data:FormData,key:string){const result=optional(data,key);if(result&&!/^\d{4}-\d{2}-\d{2}$/.test(result))throw new Error("Enter a valid date.");return result;}
function dateTime(data:FormData,key:string,timeZone:string){const result=required(data,key);try{return zonedLocalToIso(result,timeZone);}catch{throw new Error("Enter a valid due date and time.");}}
