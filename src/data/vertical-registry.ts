import type { VerticalKey } from "@/platform/core/models";
import { mortgageVerticalDefinition } from "@/verticals/mortgage/definition";

const definitions={mortgage:mortgageVerticalDefinition}as const;
export function getVerticalDefinition(key:VerticalKey){if(key!=="mortgage")throw new Error(`Vertical ${key} is not implemented`);return definitions.mortgage;}
