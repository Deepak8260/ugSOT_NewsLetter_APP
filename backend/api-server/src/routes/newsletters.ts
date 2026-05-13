import { Router, type IRouter } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { db, newslettersTable, employeesTable, emailLogsTable } from "@workspace/db";
import { eq, count, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { randomUUID } from "crypto";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_STORAGE_BUCKET) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET are required");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeStoragePath(value: string): string {
  if (value.startsWith("newsletters/")) return value;
  const filename = value.split("/").pop() ?? "";
  if (!filename) {
    throw new Error("Invalid storage path");
  }
  return `newsletters/${filename}`;
}

async function uploadPdfToStorage(buffer: Buffer, originalName: string): Promise<string> {
  const id = randomUUID();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `newsletters/${id}-${safeName}`;

  const { error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`);
  }

  return storagePath;
}

async function downloadPdfBuffer(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .download(normalizeStoragePath(storagePath));

  if (error || !data) {
    throw new Error(`Supabase storage download failed: ${error?.message ?? "No data"}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function buildEmailHtml(
  employeeName: string,
  employeeEmail: string,
  newsletter: { title: string; topic: string; description: string | null }
): Promise<string> {
  return `
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
      <p>Dear ${employeeName},</p>
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
      &copy; ${new Date().getFullYear()} upGrad School Of Technology. This email was sent to ${employeeEmail}.
    </div>
  </div>
</body>
</html>
  `.trim();
}

async function sendNewsletterEmails(
  newsletterId: number,
  newsletter: { title: string; topic: string; description: string | null; pdfUrl: string },
  customEmails?: string[]
): Promise<{ sent: number; failed: number }> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
  const FROM_EMAIL = process.env.FROM_EMAIL ?? "newsletter@ugsot.com";

  // Use custom emails if provided, otherwise fetch employees
  let recipients: Array<{ employeeEmail: string; employeeName: string }>;
  if (customEmails && customEmails.length > 0) {
    recipients = customEmails.map((email) => ({
      employeeEmail: email,
      employeeName: email.split("@")[0],
    }));
  } else {
    recipients = await db.select().from(employeesTable);
  }

  let sent = 0;
  let failed = 0;

  if (!RESEND_API_KEY) {
    // ✅ Fix: use module-level `logger` instead of `req.log`
    logger.warn("RESEND_API_KEY not set — simulating email send to %d recipients", recipients.length);
    await db.insert(emailLogsTable).values(
      recipients.map((r) => ({
        employeeEmail: r.employeeEmail,
        newsletterId,
        deliveryStatus: "sent" as const,
      }))
    );
    return { sent: recipients.length, failed: 0 };
  }

  // Download PDF once and reuse for all emails
  let pdfAttachment: { filename: string; content: string } | null = null;
  try {
    const pdfBuffer = await downloadPdfBuffer(newsletter.pdfUrl);
    pdfAttachment = {
      filename: `ugSOT-Newsletter-${newsletter.topic}.pdf`,
      content: pdfBuffer.toString("base64"),
    };
  } catch (err) {
    logger.warn({ err }, "Failed to download PDF for attachment");
  }

  const BATCH_SIZE = 100;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    // ✅ Fix: build the array of email request objects for Resend's batch endpoint
    const batchPayload = await Promise.all(
      batch.map(async (recipient) => {
        const html = await buildEmailHtml(recipient.employeeName, recipient.employeeEmail, newsletter);
        return {
          from: FROM_EMAIL,
          to: [recipient.employeeEmail], // Resend expects `to` as an array
          subject: `ugSOT Newsletter | ${newsletter.topic}`,
          html,
          ...(pdfAttachment && { attachments: [pdfAttachment] }),
        };
      })
    );

    try {
      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        // ✅ Fix: batchPayload is already an array — Resend requires the body to be a raw array
        body: JSON.stringify(batchPayload),
      });

      if (response.ok) {
        // ✅ Fix: Resend batch response shape is { data: Array<{ id: string }> }
        const result = (await response.json()) as { data: Array<{ id?: string; error?: string }> };
        logger.info({ newsletterId, batchIndex: i }, "Resend batch response received");

        for (let j = 0; j < batch.length; j++) {
          const recipient = batch[j];
          const emailResult = result.data?.[j];

          if (emailResult?.id) {
            await db.insert(emailLogsTable).values({
              employeeEmail: recipient.employeeEmail,
              newsletterId,
              deliveryStatus: "sent",
            });
            sent++;
          } else {
            const errorMessage = emailResult?.error ?? "No email ID returned from batch send";
            logger.error({ recipient: recipient.employeeEmail, errorMessage }, "Failed to send email in batch");
            await db.insert(emailLogsTable).values({
              employeeEmail: recipient.employeeEmail,
              newsletterId,
              deliveryStatus: "failed",
              errorMessage,
            });
            failed++;
          }
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        logger.error({ errData, status: response.status }, "Resend batch API error");
        const errMsg = JSON.stringify(errData);

        for (const recipient of batch) {
          await db.insert(emailLogsTable).values({
            employeeEmail: recipient.employeeEmail,
            newsletterId,
            deliveryStatus: "failed",
            errorMessage: errMsg,
          });
          failed++;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err, newsletterId }, "Unexpected error during batch send");

      for (const recipient of batch) {
        await db.insert(emailLogsTable).values({
          employeeEmail: recipient.employeeEmail,
          newsletterId,
          deliveryStatus: "failed",
          errorMessage: errMsg,
        });
        failed++;
      }
    }
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

  try {
    const storagePath = normalizeStoragePath(deleted.pdfUrl);
    await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([storagePath]);
  } catch (err) {
    req.log.warn({ err }, "Failed to remove PDF from Supabase storage");
  }

  res.json({ message: "Newsletter deleted" });
});

router.post("/newsletters/:id/send", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [newsletter] = await db.select().from(newslettersTable).where(eq(newslettersTable.id, id));
  if (!newsletter) { res.status(404).json({ error: "Newsletter not found" }); return; }

  const { emails } = (req.body ?? {}) as { emails?: string[] };

  let total: number;
  if (emails && Array.isArray(emails) && emails.length > 0) {
    total = emails.length;
    req.log.info({ newsletterId: id, customEmails: total }, "Starting newsletter send to custom recipients");
  } else {
    const [{ count: empCount }] = await db.select({ count: count() }).from(employeesTable);
    total = Number(empCount);
    req.log.info({ newsletterId: id, employees: total }, "Starting newsletter send to all employees");
  }

  const cleanEmails = emails?.filter((e) => typeof e === "string" && e.trim().length > 0);
  const { sent, failed } = await sendNewsletterEmails(id, newsletter, cleanEmails);
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
    const storagePath = normalizeStoragePath(newsletter.pdfUrl);
    const { data, error } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 10);
    if (error || !data?.signedUrl) {
      req.log.error({ error }, "Failed to create signed URL");
      res.status(500).json({ error: "Failed to download PDF" });
      return;
    }
    res.redirect(data.signedUrl);
  } catch (err) {
    req.log.error({ err }, "Failed to stream PDF");
    res.status(500).json({ error: "Failed to download PDF" });
  }
});

export default router;