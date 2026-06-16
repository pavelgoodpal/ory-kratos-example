import { Configuration, IdentityApi } from "@ory/client";

const KRATOS_ADMIN_URL =
  process.env.KRATOS_ADMIN_URL ?? "http://localhost:4434";

export const identityApi = new IdentityApi(
  new Configuration({ basePath: KRATOS_ADMIN_URL }),
);

/** Look up an identity id by its email (login identifier). Returns null if none. */
export async function findIdentityIdByEmail(
  email: string,
): Promise<string | null> {
  const { data } = await identityApi.listIdentities({
    credentialsIdentifier: email,
  });
  return data[0]?.id ?? null;
}

/**
 * Ensure the primary owner identity exists (email + password). The email is
 * created already verified so the owner can complete the email-code MFA login.
 * Returns the identity id.
 */
export async function ensureOwnerIdentity(
  email: string,
  password: string,
): Promise<string> {
  const existing = await findIdentityIdByEmail(email);
  if (existing) return existing;

  const { data } = await identityApi.createIdentity({
    createIdentityBody: {
      schema_id: "default",
      state: "active",
      traits: { email, name: { first: "Primary", last: "Owner" } },
      credentials: { password: { config: { password } } },
      verifiable_addresses: [
        { value: email, verified: true, via: "email", status: "completed" },
      ],
    },
  });
  console.log(`Created primary owner identity ${email} (${data.id})`);
  return data.id;
}
