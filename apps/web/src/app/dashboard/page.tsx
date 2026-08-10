import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@jobbiq/db";
import { AppNav } from "@/components/AppNav";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const [profile, preferenceCount, matchCount, applicationCount] =
    await Promise.all([
      prisma.candidateProfile.findUnique({ where: { userId } }),
      prisma.searchPreference.count({ where: { userId } }),
      prisma.match.count({ where: { userId, status: "NEW" } }),
      prisma.application.count({ where: { userId } }),
    ]);

  const stats = [
    { label: "Profile", value: profile ? "Ready" : "Missing CV", href: "/profile" },
    { label: "Preferences", value: String(preferenceCount), href: "/preferences" },
    { label: "New matches", value: String(matchCount), href: "/matches" },
    { label: "Applications", value: String(applicationCount), href: "/applications" },
  ];

  const nextStep = !profile
    ? { href: "/profile", text: "Start by uploading your CV — we'll extract your profile from it." }
    : preferenceCount === 0
      ? { href: "/preferences", text: "Set up a search preference so we can start collecting job postings." }
      : matchCount === 0
        ? { href: "/matches", text: "Run matching to score fresh postings against your profile." }
        : { href: "/matches", text: `You have ${matchCount} new matches waiting for review.` };

  return (
    <>
      <AppNav current="dashboard" />
      <main className="mx-auto max-w-4xl p-4 md:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-stone-500">
            Signed in as {session.user.email}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {stats.map((stat) => (
            <a
              key={stat.label}
              href={stat.href}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-600/50"
            >
              <p className="text-xs text-stone-500 md:text-sm">{stat.label}</p>
              <p className="mt-1 text-lg font-semibold md:text-xl">{stat.value}</p>
            </a>
          ))}
        </div>

        <a
          href={nextStep.href}
          className="mt-6 block rounded-xl border border-emerald-600/30 bg-emerald-50 p-4 text-sm text-emerald-900 hover:border-emerald-600/60"
        >
          <span className="font-semibold">Next step:</span> {nextStep.text}
        </a>
      </main>
    </>
  );
}
