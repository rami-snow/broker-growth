"use client";

import { useRef } from "react";
import { selectOrganisation } from "@/app/auth-actions";
import { BrokerageSelect, type BrokerageOption } from "./sidebar";

/** Server-validated brokerage switch. The cookie it sets is a preference only; the server re-checks membership. */
export function PersistentBrokerageSwitcher({ value, options, returnPath }: { value: string; options: BrokerageOption[]; returnPath: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return <form ref={formRef} action={selectOrganisation}>
    <input type="hidden" name="returnTo" value={returnPath}/>
    <BrokerageSelect id="persistent-organisation" name="organisationId" value={value} options={options} onChange={() => formRef.current?.requestSubmit()}/>
    <noscript><button type="submit">Switch</button></noscript>
  </form>;
}
