export type CommandRecordKind = "lead" | "client" | "partner";
export interface CommandRecord { kind: CommandRecordKind; id: string; title: string; description: string; href: string; /** Extra searchable text that is not displayed, e.g. email or phone. */ keywords?: string }
export interface CommandLink { label: string; href: string; shortcut?: string; capability?: string }

export const commandGroupLabels: Record<CommandRecordKind, string> = { lead: "Leads", client: "Clients", partner: "Referral partners" };
export const commandOpenLabels: Record<CommandRecordKind, string> = { lead: "Open lead", client: "Open client", partner: "Open partner" };

/** Create actions. Phase 1 has no natural-language questions; every entry is a plain navigation. */
export const commandCreateActions: CommandLink[] = [
  { label: "Create a new lead", href: "/leads?new=1", capability: "lead.create" },
  { label: "Add a client", href: "/client-book?new=1", capability: "mortgage.household.create" },
  { label: "Add a referral partner", href: "/referral-partners?new=1", capability: "mortgage.referral.manage" },
];

/** Go-to shortcuts, triggered by pressing G then the listed key outside text fields. */
export const commandGoTo: CommandLink[] = [
  { label: "Today", href: "/today", shortcut: "T" },
  { label: "Leads", href: "/leads", shortcut: "L", capability: "lead.view" },
  { label: "Clients", href: "/client-book", shortcut: "C", capability: "mortgage.household.view" },
  { label: "Partners", href: "/referral-partners", shortcut: "P", capability: "mortgage.referral.view" },
  { label: "Campaigns", href: "/campaigns", shortcut: "M", capability: "campaign.view" },
  { label: "Reports", href: "/reports", shortcut: "R", capability: "report.view" },
  { label: "Settings", href: "/settings", shortcut: "S", capability: "settings.view" },
];

export const allowedLinks = (links: CommandLink[], capabilities: readonly string[]) => links.filter(link => !link.capability || capabilities.includes(link.capability));

/** Case-insensitive token match: every word of the query must appear in the title or description. */
export function matchRecords(records: readonly CommandRecord[], query: string, limit = 8) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return records.filter(record => { const haystack = `${record.title} ${record.description} ${record.keywords ?? ""}`.toLowerCase(); return tokens.every(token => haystack.includes(token)); })
    .sort((a, b) => Number(!a.title.toLowerCase().startsWith(tokens[0]!)) - Number(!b.title.toLowerCase().startsWith(tokens[0]!)) || a.title.localeCompare(b.title))
    .slice(0, limit);
}
