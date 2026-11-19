import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { expectedHostedProjectRef, validatedHostedDatabaseUrl } from "./hosted-project-identity.mjs";

const projectRef=process.env.SUPABASE_HOSTED_PROJECT_REF,databaseUrl=process.env.SUPABASE_HOSTED_DATABASE_URL,caPath=process.env.SUPABASE_HOSTED_CA_CERT_PATH;
if(projectRef!==expectedHostedProjectRef)throw new Error(`Hosted review verification requires SUPABASE_HOSTED_PROJECT_REF=${expectedHostedProjectRef}.`);
if(!databaseUrl||!caPath)throw new Error("Hosted review verification environment is incomplete.");
const url=validatedHostedDatabaseUrl(databaseUrl),client=new pg.Client({connectionString:url.toString(),ssl:{ca:readFileSync(caPath,"utf8"),rejectUnauthorized:true}});
const orgA="10000000-0000-0000-0000-000000000001",household="60000000-0000-0000-0000-000000000001",alex="30000000-0000-0000-0000-000000000001",dana="30000000-0000-0000-0000-000000000004",priya="30000000-0000-0000-0000-000000000006";
const commands=Array.from({length:40},(_,i)=>`4d000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`),prefix="M4D-VERIFY-";
let count=0,savepoints=0,loanId,annualId,fixedId,taskId,conversionHouseholdId,conversionLoanId;
const planned=47;
const check=async(name,fn)=>{await fn();count+=1;console.log(`ok ${count} - ${name}`);};
const expectError=async(pattern,fn)=>{const point=`expected_${++savepoints}`;await client.query(`savepoint ${point}`);try{await fn();assert.fail(`Expected ${pattern}`);}catch(error){assert.match(error instanceof Error?error.message:String(error),pattern);}finally{await client.query(`rollback to savepoint ${point}`);await client.query(`release savepoint ${point}`);}};
const setActor=async(userId,role="authenticated")=>{await client.query("reset role");await client.query(`set local role ${role}`);await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(userId?{sub:userId,role}:{role})]);};
const rpc=(sql,values)=>client.query(sql,values).then(result=>result.rows[0]?.result);

