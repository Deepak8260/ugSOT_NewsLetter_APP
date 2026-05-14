import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, employeesTable } from "@workspace/db";
import { eq, ilike, or, count, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.get("/employees", requireAuth, async (req, res): Promise<void> => {
  try {
    const { search, page = "1", pageSize = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
    const offset = (pageNum - 1) * size;

    let query = db.select().from(employeesTable);
    let countQuery = db.select({ count: count() }).from(employeesTable);

    if (search) {
      const filter = or(
        ilike(employeesTable.employeeName, `%${search}%`),
        ilike(employeesTable.employeeEmail, `%${search}%`)
      );
      query = query.where(filter) as typeof query;
      countQuery = countQuery.where(filter) as typeof countQuery;
    }

    const [employees, [{ count: total }]] = await Promise.all([
      query.limit(size).offset(offset).orderBy(employeesTable.createdAt),
      countQuery,
    ]);

    res.json({ employees, total: Number(total), page: pageNum, pageSize: size });
  } catch (err) {
    req.log.error({ err }, "Failed to get employees");
    res.status(500).json({ error: "Failed to get employees" });
  }
});

router.delete("/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db.delete(employeesTable).where(eq(employeesTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json({ message: "Employee deleted" });
});

router.post("/employees/upload", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const ext = req.file.originalname.split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
    res.status(400).json({ error: "Invalid file format. Use .xlsx, .xls, or .csv" });
    return;
  }

  let rows: Record<string, unknown>[] = [];
  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
  } catch (err) {
    res.status(400).json({ error: "Failed to parse file" });
    return;
  }

  req.log.info({ rowCount: rows.length, rows }, "Parsed employees from file");

  let added = 0;
  let skipped = 0;
  let invalid = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowIndex = i + 1;

    req.log.info({ rowIndex, row }, "Processing row");

    const name = String(
      row["Employee Name"] ?? row["employee_name"] ?? row["Name"] ?? row["name"] ?? ""
    ).trim();
    const email = String(
      row["Employee Email"] ?? row["employee_email"] ?? row["Email"] ?? row["email"] ?? ""
    ).trim().toLowerCase();

    req.log.info({ rowIndex, name, email }, "Extracted name and email");

    if (!name && !email) {
      req.log.info({ rowIndex }, "Skipping empty row");
      continue;
    }

    if (!name || !email) {
      invalid++;
      const errorMsg = `Row ${rowIndex} with name="${name}" email="${email}": missing required fields`;
      errors.push(errorMsg);
      req.log.warn({ rowIndex, name, email }, errorMsg);
      continue;
    }

    if (!isValidEmail(email)) {
      invalid++;
      const errorMsg = `Row ${rowIndex}: Invalid email: ${email}`;
      errors.push(errorMsg);
      req.log.warn({ rowIndex, email }, errorMsg);
      continue;
    }

    try {
      await db.insert(employeesTable).values({ employeeName: name, employeeEmail: email }).onConflictDoNothing();
      added++;
      req.log.info({ rowIndex, name, email }, "Added employee");
    } catch (err) {
      skipped++;
      const errorMsg = `Row ${rowIndex}: Duplicate email skipped: ${email}`;
      errors.push(errorMsg);
      req.log.warn({ rowIndex, email, err }, errorMsg);
    }
  }

  req.log.info({ added, skipped, invalid }, "Employee upload complete");
  res.json({ added, skipped, invalid, errors: errors.slice(0, 50) });
});

router.get("/employees/stats", requireAuth, async (_req, res): Promise<void> => {
  const [{ count: total }] = await db.select({ count: count() }).from(employeesTable);
  res.json({ total: Number(total) });
});

export default router;
