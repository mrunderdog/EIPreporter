import { buildChartData } from "./chart-data.ts";
import { buildAdoptionLayer, buildAdoptionLayerWithGithubSearch } from "./adoption.ts";
import { buildDiscussionFallbackWhyItMatters, enrichDiscussionHeat, type FetchDiscussionOptions } from "./discussion-activity.ts";
import { getChangeEventsSince, getSnapshotRecords, listSnapshots } from "./db.ts";
import type { AppDatabase } from "./db.ts";
import { summarizeChanges } from "./diff.ts";
import { buildNarrativeLayer } from "./narrative.ts";
import { buildTechnologyPlatformLayer } from "./platform.ts";
import { KGLD_KEYWORDS, scoreKgldOpportunity } from "./scoring.ts";
import {
  analyzeProposal,
  buildAccountAbstractionRadar,
  buildThemeInsights,
} from "./theme-engine.ts";
import { buildWatchlistLayer } from "./watchlist.ts";
import type {
  ChangeEvent,
  CountByLabel,
  DiffIntelligenceItem,
  DiscussionHeatItem,
  KgldCandidate,
  ProposalRecord,
  ProposalThemeAnalysis,
  WeeklyRadarReport,
} from "./types.ts";

export { KGLD_KEYWORDS };

export type ReportWindowOptions = {
  trendWindowDays?: number;
  changeWindowDays?: number;
};

