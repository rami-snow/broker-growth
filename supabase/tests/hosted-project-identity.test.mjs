import { describe, expect, it } from "vitest";
import { expectedHostedProjectRef, validatedHostedDatabaseUrl } from "./hosted-project-identity.mjs";

const directHost = `db.${expectedHostedProjectRef}.supabase.co`;
const poolerUser = `postgres.${expectedHostedProjectRef}`;

describe("hosted database connection identity", () => {
  it("accepts the exact direct Supabase database hostname", () => {
    expect(validatedHostedDatabaseUrl(`postgresql://postgres:test-only@${directHost}:5432/postgres`).hostname).toBe(directHost);
  });

  it("accepts a Supabase pooler only with the exact decoded project username", () => {
    const encodedUser = encodeURIComponent(poolerUser);
    const parsed = validatedHostedDatabaseUrl(`postgresql://${encodedUser}:test-only@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`);
    expect(parsed.hostname).toBe("aws-0-ap-southeast-1.pooler.supabase.com");
    expect(decodeURIComponent(parsed.username)).toBe(poolerUser);
  });

  it.each([
    [`postgresql://postgres:test-only@db.${expectedHostedProjectRef}.supabase.co.attacker.example:5432/postgres`, "direct-host suffix attack"],
    [`postgresql://${encodeURIComponent(poolerUser)}:test-only@pooler.supabase.com.attacker.example:5432/postgres`, "pooler-host suffix attack"],
    [`postgresql://postgres.wrongproject:test-only@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`, "wrong pooler username"],
    [`postgresql://${encodeURIComponent(poolerUser)}:test-only@unrelated.example:5432/postgres`, "project reference in username on an arbitrary host"],
    [`postgresql://postgres.${expectedHostedProjectRef}:test-only@unrelated-${expectedHostedProjectRef}.example:5432/postgres`, "project reference in combined arbitrary identity"],
  ])("rejects %s", (connectionString) => {
    expect(() => validatedHostedDatabaseUrl(connectionString)).toThrow("does not match the expected hosted project");
  });

  it("rejects malformed input without echoing it", () => {
    const malformed = "not-a-connection-string-with-sensitive-text";
    expect(() => validatedHostedDatabaseUrl(malformed)).toThrow("is not a valid database connection string");
    try {
      validatedHostedDatabaseUrl(malformed);
    } catch (error) {
      expect(String(error)).not.toContain(malformed);
    }
  });
});
