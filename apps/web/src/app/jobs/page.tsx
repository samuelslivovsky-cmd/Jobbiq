import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type Prisma } from "@jobbiq/db";
import { COUNTRY_LABELS, SUPPORTED_COUNTRIES, isCountryCode } from "@jobbiq/core";
import { auth } from "@/auth";
import { AppNav } from "@/components/AppNav";

const REMOTE_LABELS: Record<string, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ON_SITE: "On-site",
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { q, country: countryParam } = await searchParams;
  const country = countryParam && isCountryCode(countryParam) ? countryParam : undefined;

  const where: Prisma.JobPostingWhereInput = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (country) where.country = country;

  const jobs = await prisma.jobPosting.findMany({
    where,
    take: 100,
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { fetchedAt: "desc" }],
    select: {
      id: true,
      title: true,
      company: true,
      location: true,
      country: true,
      remoteType: true,
      salaryText: true,
      url: true,
      postedAt: true,
      source: { select: { name: true } },
    },
  });

  return (
    <>
      <AppNav current="jobs" />
    <main className="mx-auto max-w-4xl p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-semibold">Job feed</h1>

      <form className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search title, company or description…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          name="country"
          defaultValue={country ?? ""}
          aria-label="Country"
          className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">All countries</option>
          {SUPPORTED_COUNTRIES.map((code) => (
            <option key={code} value={code}>
              {COUNTRY_LABELS[code]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Search
        </button>
      </form>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No postings yet. Create a{" "}
          <Link href="/preferences" className="underline">
            search preference
          </Link>{" "}
          and run a crawl.
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline"
                  >
                    {job.title}
                  </a>
                  <p className="text-sm text-neutral-500">
                    {job.company}
                    {job.location ? ` · ${job.location}` : ""}
                    {job.country ? ` · ${job.country.toUpperCase()}` : ""}
                    {job.remoteType ? ` · ${REMOTE_LABELS[job.remoteType]}` : ""}
                  </p>
                  {job.salaryText && (
                    <p className="mt-1 text-sm text-neutral-600">{job.salaryText}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2 text-xs text-neutral-400 sm:flex-col sm:text-right">
                  <p>{job.source.name}</p>
                  {job.postedAt && <p>{job.postedAt.toLocaleDateString()}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
    </>
  );
}
