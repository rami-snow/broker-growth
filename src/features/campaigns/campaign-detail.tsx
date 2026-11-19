"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { Modal } from "@/components/modal";
import { Badge, Button, Select, Status, TextArea, TextField } from "@/components/ui";
import { usePrototype } from "@/components/prototype-provider";
import type { CampaignChannel } from "@/platform/campaigns/contracts";
import type { CampaignId, CampaignStatus } from "@/platform/campaigns/models";
import type { ConsentChannelStatus } from "@/platform/consent/models";
import type { ContactId } from "@/platform/contacts/models";
import { hasCapability } from "@/verticals/mortgage/permissions";

const statusTone = (status: CampaignStatus) => status === "Approved" ? "success" : status === "Rejected" || status === "Cancelled" ? "danger" : status === "Ready for review" ? "warning" : "neutral";
const format = (value: string) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const resolveCopy = (value: string, fields: Record<string, string | number | boolean | null>) => value.replace(/\{\{\s*([a-z0-9._-]+)\s*\}\}/gi, (_, key: string) => String(fields[key] ?? `[Unresolved: ${key}]`));

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const { campaignRepo, context } = usePrototype();
  try { campaignRepo.getCampaign(context, campaignId as CampaignId); }
  catch {
    return <section className="surface inaccessible"><h1>Campaign unavailable</h1><p>This campaign does not belong to the active brokerage or cannot be viewed by this membership.</p><Link className="ui-button ui-button--secondary" href="/campaigns">Return to Campaigns</Link></section>;
  }
  return <CampaignDetailContent campaignId={campaignId}/>;
}

