"use client";

import { useState } from "react";
import { PageTitle } from "@/components/page-title";
import { Card, EmptyState, showingCount, Tabs } from "@/components/ui";
import { needsActionKinds, type NeedsActionItem, type NeedsActionKind } from "./today-model";
import { NeedsActionRow } from "./today-view";

type Filter = "all" | NeedsActionKind;

/** Full Needs action list: same items, order and buttons as Today, filterable by type. */
export function NeedsActionView({ items }: { items: NeedsActionItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? items : items.filter(item => item.kind === filter);
  return <>
    <PageTitle breadcrumb={{ href: "/today", label: "Today" }} title="Needs action"/>
    <Tabs label="Needs action types" value={filter} onChange={setFilter} options={[{ value: "all", label: "All", count: items.length }, ...needsActionKinds.map(kind => ({ value: kind.value, label: kind.label, count: items.filter(item => item.kind === kind.value).length }))]}/>
    {shown.length ? <Card title="Most urgent first" labelledBy="needs-action-list-heading" meta="Response deadline, then due date">
      {shown.map(item => <NeedsActionRow key={item.id} item={item}/>)}
      <div className="card__footer muted">{showingCount(shown.length, items.length, "item")}</div>
    </Card> : <section className="card"><EmptyState title="Nothing to do here" body={filter === "all" ? "Nothing needs action right now." : "No items of this type need action."}/></section>}
  </>;
}
