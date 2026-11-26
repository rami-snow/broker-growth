import { expect, test } from "@playwright/test";

test("unassigned lead moves through contact, task and discovery booking", async ({ page }) => {
  await page.goto("/today");
  await expect(page.getByRole("heading",{name:"Today",exact:true})).toBeVisible();
  await page.getByRole("link",{name:/Mila Hart/}).first().click();
  await page.getByRole("button",{name:"Assign owner"}).click();
  await page.locator('.modal select[name="owner"]').selectOption("mem_h_broker1");
  await page.getByRole("button",{name:"Save"}).click();
  await page.getByRole("button",{name:"Log contact attempt"}).click();
  await page.getByLabel("Channel").selectOption("Phone");
  await page.getByLabel("Outcome").selectOption("Left message");
  await page.getByLabel("Note (optional)").fill("Called and left a voicemail externally");
  await page.getByLabel("Next-action date and time (optional)").fill("2026-11-15T09:30");
  await page.getByRole("button",{name:"Save"}).click();
  await expect(page.getByText("Left message")).toBeVisible();
  await expect(page.getByText(/Next action set for/)).toBeVisible();
  await page.getByRole("button",{name:"Change stage"}).click();
  await page.getByLabel("New stage").selectOption("Contacted");
  await page.getByRole("button",{name:"Save"}).click();
  await page.getByRole("button",{name:"Create follow-up task"}).click();
  await page.getByLabel("Task title").fill("Send discovery preparation note");
  await page.getByLabel("Due date and time").fill("2026-11-15T09:00");
  await page.getByRole("button",{name:"Save"}).click();
  await page.getByRole("button",{name:"Book discovery appointment"}).click();
  await page.getByLabel("Starts at").fill("2026-11-16T10:00");
  await page.getByRole("button",{name:"Book appointment"}).click();
  await expect(page.getByText("Discovery booked",{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/Contact attempt recorded/)).toBeVisible();
  await expect(page.getByText(/Follow-up task created/).first()).toBeVisible();
  await page.getByRole("link",{name:"Today"}).click();
  await expect(page.getByRole("heading",{name:"Needs action"})).toBeVisible();
  await expect(page.getByText("Call Mila Hart")).toHaveCount(0);
  await page.getByRole("link",{name:"Leads",exact:true}).click();
  await page.getByRole("row",{name:/Open lead Mila Hart/}).click();
  await page.getByLabel("Brokerage").selectOption("brk_ranges");
  await expect(page.getByRole("heading",{name:"Lead unavailable"})).toBeVisible();
});

test("referral partner directory and detail remain usable on desktop", async ({ page }) => {
  const browserProblems:string[]=[];
  page.on("console",message=>{if(message.type()==="warning"||message.type()==="error")browserProblems.push(`${message.type()}: ${message.text()}`);});
  page.on("pageerror",error=>browserProblems.push(`pageerror: ${error.message}`));
  await page.goto("/referral-partners");
  await expect(page.getByRole("heading",{name:"Referral partners",exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Morgan Lee"})).toBeVisible();
  await page.getByRole("link",{name:"Morgan Lee"}).click();
  await expect(page.getByRole("heading",{name:"Morgan Lee",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Attributed leads"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Attributed households"})).toBeVisible();
  expect(browserProblems).toEqual([]);
});

test("closed lead offers reopen without a generic status action", async ({ page }) => {
  await page.goto("/leads/lead_007");
  await expect(page.getByRole("button",{name:"Reopen lead"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Change stage"})).toHaveCount(0);
});

test("qualified lead converts atomically into a joint client and review opportunity", async ({ page }) => {
  await page.goto("/leads/lead_005");
  await expect(page.getByRole("button",{name:"Convert to client"})).toBeVisible();
  await page.getByRole("button",{name:"Convert to client"}).click();
  await page.getByLabel("Joint client first name (optional)").fill("Avery");
  await page.getByLabel("Joint client last name").fill("March");
  await page.getByLabel("Joint client email").fill("avery.march@example.test");
  await page.getByLabel("Joint client phone").fill("0499 111 222");
  await page.getByLabel("Current lender").fill("Example Mutual");
  await page.getByLabel("Settlement date").fill("2026-10-01");
  await page.getByLabel("Next review date (optional)").fill("2026-11-20");
  await page.getByRole("button",{name:"Review duplicates"}).click();
  await expect(page.getByRole("heading",{name:"Review possible duplicates"})).toBeVisible();
  await expect(page.getByText("March household").first()).toBeVisible();
  await page.getByRole("button",{name:"Complete conversion"}).click();

  await expect(page.getByText("Converted",{exact:true}).first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Convert to client"})).toHaveCount(0);
  await page.getByRole("link",{name:"Open client household"}).click();
  await expect(page.getByRole("heading",{name:"March household"})).toBeVisible();
  await expect(page.getByText("Avery March",{exact:true})).toBeVisible();
  await expect(page.getByRole("link",{name:"Open source lead"})).toBeVisible();
  await expect(page.getByText(/Lead conversion · Original source: Lead enquiry form/).first()).toBeVisible();
  await expect(page.getByText("Annual review").first()).toBeVisible();

  const reviewRow=page.locator(".opportunity-row").filter({hasText:"Annual review"}).first();
  await expect(reviewRow.getByText("Unassigned")).toBeVisible();
  await reviewRow.getByRole("button",{name:"Manage"}).click();
  await page.getByLabel("Assign to").selectOption("mem_h_broker1");
  await page.getByLabel("Opportunity action").selectOption("Due");
  await page.getByRole("button",{name:"Save"}).click();
  await expect(reviewRow.getByText("Due")).toBeVisible();

  await page.getByRole("link",{name:"Today"}).click();
  await expect(page.getByRole("heading",{name:"Today’s priorities"})).toBeVisible();
  await expect(page.getByRole("link",{name:/March household annual review/}).first()).toBeVisible();

  await page.getByRole("link",{name:"Clients",exact:true}).click();
  await page.getByRole("row",{name:/Open household March household/}).first().click();
  await page.getByLabel("Brokerage").selectOption("brk_ranges");
  await expect(page.getByRole("heading",{name:"Household unavailable"})).toBeVisible();
});

test("annual review campaign is previewed and approved without delivery", async ({ page }) => {
  const browserProblems:string[]=[];
  page.on("console",message=>{if(message.type()==="warning"||message.type()==="error")browserProblems.push(`${message.type()}: ${message.text()}`);});
  page.on("pageerror",error=>browserProblems.push(`pageerror: ${error.message}`));
  await page.goto("/campaigns");
  await expect(page.getByRole("heading",{name:"Campaigns",exact:true})).toBeVisible();
  await expect(page.getByText(/never sends, schedules, queues or exports/i)).toBeVisible();

  await page.getByRole("button",{name:"New campaign"}).click();
  const createDialog=page.getByRole("dialog",{name:"New campaign plan"});
  await createDialog.getByRole("textbox",{name:/Campaign name/}).fill("November annual review invitation");
  await createDialog.locator('select[name="purpose"]').selectOption("mortgage.annual-review-reminder");
  await createDialog.locator('select[name="channel"]').selectOption("Email");
  await createDialog.getByRole("button",{name:"Create plan"}).click();

  await expect(page.getByRole("heading",{name:"November annual review invitation"})).toBeVisible();
  await page.getByLabel("Household display name").check();
  await page.getByLabel("Email subject").fill("Annual review for {{household.displayName}}");
  await page.getByLabel("Message body").fill("Hi {{contact.firstName}}, {{brokerage.name}} invites {{household.displayName}} to arrange an annual review with {{broker.displayName}}.\n\n[Sender identification]\n[Unsubscribe instructions]");
  await page.getByRole("button",{name:"Save and preview"}).click();

  await expect(page.locator(".campaign-counts").getByText(/\d+ eligible/)).toBeVisible();
  await expect(page.locator(".campaign-counts").getByText(/\d+ excluded/)).toBeVisible();
  await page.getByRole("button",{name:"Excluded"}).click();
  await expect(page.locator(".recipient-row").first()).toContainText("Excluded");
  await page.getByRole("button",{name:"Eligible"}).click();
  await expect(page.locator(".recipient-row").first()).toContainText("Eligible");
  await expect(page.getByRole("heading",{name:"Sample recipient preview"}).locator("..")).toContainText("Harbourlight Mortgage Co.");

  await page.getByRole("button",{name:"Submit for review"}).click();
  await expect(page.getByText("Ready for review",{exact:true})).toBeVisible();
  await expect(page.getByText(/Approval performs a fresh eligibility check/i)).toBeVisible();
  await page.getByRole("button",{name:"Record external consent change"}).click();
  const consentDialog=page.getByRole("dialog",{name:"Record external consent change"});
  await consentDialog.locator('select[name="contactId"]').selectOption("person_001");
  await consentDialog.locator('select[name="channel"]').selectOption("Email");
  await consentDialog.locator('select[name="status"]').selectOption("Recorded");
  await consentDialog.getByLabel("External evidence source").fill("Fictional external CRM consent form");
  await consentDialog.getByLabel("Effective date and time").fill("2026-11-14T12:00");
  await consentDialog.getByLabel("Evidence note (required when reinstating consent)").fill("Client completed the fictional external consent form");
  await consentDialog.getByRole("checkbox").check();
  await consentDialog.getByRole("button",{name:"Record external evidence"}).click();

  await page.getByRole("button",{name:"Approve reviewed audience"}).click();
  await expect(page.getByText("Audience changed — approval is paused.")).toBeVisible();
  await expect(page.getByText(/Review the changes, then approve again/)).toBeVisible();
  await expect(page.getByText("Ready for review",{exact:true})).toBeVisible();
  await expect(page.getByText(/changed from excluded to eligible/)).toBeVisible();
  await page.getByRole("button",{name:"Approve reviewed audience"}).click();
  await expect(page.getByText("Approved plan only")).toBeVisible();
  await expect(page.getByText("No delivery occurred.")).toBeVisible();
  await expect(page.getByRole("button",{name:/send|schedule|queue|export/i})).toHaveCount(0);
  expect(browserProblems).toEqual([]);
});


test("command bar searches records and offers create and go-to actions", async ({ page }) => {
  await page.goto("/today");
  await page.keyboard.press("Control+k");
  const dialog=page.getByRole("dialog",{name:"Command bar"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("Mila");
  await expect(dialog.getByRole("option",{name:/Mila Hart/})).toBeVisible();
  await expect(dialog.getByRole("option",{name:"Create a new lead"})).toBeVisible();
  await expect(dialog.getByRole("option",{name:/Reports G then R/})).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/leads\/lead_001$/);
  await expect(page.getByRole("heading",{name:"Mila Hart",level:1})).toBeVisible();
  await page.keyboard.press("g"); await page.keyboard.press("c");
  await expect(page).toHaveURL(/\/client-book$/);
});

test("campaign review panel approves a plan without scheduling anything", async ({ page }) => {
  await page.goto("/campaigns");
  const panel=page.getByRole("complementary",{name:"Campaign review"});
  await expect(panel.getByText("Not scheduled")).toBeVisible();
  await panel.getByRole("button",{name:"Approve plan"}).click();
  // The reviewed-snapshot handshake may pause once if the seeded audience is stale; approving again approves the re-presented snapshot.
  const approved=panel.getByText(/Plan approved\. Nothing was sent or scheduled\./);
  if (!(await approved.isVisible())) { await expect(panel.getByText(/audience changed/i)).toBeVisible(); await panel.getByRole("button",{name:"Approve plan"}).click(); }
  await expect(approved).toBeVisible();
  await expect(page.getByRole("row",{name:/Fixed expiry SMS review/}).getByText("Approved")).toBeVisible();
  await expect(page.getByRole("button",{name:/send|schedule|queue|export/i})).toHaveCount(0);
});
