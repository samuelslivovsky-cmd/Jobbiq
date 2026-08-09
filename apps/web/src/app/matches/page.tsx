import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma, type MatchStatus } from "@jobbiq/db";
import { auth } from "@/auth";
import { findMatchesAction, updateMatchStatusAction } from "./actions";
import { applyToMatchAction } from "@/app/applications/actions";

// AI scoring of candidate postings can take a while.
export const maxDuration = 300;

interface Reasoning {
  pros?: string[];
  cons?: string[];
  missingSkills?: string[];
  scoredBy?: string;
}

const TABS: { key: MatchStatus; label: string }[] = [
  { key: "NEW", label: "New" },
  { key: "SAVED", label: "Saved" },
  { key: "DISMISSED", label: "Dismissed" },
  { key: "APPLIED", label: "Applied" },
];

function scoreColor(score: number): string {
  if (score >= 75) return "bg-green-100 text-green-800";
  if (score >= 50) return "bg-amber-100 text-amber-800";
  return "bg-neutral-100 text-neutral-600";
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const params = await searchParams;
  const status = (
    TABS.some((t) => t.key === params.status) ? params.status : "NEW"
  ) as MatchStatus;

  const matches = await prisma.match.findMany({
    where: { userId, status },
    orderBy: { score: "desc" },
    take: 100,
    include: {
      jobPosting: {
        select: {
          title: true,
          company: true,
          location: true,
          remoteType: true,
          salaryText: true,
          url: true,
          source: { select: { name: true } },
        },
      },
      preference: { select: { name: true } },
    },
  });

  let message: { kind: "ok" | "err"; text: string } | undefined;
  if (params.found !== undefined) {
    message = {
      kind: "ok",
      text:
        Number(params.found) > 0
          ? `Found ${params.found} new matches (${params.ai} AI-scored).`
          : "No new matches — crawl more postings or broaden your preferences.",
    };
  } else if (params.error) {
    message = { kind: "err", text: `Matching skipped: ${params.error}` };
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Matches</h1>
        <div className="flex items-center gap-3">
          <form action={findMatchesAction}>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Find matches now
            </button>
          </form>
          <Link href="/dashboard" className="text-sm text-neutral-500 underline">
            Dashboard
          </Link>
        </div>
      </div>

      {message && (
        <p
          className={`mb-6 rounded-md p-3 text-sm ${
            message.kind === "ok"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mb-6 flex gap-1 rounded-lg bg-neutral-100 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/matches?status=${tab.key}`}
            className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm ${
              status === tab.key
                ? "bg-white font-medium shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {status === "NEW" ? (
            <>
              No new matches. Upload a CV, set up{" "}
              <Link href="/preferences" className="underline">
                preferences
              </Link>
              , crawl postings, then hit “Find matches now”.
            </>
          ) : (
            "Nothing here yet."
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {matches.map((match) => {
            const reasoning = (match.reasoning ?? {}) as Reasoning;
            return (
              <li
                key={match.id}
                className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-sm font-semibold ${scoreColor(match.score)}`}
                      >
                        {match.score}
                      </span>
                      <a
                        href={match.jobPosting.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-medium hover:underline"
                      >
                        {match.jobPosting.title}
                      </a>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {match.jobPosting.company}
                      {match.jobPosting.location
                        ? ` · ${match.jobPosting.location}`
                        : ""}
                      {match.jobPosting.salaryText
                        ? ` · ${match.jobPosting.salaryText}`
                        : ""}
                      {" · "}
                      {match.jobPosting.source.name} · pref: {match.preference.name}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {(status === "NEW" || status === "SAVED") && (
                      <form action={applyToMatchAction}>
                        <input type="hidden" name="matchId" value={match.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
                        >
                          Apply
                        </button>
                      </form>
                    )}
                    {status !== "SAVED" && (
                      <StatusButton id={match.id} status="SAVED" backTo={status} label="Save" />
                    )}
                    {status !== "DISMISSED" && (
                      <StatusButton id={match.id} status="DISMISSED" backTo={status} label="Dismiss" />
                    )}
                    {status !== "NEW" && status !== "APPLIED" && (
                      <StatusButton id={match.id} status="NEW" backTo={status} label="Restore" />
                    )}
                  </div>
                </div>

                {reasoning.scoredBy === "lexical" ? (
                  <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                    Keyword-based estimate — AI scoring was unavailable. Re-run
                    “Find matches now” with ANTHROPIC_API_KEY configured for a
                    full assessment.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    {(reasoning.pros?.length ?? 0) > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">
                          Pros
                        </p>
                        <ul className="list-inside list-disc text-neutral-600">
                          {reasoning.pros!.map((pro, i) => (
                            <li key={i}>{pro}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {((reasoning.cons?.length ?? 0) > 0 ||
                      (reasoning.missingSkills?.length ?? 0) > 0) && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                          Cons / missing
                        </p>
                        <ul className="list-inside list-disc text-neutral-600">
                          {reasoning.cons?.map((con, i) => <li key={i}>{con}</li>)}
                          {reasoning.missingSkills?.map((skill, i) => (
                            <li key={`m${i}`}>Missing: {skill}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function StatusButton({
  id,
  status,
  backTo,
  label,
}: {
  id: string;
  status: string;
  backTo: string;
  label: string;
}) {
  return (
    <form action={updateMatchStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="backTo" value={backTo} />
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
      >
        {label}
      </button>
    </form>
  );
}
