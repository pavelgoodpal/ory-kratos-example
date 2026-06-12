// Dedicated "Connect Google Calendar" OAuth integration.
//
// Unlike the login token (which Kratos captures once at sign-up and never
// refreshes), this flow is owned by the backend: it requests OFFLINE access
// (access_type=offline + prompt=consent), so Google returns a long-lived
// REFRESH TOKEN. We store that refresh token on the user's Kratos identity
// (metadata_admin, admin-only) and mint a fresh access token whenever we need
// to create a calendar event.

const KRATOS_ADMIN_URL =
  process.env.KRATOS_ADMIN_URL ?? "http://localhost:4434";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
  "http://localhost:4000/api/google/calendar/callback";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export class CalendarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// --- OAuth consent ---------------------------------------------------------

/** Build the Google consent URL that asks for offline Calendar access. */
export function buildConsentUrl(state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", CALENDAR_SCOPE);
  u.searchParams.set("access_type", "offline"); // → returns a refresh token
  u.searchParams.set("prompt", "consent"); // force re-consent so we always get one
  u.searchParams.set("state", state);
  return u.toString();
}

/** Exchange the authorization code for tokens (incl. refresh_token). */
export async function exchangeCode(
  code: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("Google code exchange failed:", res.status, t);
    throw new CalendarError("Failed to exchange Google authorization code", 502);
  }
  return (await res.json()) as { access_token: string; refresh_token?: string };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("Google token refresh failed:", res.status, t);
    // Refresh token revoked/expired → user must reconnect.
    throw new CalendarError(
      "Your Google Calendar connection expired. Please reconnect.",
      409,
    );
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new CalendarError("Google did not return an access token", 502);
  }
  return data.access_token;
}

// --- Refresh-token storage on the Kratos identity (metadata_admin) ---------

async function getIdentity(identityId: string): Promise<{
  metadata_admin?: { google_calendar?: { refresh_token?: string } };
}> {
  const res = await fetch(`${KRATOS_ADMIN_URL}/admin/identities/${identityId}`);
  if (!res.ok) throw new CalendarError("Could not read identity from Kratos", 502);
  return res.json() as Promise<{
    metadata_admin?: { google_calendar?: { refresh_token?: string } };
  }>;
}

export async function saveRefreshToken(
  identityId: string,
  refreshToken: string,
): Promise<void> {
  const identity = await getIdentity(identityId);
  const metadata_admin = {
    ...(identity.metadata_admin ?? {}),
    google_calendar: {
      refresh_token: refreshToken,
      connected_at: new Date().toISOString(),
    },
  };
  const res = await fetch(`${KRATOS_ADMIN_URL}/admin/identities/${identityId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { op: "add", path: "/metadata_admin", value: metadata_admin },
    ]),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("Failed to store refresh token:", res.status, t);
    throw new CalendarError("Failed to save the calendar connection", 502);
  }
}

async function getRefreshToken(identityId: string): Promise<string | null> {
  const identity = await getIdentity(identityId);
  return identity.metadata_admin?.google_calendar?.refresh_token ?? null;
}

export async function isConnected(identityId: string): Promise<boolean> {
  return Boolean(await getRefreshToken(identityId));
}

// --- Create the event ------------------------------------------------------

interface CreateEventInput {
  identityId: string;
  summary: string;
  description: string;
  startISO: string;
  timeZone: string;
  durationMinutes: number;
}

export interface CalendarEvent {
  id: string;
  htmlLink: string;
  start: string;
  end: string;
}

export async function createCalendarEvent(
  input: CreateEventInput,
): Promise<CalendarEvent> {
  const refreshToken = await getRefreshToken(input.identityId);
  if (!refreshToken) {
    throw new CalendarError("Google Calendar is not connected", 409);
  }
  const accessToken = await refreshAccessToken(refreshToken);

  const start = new Date(input.startISO);
  if (Number.isNaN(start.getTime())) {
    throw new CalendarError("Invalid start time", 400);
  }
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: start.toISOString(), timeZone: input.timeZone },
        end: { dateTime: end.toISOString(), timeZone: input.timeZone },
        reminders: { useDefault: true },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Google Calendar error (${res.status}):`, text);
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(text)) {
      throw new CalendarError(
        "The Google Calendar API is not enabled for this Google Cloud project. Enable it (APIs & Services → Library → Google Calendar API), wait a minute, then try again.",
        409,
      );
    }
    if (res.status === 403 && /insufficient|scope|PERMISSION_DENIED/i.test(text)) {
      throw new CalendarError(
        "The connection is missing the Calendar scope. Add the 'calendar.events' scope to your OAuth consent screen, revoke the app at myaccount.google.com → Security, then reconnect.",
        409,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new CalendarError(
        "Google rejected the calendar request. Try reconnecting Google Calendar.",
        409,
      );
    }
    throw new CalendarError(`Google Calendar error: ${res.status}`, 502);
  }

  const event = (await res.json()) as {
    id: string;
    htmlLink: string;
    start: { dateTime: string };
    end: { dateTime: string };
  };
  return {
    id: event.id,
    htmlLink: event.htmlLink,
    start: event.start.dateTime,
    end: event.end.dateTime,
  };
}
