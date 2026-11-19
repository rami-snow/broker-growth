import { describe, expect, it } from "vitest";
import { selectCurrentHouseholdConsent, SupabaseClientBookRepository } from "@/verticals/mortgage/persistence/supabase-client-book-repository";

describe("persistent household consent projection", () => {
  it("selects current-effective evidence independently for each member and channel", () => {
    const referenceTime = new Date("2026-11-17T00:00:00Z");
    const consent = selectCurrentHouseholdConsent([
      { id:"10000000-0000-0000-0000-000000000001",contact_id:"contact-a",channel:"Email",status:"Recorded",source:"Fictional import",effective_at:"2026-11-01T00:00:00Z",recorded_at:"2026-11-01T00:00:00Z" },
      { id:"10000000-0000-0000-0000-000000000002",contact_id:"contact-a",channel:"Email",status:"Opted out",source:"Future fictional update",effective_at:"2026-11-18T00:00:00Z",recorded_at:"2026-11-16T00:00:00Z" },
      { id:"20000000-0000-0000-0000-000000000001",contact_id:"contact-b",channel:"Email",status:"Opted out",source:"Fictional import",effective_at:"2026-11-02T00:00:00Z",recorded_at:"2026-11-02T00:00:00Z" },
      { id:"20000000-0000-0000-0000-000000000002",contact_id:"contact-b",channel:"Email",status:"Recorded",source:"Future fictional re-consent",effective_at:"2026-11-19T00:00:00Z",recorded_at:"2026-11-16T00:00:00Z" },
    ], [
      { contactId:"contact-a",contactName:"Avery Fiction" },
      { contactId:"contact-b",contactName:"Blair Fiction" },
    ], referenceTime);

    expect(consent).toHaveLength(6);
    expect(consent.find(item => item.contactId === "contact-a" && item.channel === "Email")).toMatchObject({ contactName:"Avery Fiction",status:"Recorded",evidenceId:"10000000-0000-0000-0000-000000000001" });
    expect(consent.find(item => item.contactId === "contact-b" && item.channel === "Email")).toMatchObject({ contactName:"Blair Fiction",status:"Opted out",evidenceId:"20000000-0000-0000-0000-000000000001" });
    expect(consent.filter(item => item.status === "Missing")).toHaveLength(4);
  });

  it("uses recorded time and immutable ID to break equal effective-time ties", () => {
    const selected = selectCurrentHouseholdConsent([
      { id:"30000000-0000-0000-0000-000000000001",contact_id:"contact-a",channel:"Phone",status:"Recorded",source:"Earlier",effective_at:"2026-11-01T00:00:00Z",recorded_at:"2026-11-02T00:00:00Z" },
      { id:"30000000-0000-0000-0000-000000000002",contact_id:"contact-a",channel:"Phone",status:"Opted out",source:"Later ID",effective_at:"2026-11-01T00:00:00Z",recorded_at:"2026-11-03T00:00:00Z" },
      { id:"30000000-0000-0000-0000-000000000003",contact_id:"contact-a",channel:"Phone",status:"Recorded",source:"Highest ID",effective_at:"2026-11-01T00:00:00Z",recorded_at:"2026-11-03T00:00:00Z" },
    ], [{ contactId:"contact-a",contactName:"Avery Fiction" }], new Date("2026-11-17T00:00:00Z"));

    expect(selected.find(item => item.channel === "Phone")).toMatchObject({ status:"Recorded",evidenceId:"30000000-0000-0000-0000-000000000003" });
  });
});

