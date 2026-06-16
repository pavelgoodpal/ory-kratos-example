import type { RegistrationFlow } from "@ory/client";
import { Link } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { Flow } from "../components/Flow";
import { ory } from "../ory";
import { useFlow } from "../useFlow";

export default function Registration() {
  const { flow, error } = useFlow<RegistrationFlow>("registration", (id) =>
    ory.getRegistrationFlow({ id }),
  );

  return (
    <AuthCard
      title="Create your account"
      subtitle="Sign up with your email and a password. We'll email a one-time code to verify your address."
      footer={
        <span>
          Already have an account? <Link to="/login">Sign in</Link>
        </span>
      }
    >
      {error && <p className="message message-error">{error}</p>}
      {flow ? <Flow ui={flow.ui} /> : !error && <p className="muted">Loading…</p>}
    </AuthCard>
  );
}
