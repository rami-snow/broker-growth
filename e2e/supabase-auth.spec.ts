import { expect, test } from "@playwright/test";

const isSupabaseRun = process.env.APP_RUNTIME_MODE === "supabase";
const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;

test.describe("hosted Supabase authentication", () => {
  test.skip(!isSupabaseRun, "Supabase authentication is verified in its dedicated runtime-mode run.");

  test.beforeEach(() => {
    if (!email || !password) throw new Error("Hosted auth verification requires SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD.");
  });

  test("protects routes, scopes brokerage context and signs out", async ({ page }) => {
    const browserProblems: string[] = [];
    page.on("console", message => {
      if (message.type() === "warning" || message.type() === "error") browserProblems.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", error => browserProblems.push(`pageerror: ${error.message}`));

    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftoday$/);
    await page.getByLabel("Email").fill(email!);
    const passwordField = page.getByLabel("Password");
    await passwordField.fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    if (await passwordField.isVisible()) await passwordField.fill("");

    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { name: "Harbourlight Mortgage Co." })).toBeVisible();
    await expect(page.getByLabel("Brokerage")).toHaveValue("10000000-0000-0000-0000-000000000001");
    await expect(page.getByLabel("Brokerage").locator("option")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByText("Mila Hart")).toHaveCount(0);
    await page.getByRole("link", { name: "Leads", exact: true }).click();
    await expect(page.getByText("Ruby March")).toBeVisible();
    await page.getByRole("link", { name: "Client Book", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Client Book", exact: true })).toBeVisible();
    await expect(page.getByText("March household")).toBeVisible();
    await expect(page.getByText("Wells household")).toHaveCount(0);
    await page.getByRole("button", { name: "New client" }).click();
    await expect(page.getByRole("dialog", { name: "New client household" })).toBeVisible();
    await page.getByLabel("Household display name").fill("4E browser duplicate review");
    await page.getByLabel("First name").fill("Ruby");
    await page.getByLabel("Last name").fill("March");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("RUBY.MARCH@EXAMPLE.TEST");
    await page.getByRole("button", { name: "Review duplicates" }).click();
    await expect(page.getByText(/exact email or phone match must be selected/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create client" })).toBeDisabled();
    await page.getByLabel("Primary contact source").selectOption("existing");
    await page.getByLabel("Search existing primary contact").fill("ruby.march");
    await page.getByRole("button", { name: "Search contacts" }).click();
    await expect(page.getByRole("combobox", { name:"Existing primary contact", exact:true })).toHaveValue("40000000-0000-0000-0000-000000000001");
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByLabel("Search Client Book").fill("ruby.march");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("March household")).toBeVisible();
    await page.getByRole("link", { name: "March household" }).click();
    await expect(page.getByRole("heading", { name: "March household" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Current effective consent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review opportunities" })).toBeVisible();

    await page.getByLabel("Brokerage").selectOption("10000000-0000-0000-0000-000000000002");
    await page.getByRole("button", { name: "Switch" }).click();
    await expect(page.getByRole("heading", { name: "Ranges Home Finance" })).toBeVisible();
    await page.getByRole("link", { name: "Client Book", exact: true }).click();
    await expect(page.getByText("Wells household")).toBeVisible();
    await expect(page.getByText("March household")).toHaveCount(0);
    await page.goto("/client-book/60000000-0000-0000-0000-000000000001");
    await expect(page.getByRole("heading", { name: "Household unavailable" })).toBeVisible();

    await page.getByLabel("Brokerage").evaluate((select) => {
      const option = document.createElement("option");
      option.value = "99999999-9999-9999-9999-999999999999";
      option.textContent = "Unauthorized brokerage";
      select.append(option);
      (select as HTMLSelectElement).value = option.value;
    });
    await page.getByRole("button", { name: "Switch" }).click();
    await expect(page).toHaveURL(/\/no-access$/);
    await expect(page.getByRole("heading", { name: "Brokerage access unavailable" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Ftoday$/);
    expect(browserProblems).toEqual([]);
  });

  test("renders the verified Supabase workspace at a narrow mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email!);
    const passwordField = page.getByLabel("Password");
    await passwordField.fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    if (await passwordField.isVisible()) await passwordField.fill("");

    await expect(page.getByRole("heading", { name: "Harbourlight Mortgage Co." })).toBeVisible();
    await expect(page.getByLabel("Brokerage")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await page.getByRole("link", { name: "Leads", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();
    await expect(page.getByText("Ruby March")).toBeVisible();
    await page.getByRole("link", { name: "Client Book", exact: true }).click();
    await expect(page.getByText("March household")).toBeVisible();
    await page.getByRole("button", { name: "New client" }).click();
    await expect(page.getByRole("dialog", { name: "New client household" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review duplicates" })).toBeVisible();
    await expect(page.getByText(/never infer consent/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("link", { name: "March household" }).click();
    await expect(page.getByRole("button", { name: "Add loan record" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create task" })).toBeVisible();
  });

  test("keeps hosted review queues and mutation controls readable without writing fixture data",async({page})=>{
    await page.goto("/sign-in");await page.getByLabel("Email").fill(email!);await page.getByLabel("Password").fill(password!);await page.getByRole("button",{name:"Sign in"}).click();
    await expect(page.getByRole("heading",{name:"Retention review queues"})).toBeVisible();
    await expect(page.getByText("Annual reviews due or overdue")).toBeVisible();
    await expect(page.getByText("Fixed-rate expiries within 90 days")).toBeVisible();
    await expect(page.getByText("Unassigned review opportunities")).toBeVisible();
    await page.getByRole("link",{name:"Client Book",exact:true}).click();await page.getByRole("link",{name:"March household",exact:true}).click();
    await expect(page.getByRole("button",{name:"Add loan record"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Create task"})).toBeVisible();
  });

  test("supports hosted referral duplicate review, filters and mobile detail without residue",async({page})=>{
    const browserProblems:string[]=[];
    page.on("console",message=>{if(message.type()==="warning"||message.type()==="error")browserProblems.push(`${message.type()}: ${message.text()}`);});
    page.on("pageerror",error=>browserProblems.push(`pageerror: ${error.message}`));
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button",{name:"Sign in"}).click();
    await page.getByRole("link",{name:"Referral partners",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Referral partners",exact:true})).toBeVisible();
    await page.getByLabel("Filter referral status").selectOption("Active");
    await page.getByLabel("Filter partner type").selectOption("Accountant");
    await page.getByRole("button",{name:"Apply"}).click();
    await expect(page).toHaveURL(/status=Active/);
    await expect(page).toHaveURL(/type=Accountant/);
    await page.getByRole("button",{name:"New referral partner"}).click();
    await page.getByLabel("Partner name").fill("4F Browser Fictional Partner");
    await page.getByLabel("Organisation name (optional)").fill("4F Fictional Advisory");
    await page.getByRole("button",{name:"Review duplicates"}).click();
    await expect(page.getByRole("heading",{name:"Duplicate review"})).toBeVisible();
    await expect(page.getByText(/never merged automatically/i)).toBeVisible();
    await page.getByRole("button",{name:"Cancel"}).click();
    await page.setViewportSize({width:390,height:844});
    await page.goto("/referral-partners");
    const firstPartner=page.locator("tbody a").first();
    await expect(firstPartner).toBeVisible();
    await firstPartner.click();
    await expect(page.getByRole("heading",{name:"Partner details"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Attributed households"})).toBeVisible();
    expect(browserProblems).toEqual([]);
  });
});
