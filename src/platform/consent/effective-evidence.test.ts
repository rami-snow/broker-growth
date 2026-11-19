import { describe, expect, it } from "vitest";
import type { ConsentRecord } from "@/platform/consent/models";
import { selectCurrentEffectiveEvidence } from "@/platform/consent/effective-evidence";

const at = new Date("2026-11-17T00:00:00Z");
const record = (overrides: Partial<ConsentRecord> & Pick<ConsentRecord, "id" | "status" | "recordedAt">): ConsentRecord => ({
  organisationId: "org_test",
  subjectReference: { type: "contact", id: "contact_test" },
  contactId: "contact_test",
  channel: "Email",
  originalSource: "Fictional evidence",
  originalRecordedAt: overrides.recordedAt,
  provenance: "Imported fixture",
  ...overrides,
});

describe("current-effective consent evidence", () => {
  it("ignores future-effective evidence", () => {
    const current = record({ id: "consent_current", status: "Recorded", recordedAt: "2026-11-15T00:00:00Z" });
    const future = record({ id: "consent_future", status: "Opted out", effectiveAt: "2026-11-18T00:00:00Z", recordedAt: "2026-11-16T00:00:00Z" });
    expect(selectCurrentEffectiveEvidence([current, future], at)).toBe(current);
  });

  it("selects a current opt-out over older evidence", () => {
    const older = record({ id: "consent_older", status: "Recorded", recordedAt: "2026-11-10T00:00:00Z" });
    const optOut = record({ id: "consent_opt_out", status: "Opted out", effectiveAt: "2026-11-16T00:00:00Z", recordedAt: "2026-11-16T01:00:00Z" });
    expect(selectCurrentEffectiveEvidence([optOut, older], at)?.status).toBe("Opted out");
  });

  it("does not expose re-consent until its effective time", () => {
    const optOut = record({ id: "consent_opt_out", status: "Opted out", recordedAt: "2026-11-15T00:00:00Z" });
    const reconsent = record({ id: "consent_reconsent", status: "Recorded", effectiveAt: "2026-11-17T01:00:00Z", recordedAt: "2026-11-16T00:00:00Z" });
    expect(selectCurrentEffectiveEvidence([optOut, reconsent], at)?.status).toBe("Opted out");
    expect(selectCurrentEffectiveEvidence([optOut, reconsent], new Date("2026-11-17T01:00:00Z"))?.status).toBe("Recorded");
  });

  it("breaks equal effective timestamps by recorded time then immutable id", () => {
    const base = { effectiveAt: "2026-11-16T00:00:00Z", recordedAt: "2026-11-16T01:00:00Z" };
    const lowerId = record({ ...base, id: "consent_a", status: "Recorded" });
    const higherId = record({ ...base, id: "consent_b", status: "Not recorded" });
    const laterRecorded = record({ ...base, id: "consent_0", status: "Opted out", recordedAt: "2026-11-16T02:00:00Z" });
    expect(selectCurrentEffectiveEvidence([higherId, lowerId], at)).toBe(higherId);
    expect(selectCurrentEffectiveEvidence([higherId, laterRecorded], at)).toBe(laterRecorded);
  });

  it("keeps no evidence distinct from affirmative permission", () => {
    expect(selectCurrentEffectiveEvidence([], at)).toBeUndefined();
    expect(selectCurrentEffectiveEvidence([
      record({ id: "consent_not_recorded", status: "Not recorded", recordedAt: "2026-11-16T00:00:00Z" }),
    ], at)?.status).toBe("Not recorded");
  });
});
