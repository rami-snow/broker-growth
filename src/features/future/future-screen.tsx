import { EmptyState } from "@/components/ui";
import { PageTitle } from "@/components/page-title";
export function FutureScreen({ title, heading, body }: { title: string; heading: string; body: string }) { return <><PageTitle title={title}/><section className="card"><EmptyState title={heading} body={body}/></section></>; }
