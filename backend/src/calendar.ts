// Google Calendar integration that goes THROUGH KRATOS.
//
// Google is linked to the identity via Kratos's OIDC settings flow ("Link
// Google"). Kratos stores the Google tokens (encrypted) in the identity's
// `oidc` credential. Here we read that token back through the Kratos Admin API
// (`?include_credential=oidc`) and use it to create a Calendar event.
//
// NOTE: Kratos's built-in Google provider does not request offline access, so
// there is usually no refresh token, and the access token Kratos captured at
// link time expires after ~1 hour. When it expires, the user must re-link
// Google from the Settings page. We attempt a refresh only if Kratos happened
// to store a refresh token.

const KRATOS_ADMIN_URL =
  process.env.KRATOS_ADMIN_URL ?? "http://localhost:4434";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

export class CalendarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface GoogleTokens {
  accessToken?: string;
  refreshToken?: string;
}

/** Read the Google tokens Kratos stored on the identity's oidc credential. */
async function getGoogleTokens(identityId: string): Promise<GoogleTokens> {
  const res = await fetch(
    `${KRATOS_ADMIN_URL}/admin/identities/${identityId}?include_credential=oidc`,
  );
  if (!res.ok) {
    throw new CalendarError("Could not read identity from Kratos", 502);
  }
  const identity = (await res.json()) as {
    credentials?: {
      oidc?: {
        config?: {
          providers?: Array<{
            provider: string;
            initial_access_token?: string;
            initial_refresh_token?: string;
          }>;
        };
      };
    };
  };
  const google = identity.credentials?.oidc?.config?.providers?.find(
    (p) => p.provider === "google",
  );
  if (!google) {
    throw new CalendarError(
      "Google is not linked. Link Google from the Settings page to schedule a visit.",
      409,
    );
  }
  return {
    accessToken: google.initial_access_token,
    refreshToken: google.initial_refresh_token,
  };
}

/** True if the identity has a linked Google oidc credential. */
export async function isLinked(identityId: string): Promise<boolean> {
  try {
    await getGoogleTokens(identityId);
    return true;
  } catch {
    return false;
  }
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
  if (!res.ok) throw new CalendarError("Failed to refresh Google token", 409);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new CalendarError("No access token from Google", 502);
  return data.access_token;
}

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
  const { accessToken, refreshToken } = await getGoogleTokens(input.identityId);

  const start = new Date(input.startISO);
  if (Number.isNaN(start.getTime())) {
    throw new CalendarError("Invalid start time", 400);
  }
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const body = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: end.toISOString(), timeZone: input.timeZone },
    reminders: { useDefault: true },
  };

  const post = (token: string) =>
    fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let token = accessToken;
  let res = token ? await post(token) : undefined;

  // Token expired? Try a refresh only if Kratos stored a refresh token.
  if ((!res || res.status === 401) && refreshToken) {
    token = await refreshAccessToken(refreshToken);
    res = await post(token);
  }

  if (!res || res.status === 401 || res.status === 403) {
    const text = res ? await res.text().catch(() => "") : "";
    console.error(`Google Calendar denied (${res?.status}):`, text);
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(text)) {
      throw new CalendarError(
        "The Google Calendar API is not enabled for this Google Cloud project. Enable it, wait a minute, then retry.",
        409,
      );
    }
    throw new CalendarError(
      "Your Google link has expired (Kratos-stored tokens last ~1 hour). Re-link Google from the Settings page, then try again.",
      409,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Google Calendar error (${res.status}):`, text);
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
