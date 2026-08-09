import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@jobbiq/db";
import { auth } from "@/auth";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const take = Math.min(
    Number(request.nextUrl.searchParams.get("take") ?? 50),
    200,
  );
  const jobs = await prisma.jobPosting.findMany({
    take,
    orderBy: { fetchedAt: "desc" },
    select: {
      id: true,
      title: true,
      company: true,
      location: true,
      remoteType: true,
      salaryText: true,
      url: true,
      postedAt: true,
      fetchedAt: true,
      source: { select: { key: true, name: true } },
    },
  });
  return NextResponse.json({ jobs });
}
