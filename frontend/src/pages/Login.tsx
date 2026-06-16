import type { LoginFlow } from "@ory/client";
import { Link } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { Flow } from "../components/Flow";
import { ory } from "../ory";
import { useFlow } from "../useFlow";

export default function Login() {
  const { flow, error } = useFlow<LoginFlow>("login", (id) =>
    ory.getLoginFlow({ id }),
  );

  return (
    <AuthCard
      title="Sign in"
      subtitle="Enter your email and password. We'll email you a one-time code to finish signing in."
      footer={
        <>
          <span>
            No account? <Link to="/registration">Create one</Link>
          </span>
          <span>
            <Link to="/recovery">Forgot password?</Link>
          </span>
        </>
      }
    >
      {error && <p className="message message-error">{error}</p>}
      {flow ? <Flow ui={flow.ui} /> : !error && <p className="muted">Loading…</p>}
    </AuthCard>
  );
}
