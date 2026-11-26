import type { ReferredLead } from "@/verticals/mortgage/referrals/relationship";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/platform/database/database.types";
import type { TenantContext } from "@/platform/core/models";
import type { ReferralDuplicateMatch, ReferralPartnerDetailSnapshot, ReferralPartnerListQuery, ReferralPartnerListSnapshot, ReferralPartnerMutationInput, ReferralPartnerSummary } from "@/verticals/mortgage/repositories/referral-partner-port";

type Client=SupabaseClient<Database>;
const PAGE_SIZE=25;
const partnerColumns="id,name,organisation_name,partner_type,email,phone,owner_membership_id,status,version,created_at,updated_at";

export class SupabaseReferralPartnerRepository {
  constructor(private readonly client:Client){}

  async list(context:TenantContext,query:ReferralPartnerListQuery={}):Promise<ReferralPartnerListSnapshot>{
    const page=Math.max(1,Number.isInteger(query.page)?query.page!:1),from=(page-1)*PAGE_SIZE;
    let request=this.client.from("mortgage_referral_partners").select(partnerColumns,{count:"exact"})
      .eq("organisation_id",context.organisationId);
    const search=query.search?.trim();
    if(search){const pattern=`%${escapeLike(search.toLowerCase())}%`,digits=search.replace(/\D/g,"");const filters=[`name_normalized.ilike.${pattern}`,`organisation_name_normalized.ilike.${pattern}`,`email_normalized.ilike.${pattern}`];if(digits)filters.push(`phone_normalized.ilike.%${escapeLike(digits)}%`);request=request.or(filters.join(","));}
    if(query.status)request=request.eq("status",query.status);
    if(query.type)request=request.eq("partner_type",query.type);
    if(query.ownerMembershipId)request=request.eq("owner_membership_id",query.ownerMembershipId);
    request=query.sort==="recent"?request.order("created_at",{ascending:false}).order("id"):
      request.order("name_normalized").order("id");
    const [partners,brokers]=await Promise.all([request.range(from,from+PAGE_SIZE-1),this.brokers(context)]);
    if(partners.error)throw new Error(`Unable to load referral partners: ${partners.error.message}`);
    const names=await this.membershipNames(context,(partners.data??[]).map(row=>row.owner_membership_id));
    return{rows:(partners.data??[]).map(row=>mapPartner(row,names.get(row.owner_membership_id))),total:partners.count??0,page,pageSize:PAGE_SIZE,brokers};
  }

  async detail(context:TenantContext,id:string):Promise<ReferralPartnerDetailSnapshot|null>{
    const partner=await this.client.from("mortgage_referral_partners").select(partnerColumns)
      .eq("organisation_id",context.organisationId).eq("id",id).maybeSingle();
    if(partner.error)throw new Error(`Unable to load referral partner: ${partner.error.message}`);
    if(!partner.data)return null;
    const [details,households,activities,brokers]=await Promise.all([
      this.client.from("mortgage_lead_details").select("lead_id").eq("organisation_id",context.organisationId).eq("referral_partner_id",id),
      this.client.from("mortgage_households").select("id,display_name,status,created_at").eq("organisation_id",context.organisationId).eq("referral_partner_id",id).order("created_at",{ascending:false}),
      this.client.from("activity_events").select("id,event_type,summary,occurred_at,actor_membership_id").eq("organisation_id",context.organisationId).eq("entity_type","mortgage.referral_partner").eq("entity_id",id).order("occurred_at",{ascending:false}).limit(100),
      this.brokers(context),
    ]);
    fail([details.error,households.error,activities.error],"Unable to load referral partner");
    const leadIds=(details.data??[]).map(row=>row.lead_id);
    const leads=leadIds.length?await this.client.from("leads").select("id,contact_id,lifecycle_status,source,created_at").eq("organisation_id",context.organisationId).in("id",leadIds).order("created_at",{ascending:false}):{data:[],error:null};
    if(leads.error)throw new Error(`Unable to load attributed leads: ${leads.error.message}`);
    const contactIds=(leads.data??[]).flatMap(row=>row.contact_id?[row.contact_id]:[]);
    const contacts=contactIds.length?await this.client.from("contacts").select("id,given_name,family_name").eq("organisation_id",context.organisationId).in("id",contactIds):{data:[],error:null};
    if(contacts.error)throw new Error(`Unable to load attributed lead contacts: ${contacts.error.message}`);
    const contactNames=new Map((contacts.data??[]).map(row=>[row.id,`${row.given_name} ${row.family_name}`]));
    const names=await this.membershipNames(context,[partner.data.owner_membership_id]);
    return{partner:mapPartner(partner.data,names.get(partner.data.owner_membership_id)),brokers,
      leads:(leads.data??[]).map(row=>({id:row.id,name:contactNames.get(row.contact_id??"")??"Contact details restricted",status:row.lifecycle_status,source:row.source,createdAt:row.created_at})),
      households:(households.data??[]).map(row=>({id:row.id,displayName:row.display_name,status:row.status,createdAt:row.created_at})),
      activities:(activities.data??[]).map(row=>({id:row.id,eventType:row.event_type,summary:row.summary,occurredAt:row.occurred_at,actorMembershipId:row.actor_membership_id??undefined}))};
  }

