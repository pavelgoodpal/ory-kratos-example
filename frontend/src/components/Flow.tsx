import type {
  UiContainer,
  UiNode,
  UiNodeInputAttributes,
  UiText,
} from "@ory/client";

/**
 * Renders an Ory Kratos UiContainer as a native HTML <form>, with the two
 * sign-in approaches visually separated:
 *
 *   1. Social sign-in (the `oidc` node group) — one button per provider.
 *   2. Email + password / one-time-code (every other visible group).
 *
 * It is a single <form> so the CSRF token and all hidden fields are always
 * submitted; Kratos routes the request by which submit button was pressed
 * (`provider=google` vs `method=password`/`code`). We let the browser submit
 * directly to `ui.action` — Kratos sets cookies, performs OIDC redirects, and
 * on error/continuation redirects back here with `?flow=<id>` and messages.
 */
export function Flow({
  ui,
  hideOidc = false,
}: {
  ui: UiContainer;
  hideOidc?: boolean;
}) {
  const hidden: UiNode[] = [];
  const oidc: UiNode[] = [];
  const credential: UiNode[] = [];

  for (const node of ui.nodes) {
    const attrs = node.attributes as UiNodeInputAttributes;
    if (node.type === "input" && attrs.type === "hidden") {
      hidden.push(node);
    } else if (node.group === "oidc") {
      // Google is link-only here — hidden on login/registration, shown on
      // the settings page so it can be linked to an existing account.
      if (!hideOidc) oidc.push(node);
    } else {
      credential.push(node);
    }
  }

  // Inputs before submit buttons within the credential section.
  credential.sort((a, b) => credOrder(a) - credOrder(b));

  const hasOidc = oidc.length > 0;
  const hasCredential = credential.some(
    (n) => (n.attributes as UiNodeInputAttributes).type !== "hidden",
  );

  return (
    <form action={ui.action} method={ui.method} className="ory-form">
      <Messages messages={ui.messages} />
      {hidden.map((node, i) => (
        <Node key={`h${i}`} node={node} />
      ))}

      {hasOidc && (
        <div className="auth-section">
          <p className="section-label">Continue with</p>
          {oidc.map((node, i) => (
            <Node key={`o${i}`} node={node} />
          ))}
        </div>
      )}

      {hasOidc && hasCredential && (
        <div className="divider">
          <span>or use your email</span>
        </div>
      )}

      {hasCredential && (
        <div className="auth-section">
          {credential.map((node, i) => (
            <Node key={`c${i}`} node={node} />
          ))}
        </div>
      )}
    </form>
  );
}

function credOrder(node: UiNode): number {
  const attrs = node.attributes as UiNodeInputAttributes;
  if (node.type !== "input") return 1;
  if (attrs.type === "submit" || attrs.type === "button") return 2;
  return 1;
}

function Node({ node }: { node: UiNode }) {
  if (node.type !== "input") {
    return <Messages messages={node.messages} />;
  }

  const attrs = node.attributes as UiNodeInputAttributes;
  const label =
    node.meta?.label?.text ?? attrs.label?.text ?? humanize(attrs.name);

  if (attrs.type === "hidden") {
    return <input type="hidden" name={attrs.name} value={String(attrs.value ?? "")} />;
  }

  if (attrs.type === "submit" || attrs.type === "button") {
    const isOidc = node.group === "oidc";
    return (
      <button
        type="submit"
        name={attrs.name}
        value={String(attrs.value ?? "")}
        disabled={attrs.disabled}
        // Social sign-in doesn't need the email/password fields, so skip the
        // browser's HTML5 validation of those (otherwise required fields would
        // block the OIDC submit). Kratos routes the request by `provider`.
        formNoValidate={isOidc}
        className={isOidc ? "btn btn-oidc" : "btn btn-primary full"}
      >
        {isOidc ? providerLabel(label, String(attrs.value ?? "")) : label}
      </button>
    );
  }

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        name={attrs.name}
        type={attrs.type}
        defaultValue={attrs.type === "password" ? undefined : String(attrs.value ?? "")}
        required={attrs.required}
        disabled={attrs.disabled}
        autoComplete={autoComplete(attrs.name)}
        pattern={attrs.pattern}
      />
      <Messages messages={node.messages} />
    </label>
  );
}

function Messages({ messages }: { messages?: UiText[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <div className="messages">
      {messages.map((m) => (
        <p key={m.id} className={`message message-${m.type}`}>
          {m.text}
        </p>
      ))}
    </div>
  );
}

function providerLabel(label: string, value: string): string {
  const icons: Record<string, string> = { google: "🇬", yandex: "Я" };
  const name = value.charAt(0).toUpperCase() + value.slice(1);
  const icon = icons[value];
  // Kratos labels are usually like "Sign in with google" already.
  if (/with/i.test(label)) return label;
  return `${icon ? icon + " " : ""}Continue with ${name}`;
}

function humanize(name: string): string {
  return name
    .replace(/^traits\./, "")
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function autoComplete(name: string): string | undefined {
  if (name === "identifier" || name.endsWith("email")) return "email";
  if (name === "password") return "current-password";
  if (name === "code") return "one-time-code";
  return undefined;
}
