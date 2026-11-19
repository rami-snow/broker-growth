import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrototypeProvider } from "@/components/prototype-provider";
import { NewLeadForm } from "./new-lead-form";
import { LeadsScreen } from "./leads-screen";
import { LeadDetail } from "./lead-detail";
import { TodayScreen } from "@/features/today/today-screen";
import { AppShell } from "@/components/app-shell";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/leads" }));
const wrap = (node: React.ReactNode) => render(<PrototypeProvider>{node}</PrototypeProvider>);

describe("lead components", () => {
  beforeEach(() => push.mockReset());
  it("renders accessible validated lead fields", () => { wrap(<NewLeadForm onClose={() => undefined}/>); expect(screen.getByLabelText(/First name/)).toBeRequired(); expect(screen.getByLabelText(/Email/)).toHaveAttribute("type","email"); expect(screen.getByLabelText("Loan purpose")).toBeInTheDocument(); });
  it("keeps mortgage terminology in the application shell", () => { wrap(<AppShell><p>Page content</p></AppShell>); expect(screen.getByText("Broker Growth")).toBeVisible(); expect(screen.getByText("Brokerage",{selector:"label"})).toBeVisible(); expect(screen.getByRole("link",{name:"Client Book"})).toBeVisible(); expect(screen.getByText("Brokerage administrator")).toBeVisible(); });
  it("shows actions based on the active administrator capability bundle", () => { wrap(<LeadDetail leadId="lead_001"/>); expect(screen.getByRole("button",{name:"Assign owner"})).toBeVisible(); expect(screen.queryByRole("button",{name:"Claim lead"})).not.toBeInTheDocument(); });
  it("opens keyboard-accessible lead rows", () => { wrap(<LeadsScreen/>); const row = screen.getByRole("row",{name:/Open lead Mila Hart/}); fireEvent.keyDown(row,{key:"Enter"}); expect(push).toHaveBeenCalledWith("/leads/lead_001"); });
  it("filters to a clear no-results state", () => { wrap(<LeadsScreen/>); fireEvent.change(screen.getByLabelText("Search leads"),{target:{value:"No such fictional lead"}}); expect(screen.getByText("No leads match these filters")).toBeVisible(); });
  it("states the limitation of consent summaries", () => { wrap(<LeadDetail leadId="lead_001"/>); expect(screen.getByText(/not a complete legal determination/i)).toBeVisible(); });
  it("uses structured contact fields and displays them in the activity timeline", () => { wrap(<LeadDetail leadId="lead_001"/>); fireEvent.click(screen.getByRole("button",{name:"Record contact attempt"})); expect(screen.getByText(/will not place a call or send/i)).toBeVisible(); fireEvent.change(screen.getByLabelText("Channel"),{target:{value:"Phone"}}); fireEvent.change(screen.getByLabelText("Outcome"),{target:{value:"Left message"}}); fireEvent.change(screen.getByLabelText("Note (optional)"),{target:{value:"Voicemail left externally"}}); fireEvent.change(screen.getByLabelText("Next-action date and time (optional)"),{target:{value:"2026-11-15T09:30"}}); fireEvent.click(screen.getByRole("button",{name:"Save"})); expect(screen.getByText("Phone",{selector:"b"}).parentElement).toHaveTextContent("Phone · Left message"); expect(screen.getByText("Voicemail left externally")).toBeVisible(); expect(screen.getByText(/Next action set for/)).toBeVisible(); });
  it("shows only the explicit reopen lifecycle action for a Closed lead", () => { wrap(<LeadDetail leadId="lead_007"/>); expect(screen.getByRole("button",{name:"Reopen lead"})).toBeVisible(); expect(screen.queryByRole("button",{name:"Change status"})).not.toBeInTheDocument(); });
  it("keeps the single action panel before details in logical document order", () => { wrap(<LeadDetail leadId="lead_001"/>); const actions = screen.getByRole("heading",{name:"Actions"}); const details = screen.getByRole("heading",{name:"Contact and enquiry"}); expect(actions.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); });
  it("filters Unassigned to active leads only", () => { wrap(<LeadsScreen/>); fireEvent.change(screen.getByLabelText("Owner filter"),{target:{value:"unassigned"}}); expect(screen.queryByRole("row",{name:/Open lead Ivy Lake/})).not.toBeInTheDocument(); expect(screen.getByRole("row",{name:/Open lead Mila Hart/})).toBeVisible(); });
  it("uses truthful queue badges and clarified metric labels", () => { wrap(<TodayScreen/>); expect(screen.getByText("Discovery booked")).toBeVisible(); expect(screen.getByText("Active unassigned")).toBeVisible(); expect(screen.queryByText("Needs attention")).not.toBeInTheDocument(); expect(screen.getAllByText("New").length).toBeGreaterThan(0); expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0); expect(screen.getAllByText("Today").length).toBeGreaterThan(0); expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0); expect(screen.getAllByText("Follow up").length).toBeGreaterThan(0); });
});