  /** Read-only lead attribution facts for partner relationship metrics. Explicit columns; RLS still applies. */
  async referredLeads(context:TenantContext):Promise<ReferredLead[]>{
    const details=await this.client.from("mortgage_lead_details").select("lead_id,referral_partner_id").eq("organisation_id",context.organisationId).not("referral_partner_id","is",null);
    if(details.error)throw new Error(`Unable to load referral attribution: ${details.error.message}`);
    const ids=(details.data??[]).map(row=>row.lead_id);if(!ids.length)return[];
    const leads=await this.client.from("leads").select("id,created_at,lifecycle_status").eq("organisation_id",context.organisationId).in("id",ids);
    if(leads.error)throw new Error(`Unable to load referral attribution: ${leads.error.message}`);
    return (details.data??[]).flatMap(row=>{const lead=leads.data?.find(item=>item.id===row.lead_id);return lead&&row.referral_partner_id?[{referralPartnerId:row.referral_partner_id,createdAt:lead.created_at,status:lead.lifecycle_status}]:[];});
  }
  async activeOptions(context:TenantContext){const{data,error}=await this.client.from("mortgage_referral_partners").select("id,name,organisation_name").eq("organisation_id",context.organisationId).eq("status","Active").order("name_normalized").order("id");if(error)throw new Error(`Unable to load referral options: ${error.message}`);return(data??[]).map(row=>({id:row.id,name:row.name,organisationName:row.organisation_name??undefined}));}
  async linkedOption(context:TenantContext,id?:string){if(!id)return undefined;const{data,error}=await this.client.from("mortgage_referral_partners").select("id,name,organisation_name,status").eq("organisation_id",context.organisationId).eq("id",id).maybeSingle();if(error)throw new Error(`Unable to load linked referral partner: ${error.message}`);return data?{id:data.id,name:data.name,organisationName:data.organisation_name??undefined,status:data.status}:undefined;}
  async previewDuplicates(context:TenantContext,input:Pick<ReferralPartnerMutationInput,"name"|"organisationName"|"email">):Promise<ReferralDuplicateMatch[]>{const{data,error}=await this.client.rpc("preview_mortgage_referral_partner_duplicates" as never,{p_organisation_id:context.organisationId,p_name:input.name,p_organisation_name:input.organisationName??null,p_email:input.email??null} as never);if(error)throw referralError(error.message);return((data??[]) as unknown as DuplicateRow[]).map(row=>({id:row.referral_partner_id,name:row.partner_name,organisationName:row.organisation_name??undefined,email:row.email??undefined,status:row.status,reasons:row.reasons}));}
  async create(context:TenantContext,input:ReferralPartnerMutationInput&{commandId:string;ownerMembershipId:string;duplicateNameAcknowledged:boolean}){return this.operation("create_mortgage_referral_partner",{organisation_id:context.organisationId,command_id:input.commandId,name:input.name,organisation_name:input.organisationName??null,partner_type:input.type,email:input.email??null,phone:input.phone??null,owner_membership_id:input.ownerMembershipId,duplicate_name_acknowledged:input.duplicateNameAcknowledged});}
  async update(context:TenantContext,input:ReferralPartnerMutationInput&{commandId:string;referralPartnerId:string;expectedVersion:number}){return this.operation("update_mortgage_referral_partner",{organisation_id:context.organisationId,command_id:input.commandId,referral_partner_id:input.referralPartnerId,expected_version:input.expectedVersion,name:input.name,organisation_name:input.organisationName??null,partner_type:input.type,email:input.email??null,phone:input.phone??null});}
  async assign(context:TenantContext,input:{commandId:string;referralPartnerId:string;expectedVersion:number;targetMembershipId:string}){return this.operation("assign_mortgage_referral_partner_owner",{organisation_id:context.organisationId,command_id:input.commandId,referral_partner_id:input.referralPartnerId,expected_version:input.expectedVersion,target_membership_id:input.targetMembershipId});}
  async transition(context:TenantContext,input:{commandId:string;referralPartnerId:string;expectedVersion:number;targetStatus:"Active"|"Inactive"}){return this.operation("transition_mortgage_referral_partner",{organisation_id:context.organisationId,command_id:input.commandId,referral_partner_id:input.referralPartnerId,expected_version:input.expectedVersion,target_status:input.targetStatus});}
  private async operation(name:string,args:Record<string,string|number|boolean|null>){const{data,error}=await this.client.rpc(name as never,args as never);if(error)throw referralError(error.message);return object(data as Json);}
  private async brokers(context:TenantContext){const[members,profiles]=await Promise.all([this.client.from("organisation_memberships").select("id,display_name").eq("organisation_id",context.organisationId).eq("status","Active"),this.client.from("mortgage_membership_profiles").select("membership_id").eq("organisation_id",context.organisationId).eq("position","Broker")]);fail([members.error,profiles.error],"Unable to load active Brokers");const brokerIds=new Set((profiles.data??[]).map(row=>row.membership_id));return(members.data??[]).filter(row=>brokerIds.has(row.id)).map(row=>({id:row.id,displayName:row.display_name}));}
  private async membershipNames(context:TenantContext,ids:string[]){const unique=[...new Set(ids)];if(!unique.length)return new Map<string,string>();const{data,error}=await this.client.from("organisation_memberships").select("id,display_name").eq("organisation_id",context.organisationId).in("id",unique);if(error)throw new Error(`Unable to load referral owners: ${error.message}`);return new Map((data??[]).map(row=>[row.id,row.display_name]));}
}

