export type LifecycleTransitions<TStatus extends string> = Readonly<Record<TStatus, readonly TStatus[]>>;

export function assertLifecycleTransition<TStatus extends string>(transitions:LifecycleTransitions<TStatus>,from:TStatus,to:TStatus){
  if(!transitions[from].includes(to))throw new Error(`Invalid opportunity transition: ${from} → ${to}`);
}