describe("persistent retention adapter",()=>{
  it("maps bounded Today queues and preserves exact totals",async()=>{
    const client={rpc:async()=>({error:null,data:{businessDate:"2026-11-17",annualDueTotal:31,fixedApproachingTotal:42,unassignedTotal:19,annualDue:[{opportunityId:"10000000-0000-0000-0000-000000000001",householdId:"20000000-0000-0000-0000-000000000001",householdName:"Fiction household",triggerType:"Annual review",triggerDate:"2026-11-18",effectiveStatus:"Due",ownerMembershipId:null,ownerName:null,version:2}],fixedApproaching:[],unassigned:[]}})};
    const result=await new SupabaseClientBookRepository(client as never).retentionToday({organisationId:"org" as never,userId:"user" as never});
    expect(result).toMatchObject({businessDate:"2026-11-17",annualDueTotal:31,fixedApproachingTotal:42,unassignedTotal:19});
    expect(result.annualDue[0]).toMatchObject({householdName:"Fiction household",effectiveStatus:"Due",version:2});
  });

  it("sends expected versions and tenant-scoped commands to narrow RPCs",async()=>{
    const calls:Array<{name:string;args:Record<string,unknown>}>=[],client={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null,data:{version:4}};}};
    const repository=new SupabaseClientBookRepository(client as never),context={organisationId:"org-a" as never,userId:"user-a" as never};
    await repository.updateLoanDates(context,{commandId:"command",loanRecordId:"loan",expectedVersion:3,nextReviewDate:"2026-11-20"});
    await repository.claimOpportunity(context,{commandId:"claim",opportunityId:"opportunity",expectedVersion:7});
    expect(calls).toEqual([
      {name:"update_mortgage_loan_review_dates",args:expect.objectContaining({organisation_id:"org-a",command_id:"command",loan_record_id:"loan",expected_version:3,next_review_date:"2026-11-20"})},
      {name:"claim_mortgage_review_opportunity",args:expect.objectContaining({organisation_id:"org-a",command_id:"claim",opportunity_id:"opportunity",expected_version:7})},
    ]);
  });

  it("omits caller-controlled provenance from manual loan creation",async()=>{
    const calls:Array<{name:string;args:Record<string,unknown>}>=[],client={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null,data:{version:1}};}};
    const repository=new SupabaseClientBookRepository(client as never);
    await repository.addLoan({organisationId:"org-a" as never,userId:"user-a" as never},{commandId:"command",householdId:"household",lenderName:"Fictional Mutual",loanPurpose:"Construction loan",status:"Active",dataConfidence:"Confirmed"});
    expect(calls[0]).toEqual({name:"add_mortgage_minimal_loan_record",args:expect.objectContaining({loan_purpose:"Construction loan"})});
    expect(calls[0].args).not.toHaveProperty("source");
  });

  it("maps manual duplicate context without truncating structured reasons",async()=>{
    const client={rpc:async()=>({error:null,data:[{contact_id:"contact-a",contact_name:"Avery Fiction",email:"avery@example.test",phone:"0400000000",reasons:["exact_email","normalized_full_name"],households:[{householdId:"household-a",householdName:"Fiction household",householdStatus:"Active",relationship:"Primary applicant",isPrimary:true}]}]})};
    const repository=new SupabaseClientBookRepository(client as never);
    const result=await repository.previewManualDuplicates({organisationId:"org-a" as never,userId:"user-a" as never},{firstName:"Avery",lastName:"Fiction",email:"avery@example.test"});
    expect(result).toEqual([{contactId:"contact-a",contactName:"Avery Fiction",email:"avery@example.test",phone:"0400000000",reasons:["exact_email","normalized_full_name"],householdId:"household-a",householdName:"Fiction household",households:[{householdId:"household-a",householdName:"Fiction household",householdStatus:"Active",relationship:"Primary applicant",isPrimary:true}]}]);
  });

  it("sends versions, canonical modes and tenant-scoped command IDs to maintenance RPCs",async()=>{
    const calls:Array<{name:string;args:Record<string,unknown>}>=[],client={rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{error:null,data:{version:2}};}};
    const repository=new SupabaseClientBookRepository(client as never),context={organisationId:"org-a" as never,userId:"user-a" as never};
    await repository.createManualHousehold(context,{commandId:"command-create",displayName:"Fiction household",ownerMembershipId:"broker-a",primary:{firstName:"Avery",lastName:"Fiction",email:"avery@example.test",preferredContactMethod:"Email"},joint:{existingContactId:"contact-b",relationship:"Joint applicant"}});
    await repository.updateHouseholdDetails(context,{commandId:"command-details",householdId:"household-a",expectedVersion:3,displayName:"Updated fiction",referralPartnerId:"referral-a"});
    await repository.updatePrimaryContact(context,{commandId:"command-contact",householdId:"household-a",expectedHouseholdVersion:4,expectedContactVersion:2,email:"new@example.test",preferredContactMethod:"Email"});
    await repository.addHouseholdMember(context,{commandId:"command-member",householdId:"household-a",expectedHouseholdVersion:4,existingContactId:"contact-c",relationship:"Other"});
    await repository.transitionHouseholdTask(context,{commandId:"command-task",taskId:"task-a",expectedVersion:1,targetStatus:"Completed"});
    expect(calls).toEqual([
      {name:"create_mortgage_household_manual",args:expect.objectContaining({organisation_id:"org-a",command_id:"command-create",joint_mode:"existing",primary_name_match_acknowledged:false})},
      {name:"update_mortgage_household_details",args:expect.objectContaining({expected_version:3,referral_partner_id:"referral-a"})},
      {name:"update_mortgage_primary_contact",args:expect.objectContaining({expected_household_version:4,expected_contact_version:2})},
      {name:"add_mortgage_household_member",args:expect.objectContaining({member_mode:"existing",existing_contact_id:"contact-c"})},
      {name:"transition_mortgage_household_task",args:expect.objectContaining({expected_version:1,target_status:"Completed"})},
    ]);
  });
});
