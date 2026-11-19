"use client";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { Badge,Table } from "@/components/ui";
import { usePrototype } from "@/components/prototype-provider";
export function ReferralPartnerFixtureList(){const{repo,context}=usePrototype(),state=repo.snapshot(),actor=repo.getMembership(context),rows=state.referralPartners.filter(item=>item.organisationId===context.organisationId);if(!actor.capabilities.includes("mortgage.referral.view"))return <section className="surface inaccessible"><h1>Referral partners unavailable</h1></section>;return <><PageTitle title="Referral partners" body="Fictional fixture relationship records. Persistent maintenance is available in Supabase mode."/><section className="surface"><Table><thead><tr><th>Partner</th><th>Type</th><th>Status</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Link href={`/referral-partners/${row.id}`}><strong>{row.name}</strong></Link><small>{row.organisationName}</small></td><td>{row.type}</td><td><Badge tone={row.status==="Active"?"success":"neutral"}>{row.status}</Badge></td></tr>)}</tbody></Table></section></>}
