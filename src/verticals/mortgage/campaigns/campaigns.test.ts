import { describe, expect, it } from "vitest";
import { audienceSnapshotChanges, audienceSnapshotDigest, InMemoryCampaignRepository } from "@/platform/campaigns/repository";
import type { CampaignChannel } from "@/platform/campaigns/contracts";
import type { AudienceSnapshotId, SuppressionRecord } from "@/platform/campaigns/models";
import { createFixtureState } from "@/verticals/mortgage/fixtures";
import { mortgageVerticalDefinition } from "@/verticals/mortgage/definition";
import { annualReviewPurposeKey, annualReviewSourceKey, fixedExpiryPurposeKey, fixedExpirySourceKey } from "@/verticals/mortgage/campaigns/extensions";

const harbour = { organisationId: "brk_harbour", userId: "usr_alex" } as const;
const ranges = { organisationId: "brk_ranges", userId: "usr_priya" } as const;
const now = () => new Date("2026-11-14T12:00:00+11:00");
function setup() {
  const state = createFixtureState(), extensions = mortgageVerticalDefinition.campaignExtensions;
  const repo = new InMemoryCampaignRepository({ state, contacts: state.contacts, consentRecords: state.consentRecords, memberships: state.memberships, organisations: state.organisations, purposes: extensions.purposes, audienceSources: extensions.audienceSources, mergeFields: extensions.mergeFields, runtime: extensions.runtime, runtimeDependencies: state, now });
  return { state, repo };
}
const content = (channel: CampaignChannel = "Email") => ({ channel, subject: channel === "Email" ? "Review with {{brokerage.name}}" : undefined, body: "Hi {{contact.firstName}}, please arrange your review. [Sender identification] [Unsubscribe instructions]", selectedMergeFieldKeys: ["brokerage.name", "contact.firstName"] });
const create = (repo: ReturnType<typeof setup>["repo"], channel: CampaignChannel = "Email", fixed = false) => repo.createCampaign(harbour, { name: "Test campaign", purposeKey: fixed ? fixedExpiryPurposeKey : annualReviewPurposeKey, audienceSourceKey: fixed ? fixedExpirySourceKey : annualReviewSourceKey, content: content(channel) });
const approveUnchanged = (repo: ReturnType<typeof setup>["repo"], campaignId: `campaign_${string}`, reviewedSnapshotId: AudienceSnapshotId) => {
  const result = repo.approve(harbour, campaignId, reviewedSnapshotId);
  expect(result.status).toBe("Approved");
  if (result.status !== "Approved") throw new Error("Expected approval");
  return result;
};
const suppression = (overrides: Partial<SuppressionRecord> & Pick<SuppressionRecord, "id" | "scope" | "status" | "effectiveAt">): SuppressionRecord => ({ organisationId: "brk_harbour", source: "Suppression control fixture", recordedAt: overrides.effectiveAt, ...overrides });

