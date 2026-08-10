import { readFile } from "fs/promises";
import { prisma } from "@jobbiq/db";
import type { MailAttachment } from "./mailer";

async function downloadBlob(url: string): Promise<Buffer | null> {
  // Private blobs need the authenticated SDK; try private first, then public,
  // then a plain fetch (covers non-Vercel URLs).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { get } = await import("@vercel/blob");
    for (const access of ["private", "public"] as const) {
      try {
        const result = await get(url, { access });
        if (result?.statusCode === 200 && result.stream) {
          return Buffer.from(await new Response(result.stream).arrayBuffer());
        }
      } catch {
        // try the next access mode
      }
    }
  }
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

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
    const content = cv.fileUrl.startsWith("http")
      ? await downloadBlob(cv.fileUrl)
      : await readFile(cv.fileUrl);
    if (!content) return null;
    return { filename: cv.fileName, content, contentType: cv.mimeType };
  } catch {
    return null;
  }
}
