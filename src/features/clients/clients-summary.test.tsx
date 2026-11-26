import { fireEvent, render, screen, within } from "@testing-library/react";
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
