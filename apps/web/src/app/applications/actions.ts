"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, type ApplicationStatus } from "@jobbiq/db";
import { candidateProfileDataSchema } from "@jobbiq/core";
import {
  generateApplicationEmail,
  EMAIL_PROMPT_VERSION,
  MODELS,
} from "@jobbiq/ai";
import { auth } from "@/auth";
import { sendMail } from "@/lib/mailer";
import { getLatestCvAttachment } from "@/lib/cvFile";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

async function generateEmailForApplication(
  applicationId: string,
  userId: string,
): Promise<void> {
  const application = await prisma.application.findFirstOrThrow({
    where: { id: applicationId, userId },
    include: { jobPosting: true },
  });
  const profileRow = await prisma.candidateProfile.findUniqueOrThrow({
    where: { userId },
  });

  const profile = candidateProfileDataSchema.parse({
    fullName: profileRow.fullName,
    headline: profileRow.headline,
    summary: profileRow.summary,
    email: profileRow.email,
    phone: profileRow.phone,
    location: profileRow.location,
    skills: profileRow.skills,
    experience: profileRow.experience,
    education: profileRow.education,
    languages: profileRow.languages,
    certifications: profileRow.certifications,
    links: profileRow.links,
  });

  const template = await prisma.emailTemplate.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  const email = await generateApplicationEmail({
    profile,
    job: {
      title: application.jobPosting.title,
      company: application.jobPosting.company,
      location: application.jobPosting.location,
      description: application.jobPosting.description,
    },
    template: template
      ? { tone: template.tone, instructions: template.instructions }
      : undefined,
  });

  await prisma.generatedEmail.create({
    data: {
      applicationId,
      subject: email.subject,
      body: email.body,
      language: email.language,
      modelUsed: MODELS.emailWriter,
      promptVersion: EMAIL_PROMPT_VERSION,
    },
  });
}

export async function applyToMatchAction(formData: FormData) {
  const userId = await requireUserId();
  const matchId = String(formData.get("matchId") ?? "");

  const match = await prisma.match.findFirst({
    where: { id: matchId, userId },
  });
  if (!match) redirect("/matches");

  const application = await prisma.application.upsert({
    where: {
      userId_jobPostingId: { userId, jobPostingId: match.jobPostingId },
    },
    create: { userId, jobPostingId: match.jobPostingId },
    update: {},
  });
  await prisma.match.update({
    where: { id: match.id },
    data: { status: "APPLIED" },
  });

  let generated = true;
  try {
    const existingEmail = await prisma.generatedEmail.findFirst({
      where: { applicationId: application.id },
    });
    if (!existingEmail) {
      await generateEmailForApplication(application.id, userId);
    }
  } catch (error) {
    console.error("Email generation failed:", error);
    generated = false;
  }

  revalidatePath("/applications");
  revalidatePath("/matches");
  redirect(generated ? "/applications" : "/applications?error=generate");
}

export async function regenerateEmailAction(formData: FormData) {
  const userId = await requireUserId();
  const applicationId = String(formData.get("applicationId") ?? "");

  try {
    await generateEmailForApplication(applicationId, userId);
  } catch (error) {
    console.error("Email generation failed:", error);
    redirect("/applications?error=generate");
  }
  revalidatePath("/applications");
  redirect("/applications?generated=1");
}

export async function saveEmailAction(formData: FormData) {
  const userId = await requireUserId();
  const applicationId = String(formData.get("applicationId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!subject || !body) redirect("/applications?error=emptymail");

  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
  });
  if (!application) redirect("/applications");

  const latest = await prisma.generatedEmail.findFirst({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });

  if (latest) {
    await prisma.generatedEmail.update({
      where: { id: latest.id },
      data: { subject, body, userEdited: true },
    });
  } else {
    await prisma.generatedEmail.create({
      data: {
        applicationId,
        subject,
        body,
        language: "unknown",
        modelUsed: "manual",
        promptVersion: "manual",
        userEdited: true,
      },
    });
  }

  revalidatePath("/applications");
  redirect("/applications?saved=1");
}

export async function sendApplicationAction(formData: FormData) {
  const userId = await requireUserId();
  const applicationId = String(formData.get("applicationId") ?? "");
  const to = String(formData.get("to") ?? "").trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    redirect("/applications?error=badrecipient");
  }

  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId, status: "DRAFT" },
    include: {
      emails: { orderBy: { createdAt: "desc" }, take: 1 },
      user: { select: { email: true } },
    },
  });
  if (!application) redirect("/applications");
  const email = application.emails[0];
  if (!email) redirect("/applications?error=noemail");

  const attachment = await getLatestCvAttachment(userId);

  try {
    await sendMail({
      to,
      subject: email.subject,
      text: email.body,
      replyTo: application.user.email,
      attachments: attachment ? [attachment] : undefined,
    });
  } catch (error) {
    console.error("Sending failed:", error);
    redirect(
      `/applications?error=send&detail=${encodeURIComponent(
        error instanceof Error ? error.message : "unknown",
      )}`,
    );
  }

  await prisma.application.update({
    where: { id: application.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath("/applications");
  redirect("/applications?sent=1");
}

const TRACK_STATUSES = new Set([
  "SENT",
  "REPLIED",
  "INTERVIEW",
  "REJECTED",
  "OFFER",
]);

export async function updateApplicationStatusAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!TRACK_STATUSES.has(status)) redirect("/applications");

  await prisma.application.updateMany({
    where: { id, userId, NOT: { status: "DRAFT" } },
    data: { status: status as ApplicationStatus },
  });

  revalidatePath("/applications");
  redirect(`/applications?tab=${status}`);
}
