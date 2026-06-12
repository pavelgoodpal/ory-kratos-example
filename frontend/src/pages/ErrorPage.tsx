import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthCard } from "../components/AuthCard";
import { ory } from "../ory";

export default function ErrorPage() {
  const [params] = useSearchParams();
  const [detail, setDetail] = useState<string>("");
  const id = params.get("id");

  useEffect(() => {
    if (!id) return;
    ory
      .getFlowError({ id })
      .then(({ data }) => setDetail(JSON.stringify(data.error, null, 2)))
      .catch(() => setDetail("Unknown error."));
  }, [id]);

  return (
    <AuthCard
      title="Something went wrong"
      footer={
        <span>
          <Link to="/login">Back to sign in</Link>
        </span>
      }
    >
      {detail ? (
        <pre className="error-detail">{detail}</pre>
      ) : (
        <p className="muted">An unexpected error occurred.</p>
      )}
    </AuthCard>
  );
}
