"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createFixtureState } from "@/verticals/mortgage/fixtures";
import { InMemoryOperationsRepository } from "@/verticals/mortgage/repositories/operations-repository";
import { InMemoryClientBookRepository } from "@/verticals/mortgage/repositories/client-book-repository";
import type { OrganisationId, TenantContext, UserId } from "@/platform/core/models";
import { InMemoryCampaignRepository } from "@/platform/campaigns/repository";
import { mortgageVerticalDefinition } from "@/verticals/mortgage/definition";

interface PrototypeContextValue {
  repo: InMemoryOperationsRepository;
  clientRepo: InMemoryClientBookRepository;
  campaignRepo: InMemoryCampaignRepository<ReturnType<typeof createFixtureState>,import("@/verticals/mortgage/campaigns/extensions").MortgageCampaignCandidateData>;
  context: TenantContext;
  /** Deterministic fixture clock shared by every fixture screen. */
  now: () => Date;
  revision: number;
  mutate: <T>(operation: () => T) => T;
  switchUser: (userId: UserId) => void;
  switchOrganisation: (organisationId: OrganisationId) => void;
}
export const FIXTURE_NOW = "2026-11-14T12:00:00+11:00";
const fixtureNow = () => new Date(FIXTURE_NOW);
const PrototypeContext = createContext<PrototypeContextValue | null>(null);

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [repositories] = useState(() => { const state=createFixtureState(),now=fixtureNow; return {repo:new InMemoryOperationsRepository(state),clientRepo:new InMemoryClientBookRepository(state,now),campaignRepo:new InMemoryCampaignRepository({state,contacts:state.contacts,consentRecords:state.consentRecords,memberships:state.memberships,organisations:state.organisations,purposes:mortgageVerticalDefinition.campaignExtensions.purposes,audienceSources:mortgageVerticalDefinition.campaignExtensions.audienceSources,mergeFields:mortgageVerticalDefinition.campaignExtensions.mergeFields,runtime:mortgageVerticalDefinition.campaignExtensions.runtime,runtimeDependencies:state,now})}; });
  const {repo,clientRepo,campaignRepo}=repositories;
  const [context, setContext] = useState<TenantContext>({ organisationId: "brk_harbour", userId: "usr_alex" });
  const [revision, setRevision] = useState(0);
  const mutate = <T,>(operation: () => T) => { const result = operation(); setRevision(value => value + 1); return result; };
  const switchUser = (userId: UserId) => { const firstMembership = repo.snapshot().memberships.find(m => m.userId === userId); if (!firstMembership) return; setContext({ userId, organisationId: firstMembership.organisationId }); };
  const switchOrganisation = (organisationId: OrganisationId) => { if (!repo.snapshot().memberships.some(m => m.userId === context.userId && m.organisationId === organisationId)) return; setContext(current => ({ ...current, organisationId })); };
  return <PrototypeContext.Provider value={{ repo, clientRepo, campaignRepo, context, now: fixtureNow, revision, mutate, switchUser, switchOrganisation }}>{children}</PrototypeContext.Provider>;
}
export function usePrototype() { const value = useContext(PrototypeContext); if (!value) throw new Error("PrototypeProvider is required"); return value; }
