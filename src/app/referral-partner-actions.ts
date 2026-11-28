"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { resolveActiveOrganisationContext } from "@/platform/organisations/server-context";
import type { TenantContext, UserId } from "@/platform/core/models";
import { SupabaseReferralPartnerRepository } from "@/verticals/mortgage/persistence/supabase-referral-partner-repository";
import { normaliseNextStep } from "@/verticals/mortgage/referrals/models";
import { mortgageReferralPartnerTypes } from "@/verticals/mortgage/referrals/models";
import type { ReferralDuplicateMatch } from "@/verticals/mortgage/repositories/referral-partner-port";

export interface ReferralActionState{ok:boolean;message:string;referralPartnerId?:string}
export interface ReferralPreviewState{reviewed:boolean;message:string;matches:ReferralDuplicateMatch[]}

export async function previewReferralDuplicates(_state:ReferralPreviewState,data:FormData):Promise<ReferralPreviewState>{
  try{const{context,repository}=await persistentReferralContext("/referral-partners");const matches=await repository.previewDuplicates(context,{name:required(data,"name"),organisationName:optional(data,"organisationName"),email:optional(data,"email")});return{reviewed:true,message:matches.length?"Review the possible same-brokerage matches.":"No possible same-brokerage duplicates found.",matches};}catch(cause){return{reviewed:false,message:error(cause),matches:[]};}
}
export async function runReferralPartnerAction(_state:ReferralActionState,data:FormData):Promise<ReferralActionState>{
  const id=optional(data,"referralPartnerId");
  try{const{context,repository}=await persistentReferralContext(id?`/referral-partners/${encodeURIComponent(id)}`:"/referral-partners");const operation=value(data,"operation"),commandId=uuid(data,"commandId");let result:Record<string,unknown>;
    if(operation==="create")result=await repository.create(context,{commandId,name:required(data,"name"),organisationName:optional(data,"organisationName"),type:oneOf(data,"type",mortgageReferralPartnerTypes),email:optional(data,"email"),phone:optional(data,"phone"),ownerMembershipId:uuid(data,"ownerMembershipId"),duplicateNameAcknowledged:value(data,"duplicateNameAcknowledged")==="yes"});
    else if(operation==="update")result=await repository.update(context,{commandId,referralPartnerId:uuid(data,"referralPartnerId"),expectedVersion:positiveInteger(data,"expectedVersion"),name:required(data,"name"),organisationName:optional(data,"organisationName"),type:oneOf(data,"type",mortgageReferralPartnerTypes),email:optional(data,"email"),phone:optional(data,"phone")});
    else if(operation==="assign")result=await repository.assign(context,{commandId,referralPartnerId:uuid(data,"referralPartnerId"),expectedVersion:positiveInteger(data,"expectedVersion"),targetMembershipId:uuid(data,"targetMembershipId")});
    else if(operation==="transition")result=await repository.transition(context,{commandId,referralPartnerId:uuid(data,"referralPartnerId"),expectedVersion:positiveInteger(data,"expectedVersion"),targetStatus:oneOf(data,"targetStatus",["Active","Inactive"] as const)});
    else if(operation==="next-step")result=await repository.setNextStep(context,{commandId,referralPartnerId:uuid(data,"referralPartnerId"),expectedVersion:positiveInteger(data,"expectedVersion"),nextStep:normaliseNextStep(optional(data,"nextStep"))});
    else throw new Error("Choose a valid referral-partner action.");
    const referralPartnerId=String(result.referralPartnerId??id??"");revalidatePath("/referral-partners");if(referralPartnerId)revalidatePath(`/referral-partners/${referralPartnerId}`);revalidatePath("/leads");revalidatePath("/client-book");return{ok:true,message:"Referral partner saved",referralPartnerId};
  }catch(cause){return{ok:false,message:error(cause)};}
}
export async function persistentReferralContext(returnPath:string){const user=await requireVerifiedCurrentUser(returnPath);const{activeMembership}=await resolveActiveOrganisationContext(user);if(!activeMembership)throw new Error("No active brokerage membership is available.");const client=await createServerSupabaseClient();return{user,activeMembership,context:{organisationId:activeMembership.organisationId,userId:user.id as UserId} as TenantContext,repository:new SupabaseReferralPartnerRepository(client)};}
function value(data:FormData,key:string){return String(data.get(key)??"").trim();}function optional(data:FormData,key:string){return value(data,key)||undefined;}function required(data:FormData,key:string){const result=value(data,key);if(!result)throw new Error("Complete all required fields.");return result;}function uuid(data:FormData,key:string){const result=value(data,key);if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result))throw new Error("The action reference is invalid. Refresh and try again.");return result;}function positiveInteger(data:FormData,key:string){const result=Number(value(data,key));if(!Number.isInteger(result)||result<1)throw new Error("The record version is invalid. Refresh and try again.");return result;}function oneOf<T extends string>(data:FormData,key:string,allowed:readonly T[]){const result=value(data,key);if(!allowed.includes(result as T))throw new Error("Choose a valid option.");return result as T;}function error(cause:unknown){return cause instanceof Error?cause.message:"The referral-partner action could not be completed.";}
