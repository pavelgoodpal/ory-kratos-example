// Seeds the primary owner and initial car ownership in Keto.
// The primary owner (OWNER_EMAIL) owns every car that has no owner yet.

import { cars } from "./data.js";
import { addOwner, getOwner } from "./keto.js";
import { ensureOwnerIdentity } from "./kratosAdmin.js";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "pavelgoodpal@gmail.com";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "helloWorld12345";

export async function seedOwnership(): Promise<void> {
  const ownerId = await ensureOwnerIdentity(OWNER_EMAIL, OWNER_PASSWORD);

  for (const car of cars) {
    const current = await getOwner(car.id);
    if (!current) {
      await addOwner(car.id, ownerId);
      console.log(`Seeded ownership: ${car.id} -> ${OWNER_EMAIL}`);
    }
  }
}

export async function seedOwnershipWithRetry(attempts = 5): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await seedOwnership();
      console.log("Ownership seeded.");
      return;
    } catch (err) {
      console.error(
        `Ownership seeding attempt ${i}/${attempts} failed: ${(err as Error).message}`,
      );
      if (i < attempts) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.error("Giving up on ownership seeding for now.");
}
