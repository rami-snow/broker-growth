import { fireEvent,render,screen } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
import type { ClientBookDetailSnapshot } from "@/verticals/mortgage/repositories/client-book-port";
import { PersistentClientDetail } from "./persistent-client-detail";

vi.mock("@/app/client-book-actions",()=>({runPersistentClientBookOperation:vi.fn(async()=>({ok:false,message:""})),searchPersistentContactOptions:vi.fn(async()=>({options:[],message:""}))}));

const snapshot:ClientBookDetailSnapshot={
  household:{id:"20000000-0000-0000-0000-000000000001",displayName:"Fiction household",status:"Active",ownerMembershipId:"30000000-0000-0000-0000-000000000001",ownerName:"Alex Fiction",primaryContact:{id:"40000000-0000-0000-0000-000000000001",name:"Taylor Fiction",email:"taylor@example.test",preferredContactMethod:"Email",version:1},createdAt:"2026-11-17T00:00:00Z",version:1},
  members:[],consent:[],conversion:undefined,activities:[],
  loans:[{id:"50000000-0000-0000-0000-000000000001",lenderName:"Fictional Mutual",loanPurpose:"Purchase",nextReviewDate:"2026-11-20",status:"Active",source:"Manual entry",dataConfidence:"Confirmed",version:2}],
  opportunities:[{id:"60000000-0000-0000-0000-000000000001",loanRecordId:"50000000-0000-0000-0000-000000000001",type:"Annual review",triggerDate:"2026-11-20",status:"Due",version:3}],
  tasks:[],memberships:[{id:"30000000-0000-0000-0000-000000000001",displayName:"Alex Fiction",position:"Broker"}],referralPartners:[],
};

describe("persistent household review actions",()=>{
  it("hides every mutation control without the required capabilities",()=>{
    render(<PersistentClientDetail snapshot={snapshot} capabilities={["mortgage.household.view","mortgage.review-opportunity.view"]} actorMembershipId={snapshot.household.ownerMembershipId}/>);
    expect(screen.queryByRole("button",{name:"Add loan record"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Claim"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Create task"})).not.toBeInTheDocument();
  });

  it("prioritises claim and exposes the retention-only loan dialog for an authorised owner",()=>{
    render(<PersistentClientDetail snapshot={snapshot} capabilities={["mortgage.household.view","mortgage.household.update","mortgage.loan-record.manage","mortgage.review-opportunity.view","mortgage.review-opportunity.manage","task.create"]} actorMembershipId={snapshot.household.ownerMembershipId}/>);
    expect(screen.getByRole("button",{name:"Claim"})).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Add loan record"}));
    expect(screen.getByRole("dialog",{name:"Add minimal loan record"})).toBeVisible();
    expect(screen.getByText(/Do not enter balances, rates, repayments or assessment/i)).toBeVisible();
    expect(screen.getByRole("option",{name:"Construction loan"})).toBeInTheDocument();
  });

  it("exposes maintenance, consent-safe contact editing and task resolution to an authorised owner",()=>{
    const withTask={...snapshot,tasks:[{id:"70000000-0000-0000-0000-000000000001",title:"Fictional follow-up",dueAt:"2026-11-20T00:00:00Z",status:"Open",priority:"Normal",assignedMembershipId:snapshot.household.ownerMembershipId,version:2}]};
    render(<PersistentClientDetail snapshot={withTask} capabilities={["mortgage.household.view","mortgage.household.update","contact.update","task.update"]} actorMembershipId={snapshot.household.ownerMembershipId}/>);
    expect(screen.getByRole("button",{name:"Edit household"})).toBeVisible();
    expect(screen.getByRole("button",{name:"Add member"})).toBeVisible();
    expect(screen.getByRole("button",{name:"Archive"})).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Edit primary contact"}));
    expect(screen.getByText(/does not change or create consent evidence/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    fireEvent.click(screen.getByRole("button",{name:"Resolve"}));
    expect(screen.getByRole("option",{name:"Complete task"})).toBeInTheDocument();
    expect(screen.getByRole("option",{name:"Cancel task"})).toBeInTheDocument();
  });

  it("keeps archived households readable while hiding ordinary maintenance",()=>{
    const archived={...snapshot,household:{...snapshot.household,status:"Archived"}};
    render(<PersistentClientDetail snapshot={archived} capabilities={["mortgage.household.view","mortgage.household.update","contact.update","task.create"]} actorMembershipId={snapshot.household.ownerMembershipId}/>);
    expect(screen.getByText("Fiction household")).toBeVisible();
    expect(screen.getByRole("button",{name:"Reactivate"})).toBeVisible();
    expect(screen.queryByRole("button",{name:"Edit household"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Add member"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Add loan record"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Create task"})).not.toBeInTheDocument();
  });

  it("hides archive and reactivate for a non-owner without administrative assignment",()=>{
    render(<PersistentClientDetail snapshot={snapshot} capabilities={["mortgage.household.view","mortgage.household.update"]} actorMembershipId="30000000-0000-0000-0000-000000000099"/>);
    expect(screen.queryByRole("button",{name:"Archive"})).not.toBeInTheDocument();
  });
});
