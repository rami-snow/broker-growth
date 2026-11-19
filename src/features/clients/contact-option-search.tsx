"use client";

import { useState, useTransition } from "react";
import { searchPersistentContactOptions } from "@/app/client-book-actions";
import { Button, Select, TextField } from "@/components/ui";
import type { ClientBookContactOption } from "@/verticals/mortgage/repositories/client-book-port";

export function ContactOptionSearch({name,label,excludeHouseholdId}:{name:string;label:string;excludeHouseholdId?:string}){
  const[term,setTerm]=useState(""),[options,setOptions]=useState<ClientBookContactOption[]>([]),[message,setMessage]=useState(""),[pending,startTransition]=useTransition();
  const search=()=>startTransition(async()=>{const result=await searchPersistentContactOptions(term,excludeHouseholdId);setOptions(result.options);setMessage(result.message||(!result.options.length?"No matching contacts found.":""));});
  return <div className="form-grid single" role="search" aria-label={`${label} lookup`}>
    <TextField label={`Search ${label.toLowerCase()}`} value={term} onChange={event=>setTerm(event.target.value)} minLength={2}/>
    <Button type="button" variant="secondary" onClick={search} disabled={pending||term.replaceAll(/\s/g,"").length<2}>{pending?"Searching…":"Search contacts"}</Button>
    {message&&<p className={message.includes("permission")?"form-error":"form-guidance"} role="status">{message}</p>}
    {options.length>0&&<Select name={name} label={label} required options={options.map(option=>({value:option.id,label:contactLabel(option)}))}/>} 
  </div>;
}

function contactLabel(contact:ClientBookContactOption){return `${contact.name}${contact.email?` · ${contact.email}`:contact.phone?` · ${contact.phone}`:""}`;}
