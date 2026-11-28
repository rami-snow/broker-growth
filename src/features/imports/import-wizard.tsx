"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/page-title";
import { Badge, Button, Card, Select, Table, TextArea, type BadgeTone } from "@/components/ui";
import { MAX_IMPORT_ROWS, parseCsv } from "@/verticals/mortgage/imports/csv";
import { autoMapColumns, ignoredColumns, importFields, importKinds, importSummary, readImportRows, type ColumnMapping, type ImportKind, type ImportPlanItem, type ImportRecord, type ImportRowError } from "@/verticals/mortgage/imports/model";
import type { ImportResultItem, ImportScreenPort, ImportScreenSetup } from "@/verticals/mortgage/repositories/import-port";

const listPath: Record<ImportKind, { href: string; label: string }> = { leads: { href: "/leads", label: "Go to Leads" }, clients: { href: "/client-book", label: "Go to Clients" }, partners: { href: "/referral-partners", label: "Go to Partners" } };
const planLabel = (item: ImportPlanItem): [string, BadgeTone] => item.status === "new" ? ["Will be created", "success"] : item.status === "exists" ? [`Already exists (matched on ${item.matchedOn})`, "neutral"] : [`Repeats line ${item.firstRows.join(", ")}`, "warning"];
const outcomeLabel: Record<ImportResultItem["outcome"], [string, BadgeTone]> = { created: ["Created", "success"], exists: ["Already existed", "neutral"], repeated: ["Repeated in file", "warning"], failed: ["Not imported", "danger"] };
const lines = (rows: number[]) => rows.length > 1 ? `${rows[0]}–${rows.at(-1)}` : String(rows[0]);
const newCommandId = () => crypto.randomUUID();

type Source = { name: string; headers: string[]; rows: string[][] };
type Step = { name: "choose" } | { name: "map" } | { name: "preview"; plan: ImportPlanItem[]; errors: ImportRowError[]; commandId: string } | { name: "done"; results: ImportResultItem[]; errors: ImportRowError[] };

/**
 * CSV import, shared by both runtimes. The file is read in the browser and never uploaded or stored: only the
 * parsed records the person confirms are sent to the guarded import operation, which matches on email or phone.
 */
