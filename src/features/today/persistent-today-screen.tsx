import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, Clock3, UserRoundX } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { Badge, type BadgeTone } from "@/components/ui";
import type { LeadOperationsSnapshot } from "@/verticals/mortgage/repositories/lead-operations-port";
import type { RetentionTodayRow, RetentionTodaySnapshot } from "@/verticals/mortgage/repositories/client-book-port";
import { calculateFirstResponseMinutes, isActiveUnassignedLead, membershipName } from "@/verticals/mortgage/repositories/operations-repository";

export function PersistentTodayScreen({ snapshot, retention, now = new Date() }: { snapshot: LeadOperationsSnapshot; retention:RetentionTodaySnapshot; now?: Date }) {
  const responseMinutes = calculateFirstResponseMinutes(snapshot.leads, snapshot.activities);
  const middle = Math.floor(responseMinutes.length / 2);
  const median = responseMinutes.length ? Math.round(responseMinutes.length % 2 ? responseMinutes[middle] : (responseMinutes[middle-1]+responseMinutes[middle])/2) : null;
  const newLeads = snapshot.leads.filter(lead => lead.status === "New");
  const overdue = snapshot.tasks.filter(task => task.status === "Open" && Date.parse(task.dueAt) < now.getTime());
  const appointments = snapshot.appointments.filter(item => item.status === "Booked" && localDay(item.startsAt) === localDay(now.toISOString()));
  const nurture = snapshot.leads.filter(lead => lead.status === "Nurture" && lead.nextActionAt && Date.parse(lead.nextActionAt) <= now.getTime());
  const cards = [
    { label:"New leads", value:newLeads.length, description:"Leads currently in New status." },
    { label:"Median first response", value:median === null ? "—" : duration(median), description:"Median time from lead creation to each lead's earliest qualifying contact event." },
    { label:"Discovery booked", value:snapshot.leads.filter(item => item.status === "Discovery booked").length, description:"Leads currently in Discovery booked status." },
    { label:"Active unassigned", value:snapshot.leads.filter(isActiveUnassignedLead).length, description:"Active leads without an owner; Closed and Converted are excluded." },
    { label:"Overdue follow-ups", value:overdue.length, description:"Open lead follow-up tasks whose due time has passed." },
    { label:"Annual reviews due", value:retention.annualDueTotal, description:"Annual reviews due within seven days or overdue on the Sydney business date." },
    { label:"Fixed expiries approaching", value:retention.fixedApproachingTotal, description:"Fixed-rate expiries within ninety days or overdue." },
    { label:"Unassigned reviews", value:retention.unassignedTotal, description:"Open surfaced review opportunities without an owner." },
  ];
  return <><PageTitle eyebrow={new Intl.DateTimeFormat("en-AU", { dateStyle:"full" }).format(now)} title="Today" body="Start with new enquiries, overdue follow-ups and appointments that need attention." action={<Link className="ui-button ui-button--primary" href="/leads">Open leads <ArrowRight/></Link>}/><section className="metrics" aria-label="Operational metrics">{cards.map(card => <div key={card.label} aria-label={`${card.label}. ${card.description}`}><span title={card.description}>{card.label}</span><strong>{card.value}</strong></div>)}</section><div className="today-grid">
    <Queue title="New leads awaiting first response" icon={<Clock3/>} empty="No new leads are waiting.">{newLeads.map(lead => <LeadLink key={lead.id} leadId={lead.id} title={`${lead.firstName} ${lead.lastName}`} meta={`${lead.source} · ${membershipName(snapshot.memberships,lead.ownerMembershipId)}`} badge="New" tone="info"/>)}</Queue>
    <Queue title="Overdue follow-up tasks" icon={<AlertTriangle/>} empty="No overdue follow-ups.">{overdue.flatMap(task => { const lead=snapshot.leads.find(item=>item.id===task.leadId); return lead ? [<LeadLink key={task.id} leadId={lead.id} title={task.title} meta={`${lead.firstName} ${lead.lastName} · due ${format(task.dueAt)}`} badge="Overdue" tone="danger"/>] : []; })}</Queue>
    <Queue title="Discovery appointments today" icon={<CalendarDays/>} empty="No appointments today.">{appointments.flatMap(item => { const lead=snapshot.leads.find(entry=>entry.id===item.leadId); return lead ? [<LeadLink key={item.id} leadId={lead.id} title={`${format(item.startsAt)} · ${lead.firstName} ${lead.lastName}`} meta={`${item.meetingMethod} · ${membershipName(snapshot.memberships,item.assignedMembershipId)}`} badge="Today" tone="neutral"/>] : []; })}</Queue>
    <Queue title="Leads without an owner" icon={<UserRoundX/>} empty="Every active lead has an owner.">{snapshot.leads.filter(isActiveUnassignedLead).map(lead => <LeadLink key={lead.id} leadId={lead.id} title={`${lead.firstName} ${lead.lastName}`} meta={`${lead.loanPurpose} · ${lead.status}`} badge="Unassigned" tone="warning"/>)}</Queue>
    <Queue title="Nurture due for follow-up" icon={<Clock3/>} empty="No nurture follow-ups are due.">{nurture.map(lead => <LeadLink key={lead.id} leadId={lead.id} title={`${lead.firstName} ${lead.lastName}`} meta={`${lead.timeframe} · next action ${format(lead.nextActionAt!)}`} badge="Follow up" tone="info"/>)}</Queue>
  </div><section className="client-opportunities" aria-labelledby="persistent-client-opportunities-heading"><div className="section-heading"><div><p className="eyebrow">Client Book</p><h2 id="persistent-client-opportunities-heading">Retention review queues</h2><p>Retention scheduling only—no product recommendation or financial advice is made.</p></div><Link href="/client-book">Open Client Book</Link></div><div className="today-grid"><Queue title="Annual reviews due or overdue" icon={<CalendarDays/>} empty="No annual reviews are due.">{retention.annualDue.map(item=><OpportunityLink key={item.opportunityId} item={item}/>)}</Queue><Queue title="Fixed-rate expiries within 90 days" icon={<Clock3/>} empty="No fixed-rate expiry reviews are approaching.">{retention.fixedApproaching.map(item=><OpportunityLink key={item.opportunityId} item={item}/>)}</Queue><Queue title="Unassigned review opportunities" icon={<UserRoundX/>} empty="Every surfaced review opportunity has an owner.">{retention.unassigned.map(item=><OpportunityLink key={item.opportunityId} item={item}/>)}</Queue></div></section></>;
}
function Queue({title,icon,empty,children}:{title:string;icon:React.ReactNode;empty:string;children:React.ReactNode[]}){return <section className="surface queue"><header><span>{icon}</span><h2>{title}</h2></header>{children.length?children:<p className="queue-empty">{empty}</p>}</section>}
function LeadLink({leadId,title,meta,badge,tone}:{leadId:string;title:string;meta:string;badge:string;tone:BadgeTone}){return <Link className="queue-row" href={`/leads/${leadId}`}><span><strong>{title}</strong><small>{meta}</small></span><Badge tone={tone}>{badge}</Badge><ArrowRight/></Link>}
function OpportunityLink({item}:{item:RetentionTodayRow}){return <Link className="queue-row" href={`/client-book/${item.householdId}`}><span><strong>{item.householdName}</strong><small>{item.triggerType} · {item.triggerDate} · {item.ownerName??"Unassigned"}</small></span><Badge tone={item.effectiveStatus==="Overdue"?"danger":item.effectiveStatus==="Due"?"warning":"info"}>{item.effectiveStatus}</Badge><ArrowRight/></Link>}
const format=(value:string)=>new Intl.DateTimeFormat("en-AU",{dateStyle:"medium",timeStyle:"short",timeZone:"Australia/Sydney"}).format(new Date(value));
const localDay=(value:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Sydney"}).format(new Date(value));
const duration=(minutes:number)=>minutes<60?`${minutes} min`:`${Math.floor(minutes/60)}h ${minutes%60}m`;
