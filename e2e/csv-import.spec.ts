import { expect, test } from "@playwright/test";

const csv = ["Household,First name,Last name,Email,Phone,Lender,Rate type,Fixed rate ends,Loan balance",
  "Tamsin household,Ada,Tamsin,ada.tamsin@example.test,,Example Mutual,Fixed,20/01/2027,450000",
  "Tamsin household,Rhys,Tamsin,,0490 777 123,,,,",
  "Lark household,Ivy,Lark,ivy.lark@example.test,,,,,"].join("\n");

test("imports a client CSV read in the browser, and a second run creates nothing", async ({ page }) => {
  await page.goto("/client-book");
  await page.getByRole("link", { name: "Import clients" }).click();
  await expect(page.getByRole("heading", { name: "Import CSV" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Clients and households" })).toBeChecked();
  await page.getByLabel("CSV file").setInputFiles({ name: "clients.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("Loan balance: Financial data is never stored")).toBeVisible();
  await page.getByLabel("Owner when the file has none (Broker)").selectOption("mem_h_broker1");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("row", { name: /Tamsin household Will be created/ })).toBeVisible();
  await page.getByRole("button", { name: "Import 2 records" }).click();
  await expect(page.getByRole("row", { name: /Tamsin household Created/ })).toBeVisible();
  await expect(page.getByText(/actor “import”/)).toBeVisible();

  await page.getByRole("button", { name: "Import another file" }).click();
  await page.getByLabel("CSV file").setInputFiles({ name: "clients.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByLabel("Owner when the file has none (Broker)").selectOption("mem_h_broker1");
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByRole("row", { name: /Tamsin household Already exists \(matched on email\)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 records" })).toBeDisabled();

  await page.getByRole("button", { name: "Back to columns" }).click();
  await page.getByRole("button", { name: "Choose another file" }).click();
  await page.getByRole("link", { name: "Clients", exact: true }).first().click();
  await page.getByLabel("Search client book").fill("Tamsin");
  await expect(page.getByRole("row", { name: /Tamsin household/ })).toBeVisible();
});
