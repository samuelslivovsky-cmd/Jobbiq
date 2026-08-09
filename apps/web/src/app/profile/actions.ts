"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@jobbiq/db";
import { parseCvText } from "@jobbiq/ai";
import { auth } from "@/auth";
import { extractCvText } from "@/lib/extractText";
import { storeCvFile } from "@/lib/cvStorage";

const MAX_CV_BYTES = 5 * 1024 * 1024;

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function uploadCvAction(formData: FormData) {
  const userId = await requireUserId();

  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/profile?error=nofile");
  }
  if (file.size > MAX_CV_BYTES) {
    redirect("/profile?error=toolarge");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rawText: string;
  try {
    rawText = await extractCvText(buffer, file.type, file.name);
  } catch {
    redirect("/profile?error=unsupported");
  }
  if (rawText.length < 100) {
    redirect("/profile?error=empty");
  }

  const fileUrl = await storeCvFile(userId, buffer, file.name, file.type);

  const cvDocument = await prisma.cvDocument.create({
    data: {
      userId,
      fileUrl,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      rawText,
    },
  });

  try {
    const parsed = await parseCvText(rawText);
    await prisma.$transaction([
      prisma.candidateProfile.upsert({
        where: { userId },
        create: {
          userId,
          fullName: parsed.fullName,
          headline: parsed.headline,
          summary: parsed.summary,
          email: parsed.email,
          phone: parsed.phone,
          location: parsed.location,
          skills: parsed.skills,
          experience: parsed.experience,
          education: parsed.education,
          languages: parsed.languages,
          certifications: parsed.certifications,
          links: parsed.links,
          editedByUser: false,
        },
        update: {
          fullName: parsed.fullName,
          headline: parsed.headline,
          summary: parsed.summary,
          email: parsed.email,
          phone: parsed.phone,
          location: parsed.location,
          skills: parsed.skills,
          experience: parsed.experience,
          education: parsed.education,
          languages: parsed.languages,
          certifications: parsed.certifications,
          links: parsed.links,
          editedByUser: false,
        },
      }),
      prisma.cvDocument.update({
        where: { id: cvDocument.id },
        data: { parsedAt: new Date() },
      }),
    ]);
  } catch (error) {
    console.error("CV parsing failed:", error);
    redirect("/profile?error=parse");
  }

  revalidatePath("/profile");
  redirect("/profile?parsed=1");
}

export async function saveProfileAction(formData: FormData) {
  const userId = await requireUserId();

  const text = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    return value.length > 0 ? value : null;
  };
  const list = (name: string) =>
    String(formData.get(name) ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const lines = (name: string) =>
    String(formData.get(name) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const fullName = text("fullName");
  if (!fullName) {
    redirect("/profile?error=noname");
  }

  const languages = lines("languages").map((line) => {
    const [language, level] = line.split("-").map((part) => part.trim());
    return { language: language ?? line, level: level ?? null };
  });
  const links = lines("links").map((line) => {
    const [label, url] = line.split("|").map((part) => part.trim());
    return url ? { label, url } : { label: "Link", url: label };
  });

  await prisma.candidateProfile.update({
    where: { userId },
    data: {
      fullName,
      headline: text("headline"),
      summary: text("summary"),
      email: text("email"),
      phone: text("phone"),
      location: text("location"),
      skills: list("skills"),
      certifications: list("certifications"),
      languages,
      links,
      editedByUser: true,
    },
  });

  revalidatePath("/profile");
  redirect("/profile?saved=1");
}
