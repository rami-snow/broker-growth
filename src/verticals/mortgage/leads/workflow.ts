import type { MortgageLeadStatus } from "./models";
const transitions:Record<MortgageLeadStatus,MortgageLeadStatus[]>={New:["Contact attempted","Contacted","Nurture","Closed"],"Contact attempted":["Contacted","Nurture","Closed"],Contacted:["Discovery booked","Nurture","Closed"],"Discovery booked":["Nurture","Closed"],Nurture:["Contact attempted","Contacted","Discovery booked","Closed"],Converted:[],Closed:["Nurture"]};
export const allowedTransitions=(status:MortgageLeadStatus)=>transitions[status];
export const canTransitionLead=(from:MortgageLeadStatus,to:MortgageLeadStatus)=>transitions[from].includes(to);
export function assertLeadTransition(from:MortgageLeadStatus,to:MortgageLeadStatus){if(!canTransitionLead(from,to))throw new Error(`Invalid lead transition: ${from} → ${to}`);}
