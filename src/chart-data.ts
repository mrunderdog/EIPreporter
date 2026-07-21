import type {
  ChartSeries,
  CountByLabel,
  WeeklyChartData,
  WeeklyRadarReport,
} from "./types.ts";

const EVENT_LABELS: Record<string, string> = {
  new_proposal: "신규 제안",
  status_change: "상태 변경",
  final_transition: "Final 전환",
  withdrawn_transition: "Withdrawn 전환",
  content_hash_change: "본문 변경",
};

export function buildChartData(
  report: Omit<WeeklyRadarReport, "chartData">,
): WeeklyChartData {
  const candidates = report.kgldOpportunityRadar.candidates;
  const subTrendDistributionByTheme = Object.fromEntries(
    report.ethereumTechRadar.themeInsights.map((insight) => [
      insight.theme,
      countSeries(Object.fromEntries(
        insight.dominantSubTrends.map((item) => [item.name, item.count]),
      )),
    ]),
  );

  return {
    statusDistribution: countSeries(report.ethereumTechRadar.proposalsByStatus),
    developerMomentumScores: {
      labels: report.ethereumTechRadar.themeInsights.map((item) => item.theme),
      data: report.ethereumTechRadar.themeInsights.map((item) => item.momentumScore ?? 0),
    },
    weeklyEventTypeDistribution: countSeries(
      report.ethereumTechRadar.recentChanges.byEventType,
      EVENT_LABELS,
    ),
    themeDistribution180d: {
      labels: report.ethereumTechRadar.themeInsights.map((item) => item.theme),
      data: report.ethereumTechRadar.themeInsights.map((item) => item.proposalCount180d ?? item.proposalCount),
    },
    subTrendDistributionByTheme,
    accountAbstractionSubTrendDistribution: countSeries(
      report.ethereumTechRadar.accountAbstractionRadar.subTrendDistribution,
    ),
    kgldOpportunityMatrix: candidates.map((candidate) => ({
      x: candidate.implementationEffort,
      y: candidate.businessImpact,
      r: candidate.urgency + 3,
      proposalId: candidate.proposalId,
      score: candidate.relevanceScore,
      action: candidate.recommendedAction,
    })),
    kgldRecommendedActionDistribution: countSeries(countActions(candidates)),
    topOpportunities: candidates.slice(0, 10).map((candidate) => ({
      proposalId: candidate.proposalId,
      title: candidate.title,
      score: candidate.relevanceScore,
      recommendedAction: candidate.recommendedAction,
    })),
  };
}

function countActions(candidates: WeeklyRadarReport["kgldOpportunityRadar"]["candidates"]) {
  const counts: CountByLabel = {};
  for (const candidate of candidates) {
    counts[candidate.recommendedAction] = (counts[candidate.recommendedAction] ?? 0) + 1;
  }
  return counts;
}

function countSeries(
  counts: CountByLabel,
  labels: Record<string, string> = {},
): ChartSeries {
  const entries = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, left], [, right]) => right - left);
  return {
    labels: entries.map(([label]) => labels[label] ?? label),
    data: entries.map(([, count]) => count),
  };
}
