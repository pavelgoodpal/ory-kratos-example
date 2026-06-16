// Provisions one Ory Kratos identity per car.
//
// Each car gets an identity whose email (login identifier) is
//   <64-char base36>@car.store.com
// with a random password. Identities are created through the Kratos Admin API.
// We tag each with metadata_public { kind: "car", carId } so the provisioning
// is idempotent — on restart we match existing car identities by carId instead
// of creating duplicates.

import { Configuration, IdentityApi } from "@ory/client";
import crypto from "node:crypto";
import { cars } from "./data.js";

const KRATOS_ADMIN_URL =
  process.env.KRATOS_ADMIN_URL ?? "http://localhost:4434";

const identityApi = new IdentityApi(
  new Configuration({ basePath: KRATOS_ADMIN_URL }),
);

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Cryptographically-random base36 string of the given length. */
function base36(len: number): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += BASE36[bytes[i] % 36];
  return out;
}

/** Car login identifier: <base36 x64>@car.store.com */
function carEmail(): string {
  return `${base36(64)}@car.store.com`;
}

/** Strong random password (we don't keep the plaintext; Kratos stores the hash). */
function randomPassword(): string {
  return crypto.randomBytes(24).toString("base64url");
}

interface CarMeta {
  kind?: string;
  carId?: string;
}

/** Create a Kratos identity for every car that doesn't already have one. */
export async function provisionCarIdentities(): Promise<void> {
  // Build carId -> {id,email} from identities already tagged as cars.
  const existing = new Map<string, { id: string; email: string }>();
  const { data: identities } = await identityApi.listIdentities({
    pageSize: 1000,
  });
  for (const identity of identities) {
    const meta = (identity.metadata_public ?? {}) as CarMeta;
    const traits = (identity.traits ?? {}) as { email?: string };
    if (meta.kind === "car" && meta.carId) {
      existing.set(meta.carId, { id: identity.id, email: traits.email ?? "" });
    }
  }

  for (const car of cars) {
    const found = existing.get(car.id);
    if (found) {
      car.kratosIdentityId = found.id;
      car.kratosEmail = found.email;
      continue;
    }

    const email = carEmail();
    const password = randomPassword();
    const { data: created } = await identityApi.createIdentity({
      createIdentityBody: {
        schema_id: "default",
        state: "active",
        traits: { email },
        credentials: { password: { config: { password } } },
        metadata_public: { kind: "car", carId: car.id },
      },
    });
    car.kratosIdentityId = created.id;
    car.kratosEmail = email;
    console.log(`Provisioned car identity: ${car.id} -> ${email} (${created.id})`);
  }
}

/** Run provisioning with a few retries (Kratos may still be warming up). */
export async function provisionCarIdentitiesWithRetry(attempts = 5): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await provisionCarIdentities();
      console.log("Car identities provisioned.");
      return;
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`Car provisioning attempt ${i}/${attempts} failed: ${msg}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.error("Giving up on car identity provisioning for now.");
}
