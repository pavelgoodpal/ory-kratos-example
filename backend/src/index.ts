import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { cars, orders, type Order } from "./data.js";
import { kratos, requireSession } from "./kratos.js";

const app = express();
app.use(express.json());

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

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

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Car store backend listening on http://localhost:${PORT}`);
});