export function ImportWizard({ setup, port, initialKind }: { setup: ImportScreenSetup; port: ImportScreenPort; initialKind?: ImportKind }) {
  const kinds = importKinds.filter(item => setup.allowedKinds.includes(item.value));
  const [kind, setKind] = useState<ImportKind | undefined>(kinds.some(item => item.value === initialKind) ? initialKind : kinds[0]?.value);
  const [source, setSource] = useState<Source>(), [pasted, setPasted] = useState(""), [mapping, setMapping] = useState<ColumnMapping>({});
  const brokers = setup.owners.filter(owner => owner.isBroker);
  const [defaultOwner, setDefaultOwner] = useState(brokers.some(owner => owner.id === setup.currentMembershipId) ? setup.currentMembershipId : "");
  const [step, setStep] = useState<Step>({ name: "choose" }), [problem, setProblem] = useState<string>(), [busy, setBusy] = useState(false);
  const ignored = useMemo(() => source ? ignoredColumns(source.headers, mapping) : [], [source, mapping]);

  if (!kind) return <><PageTitle title="Import CSV"/><section className="card card__body"><h2>Import unavailable</h2><p className="muted">Your position does not include creating leads, clients or referral partners.</p><Link href="/today">Return to Today</Link></section></>;
  const fields = importFields[kind];

  const load = (name: string, text: string) => {
    try { const parsed = parseCsv(text); setSource({ name, ...parsed }); setMapping(autoMapColumns(kind, parsed.headers)); setProblem(undefined); setStep({ name: "map" }); }
    catch (cause) { setProblem(cause instanceof Error ? cause.message : "The file could not be read."); }
  };
  const readFile = async (file: File | undefined) => { if (file) load(file.name, await file.text()); };
  const restart = () => { setSource(undefined); setPasted(""); setStep({ name: "choose" }); setProblem(undefined); };
  const missingRequired = fields.filter(field => field.required && mapping[field.key] === undefined);

  const preview = async () => {
    if (!source) return;
    setBusy(true); setProblem(undefined);
    try {
      const { records, errors } = readImportRows(kind, source.rows, mapping, setup.owners, defaultOwner || undefined);
      const plan = records.length ? await port.preview(kind, records) : [];
      setStep({ name: "preview", plan, errors, commandId: newCommandId() });
    } catch (cause) { setProblem(cause instanceof Error ? cause.message : "The preview could not be prepared."); }
    finally { setBusy(false); }
  };
  const run = async () => {
    if (step.name !== "preview") return;
    setBusy(true); setProblem(undefined);
    try {
      // The same command id is reused if this is retried, so a retry never imports twice.
      const results = await port.run(kind, step.commandId, step.plan.map(item => item.record) as ImportRecord[]);
      setStep({ name: "done", results, errors: step.errors });
    } catch (cause) { setProblem(cause instanceof Error ? cause.message : "The import could not be completed."); }
    finally { setBusy(false); }
  };

  return <>
    <PageTitle title="Import CSV" body="Bring in leads, clients and households, or referral partners from any CRM export."/>
    <div className="stack import-wizard">
      <ol className="import-steps" aria-label="Import steps">{["Choose file", "Match columns", "Preview", "Results"].map((label, index) => <li key={label} aria-current={["choose", "map", "preview", "done"].indexOf(step.name) === index ? "step" : undefined}>{label}</li>)}</ol>
      {problem && <p className="notice notice--danger" role="alert">{problem}</p>}

      {step.name === "choose" && <Card title="Choose what to import">
        <div className="card__body stack">
          <fieldset className="import-kinds"><legend className="ui-field__label">Import</legend>
            {kinds.map(item => <label key={item.value}><input type="radio" name="kind" value={item.value} checked={kind === item.value} onChange={() => setKind(item.value)}/>{item.label}</label>)}
          </fieldset>
          <p className="muted">Columns: {fields.map(field => field.label + (field.required ? " (required)" : "")).join(", ")}. {kind === "clients" ? "Rows with the same Household are grouped; the first person is the primary applicant unless a Relationship column says otherwise." : ""} Loan balances, rates and amounts are never imported.</p>
          <label className="ui-field" htmlFor="import-file"><span className="ui-field__label">CSV file</span><input id="import-file" type="file" accept=".csv,text/csv" onChange={event => void readFile(event.target.files?.[0])}/></label>
          <TextArea label="Or paste CSV text" rows={5} value={pasted} onChange={event => setPasted(event.target.value)} placeholder="First name,Last name,Email"/>
          <div className="inline-actions"><Button variant="secondary" disabled={!pasted.trim()} onClick={() => load("Pasted text", pasted)}>Use pasted text</Button></div>
          <p className="muted">The file is read in your browser and is not uploaded or kept. Up to {MAX_IMPORT_ROWS} rows at a time. Nothing is sent, scheduled or exported.</p>
        </div>
      </Card>}

      {step.name === "map" && source && <Card title="Match columns" meta={`${source.name} · ${source.rows.length} ${source.rows.length === 1 ? "row" : "rows"}`}>
        <div className="card__body stack">
          <div className="form-grid">{fields.map(field => <Select key={field.key} label={field.label + (field.required ? " *" : "")} value={mapping[field.key] === undefined ? "" : String(mapping[field.key])}
            onChange={event => setMapping(current => ({ ...current, [field.key]: event.target.value === "" ? undefined : Number(event.target.value) }))}
            options={[{ value: "", label: "Not imported" }, ...source.headers.map((header, index) => ({ value: String(index), label: header || `Column ${index + 1}` }))]}/>)}</div>
          {kind !== "leads" || mapping.owner === undefined ? <Select label={kind === "leads" ? "Owner when the file has none" : "Owner when the file has none (Broker)"} value={defaultOwner} onChange={event => setDefaultOwner(event.target.value)}
            options={[{ value: "", label: kind === "leads" ? "Unassigned" : "Choose a broker" }, ...brokers.map(owner => ({ value: owner.id, label: owner.name }))]}/> : null}
          {ignored.length > 0 && <div><h3>Columns not imported</h3><ul className="bullets">{ignored.map(item => <li key={item.header}>{item.header}: {item.reason}</li>)}</ul></div>}
          {missingRequired.length > 0 && <p className="muted" role="status">Match {missingRequired.map(field => field.label).join(" and ")} to continue.</p>}
          <div className="inline-actions"><Button variant="secondary" onClick={restart}>Choose another file</Button><Button disabled={busy || missingRequired.length > 0} onClick={() => void preview()}>{busy ? "Checking…" : "Preview import"}</Button></div>
        </div>
      </Card>}

      {step.name === "preview" && <PreviewStep plan={step.plan} errors={step.errors} busy={busy} onBack={() => setStep({ name: "map" })} onImport={() => void run()}/>}

      {step.name === "done" && <ResultsStep results={step.results} errors={step.errors} next={listPath[kind]} onRestart={restart}/>}
    </div>
  </>;
}

