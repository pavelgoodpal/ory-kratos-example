import type { RecoveryFlow } from "@ory/client";
import { Link } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { Flow } from "../components/Flow";
import { ory } from "../ory";
import { useFlow } from "../useFlow";

export default function Recovery() {
  const { flow, error } = useFlow<RecoveryFlow>("recovery", (id) =>
    ory.getRecoveryFlow({ id }),
  );

  return (
    <AuthCard
      title="Account recovery"
      subtitle="We'll email you a one-time code to recover access to your account."
      footer={
        <span>
          Remembered it? <Link to="/login">Sign in</Link>
        </span>
      }
    >
      {error && <p className="message message-error">{error}</p>}
      {flow ? <Flow ui={flow.ui} /> : !error && <p className="muted">Loading…</p>}
    </AuthCard>
  );
}
