import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrototypeProvider } from "@/components/prototype-provider";
import { FixtureNeedsActionScreen, TodayScreen } from "./today-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/today/needs-action" }));
const wrap = (node: React.ReactNode) => render(<PrototypeProvider>{node}</PrototypeProvider>);
const titles = (root: HTMLElement) => Array.from(root.querySelectorAll(".list-row__title")).map(node => node.firstChild?.textContent);

describe("Needs action page", () => {
  it("lists every Today item in the same order, with the same buttons", () => {
    const today = wrap(<TodayScreen/>);
    const card = screen.getByRole("heading", { name: "Needs action" }).closest("section")!;
    const total = Number(card.querySelector(".card__header .badge")!.textContent);
    const todayTitles = titles(card);
    expect(within(card).getByRole("link", { name: "View all" })).toHaveAttribute("href", "/today/needs-action");
    today.unmount();
    wrap(<FixtureNeedsActionScreen/>);
    const rows = document.querySelectorAll(".list-row");
    expect(rows).toHaveLength(total);
    expect(titles(document.body).slice(0, todayTitles.length)).toEqual(todayTitles);
    expect(within(rows[0] as HTMLElement).getByRole("link", { name: "Open lead" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/today");
  });
  it("filters by type and keeps the footer count equal to the rows listed", () => {
    wrap(<FixtureNeedsActionScreen/>);
    const total = document.querySelectorAll(".list-row").length;
    for (const name of [/^First response/, /^Unassigned/, /^Annual review/, /^Fixed-rate expiry/]) {
      const tab = screen.getByRole("tab", { name });
      fireEvent.click(tab);
      const shown = document.querySelectorAll(".list-row").length;
      expect(tab.textContent).toContain(String(shown));
      if (shown) expect(screen.getByText(`Showing ${shown} of ${total} ${total === 1 ? "item" : "items"}`)).toBeVisible();
    }
    fireEvent.click(screen.getByRole("tab", { name: /^First response/ }));
    expect(Array.from(document.querySelectorAll(".list-row__title")).every(node => node.textContent?.startsWith("Call "))).toBe(true);
  });
});
