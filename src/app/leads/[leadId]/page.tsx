import { LeadDetail } from "@/features/leads/lead-detail";
import { PersistentLeadDetail } from "@/features/leads/persistent-lead-detail";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { getRuntimeMode } from "@/platform/runtime/config";
import { persistentOperationsContext } from "@/app/lead-actions";
import type { LeadId } from "@/platform/leads/models";
import { randomUUID } from "node:crypto";
import { SupabaseClientBookRepository } from "@/verticals/mortgage/persistence/supabase-client-book-repository";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { SupabaseReferralPartnerRepository } from "@/verticals/mortgage/persistence/supabase-referral-partner-repository";
export default async function Page({ params }: { params: Promise<{ leadId: string }> }) { const { leadId } = await params; if(getRuntimeMode()==="fixture") return <LeadDetail leadId={leadId}/>; const {user,activeMembership,context,repository}=await persistentOperationsContext(); const snapshot=await repository.readLead(context,leadId as LeadId),client=await createServerSupabaseClient(); const clientBook=new SupabaseClientBookRepository(client),referrals=new SupabaseReferralPartnerRepository(client); const duplicateMatches=snapshot.leads[0]?.status==="Discovery booked"&&activeMembership.capabilities.includes("mortgage.household.create")?await clientBook.duplicates(context,leadId):[];const referralOptions=activeMembership.capabilities.includes("mortgage.referral.view")?await referrals.activeOptions(context):[]; return <SupabaseWorkspace user={user} returnPath={`/leads/${encodeURIComponent(leadId)}`}><PersistentLeadDetail snapshot={snapshot} actorMembershipId={activeMembership.id} capabilities={activeMembership.capabilities} commandIds={{claim:randomUUID(),reopen:randomUUID()}} duplicateMatches={duplicateMatches} referralOptions={referralOptions}/></SupabaseWorkspace>; }
