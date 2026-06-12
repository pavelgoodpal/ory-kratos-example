import type { VerificationFlow } from "@ory/client";
import { Link } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { Flow } from "../components/Flow";
import { ory } from "../ory";
import { useFlow } from "../useFlow";

export default function Verification() {
  const { flow, error } = useFlow<VerificationFlow>("verification", (id) =>
    ory.getVerificationFlow({ id }),
  );

  return (
    <AuthCard
      title="Verify your email"
      subtitle="Enter the one-time code we sent to your email address."
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
