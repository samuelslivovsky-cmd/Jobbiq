import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@jobbiq/db";
import { logoutAction } from "@/app/actions";

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
    { label: "Profile", value: profile ? "Ready" : "Missing CV" },
    { label: "Search preferences", value: String(preferenceCount) },
    { label: "New matches", value: String(matchCount) },
    { label: "Applications", value: String(applicationCount) },
  ];

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-neutral-500">
            Signed in as {session.user.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/profile"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Profile
          </a>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
          >
            Sign out
          </button>
        </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-neutral-500">{stat.label}</p>
            <p className="mt-1 text-xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">
        Next up: upload your CV to build your candidate profile (phase 1), then
        set up search preferences to start collecting job postings (phase 2).
      </div>
    </main>
  );
}