await client.connect();
try{
  console.log(`1..${planned}`);
  const users=await client.query("select id,email from auth.users where email=any($1::text[])",[["alex.morgan@example.test","priya.shah@example.test","dana.ellis@example.test","inactive.user@example.test"]]);
  const user=Object.fromEntries(users.rows.map(row=>[row.email,row.id]));assert.equal(Object.keys(user).length,4);
  await client.query("begin");

  const addLoan=(commandId,externalReference,nextReview,fixedExpiry)=>rpc("select public.add_mortgage_minimal_loan_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result",[orgA,commandId,household,externalReference,"Fictional Review Mutual","Refinance","2025-11-17",fixedExpiry,null,nextReview,"Active","Confirmed"]);
  await setActor(null,"anon");
  await check("anonymous review operation is rejected",()=>expectError(/AUTHENTICATION_REQUIRED|permission denied/i,()=>addLoan(commands[0],`${prefix}ANON`,"2026-11-20",null)));
  await setActor(user["inactive.user@example.test"]);
  await check("inactive membership is rejected",()=>expectError(/ACTIVE_ORGANISATION_MEMBERSHIP_REQUIRED/,()=>addLoan(commands[1],`${prefix}INACTIVE`,"2026-11-20",null)));
  await setActor(user["dana.ellis@example.test"]);
  await check("missing loan capability is rejected",()=>expectError(/CAPABILITY_REQUIRED:mortgage.loan-record.manage/,()=>addLoan(commands[2],`${prefix}CAP`,"2026-11-20",null)));

  await setActor(user["alex.morgan@example.test"]);
  await check("cross-organisation household is rejected",()=>expectError(/HOUSEHOLD_NOT_FOUND/,()=>rpc("select public.add_mortgage_minimal_loan_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result",[orgA,commands[3],"60000000-0000-0000-0000-000000000002",`${prefix}CROSS`,"Fictional","Purchase",null,null,null,"2026-11-20","Active","Confirmed"])));
  const businessDate=(await client.query("select (transaction_timestamp() at time zone 'Australia/Sydney')::date::text value")).rows[0].value;
  const plus=days=>new Date(`${businessDate}T00:00:00Z`).getTime()+days*86400000;
  const date=days=>new Date(plus(days)).toISOString().slice(0,10);
  const created=await addLoan(commands[4],`${prefix}PRIMARY`,date(7),date(30));loanId=created.loanRecordId;
  await check("minimal loan operation returns version one",async()=>assert.equal(created.version,1));
  await check("minimal loan persists only retention fields",async()=>{const row=(await client.query("select external_reference,lender_name,loan_purpose,version from public.mortgage_minimal_loan_records where id=$1",[loanId])).rows[0];assert.deepEqual(row,{external_reference:`${prefix}PRIMARY`,lender_name:"Fictional Review Mutual",loan_purpose:"Refinance",version:1});});
  const links=await client.query("select r.opportunity_id,r.trigger_type,r.trigger_date::text,o.lifecycle_status,o.owner_membership_id,o.version from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id and o.organisation_id=r.organisation_id where r.loan_record_id=$1 order by r.trigger_type",[loanId]);annualId=links.rows.find(row=>row.trigger_type==="Annual review").opportunity_id;fixedId=links.rows.find(row=>row.trigger_type==="Fixed-rate expiry").opportunity_id;
  await check("annual boundary at seven days is Due",async()=>assert.equal(links.rows.find(row=>row.trigger_type==="Annual review").lifecycle_status,"Due"));
  await check("fixed boundary at thirty days is Due",async()=>assert.equal(links.rows.find(row=>row.trigger_type==="Fixed-rate expiry").lifecycle_status,"Due"));
  await check("generated opportunities start unassigned",async()=>assert.ok(links.rows.every(row=>row.owner_membership_id===null)));
  await check("business-key generation creates one row per trigger",async()=>assert.equal(links.rowCount,2));
  const retry=await addLoan(commands[4],`${prefix}PRIMARY`,date(7),date(30));
  await check("same command retry is idempotent",async()=>assert.deepEqual(retry,created));
  await check("idempotent retry creates no duplicate loan",async()=>assert.equal((await client.query("select count(*)::int count from public.mortgage_minimal_loan_records where external_reference=$1",[`${prefix}PRIMARY`])).rows[0].count,1));
  await check("same command with changed input is rejected",()=>expectError(/COMMAND_ID_REUSE_CONFLICT/,()=>addLoan(commands[4],`${prefix}CHANGED`,date(8),null)));

  const annualUpcoming=await addLoan(commands[5],`${prefix}ANNUAL30`,date(30),null),annualHidden=await addLoan(commands[6],`${prefix}ANNUAL31`,date(31),null),fixedUpcoming=await addLoan(commands[7],`${prefix}FIXED90`,null,date(90)),fixedHidden=await addLoan(commands[8],`${prefix}FIXED91`,null,date(91));
  await check("annual day thirty is generated Upcoming",async()=>{const row=(await client.query("select o.lifecycle_status from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id where r.loan_record_id=$1",[annualUpcoming.loanRecordId])).rows[0];assert.equal(row.lifecycle_status,"Upcoming");});
  await check("annual day thirty-one is outside the generation window",async()=>assert.equal((await client.query("select count(*)::int count from public.mortgage_review_opportunities where loan_record_id=$1",[annualHidden.loanRecordId])).rows[0].count,0));
  await check("fixed day ninety is generated Upcoming",async()=>{const row=(await client.query("select o.lifecycle_status from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id where r.loan_record_id=$1",[fixedUpcoming.loanRecordId])).rows[0];assert.equal(row.lifecycle_status,"Upcoming");});
  await check("fixed day ninety-one is outside the generation window",async()=>assert.equal((await client.query("select count(*)::int count from public.mortgage_review_opportunities where loan_record_id=$1",[fixedHidden.loanRecordId])).rows[0].count,0));
  await check("Today read returns the Sydney business date",async()=>{const today=await rpc("select public.read_mortgage_retention_today($1,$2) result",[orgA,25]);assert.equal(today.businessDate,businessDate);});
  await check("Today totals are not truncated by bounded queues",async()=>{const today=await rpc("select public.read_mortgage_retention_today($1,$2) result",[orgA,1]);assert.ok(today.annualDueTotal>=1);assert.equal(today.annualDue.length,1);});

  await check("stale loan version is rejected",()=>expectError(/STALE_LOAN_VERSION/,()=>rpc("select public.update_mortgage_loan_review_dates($1,$2,$3,$4,$5,$6,$7) result",[orgA,commands[9],loanId,99,date(8),date(30),null])));
  const updated=await rpc("select public.update_mortgage_loan_review_dates($1,$2,$3,$4,$5,$6,$7) result",[orgA,commands[10],loanId,1,date(8),date(30),date(-10)]);
  await check("loan-date update increments version",async()=>assert.equal(updated.version,2));
  await check("superseded annual opportunity is dismissed with the fixed reason",async()=>{const row=(await client.query("select lifecycle_status,dismissal_reason from public.opportunities where id=$1",[annualId])).rows[0];assert.deepEqual(row,{lifecycle_status:"Dismissed",dismissal_reason:"Superseded by loan trigger-date update"});});
  const replacement=(await client.query("select r.opportunity_id,o.owner_membership_id from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id where r.loan_record_id=$1 and r.trigger_type='Annual review' and r.trigger_date=$2",[loanId,date(8)])).rows[0];annualId=replacement.opportunity_id;
  await check("replacement opportunity is generated unassigned",async()=>assert.equal(replacement.owner_membership_id,null));
  await check("unchanged fixed trigger is not duplicated",async()=>assert.equal((await client.query("select count(*)::int count from public.mortgage_review_opportunities where loan_record_id=$1 and trigger_type='Fixed-rate expiry'",[loanId])).rows[0].count,1));

  const claimed=await rpc("select public.claim_mortgage_review_opportunity($1,$2,$3,$4) result",[orgA,commands[11],annualId,1]);
  await check("claim assigns the actor and increments version",async()=>{assert.equal(claimed.ownerMembershipId,alex);assert.equal(claimed.version,2);});
  await check("claim race rejects a stale second claimant",()=>expectError(/STALE_OPPORTUNITY_VERSION|OPPORTUNITY_ALREADY_ASSIGNED/,()=>rpc("select public.claim_mortgage_review_opportunity($1,$2,$3,$4) result",[orgA,commands[12],annualId,1])));
  await check("non-Broker assignment target is rejected",()=>expectError(/ACTIVE_BROKER_ASSIGNEE_REQUIRED/,()=>rpc("select public.assign_mortgage_review_opportunity($1,$2,$3,$4,$5) result",[orgA,commands[13],annualId,2,alex])));
  const assigned=await rpc("select public.assign_mortgage_review_opportunity($1,$2,$3,$4,$5) result",[orgA,commands[14],annualId,2,dana]);
  await check("assignment accepts an active same-organisation Broker",async()=>{assert.equal(assigned.ownerMembershipId,dana);assert.equal(assigned.version,3);});
  await check("cross-organisation Broker assignment is rejected",()=>expectError(/ACTIVE_BROKER_ASSIGNEE_REQUIRED/,()=>rpc("select public.assign_mortgage_review_opportunity($1,$2,$3,$4,$5) result",[orgA,commands[15],annualId,3,"30000000-0000-0000-0000-000000000002"])));

  await check("dismissal requires a non-empty reason",()=>expectError(/DISMISSAL_REASON_REQUIRED/,()=>rpc("select public.transition_mortgage_review_opportunity($1,$2,$3,$4,$5,$6) result",[orgA,commands[16],annualId,3,"Dismissed",""])));
  const dismissed=await rpc("select public.transition_mortgage_review_opportunity($1,$2,$3,$4,$5,$6) result",[orgA,commands[17],annualId,3,"Dismissed","Fictional verification reason"]);
  await check("dismiss records workflow state and increments version",async()=>{assert.equal(dismissed.status,"Dismissed");assert.equal(dismissed.version,4);});
  const reopened=await rpc("select public.transition_mortgage_review_opportunity($1,$2,$3,$4,$5,$6) result",[orgA,commands[18],annualId,4,"Reopen",null]);
  await check("reopen clears dismissal metadata and restores effective open state",async()=>{const row=(await client.query("select lifecycle_status,dismissal_reason,completed_at from public.opportunities where id=$1",[annualId])).rows[0];assert.equal(reopened.version,5);assert.equal(row.dismissal_reason,null);assert.equal(row.completed_at,null);assert.ok(["Upcoming","Due","Overdue"].includes(row.lifecycle_status));});
  const booked=await rpc("select public.transition_mortgage_review_opportunity($1,$2,$3,$4,$5,$6) result",[orgA,commands[19],annualId,5,"Review booked",null]);
  await check("Review booked persists workflow state without an appointment",async()=>{assert.equal(booked.status,"Review booked");assert.equal((await client.query("select count(*)::int count from public.appointments where lead_id is null")).rows[0].count,0);});
  await check("booked review blocks a changed loan trigger date",()=>expectError(/REVIEW_BOOKED_DATE_CHANGE_BLOCKED/,()=>rpc("select public.update_mortgage_loan_review_dates($1,$2,$3,$4,$5,$6,$7) result",[orgA,commands[20],loanId,2,date(9),date(30),date(-10)])));
  const completed=await rpc("select public.transition_mortgage_review_opportunity($1,$2,$3,$4,$5,$6) result",[orgA,commands[21],annualId,6,"Completed",null]);
  await check("completion records completed_at",async()=>{assert.equal(completed.status,"Completed");assert.ok((await client.query("select completed_at is not null completed from public.opportunities where id=$1",[annualId])).rows[0].completed);});
  await check("completed opportunities are terminal",()=>expectError(/COMPLETED_OPPORTUNITY_TERMINAL/,()=>rpc("select public.transition_mortgage_review_opportunity($1,$2,$3,$4,$5,$6) result",[orgA,commands[22],annualId,7,"Dismissed","not allowed"])));

  await client.query("reset role");
  await client.query("insert into public.membership_capabilities(organisation_id,membership_id,capability) select $1,$2,value from unnest(array['mortgage.loan-record.manage','mortgage.review-opportunity.manage','mortgage.household.update','task.create']) value on conflict do nothing",[orgA,priya]);
  await setActor(user["priya.shah@example.test"]);
  await check("non-owner loan mutation is rejected",()=>expectError(/HOUSEHOLD_OWNERSHIP_REQUIRED/,()=>addLoan(commands[23],`${prefix}NONOWNER`,date(5),null)));
  await check("non-owner opportunity mutation is rejected",()=>expectError(/OPPORTUNITY_OWNERSHIP_REQUIRED/,()=>rpc("select public.transition_mortgage_review_opportunity($1,$2,$3,$4,$5,$6) result",[orgA,commands[24],fixedId,1,"Dismissed","not owner"])));
  await check("non-owner household task is rejected",()=>expectError(/HOUSEHOLD_OWNERSHIP_REQUIRED/,()=>rpc("select public.create_mortgage_household_task($1,$2,$3,$4,$5,$6,$7) result",[orgA,commands[25],household,"Fictional non-owner task",new Date(plus(2)).toISOString(),"Normal",priya])));

  await setActor(user["alex.morgan@example.test"]);
  const task=await rpc("select public.create_mortgage_household_task($1,$2,$3,$4,$5,$6,$7) result",[orgA,commands[26],household,"Fictional review follow-up",new Date(plus(2)).toISOString(),"High",dana]);taskId=task.taskId;
  await check("household task is created for an active same-organisation assignee",async()=>assert.equal((await client.query("select count(*)::int count from public.tasks where id=$1 and household_id=$2 and priority='High'",[taskId,household])).rows[0].count,1));
  await check("cross-organisation task assignee is rejected",()=>expectError(/ACTIVE_TASK_ASSIGNEE_REQUIRED/,()=>rpc("select public.create_mortgage_household_task($1,$2,$3,$4,$5,$6,$7) result",[orgA,commands[27],household,"Cross tenant",new Date(plus(2)).toISOString(),"Normal","30000000-0000-0000-0000-000000000002"])));
  await check("required structured audit events are present",async()=>{const rows=await client.query("select distinct event_type from public.activity_events where entity_id=$1 and event_type=any($2::text[])",[household,["loan.created","loan.review_dates_changed","opportunity.generated","opportunity.superseded","opportunity.claimed","opportunity.assigned","opportunity.status_changed","task.created"]]);assert.equal(rows.rowCount,8);});

  const conversion=await rpc("select public.convert_mortgage_lead_to_household($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) result",[orgA,commands[28],"50000000-0000-0000-0000-000000000001",1,"create-new","4D conversion verification",alex,null,null,null,null,null,null,null,null,null,`${prefix}CONVERSION`,"Fictional Conversion Mutual","Refinance",date(-365),null,null,date(5),"Active","Unverified"]);conversionHouseholdId=conversion.householdId;conversionLoanId=conversion.loanRecordId;
  await check("conversion regression uses the shared generator",async()=>assert.equal((await client.query("select count(*)::int count from public.mortgage_review_opportunities where loan_record_id=$1",[conversionLoanId])).rows[0].count,1));
  await check("conversion-generated opportunity starts unassigned",async()=>assert.equal((await client.query("select o.owner_membership_id from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id where r.loan_record_id=$1",[conversionLoanId])).rows[0].owner_membership_id,null));

  await client.query("rollback");
  await check("transaction rollback removes verification loans",async()=>assert.equal((await client.query("select count(*)::int count from public.mortgage_minimal_loan_records where external_reference like $1",[`${prefix}%`])).rows[0].count,0));
  await check("transaction rollback removes review opportunities",async()=>assert.equal((await client.query("select count(*)::int count from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id where o.subject_id=$1 or r.loan_record_id=$2",[conversionHouseholdId,loanId])).rows[0].count,0));
  await check("transaction rollback removes commands tasks and activity",async()=>{assert.equal((await client.query("select count(*)::int count from public.operation_commands where command_id=any($1::uuid[])",[commands])).rows[0].count,0);assert.equal((await client.query("select count(*)::int count from public.tasks where id=$1",[taskId])).rows[0].count,0);assert.equal((await client.query("select count(*)::int count from public.activity_events where details->>'loanRecordId' in ($1,$2)",[loanId,conversionLoanId])).rows[0].count,0);});
  assert.equal(count,planned);console.log(`# ${count} hosted review-operation assertions passed; transaction rolled back with zero residue.`);
}catch(error){try{await client.query("rollback");}catch{}console.error(`# hosted review verification failed after ${count} assertions: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}finally{await client.end();}
