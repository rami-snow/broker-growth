import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  AudienceCandidate,
  AudienceSourceDefinition,
  CampaignPurposeDefinition,
  MergeFieldDefinition,
} from "@/platform/campaigns/contracts";
import type { VerticalDefinition } from "@/platform/verticals/contracts";
import { getVerticalDefinition } from "@/data/vertical-registry";
import { mortgageVerticalDefinition } from "@/verticals/mortgage/definition";

const platformRoot = join(process.cwd(), "src/platform");
const sourceFiles = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
  const path = join(directory, entry);
  return statSync(path).isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
});

describe("platform dependency boundary", () => {
  it("never imports a vertical from platform modules", () => {
    const violations = sourceFiles(platformRoot).filter((path) => /(?:@\/verticals\/|\.\.\/.*verticals\/)/.test(readFileSync(path, "utf8")));
    expect(violations).toEqual([]);
  });
});

describe("vertical composition", () => {
  it("resolves the mortgage definition with its vertical terminology", () => {
    expect(getVerticalDefinition("mortgage")).toBe(mortgageVerticalDefinition);
    expect(mortgageVerticalDefinition).toMatchObject({ organisationLabel: "Brokerage", clientBookLabel: "Client Book" });
  });

  it("keeps mortgage positions out of shared capabilities while preserving mapped bundles", () => {
    expect(mortgageVerticalDefinition.capabilityBundles.broker).toContain("mortgage.household.update");
    expect(mortgageVerticalDefinition.capabilityBundles.broker).toContain("task.update");
    expect(mortgageVerticalDefinition.capabilityBundles.administrator).toContain("task.update");
    expect(mortgageVerticalDefinition.capabilityBundles.broker).not.toContain("mortgage.household.assign");
    expect(mortgageVerticalDefinition.capabilityBundles.administrator).toContain("mortgage.household.assign");
    for(const bundle of Object.values(mortgageVerticalDefinition.capabilityBundles))expect(new Set(bundle).size).toBe(bundle.length);
  });

  it("accepts vertical campaign definitions through shared contracts", () => {
    const audience: AudienceSourceDefinition = {
      key: "trades-maintenance-reminders",
      verticalKey: "trades",
      displayName: "Maintenance reminders",
      subjectType: "test.subject",
    };
    const mergeField: MergeFieldDefinition = {
      key: "trades-customer-name",
      verticalKey: "trades",
      displayName: "Customer name",
      valueType: "text",
    };
    const purpose: CampaignPurposeDefinition = {
      key: "trades-maintenance-reminder",
      verticalKey: "trades",
      displayName: "Maintenance reminder",
      description: "Test-only definition proving the extension boundary.",
      supportedChannels: ["Email"],
      audienceSourceKeys: [audience.key],
      permittedMergeFields: [mergeField.key],
    };
    const hypothetical:VerticalDefinition<"campaign.view",{label:string},{label:string}>={key:"trades",organisationLabel:"Business",clientBookLabel:"Customers",capabilityBundles:{operator:["campaign.view"]},enabledFeatureKeys:["campaigns"],campaignExtensions:{purposes:[purpose],audienceSources:[audience],mergeFields:[mergeField],runtime:{audienceProviders:[{sourceKey:audience.key,getCandidates:(_request,dependencies):AudienceCandidate<{label:string}>[]=>[{candidateKey:"candidate",subjectId:"subject",subjectDisplayName:dependencies.label,contactId:"contact_test",contextLabel:"Test",purposeDecision:{eligible:true},data:{label:dependencies.label}}]}],mergeFieldResolvers:[{mergeFieldKey:mergeField.key,resolve:candidate=>candidate.data.label}]}}};
    expect(hypothetical.campaignExtensions.runtime.audienceProviders).toHaveLength(1);
    expect(mortgageVerticalDefinition.campaignExtensions.purposes.map(item=>item.displayName)).toEqual(["Annual review reminder","Fixed-rate expiry review reminder"]);
  });
});
