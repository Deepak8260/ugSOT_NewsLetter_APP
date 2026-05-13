import { Router, type IRouter } from "express";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import { db, newslettersTable, employeesTable, emailLogsTable } from "@workspace/db";
import { eq, count, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const storage = new Storage();
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
const PRIVATE_DIR = process.env.PRIVATE_OBJECT_DIR ?? "objects";

async function uploadPdfToStorage(buffer: Buffer, originalName: string): Promise<string> {
  const id = randomUUID();
  const objectPath = `${PRIVATE_DIR}/newsletters/${id}-${originalName}`;
  const bucket = storage.bucket(BUCKET_ID);
  const file = bucket.file(objectPath);
  await file.save(buffer, { contentType: "application/pdf", resumable: false });
  return `/objects/newsletters/${id}-${originalName}`;
}

async function sendNewsletterEmails(
  newsletterId: number,
  newsletter: { title: string; topic: string; description: string | null; pdfUrl: string }
): Promise<{ sent: number; failed: number }> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
  const FROM_EMAIL = process.env.FROM_EMAIL ?? "newsletter@ugsot.com";

  const employees = await db.select().from(employeesTable);
  let sent = 0;
  let failed = 0;

  const BATCH_SIZE = 10;
  for (let i = 0; i < employees.length; i += BATCH_SIZE) {
    const batch = employees.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (emp) => {
        try {
          let pdfAttachment: { filename: string; content: string } | null = null;

          if (RESEND_API_KEY && BUCKET_ID) {
            try {
              const objectPath = newsletter.pdfUrl.replace(/^\/objects\//, `${PRIVATE_DIR}/`);
              const bucket = storage.bucket(BUCKET_ID);
              const file = bucket.file(objectPath);
              const [pdfBuffer] = await file.download();
              pdfAttachment = {
                filename: `ugSOT-Newsletter-${newsletter.topic}.pdf`,
                content: pdfBuffer.toString("base64"),
              };
            } catch (err) {
              logger.warn({ err }, "Failed to download PDF for attachment");
            }
          }

          if (!RESEND_API_KEY) {
            logger.warn("RESEND_API_KEY not set — simulating email send");
            await db.insert(emailLogsTable).values({
              employeeEmail: emp.employeeEmail,
              newsletterId,
              deliveryStatus: "sent",
            });
            sent++;
            return;
          }

          const emailBody: Record<string, unknown> = {
            from: FROM_EMAIL,
            to: emp.employeeEmail,
            subject: `ugSOT Newsletter | ${newsletter.topic}`,
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1e3a6f; color: #ffffff; padding: 32px 40px; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .header p { margin: 8px 0 0; font-size: 13px; opacity: 0.8; }
    .body { padding: 40px; color: #333333; }
    .body p { font-size: 15px; line-height: 1.7; margin: 0 0 16px; }
    .highlight { background: #f0f4ff; border-left: 4px solid #1e3a6f; padding: 16px 20px; margin: 24px 0; border-radius: 0 4px 4px 0; }
    .highlight strong { color: #1e3a6f; font-size: 15px; }
    .footer { background: #f8f8f8; padding: 24px 40px; border-top: 1px solid #eeeeee; font-size: 12px; color: #888888; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ugSOT Newsletter</h1>
      <p>upGrad School Of Technology</p>
    </div>
    <div class="body">
      <p>Dear ${emp.employeeName},</p>
      <p>We hope you are doing well.</p>
      <p>Please find attached the latest edition of the ugSOT Newsletter:</p>
      <div class="highlight">
        <strong>${newsletter.title}</strong><br>
        <span style="color:#555;font-size:13px;">${newsletter.topic}</span>
        ${newsletter.description ? `<p style="margin:8px 0 0;font-size:14px;color:#444;">${newsletter.description}</p>` : ""}
      </div>
      <p>This newsletter contains important updates, announcements, and learning highlights from upGrad School Of Technology.</p>
      <p>We encourage you to go through the newsletter and stay updated.</p>
      <p>Best Regards,<br><strong>upGrad School Of Technology</strong></p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} upGrad School Of Technology. This email was sent to ${emp.employeeEmail}.
    </div>
  </div>
</body>
</html>
            `.trim(),
          };

          if (pdfAttachment) {
            emailBody.attachments = [pdfAttachment];
          }

          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(emailBody),
          });

          if (response.ok) {
            await db.insert(emailLogsTable).values({
              employeeEmail: emp.employeeEmail,
              newsletterId,
              deliveryStatus: "sent",
            });
            sent++;
          } else {
            const errData = await response.json().catch(() => ({}));
            const errMsg = JSON.stringify(errData);
            await db.insert(emailLogsTable).values({
              employeeEmail: emp.employeeEmail,
              newsletterId,
              deliveryStatus: "failed",
              errorMessage: errMsg,
            });
            failed++;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await db.insert(emailLogsTable).values({
            employeeEmail: emp.employeeEmail,
            newsletterId,
            deliveryStatus: "failed",
            errorMessage: errMsg,
          });
          failed++;
        }
      })
    );
  }

  return { sent, failed };
}

router.get("/newsletters", requireAuth, async (req, res): Promise<void> => {
  const { page = "1", pageSize = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 20));
  const offset = (pageNum - 1) * size;

  const [newsletters, [{ count: total }]] = await Promise.all([
    db
      .select({
        id: newslettersTable.id,
        title: newslettersTable.title,
        topic: newslettersTable.topic,
        description: newslettersTable.description,
        pdfUrl: newslettersTable.pdfUrl,
        uploadedAt: newslettersTable.uploadedAt,
        totalSent: sql<number>`cast(count(case when ${emailLogsTable.deliveryStatus} = 'sent' then 1 end) as int)`,
        totalFailed: sql<number>`cast(count(case when ${emailLogsTable.deliveryStatus} = 'failed' then 1 end) as int)`,
      })
      .from(newslettersTable)
      .leftJoin(emailLogsTable, eq(newslettersTable.id, emailLogsTable.newsletterId))
      .groupBy(newslettersTable.id)
      .orderBy(desc(newslettersTable.uploadedAt))
      .limit(size)
      .offset(offset),
    db.select({ count: count() }).from(newslettersTable),
  ]);

  res.json({ newsletters, total: Number(total), page: pageNum, pageSize: size });
});

router.post("/newsletters/upload", requireAuth, upload.single("pdf"), async (req, res): Promise<void> => {
  const { title, topic, description } = req.body as Record<string, string>;

  if (!title || !topic) {
    res.status(400).json({ error: "Title and topic are required" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "PDF file is required" });
    return;
  }

  if (req.file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "Only PDF files are allowed" });
    return;
  }

  let pdfUrl: string;
  try {
    pdfUrl = await uploadPdfToStorage(req.file.buffer, req.file.originalname);
  } catch (err) {
    req.log.error({ err }, "Failed to upload PDF");
    res.status(500).json({ error: "Failed to upload PDF" });
    return;
  }

  const [newsletter] = await db
    .insert(newslettersTable)
    .values({ title, topic, description: description || null, pdfUrl })
    .returning();

  req.log.info({ newsletterId: newsletter.id }, "Newsletter created");
  res.status(201).json({ ...newsletter, totalSent: 0, totalFailed: 0 });
});

router.get("/newsletters/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [row] = await db
    .select({
      id: newslettersTable.id,
      title: newslettersTable.title,
      topic: newslettersTable.topic,
      description: newslettersTable.description,
      pdfUrl: newslettersTable.pdfUrl,
      uploadedAt: newslettersTable.uploadedAt,
      totalSent: sql<number>`cast(count(case when ${emailLogsTable.deliveryStatus} = 'sent' then 1 end) as int)`,
      totalFailed: sql<number>`cast(count(case when ${emailLogsTable.deliveryStatus} = 'failed' then 1 end) as int)`,
    })
    .from(newslettersTable)
    .leftJoin(emailLogsTable, eq(newslettersTable.id, emailLogsTable.newsletterId))
    .where(eq(newslettersTable.id, id))
    .groupBy(newslettersTable.id);

  if (!row) { res.status(404).json({ error: "Newsletter not found" }); return; }
  res.json(row);
});

router.delete("/newsletters/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [deleted] = await db.delete(newslettersTable).where(eq(newslettersTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Newsletter not found" }); return; }
  res.json({ message: "Newsletter deleted" });
});

router.post("/newsletters/:id/send", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [newsletter] = await db.select().from(newslettersTable).where(eq(newslettersTable.id, id));
  if (!newsletter) { res.status(404).json({ error: "Newsletter not found" }); return; }

  const employees = await db.select({ count: count() }).from(employeesTable);
  const total = Number(employees[0].count);

  req.log.info({ newsletterId: id, total }, "Starting newsletter send");
  const { sent, failed } = await sendNewsletterEmails(id, newsletter);
  req.log.info({ newsletterId: id, sent, failed }, "Newsletter send complete");

  res.json({ sent, failed, total });
});

router.get("/newsletters/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [newsletter] = await db.select().from(newslettersTable).where(eq(newslettersTable.id, id));
  if (!newsletter) { res.status(404).json({ error: "Newsletter not found" }); return; }

  try {
    const objectPath = newsletter.pdfUrl.replace(/^\/objects\//, `${PRIVATE_DIR}/`);
    const bucket = storage.bucket(BUCKET_ID);
    const file = bucket.file(objectPath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="newsletter-${id}.pdf"`);
    file.createReadStream().pipe(res as unknown as NodeJS.WritableStream);
  } catch (err) {
    req.log.error({ err }, "Failed to stream PDF");
    res.status(500).json({ error: "Failed to download PDF" });
  }
});

export default router;