describe("campaign tenancy, registration and read authorization", () => {
  it("rejects cross-organisation campaign access", () => { const { repo } = setup(); expect(() => repo.getCampaign(ranges, "campaign_001")).toThrow("unavailable"); });
  it("does not leak cross-organisation audience candidates", () => { const { repo } = setup(), campaign = create(repo), snapshot = repo.preview(harbour, campaign.id); expect(snapshot.recipients.length).toBeGreaterThan(0); expect(snapshot.recipients.every(item => item.contactId.startsWith("person_") && !item.subjectDisplayName.includes("Wells"))).toBe(true); });
  it("rejects unsupported purpose, source and merge-field combinations", () => { const { repo } = setup(); expect(() => repo.createCampaign(harbour, { name: "Invalid", purposeKey: annualReviewPurposeKey, audienceSourceKey: fixedExpirySourceKey, content: content() })).toThrow("Unsupported"); expect(() => repo.createCampaign(harbour, { name: "Invalid field", purposeKey: annualReviewPurposeKey, audienceSourceKey: annualReviewSourceKey, content: { ...content(), selectedMergeFieldKeys: ["loan.fixedRateExpiryDate"] } })).toThrow("Unsupported merge field"); });
  it("requires campaign.view for every record read", () => {
    const { state, repo } = setup(), campaign = repo.getCampaign(harbour, "campaign_003"), version = repo.getCurrentVersion(harbour, campaign.id), snapshot = repo.latestSnapshot(harbour, campaign.id)!;
    const membership = state.memberships.find(item => item.id === "mem_h_admin")!;
    membership.capabilities = membership.capabilities.filter(item => item !== "campaign.view");
    expect(() => repo.getCampaign(harbour, campaign.id)).toThrow("campaign.view denied");
    expect(() => repo.getVersion(harbour, version.id)).toThrow("campaign.view denied");
    expect(() => repo.getSnapshot(harbour, snapshot.id)).toThrow("campaign.view denied");
    expect(() => repo.listSnapshots(harbour, campaign.id)).toThrow("campaign.view denied");
    expect(() => repo.listApprovals(harbour, campaign.id)).toThrow("campaign.view denied");
    expect(() => repo.listActivity(harbour, campaign.id)).toThrow("campaign.view denied");
  });
});

describe("conservative eligibility", () => {
  it("requires Recorded channel consent and excludes opt-outs and Not recorded", () => { const { repo } = setup(), snapshot = repo.preview(harbour, create(repo).id), reasons = snapshot.recipients.flatMap(item => item.evaluation.reasons.map(entry => entry.code)); expect(reasons).toContain("consent_opted_out"); expect(reasons).toContain("consent_not_recorded"); expect(snapshot.recipients.filter(item => item.evaluation.eligible).every(item => item.consentStatus === "Recorded")).toBe(true); });
  it("applies suppression before consent and keeps all useful reasons", () => { const { repo } = setup(), snapshot = repo.preview(harbour, create(repo).id), suppressed = snapshot.recipients.find(item => item.suppressionStatus !== "None")!; expect(suppressed.evaluation.primaryReason?.code).toBe("contact_suppressed"); expect(suppressed.evaluation.eligible).toBe(false); });
  it("excludes missing destinations and duplicate recipients", () => { const { repo } = setup(), fixed = create(repo, "SMS", true), snapshot = repo.preview(harbour, fixed.id), allReasons = snapshot.recipients.flatMap(item => item.evaluation.reasons.map(entry => entry.code)); expect(allReasons).toContain("missing_destination"); const annual = repo.preview(harbour, create(repo).id); expect(annual.recipients.flatMap(item => item.evaluation.reasons.map(entry => entry.code))).toContain("duplicate_recipient"); });
  it("uses only campaign-eligible mortgage opportunity states and each household's primary contact", () => { const { state, repo } = setup(), campaign = create(repo), booked = state.reviewOpportunities.find(item => item.organisationId === harbour.organisationId && item.typeKey === "Annual review" && ["Upcoming", "Due", "Overdue"].includes(item.lifecycleStatus))!; booked.lifecycleStatus = "Review booked"; const snapshot = repo.preview(harbour, campaign.id); for (const recipient of snapshot.recipients) { const opportunity = state.reviewOpportunities.find(item => item.id === recipient.subjectId)!, household = state.households.find(item => item.id === opportunity.householdId)!; expect(["Upcoming", "Due", "Overdue"]).toContain(opportunity.lifecycleStatus); expect(recipient.contactId).toBe(household.primaryContactId); } expect(snapshot.recipients.some(item => item.subjectId === "review_001_completed" || item.subjectId === booked.id)).toBe(false); });
  it("excludes archived households from campaign eligibility while retaining the audit reason", () => { const { state, repo } = setup(), campaign = create(repo), candidate = repo.preview(harbour, campaign.id).recipients[0]!, opportunity = state.reviewOpportunities.find(item => item.id === candidate.subjectId)!, household = state.households.find(item => item.id === opportunity.householdId)!; household.status = "Archived"; const evaluation = repo.preview(harbour, campaign.id).recipients.find(item => item.subjectId === candidate.subjectId)!.evaluation; expect(evaluation.eligible).toBe(false); expect(evaluation.reasons).toContainEqual({code:"purpose_ineligible",displayReason:"Household is inactive or archived"}); });
  it("produces deterministic snapshots with an injected clock", () => { const { repo } = setup(), campaign = create(repo), first = repo.preview(harbour, campaign.id), second = repo.preview(harbour, campaign.id); expect(second.recipients).toEqual(first.recipients); expect(second.evaluatedAt).toBe("2026-11-14T01:00:00.000Z"); });
});

