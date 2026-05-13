import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const adminEmail = (req.session as Record<string, unknown>).adminEmail as string | undefined;
  if (!adminEmail) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}
