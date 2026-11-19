import {describe,expect,it} from "vitest";
import {SupabaseReferralPartnerRepository} from "./supabase-referral-partner-repository";
import type {TenantContext} from "@/platform/core/models";

const context={organisationId:"10000000-0000-0000-0000-000000000001",membershipId:"30000000-0000-0000-0000-000000000001",userId:"20000000-0000-0000-0000-000000000001"} as TenantContext;

describe("SupabaseReferralPartnerRepository list",()=>{
  it("applies tenant-scoped server filters, deterministic sorting and page ranges without select star",async()=>{
    const calls:Array<{table:string;method:string;args:unknown[]}>=[];
    const responses:Record<string,{data:unknown[];error:null;count?:number}>={
      mortgage_referral_partners:{data:[{id:"partner-a",name:"Fictional Partner",organisation_name:"Example Advisory",partner_type:"Accountant",email:"partner@example.test",phone:"0499 000 123",owner_membership_id:"member-a",status:"Active",version:1,created_at:"2026-11-18T00:00:00Z",updated_at:"2026-11-18T00:00:00Z"}],error:null,count:26},
      organisation_memberships:{data:[{id:"member-a",display_name:"Alex Example"}],error:null},
      mortgage_membership_profiles:{data:[{membership_id:"member-a"}],error:null},
    };
    const client={from(table:string){const builder={
      select(...args:unknown[]){calls.push({table,method:"select",args});return builder;},
      eq(...args:unknown[]){calls.push({table,method:"eq",args});return builder;},
      or(...args:unknown[]){calls.push({table,method:"or",args});return builder;},
      order(...args:unknown[]){calls.push({table,method:"order",args});return builder;},
      range(...args:unknown[]){calls.push({table,method:"range",args});return Promise.resolve(responses[table]);},
      in(...args:unknown[]){calls.push({table,method:"in",args});return Promise.resolve(responses[table]);},
      then(resolve:(value:unknown)=>void){return Promise.resolve(responses[table]).then(resolve);},
    };return builder;}};
    const snapshot=await new SupabaseReferralPartnerRepository(client as never).list(context,{search:"Partner 0499",status:"Active",type:"Accountant",ownerMembershipId:"member-a",sort:"recent",page:2});
    expect(snapshot).toMatchObject({total:26,page:2,pageSize:25});
    expect(calls).toContainEqual({table:"mortgage_referral_partners",method:"range",args:[25,49]});
    expect(calls).toContainEqual({table:"mortgage_referral_partners",method:"eq",args:["organisation_id",context.organisationId]});
    expect(calls).toContainEqual({table:"mortgage_referral_partners",method:"eq",args:["status","Active"]});
    expect(calls).toContainEqual({table:"mortgage_referral_partners",method:"eq",args:["partner_type","Accountant"]});
    expect(calls).toContainEqual({table:"mortgage_referral_partners",method:"eq",args:["owner_membership_id","member-a"]});
    expect(String(calls.find(call=>call.table==="mortgage_referral_partners"&&call.method==="or")?.args[0])).toContain("phone_normalized.ilike.%0499%");
    expect(calls.filter(call=>call.table==="mortgage_referral_partners"&&call.method==="order").map(call=>call.args[0])).toEqual(["created_at","id"]);
    expect(calls.filter(call=>call.method==="select").every(call=>call.args[0]!=="*")).toBe(true);
  });
});
