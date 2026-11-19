"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, Clock3, UserRoundX } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { Badge, type BadgeTone } from "@/components/ui";
import { usePrototype } from "@/components/prototype-provider";
import { calculateTodayMetrics, isActiveUnassignedLead, membershipName } from "@/verticals/mortgage/repositories/operations-repository";

const today = "2026-11-14";
export function TodayScreen() {
  const { repo, clientRepo, context, revision } = usePrototype(); void revision;
  const leads = repo.listLeads(context), members = repo.listMemberships(context), tasks = repo.listTasks(context), appointments = repo.listAppointments(context);
  const metrics = calculateTodayMetrics(repo, context, new Date(`${today}T12:00:00+11:00`));
  const newLeads = leads.filter(lead => lead.status === "New");
  const overdue = tasks.filter(task => task.leadId && task.status === "Open" && task.dueAt < `${today}T12:00:00+11:00`);
  const todayAppointments = appointments.filter(item => item.status === "Booked" && item.startsAt.slice(0,10) === today);
  const nurture = leads.filter(lead => lead.status === "Nurture" && lead.nextActionAt && lead.nextActionAt.slice(0,10) <= today);
  const households=clientRepo.listHouseholds(context),opportunities=clientRepo.listOpportunities(context).filter(item=>!(["Completed","Dismissed"] as string[]).includes(item.lifecycleStatus));
  const annualReviews=opportunities.filter(item=>item.typeKey==="Annual review"&&(item.lifecycleStatus==="Due"||item.lifecycleStatus==="Overdue"));
  const fixedExpiries=opportunities.filter(item=>item.typeKey==="Fixed-rate expiry");
  const unassignedReviews=opportunities.filter(item=>!item.ownerMembershipId);
  const cards = [
    { label:"New leads", value:metrics.newLeads, description:"Leads currently in New status." },
    { label:"Median first response", value:metrics.medianFirstResponseMinutes === null ? "—" : duration(metrics.medianFirstResponseMinutes), description:"Median time from lead creation to each lead's earliest qualifying contact event." },
    { label:"Discovery booked", value:metrics.discoveryBooked, description:"Leads currently in Discovery booked status." },
    { label:"Active unassigned", value:metrics.activeUnassigned, description:"Active leads without an owner; Closed and Converted leads are excluded." },
    { label:"Overdue follow-ups", value:metrics.overdueFollowUps, description:"Open follow-up tasks whose due time has passed." },
    { label:"Reviews due", value:annualReviews.length, description:"Annual review opportunities that are due or overdue." },
    { label:"Fixed expiries approaching", value:fixedExpiries.length, description:"Open fixed-rate expiry review opportunities within the trigger window." },
  ];
  return <><PageTitle eyebrow="Saturday, 14 November" title="Today" body="Start with new enquiries, overdue follow-ups and appointments that need attention." action={<Link className="ui-button ui-button--primary" href="/leads">Open leads <ArrowRight/></Link>}/>
    <section className="metrics" aria-label="Operational metrics">{cards.map(card => <div key={card.label} aria-label={`${card.label}. ${card.description}`}><span title={card.description}>{card.label}</span><strong>{card.value}</strong></div>)}</section>
    <div className="today-grid">
      <Queue title="New leads awaiting first response" icon={<Clock3/>} empty="No new leads are waiting.">{newLeads.map(lead => <LeadLink key={lead.id} leadId={lead.id} title={`${lead.firstName} ${lead.lastName}`} meta={`${lead.source} · ${membershipName(members, lead.ownerMembershipId)}`} badge="New" tone="info"/>)}</Queue>
      <Queue title="Overdue follow-up tasks" icon={<AlertTriangle/>} empty="No overdue follow-ups.">{overdue.map(task => { const lead = leads.find(item => item.id === task.leadId)!; return <LeadLink key={task.id} leadId={lead.id} title={task.title} meta={`${lead.firstName} ${lead.lastName} · due ${formatTime(task.dueAt)}`} badge="Overdue" tone="danger"/>; })}</Queue>
      <Queue title="Discovery appointments today" icon={<CalendarDays/>} empty="No appointments today.">{todayAppointments.map(item => { const lead = leads.find(entry => entry.id === item.leadId)!; return <LeadLink key={item.id} leadId={lead.id} title={`${formatTime(item.startsAt)} · ${lead.firstName} ${lead.lastName}`} meta={`${item.meetingMethod} · ${membershipName(members, item.assignedMembershipId)}`} badge="Today" tone="neutral"/>; })}</Queue>
      <Queue title="Leads without an owner" icon={<UserRoundX/>} empty="Every active lead has an owner.">{leads.filter(isActiveUnassignedLead).map(lead => <LeadLink key={lead.id} leadId={lead.id} title={`${lead.firstName} ${lead.lastName}`} meta={`${lead.loanPurpose} · ${lead.status}`} badge="Unassigned" tone="warning"/>)}</Queue>
      <Queue title="Nurture due for follow-up" icon={<Clock3/>} empty="No nurture follow-ups are due.">{nurture.map(lead => <LeadLink key={lead.id} leadId={lead.id} title={`${lead.firstName} ${lead.lastName}`} meta={`${lead.timeframe} · next action ${formatTime(lead.nextActionAt!)}`} badge="Follow up" tone="info"/>)}</Queue>
    </div>
    <section className="client-opportunities" aria-labelledby="client-opportunities-heading"><div className="section-heading"><div><p className="eyebrow">Client Book</p><h2 id="client-opportunities-heading">Client opportunities</h2><p>Review and follow-up opportunities only—no refinance or product recommendation is made.</p></div><Link href="/client-book">Open Client Book</Link></div><div className="today-grid"><Queue title="Annual reviews due or overdue" icon={<CalendarDays/>} empty="No annual reviews are due.">{annualReviews.map(item=><OpportunityLink key={item.id} householdId={item.householdId} title={households.find(h=>h.id===item.householdId)?.displayName??"Household"} meta={`Annual review · ${item.triggerDate}`} badge={item.lifecycleStatus} tone={item.lifecycleStatus==="Overdue"?"danger":"warning"}/>)}</Queue><Queue title="Fixed-rate expiries within 90 days" icon={<Clock3/>} empty="No fixed-rate expiry reviews are approaching.">{fixedExpiries.map(item=><OpportunityLink key={item.id} householdId={item.householdId} title={households.find(h=>h.id===item.householdId)?.displayName??"Household"} meta={`Contact client to discuss upcoming expiry · ${item.triggerDate}`} badge="Fixed expiry" tone="info"/>)}</Queue><Queue title="Unassigned review opportunities" icon={<UserRoundX/>} empty="Every review opportunity has an owner.">{unassignedReviews.map(item=><OpportunityLink key={item.id} householdId={item.householdId} title={households.find(h=>h.id===item.householdId)?.displayName??"Household"} meta={`${item.typeKey} · ${item.lifecycleStatus}`} badge="Unassigned" tone="warning"/>)}</Queue></div></section>
  </>;
}
function Queue({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) { const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children); return <section className="surface queue"><header><span>{icon}</span><h2>{title}</h2></header>{hasChildren ? children : <p className="queue-empty">{empty}</p>}</section>; }
function LeadLink({ leadId, title, meta, badge, tone }: { leadId: string; title: string; meta: string; badge: string; tone: BadgeTone }) { return <Link className="queue-row" href={`/leads/${leadId}`}><span><strong>{title}</strong><small>{meta}</small></span><Badge tone={tone}>{badge}</Badge><ArrowRight/></Link>; }
function OpportunityLink({householdId,title,meta,badge,tone}:{householdId:string;title:string;meta:string;badge:string;tone:BadgeTone}){return <Link className="queue-row" href={`/client-book/${householdId}`}><span><strong>{title}</strong><small>{meta}</small></span><Badge tone={tone}>{badge}</Badge><ArrowRight/></Link>;}
const formatTime = (value: string) => new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(value));
const duration = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
