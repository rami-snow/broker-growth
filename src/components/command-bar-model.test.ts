import { describe, expect, it } from "vitest";
import { commandSearchStatus, matchRecords, recordsFor } from "./command-bar-model";

const mila = { kind: "lead" as const, id: "lead_001", title: "Mila Hart", description: "Purchase enquiry. New.", href: "/leads/lead_001", keywords: "mila.hart@example.test" };

describe("command bar search state", () => {
  it("says Searching until results for the exact query arrive, and No matching only after", () => {
    expect(commandSearchStatus("M", null)).toBe("idle");
    expect(commandSearchStatus("Mi", null)).toBe("searching");
    expect(commandSearchStatus("Mil", { query: "Mi", records: [mila] })).toBe("searching");
    expect(recordsFor("Mil", { query: "Mi", records: [mila] })).toEqual([]);
    expect(commandSearchStatus("Mila", { query: "Mila", records: [mila] })).toBe("results");
    expect(commandSearchStatus("Zed", { query: "Zed", records: [] })).toBe("empty");
  });
  it("matches every word against title, description and hidden keywords", () => {
    expect(matchRecords([mila], "mila purchase")).toHaveLength(1);
    expect(matchRecords([mila], "example.test")).toHaveLength(1);
    expect(matchRecords([mila], "refinance")).toHaveLength(0);
  });
});
