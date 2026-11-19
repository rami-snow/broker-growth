import { fireEvent,render,screen } from "@testing-library/react";
import { describe,expect,it,vi } from "vitest";
import type { ClientBookListSnapshot } from "@/verticals/mortgage/repositories/client-book-port";
import { PersistentClientBookScreen } from "./persistent-client-book-screen";

vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()})}));
vi.mock("@/app/client-book-actions",()=>({
  previewPersistentManualHousehold:vi.fn(async()=>({reviewed:false,message:"",primaryMatches:[],jointMatches:[]})),
  runPersistentManualHousehold:vi.fn(async()=>({ok:false,message:""})),
  searchPersistentContactOptions:vi.fn(async()=>({options:[{id:"contact-a",name:"Existing Fiction",email:"existing@example.test"}],message:""})),
}));

const snapshot:ClientBookListSnapshot={
  rows:[],total:0,page:1,pageSize:25,
  memberships:[{id:"member-a",displayName:"Alex Fiction"}],
  brokers:[{id:"member-a",displayName:"Alex Fiction"}],
  referralPartners:[{id:"referral-a",name:"Fictional Referrals"}],
};

describe("persistent Client Book creation UI",()=>{
  it("hides New client without the exact creation capability",()=>{
    render(<PersistentClientBookScreen snapshot={snapshot} query={{}} capabilities={[]} actorMembershipId="member-a"/>);
    expect(screen.queryByRole("button",{name:"New client"})).not.toBeInTheDocument();
  });

  it("opens an accessible duplicate-first workflow without inferring consent",()=>{
    render(<PersistentClientBookScreen snapshot={snapshot} query={{}} capabilities={["mortgage.household.create","contact.view"]} actorMembershipId="member-a"/>);
    fireEvent.click(screen.getByRole("button",{name:"New client"}));
    expect(screen.getByRole("dialog",{name:"New client household"})).toBeVisible();
    expect(screen.getByLabelText("Active Broker owner")).toHaveValue("member-a");
    expect(screen.getByLabelText("Referral partner (optional)")).toBeVisible();
    expect(screen.getByRole("button",{name:"Review duplicates"})).toBeVisible();
    expect(screen.queryByRole("button",{name:"Create client"})).not.toBeInTheDocument();
    expect(screen.getByText(/never infer consent/i)).toBeVisible();
  });

  it("supports selecting existing primary and joint contacts",()=>{
    render(<PersistentClientBookScreen snapshot={snapshot} query={{}} capabilities={["mortgage.household.create","contact.view"]} actorMembershipId="member-a"/>);
    fireEvent.click(screen.getByRole("button",{name:"New client"}));
    fireEvent.change(screen.getByLabelText("Primary contact source"),{target:{value:"existing"}});
    expect(screen.getByLabelText("Search existing primary contact")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Joint member"),{target:{value:"existing"}});
    expect(screen.getByLabelText("Search existing joint contact")).toBeVisible();
    expect(screen.getByRole("option",{name:"Guarantor"})).toBeInTheDocument();
  });

  it("limits a non-assigning Broker to self ownership and hides contact lookup without contact.view",()=>{
    const twoBrokers={...snapshot,brokers:[...snapshot.brokers,{id:"member-b",displayName:"Blair Fiction"}]};
    render(<PersistentClientBookScreen snapshot={twoBrokers} query={{}} capabilities={["mortgage.household.create"]} actorMembershipId="member-a"/>);
    fireEvent.click(screen.getByRole("button",{name:"New client"}));
    expect(screen.getByLabelText("Active Broker owner")).toHaveValue("member-a");
    expect(screen.queryByRole("option",{name:"Blair Fiction"})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Primary contact source")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Create client"})).toBeVisible();
  });
});
