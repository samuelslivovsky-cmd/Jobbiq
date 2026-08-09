import { NextResponse } from "next/server";
import { prisma } from "@jobbiq/db";

export async function GET() {
  let database = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }
  return NextResponse.json({ status: "ok", database });
}
