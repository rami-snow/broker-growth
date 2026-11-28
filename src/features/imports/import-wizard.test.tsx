import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrototypeProvider } from "@/components/prototype-provider";
import { FixtureImportScreen, PersistentImportScreen } from "./import-screens";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/import" }));
const actions = vi.hoisted(() => ({ previewImportAction: vi.fn(), runImportAction: vi.fn() }));
vi.mock("@/app/import-actions", () => actions);

const leadsCsv = "First name,Last name,Email,Phone,Loan balance\nNova,Quill,nova.quill@example.test,,450000\nNova,Again,NOVA.QUILL@example.test,,\nNo,Contact,,,\n";
const paste = (csv: string) => { fireEvent.change(screen.getByLabelText("Or paste CSV text"), { target: { value: csv } }); fireEvent.click(screen.getByRole("button", { name: "Use pasted text" })); };

describe("CSV import screen (fixture runtime)", () => {
  it("maps columns, ignores financial data, previews, imports, and matches on a second run", async () => {
    render(<PrototypeProvider><FixtureImportScreen initialKind="leads"/></PrototypeProvider>);
    expect(screen.getByText(/read in your browser and is not uploaded or kept/)).toBeVisible();
    paste(leadsCsv);
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("Email");
    expect(screen.getByText("Loan balance: Financial data is never stored")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    const preview = await screen.findByRole("table", { name: "Import preview" });
    expect(within(preview).getByRole("row", { name: /Nova Quill Will be created/ })).toBeVisible();
    expect(within(preview).getByRole("row", { name: /Nova Again Repeats line 2/ })).toBeVisible();
    expect(within(preview).getByRole("row", { name: /No Contact Error Email or phone is required/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import 1 record" }));
    const results = await screen.findByRole("table", { name: "Import results" });
    expect(within(results).getByRole("row", { name: /Nova Quill Created/ })).toBeVisible();
    expect(screen.getByText(/1 created · 0 already existed · 1 repeated · 1 not imported/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Import another file" }));
    paste(leadsCsv);
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    const second = await screen.findByRole("table", { name: "Import preview" });
    expect(within(second).getByRole("row", { name: /Nova Quill Already exists \(matched on email\)/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Import 0 records" })).toBeDisabled();
  });

  it("requires the mapped name columns and a broker owner for households", async () => {
    render(<PrototypeProvider><FixtureImportScreen initialKind="clients"/></PrototypeProvider>);
    paste("Given,Family,Email\nIvy,Lark,ivy.lark@example.test\n");
    expect(screen.getByRole("button", { name: "Preview import" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Match First name and Last name to continue.");
    fireEvent.change(screen.getByLabelText("First name *"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Last name *"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Owner when the file has none (Broker)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    expect(await screen.findByRole("row", { name: /Lark.*Error.*Owner is required/ })).toBeVisible();
  });

  it("reports unreadable files without leaving the first step", () => {
    render(<PrototypeProvider><FixtureImportScreen initialKind="partners"/></PrototypeProvider>);
    paste('Partner name\n"unclosed');
    expect(screen.getByRole("alert")).toHaveTextContent(/unclosed quote/);
    expect(screen.getByLabelText("Or paste CSV text")).toBeVisible();
  });
});

describe("CSV import screen (Supabase runtime)", () => {
  const setup = { owners: [{ id: "m_dana", name: "Dana Ellis", isBroker: true }], allowedKinds: ["leads" as const], currentMembershipId: "m_dana" };

  it("sends parsed records only and reuses the command id when an import is retried", async () => {
    actions.previewImportAction.mockImplementation(async (_kind, records) => ({ ok: true, value: records.map((record: unknown) => ({ record, status: "new" })) }));
    actions.runImportAction.mockResolvedValueOnce({ ok: false, message: "The import could not be completed. Nothing further was changed." })
      .mockImplementationOnce(async (_kind, _id, records) => ({ ok: true, value: records.map((record: { rows: number[]; label: string }) => ({ rows: record.rows, label: record.label, outcome: "created" })) }));
    render(<PersistentImportScreen setup={setup}/>);
    expect(screen.queryByRole("radio", { name: "Referral partners" })).toBeNull();
    paste("First name,Last name,Email,Interest rate\nNova,Quill,nova.quill@example.test,6.1\n");
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nothing further was changed");
    fireEvent.click(screen.getByRole("button", { name: "Import 1 record" }));
    await screen.findByRole("table", { name: "Import results" });
    const [first, second] = actions.runImportAction.mock.calls;
    expect(first![1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(second![1]).toBe(first![1]);
    expect(JSON.stringify(first![2])).not.toContain("6.1");
    expect(first![2][0]).toMatchObject({ kind: "leads", email: "nova.quill@example.test", ownerMembershipId: "m_dana" });
  });

  it("explains when the position cannot import anything", () => {
    render(<PersistentImportScreen setup={{ ...setup, allowedKinds: [] }}/>);
    expect(screen.getByRole("heading", { name: "Import unavailable" })).toBeVisible();
  });
});

describe("import entry points", () => {
  it("links Clients to the client import", async () => {
    const { ClientBookScreen } = await import("@/features/clients/client-book-screen");
    render(<PrototypeProvider><ClientBookScreen/></PrototypeProvider>);
    await waitFor(() => expect(screen.getByRole("link", { name: "Import clients" })).toHaveAttribute("href", "/import?type=clients"));
  });
});
