"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { useUrlParam } from "@/components/use-url-param";
import { useZonedFormat } from "@/components/time-zone";
import { rateTypes, type RateType } from "@/verticals/mortgage/loans/models";
import { HOUSEHOLD_NOTE_MAX_LENGTH } from "@/verticals/mortgage/households/models";
import { NEXT_STEP_MAX_LENGTH } from "@/verticals/mortgage/referrals/models";

type SaveResult = Promise<string | undefined> | string | undefined;

/** Household notes (4F.3 d). Shared by both runtimes; opening the household with ?action=note focuses the composer. */
export function HouseholdNotesPanel({ notes, canAdd, onAdd }: { notes: Array<{ id: string; body: string; authorName?: string; createdAt: string }>; canAdd: boolean; onAdd: (body: string) => SaveResult }) {
  const { dateTime } = useZonedFormat();
  const [body, setBody] = useState(""), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null), requested = useUrlParam("action") === "note";
  useEffect(() => { if (requested && canAdd) field.current?.focus(); }, [requested, canAdd]);
  const save = async () => { if (!body.trim()) { setError("Write a note first."); return; } setSaving(true); const failure = await onAdd(body); setSaving(false); if (failure) setError(failure); else { setBody(""); setError(""); } };
  return <section className="surface" aria-labelledby="household-notes-heading">
    <h2 id="household-notes-heading">Notes</h2>
    {notes.length ? notes.map(note => <div className="record-row" key={note.id}><span><span className="preline">{note.body}</span><small>{note.authorName ?? "Unknown member"} · {dateTime(note.createdAt)}</small></span></div>) : <p className="muted">No notes yet.</p>}
    {canAdd && <div className="composer" style={{ marginTop: 12 }}><label className="sr-only" htmlFor="household-note">Add a household note</label><textarea id="household-note" ref={field} maxLength={HOUSEHOLD_NOTE_MAX_LENGTH} placeholder="Add a note about this household…" value={body} onChange={event => setBody(event.target.value)}/>{error && <p className="form-error" role="alert">{error}</p>}<Button size="small" onClick={save} disabled={saving}>{saving ? "Saving…" : "Add note"}</Button></div>}
  </section>;
}

/** Rate type on a loan record (4F.3 e): Fixed, Variable or Split. Never a rate value. */
export function RateTypeControl({ loanLabel, value, fixedRateExpiryDate, canEdit, onSet }: { loanLabel: string; value?: RateType; fixedRateExpiryDate?: string; canEdit: boolean; onSet: (rateType: RateType) => SaveResult }) {
  const [draft, setDraft] = useState<RateType | "">(value ?? ""), [error, setError] = useState("");
  if (!canEdit) return <Badge>{value ?? "Rate type not recorded"}</Badge>;
  const save = async () => { if (!draft) return; const failure = await onSet(draft); setError(failure ?? ""); };
  return <span className="rate-type-control">
    <label className="sr-only" htmlFor={`rate-type-${loanLabel}`}>Rate type for {loanLabel}</label>
    <select id={`rate-type-${loanLabel}`} className="ui-control ui-select" value={draft} onChange={event => setDraft(event.target.value as RateType)}><option value="">Rate type not recorded</option>{rateTypes.map(type => <option key={type} value={type} disabled={type === "Variable" && Boolean(fixedRateExpiryDate)}>{type}</option>)}</select>
    <Button size="small" variant="secondary" aria-label="Save rate type" onClick={save} disabled={!draft || draft === value}>Save</Button>
    {error && <small className="form-error" role="alert">{error}</small>}
  </span>;
}

/** Manual next step on a referral partner (4F.3 c). */
export function NextStepEditor({ value, canEdit, onSave }: { value?: string; canEdit: boolean; onSave: (nextStep: string) => SaveResult }) {
  const [draft, setDraft] = useState(value ?? ""), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  if (!canEdit) return <p>{value ?? <span className="muted">Not set</span>}</p>;
  const save = async () => { setSaving(true); const failure = await onSave(draft); setSaving(false); setError(failure ?? ""); };
  return <div className="next-step-editor">
    <label htmlFor="partner-next-step" className="ui-field__label">Next step</label>
    <input id="partner-next-step" className="ui-control ui-text-field" maxLength={NEXT_STEP_MAX_LENGTH} placeholder="For example, book a catch-up coffee" value={draft} onChange={event => setDraft(event.target.value)}/>
    <Button size="small" variant="secondary" onClick={save} disabled={saving || draft.trim() === (value ?? "")}>{saving ? "Saving…" : draft.trim() ? "Save next step" : "Clear next step"}</Button>
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
