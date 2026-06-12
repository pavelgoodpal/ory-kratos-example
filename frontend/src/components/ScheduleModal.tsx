import { useEffect, useState } from "react";
import { api, calendarConnectUrl, type Car, type CalendarEvent } from "../api";

export function ScheduleModal({
  car,
  onClose,
}: {
  car: Car;
  onClose: () => void;
}) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<CalendarEvent | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);

  // Default to "tomorrow at 10:00", formatted for <input type="datetime-local">.
  const defaultValue = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  useEffect(() => {
    api
      .calendarStatus()
      .then((s) => setConnected(s.connected))
      .catch(() => setConnected(false));
  }, []);

  function connect() {
    // Full-page navigation to the backend, which redirects to Google consent.
    window.location.href = calendarConnectUrl;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const local = when || defaultValue;
      const startISO = new Date(local).toISOString();
      const event = await api.scheduleVisit(car.id, startISO);
      setDone(event);
    } catch (err) {
      const msg = (err as Error).message;
      // Backend returns 409 (message includes "connect"/"reconnect") when the
      // calendar isn't linked or the refresh token is gone.
      if (/connect/i.test(msg)) setNeedsConnect(true);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const showConnect = connected === false || needsConnect;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>
          Schedule a visit · {car.make} {car.model}
        </h3>

        {done ? (
          <div className="schedule-done">
            <p className="message message-success">
              ✓ Added a 30-minute visit to your Google Calendar.
            </p>
            <a
              href={done.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="btn btn-primary full"
            >
              Open event in Google Calendar
            </a>
          </div>
        ) : connected === null ? (
          <p className="muted">Checking your calendar connection…</p>
        ) : showConnect ? (
          <div className="schedule-done">
            <p className="muted">
              To add visits to your calendar, connect your Google Calendar once.
              You'll be asked to grant calendar access.
            </p>
            {error && <p className="message message-error">{error}</p>}
            <button className="btn btn-oidc full" onClick={connect}>
              Connect Google Calendar
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="ory-form">
            <p className="muted">
              Pick a time to visit the seller. We'll add a 30-minute event to
              your Google Calendar.
            </p>
            <label className="field">
              <span className="field-label">Date & time</span>
              <input
                type="datetime-local"
                value={when || defaultValue}
                onChange={(e) => setWhen(e.target.value)}
                required
              />
            </label>
            {error && <p className="message message-error">{error}</p>}
            <button type="submit" className="btn btn-primary full" disabled={busy}>
              {busy ? "Adding to calendar…" : "Add to Google Calendar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