describe("effective suppression history", () => {
  it("uses Active and a later Lifted record for the same contact key", () => {
    const { state, repo } = setup(), campaign = create(repo), eligible = repo.preview(harbour, campaign.id).recipients.find(item => item.evaluation.eligible)!;
    state.suppressionRecords.push(suppression({ id: "suppression_test_active", contactId: eligible.contactId, scope: "Contact", status: "Active", effectiveAt: "2026-11-10T09:00:00+11:00" }));
    expect(repo.preview(harbour, campaign.id).recipients.find(item => item.candidateKey === eligible.candidateKey)?.evaluation.reasons.map(item => item.code)).toContain("contact_suppressed");
    state.suppressionRecords.push(suppression({ id: "suppression_test_lifted", contactId: eligible.contactId, scope: "Contact", status: "Lifted", effectiveAt: "2026-11-11T09:00:00+11:00" }));
    expect(repo.preview(harbour, campaign.id).recipients.find(item => item.candidateKey === eligible.candidateKey)?.evaluation.reasons.map(item => item.code)).not.toContain("contact_suppressed");
  });
  it("does not let an earlier Lifted record override a later Active record", () => {
    const { state, repo } = setup(), campaign = create(repo), eligible = repo.preview(harbour, campaign.id).recipients.find(item => item.evaluation.eligible)!;
    state.suppressionRecords.push(suppression({ id: "suppression_test_early_lift", contactId: eligible.contactId, scope: "Contact", status: "Lifted", effectiveAt: "2026-11-01T09:00:00+11:00" }), suppression({ id: "suppression_test_later_active", contactId: eligible.contactId, scope: "Contact", status: "Active", effectiveAt: "2026-11-10T09:00:00+11:00" }));
    expect(repo.preview(harbour, campaign.id).recipients.find(item => item.candidateKey === eligible.candidateKey)?.evaluation.reasons.map(item => item.code)).toContain("contact_suppressed");
  });
  it("ignores future Active and Lifted records", () => {
    const { state, repo } = setup(), campaign = create(repo), eligible = repo.preview(harbour, campaign.id).recipients.find(item => item.evaluation.eligible)!;
    state.suppressionRecords.push(suppression({ id: "suppression_test_future_active", contactId: eligible.contactId, scope: "Channel", channel: "Email", status: "Active", effectiveAt: "2026-11-15T09:00:00+11:00" }));
    expect(repo.preview(harbour, campaign.id).recipients.find(item => item.candidateKey === eligible.candidateKey)?.evaluation.reasons.map(item => item.code)).not.toContain("channel_suppressed");
    state.suppressionRecords.push(suppression({ id: "suppression_test_current_active", contactId: eligible.contactId, scope: "Contact", status: "Active", effectiveAt: "2026-11-10T09:00:00+11:00" }), suppression({ id: "suppression_test_future_lift", contactId: eligible.contactId, scope: "Contact", status: "Lifted", effectiveAt: "2026-11-15T10:00:00+11:00" }));
    expect(repo.preview(harbour, campaign.id).recipients.find(item => item.candidateKey === eligible.candidateKey)?.evaluation.reasons.map(item => item.code)).toContain("contact_suppressed");
  });
  it("resolves organisation, contact and channel keys independently", () => {
    const { state, repo } = setup(), campaign = create(repo), eligible = repo.preview(harbour, campaign.id).recipients.find(item => item.evaluation.eligible)!;
    state.suppressionRecords.push(
      suppression({ id: "suppression_test_org_active", scope: "Organisation", status: "Active", effectiveAt: "2026-11-01T09:00:00+11:00" }),
      suppression({ id: "suppression_test_org_lift", scope: "Organisation", status: "Lifted", effectiveAt: "2026-11-02T09:00:00+11:00" }),
      suppression({ id: "suppression_test_contact_active", contactId: eligible.contactId, scope: "Contact", status: "Active", effectiveAt: "2026-11-03T09:00:00+11:00" }),
      suppression({ id: "suppression_test_channel_active", contactId: eligible.contactId, channel: "Email", scope: "Channel", status: "Active", effectiveAt: "2026-11-04T09:00:00+11:00" }),
      suppression({ id: "suppression_test_channel_lift", contactId: eligible.contactId, channel: "Email", scope: "Channel", status: "Lifted", effectiveAt: "2026-11-05T09:00:00+11:00" }),
    );
    const reasons = repo.preview(harbour, campaign.id).recipients.find(item => item.candidateKey === eligible.candidateKey)!.evaluation.reasons.map(item => item.code);
    expect(reasons).toContain("contact_suppressed"); expect(reasons).not.toContain("organisation_suppressed"); expect(reasons).not.toContain("channel_suppressed");
  });
  it("orders effective instants correctly across timezone offsets", () => {
    const { state, repo } = setup(), campaign = create(repo), eligible = repo.preview(harbour, campaign.id).recipients.find(item => item.evaluation.eligible)!;
    state.suppressionRecords.push(
      suppression({ id: "suppression_test_offset_active", contactId: eligible.contactId, scope: "Contact", status: "Active", effectiveAt: "2026-11-14T11:15:00+11:00", recordedAt: "2026-11-14T11:16:00+11:00" }),
      suppression({ id: "suppression_test_offset_lift", contactId: eligible.contactId, scope: "Contact", status: "Lifted", effectiveAt: "2026-11-14T00:30:00Z", recordedAt: "2026-11-14T00:31:00Z" }),
    );
    expect(repo.preview(harbour, campaign.id).recipients.find(item => item.candidateKey === eligible.candidateKey)?.evaluation.reasons.map(item => item.code)).not.toContain("contact_suppressed");
  });
});

