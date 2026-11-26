import { fireEvent,render,screen } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
import { PersistentReferralPartnerList } from "./persistent-referral-partner-list";
import { PersistentReferralPartnerDetail } from "./persistent-referral-partner-detail";
import type { ReferralPartnerDetailSnapshot,ReferralPartnerListSnapshot } from "@/verticals/mortgage/repositories/referral-partner-port";

vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));

const partner={id:"41000000-0000-0000-0000-000000000099",name:"Fictional Partner",organisationName:"Example Advisory",type:"Accountant" as const,email:"partner@example.test",phone:"0499 000 099",ownerMembershipId:"30000000-0000-0000-0000-000000000001",ownerName:"Alex Morgan",status:"Inactive" as const,version:3,createdAt:"2026-11-18T00:00:00Z",updatedAt:"2026-11-18T01:00:00Z"};
const list:ReferralPartnerListSnapshot={rows:[partner],total:1,page:1,pageSize:25,brokers:[{id:partner.ownerMembershipId,displayName:"Alex Morgan"}]};
const detail:ReferralPartnerDetailSnapshot={partner,brokers:list.brokers,leads:[{id:"lead-a",name:"Fictional Lead",status:"Discovery booked",source:"Website enquiry",createdAt:partner.createdAt}],households:[{id:"household-a",displayName:"Example household",status:"Archived",createdAt:partner.createdAt}],activities:[{id:"activity-a",eventType:"referral_partner.inactivated",summary:"Referral partner inactivated",occurredAt:partner.updatedAt}]};

describe("persistent referral partner interface",()=>{
  it("renders server-filter controls and historical inactive status",()=>{render(<PersistentReferralPartnerList snapshot={list} query={{}} canManage={false}/>);expect(screen.getByLabelText("Search referral partners")).toBeInTheDocument();expect(screen.getByLabelText("Filter partner type")).toBeInTheDocument();expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);expect(screen.queryByRole("button",{name:"Add partner"})).not.toBeInTheDocument();});
  it("shows the duplicate-review create flow only to referral managers",()=>{render(<PersistentReferralPartnerList snapshot={list} query={{}} canManage/>);fireEvent.click(screen.getByRole("button",{name:"Add partner"}));expect(screen.getByRole("dialog",{name:"New referral partner"})).toBeInTheDocument();expect(screen.getByRole("button",{name:"Review duplicates"})).toBeInTheDocument();});
  it("keeps inactive lead and archived household attribution readable",()=>{render(<PersistentReferralPartnerDetail snapshot={detail} canManage={false}/>);expect(screen.getByText(/Historical attribution remains visible/)).toBeInTheDocument();expect(screen.getByText("Fictional Lead")).toBeInTheDocument();expect(screen.getByText("Example household")).toBeInTheDocument();expect(screen.getByText("Archived")).toBeInTheDocument();});
  it("exposes lifecycle controls only to managers",()=>{const{rerender}=render(<PersistentReferralPartnerDetail snapshot={detail} canManage={false}/>);expect(screen.queryByRole("button",{name:"Reactivate"})).not.toBeInTheDocument();rerender(<PersistentReferralPartnerDetail snapshot={detail} canManage/>);expect(screen.getByRole("button",{name:"Reactivate"})).toBeInTheDocument();});
});
