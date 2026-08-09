import { mkdir, writeFile } from "fs/promises";
import path from "path";

/**
 * Stores a CV file and returns a URL/path reference.
 *
 * On Vercel this uses Vercel Blob (BLOB_READ_WRITE_TOKEN is injected when a
 * Blob store is attached to the project). Blob URLs are public but contain an
 * unguessable random suffix. Locally, files land in .uploads/ (gitignored).
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
    const blob = await put(`cv/${userId}/${safeName}`, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });
    return blob.url;
  }

  const dir = path.join(process.cwd(), ".uploads", userId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${safeName}`);
  await writeFile(filePath, buffer);
  return filePath;
}
