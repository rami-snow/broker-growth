import { fireEvent,render,screen,within } from "@testing-library/react";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { PrototypeProvider } from "@/components/prototype-provider";
import { usePrototype } from "@/components/prototype-provider";
import { CampaignsScreen } from "./campaigns-screen";
import { CampaignDetail } from "./campaign-detail";

const push=vi.fn();
vi.mock("next/navigation",()=>({useRouter:()=>({push}),usePathname:()=>"/campaigns"}));
const wrap=(node:React.ReactNode)=>render(<PrototypeProvider>{node}</PrototypeProvider>);
function WithoutApproval({children}:{children:React.ReactNode}){const{repo}=usePrototype();const membership=repo.snapshot().memberships.find(item=>item.id==="mem_h_admin")!;membership.capabilities=membership.capabilities.filter(item=>item!=="campaign.approve");return children;}

describe("Milestone 3 campaign UI",()=>{
  beforeEach(()=>push.mockReset());

  it("lists mortgage campaign plans and states the non-delivery boundary",()=>{
    wrap(<CampaignsScreen/>);
    expect(screen.getByRole("heading",{name:"Campaigns"})).toBeVisible();
    expect(screen.getByRole("row",{name:/Annual review outreach plan/})).toBeVisible();
    expect(screen.getByRole("row",{name:/Fixed-rate expiry check-in/})).toBeVisible();
    expect(screen.getByText(/never sends, schedules, queues or exports/i)).toBeVisible();
  });

  it("creates a mortgage campaign plan without offering delivery actions",async()=>{
    wrap(<CampaignsScreen/>);
    fireEvent.click(screen.getByRole("button",{name:"New campaign"}));
    const dialog=await screen.findByRole("dialog",{name:"New campaign plan"});
    fireEvent.change(within(dialog).getByRole("textbox",{name:/Campaign name/}),{target:{value:"Client annual review invitation"}});
    fireEvent.click(within(dialog).getByRole("button",{name:"Create plan"}));
    expect(push).toHaveBeenCalledWith("/campaigns/campaign_005");
    expect(screen.queryByRole("button",{name:/send|schedule|queue|export/i})).not.toBeInTheDocument();
  });

  it("previews explainable eligibility, masked destinations and resolved sample copy",()=>{
    wrap(<CampaignDetail campaignId="campaign_001"/>);
    fireEvent.click(screen.getByRole("button",{name:"Save and preview"}));
    expect(screen.getAllByText(/eligible$/i).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/excluded$/i).length).toBeGreaterThan(1);
    expect(screen.getAllByText(/@example\.test|Not available/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading",{name:"Sample recipient preview"}).parentElement).toHaveTextContent("Harbourlight Mortgage Co.");
    fireEvent.click(screen.getByRole("button",{name:"Excluded"}));
    expect(screen.getAllByText("Excluded").length).toBeGreaterThan(1);
  });

  it("submits and approves an immutable plan while confirming no delivery",()=>{
    wrap(<CampaignDetail campaignId="campaign_001"/>);
    fireEvent.click(screen.getByRole("button",{name:"Submit for review"}));
    expect(screen.getByText("Ready for review",{selector:"span"})).toBeVisible();
    fireEvent.click(screen.getByRole("button",{name:"Approve reviewed audience"}));
    expect(screen.getByText("Approved plan only")).toBeVisible();
    expect(screen.getByText("No delivery occurred.")).toBeVisible();
    expect(screen.queryByRole("button",{name:/send|schedule|queue|export/i})).not.toBeInTheDocument();
  });

  it("hides approval and rejection controls without campaign.approve",()=>{
    render(<PrototypeProvider><WithoutApproval><CampaignDetail campaignId="campaign_002"/></WithoutApproval></PrototypeProvider>);
    expect(screen.queryByRole("button",{name:"Approve reviewed audience"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Reject plan"})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rejection reason")).not.toBeInTheDocument();
  });

  it("keeps one mobile-ready plan action panel for responsive reordering",()=>{
    wrap(<CampaignDetail campaignId="campaign_001"/>);
    const actions=screen.getByRole("heading",{name:"Plan actions"}),content=screen.getByRole("heading",{name:"Content plan"});
    expect(screen.getAllByRole("heading",{name:"Plan actions"})).toHaveLength(1);
    expect(actions.compareDocumentPosition(content)&Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(within(actions.parentElement!).getByRole("button",{name:"Save and preview"})).toBeVisible();
  });
});
