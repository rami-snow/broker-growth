import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrototypeProvider } from "@/components/prototype-provider";
import { SettingsScreen } from "./settings-screen";
import { CampaignsScreen } from "@/features/campaigns/campaigns-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/settings" }));
const wrap = (node: React.ReactNode) => render(<PrototypeProvider>{node}</PrototypeProvider>);

describe("Settings (frame 08)", () => {
  it("shows the five sections and CSV as the only phase 1 import source", () => {
    wrap(<SettingsScreen/>);
    for (const name of ["Brokerage", "Team and positions", "Data sources", "Consent", "Audit log"]) expect(screen.getByRole("tab", { name })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Data sources" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("CSV file")).toBeVisible();
    expect(within(table).getAllByText("Coming later")).toHaveLength(2);
    expect(within(table).queryByText(/Live sync|Daily sync/)).not.toBeInTheDocument();
    expect(screen.getByText(/actor “import”/)).toBeVisible();
  });
  it("lists audit entries newest first", () => {
    wrap(<SettingsScreen/>);
    fireEvent.click(screen.getByRole("tab", { name: "Audit log" }));
    expect(screen.getAllByRole("row").length).toBeGreaterThan(2);
    expect(screen.queryByRole("button", { name: /delete|edit/i })).not.toBeInTheDocument();
  });
});

describe("Campaign review panel (frame 06)", () => {
  it("shows timing as Not scheduled and approves only a recorded decision", () => {
    wrap(<CampaignsScreen/>);
    const panel = screen.getByRole("complementary", { name: "Campaign review" });
    expect(within(panel).getByText("Not scheduled")).toBeVisible();
    expect(screen.getByText(/never sends, schedules, queues or exports/)).toBeVisible();
    fireEvent.click(within(panel).getByRole("button", { name: "Approve plan" }));
    if (!within(panel).queryByText(/Plan approved/)) fireEvent.click(within(panel).getByRole("button", { name: "Approve plan" }));
    expect(within(panel).getByText("Plan approved. Nothing was sent or scheduled.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /send|schedule|export/i })).not.toBeInTheDocument();
  });
});
