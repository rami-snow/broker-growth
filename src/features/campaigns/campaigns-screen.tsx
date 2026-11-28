"use client";
import { useState } from "react";
import { useUrlParam } from "@/components/use-url-param";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { Modal } from "@/components/modal";
import { Badge,Button,EmptyState,Select,Table,TextField } from "@/components/ui";
import { usePrototype } from "@/components/prototype-provider";
import { hasCapability } from "@/verticals/mortgage/permissions";
import type { CampaignChannel } from "@/platform/campaigns/contracts";

const tone=(status:string)=>status==="Approved"?"success":status==="Rejected"||status==="Cancelled"?"danger":status==="Ready for review"?"warning":"neutral" as const;
/** Figma wording for the review state; the stored status is unchanged until milestone 4G. */
export const campaignStatusLabel=(status:string)=>status==="Ready for review"?"Awaiting approval":status;
export function CampaignsScreen(){
  const {repo,campaignRepo,context,revision,mutate}=usePrototype();void revision;
  const router=useRouter(),actor=repo.getMembership(context),campaigns=campaignRepo.listCampaigns(context),members=repo.listMemberships(context);
  const [selectedId,setSelectedId]=useState<string|null>(null),[manualCreate,setCreating]=useState<boolean|null>(null),[message,setMessage]=useState("");
  const canCreate=hasCapability(actor,"campaign.create"),requestedCreate=useUrlParam("new")==="1",creating=manualCreate??(canCreate&&requestedCreate);
  const rows=campaigns.map(campaign=>({campaign,version:campaignRepo.getCurrentVersion(context,campaign.id),snapshot:campaignRepo.latestSnapshot(context,campaign.id),owner:members.find(item=>item.id===campaign.ownerMembershipId)?.displayName}));
  const selected=rows.find(row=>row.campaign.id===selectedId)??rows.find(row=>row.campaign.status==="Ready for review")??rows[0];
  const source=selected?campaignRepo.listAudienceDefinitions().find(item=>item.key===selected.version.audienceSourceKey):undefined;
  const canApprove=selected&&selected.campaign.status==="Ready for review"&&hasCapability(actor,"campaign.approve")&&selected.snapshot;
  const approve=()=>{if(!selected||!selected.snapshot)return;try{const result=mutate(()=>campaignRepo.approve(context,selected.campaign.id,selected.snapshot!.id));setMessage(result.status==="Approved"?"Plan approved. Nothing was sent or scheduled.":"The audience changed since this snapshot. Open the plan to review the changes before approving.");}catch(cause){setMessage(cause instanceof Error?cause.message:"Approval failed");}};
  return <div className="split-page" style={{"--split-aside":"360px"} as React.CSSProperties}>
    <div className="split-page__main">
      <PageTitle title="Campaigns" action={canCreate?<Button onClick={()=>setCreating(true)}>New campaign</Button>:undefined}/>
      <p className="notice">Campaigns are plans for now. Approving records your decision in the audit log. The app never sends, schedules, queues or exports a message.</p>
      {rows.length?<Table><thead><tr><th>Campaign</th><th>Status</th><th>Audience</th><th>Eligible</th><th>Owner</th></tr></thead><tbody>{rows.map(({campaign,snapshot,owner})=><tr key={campaign.id} className={`ui-table-row--interactive${selected?.campaign.id===campaign.id?" is-selected":""}`} tabIndex={0} aria-selected={selected?.campaign.id===campaign.id} aria-label={`Review campaign ${campaign.name}`} onClick={()=>{setSelectedId(campaign.id);setMessage("");}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelectedId(campaign.id);setMessage("");}}}><td>{campaign.name}</td><td><Badge tone={tone(campaign.status)}>{campaignStatusLabel(campaign.status)}</Badge></td><td>{snapshot?snapshot.recipients.length:<span className="muted">—</span>}</td><td>{snapshot?snapshot.eligibleCount:<span className="muted">—</span>}</td><td>{owner}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={2}>{rows.length} {rows.length===1?"campaign":"campaigns"}</td><td colSpan={3} style={{textAlign:"right"}}>Eligible counts only include contacts with recorded consent for the channel</td></tr></tfoot></Table>
      :<section className="card"><EmptyState title="No campaign plans yet" body="Create a plan to preview eligibility and record approval without sending messages."/></section>}
    </div>
    <aside className="split-page__aside review-panel" aria-label="Campaign review">{selected?<>
      <header><h2>{selected.campaign.name}</h2><Badge tone={tone(selected.campaign.status)}>{campaignStatusLabel(selected.campaign.status)}</Badge></header>
      <p className="muted" style={{margin:0,fontSize:13}}>This is a plan. Approving records the decision in the audit log. Nothing is sent or scheduled.</p>
      <section aria-label="Audience"><small>Audience</small>{selected.snapshot?<><div className="review-panel__row"><span>{source?.displayName??"Audience"}</span><strong>{selected.snapshot.recipients.length}</strong></div><div className="review-panel__row"><span>Eligible ({selected.version.content.channel} consent recorded)</span><Badge tone="success">{selected.snapshot.eligibleCount}</Badge></div><div className="review-panel__row"><span>Excluded</span><Badge tone="warning">{selected.snapshot.excludedCount}</Badge></div></>:<span className="muted">Preview the plan to see who is eligible.</span>}</section>
      <section aria-label="Message preview"><div className="review-panel__row"><small>Message preview</small><small>{selected.version.content.channel} draft</small></div><div className="message-preview">{selected.version.content.subject&&<strong>Subject: {selected.version.content.subject}</strong>}<span>{selected.version.content.body}</span></div></section>
      <section aria-label="Timing"><div className="review-panel__row"><small>Timing</small><span>Not scheduled</span></div></section>
      {message&&<p className="form-guidance" role="status">{message}</p>}
      {canApprove&&<Button fullWidth onClick={approve}>Approve plan</Button>}
      <Button fullWidth variant="secondary" onClick={()=>router.push(`/campaigns/${selected.campaign.id}`)}>{selected.campaign.status==="Draft"?"Edit plan":"Open plan"}</Button>
    </>:<p className="muted">Select a campaign to review it.</p>}</aside>
    {creating&&<NewCampaignModal onClose={()=>setCreating(false)}/>}
  </div>;
}