describe("immutable review and approval", () => {
  it("freezes submitted versions and creates a new draft when edited", () => { const { repo } = setup(), campaign = create(repo), submitted = repo.submit(harbour, campaign.id), frozen = repo.getCurrentVersion(harbour, campaign.id); expect(frozen.state).toBe("Frozen"); const original = structuredClone(frozen); const draft = repo.updateDraft(harbour, campaign.id, { purposeKey: frozen.purposeKey, audienceSourceKey: frozen.audienceSourceKey, content: { ...frozen.content, body: "Revised plan" } }); expect(draft.versionNumber).toBe(2); expect(repo.getVersion(harbour, original.id)).toEqual(original); expect(submitted.stage).toBe("Submission"); });
  it("preserves an approved version when a later draft is created", () => { const { repo } = setup(), campaign = create(repo), submitted = repo.submit(harbour, campaign.id); approveUnchanged(repo, campaign.id, submitted.id); const approved = repo.getCurrentVersion(harbour, campaign.id), draft = repo.updateDraft(harbour, campaign.id, { purposeKey: approved.purposeKey, audienceSourceKey: approved.audienceSourceKey, content: { ...approved.content, body: "A later draft" } }); expect(draft.versionNumber).toBe(2); expect(repo.getVersion(harbour, approved.id)).toEqual(approved); expect(repo.listApprovals(harbour, campaign.id)[0].campaignVersionId).toBe(approved.id); });
  it("retains the rejection reason and permits a later draft", () => { const { repo } = setup(), campaign = create(repo); repo.submit(harbour, campaign.id); repo.reject(harbour, campaign.id, "Sender identification needs revision"); expect(repo.listActivity(harbour, campaign.id).find(item => item.type === "campaign.rejected")?.note).toBe("Sender identification needs revision"); expect(repo.updateDraft(harbour, campaign.id, { purposeKey: annualReviewPurposeKey, audienceSourceKey: annualReviewSourceKey, content: content() }).versionNumber).toBe(2); });
  it("blocks changed audiences until the revised snapshot is explicitly reviewed", () => {
    const { repo } = setup(), campaign = create(repo), submitted = repo.submit(harbour, campaign.id), consentOnly = submitted.recipients.find(item => !item.evaluation.eligible && item.evaluation.reasons.every(entry => entry.code === "consent_opted_out" || entry.code === "consent_not_recorded"))!;
    repo.recordExternalConsentChange(harbour, campaign.id, { contactId: consentOnly.contactId, channel: "Email", status: "Recorded", source: "External re-consent fixture", effectiveAt: "2026-11-14T12:00:00+11:00", reason: "Client completed the external CRM consent form", externalActionConfirmed: true });
    const firstAttempt = repo.approve(harbour, campaign.id, submitted.id);
    expect(firstAttempt.status).toBe("Audience changed"); expect(repo.getCampaign(harbour, campaign.id).status).toBe("Ready for review");
    if (firstAttempt.status !== "Audience changed") throw new Error("Expected audience change");
    expect(firstAttempt.changes.length).toBeGreaterThan(0); expect(repo.getSnapshot(harbour, submitted.id)).toEqual(submitted);
    const secondAttempt = approveUnchanged(repo, campaign.id, firstAttempt.currentSnapshot.id);
    expect(secondAttempt.approval.reviewedAudienceSnapshotId).toBe(firstAttempt.currentSnapshot.id); expect(secondAttempt.approval.audienceSnapshotId).toBe(secondAttempt.snapshot.id); expect(secondAttempt.approval.audienceSnapshotId).not.toBe(secondAttempt.approval.reviewedAudienceSnapshotId);
  });
  it("uses canonical material comparison instead of timestamps or snapshot identity", () => {
    const { repo } = setup(), campaign = create(repo), first = repo.preview(harbour, campaign.id), same = structuredClone(first);
    same.id = "audience_snapshot_other"; same.evaluatedAt = "2099-01-01T00:00:00Z"; same.recipients.forEach(item => { item.evaluation.evaluatedAt = "2099-01-01T00:00:00Z"; });
    expect(audienceSnapshotDigest(same)).toBe(audienceSnapshotDigest(first)); expect(audienceSnapshotChanges(first, same)).toEqual([]);
    same.recipients[0].resolvedMergeFields["contact.firstName"] = "Changed";
    expect(audienceSnapshotDigest(same)).not.toBe(audienceSnapshotDigest(first)); expect(audienceSnapshotChanges(first, same)[0].type).toBe("Changed");
    same.recipients.pop(); expect(audienceSnapshotChanges(first, same).some(item => item.type === "Removed")).toBe(true);
  });
  it("rejects unauthorized approval", () => { const { state, repo } = setup(), campaign = create(repo), submitted = repo.submit(harbour, campaign.id), membership = state.memberships.find(item => item.id === "mem_h_admin")!; membership.capabilities = membership.capabilities.filter(item => item !== "campaign.approve"); expect(() => repo.approve(harbour, campaign.id, submitted.id)).toThrow("campaign.approve denied"); });
  it("records actor, reviewed and final snapshots, counts, timestamp and non-delivery", () => { const { repo } = setup(), campaign = create(repo), submitted = repo.submit(harbour, campaign.id), result = approveUnchanged(repo, campaign.id, submitted.id); expect(result.approval).toMatchObject({ approvingMembershipId: "mem_h_admin", reviewedAudienceSnapshotId: submitted.id, approvedAt: "2026-11-14T01:00:00.000Z", noDeliveryOccurred: true }); expect(result.approval.eligibleRecipientCount).toBeGreaterThan(0); expect(Object.keys(repo.getCampaign(harbour, campaign.id))).not.toEqual(expect.arrayContaining(["sentAt", "scheduledAt", "deliveryStatus"])); });
  it("protects frozen versions, submitted snapshots and approvals from returned-reference mutation", () => {
    const { repo } = setup(), campaign = create(repo), submitted = repo.submit(harbour, campaign.id), frozen = repo.getCurrentVersion(harbour, campaign.id);
    frozen.content.body = "Caller mutation"; submitted.recipients[0].resolvedMergeFields["contact.firstName"] = "Caller mutation"; submitted.recipients.length = 0;
    expect(repo.getCurrentVersion(harbour, campaign.id).content.body).not.toBe("Caller mutation"); expect(repo.getSnapshot(harbour, submitted.id).recipients.length).toBeGreaterThan(0); expect(repo.getSnapshot(harbour, submitted.id).recipients[0].resolvedMergeFields["contact.firstName"]).not.toBe("Caller mutation");
    const result = approveUnchanged(repo, campaign.id, submitted.id); result.approval.eligibleRecipientCount = 999; expect(repo.listApprovals(harbour, campaign.id)[0].eligibleRecipientCount).not.toBe(999);
  });
  it("resolves only explicitly selected and permitted merge fields", () => { const { repo } = setup(), campaign = create(repo), snapshot = repo.preview(harbour, campaign.id), recipient = snapshot.recipients[0]; expect(Object.keys(recipient.resolvedMergeFields).sort()).toEqual(["brokerage.name", "contact.firstName"]); });
  it("blocks unresolved selected merge fields from review", () => { const { state, repo } = setup(), campaign = create(repo); state.organisations.find(item => item.id === harbour.organisationId)!.name = ""; expect(() => repo.submit(harbour, campaign.id)).toThrow("merge fields could not be resolved"); });
  it("ignores consent changes that are not yet effective", () => { const { repo } = setup(), campaign = create(repo), preview = repo.preview(harbour, campaign.id), eligible = preview.recipients.find(item => item.evaluation.eligible)!; repo.recordExternalConsentChange(harbour, campaign.id, { contactId: eligible.contactId, channel: "Email", status: "Opted out", source: "Future CRM update fixture", effectiveAt: "2026-11-15T12:00:00+11:00", reason: "Future effective request", externalActionConfirmed: true }); const submitted = repo.submit(harbour, campaign.id); expect(submitted.recipients.find(item => item.contactId === eligible.contactId)?.evaluation.eligible).toBe(true); });
});

