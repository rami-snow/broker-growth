import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrototypeProvider } from "@/components/prototype-provider";
import { ClientBookScreen } from "./client-book-screen";
import { ReferralPartnerFixtureList } from "@/features/referrals/referral-partner-fixture-list";
import { FutureScreen } from "@/features/future/future-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/client-book" }));
const wrap = (node: React.ReactNode) => render(<PrototypeProvider>{node}</PrototypeProvider>);
const card = (label: string) => Number(screen.getByText(label).previousElementSibling!.textContent);

describe("Clients summary and footer", () => {
  it("labels every card by what it counts and agrees with the 90-day filter", () => {
    wrap(<ClientBookScreen/>);
    expect(card("Active households")).toBe(6);
    expect(card("People in active households")).toBe(10);
    const fixed = card("Households with a fixed rate ending in 90 days");
    fireEvent.change(screen.getByLabelText("Fixed-rate expiry filter"), { target: { value: "90" } });
    const footer = screen.getByRole("table").querySelector("tfoot")!;
    expect(within(footer as HTMLElement).getByText(`Showing ${fixed} of 6 households`)).toBeVisible();
    expect(screen.getAllByRole("row", { name: /^Open household/ })).toHaveLength(fixed);
  });
  it("counts the rows matching filters against all households", () => {
    wrap(<ClientBookScreen/>);
    fireEvent.click(screen.getByRole("button", { name: "Has opportunity" }));
    const rows = screen.getAllByRole("row", { name: /^Open household/ }).length;
    expect(screen.getByText(`Showing ${rows} of 6 households`)).toBeVisible();
  });
});

describe("Partners top bar and Reports placeholder", () => {
  it("shows Add partner disabled with a reason in fixture mode and no footer disclaimer", () => {
    wrap(<ReferralPartnerFixtureList/>);
    const button = screen.getByRole("button", { name: "Add partner" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/Supabase mode/));
    expect(screen.queryByText(/Persistent partner maintenance/)).not.toBeInTheDocument();
    expect(screen.getByText("Referrals converted").closest(".summary-card")).toHaveAttribute("title", expect.stringMatching(/does not prove/));
  });
  it("uses plain Reports wording", () => {
    render(<FutureScreen title="Reports" heading="Reports are coming" body="They will show response times, conversion and lead sources."/>);
    expect(screen.getByText("Reports are coming")).toBeVisible();
    expect(screen.queryByText(/Milestone 1/)).not.toBeInTheDocument();
  });
});

describe("4F.3 screens", () => {
  it("labels the loan column Rate type and shows Fixed, Variable or Split", async () => {
    wrap(<ClientBookScreen/>);
    expect(screen.getByRole("columnheader", { name: "Rate type" })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Loan purpose" })).not.toBeInTheDocument();
    const cells = Array.from(document.querySelectorAll("tbody tr td:nth-child(2)")).map(cell => cell.textContent);
    expect(cells.every(text => ["Fixed", "Variable", "Split", "Not recorded", "—"].includes(text ?? ""))).toBe(true);
    expect(screen.getByText("Loan records hold lender, rate type and fixed-rate expiry date only")).toBeVisible();
  });
  it("adds a household note from the client detail", async () => {
    const { ClientDetail } = await import("./client-detail");
    wrap(<ClientDetail householdId="household_001"/>);
    expect(screen.getByText(/Prefers a call after 5 pm/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Add a household note"), { target: { value: "Asked for the review in December." } });
    fireEvent.click(within(screen.getByRole("region", { name: "Notes" })).getByRole("button", { name: "Add note" }));
    const notesRegion = screen.getByRole("region", { name: "Notes" });
    expect(notesRegion.querySelectorAll(".record-row")).toHaveLength(2);
    expect(notesRegion.querySelector(".record-row")).toHaveTextContent("Asked for the review in December.");
    await waitFor(() => expect(screen.getByLabelText("Add a household note")).toHaveValue(""));
    expect(screen.getAllByText("Household note added").length).toBeGreaterThan(0);
  });
  it("shows and edits a partner next step", async () => {
    const { ReferralPartnerFixtureDetail } = await import("@/features/referrals/referral-partner-fixture-detail");
    wrap(<ReferralPartnerFixtureDetail referralPartnerId="referral_harbour_conveyancing"/>);
    fireEvent.change(screen.getByLabelText("Next step"), { target: { value: "Invite to client event" } });
    fireEvent.click(screen.getByRole("button", { name: "Save next step" }));
    expect(screen.getByLabelText("Next step")).toHaveValue("Invite to client event");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
