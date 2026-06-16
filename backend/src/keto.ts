// Thin Ory Keto client for Car ownership.
// Relationship tuple: Car:<carId>#owners@<userIdentityId>

const KETO_READ_URL = process.env.KETO_READ_URL ?? "http://localhost:4466";
const KETO_WRITE_URL = process.env.KETO_WRITE_URL ?? "http://localhost:4467";
const NS = "Car";
const REL = "owners";

/** Does this user currently own the car? */
export async function isOwner(carId: string, userId: string): Promise<boolean> {
  const url = new URL(`${KETO_READ_URL}/relation-tuples/check`);
  url.searchParams.set("namespace", NS);
  url.searchParams.set("object", carId);
  url.searchParams.set("relation", REL);
  url.searchParams.set("subject_id", userId);
  const res = await fetch(url);
  if (!res.ok) return false;
  const data = (await res.json()) as { allowed?: boolean };
  return data.allowed === true;
}

/** Return the current owner identity id of a car (or null). */
export async function getOwner(carId: string): Promise<string | null> {
  const url = new URL(`${KETO_READ_URL}/relation-tuples`);
  url.searchParams.set("namespace", NS);
  url.searchParams.set("object", carId);
  url.searchParams.set("relation", REL);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    relation_tuples?: Array<{ subject_id?: string }>;
  };
  return data.relation_tuples?.[0]?.subject_id ?? null;
}

/** All car ids owned by a user. */
export async function carsOwnedBy(userId: string): Promise<string[]> {
  const url = new URL(`${KETO_READ_URL}/relation-tuples`);
  url.searchParams.set("namespace", NS);
  url.searchParams.set("relation", REL);
  url.searchParams.set("subject_id", userId);
  url.searchParams.set("page_size", "500");
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    relation_tuples?: Array<{ object?: string }>;
  };
  return (data.relation_tuples ?? [])
    .map((t) => t.object)
    .filter((o): o is string => Boolean(o));
}

/** Create a tuple — Keto PUT takes a JSON body. */
export async function addOwner(carId: string, userId: string): Promise<void> {
  const res = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      namespace: NS,
      object: carId,
      relation: REL,
      subject_id: userId,
    }),
  });
  if (!res.ok) {
    throw new Error(`Keto PUT failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

/** Delete a tuple — Keto DELETE takes QUERY PARAMETERS, not a body. */
export async function removeOwner(carId: string, userId: string): Promise<void> {
  const url = new URL(`${KETO_WRITE_URL}/admin/relation-tuples`);
  url.searchParams.set("namespace", NS);
  url.searchParams.set("object", carId);
  url.searchParams.set("relation", REL);
  url.searchParams.set("subject_id", userId);
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Keto DELETE failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

/** Single-owner transfer: remove the current owner, then set the new one. */
export async function transferOwnership(
  carId: string,
  toUserId: string,
): Promise<void> {
  const current = await getOwner(carId);
  if (current && current !== toUserId) await removeOwner(carId, current);
  await addOwner(carId, toUserId);
}
