"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, type CrawlFrequency, type RemoteType } from "@jobbiq/db";
import { crawlPreference } from "@jobbiq/crawler";
import { connectorRegistry } from "@jobbiq/connectors";
import { isCountryCode } from "@jobbiq/core";
import { auth } from "@/auth";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

const REMOTE_TYPES = new Set(["ON_SITE", "HYBRID", "REMOTE", "ANY"]);
const FREQUENCIES = new Set(["HOURLY", "EVERY_6_HOURS", "DAILY", "WEEKLY"]);

export async function savePreferenceAction(formData: FormData) {
  const userId = await requireUserId();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const list = (field: string) =>
    String(formData.get(field) ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const keywords = list("keywords");
  if (!name || keywords.length === 0) {
    redirect("/preferences?error=required");
  }

  const remoteTypeRaw = String(formData.get("remoteType") ?? "ANY");
  const frequencyRaw = String(formData.get("frequency") ?? "DAILY");
  const remoteType = (
    REMOTE_TYPES.has(remoteTypeRaw) ? remoteTypeRaw : "ANY"
  ) as RemoteType;
  const frequency = (
    FREQUENCIES.has(frequencyRaw) ? frequencyRaw : "DAILY"
  ) as CrawlFrequency;

  const sources = formData
    .getAll("sources")
    .map(String)
    .filter((key) => connectorRegistry.has(key));
  if (sources.length === 0) {
    redirect("/preferences?error=nosource");
  }

  const countries = formData
    .getAll("countries")
    .map((value) => String(value).toLowerCase())
    .filter(isCountryCode);
  if (countries.length === 0) {
    redirect("/preferences?error=nocountry");
  }

  const salaryMinRaw = Number(formData.get("salaryMin"));
  const salaryMin =
    Number.isFinite(salaryMinRaw) && salaryMinRaw > 0
      ? Math.round(salaryMinRaw)
      : null;

  const data = {
    name,
    keywords,
    locations: list("locations"),
    contractTypes: list("contractTypes"),
    seniority: list("seniority"),
    excludeCompanies: list("excludeCompanies"),
    remoteType,
    frequency,
    sources,
    countries,
    salaryMin,
    currency: salaryMin ? String(formData.get("currency") ?? "EUR") : null,
    active: formData.get("active") === "on",
  };

  if (id) {
    await prisma.searchPreference.updateMany({
      where: { id, userId },
      data,
    });
  } else {
    await prisma.searchPreference.create({ data: { ...data, userId } });
  }

  revalidatePath("/preferences");
  redirect("/preferences?saved=1");
}

export async function deletePreferenceAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  await prisma.searchPreference.deleteMany({ where: { id, userId } });
  revalidatePath("/preferences");
  redirect("/preferences?deleted=1");
}

export async function runCrawlNowAction(formData: FormData) {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");

  const preference = await prisma.searchPreference.findFirst({
    where: { id, userId },
  });
  if (!preference) {
    redirect("/preferences?error=notfound");
  }

  const results = await crawlPreference(preference, { maxResults: 50 });
  const fetched = results.reduce((sum, r) => sum + r.fetched, 0);
  const errors = results
    .filter((r) => r.failed)
    .map((r) => `${r.sourceKey}: ${r.failed}`);

  await prisma.searchPreference.update({
    where: { id: preference.id },
    data: { lastCrawledAt: new Date() },
  });

  revalidatePath("/preferences");
  revalidatePath("/jobs");
  if (errors.length > 0 && fetched === 0) {
    redirect(`/preferences?error=crawl&detail=${encodeURIComponent(errors[0])}`);
  }
  redirect(`/preferences?crawled=${fetched}`);
}