function CampaignDetailContent({ campaignId }: { campaignId: string }) {
  const { repo, campaignRepo, context, revision, mutate } = usePrototype();
  void revision;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recipientFilter, setRecipientFilter] = useState<"all" | "eligible" | "excluded">("all");
  const [consentOpen, setConsentOpen] = useState(false);
  const campaign = campaignRepo.getCampaign(context, campaignId as CampaignId);
  const version = campaignRepo.getCurrentVersion(context, campaign.id);
  const actor = repo.getMembership(context);
  const purposes = campaignRepo.listPurposeDefinitions(), sources = campaignRepo.listAudienceDefinitions(), allFields = campaignRepo.listMergeFieldDefinitions();
  const purpose = purposes.find(item => item.key === version.purposeKey)!;
  const versions = campaignRepo.listVersions(context, campaign.id), activity = campaignRepo.listActivity(context, campaign.id), approvals = campaignRepo.listApprovals(context, campaign.id);
  const latest = campaignRepo.latestSnapshot(context, campaign.id), submission = campaignRepo.latestSnapshot(context, campaign.id, "Submission");
  const [name, setName] = useState(campaign.name);
  const [channel, setChannel] = useState<CampaignChannel>(version.content.channel);
  const [subject, setSubject] = useState(version.content.subject ?? "");
  const [body, setBody] = useState(version.content.body);
  const [selectedFields, setSelectedFields] = useState<string[]>(version.content.selectedMergeFieldKeys);
  const [rejectionReason, setRejectionReason] = useState("");
  const content = { channel, subject: channel === "Email" ? subject : undefined, body, selectedMergeFieldKeys: selectedFields };

  const run = (operation: () => unknown, success: string) => {
    try { mutate(operation); setError(""); setMessage(success); window.setTimeout(() => setMessage(""), 2600); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign action failed"); }
  };
  const save = () => campaignRepo.updateDraft(context, campaign.id, { name, purposeKey: version.purposeKey, audienceSourceKey: version.audienceSourceKey, content });
  const approveReviewed = () => {
    if (!latest) { setError("Review an audience snapshot before approval"); return; }
    try {
      const result = mutate(() => campaignRepo.approve(context, campaign.id, latest.id));
      setError("");
      setMessage(result.status === "Audience changed" ? `Audience changed to ${result.currentSnapshot.eligibleCount} eligible and ${result.currentSnapshot.excludedCount} excluded. Review the changes, then approve again.` : "Campaign plan approved — no message was sent");
      window.setTimeout(() => setMessage(""), 5000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign approval failed"); }
  };
  const recipients = (latest?.recipients ?? []).filter(item => recipientFilter === "all" || (recipientFilter === "eligible" ? item.evaluation.eligible : !item.evaluation.eligible));
  const breakdown = (() => { const values = new Map<string, number>(); for (const item of latest?.recipients ?? []) if (!item.evaluation.eligible) { const label = item.evaluation.primaryReason?.displayReason ?? "Excluded"; values.set(label, (values.get(label) ?? 0) + 1); } return [...values.entries()]; })();
  const sample = latest?.recipients.find(item => item.evaluation.eligible);

  return <>
    <Link className="back-link" href="/campaigns"><ArrowLeft/>Back to Campaigns</Link>
    <PageTitle eyebrow={`Campaign plan · Version ${version.versionNumber}`} title={campaign.name} body={`${purpose.displayName} · ${channel} · ${sources.find(item => item.key === version.audienceSourceKey)?.displayName}`} action={<Status tone={statusTone(campaign.status)}>{campaign.status}</Status>}/>
    <div className="prototype-warning"><strong>No message will be sent</strong><span>Approval freezes this plan and the current eligibility snapshot only. It does not send, schedule, queue or export communications.</span></div>
    {latest?.changedSincePrevious && <div className="campaign-change-alert" role="status"><strong>Audience changed — approval is paused.</strong><span>Review the current {latest.eligibleCount} eligible and {latest.excludedCount} excluded recipients, then approve this revised snapshot explicitly.</span>{latest.changesSincePrevious?.length ? <ul>{latest.changesSincePrevious.map(change => <li key={`${change.type}-${change.candidateKey}-${change.contactId}`}>{change.displaySummary}</li>)}</ul> : null}</div>}
    <div className="campaign-layout">
      <div className="campaign-main">
        <section className="surface campaign-editor">
          <div className="section-heading"><div><h2>Content plan</h2><p>Plain text only. Starter copy is fictional and is not legally approved wording.</p></div><Badge>{channel}</Badge></div>
          {campaign.status === "Draft" ? <div className="form-grid">
            <TextField label="Campaign name" value={name} onChange={event => setName(event.target.value)}/>
            <Select label="Channel" value={channel} onChange={event => setChannel(event.target.value as CampaignChannel)} options={purpose.supportedChannels.map(value => ({ value, label: value }))}/>
            {channel === "Email" && <div className="form-wide"><TextField label="Email subject" value={subject} onChange={event => setSubject(event.target.value)}/></div>}
            <div className="form-wide"><TextArea label="Message body" value={body} onChange={event => setBody(event.target.value)}/>{channel === "SMS" && <small className="character-count">{body.length} characters</small>}</div>
            <fieldset className="merge-fields form-wide"><legend>Permitted merge fields</legend>{purpose.permittedMergeFields.map(key => { const definition = allFields.find(item => item.key === key)!; return <label key={key}><input type="checkbox" checked={selectedFields.includes(key)} onChange={event => setSelectedFields(current => event.target.checked ? [...current, key] : current.filter(item => item !== key))}/><span>{definition.displayName}</span><code>{`{{${key}}}`}</code></label>; })}</fieldset>
            <div className="placeholder-note form-wide"><strong>Required planning placeholders</strong><span>[Sender identification] and [Unsubscribe instructions] remain visible placeholders. This prototype does not validate final legal wording.</span></div>
          </div> : <div className="content-readonly">{channel === "Email" && <p><strong>Subject</strong><span>{version.content.subject}</span></p>}<p><strong>Message</strong><span className="preline">{version.content.body}</span></p><p><strong>Selected merge fields</strong><span>{version.content.selectedMergeFieldKeys.join(", ") || "None"}</span></p></div>}
        </section>

        <section className="surface">
          <div className="section-heading"><div><h2>Audience eligibility</h2><p>Operational control only—not a complete legal determination or legal advice.</p></div>{latest && <div className="campaign-counts"><Badge tone="success">{latest.eligibleCount} eligible</Badge><Badge tone={latest.excludedCount ? "warning" : "neutral"}>{latest.excludedCount} excluded</Badge></div>}</div>
          {latest ? <><div className="scope-switch"><button className={recipientFilter === "all" ? "active" : ""} onClick={() => setRecipientFilter("all")}>All</button><button className={recipientFilter === "eligible" ? "active" : ""} onClick={() => setRecipientFilter("eligible")}>Eligible</button><button className={recipientFilter === "excluded" ? "active" : ""} onClick={() => setRecipientFilter("excluded")}>Excluded</button></div>
            {breakdown.length > 0 && <div className="exclusion-breakdown"><strong>Primary exclusion reasons</strong>{breakdown.map(([label, count]) => <span key={label}>{label} <b>{count}</b></span>)}</div>}
            <div className="recipient-list">{recipients.map(item => <article key={`${item.candidateKey}-${item.id}`} className="recipient-row"><div><strong>{item.subjectDisplayName}</strong><small>{item.maskedDestination} · {item.contextLabel}</small></div><Badge tone={item.evaluation.eligible ? "success" : "warning"}>{item.evaluation.eligible ? "Eligible" : "Excluded"}</Badge><dl><div><dt>Consent</dt><dd>{item.consentStatus}</dd></div><div><dt>Suppression</dt><dd>{item.suppressionStatus}</dd></div><div><dt>Decision</dt><dd>{item.evaluation.primaryReason?.displayReason ?? "All current checks passed"}</dd></div></dl></article>)}</div>
          </> : <p className="muted">Generate an audience preview to see eligible and excluded primary contacts.</p>}
        </section>

        <section className="surface"><h2>Sample recipient preview</h2><p className="legal-note">Preview only. Sender identification and unsubscribe wording remain placeholders.</p>{sample ? <div className="sample-preview">{channel === "Email" && <p><strong>Subject</strong><span>{resolveCopy(version.content.subject ?? subject, sample.resolvedMergeFields)}</span></p>}<p><strong>To</strong><span>{sample.subjectDisplayName} · {sample.maskedDestination}</span></p><p><strong>Message</strong><span className="preline">{resolveCopy(version.content.body || body, sample.resolvedMergeFields)}</span></p></div> : <p className="muted">No currently eligible sample recipient.</p>}</section>
        <section className="surface"><h2>Version history</h2>{versions.map(item => <div className="record-row" key={item.id}><span><strong>Version {item.versionNumber} · {item.state}</strong><small>Created {format(item.createdAt)} · {item.content.channel}{item.frozenAt ? ` · Frozen ${format(item.frozenAt)}` : ""}</small></span>{item.id === campaign.currentVersionId && <Badge tone="info">Current</Badge>}</div>)}</section>
        <section className="surface"><h2>Activity history</h2><div className="timeline">{activity.map(event => <div key={event.id}><span className="timeline-mark"/><p><strong>{event.summary}</strong>{event.note && <span>{event.note}</span>}<small>{repo.listMemberships(context).find(item => item.id === event.actorMembershipId)?.displayName} · {format(event.occurredAt)}</small></p></div>)}</div></section>
      </div>

      <aside className="surface campaign-actions">
        <h2>Plan actions</h2>
        {campaign.status === "Draft" && <><Button fullWidth variant="secondary" onClick={() => run(() => { save(); campaignRepo.preview(context, campaign.id); }, "Audience preview updated")}>Save and preview</Button>{hasCapability(actor, "campaign.submit") && <Button fullWidth onClick={() => run(() => { save(); campaignRepo.submit(context, campaign.id); }, "Campaign submitted for review")}>Submit for review</Button>}{hasCapability(actor, "campaign.cancel") && <Button fullWidth variant="danger" onClick={() => run(() => campaignRepo.cancel(context, campaign.id), "Campaign cancelled")}>Cancel draft</Button>}</>}
        {campaign.status === "Ready for review" && <><div className="review-summary"><strong>{latest?.id === submission?.id ? "Submitted snapshot" : "Revised snapshot to review"}</strong><span>{latest?.eligibleCount ?? 0} eligible · {latest?.excludedCount ?? 0} excluded</span><small>Approval performs a fresh eligibility check against this exact reviewed snapshot.</small></div>{hasCapability(actor, "campaign.approve") && <><Button fullWidth onClick={approveReviewed}>Approve reviewed audience</Button><TextArea label="Rejection reason" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)}/><Button fullWidth variant="secondary" onClick={() => run(() => campaignRepo.reject(context, campaign.id, rejectionReason), "Campaign rejected")}>Reject plan</Button></>}</>}
        {(["Approved", "Rejected"] as CampaignStatus[]).includes(campaign.status) && <Button fullWidth onClick={() => run(() => campaignRepo.updateDraft(context, campaign.id, { name, purposeKey: version.purposeKey, audienceSourceKey: version.audienceSourceKey, content }), "New draft version created")}>Create new draft version</Button>}
        {campaign.status === "Approved" && <div className="approval-box"><Check/><strong>Approved plan only</strong><span>{approvals.at(-1)?.eligibleRecipientCount ?? 0} eligible · {approvals.at(-1)?.excludedRecipientCount ?? 0} excluded</span><small>No delivery occurred.</small></div>}
        {hasCapability(actor, "consent.record-external-change") && <Button fullWidth variant="text" onClick={() => setConsentOpen(true)}>Record external consent change</Button>}
      </aside>
    </div>
    {error && <div className="toast toast-error" role="alert">{error}</div>}
    {message && <div className="toast"><Check/>{message}</div>}
    {consentOpen && <ConsentChangeModal campaignId={campaign.id} recipients={latest?.recipients ?? []} onClose={() => setConsentOpen(false)}/>} 
  </>;
}