const DEFAULT_TREND_DAYS = 180;
const DEFAULT_CHANGE_DAYS = 7;
const UNKNOWN_LABEL = "미분류";
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildWeeklyReport(
  db: AppDatabase,
  generatedAt = new Date(),
  options: ReportWindowOptions = {},
): WeeklyRadarReport | null {
  const [latestSnapshot] = listSnapshots(db, 1);
  if (!latestSnapshot) return null;

  const trendWindowDays = validDays(options.trendWindowDays, DEFAULT_TREND_DAYS);
  const changeWindowDays = validDays(options.changeWindowDays, DEFAULT_CHANGE_DAYS);
  const generatedAtIso = generatedAt.toISOString();
  const trendFrom = subtractDays(generatedAt, trendWindowDays);
  const changeFrom = subtractDays(generatedAt, changeWindowDays);
  const records = getSnapshotRecords(db, latestSnapshot.id);
  const trendEvents = getChangeEventsSince(db, trendFrom, generatedAtIso);
  const recentEvents = getChangeEventsSince(db, changeFrom, generatedAtIso);
  const trendChangedIds = new Set(trendEvents.map((event) => event.proposalId));
  const trendRecords = records.filter((record) =>
    isWithinWindow(record.updated ?? record.created, trendFrom, generatedAtIso)
    || trendChangedIds.has(record.proposalId)
  );
  const analyses = trendRecords.map(analyzeProposal);
  const candidates = analyses
    .map((analysis) => scoreKgldOpportunity(analysis.proposal, analysis))
    .filter((candidate): candidate is KgldCandidate => candidate !== null)
    .sort(compareCandidates);
  const themeInsights = buildThemeInsights(
    analyses,
    recentEvents,
    new Set(candidates.map((candidate) => candidate.proposalId)),
  );

  const report: Omit<WeeklyRadarReport, "chartData"> = {
    generatedAt: generatedAtIso,
    trendPeriod: { from: trendFrom, to: generatedAtIso, days: trendWindowDays },
    changePeriod: { from: changeFrom, to: generatedAtIso, days: changeWindowDays },
    ethereumTechRadar: {
      latestSnapshot,
      totalProposals: records.length,
      proposalsByRepo: countBy(records, (record) => record.sourceRepo),
      proposalsByStatus: countBy(records, (record) => record.status),
      proposalsByType: countBy(records, (record) => record.proposalType),
      proposalsByCategory: countBy(records, (record) => record.category),
      trendProposalCount: trendRecords.length,
      themeInsights,
      accountAbstractionRadar: buildAccountAbstractionRadar(analyses),
      recentChanges: {
        total: recentEvents.length,
        byEventType: summarizeChanges(recentEvents),
        finalTransitions: filterEvents(recentEvents, "final_transition"),
        withdrawnTransitions: filterEvents(recentEvents, "withdrawn_transition"),
        statusChanges: filterEvents(recentEvents, "status_change"),
        newProposals: filterEvents(recentEvents, "new_proposal"),
        contentHashChanges: filterEvents(recentEvents, "content_hash_change"),
      },
      signalLayer: {
        discussionHeat: buildDiscussionHeat(analyses, recentEvents),
        diffIntelligence: buildDiffIntelligence(recentEvents),
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
      watchlistLayer: {
        items: [],
        generatedBy: "fallback",
      },
      adoptionLayer: {
        items: [],
        generatedBy: "fallback",
      },
    },
    kgldOpportunityRadar: {
      method: "rule-based-scoring",
      candidates,
    },
  };

  report.ethereumTechRadar.watchlistLayer = buildWatchlistLayer(report);
  report.ethereumTechRadar.adoptionLayer = buildAdoptionLayer(report);
  report.ethereumTechRadar.narrativeLayer = buildNarrativeLayer(report);
  report.ethereumTechRadar.technologyPlatformLayer = buildTechnologyPlatformLayer(report);
  return { ...report, chartData: buildChartData(report) };
}

export async function buildWeeklyReportWithDiscussionActivity(
  db: AppDatabase,
  generatedAt = new Date(),
  options: ReportWindowOptions & FetchDiscussionOptions = {},
): Promise<WeeklyRadarReport | null> {
  const report = buildWeeklyReport(db, generatedAt, options);
  if (!report) return null;

  report.ethereumTechRadar.signalLayer.discussionHeat = await enrichDiscussionHeat(
    report.ethereumTechRadar.signalLayer.discussionHeat,
    {
      db,
      now: generatedAt,
      limit: options.limit,
      timeoutMs: options.timeoutMs,
      cacheTtlHours: options.cacheTtlHours,
      fetchImpl: options.fetchImpl,
    },
  );
  report.ethereumTechRadar.watchlistLayer = buildWatchlistLayer(report);
  report.ethereumTechRadar.adoptionLayer = await buildAdoptionLayerWithGithubSearch(report, {
    token: process.env.GITHUB_TOKEN,
    now: generatedAt,
  });
  report.ethereumTechRadar.narrativeLayer = buildNarrativeLayer(report);
  report.ethereumTechRadar.technologyPlatformLayer = buildTechnologyPlatformLayer(report);
  return { ...report, chartData: buildChartData(report) };
}

function buildDiscussionHeat(
  analyses: ProposalThemeAnalysis[],
  recentEvents: ChangeEvent[],
): DiscussionHeatItem[] {
  const changedIds = new Set(recentEvents.map((event) => event.proposalId));
  return analyses
    .filter((analysis) =>
      (analysis.proposal.discussionLinks?.length ?? 0) > 0 || Boolean(analysis.proposal.discussionTo)
    )
    .map((analysis) => {
      const discussionLinks = analysis.proposal.discussionLinks?.length
        ? analysis.proposal.discussionLinks
        : analysis.proposal.discussionTo
          ? [analysis.proposal.discussionTo]
          : [];
      const theme = analysis.themes[0] ?? "Unclassified";
      const hasRecentChange = changedIds.has(analysis.proposal.proposalId);
      return {
        proposalId: analysis.proposal.proposalId,
        title: analysis.proposal.title,
        status: analysis.proposal.status,
        theme,
        discussionUrl: discussionLinks[0] ?? null,
        discussionLinks,
        discussionScore: hasRecentChange ? 20 : 10,
        discussionActivityScore: 10,
        activityLevel: "Unknown" as const,
        discussionSummaryFallback: "Activity details unavailable.",
        whyItMatters: buildDiscussionFallbackWhyItMatters({
          theme,
          title: analysis.proposal.title,
          status: analysis.proposal.status,
        }),
        canonicalUrl: analysis.proposal.canonicalUrl,
      };
    })
    .sort((left, right) =>
      (right.discussionScore ?? 0) - (left.discussionScore ?? 0)
      || left.proposalId.localeCompare(right.proposalId, undefined, { numeric: true })
    )
    .slice(0, 12);
}

function buildDiffIntelligence(events: ChangeEvent[]): DiffIntelligenceItem[] {
  return events
    .filter((event) => event.type === "content_hash_change" || event.type === "new_proposal")
    .map((event) => ({
      proposalId: event.proposalId,
      title: event.title,
      changedFiles: event.changedFiles?.length ? event.changedFiles : [event.sourcePath],
      changedSections: event.changedSections?.length ? event.changedSections : null,
      diffSummary: event.diffSummary
        ?? (event.type === "content_hash_change"
          ? "Recent proposal content changed; section-level diff not available."
          : "New proposal added to the tracked repository."),
      diffEvidence: event.diffEvidence
        ?? (event.type === "content_hash_change"
          ? "rawContentHash changed between snapshots"
          : "proposal was absent from the previous snapshot"),
      canonicalUrl: event.canonicalUrl,
    }))
    .slice(0, 20);
}

export const matchKgldCandidate = scoreKgldOpportunity;

export function formatWeeklyReport(report: WeeklyRadarReport): string {
  const tech = report.ethereumTechRadar;
  const changes = tech.recentChanges;
  const topThemes = tech.themeInsights.slice(0, 5);
  const lines = [
    "# Ethereum Developer Momentum Dashboard · EIPreporter Weekly",
    `기준일: ${report.generatedAt}`,
    `기술 흐름 분석: 최근 ${report.trendPeriod.days}일 (${formatDate(report.trendPeriod.from)} ~ ${formatDate(report.trendPeriod.to)})`,
    `최근 ${report.changePeriod.days}일 변경사항: ${formatDate(report.changePeriod.from)} ~ ${formatDate(report.changePeriod.to)}`,
    "",
    "## 핵심 신호",
    ...buildExecutiveSignal(report).map((line) => `- ${line}`),
    "",
    "## 개발자 모멘텀 상세",
    ...topThemes.map((item) => `- ${item.theme}: ${item.momentumScore}/100 | proposal ${item.proposalCount180d}건 | 최근 7일 변경 ${item.recentChangeCount7d}건 | ${item.interpretation}`),
    "",
    "## Account Abstraction Radar",
    `관련 제안: ${tech.accountAbstractionRadar.proposalCount}`,
    `- ${tech.accountAbstractionRadar.trendInterpretation}`,
    "",
    `## 표준 진행 현황 - 최근 ${report.changePeriod.days}일 변경사항`,
    `- 전체 이벤트: ${changes.total}`,
    `- 신규 제안: ${changes.byEventType.new_proposal}`,
    `- 상태 변경: ${changes.byEventType.status_change}`,
    `- Final 전환: ${changes.byEventType.final_transition}`,
    `- Withdrawn 전환: ${changes.byEventType.withdrawn_transition}`,
    `- 본문 변경: ${changes.byEventType.content_hash_change}`,
    "",
    "## KGLD Opportunity Radar",
    `KGLD 검토 후보: ${report.kgldOpportunityRadar.candidates.length}`,
  ];

  for (const candidate of report.kgldOpportunityRadar.candidates.slice(0, 10)) {
    lines.push(
      `- ${candidate.proposalId} | ${candidate.title ?? "제목 없음"} | ${candidate.relevanceScore}/100 | ${candidate.recommendedAction}`,
      `  ${candidate.oneLineSummary}`,
      `  ${candidate.whyRelevantToKGLD}`,
    );
  }
  if (report.kgldOpportunityRadar.candidates.length === 0) lines.push("- KGLD Opportunity 후보 없음");
  return lines.join("\n");
}

export function formatTelegramWeeklySummary(report: WeeklyRadarReport): string {
  const topThemes = report.ethereumTechRadar.themeInsights.slice(0, 3);
  const reviewCount = report.kgldOpportunityRadar.candidates.filter((item) => item.recommendedAction === "review").length;
  const pocCount = report.kgldOpportunityRadar.candidates.filter((item) => item.recommendedAction === "poc").length;
  const lines = [
    "Ethereum Developer Momentum Dashboard",
    "",
    ...buildExecutiveSignal(report),
    "",
    "Momentum Top 3 themes",
    ...(topThemes.length ? topThemes.map((item) =>
      `- ${item.theme}: ${item.momentumScore}/100, proposal ${item.proposalCount180d}건, 최근 7일 변경 ${item.recentChangeCount7d}건`
    ) : ["- 없음"]),
    "",
    `KGLD Review/PoC 후보: Review ${reviewCount}건 / PoC ${pocCount}건`,
    "HTML 파일을 첨부합니다.",
  ];
  return lines.join("\n");
}

export function buildExecutiveSignal(report: WeeklyRadarReport): string[] {
  const top = report.ethereumTechRadar.themeInsights.slice(0, 3);
  const first = top[0];
  const second = top[1];
  const aa = top.find((item) => item.theme === "Account Abstraction")
    ?? report.ethereumTechRadar.themeInsights.find((item) => item.theme === "Account Abstraction");
  if (!first) {
    return [
      "최근 180일 기준 분류 가능한 기술 테마가 아직 충분하지 않습니다.",
      `최근 7일 변경사항은 ${report.ethereumTechRadar.recentChanges.total}건으로, 초기 움직임은 보조 지표로만 확인해야 합니다.`,
      "KGLD 관점에서는 추가 제안 축적 전까지 ERC, DeFi, RWA 관련 변경을 모니터링하는 편이 적절합니다.",
    ];
  }

  const firstTrends = first.dominantSubTrends.slice(0, 3).map((item) => item.name).join(", ") || "공통 인터페이스 정리";
  const secondText = second ? `${second.theme}(${second.momentumScore}/100)` : "후속 기술 테마";
  return [
    `최근 180일 기준 ${first.theme}(${first.momentumScore}/100)와 ${secondText} 계열의 개발 배경이 높고, 세부적으로는 ${firstTrends} 방식이 반복적으로 등장합니다.`,
    aa
      ? `이는 Ethereum UX와 실행 환경이 EOA 중심 사용에서 smart account, permission, automation 구조로 이동하고 있음을 시사합니다. 최근 7일 변경사항 ${report.ethereumTechRadar.recentChanges.total}건은 아직 초기 흐름의 보조 신호로 해석합니다.`
      : `이는 Ethereum/EVM 표준 논의가 단순 기능 추가보다 권한, 상호운용, 실행 조건의 구체화로 이동하고 있음을 시사합니다. 최근 7일 변경사항 ${report.ethereumTechRadar.recentChanges.total}건은 초기 보조 신호로 해석합니다.`,
    "KGLD 관점에서는 identity, permission, account abstraction 관련 proposal을 발행·상환 권한, 지갑 UX, compliance flow 관점에서 관찰할 필요가 있습니다.",
  ];
}

function subtractDays(date: Date, days: number): string {
  return new Date(date.getTime() - days * DAY_MS).toISOString();
}

function validDays(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function isWithinWindow(value: string | null, from: string, to: string): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= Date.parse(from) && timestamp <= Date.parse(to);
}

function countBy(
  records: ProposalRecord[],
  selectLabel: (record: ProposalRecord) => string | null,
): CountByLabel {
  const counts = new Map<string, number>();
  for (const record of records) {
    const label = selectLabel(record)?.trim() || UNKNOWN_LABEL;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b, "en")));
}

function filterEvents(events: ChangeEvent[], type: ChangeEvent["type"]): ChangeEvent[] {
  return events.filter((event) => event.type === type);
}

function compareCandidates(left: KgldCandidate, right: KgldCandidate): number {
  return right.relevanceScore - left.relevanceScore
    || right.urgency - left.urgency
    || left.proposalId.localeCompare(right.proposalId, undefined, { numeric: true });
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}
