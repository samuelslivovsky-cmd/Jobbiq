import { Controller, Get } from "@nestjs/common";
import { prisma } from "@jobbiq/db";

@Controller("health")
export class HealthController {
  @Get()
  async health() {
    let database = "ok";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "unreachable";
    }
    return { status: "ok", database };
  }
}