function ConsentChangeModal({ campaignId, recipients, onClose }: { campaignId: CampaignId; recipients: Array<{ contactId: ContactId; subjectDisplayName: string }>; onClose: () => void }) {
  const { campaignRepo, context, mutate } = usePrototype();
  const [error, setError] = useState("");
  const unique = Array.from(new Map(recipients.map(item => [item.contactId, item])).values());
  return <Modal title="Record external consent change" onClose={onClose}>
    <form className="form-grid single" action={form => {
      try {
        const data = Object.fromEntries(form.entries()) as Record<string, string>;
        mutate(() => campaignRepo.recordExternalConsentChange(context, campaignId, { contactId: data.contactId as ContactId, channel: data.channel as CampaignChannel, status: data.status as ConsentChannelStatus, source: data.source, effectiveAt: new Date(data.effectiveAt).toISOString(), reason: data.reason, externalActionConfirmed: data.externalActionConfirmed === "on" }));
        onClose();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Consent change could not be recorded"); }
    }}>
      <div className="prototype-warning"><strong>Supplied external evidence only</strong><span>This records evidence of a consent or unsubscribe action that already occurred outside Broker Growth Desk. It is not a consent request and does not contact the client.</span></div>
      <Select name="contactId" label="Contact" options={unique.map(item => ({ value: item.contactId, label: item.subjectDisplayName }))}/>
      <Select name="channel" label="Channel" options={[{ value: "Email", label: "Email" }, { value: "SMS", label: "SMS" }]}/>
      <Select name="status" label="New consent status" options={["Recorded", "Not recorded", "Opted out"].map(value => ({ value, label: value }))}/>
      <TextField name="source" label="External evidence source" required/>
      <TextField name="effectiveAt" label="Effective date and time" type="datetime-local" required/>
      <TextArea name="reason" label="Evidence note (required when reinstating consent)"/>
      <label className="consent-confirmation"><input type="checkbox" name="externalActionConfirmed" required/><span>I confirm this records evidence of an action that occurred externally; Broker Growth Desk did not request or obtain consent.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Record external evidence</Button></div>
    </form>
  </Modal>;
}
