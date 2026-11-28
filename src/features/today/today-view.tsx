import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Mail, Phone, User, Video } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { Avatar, Badge, Card, MetricCard } from "@/components/ui";
import { NEEDS_ACTION_LIMIT, type NeedsActionItem, type TodayIcon, type TodayModel } from "./today-model";

const icons: Record<TodayIcon, typeof Phone> = { phone: Phone, user: User, mail: Mail, calendar: CalendarDays, clock: Clock, video: Video };

/** One Needs action item with its manual buttons. Used on Today and on the full Needs action page. */
export function NeedsActionRow({ item }: { item: NeedsActionItem }) {
  const Icon = icons[item.icon];
  return <div className="list-row">
    <span className="list-row__icon" aria-hidden><Icon/></span>
    <div className="list-row__body"><span className="list-row__title">{item.title}<Badge tone={item.badge.tone}>{item.badge.label}</Badge></span><p className="list-row__text">{item.text}</p></div>
    <div className="list-row__actions">{item.actions.map(action => <Link key={action.label} href={action.href} className={`ui-button ui-button--small ${action.primary ? "ui-button--primary" : "ui-button--secondary"}`}>{action.label}</Link>)}</div>
  </div>;
}

/** Today (Figma frame 01). Presentational; both runtimes pass a model built by `buildToday`. */
export function TodayView({ model, newLeadAction, auditHref }: { model: TodayModel; newLeadAction?: React.ReactNode; auditHref?: string }) {
  const { metrics } = model;
  return <>
    <PageTitle title="Today" action={newLeadAction}/>
    <div className="page-heading"><h2>{model.greeting}</h2><p>{model.summary}</p></div>
    <section className="metric-grid" aria-label="Key metrics">
      <MetricCard label="Median first response" description="Median time from lead created to its first logged contact attempt. Target is 1 hour." value={metrics.medianFirstResponse?.label ?? "—"} badge={metrics.medianFirstResponse && <Badge tone={metrics.medianFirstResponse.overTarget ? "danger" : "success"}>{metrics.medianFirstResponse.overTarget ? "Over target" : "On target"}</Badge>} note="Target is 1h"/>
      <MetricCard label="New leads" description="Leads currently in the New stage." value={metrics.newLeads.count} badge={metrics.newLeads.unassigned > 0 ? <Badge tone="warning">Needs owner</Badge> : <Badge tone="success">All owned</Badge>} note={`${metrics.newLeads.unassigned} unassigned`}/>
      <MetricCard label="Discovery calls today" description="Booked discovery appointments today." value={metrics.discoveryToday.count} badge={metrics.discoveryToday.count > 0 ? <Badge tone="info">On track</Badge> : <Badge>None booked</Badge>} note={metrics.discoveryToday.nextLabel}/>
      <MetricCard label="Client reviews due" description="Annual reviews due or overdue." value={metrics.reviewsDue.count} badge={<Badge>This month</Badge>} note={`${metrics.reviewsDue.fixedIn90} fixed expiries in 90 days`}/>
    </section>
    <div className="today-columns">
      <div className="stack">
        <Card title="Needs action" labelledBy="needs-action-heading" action={<Badge>{model.needsAction.length}</Badge>}>
          {model.needsAction.length ? model.needsAction.slice(0, NEEDS_ACTION_LIMIT).map(item => <NeedsActionRow key={item.id} item={item}/>) : <p className="card__empty">Nothing needs action right now.</p>}
          {model.needsAction.length > 0 && <div className="card__footer card__footer--split"><span className="muted">{model.needsAction.length > NEEDS_ACTION_LIMIT ? `Showing the ${NEEDS_ACTION_LIMIT} most urgent of ${model.needsAction.length}, ordered by response deadline, then due date.` : "Ordered by response deadline, then due date."}</span><Link href="/today/needs-action">View all</Link></div>}
        </Card>
        <Card title="Today’s priorities" labelledBy="priorities-heading" meta="Sorted by response deadline, then due date">
          {model.priorities.length ? model.priorities.map(item => { const Icon = icons[item.icon]; return <Link key={item.id} href={item.href} className="list-row list-row--compact">
            <span className="list-row__icon" aria-hidden><Icon/></span>
            <span className="list-row__body"><span className="list-row__title">{item.title}</span><span className="list-row__meta">{item.detail}</span></span>
            <span className="list-row__owner">{item.ownerName ? <><Avatar name={item.ownerName}/>{item.ownerName}</> : <span className="text-warning">Unassigned</span>}</span>
            <span className="list-row__status"><Badge tone={item.status.tone}>{item.status.label}</Badge></span>
            <ChevronRight className="list-row__chevron" aria-hidden/>
          </Link>; }) : <p className="card__empty">No priorities are due.</p>}
        </Card>
      </div>
      <div className="stack">
        <Card title="Recent activity" labelledBy="recent-activity-heading" meta="From the audit log">
          {model.recentActivity.length ? model.recentActivity.map(item => <div key={item.id} className="activity-row"><time>{item.time}</time><span>{item.text}</span></div>) : <p className="card__empty">No activity recorded yet.</p>}
          {auditHref && <div className="card__footer"><Link href={auditHref}>View full audit log</Link></div>}
        </Card>
        <section className="card card__body next-call" aria-labelledby="next-call-heading">
          {model.nextCall ? <><small>{model.nextCall.when}</small><h2 id="next-call-heading">{model.nextCall.title}</h2><p className="list-row__text">{model.nextCall.text}</p><div><Link href={model.nextCall.href} className="ui-button ui-button--small ui-button--secondary">Open lead</Link></div></> : <><h2 id="next-call-heading">Next discovery call</h2><p className="list-row__text">No discovery calls are booked.</p></>}
        </section>
        <Card title="Fixed-rate expiries" labelledBy="fixed-expiries-heading" meta="Next 90 days">
          {model.fixedExpiries.length ? model.fixedExpiries.map(item => <Link key={item.id} href={`/client-book/${item.householdId}`} className="list-row list-row--compact"><span className="list-row__body"><span className="list-row__title">{item.name}</span><span className="list-row__meta">{item.detail}</span></span><Badge tone={item.status.tone}>{item.status.label}</Badge></Link>) : <p className="card__empty">No fixed rates end in the next 90 days.</p>}
        </Card>
      </div>
    </div>
  </>;
}