describe("external consent evidence", () => {
  it("requires documented external evidence to reinstate an effective opt-out", () => {
    const { state, repo } = setup(), campaign = create(repo), optedOut = repo.preview(harbour, campaign.id).recipients.find(item => item.consentStatus === "Opted out")!;
    const base = { contactId: optedOut.contactId, channel: "Email" as const, status: "Recorded" as const, source: "External CRM re-consent", effectiveAt: "2026-11-14T12:00:00+11:00" };
    expect(() => repo.recordExternalConsentChange(harbour, campaign.id, { ...base, reason: "", externalActionConfirmed: true })).toThrow("evidence note");
    expect(() => repo.recordExternalConsentChange(harbour, campaign.id, { ...base, reason: "Client completed the external consent form", externalActionConfirmed: false })).toThrow("confirmation");
    expect(() => repo.recordExternalConsentChange(harbour, campaign.id, { ...base, source: "", reason: "Client completed the external consent form", externalActionConfirmed: true })).toThrow("Source and effective timestamp");
    const record = repo.recordExternalConsentChange(harbour, campaign.id, { ...base, reason: "Client completed the external consent form", externalActionConfirmed: true });
    expect(record).toMatchObject({ status: "Recorded", actorMembershipId: "mem_h_admin", externalActionConfirmed: true, reason: "Client completed the external consent form" }); expect(state.consentRecords.at(-1)).toEqual(record);
  });
});
