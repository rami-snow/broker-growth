import { normalisePhoneNumber } from "@/platform/contacts/phone";
import type { Contact } from "@/platform/contacts/models";
import type { ConsentRecord, ConsentSummary } from "@/platform/consent/models";
import type { MortgageLead } from "@/verticals/mortgage/leads/models";
import type { Household } from "./models";
import type { MortgageActivityEvent } from "@/verticals/mortgage/audit/models";

export const normaliseEmail=(value:string)=>value.trim().toLowerCase();
export const normalisePhone=(value:string)=>normalisePhoneNumber(value)??"";
export const normaliseName=(first:string,last:string)=>`${first.trim()} ${last.trim()}`.toLowerCase();
export function findDuplicateContacts(lead:Pick<MortgageLead,"firstName"|"lastName"|"email"|"phone">,contacts:Contact[]){const email=normaliseEmail(lead.email),phone=normalisePhone(lead.phone),name=normaliseName(lead.firstName,lead.lastName);return contacts.filter(contact=>normaliseEmail(contact.email)===email||normalisePhone(contact.phone)===phone||normaliseName(contact.firstName,contact.lastName)===name);}
export function copyConsent(summary:ConsentSummary,base:Omit<ConsentRecord,"id"|"channel"|"status">):ConsentRecord[]{return(["Email","SMS","Phone"] as const).map(channel=>({...base,id:`consent_${base.contactId}_${channel.toLowerCase()}`,channel,status:summary[channel.toLowerCase() as "email"|"sms"|"phone"]}));}
export function assertHouseholdCanArchive(householdId:Household["id"],opportunities:Array<{householdId:Household["id"];lifecycleStatus:string}>){if(opportunities.some(item=>item.householdId===householdId&&!(["Completed","Dismissed"] as string[]).includes(item.lifecycleStatus)))throw new Error("Resolve or dismiss open review opportunities before archiving this household");}
export const householdActivity=(events:MortgageActivityEvent[],householdId:Household["id"])=>events.filter(event=>event.subjectReference?.type==="mortgage.household"&&event.subjectReference.id===householdId).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
