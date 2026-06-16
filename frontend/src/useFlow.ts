import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { initFlowUrl } from "./ory";

type FlowType =
  | "login"
  | "registration"
  | "recovery"
  | "verification"
  | "settings";

/**
 * Loads (or initializes) an Ory Kratos browser self-service flow.
 *
 * - If `?flow=<id>` is present, fetch that flow from Kratos (this is how the
 *   browser lands back here after Kratos sets cookies / reports messages).
 * - Otherwise, redirect the browser to the Kratos `/self-service/<type>/browser`
 *   endpoint, which creates a flow and redirects back here with `?flow=<id>`.
 */
export function useFlow<T extends { id: string }>(
  type: FlowType,
  getFlow: (id: string) => Promise<{ data: T }>,
) {
  const [searchParams] = useSearchParams();
  const [flow, setFlow] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flowId = searchParams.get("flow");
  const returnTo = searchParams.get("return_to") ?? undefined;
  const aal = searchParams.get("aal") ?? undefined;

  useEffect(() => {
    let cancelled = false;

    if (!flowId) {
      window.location.replace(initFlowUrl(type, returnTo, aal));
      return;
    }

    getFlow(flowId)
      .then(({ data }) => {
        if (!cancelled) setFlow(data);
      })
      .catch((err) => {
        // Flow expired / not found / unauthorized — start a fresh one.
        const status = err?.response?.status;
        if (status === 404 || status === 410 || status === 403) {
          window.location.replace(initFlowUrl(type, returnTo, aal));
          return;
        }
        if (!cancelled) setError("Could not load the flow. Please try again.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  return { flow, error };
}
