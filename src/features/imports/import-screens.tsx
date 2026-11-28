"use client";
import { useMemo } from "react";
import { usePrototype } from "@/components/prototype-provider";
import { previewImportAction, runImportAction } from "@/app/import-actions";
import { importKinds, type ImportKind } from "@/verticals/mortgage/imports/model";
import type { ImportScreenPort, ImportScreenSetup } from "@/verticals/mortgage/repositories/import-port";
import { ImportWizard } from "./import-wizard";

/** Fixture runtime: imports into the in-memory prototype state only; nothing persists after a reload. */
export function FixtureImportScreen({ initialKind }: { initialKind?: ImportKind }) {
  const { repo, importRepo, context, mutate } = usePrototype();
  const actor = repo.getMembership(context);
  const setup: ImportScreenSetup = { owners: importRepo.owners(context), allowedKinds: importKinds.filter(item => actor.capabilities.includes(item.capability as never)).map(item => item.value), currentMembershipId: actor.id };
  const port = useMemo<ImportScreenPort>(() => ({
    preview: async (kind, records) => importRepo.preview(context, kind, records),
    run: async (kind, _commandId, records) => mutate(() => importRepo.run(context, kind, records)),
  }), [importRepo, context, mutate]);
  return <ImportWizard key={`${context.organisationId}:${context.userId}`} setup={setup} port={port} initialKind={initialKind}/>;
}

/** Supabase runtime: parsed records go to the guarded server operations; the file itself stays in the browser. */
export function PersistentImportScreen({ setup, initialKind }: { setup: ImportScreenSetup; initialKind?: ImportKind }) {
  const port = useMemo<ImportScreenPort>(() => ({
    preview: async (kind, records) => { const result = await previewImportAction(kind, records); if (!result.ok) throw new Error(result.message); return result.value; },
    run: async (kind, commandId, records) => { const result = await runImportAction(kind, commandId, records); if (!result.ok) throw new Error(result.message); return result.value; },
  }), []);
  return <ImportWizard setup={setup} port={port} initialKind={initialKind}/>;
}
