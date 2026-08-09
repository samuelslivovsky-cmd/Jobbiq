import { Controller, Get, Query } from "@nestjs/common";
import { prisma } from "@jobbiq/db";

@Controller("jobs")
export class JobsController {
  @Get()
  async list(@Query("take") take?: string) {
    const jobs = await prisma.jobPosting.findMany({
      take: Math.min(Number(take ?? 50), 200),
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
    return { jobs };
  }
}
