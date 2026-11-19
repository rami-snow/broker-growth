import { EmptyState } from "@/components/ui";
import { PageTitle } from "@/components/page-title";
export function FutureScreen({ title, body }: { title: string; body: string }) { return <><PageTitle title={title} body={body}/><section className="surface"><EmptyState title={`Coming in a later milestone`} body={`Milestone 1 does not implement ${title.toLowerCase()}. No functionality is being simulated here.`}/></section></>; }
