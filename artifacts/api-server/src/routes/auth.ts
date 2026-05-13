import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? "";
const ADMIN_PASSWORD_PLAIN = process.env.ADMIN_PASSWORD ?? "";

async function checkPassword(input: string): Promise<boolean> {
  if (ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(input, ADMIN_PASSWORD_HASH);
  }
  if (ADMIN_PASSWORD_PLAIN) {
    return input === ADMIN_PASSWORD_PLAIN;
  }
  return false;
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (email !== ADMIN_EMAIL) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await checkPassword(password);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  (req.session as Record<string, unknown>).adminEmail = email;
  req.log.info({ email }, "Admin logged in");
  res.json({ email, loggedIn: true });
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, "Session destroy error");
    }
  });
  res.json({ message: "Logged out" });
});

router.get("/auth/me", (req, res): void => {
  const adminEmail = (req.session as Record<string, unknown>).adminEmail as string | undefined;
  if (!adminEmail) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json({ email: adminEmail, loggedIn: true });
});

export default router;
