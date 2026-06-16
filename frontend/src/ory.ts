import { Configuration, FrontendApi } from "@ory/client";

// Public Kratos URL as reachable from the browser.
export const KRATOS_URL: string =
  (import.meta.env.VITE_KRATOS_PUBLIC_URL as string | undefined) ??
  "http://localhost:4433";

export const ory = new FrontendApi(
  new Configuration({
    basePath: KRATOS_URL,
    baseOptions: { withCredentials: true },
  }),
);

export const BACKEND_URL: string =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  "http://localhost:4000";

/** Build the URL that initializes a browser self-service flow. */
export function initFlowUrl(
  flow: "login" | "registration" | "recovery" | "verification" | "settings",
  returnTo?: string,
  aal?: string,
): string {
  const url = new URL(`${KRATOS_URL}/self-service/${flow}/browser`);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  // aal=aal2 starts the second-factor (emailed code) step of login.
  if (aal) url.searchParams.set("aal", aal);
  return url.toString();
}

export const logoutUrl = `${KRATOS_URL}/self-service/logout/browser`;
