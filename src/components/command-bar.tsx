"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { OPEN_COMMAND_BAR_EVENT } from "./command-bar-events";
import { allowedLinks, commandCreateActions, commandGoTo, commandGroupLabels, commandOpenLabels, matchRecords, type CommandRecord } from "./command-bar-model";
import { usePrototype } from "./prototype-provider";
import { searchWorkspaceRecords } from "@/app/command-actions";

type Entry = { key: string; label: string; description?: string; href: string; hint?: string; group: string };

const isTypingTarget = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * Cmd+K command bar: record search, create actions and go-to shortcuts.
 * Phase 1 deliberately has no natural-language questions.
 */
export function CommandBar({ capabilities, search }: { capabilities: readonly string[]; search: (query: string) => Promise<CommandRecord[]> | CommandRecord[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [records, setRecords] = useState<CommandRecord[]>([]), [active, setActive] = useState(0), [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null), pendingG = useRef<number | null>(null), requestId = useRef(0);
  const create = useMemo(() => allowedLinks(commandCreateActions, capabilities), [capabilities]);
  const goTo = useMemo(() => allowedLinks(commandGoTo, capabilities), [capabilities]);
  const close = useCallback(() => { setOpen(false); setQuery(""); setRecords([]); setActive(0); }, []);
  const navigate = useCallback((href: string) => { close(); router.push(href); }, [close, router]);

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value); return; }
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();
      if (pendingG.current !== null) { window.clearTimeout(pendingG.current); pendingG.current = null; const target = goTo.find(item => item.shortcut === key); if (target) { event.preventDefault(); router.push(target.href); } return; }
      if (key === "G") pendingG.current = window.setTimeout(() => { pendingG.current = null; }, 1200);
    };
    window.addEventListener(OPEN_COMMAND_BAR_EVENT, show); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(OPEN_COMMAND_BAR_EVENT, show); window.removeEventListener("keydown", onKey); };
  }, [goTo, router]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    if (query.trim().length < 2) return;
    const handle = window.setTimeout(() => startTransition(async () => { const result = await search(query); if (requestId.current === id) { setRecords(result); setActive(0); } }), 150);
    return () => window.clearTimeout(handle);
  }, [open, query, search]);

  const entries: Entry[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recordEntries = (q.length >= 2 ? records : []).map(record => ({ key: `${record.kind}:${record.id}`, label: record.title, description: record.description, href: record.href, hint: commandOpenLabels[record.kind], group: commandGroupLabels[record.kind] }));
    const filter = <T extends { label: string }>(items: T[]) => { const matching = q ? items.filter(item => item.label.toLowerCase().includes(q)) : items; return matching.length ? matching : items; };
    return [...recordEntries, ...filter(create).map(item => ({ key: item.href, label: item.label, href: item.href, group: "Actions" })), ...filter(goTo).map(item => ({ key: `go:${item.href}`, label: item.label, href: item.href, hint: item.shortcut ? `G then ${item.shortcut}` : undefined, group: "Go to" }))];
  }, [records, create, goTo, query]);
  if (!open) return null;
  const groups = Array.from(new Set(entries.map(entry => entry.group)));
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setActive(value => Math.min(entries.length - 1, value + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(value => Math.max(0, value - 1)); }
    else if (event.key === "Enter" && entries[active]) { event.preventDefault(); navigate(entries[active].href); }
  };
  return <div className="command-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="command-palette" role="dialog" aria-modal="true" aria-label="Command bar" onKeyDown={onKeyDown}>
      <div className="command-palette__input"><Search aria-hidden/><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search leads, clients and partners" aria-label="Search records and commands" role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={entries[active] ? `command-${active}` : undefined}/><kbd className="kbd">Esc</kbd></div>
      <div className="command-palette__results" id="command-results" role="listbox" aria-label="Results">
        {query.trim().length >= 2 && !records.length && <p className="command-palette__empty">No matching records. Try a name, email or phone number.</p>}
        {groups.map(group => { const items = entries.map((entry, index) => ({ entry, index })).filter(item => item.entry.group === group); const isRecords = !["Actions", "Go to"].includes(group); return <div className="command-group" key={group} role="group" aria-label={group}><p className="command-group__label">{group}{isRecords && <span> {items.length} {items.length === 1 ? "match" : "matches"}</span>}</p>
          {items.map(({ entry, index }) => <div key={entry.key} id={`command-${index}`} role="option" aria-selected={index === active} className={`command-item${index === active ? " active" : ""}${entry.description ? " command-item--record" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => navigate(entry.href)}><span className="command-item__text"><span>{entry.label}</span>{entry.description && <small>{entry.description}</small>}</span>{entry.hint && <span className="command-item__hint">{entry.hint}</span>}</div>)}
        </div>; })}
      </div>
      <footer className="command-palette__footer"><span>Enter to select</span><span>Up and down to move</span><span className="command-palette__spacer"/><span>Esc to close</span></footer>
    </div>
  </div>;
}

/** Fixture command bar: searches the in-memory repositories through their tenant-checked APIs. */
export function FixtureCommandBar() {
  const { repo, clientRepo, context, revision } = usePrototype();
  const membership = repo.getMembership(context);
  const search = useCallback((query: string) => {
    void revision;
    const records: CommandRecord[] = [];
    if (membership.capabilities.includes("lead.view")) for (const lead of repo.listLeads(context)) records.push({ kind: "lead", id: lead.id, title: `${lead.firstName} ${lead.lastName}`, description: `${lead.loanPurpose} enquiry. ${lead.status}.${lead.ownerMembershipId ? "" : " No owner yet."}`, keywords: `${lead.email} ${lead.phone}`, href: `/leads/${lead.id}` });
    if (membership.capabilities.includes("mortgage.household.view")) for (const household of clientRepo.listHouseholds(context)) records.push({ kind: "client", id: household.id, title: household.displayName, description: `Client household. ${household.status}.`, href: `/client-book/${household.id}` });
    if (membership.capabilities.includes("mortgage.referral.view")) for (const partner of clientRepo.listReferrals(context)) records.push({ kind: "partner", id: partner.id, title: partner.name, description: `${partner.type}. ${partner.status}.`, href: `/referral-partners/${partner.id}` });
    return matchRecords(records, query);
  }, [repo, clientRepo, context, membership, revision]);
  return <CommandBar capabilities={membership.capabilities} search={search}/>;
}

/** Supabase command bar: server-side, capability-filtered search. */
export function PersistentCommandBar({ capabilities }: { capabilities: readonly string[] }) {
  return <CommandBar capabilities={capabilities} search={searchWorkspaceRecords}/>;
}
