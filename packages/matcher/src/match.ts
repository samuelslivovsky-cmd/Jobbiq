import { prisma } from "@jobbiq/db";
import {
  buildProfileTerms,
  candidateProfileDataSchema,
  lexicalScore,
  passesHardFilters,
} from "@jobbiq/core";
import { scoreJobMatch } from "@jobbiq/ai";

export interface MatchRunResult {
  userId: string;
  scored: number;
  aiScored: number;
  skipped?: string;
}

/**
 * Match new job postings against a user's profile.
 *
 * Pipeline per active preference: hard filters → lexical pre-score →
 * AI rerank on the top candidates. When the AI call fails (missing API key,
 * network), the lexical score is stored instead and marked in the reasoning
 * as `scoredBy: "lexical"` so it can be re-scored later.
 */
export async function matchUserJobs(
  userId: string,
  options?: { perPreference?: number; postingPoolSize?: number },
): Promise<MatchRunResult> {
  const perPreference = options?.perPreference ?? 10;
  const postingPoolSize = options?.postingPoolSize ?? 300;

  const profileRow = await prisma.candidateProfile.findUnique({
    where: { userId },
  });
  if (!profileRow) {
    return { userId, scored: 0, aiScored: 0, skipped: "no profile" };
  }

  const profile = candidateProfileDataSchema.parse({
    fullName: profileRow.fullName,
    headline: profileRow.headline,
    summary: profileRow.summary,
    email: profileRow.email,
    phone: profileRow.phone,
    location: profileRow.location,
    skills: profileRow.skills,
    experience: profileRow.experience,
    education: profileRow.education,
    languages: profileRow.languages,
    certifications: profileRow.certifications,
    links: profileRow.links,
  });

  const preferences = await prisma.searchPreference.findMany({
    where: { userId, active: true },
  });
  if (preferences.length === 0) {
    return { userId, scored: 0, aiScored: 0, skipped: "no active preferences" };
  }

  const existing = await prisma.match.findMany({
    where: { userId },
    select: { jobPostingId: true },
  });
  const alreadyMatched = new Set(existing.map((m) => m.jobPostingId));

  const postings = await prisma.jobPosting.findMany({
    orderBy: { fetchedAt: "desc" },
    take: postingPoolSize,
  });

  let scored = 0;
  let aiScored = 0;

  for (const preference of preferences) {
    const terms = buildProfileTerms(profile.skills, preference.keywords);

    const candidates = postings
      .filter((posting) => !alreadyMatched.has(posting.id))
      .filter((posting) => passesHardFilters(posting, preference))
      .map((posting) => ({
        posting,
        lexical: lexicalScore(
          terms,
          `${posting.title}\n${posting.description}`,
        ),
      }))
      .filter(({ lexical }) => lexical > 0)
      .sort((a, b) => b.lexical - a.lexical)
      .slice(0, perPreference);

    for (const { posting, lexical } of candidates) {
      let score: number;
      let reasoning: {
        pros: string[];
        cons: string[];
        missingSkills: string[];
        scoredBy: string;
      };

      try {
        const result = await scoreJobMatch({
          profile,
          job: {
            title: posting.title,
            company: posting.company,
            location: posting.location,
            description: posting.description,
          },
        });
        score = result.score;
        reasoning = {
          pros: result.pros,
          cons: result.cons,
          missingSkills: result.missingSkills,
          scoredBy: "ai",
        };
        aiScored++;
      } catch {
        score = Math.round(lexical * 70); // conservative lexical estimate
        reasoning = {
          pros: [],
          cons: [],
          missingSkills: [],
          scoredBy: "lexical",
        };
      }

      await prisma.match.create({
        data: {
          userId,
          jobPostingId: posting.id,
          preferenceId: preference.id,
          score,
          reasoning,
        },
      });
      alreadyMatched.add(posting.id);
      scored++;
    }
  }

  return { userId, scored, aiScored };
}

/** Match every user that has a profile — used after a scheduled crawl. */
export async function matchUsersForPreferences(
  preferenceIds: string[],
): Promise<MatchRunResult[]> {
  if (preferenceIds.length === 0) return [];
  const preferences = await prisma.searchPreference.findMany({
    where: { id: { in: preferenceIds } },
    select: { userId: true },
  });
  const userIds = [...new Set(preferences.map((p) => p.userId))];

  const results: MatchRunResult[] = [];
  for (const userId of userIds) {
    try {
      results.push(await matchUserJobs(userId));
    } catch (error) {
      results.push({
        userId,
        scored: 0,
        aiScored: 0,
        skipped: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}
