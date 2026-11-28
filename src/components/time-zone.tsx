"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_ORGANISATION_TIME_ZONE } from "@/platform/time/zoned";

const TimeZoneContext = createContext(DEFAULT_ORGANISATION_TIME_ZONE);

/** Provides the active brokerage's time zone to client screens. Set by each runtime shell. */
export function TimeZoneProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}
export const useTimeZone = () => useContext(TimeZoneContext);

/** Date-time and date formatters in the active brokerage zone. Date-only values are calendar dates and never shift. */
export function useZonedFormat() {
  const timeZone = useTimeZone();
  return {
    dateTime: (value: string) => new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value)),
    date: (value: string) => value.length === 10 ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(value)),
  };
}