function NewCampaignModal({onClose}:{onClose:()=>void}){const {campaignRepo,context,mutate}=usePrototype(),router=useRouter(),purposes=campaignRepo.listPurposeDefinitions(),[error,setError]=useState("");return <Modal title="New campaign plan" onClose={onClose}><form className="form-grid single" action={form=>{try{const data=Object.fromEntries(form.entries())as Record<string,string>,purpose=purposes.find(item=>item.key===data.purpose)!;const campaign=mutate(()=>campaignRepo.createCampaign(context,{name:data.name,purposeKey:purpose.key,audienceSourceKey:purpose.audienceSourceKeys[0],content:{channel:"Email" as CampaignChannel,subject:"A review invitation from {{brokerage.name}}",body:"Hi {{contact.firstName}}, it may be time to arrange your review with {{broker.displayName}}.\n\n[Sender identification]\n[Unsubscribe instructions]",selectedMergeFieldKeys:["contact.firstName","brokerage.name","broker.displayName"]}}));router.push(`/campaigns/${campaign.id}`);onClose();}catch(cause){setError(cause instanceof Error?cause.message:"Campaign creation failed");}}}><p className="form-guidance">Starter copy is fictional and is not legally approved wording. Nothing will be sent.</p><TextField name="name" label="Campaign name" required/><Select name="purpose" label="Purpose" options={purposes.map(item=>({value:item.key,label:item.displayName}))}/><p className="form-guidance">Channel: Email. Campaigns are email only in phase 1.</p>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Create plan</Button></div></form></Modal>}