function PreviewStep({ plan, errors, busy, onBack, onImport }: { plan: ImportPlanItem[]; errors: ImportRowError[]; busy: boolean; onBack: () => void; onImport: () => void }) {
  const summary = importSummary(plan, errors);
  return <Card title="Preview" meta={`${summary.create} to create · ${summary.existing} already exist · ${summary.repeated} repeated · ${summary.errors} with errors`}>
    <div className="card__body stack">
      <p className="muted">Records are matched on email or phone{plan.some(item => item.record.kind === "partners") ? " (partners with neither: name and organisation)" : ""}. Existing records are left unchanged. Consent is recorded as Not recorded; it is never inferred from a file.</p>
      <Table aria-label="Import preview"><thead><tr><th scope="col">Line</th><th scope="col">Record</th><th scope="col">Result</th><th scope="col">Note</th></tr></thead>
        <tbody>
          {errors.map(error => <tr key={`e${error.rows.join()}`}><td>{lines(error.rows)}</td><td>{error.label}</td><td><Badge tone="danger">Error</Badge></td><td>{error.message}</td></tr>)}
          {plan.map(item => { const [label, tone] = planLabel(item); return <tr key={item.record.rows.join()}><td>{lines(item.record.rows)}</td><td>{item.record.label}</td><td><Badge tone={tone}>{label}</Badge></td><td className="muted">{item.status === "new" ? item.note ?? "" : ""}</td></tr>; })}
        </tbody></Table>
      <div className="inline-actions"><Button variant="secondary" onClick={onBack}>Back to columns</Button><Button disabled={busy || summary.create === 0} onClick={onImport}>{busy ? "Importing…" : `Import ${summary.create} ${summary.create === 1 ? "record" : "records"}`}</Button></div>
    </div>
  </Card>;
}

function ResultsStep({ results, errors, next, onRestart }: { results: ImportResultItem[]; errors: ImportRowError[]; next: { href: string; label: string }; onRestart: () => void }) {
  const count = (outcome: ImportResultItem["outcome"]) => results.filter(item => item.outcome === outcome).length;
  return <Card title="Import complete" meta={`${count("created")} created · ${count("exists")} already existed · ${count("repeated")} repeated · ${count("failed") + errors.length} not imported`}>
    <div className="card__body stack">
      <p className="muted">Each created record appears in the audit log with the actor “import”. Running this file again creates nothing new.</p>
      <Table aria-label="Import results"><thead><tr><th scope="col">Line</th><th scope="col">Record</th><th scope="col">Outcome</th><th scope="col">Detail</th></tr></thead>
        <tbody>
          {results.map(item => { const [label, tone] = outcomeLabel[item.outcome]; return <tr key={item.rows.join()}><td>{lines(item.rows)}</td><td>{item.label}</td><td><Badge tone={tone}>{label}</Badge></td><td className="muted">{item.detail ?? ""}</td></tr>; })}
          {errors.map(error => <tr key={`e${error.rows.join()}`}><td>{lines(error.rows)}</td><td>{error.label}</td><td><Badge tone="danger">Not imported</Badge></td><td className="muted">{error.message}</td></tr>)}
        </tbody></Table>
      <div className="inline-actions"><Button variant="secondary" onClick={onRestart}>Import another file</Button><Link className="ui-button ui-button--primary" href={next.href}>{next.label}</Link></div>
    </div>
  </Card>;
}
