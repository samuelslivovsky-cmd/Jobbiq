import { NextResponse, type NextRequest } from "next/server";
import { crawlDuePreferences } from "@jobbiq/crawler";

// Crawling can take a while across sources; requires Fluid Compute (default on
// new Vercel projects) for >60s on the Hobby plan.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results = await crawlDuePreferences({ maxResults: 100 });
  const fetched = results.reduce((sum, r) => sum + r.fetched, 0);
  return NextResponse.json({ crawled: results.length, fetched, results });
}
