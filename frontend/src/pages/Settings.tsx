import type { SettingsFlow } from "@ory/client";
import { Link } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { Flow } from "../components/Flow";
import { ory } from "../ory";
import { useFlow } from "../useFlow";

export default function Settings() {
  const { flow, error } = useFlow<SettingsFlow>("settings", (id) =>
    ory.getSettingsFlow({ id }),
  );

  return (
    <AuthCard
      title="Account settings"
      subtitle="Change your password, update your profile, or link Google to enable scheduling visits to your calendar."
      footer={
        <span>
          <Link to="/">Back to store</Link>
        </span>
      }
    >
      {error && <p className="message message-error">{error}</p>}
      {flow ? <Flow ui={flow.ui} /> : !error && <p className="muted">Loading…</p>}
    </AuthCard>
  );
}
