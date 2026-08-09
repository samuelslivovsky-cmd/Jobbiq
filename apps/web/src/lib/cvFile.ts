import { readFile } from "fs/promises";
import { prisma } from "@jobbiq/db";
import type { MailAttachment } from "./mailer";

/** Loads the user's most recent CV file for attaching to application emails. */
export async function getLatestCvAttachment(
  userId: string,
): Promise<MailAttachment | null> {
  const cv = await prisma.cvDocument.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (!cv) return null;

  try {
    let content: Buffer;
    if (cv.fileUrl.startsWith("http")) {
      const response = await fetch(cv.fileUrl);
      if (!response.ok) return null;
      content = Buffer.from(await response.arrayBuffer());
    } else {
      content = await readFile(cv.fileUrl);
    }
    return { filename: cv.fileName, content, contentType: cv.mimeType };
  } catch {
    return null;
  }
}
