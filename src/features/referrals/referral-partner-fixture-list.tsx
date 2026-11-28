"use client";
import { useState } from "react";
import { PageTitle } from "@/components/page-title";
import { Button, ButtonLink, SearchInput, Select } from "@/components/ui";
import { usePrototype } from "@/components/prototype-provider";
import { mortgageReferralPartnerTypes } from "@/verticals/mortgage/referrals/models";
import { PartnersTableView, relationshipOptions } from "./partners-table-view";

export function ReferralPartnerFixtureList() {
  const { repo, context, now, revision } = usePrototype(); void revision;
  const [search, setSearch] = useState(""), [type, setType] = useState(""), [relationship, setRelationship] = useState("");
  const state = repo.snapshot(), actor = repo.getMembership(context);
  if (!actor.capabilities.includes("mortgage.referral.view")) return <section className="surface inaccessible"><h1>Referral partners unavailable</h1></section>;
  const all = state.referralPartners.filter(item => item.organisationId === context.organisationId);
  const members = repo.listMemberships(context);
  const partners = all.filter(item => `${item.name} ${item.organisationName ?? ""} ${item.email ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (!type || item.type === type)).map(item => ({ ...item, ownerName: members.find(member => member.id === item.ownerMembershipId)?.displayName }));
  const referred = repo.listLeads(context).flatMap(lead => lead.referralPartnerId ? [{ referralPartnerId: lead.referralPartnerId, createdAt: lead.createdAt, status: lead.status }] : []);
  return <><PageTitle title="Referral partners" action={<>{actor.capabilities.includes("mortgage.referral.manage") && <ButtonLink variant="secondary" href="/import?type=partners">Import partners</ButtonLink>}<Button disabled title="Adding partners works in Supabase mode only. The fixture prototype has no create operation.">Add partner</Button></>}/>
    <PartnersTableView partners={partners} referredLeads={referred} totalPartners={all.length} now={now()} relationshipFilter={relationship || undefined}
      filters={<section className="filter-bar" aria-label="Partner filters"><SearchInput label="Search partners" placeholder="Search partners" value={search} onChange={event => setSearch(event.target.value)}/><Select hideLabel label="Partner type filter" value={type} onChange={event => setType(event.target.value)} options={[{ value: "", label: "All types" }, ...mortgageReferralPartnerTypes.map(value => ({ value, label: value }))]}/><Select hideLabel label="Relationship filter" value={relationship} onChange={event => setRelationship(event.target.value)} options={[{ value: "", label: "All health" }, ...relationshipOptions.map(value => ({ value, label: value }))]}/></section>}/>
  </>;
}
