import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";

/**
 * Stores a CV file and returns a URL/path reference.
 *
 * On Vercel this uses Vercel Blob (BLOB_READ_WRITE_TOKEN is injected when a
 * Blob store is attached to the project). Blob URLs are public but contain an
 * unguessable random suffix.
 *
 * Without a Blob store: locally files land in .uploads/ (gitignored); on
 * Vercel the filesystem is read-only except /tmp, so the file is written
 * there — it does NOT survive between invocations (parsing works, but email
 * attachments need the Blob store).
 */
export async function storeCvFile(
  userId: string,
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<string> {
  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const pathname = `cv/${userId}/${safeName}`;
    // CVs are personal data — prefer a private store; fall back to public
    // when the attached store doesn't support private access.
    try {
      const blob = await put(pathname, buffer, {
        access: "private",
        addRandomSuffix: true,
        contentType,
      });
      return blob.url;
    } catch {
      const blob = await put(pathname, buffer, {
        access: "public",
        addRandomSuffix: true,
        contentType,
      });
      return blob.url;
    }
  }

  const baseDir = process.env.VERCEL
    ? path.join(os.tmpdir(), "jobbiq-uploads")
    : path.join(process.cwd(), ".uploads");
  const dir = path.join(baseDir, userId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  await writeFile(filePath, buffer);
  return filePath;
}
