import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, SearchInput, Select, TextField } from "./ui";

describe("shared UI primitives", () => {
  it("provides accessible form labels and disabled buttons", () => { const click = vi.fn(); render(<><TextField label="Email" required/><SearchInput label="Search leads"/><Select label="Status" options={[{value:"new",label:"New"}]}/><Button disabled onClick={click}>Save</Button></>); expect(screen.getByLabelText(/Email/)).toBeRequired(); expect(screen.getByLabelText("Search leads")).toHaveAttribute("type","search"); fireEvent.click(screen.getByRole("button",{name:"Save"})); expect(click).not.toHaveBeenCalled(); });
});
