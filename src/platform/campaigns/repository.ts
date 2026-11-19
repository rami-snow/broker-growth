import type { AudienceCandidate, AudienceSourceDefinition, CampaignChannel, CampaignExtensionRuntime, CampaignPurposeDefinition, MergeFieldDefinition } from "@/platform/campaigns/contracts";
import { assertCampaignTransition } from "@/platform/campaigns/lifecycle";
import type { ApprovalRecord, AudienceRecipient, AudienceSnapshot, AudienceSnapshotChange, AudienceSnapshotId, Campaign, CampaignActivityEvent, CampaignApprovalResult, CampaignContent, CampaignId, CampaignState, CampaignVersion, EligibilityReason, EligibilityReasonCode, SnapshotStage, SuppressionRecord } from "@/platform/campaigns/models";
import type { ConsentChannelStatus, ConsentRecord } from "@/platform/consent/models";
import type { Contact, ContactId } from "@/platform/contacts/models";
import type { OrganisationId, TenantContext } from "@/platform/core/models";
import type { Organisation, OrganisationMembership } from "@/platform/organisations/models";
import { selectCurrentEffectiveEvidence } from "@/platform/consent/effective-evidence";

export interface CampaignRepositoryDependencies<TDependencies, TData> {
  state: CampaignState;
  contacts: Contact[];
  consentRecords: ConsentRecord[];
  memberships: OrganisationMembership<string>[];
  organisations: Organisation[];
  purposes: readonly CampaignPurposeDefinition[];
  audienceSources: readonly AudienceSourceDefinition[];
  mergeFields: readonly MergeFieldDefinition[];
  runtime: CampaignExtensionRuntime<TDependencies, TData>;
  runtimeDependencies: TDependencies;
  now?: () => Date;
}
export interface CreateCampaignInput { name: string; purposeKey: string; audienceSourceKey: string; content: CampaignContent; }
export interface UpdateCampaignInput { purposeKey: string; audienceSourceKey: string; content: CampaignContent; name?: string; }
export interface ExternalConsentChangeInput { contactId: ContactId; channel: CampaignChannel; status: ConsentChannelStatus; source: string; effectiveAt: string; reason?: string; externalActionConfirmed: boolean; }

const clone = <T,>(value: T): T => structuredClone(value);
const capability = (membership: OrganisationMembership<string>, value: string) => membership.capabilities.includes(value);
const reason = (code: EligibilityReasonCode, displayReason: string): EligibilityReason => ({ code, displayReason });
const tokens = (value: string) => Array.from(value.matchAll(/\{\{\s*([a-z0-9._-]+)\s*\}\}/gi), match => match[1]);
const recipientKey = (recipient: AudienceRecipient) => `${recipient.candidateKey}::${recipient.contactId}`;
const sortedMergeFields = (fields: AudienceRecipient["resolvedMergeFields"]) => Object.fromEntries(Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)));
const canonicalRecipient = (recipient: AudienceRecipient) => ({
  candidateKey: recipient.candidateKey,
  contactId: recipient.contactId,
  subjectId: recipient.subjectId,
  subjectDisplayName: recipient.subjectDisplayName,
  contextLabel: recipient.contextLabel,
  eligible: recipient.evaluation.eligible,
  primaryReasonCode: recipient.evaluation.primaryReason?.code ?? null,
  reasonCodes: recipient.evaluation.reasons.map(item => item.code).sort(),
  maskedDestination: recipient.maskedDestination,
  consentStatus: recipient.consentStatus,
  suppressionStatus: recipient.suppressionStatus,
  resolvedMergeFields: sortedMergeFields(recipient.resolvedMergeFields),
});

export function audienceSnapshotDigest(snapshot: Pick<AudienceSnapshot, "recipients">) {
  return JSON.stringify(snapshot.recipients.map(canonicalRecipient).sort((left, right) => `${left.candidateKey}::${left.contactId}`.localeCompare(`${right.candidateKey}::${right.contactId}`)));
}