function mapPartner(row:PartnerRow,ownerName?:string):ReferralPartnerSummary{return{id:row.id,name:row.name,organisationName:row.organisation_name??undefined,type:row.partner_type as ReferralPartnerSummary["type"],email:row.email??undefined,phone:row.phone??undefined,ownerMembershipId:row.owner_membership_id,ownerName:ownerName??"Unavailable",status:row.status as "Active"|"Inactive",version:row.version,createdAt:row.created_at,updatedAt:row.updated_at};}
function escapeLike(value:string){return value.replaceAll(/[%,()]/g,character=>`\\${character}`);}
function object(value:Json):Record<string,Json|undefined>{return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function fail(errors:Array<{message:string}|null>,prefix:string){const error=errors.find(Boolean);if(error)throw new Error(`${prefix}: ${error!.message}`);}
function referralError(message:string){if(message.includes("STALE_REFERRAL"))return new Error("This referral partner changed while you were reviewing it. Refresh and try again.");if(message.includes("EXACT_EMAIL_DUPLICATE"))return new Error("A referral partner with that email already exists in this brokerage.");if(message.includes("NAME_DUPLICATE_ACKNOWLEDGEMENT"))return new Error("Review and acknowledge the matching partner before creating another record.");if(message.includes("ACTIVE_REFERRAL_PARTNER_REQUIRED"))return new Error("Choose an active referral partner or Direct / none.");if(message.includes("NO_OP"))return new Error("Choose a change before saving.");if(message.includes("CAPABILITY_REQUIRED")||message.includes("OWNERSHIP_REQUIRED"))return new Error("You do not have permission to perform this action.");if(message.includes("COMMAND_ID_REUSE_CONFLICT"))return new Error("This action key was already used for different changes. Close the dialog and try again.");return new Error(message.replace(/^.*?([A-Z][A-Z0-9_:-]+).*$/s,"$1").replaceAll("_"," ").toLowerCase().replace(/^./,c=>c.toUpperCase()));}
type PartnerRow={id:string;name:string;organisation_name:string|null;partner_type:string;email:string|null;phone:string|null;owner_membership_id:string;status:string;version:number;created_at:string;updated_at:string};
type DuplicateRow={referral_partner_id:string;partner_name:string;organisation_name:string|null;email:string|null;status:"Active"|"Inactive";reasons:ReferralDuplicateMatch["reasons"]};
