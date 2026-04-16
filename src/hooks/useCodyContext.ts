import { createContext, useContext } from "react";

export interface CodyContext {
  context_type: string | null;
  context_id: string | null;
  page_data: unknown;
  setContext: (next: {
    context_type: string | null;
    context_id?: string | null;
    page_data?: unknown;
  }) => void;
  clearContext: () => void;
}

export const CodyContextContext = createContext<CodyContext | null>(null);

// Module-level stable no-op fallback so `useCodyContext()` never returns a
// fresh object on every render when the provider is missing. Returning a new
// object each call would break any consumer that passes setContext/clearContext
// into a dep array.
const NOOP = () => {};
const FALLBACK_CTX: CodyContext = {
  context_type: null,
  context_id: null,
  page_data: null,
  setContext: NOOP,
  clearContext: NOOP,
};

/** Read the current Cody context from any component. */
export function useCodyContext(): CodyContext {
  const ctx = useContext(CodyContextContext);
  return ctx ?? FALLBACK_CTX;
}
