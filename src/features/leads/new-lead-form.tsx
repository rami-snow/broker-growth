"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, TextField } from "@/components/ui";
import { Modal } from "@/components/modal";
import { usePrototype } from "@/components/prototype-provider";
import type { ContactMethod } from "@/platform/contacts/models";
import type { LoanPurpose, MortgageTimeframe } from "@/verticals/mortgage/leads/models";

export function NewLeadForm({ onClose }: { onClose: () => void }) {
  const { repo, context, mutate } = usePrototype(), router = useRouter(), [error,setError] = useState("");
  const brokers = repo.listMemberships(context).filter(member => member.mortgageProfile.position === "Broker");
  const submit = (formData: FormData) => { try { const lead = mutate(() => repo.createLead(context, { firstName: String(formData.get("firstName")), lastName: String(formData.get("lastName")), email: String(formData.get("email")), phone: String(formData.get("phone")), source: String(formData.get("source")), loanPurpose: String(formData.get("loanPurpose")) as LoanPurpose, timeframe: String(formData.get("timeframe")) as MortgageTimeframe, preferredContactMethod: String(formData.get("contact")) as ContactMethod, ownerMembershipId: String(formData.get("owner") || "") as never || undefined })); onClose(); router.push(`/leads/${lead.id}`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create lead"); } };
  return <Modal title="New lead" onClose={onClose}><form action={submit} className="form-grid"><TextField name="firstName" label="First name" required/><TextField name="lastName" label="Last name" required/><TextField name="email" label="Email" type="email" required/><TextField name="phone" label="Phone" type="tel" required/><TextField name="source" label="Lead source" defaultValue="Website enquiry" required/><Select name="loanPurpose" label="Loan purpose" options={["Purchase","Refinance","Investment purchase","Construction loan","Asset finance","Commercial finance","Other"].map(value => ({ value, label:value }))}/><Select name="timeframe" label="Timeframe" options={["Immediately","Within 1 month","1–3 months","3–6 months","Researching"].map(value => ({ value, label:value }))}/><Select name="contact" label="Preferred contact method" options={["Phone","Email","SMS"].map(value => ({ value, label:value }))}/><Select name="owner" label="Owner" options={[{ value:"", label:"Unassigned" },...brokers.map(member => ({ value:member.id, label:member.displayName }))]}/>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Create lead</Button></div></form></Modal>;
}
