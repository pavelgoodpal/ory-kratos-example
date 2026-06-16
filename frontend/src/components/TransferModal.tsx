import { useState } from "react";
import { api, type Car } from "../api";

export function TransferModal({
  car,
  onClose,
  onDone,
}: {
  car: Car;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.transfer(car.id, email.trim());
      setDone(true);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>
          Transfer ownership · {car.make} {car.model}
        </h3>

        {done ? (
          <div className="schedule-done">
            <p className="message message-success">
              ✓ Ownership transferred to {email}. You no longer own this car.
            </p>
            <button className="btn btn-primary full" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="ory-form">
            <p className="muted">
              Enter the email of a registered user. They become the sole owner —
              <strong> you lose ownership</strong> of this car.
            </p>
            <label className="field">
              <span className="field-label">New owner's email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </label>
            {error && <p className="message message-error">{error}</p>}
            <button type="submit" className="btn btn-primary full" disabled={busy}>
              {busy ? "Transferring…" : "Transfer ownership"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
