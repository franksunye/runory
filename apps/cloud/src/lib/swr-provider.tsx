"use client";

import { ReactNode } from "react";
import { SWRConfig } from "swr";
import type { ToolEnvelope } from "@runory/contracts";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.clone().json()) as ToolEnvelope<unknown>;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore JSON parse errors, fall back to status text
    }
    throw new Error(message);
  }
  const json = (await res.json()) as ToolEnvelope<T>;
  if (!json.success) {
    throw new Error(json.error?.message ?? "Request failed");
  }
  return json.data as T;
}

export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 2000,
        refreshInterval: 0,
        // Data refreshes are driven by manual refresh buttons, 30s polling on
        // the dashboard, and workspace change events. Disabling focus
        // revalidation avoids re-fetching every hook on every tab switch.
        revalidateOnFocus: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
