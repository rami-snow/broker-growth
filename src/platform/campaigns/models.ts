import type { CampaignChannel } from "@/platform/campaigns/contracts";
import type { ContactId } from "@/platform/contacts/models";
import type { MembershipId, OrganisationId } from "@/platform/core/models";

export type CampaignId = `campaign_${string}`;
export type CampaignVersionId = `campaign_version_${string}`;
export type AudienceSnapshotId = `audience_snapshot_${string}`;
export type ApprovalRecordId = `campaign_approval_${string}`;
export type SuppressionRecordId = `suppression_${string}`;
export type CampaignActivityEventId = `campaign_event_${string}`;

export type CampaignStatus = "Draft" | "Ready for review" | "Approved" | "Rejected" | "Cancelled";
export type CampaignVersionState = "Draft" | "Frozen";
export type SnapshotStage = "Preview" | "Submission" | "Approval";
export type EligibilityReasonCode = "organisation_mismatch" | "organisation_suppressed" | "contact_suppressed" | "channel_suppressed" | "consent_opted_out" | "consent_not_recorded" | "purpose_ineligible" | "inactive_contact" | "missing_destination" | "invalid_destination" | "duplicate_recipient" | "unresolved_merge_field";

export interface CampaignContent { channel: CampaignChannel; subject?: string; body: string; selectedMergeFieldKeys: string[]; }
export interface Campaign { id: CampaignId; organisationId: OrganisationId; name: string; ownerMembershipId: MembershipId; status: CampaignStatus; currentVersionId: CampaignVersionId; submittedVersionId?: CampaignVersionId; createdAt: string; updatedAt: string; }
export interface CampaignVersion { id: CampaignVersionId; campaignId: CampaignId; organisationId: OrganisationId; versionNumber: number; state: CampaignVersionState; purposeKey: string; audienceSourceKey: string; content: CampaignContent; submittedSnapshotId?: AudienceSnapshotId; createdAt: string; createdByMembershipId: MembershipId; frozenAt?: string; }
export interface EligibilityReason { code: EligibilityReasonCode; displayReason: string; }
export interface EligibilityEvaluation { eligible: boolean; primaryReason?: EligibilityReason; reasons: EligibilityReason[]; evaluatedAt: string; }
export interface AudienceRecipient { id: string; candidateKey: string; subjectId: string; subjectDisplayName: string; contactId: ContactId; contextLabel: string; maskedDestination: string; consentStatus: "Recorded" | "Not recorded" | "Opted out" | "Missing"; suppressionStatus: "None" | "Organisation" | "Contact" | "Channel"; evaluation: EligibilityEvaluation; resolvedMergeFields: Record<string, string | number | boolean | null>; }

export interface AudienceSnapshotChange {
  candidateKey: string;
  contactId?: ContactId;
  subjectDisplayName: string;
  type: "Added" | "Removed" | "Changed";
  displaySummary: string;
}

export interface AudienceSnapshot { id: AudienceSnapshotId; campaignId: CampaignId; campaignVersionId: CampaignVersionId; organisationId: OrganisationId; stage: SnapshotStage; evaluatedAt: string; recipients: AudienceRecipient[]; eligibleCount: number; excludedCount: number; previousSnapshotId?: AudienceSnapshotId; changedSincePrevious: boolean; changesSincePrevious?: AudienceSnapshotChange[]; }
export interface ApprovalRecord { id: ApprovalRecordId; campaignId: CampaignId; campaignVersionId: CampaignVersionId; reviewedAudienceSnapshotId: AudienceSnapshotId; audienceSnapshotId: AudienceSnapshotId; organisationId: OrganisationId; approvingMembershipId: MembershipId; approvedAt: string; eligibleRecipientCount: number; excludedRecipientCount: number; noDeliveryOccurred: true; }
export type CampaignApprovalResult =
  | { status: "Approved"; approval: ApprovalRecord; snapshot: AudienceSnapshot }
  | { status: "Audience changed"; reviewedSnapshotId: AudienceSnapshotId; currentSnapshot: AudienceSnapshot; changes: AudienceSnapshotChange[] };
export interface SuppressionRecord { id: SuppressionRecordId; organisationId: OrganisationId; contactId?: ContactId; scope: "Organisation" | "Contact" | "Channel"; channel?: CampaignChannel; status: "Active" | "Lifted"; source: string; effectiveAt: string; recordedAt: string; actorMembershipId?: MembershipId; reason?: string; }
export interface CampaignActivityEvent { id: CampaignActivityEventId; campaignId: CampaignId; campaignVersionId?: CampaignVersionId; organisationId: OrganisationId; actorMembershipId: MembershipId; occurredAt: string; type: "campaign.created" | "campaign.edited" | "campaign.previewed" | "campaign.submitted" | "campaign.audience_changed" | "campaign.approved" | "campaign.rejected" | "campaign.cancelled" | "campaign.draft_created" | "consent.external_change_recorded"; summary: string; note?: string; }
export interface CampaignState { campaigns: Campaign[]; campaignVersions: CampaignVersion[]; audienceSnapshots: AudienceSnapshot[]; approvalRecords: ApprovalRecord[]; suppressionRecords: SuppressionRecord[]; campaignActivities: CampaignActivityEvent[]; }
