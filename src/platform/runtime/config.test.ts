import { describe, expect, it } from "vitest";
import { getRuntimeMode, getSupabasePublicConfig } from "./config";
import { safeReturnPath } from "./return-url";

describe("runtime configuration", () => {
  it("defaults to fixture mode without Supabase configuration", () => expect(getRuntimeMode({})).toBe("fixture"));
  it("fails safely when Supabase mode is incomplete", () => expect(() => getSupabasePublicConfig({ APP_RUNTIME_MODE: "supabase" })).toThrow(/missing required configuration/));
  it("accepts explicit Supabase public configuration", () => expect(getSupabasePublicConfig({ APP_RUNTIME_MODE: "supabase", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-public-key" })).toEqual({ url: "http://127.0.0.1:54321", publishableKey: "local-public-key" }));
  it("rejects unsupported modes", () => expect(() => getRuntimeMode({ APP_RUNTIME_MODE: "mixed" })).toThrow(/Unsupported/));
});

describe("safe return paths", () => {
  it.each(["https://evil.example/path", "//evil.example/path", "/\\evil.example", "javascript:alert(1)"])("rejects unsafe return URL %s", value => expect(safeReturnPath(value)).toBe("/today"));
  it("preserves an internal path, query and fragment", () => expect(safeReturnPath("/campaigns?status=Draft#plans")).toBe("/campaigns?status=Draft#plans"));
});
