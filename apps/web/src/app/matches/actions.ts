"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, type MatchStatus } from "@jobbiq/db";
import { matchUserJobs } from "@jobbiq/matcher";
import { auth } from "@/auth";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

const STATUSES = new Set(["NEW", "SAVED", "DISMISSED"]);

export async function updateMatchStatusAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const backTo = String(formData.get("backTo") ?? "NEW");

  if (!STATUSES.has(status)) redirect("/matches");

  await prisma.match.updateMany({
    where: { id, userId },
    data: { status: status as MatchStatus },
  });

  revalidatePath("/matches");
  redirect(`/matches?status=${backTo}`);
}

export async function findMatchesAction() {
  const userId = await requireUserId();

  const result = await matchUserJobs(userId);
  revalidatePath("/matches");

  if (result.skipped) {
    redirect(`/matches?error=${encodeURIComponent(result.skipped)}`);
  }
  redirect(`/matches?found=${result.scored}&ai=${result.aiScored}`);
}
