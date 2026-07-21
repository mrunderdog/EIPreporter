import assert from "node:assert/strict";
import test from "node:test";
import { buildChartData } from "../src/chart-data.ts";
import type { WeeklyRadarReport } from "../src/types.ts";

test("builds Phase 6 momentum, sub-trend, event, matrix, and action chart data", () => {
  const chartData = buildChartData(makeReport());

  assert.deepEqual(chartData.statusDistribution, {
    labels: ["Final", "Draft"],
    data: [2, 1],
  });
  assert.deepEqual(chartData.developerMomentumScores, {
    labels: ["DeFi / Vault", "Account Abstraction"],
    data: [80, 60],
  });
  assert.equal(chartData.weeklyEventTypeDistribution.labels[0], "신규 제안");
  assert.deepEqual(chartData.themeDistribution180d, {
    labels: ["DeFi / Vault", "Account Abstraction"],
    data: [2, 1],
  });
  assert.deepEqual(chartData.subTrendDistributionByTheme["DeFi / Vault"], {
    labels: ["ERC-4626 vault extension"],
    data: [2],
  });
  assert.deepEqual(chartData.accountAbstractionSubTrendDistribution, {
    labels: ["Paymaster / gas sponsorship"],
    data: [1],
  });
  assert.equal(chartData.kgldOpportunityMatrix[0]?.score, 80);
  assert.deepEqual(chartData.kgldRecommendedActionDistribution, {
    labels: ["poc", "monitor"],
    data: [1, 1],
  });
});

function makeReport(): Omit<WeeklyRadarReport, "chartData"> {
  return {
    generatedAt: "2026-06-12T00:00:00.000Z",
    trendPeriod: { from: "2025-12-14T00:00:00.000Z", to: "2026-06-12T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-06-05T00:00:00.000Z", to: "2026-06-12T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 1, collectedAt: "2026-06-12T00:00:00.000Z", proposalCount: 3 },
      totalProposals: 3,
      trendProposalCount: 3,
      proposalsByRepo: { "ethereum/ercs": 3 },
      proposalsByStatus: { Final: 2, Draft: 1 },
      proposalsByType: { "Standards Track": 3 },
      proposalsByCategory: { ERC: 3 },
      themeInsights: [
        {
          theme: "DeFi / Vault",
          proposalCount: 2,
          proposalCount180d: 2,
          recentChangeCount: 1,
          recentChangeCount7d: 1,
          discussionProposalCount: 1,
          contentChangeCount: 0,
          maturitySignal: "high",
          momentumScore: 80,
          dominantSubTrends: [{ name: "ERC-4626 vault extension", count: 2, description: "설명" }],
          representativeProposals: [],
          trendInterpretation: "해석",
          interpretation: "해석",
        },
        {
          theme: "Account Abstraction",
          proposalCount: 1,
          proposalCount180d: 1,
          recentChangeCount: 0,
          recentChangeCount7d: 0,
          discussionProposalCount: 0,
          contentChangeCount: 0,
          maturitySignal: "medium",
          momentumScore: 60,
          dominantSubTrends: [{ name: "Paymaster / gas sponsorship", count: 1, description: "설명" }],
          representativeProposals: [],
          trendInterpretation: "해석",
          interpretation: "해석",
        },
      ],
      accountAbstractionRadar: {
        proposalCount: 1,
        subTrendDistribution: { "Paymaster / gas sponsorship": 1 },
        representativeProposals: [],
        trendInterpretation: "해석",
        kgldWalletUxInterpretation: "KGLD 지갑 UX 해석",
      },
      recentChanges: {
        total: 2,
        byEventType: { new_proposal: 2, status_change: 0, final_transition: 0, withdrawn_transition: 0, content_hash_change: 0 },
        finalTransitions: [],
        withdrawnTransitions: [],
        statusChanges: [],
        newProposals: [],
        contentHashChanges: [],
      },
      signalLayer: {
        discussionHeat: [],
        diffIntelligence: [],
      },
      narrativeLayer: {
        weeklyNarrative: [],
        topStories: [],
        signalEvidence: {
          topMomentumThemes: [],
          topDiscussions: [],
          recentChangeCount: 0,
          contentDiffCount: 0,
        },
        generatedBy: "fallback",
      },
    },
    kgldOpportunityRadar: {
      method: "rule-based-scoring",
      candidates: [
        makeCandidate("ERC-4626", 80, "poc"),
        makeCandidate("ERC-4337", 42, "monitor"),
      ],
    },
  };
}

function makeCandidate(
  proposalId: string,
  relevanceScore: number,
  recommendedAction: "poc" | "monitor",
): WeeklyRadarReport["kgldOpportunityRadar"]["candidates"][number] {
  return {
    proposalId,
    title: proposalId,
    status: "Draft",
    sourceRepo: "ethereum/ercs",
    canonicalUrl: `https://example.test/${proposalId}`,
    matchedKeywords: ["vault"],
    matchedThemes: ["DeFi / Vault"],
    relevanceScore,
    oneLineSummary: "요약",
    whyRelevantToKGLD: "KGLD 관련 설명",
    potentialUseCases: ["DeFi"],
    businessImpact: 5,
    implementationEffort: 3,
    urgency: 4,
    recommendedAction,
    reasonCodes: ["TEST"],
  };
}
