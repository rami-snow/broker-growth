import { describe, expect, it } from "vitest";
import type { PersistentMembership } from "./server-context";
import { chooseActiveMembership } from "./server-context";

const membership = (organisationId: string): PersistentMembership => ({ id: `membership-${organisationId}`, organisationId, displayName: "Fictional User", status: "Active", capabilities: [], organisation: { id: organisationId, name: `Organisation ${organisationId}`, shortName: "ORG", verticalKey: "mortgage", status: "Active", region: null } });

describe("active organisation preference", () => {
  it("returns no context when the user has no active membership", () => expect(chooseActiveMembership([], "org-a")).toBeNull());
  it("accepts only an organisation represented by an active membership", () => expect(chooseActiveMembership([membership("org-a")], "org-b")?.organisationId).toBe("org-a"));
  it("supports a user selecting between multiple memberships", () => expect(chooseActiveMembership([membership("org-a"), membership("org-b")], "org-b")?.organisationId).toBe("org-b"));
});
