import { Configuration, FrontendApi, type Session } from "@ory/client";
import type { NextFunction, Request, Response } from "express";

const KRATOS_PUBLIC_URL =
  process.env.KRATOS_PUBLIC_URL ?? "http://localhost:4433";

export const kratos = new FrontendApi(
  new Configuration({ basePath: KRATOS_PUBLIC_URL }),
);

// Augment Express Request with the resolved Kratos session.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

/**
 * Validates the Ory Kratos session by forwarding the browser cookies to the
 * Kratos `whoami` endpoint. Populates `req.session` on success.
 */
export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { data: session } = await kratos.toSession({
      cookie: req.header("cookie") ?? undefined,
    });

    if (!session.active) {
      res.status(401).json({ error: "Session is not active" });
      return;
    }

    req.session = session;
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

/** Best-effort session lookup that never throws — used for optional auth. */
export async function getSession(req: Request): Promise<Session | null> {
  try {
    const { data } = await kratos.toSession({
      cookie: req.header("cookie") ?? undefined,
    });
    return data.active ? data : null;
  } catch {
    return null;
  }
}
