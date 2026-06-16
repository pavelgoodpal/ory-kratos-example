import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { provisionCarIdentitiesWithRetry } from "./carIdentities.js";
import { cars, orders, type Order } from "./data.js";
import { carsOwnedBy, isOwner, transferOwnership } from "./keto.js";
import { kratos, requireSession } from "./kratos.js";
import { findIdentityIdByEmail } from "./kratosAdmin.js";
import { seedOwnershipWithRetry } from "./seedOwnership.js";

const app = express();
app.use(express.json());

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

/**
 * Resolve the caller's identity id. Behind Oathkeeper it arrives as the trusted
 * X-User-Id header; if the backend is called directly, fall back to Kratos
 * whoami via the session cookie.
 */
async function getUserId(req: Request): Promise<string | null> {
  const fromGateway = req.header("x-user-id");
  if (fromGateway && fromGateway !== "guest") return fromGateway;
  try {
    const { data } = await kratos.toSession({
      cookie: req.header("cookie") ?? undefined,
    });
    return data.identity?.id ?? null;
  } catch {
    return null;
  }
}

/** Express middleware: require an authenticated caller, expose req.userId. */
async function withUser(
  req: Request & { userId?: string },
  res: Response,
  next: NextFunction,
): Promise<void> {
  const id = await getUserId(req);
  if (!id) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.userId = id;
  next();
}

// Allow the SPA to call us with credentials (session cookies).
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  }),
);

// --- Health ---------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// --- Who am I (optional auth) ---------------------------------------------
app.get("/api/me", async (req, res) => {
  try {
    const { data: session } = await kratos.toSession({
      cookie: req.header("cookie") ?? undefined,
    });
    const traits = (session.identity?.traits ?? {}) as {
      email?: string;
      name?: { first?: string; last?: string };
    };
    res.json({
      authenticated: true,
      id: session.identity?.id,
      email: traits.email,
      name: traits.name,
    });
  } catch (err) {
    // 403 with session_aal2_required = the user did password (AAL1) but still
    // needs the emailed code (AAL2). Tell the frontend to step up.
    const id = (err as { response?: { data?: { error?: { id?: string } } } })
      ?.response?.data?.error?.id;
    if (id === "session_aal2_required") {
      res.json({ authenticated: false, aal2Required: true });
      return;
    }
    res.json({ authenticated: false });
  }
});

// --- Catalog (public) -----------------------------------------------------
app.get("/api/cars", (_req, res) => {
  res.json(cars);
});

app.get("/api/cars/:id", (req, res) => {
  const car = cars.find((c) => c.id === req.params.id);
  if (!car) {
    res.status(404).json({ error: "Car not found" });
    return;
  }
  res.json(car);
});

// --- Orders (protected) ---------------------------------------------------
app.post("/api/orders", requireSession, (req, res) => {
  const { carId } = req.body ?? {};
  const car = cars.find((c) => c.id === carId);
  if (!car) {
    res.status(400).json({ error: "Unknown carId" });
    return;
  }

  const traits = (req.session!.identity?.traits ?? {}) as { email?: string };
  const order: Order = {
    id: randomUUID(),
    carId,
    identityId: req.session!.identity!.id,
    email: traits.email ?? "",
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  res.status(201).json(order);
});

app.get("/api/orders", requireSession, (req, res) => {
  const mine = orders.filter(
    (o) => o.identityId === req.session!.identity!.id,
  );
  res.json(mine);
});

// --- Ownership (Keto) -----------------------------------------------------

// Car ids the caller currently owns.
app.get("/api/ownership", withUser, async (req: Request & { userId?: string }, res) => {
  try {
    res.json({ carIds: await carsOwnedBy(req.userId!) });
  } catch (err) {
    console.error("ownership lookup failed:", err);
    res.status(502).json({ error: "Could not read ownership" });
  }
});

// Transfer ownership of a car to another user (by email). The caller loses it.
// Oathkeeper already verified the caller owns the car (Keto authorizer); we
// re-check here as defense in depth.
app.post(
  "/api/cars/:id/transfer",
  withUser,
  async (req: Request & { userId?: string }, res) => {
    const carId = req.params.id;
    const { toEmail } = req.body ?? {};
    const car = cars.find((c) => c.id === carId);
    if (!car) {
      res.status(404).json({ error: "Car not found" });
      return;
    }
    if (typeof toEmail !== "string" || !toEmail.includes("@")) {
      res.status(400).json({ error: "A valid target email is required" });
      return;
    }

    try {
      if (!(await isOwner(carId, req.userId!))) {
        res.status(403).json({ error: "You don't own this car" });
        return;
      }
      const toId = await findIdentityIdByEmail(toEmail.trim().toLowerCase());
      if (!toId) {
        res.status(400).json({
          error: "No registered user with that email. They must sign up first.",
        });
        return;
      }
      if (toId === req.userId) {
        res.status(400).json({ error: "You already own this car" });
        return;
      }
      await transferOwnership(carId, toId);
      res.json({ carId, transferredTo: toEmail });
    } catch (err) {
      console.error("transfer failed:", err);
      res.status(502).json({ error: "Transfer failed" });
    }
  },
);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Car store backend listening on http://localhost:${PORT}`);
  // Background startup tasks: provision a Kratos identity per car, then seed
  // primary ownership in Keto.
  void (async () => {
    await provisionCarIdentitiesWithRetry();
    await seedOwnershipWithRetry();
  })();
});
