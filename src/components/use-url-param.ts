"use client";
import { useSyncExternalStore } from "react";

const subscribe = (callback: () => void) => { window.addEventListener("popstate", callback); return () => window.removeEventListener("popstate", callback); };

/** Reads a query parameter on the client without a Suspense boundary; null during server rendering. */
export function useUrlParam(name: string) {
  return useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get(name), () => null);
}