export function audienceSnapshotChanges(before: Pick<AudienceSnapshot, "recipients">, after: Pick<AudienceSnapshot, "recipients">): AudienceSnapshotChange[] {
  const previous = new Map(before.recipients.map(item => [recipientKey(item), item]));
  const current = new Map(after.recipients.map(item => [recipientKey(item), item]));
  const keys = [...new Set([...previous.keys(), ...current.keys()])].sort();
  return keys.flatMap<AudienceSnapshotChange>(key => {
    const oldRecipient = previous.get(key), newRecipient = current.get(key);
    if (!oldRecipient && newRecipient) return [{ candidateKey: newRecipient.candidateKey, contactId: newRecipient.contactId, subjectDisplayName: newRecipient.subjectDisplayName, type: "Added", displaySummary: `${newRecipient.subjectDisplayName} was added to the evaluated audience` } satisfies AudienceSnapshotChange];
    if (oldRecipient && !newRecipient) return [{ candidateKey: oldRecipient.candidateKey, contactId: oldRecipient.contactId, subjectDisplayName: oldRecipient.subjectDisplayName, type: "Removed", displaySummary: `${oldRecipient.subjectDisplayName} was removed from the evaluated audience` } satisfies AudienceSnapshotChange];
    if (oldRecipient && newRecipient && JSON.stringify(canonicalRecipient(oldRecipient)) !== JSON.stringify(canonicalRecipient(newRecipient))) {
      const decision = oldRecipient.evaluation.eligible === newRecipient.evaluation.eligible ? "eligibility details changed" : `changed from ${oldRecipient.evaluation.eligible ? "eligible" : "excluded"} to ${newRecipient.evaluation.eligible ? "eligible" : "excluded"}`;
      return [{ candidateKey: newRecipient.candidateKey, contactId: newRecipient.contactId, subjectDisplayName: newRecipient.subjectDisplayName, type: "Changed", displaySummary: `${newRecipient.subjectDisplayName} ${decision}` } satisfies AudienceSnapshotChange];
    }
    return [];
  });
}

export class InMemoryCampaignRepository<TDependencies, TData> {
  private readonly now: () => Date;
  constructor(private dependencies: CampaignRepositoryDependencies<TDependencies, TData>) { this.now = dependencies.now ?? (() => new Date()); }

  private membership(context: TenantContext) {
    const item = this.dependencies.memberships.find(member => member.userId === context.userId && member.organisationId === context.organisationId && member.status === "Active");
    if (!item) throw new Error("No active membership for this organisation");
    return item;
  }
  private require(context: TenantContext, value: string) {
    const member = this.membership(context);
    if (!capability(member, value)) throw new Error(`${value} denied`);
    return member;
  }
  private next(prefix: string, length: number) { return `${prefix}_${String(length + 1).padStart(3, "0")}`; }
  private campaignRecord(context: TenantContext, id: CampaignId) {
    this.membership(context);
    const item = this.dependencies.state.campaigns.find(campaign => campaign.id === id && campaign.organisationId === context.organisationId);
    if (!item) throw new Error("Campaign unavailable in this organisation context");
    return item;
  }
  private versionRecord(context: TenantContext, id: CampaignVersion["id"]) {
    this.membership(context);
    const item = this.dependencies.state.campaignVersions.find(version => version.id === id && version.organisationId === context.organisationId);
    if (!item) throw new Error("Campaign version unavailable in this organisation context");
    return item;
  }
  private currentVersionRecord(context: TenantContext, campaignId: CampaignId) { return this.versionRecord(context, this.campaignRecord(context, campaignId).currentVersionId); }
  private snapshotRecord(context: TenantContext, id: AudienceSnapshotId) {
    this.membership(context);
    const item = this.dependencies.state.audienceSnapshots.find(snapshot => snapshot.id === id && snapshot.organisationId === context.organisationId);
    if (!item) throw new Error("Audience snapshot unavailable in this organisation context");
    return item;
  }
  private append(context: TenantContext, campaignId: CampaignId, type: CampaignActivityEvent["type"], summary: string, version?: CampaignVersion, note?: string) {
    const event = { id: this.next("campaign_event", this.dependencies.state.campaignActivities.length), campaignId, campaignVersionId: version?.id, organisationId: context.organisationId, actorMembershipId: this.membership(context).id, occurredAt: this.now().toISOString(), type, summary, note } as CampaignActivityEvent;
    this.dependencies.state.campaignActivities.push(event);
    return clone(event);
  }

