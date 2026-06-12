import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { CalendarError, createCalendarEvent, isLinked } from "./calendar.js";
import { cars, orders, type Order } from "./data.js";
import { getSession, requireSession } from "./kratos.js";

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
  const session = await getSession(req);
  if (!session) {
    res.json({ authenticated: false });
    return;
  }
  const traits = (session.identity?.traits ?? {}) as {
    username?: string;
    name?: { first?: string; last?: string };
  };
  res.json({
    authenticated: true,
    id: session.identity?.id,
    username: traits.username,
    name: traits.name,
  });
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

  const traits = (req.session!.identity?.traits ?? {}) as { username?: string };
  const order: Order = {
    id: randomUUID(),
    carId,
    identityId: req.session!.identity!.id,
    username: traits.username ?? "",
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

// Is Google linked to the current identity (via Kratos)?
app.get("/api/google/calendar/status", requireSession, async (req, res) => {
  res.json({ connected: await isLinked(req.session!.identity!.id) });
});

// --- Schedule a visit (protected) -----------------------------------------
// Creates a 30-minute event in the user's Google Calendar using the OAuth
// token Kratos stored at Google sign-in.
app.post("/api/visits", requireSession, async (req, res) => {
  const { carId, start, timeZone } = req.body ?? {};
  const car = cars.find((c) => c.id === carId);
  if (!car) {
    res.status(400).json({ error: "Unknown carId" });
    return;
  }
  if (typeof start !== "string") {
    res.status(400).json({ error: "Missing start time" });
    return;
  }

  try {
    const event = await createCalendarEvent({
      identityId: req.session!.identity!.id,
      summary: `Visit seller — ${car.make} ${car.model}`,
      description:
        `Test drive / viewing for the ${car.year} ${car.make} ${car.model} ` +
        `(listed at $${car.price.toLocaleString()}).`,
      startISO: start,
      timeZone: typeof timeZone === "string" && timeZone ? timeZone : "UTC",
      durationMinutes: 30,
    });
    res.status(201).json(event);
  } catch (err) {
    if (err instanceof CalendarError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("Calendar error:", err);
    res.status(500).json({ error: "Could not create the calendar event" });
  }
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Car store backend listening on http://localhost:${PORT}`);
});