  listCampaigns(context: TenantContext) { this.require(context, "campaign.view"); return clone(this.dependencies.state.campaigns.filter(item => item.organisationId === context.organisationId)); }
  getCampaign(context: TenantContext, id: CampaignId) { this.require(context, "campaign.view"); return clone(this.campaignRecord(context, id)); }
  getVersion(context: TenantContext, id: CampaignVersion["id"]) { this.require(context, "campaign.view"); return clone(this.versionRecord(context, id)); }
  getCurrentVersion(context: TenantContext, campaignId: CampaignId) { this.require(context, "campaign.view"); return clone(this.currentVersionRecord(context, campaignId)); }
  listVersions(context: TenantContext, campaignId: CampaignId) { this.require(context, "campaign.view"); this.campaignRecord(context, campaignId); return clone(this.dependencies.state.campaignVersions.filter(item => item.campaignId === campaignId && item.organisationId === context.organisationId).sort((a, b) => b.versionNumber - a.versionNumber)); }
  listSnapshots(context: TenantContext, campaignId: CampaignId) { this.require(context, "campaign.view"); this.campaignRecord(context, campaignId); return clone(this.dependencies.state.audienceSnapshots.filter(item => item.campaignId === campaignId && item.organisationId === context.organisationId)); }
  getSnapshot(context: TenantContext, id: AudienceSnapshotId) { this.require(context, "campaign.view"); return clone(this.snapshotRecord(context, id)); }
  latestSnapshot(context: TenantContext, campaignId: CampaignId, stage?: SnapshotStage) { return this.listSnapshots(context, campaignId).filter(item => !stage || item.stage === stage).at(-1); }
  listApprovals(context: TenantContext, campaignId: CampaignId) { this.require(context, "campaign.view"); this.campaignRecord(context, campaignId); return clone(this.dependencies.state.approvalRecords.filter(item => item.campaignId === campaignId && item.organisationId === context.organisationId)); }
  listActivity(context: TenantContext, campaignId: CampaignId) { this.require(context, "campaign.view"); this.campaignRecord(context, campaignId); return clone(this.dependencies.state.campaignActivities.filter(item => item.campaignId === campaignId && item.organisationId === context.organisationId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))); }
  listPurposeDefinitions() { return clone(this.dependencies.purposes); }
  listAudienceDefinitions() { return clone(this.dependencies.audienceSources); }
  listMergeFieldDefinitions() { return clone(this.dependencies.mergeFields); }

  createCampaign(context: TenantContext, input: CreateCampaignInput) {
    const actor = this.require(context, "campaign.create");
    this.assertConfiguration(input.purposeKey, input.audienceSourceKey, input.content);
    const now = this.now().toISOString(), campaignId = this.next("campaign", this.dependencies.state.campaigns.length) as CampaignId, versionId = this.next("campaign_version", this.dependencies.state.campaignVersions.length) as CampaignVersion["id"];
    const version: CampaignVersion = { id: versionId, campaignId, organisationId: context.organisationId, versionNumber: 1, state: "Draft", purposeKey: input.purposeKey, audienceSourceKey: input.audienceSourceKey, content: clone(input.content), createdAt: now, createdByMembershipId: actor.id };
    const campaign: Campaign = { id: campaignId, organisationId: context.organisationId, name: input.name.trim(), ownerMembershipId: actor.id, status: "Draft", currentVersionId: version.id, createdAt: now, updatedAt: now };
    this.dependencies.state.campaigns.push(campaign); this.dependencies.state.campaignVersions.push(version);
    this.append(context, campaign.id, "campaign.created", "Campaign plan created", version);
    return clone(campaign);
  }

  updateDraft(context: TenantContext, campaignId: CampaignId, input: UpdateCampaignInput) {
    const actor = this.require(context, "campaign.edit"), campaign = this.campaignRecord(context, campaignId);
    if (campaign.ownerMembershipId !== actor.id && !capability(actor, "campaign.approve")) throw new Error("Campaign editing denied");
    this.assertConfiguration(input.purposeKey, input.audienceSourceKey, input.content);
    let version = this.currentVersionRecord(context, campaign.id);
    if (version.state === "Frozen" || campaign.status !== "Draft") {
      assertCampaignTransition(campaign.status, "Draft");
      const versionNumbers = this.dependencies.state.campaignVersions.filter(item => item.campaignId === campaign.id && item.organisationId === context.organisationId).map(item => item.versionNumber);
      version = { id: this.next("campaign_version", this.dependencies.state.campaignVersions.length) as CampaignVersion["id"], campaignId: campaign.id, organisationId: context.organisationId, versionNumber: Math.max(...versionNumbers) + 1, state: "Draft", purposeKey: input.purposeKey, audienceSourceKey: input.audienceSourceKey, content: clone(input.content), createdAt: this.now().toISOString(), createdByMembershipId: actor.id };
      this.dependencies.state.campaignVersions.push(version); campaign.currentVersionId = version.id; campaign.status = "Draft";
      this.append(context, campaign.id, "campaign.draft_created", `Draft version ${version.versionNumber} created`, version);
    } else {
      version.purposeKey = input.purposeKey; version.audienceSourceKey = input.audienceSourceKey; version.content = clone(input.content);
      this.append(context, campaign.id, "campaign.edited", "Draft campaign content updated", version);
    }
    if (input.name?.trim()) campaign.name = input.name.trim();
    campaign.updatedAt = this.now().toISOString();
    return clone(version);
  }

  preview(context: TenantContext, campaignId: CampaignId) {
    this.require(context, "campaign.view");
    const campaign = this.campaignRecord(context, campaignId), version = this.currentVersionRecord(context, campaign.id), snapshot = this.evaluate(context, campaign, version, "Preview");
    this.append(context, campaign.id, "campaign.previewed", `Audience preview generated: ${snapshot.eligibleCount} eligible, ${snapshot.excludedCount} excluded`, version);
    return clone(snapshot);
  }

  submit(context: TenantContext, campaignId: CampaignId) {
    this.require(context, "campaign.submit");
    const campaign = this.campaignRecord(context, campaignId), version = this.currentVersionRecord(context, campaign.id);
    if (campaign.status !== "Draft" || version.state !== "Draft") throw new Error("Only the current draft can be submitted");
    this.assertConfiguration(version.purposeKey, version.audienceSourceKey, version.content, true);
    const snapshot = this.evaluate(context, campaign, version, "Submission");
    this.assertReviewableAudience(snapshot);
    if (snapshot.eligibleCount === 0) throw new Error("A campaign requires at least one eligible recipient");
    assertCampaignTransition(campaign.status, "Ready for review");
    version.state = "Frozen"; version.frozenAt = this.now().toISOString(); version.submittedSnapshotId = snapshot.id;
    campaign.status = "Ready for review"; campaign.submittedVersionId = version.id; campaign.updatedAt = version.frozenAt;
    this.append(context, campaign.id, "campaign.submitted", `Version ${version.versionNumber} submitted for review`, version);
    return clone(snapshot);
  }

  approve(context: TenantContext, campaignId: CampaignId, reviewedSnapshotId: AudienceSnapshotId): CampaignApprovalResult {
    const actor = this.require(context, "campaign.approve"); this.require(context, "campaign.view");
    const campaign = this.campaignRecord(context, campaignId);
    if (campaign.status !== "Ready for review" || !campaign.submittedVersionId) throw new Error("Only a submitted campaign can be approved");
    const version = this.versionRecord(context, campaign.submittedVersionId), reviewed = this.snapshotRecord(context, reviewedSnapshotId);
    if (reviewed.campaignId !== campaign.id || reviewed.campaignVersionId !== version.id) throw new Error("The reviewed audience snapshot does not belong to the submitted campaign version");
    this.assertConfiguration(version.purposeKey, version.audienceSourceKey, version.content, true);
    const snapshot = this.evaluate(context, campaign, version, "Approval", reviewed);
    this.assertReviewableAudience(snapshot);
    const changes = audienceSnapshotChanges(reviewed, snapshot);
    if (audienceSnapshotDigest(reviewed) !== audienceSnapshotDigest(snapshot)) {
      this.append(context, campaign.id, "campaign.audience_changed", `Approval paused: audience changed to ${snapshot.eligibleCount} eligible and ${snapshot.excludedCount} excluded`, version);
      return { status: "Audience changed", reviewedSnapshotId: reviewed.id, currentSnapshot: clone(snapshot), changes: clone(changes) };
    }
    if (snapshot.eligibleCount === 0) throw new Error("Approval blocked because no recipients are currently eligible");
    assertCampaignTransition(campaign.status, "Approved");
    campaign.status = "Approved"; campaign.updatedAt = this.now().toISOString();
    const approval = { id: this.next("campaign_approval", this.dependencies.state.approvalRecords.length), campaignId: campaign.id, campaignVersionId: version.id, reviewedAudienceSnapshotId: reviewed.id, audienceSnapshotId: snapshot.id, organisationId: context.organisationId, approvingMembershipId: actor.id, approvedAt: campaign.updatedAt, eligibleRecipientCount: snapshot.eligibleCount, excludedRecipientCount: snapshot.excludedCount, noDeliveryOccurred: true } as ApprovalRecord;
    this.dependencies.state.approvalRecords.push(approval);
    this.append(context, campaign.id, "campaign.approved", `Campaign plan approved with ${snapshot.eligibleCount} eligible recipients; no delivery occurred`, version);
    return { status: "Approved", approval: clone(approval), snapshot: clone(snapshot) };
  }

  reject(context: TenantContext, campaignId: CampaignId, rejectionReason: string) {
    this.require(context, "campaign.approve"); const campaign = this.campaignRecord(context, campaignId);
    if (campaign.status !== "Ready for review" || !rejectionReason.trim()) throw new Error("A submitted campaign and rejection reason are required");
    assertCampaignTransition(campaign.status, "Rejected"); campaign.status = "Rejected"; campaign.updatedAt = this.now().toISOString();
    const version = this.versionRecord(context, campaign.submittedVersionId!);
    this.append(context, campaign.id, "campaign.rejected", "Campaign plan rejected", version, rejectionReason.trim());
    return clone(campaign);
  }

  cancel(context: TenantContext, campaignId: CampaignId) {
    this.require(context, "campaign.cancel"); const campaign = this.campaignRecord(context, campaignId);
    assertCampaignTransition(campaign.status, "Cancelled"); campaign.status = "Cancelled"; campaign.updatedAt = this.now().toISOString();
    this.append(context, campaign.id, "campaign.cancelled", "Draft campaign cancelled", this.currentVersionRecord(context, campaign.id));
    return clone(campaign);
  }

  recordExternalConsentChange(context: TenantContext, campaignId: CampaignId, input: ExternalConsentChangeInput) {
    const actor = this.require(context, "consent.record-external-change"); this.require(context, "campaign.view"); this.campaignRecord(context, campaignId);
    const contact = this.dependencies.contacts.find(item => item.id === input.contactId && item.organisationId === context.organisationId);
    if (!contact) throw new Error("Contact unavailable in this organisation context");
    if (!input.source.trim() || !Number.isFinite(Date.parse(input.effectiveAt))) throw new Error("Source and effective timestamp are required");
    const current = this.latestConsent(context.organisationId, contact.id, input.channel, this.now());
    const reinstating = current?.status === "Opted out" && input.status === "Recorded";
    if (reinstating && (!input.reason?.trim() || !input.externalActionConfirmed)) throw new Error("Re-consent requires an evidence note and confirmation that the action occurred externally");
    if (!input.externalActionConfirmed) throw new Error("Confirm that this consent action occurred outside Broker Growth Desk");
    const recordedAt = this.now().toISOString();
    const record = { id: `consent_zz_external_${this.dependencies.consentRecords.length + 1}`, organisationId: context.organisationId, subjectReference: { type: "contact", id: contact.id }, contactId: contact.id, channel: input.channel, status: input.status, originalSource: input.source.trim(), originalRecordedAt: input.effectiveAt, effectiveAt: input.effectiveAt, recordedAt, actorMembershipId: actor.id, reason: input.reason?.trim() || undefined, externalActionConfirmed: true, provenance: "External change" } as ConsentRecord;
    this.dependencies.consentRecords.push(record);
    this.append(context, campaignId, "consent.external_change_recorded", `${input.channel} consent change recorded from supplied external evidence`, this.currentVersionRecord(context, campaignId), input.reason);
    return clone(record);
  }

  private assertConfiguration(purposeKey: string, sourceKey: string, content: CampaignContent, complete = false) {
    const purpose = this.dependencies.purposes.find(item => item.key === purposeKey), source = this.dependencies.audienceSources.find(item => item.key === sourceKey);
    if (!purpose || !source || purpose.verticalKey !== source.verticalKey || !purpose.audienceSourceKeys.includes(sourceKey)) throw new Error("Unsupported campaign purpose and audience source combination");
    if (!purpose.supportedChannels.includes(content.channel)) throw new Error("This channel is not supported for the selected purpose");
    const registered = new Set(this.dependencies.mergeFields.map(item => item.key)), permitted = new Set(purpose.permittedMergeFields);
    for (const key of content.selectedMergeFieldKeys) if (!registered.has(key) || !permitted.has(key)) throw new Error(`Unsupported merge field: ${key}`);
    const used = [...tokens(content.body), ...tokens(content.subject ?? "")];
    for (const key of used) if (!content.selectedMergeFieldKeys.includes(key) || !permitted.has(key)) throw new Error(`Merge field is not selected or permitted: ${key}`);
    if (complete && (!content.body.trim() || (content.channel === "Email" && !content.subject?.trim()))) throw new Error("Complete the campaign content before review");
  }

  private evaluate(context: TenantContext, campaign: Campaign, version: CampaignVersion, stage: SnapshotStage, comparison?: AudienceSnapshot) {
    const provider = this.dependencies.runtime.audienceProviders.find(item => item.sourceKey === version.audienceSourceKey);
    if (!provider) throw new Error("Audience provider is unavailable");
    const now = this.now(), candidates = provider.getCandidates({ organisationId: context.organisationId, purposeKey: version.purposeKey, sourceKey: version.audienceSourceKey, now }, this.dependencies.runtimeDependencies), seen = new Set<string>();
    const recipients = candidates.map((candidate, index) => this.evaluateCandidate(context, version, candidate, index, seen, now));
    const previous = comparison ?? this.dependencies.state.audienceSnapshots.filter(item => item.campaignId === campaign.id && item.campaignVersionId === version.id && item.organisationId === context.organisationId).at(-1);
    const provisional = { recipients } as AudienceSnapshot, changes = previous ? audienceSnapshotChanges(previous, provisional) : [];
    const snapshot = { id: this.next("audience_snapshot", this.dependencies.state.audienceSnapshots.length), campaignId: campaign.id, campaignVersionId: version.id, organisationId: context.organisationId, stage, evaluatedAt: now.toISOString(), recipients, eligibleCount: recipients.filter(item => item.evaluation.eligible).length, excludedCount: recipients.filter(item => !item.evaluation.eligible).length, previousSnapshotId: previous?.id, changedSincePrevious: changes.length > 0, changesSincePrevious: changes } as AudienceSnapshot;
    this.dependencies.state.audienceSnapshots.push(snapshot);
    return snapshot;
  }

  private evaluateCandidate(context: TenantContext, version: CampaignVersion, candidate: AudienceCandidate<TData>, index: number, seen: Set<string>, now: Date) {
    const contact = this.dependencies.contacts.find(item => item.id === candidate.contactId), reasons: EligibilityReason[] = [], suppressions = this.effectiveSuppressions(context.organisationId, now);
    let suppressionStatus: AudienceRecipient["suppressionStatus"] = "None";
    if (!contact || contact.organisationId !== context.organisationId) reasons.push(reason("organisation_mismatch", "Contact does not belong to the active organisation"));
    const organisationSuppressed = suppressions.find(item => item.scope === "Organisation"), contactSuppressed = suppressions.find(item => item.scope === "Contact" && item.contactId === candidate.contactId), channelSuppressed = suppressions.find(item => item.scope === "Channel" && item.contactId === candidate.contactId && item.channel === version.content.channel);
    if (organisationSuppressed) { suppressionStatus = "Organisation"; reasons.push(reason("organisation_suppressed", "Organisation-wide outreach suppression is active")); }
    if (contactSuppressed) { if (suppressionStatus === "None") suppressionStatus = "Contact"; reasons.push(reason("contact_suppressed", "This contact has an active outreach suppression")); }
    if (channelSuppressed) { if (suppressionStatus === "None") suppressionStatus = "Channel"; reasons.push(reason("channel_suppressed", `${version.content.channel} outreach is suppressed for this contact`)); }
    const consent = this.latestConsent(context.organisationId, candidate.contactId, version.content.channel, now), consentStatus = consent?.status ?? "Missing";
    if (consentStatus === "Opted out") reasons.push(reason("consent_opted_out", `${version.content.channel} consent is opted out`)); else if (consentStatus !== "Recorded") reasons.push(reason("consent_not_recorded", `${version.content.channel} consent is not recorded`));
    if (!candidate.purposeDecision.eligible) reasons.push(reason("purpose_ineligible", candidate.purposeDecision.displayReason));
    if (contact?.status !== "Active") reasons.push(reason("inactive_contact", "Contact is inactive"));
    const destination = version.content.channel === "Email" ? contact?.email ?? "" : contact?.phone ?? "";
    if (!destination.trim()) reasons.push(reason("missing_destination", `${version.content.channel} destination is missing`)); else if (!this.validDestination(version.content.channel, destination)) reasons.push(reason("invalid_destination", `${version.content.channel} destination is invalid`));
    const duplicateKey = `${candidate.contactId}:${version.content.channel}`;
    if (seen.has(duplicateKey)) reasons.push(reason("duplicate_recipient", "Duplicate recipient within this campaign version")); else seen.add(duplicateKey);
    const resolvedMergeFields: Record<string, string | number | boolean | null> = {};
    for (const key of version.content.selectedMergeFieldKeys) {
      const resolver = this.dependencies.runtime.mergeFieldResolvers.find(item => item.mergeFieldKey === key), value = resolver?.resolve(candidate, this.dependencies.runtimeDependencies) ?? null;
      resolvedMergeFields[key] = value;
      if (value === null || value === "") reasons.push(reason("unresolved_merge_field", `Merge field could not be resolved: ${key}`));
    }
    return { id: `recipient_${index + 1}`, candidateKey: candidate.candidateKey, subjectId: candidate.subjectId, subjectDisplayName: candidate.subjectDisplayName, contactId: candidate.contactId, contextLabel: candidate.contextLabel, maskedDestination: this.mask(version.content.channel, destination), consentStatus, suppressionStatus, evaluation: { eligible: reasons.length === 0, primaryReason: reasons[0], reasons, evaluatedAt: now.toISOString() }, resolvedMergeFields } as AudienceRecipient;
  }

  private effectiveSuppressions(organisationId: OrganisationId, now: Date) {
    const key = (item: SuppressionRecord) => item.scope === "Organisation" ? "Organisation" : item.scope === "Contact" ? `Contact:${item.contactId ?? ""}` : `Channel:${item.contactId ?? ""}:${item.channel ?? ""}`;
    const compare = (left: SuppressionRecord, right: SuppressionRecord) => Date.parse(left.effectiveAt) - Date.parse(right.effectiveAt) || Date.parse(left.recordedAt) - Date.parse(right.recordedAt) || left.id.localeCompare(right.id);
    const resolved = new Map<string, SuppressionRecord>();
    for (const item of this.dependencies.state.suppressionRecords) {
      if (item.organisationId !== organisationId || !Number.isFinite(Date.parse(item.effectiveAt)) || Date.parse(item.effectiveAt) > now.getTime()) continue;
      const existing = resolved.get(key(item));
      if (!existing || compare(existing, item) <= 0) resolved.set(key(item), item);
    }
    return [...resolved.values()].filter(item => item.status === "Active");
  }

  private assertReviewableAudience(snapshot: AudienceSnapshot) { if (snapshot.recipients.some(item => item.evaluation.reasons.some(entry => entry.code === "unresolved_merge_field"))) throw new Error("Review blocked because one or more selected merge fields could not be resolved"); }
  private latestConsent(organisationId: OrganisationId, contactId: ContactId, channel: CampaignChannel, now: Date) {
    return selectCurrentEffectiveEvidence(
      this.dependencies.consentRecords.filter(item => item.organisationId === organisationId && item.contactId === contactId && item.channel === channel),
      now,
    );
  }
  private validDestination(channel: CampaignChannel, value: string) { return channel === "Email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : value.replace(/\D/g, "").length >= 8; }
  private mask(channel: CampaignChannel, value: string) { if (!value) return "Not available"; if (channel === "Email") { const [name, domain] = value.split("@"); return domain ? `${name.slice(0, 2)}•••@${domain}` : "Invalid email"; } const digits = value.replace(/\D/g, ""); return digits.length >= 4 ? `•••• ••• ${digits.slice(-3)}` : "Invalid phone"; }
}
