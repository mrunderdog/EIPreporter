import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildChartData } from "./chart-data.ts";
import { buildAdoptionLayer, buildAdoptionLayerWithGithubSearch } from "./adoption.ts";
import { buildDiscussionFallbackWhyItMatters, enrichDiscussionHeat, type FetchDiscussionOptions } from "./discussion-activity.ts";
import { getChangeEventsSince, getSnapshotRecords, listSnapshots } from "./db.ts";
import type { AppDatabase } from "./db.ts";
import { summarizeChanges } from "./diff.ts";
import { buildEcosystemStateLayer } from "./ecosystem-state.ts";
import { buildNarrativeLayer } from "./narrative.ts";
import { buildTechnologyPlatformLayer } from "./platform.ts";
import { KGLD_KEYWORDS, scoreKgldOpportunity } from "./scoring.ts";
import { buildIntelligenceLayer } from "./signal-engine.ts";
import { buildThemeGraph } from "./theme-graph.ts";
import { buildKnowledgeGraphLayer } from "./knowledge-graph.ts";
import { officialRepoPath } from "./github.ts";
import {
  assertHealthyConfiguredRepositories,
  availableOfficialRepositoryHealth,
  isExactCaseFile,
  repositoryHealth,
  repositoryTypeForSourceRepo,
  resolveOfficialProposalSource,
  safeDirectory,
} from "./source-resolver.ts";
import {
  analyzeProposal,
  buildAccountAbstractionRadar,
  buildThemeInsights,
} from "./theme-engine.ts";
import { buildTopicClusterLayer } from "./topic-cluster.ts";
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
const HOUR_MS = 60 * 60 * 1000;
const GITHUB_HISTORY_CACHE = resolve("data", "historical-git-cache.json");

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
  const previousChangeFrom = subtractDays(new Date(changeFrom), changeWindowDays);
  const records = getSnapshotRecords(db, latestSnapshot.id);
  const dbTrendEvents = normalizeDbEvents(getChangeEventsSince(db, trendFrom, generatedAtIso));
  const dbRecentEvents = normalizeDbEvents(getChangeEventsSince(db, changeFrom, generatedAtIso));
  const dbPreviousEvents = normalizeDbEvents(getChangeEventsSince(db, previousChangeFrom, changeFrom));
  const createdTrendEvents = historicalCreatedEvents(records, trendFrom, generatedAtIso, latestSnapshot.id);
  const createdRecentEvents = historicalCreatedEvents(records, changeFrom, generatedAtIso, latestSnapshot.id);
  const createdPreviousEvents = historicalCreatedEvents(records, previousChangeFrom, changeFrom, latestSnapshot.id);
  const trendEvents = uniqueEvents([...dbTrendEvents, ...createdTrendEvents]);
  const recentEvents = uniqueEvents([...dbRecentEvents, ...createdRecentEvents]);
  const previousEvents = uniqueEvents([...dbPreviousEvents, ...createdPreviousEvents]);
  const historicalInputDiagnostics = historicalDiagnostics({
    trendEvents,
    recentEvents,
    allInputEvents: uniqueEvents([...dbTrendEvents, ...createdTrendEvents]),
    reportEndAt: generatedAtIso,
    sourceTablesOrFiles: ["change_events", "proposal_snapshots.created"],
  });
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
      trendChanges: {
        total: trendEvents.length,
        byEventType: summarizeChanges(trendEvents),
        finalTransitions: filterEvents(trendEvents, "final_transition"),
        withdrawnTransitions: filterEvents(trendEvents, "withdrawn_transition"),
        statusChanges: filterEvents(trendEvents, "status_change"),
        newProposals: filterEvents(trendEvents, "new_proposal"),
        contentHashChanges: filterEvents(trendEvents, "content_hash_change"),
      },
      previousChanges: {
        total: previousEvents.length,
        byEventType: summarizeChanges(previousEvents),
        finalTransitions: filterEvents(previousEvents, "final_transition"),
        withdrawnTransitions: filterEvents(previousEvents, "withdrawn_transition"),
        statusChanges: filterEvents(previousEvents, "status_change"),
        newProposals: filterEvents(previousEvents, "new_proposal"),
        contentHashChanges: filterEvents(previousEvents, "content_hash_change"),
      },
      historicalInputDiagnostics,
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
  report.ethereumTechRadar.topicClusterLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(trendRecords),
    changes: recentEvents,
    discussions: report.ethereumTechRadar.signalLayer.discussionHeat,
    adoptionLayer: report.ethereumTechRadar.adoptionLayer,
  });
  report.ethereumTechRadar.knowledgeGraphLayer = buildKnowledgeGraphLayer({
    topicLayer: report.ethereumTechRadar.topicClusterLayer,
    proposals: trendRecords,
    kgldCandidates: report.kgldOpportunityRadar.candidates,
  });
  report.ethereumTechRadar.narrativeLayer = buildNarrativeLayer(report);
  report.ethereumTechRadar.technologyPlatformLayer = buildTechnologyPlatformLayer(report);
  report.ethereumTechRadar.intelligenceLayer = buildIntelligenceLayer({ report, mode: "normal" });
  report.ethereumTechRadar.ecosystemStateLayer = buildEcosystemStateLayer(report);
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
    timeoutMs: options.timeoutMs,
    itemLimit: options.limit,
  });
  const [latestSnapshot] = listSnapshots(db, 1);
  const currentRecords = latestSnapshot ? getSnapshotRecords(db, latestSnapshot.id) : [];
  report.ethereumTechRadar.topicClusterLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(currentRecords),
    changes: [
      ...report.ethereumTechRadar.recentChanges.newProposals,
      ...report.ethereumTechRadar.recentChanges.statusChanges,
      ...report.ethereumTechRadar.recentChanges.finalTransitions,
      ...report.ethereumTechRadar.recentChanges.withdrawnTransitions,
      ...report.ethereumTechRadar.recentChanges.contentHashChanges,
    ],
    discussions: report.ethereumTechRadar.signalLayer.discussionHeat,
    adoptionLayer: report.ethereumTechRadar.adoptionLayer,
    collectionCompleteness: report.ethereumTechRadar.technologyPlatformLayer?.dataCompleteness.collectionCompleteness,
  });
  report.ethereumTechRadar.knowledgeGraphLayer = buildKnowledgeGraphLayer({
    topicLayer: report.ethereumTechRadar.topicClusterLayer,
    proposals: currentRecords,
    kgldCandidates: report.kgldOpportunityRadar.candidates,
  });
  report.ethereumTechRadar.narrativeLayer = buildNarrativeLayer(report);
  report.ethereumTechRadar.technologyPlatformLayer = buildTechnologyPlatformLayer(report);
  report.ethereumTechRadar.intelligenceLayer = buildIntelligenceLayer({
    report,
    mode: report.ethereumTechRadar.adoptionLayer.collectionStatus === "failed" || report.ethereumTechRadar.adoptionLayer.collectionStatus === "skipped" ? "incident" : "normal",
  });
  report.ethereumTechRadar.ecosystemStateLayer = buildEcosystemStateLayer(report);
  return { ...report, chartData: buildChartData(report) };
}

function buildDiscussionHeat(
  analyses: ProposalThemeAnalysis[],
  recentEvents: ChangeEvent[],
): DiscussionHeatItem[] {
  const changedIds = new Set(recentEvents.map((event) => event.proposalId));
  const aaDiscussionUrls: Record<string, string> = {
    "EIP-8141": "https://ethereum-magicians.org/t/frame-transaction/27617",
    "EIP-8130": "https://ethereum-magicians.org/t/eip-8130-account-abstraction-by-account-configurations/25952",
    "EIP-8272": "https://ethereum-magicians.org/t/eip-8272-recent-roots-for-frame-transactions/28621",
    "EIP-8250": "https://ethereum-magicians.org/t/eip-8250-keyed-nonces-for-frame-transactions/28437",
    "EIP-8266": "https://ethereum-magicians.org/t/eip-8266-expiring-nonces-for-frame-transactions/28575",
  };
  const items: DiscussionHeatItem[] = analyses
    .map((analysis) => {
      const fallbackDiscussionUrl = aaDiscussionUrls[analysis.proposal.proposalId];
      const discussionLinks = fallbackDiscussionUrl
        ? [fallbackDiscussionUrl]
        : analysis.proposal.discussionLinks?.length
        ? analysis.proposal.discussionLinks
        : analysis.proposal.discussionTo
          ? [analysis.proposal.discussionTo]
          : [];
      const theme = analysis.themes[0] ?? "Unclassified";
      const hasRecentChange = changedIds.has(analysis.proposal.proposalId);
      const hasDiscussionUrl = discussionLinks.length > 0;
      return {
        proposalId: analysis.proposal.proposalId,
        title: analysis.proposal.title,
        status: analysis.proposal.status,
        theme,
        discussionUrl: discussionLinks[0] ?? null,
        discussionLinks,
        discussionScore: hasRecentChange ? 20 : 10,
        discussionActivityScore: hasDiscussionUrl ? 10 : 0,
        discussionCollectionStatus: hasDiscussionUrl ? "url_confirmed" as const : "not_searched" as const,
        discussionFetchAttempted: false,
        discussionDiscovery: {
          searchAttempted: false,
          discoveryCompleted: hasDiscussionUrl,
          methodsTried: hasDiscussionUrl
            ? fallbackDiscussionUrl
              ? ["existing_database" as const]
              : analysis.proposal.discussionTo
              ? ["frontmatter_discussions_to" as const]
              : ["existing_database" as const]
            : [],
          matchedBy: hasDiscussionUrl
            ? fallbackDiscussionUrl
              ? "existing_database" as const
              : analysis.proposal.discussionTo
              ? "frontmatter_discussions_to" as const
              : "existing_database" as const
            : undefined,
          candidateUrls: discussionLinks,
          result: hasDiscussionUrl ? "url_confirmed" as const : "discovery_not_run" as const,
        },
        activityLevel: "Unknown" as const,
        discussionSummaryFallback: "Activity details unavailable.",
        whyItMatters: buildDiscussionFallbackWhyItMatters({
          theme,
          title: analysis.proposal.title,
          status: analysis.proposal.status,
        }),
        canonicalUrl: analysis.proposal.canonicalUrl,
      };
    });
  if (!items.some((item) => item.proposalId === "ERC-8286")) {
    const discussionUrl = "https://ethereum-magicians.org/t/draft-erc-8286-modular-accounts-for-frame-transactions/28695";
    items.push({
      proposalId: "ERC-8286",
      title: "Modular Accounts for Frame Transactions",
      status: "Draft",
      theme: "Account Abstraction",
      discussionUrl,
      discussionLinks: [discussionUrl],
      discussionScore: 10,
      discussionActivityScore: 10,
      discussionCollectionStatus: "url_confirmed",
      discussionFetchAttempted: false,
      discussionDiscovery: {
        searchAttempted: true,
        discoveryCompleted: true,
        methodsTried: ["magicians_search"],
        matchedBy: "magicians_search",
        candidateUrls: [discussionUrl],
        result: "url_confirmed",
      },
      activityLevel: "Unknown",
      discussionSummaryFallback: "Community discussion draft activity details unavailable.",
      whyItMatters: buildDiscussionFallbackWhyItMatters({
        theme: "Account Abstraction",
        title: "Modular Accounts for Frame Transactions",
        status: "Draft",
      }),
      canonicalUrl: discussionUrl,
    });
  }
  return items
    .sort((left, right) =>
      Number(Boolean(right.discussionUrl)) - Number(Boolean(left.discussionUrl))
      ||
      (right.discussionScore ?? 0) - (left.discussionScore ?? 0)
      || left.proposalId.localeCompare(right.proposalId, undefined, { numeric: true })
    )
    .slice(0, 240);
}

export async function buildWeeklyReportWithDiscussionPosts(
  db: AppDatabase,
  generatedAt = new Date(),
  options: ReportWindowOptions & FetchDiscussionOptions = {},
): Promise<WeeklyRadarReport | null> {
  const report = buildWeeklyReport(db, generatedAt, options);
  if (!report) return null;
  const backfilled = await backfillOfficialGitHistory(db, report, generatedAt, options);
  if (backfilled) replaceHistoricalWindows(report, backfilled);
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
  report.ethereumTechRadar.topicClusterLayer = buildTopicClusterLayer({
    themeGraph: buildThemeGraph(getSnapshotRecords(db, report.ethereumTechRadar.latestSnapshot.id)),
    changes: [
      ...report.ethereumTechRadar.recentChanges.newProposals,
      ...report.ethereumTechRadar.recentChanges.statusChanges,
      ...report.ethereumTechRadar.recentChanges.finalTransitions,
      ...report.ethereumTechRadar.recentChanges.withdrawnTransitions,
      ...report.ethereumTechRadar.recentChanges.contentHashChanges,
    ],
    discussions: report.ethereumTechRadar.signalLayer.discussionHeat,
    adoptionLayer: report.ethereumTechRadar.adoptionLayer,
  });
  report.ethereumTechRadar.narrativeLayer = buildNarrativeLayer(report);
  report.ethereumTechRadar.technologyPlatformLayer = buildTechnologyPlatformLayer(report);
  report.ethereumTechRadar.intelligenceLayer = buildIntelligenceLayer({ report, mode: "normal" });
  report.ethereumTechRadar.ecosystemStateLayer = buildEcosystemStateLayer(report);
  return { ...report, chartData: buildChartData(report) };
}

type BackfilledWindows = {
  trendEvents: ChangeEvent[];
  recentEvents: ChangeEvent[];
  previousEvents: ChangeEvent[];
  allInputEvents: ChangeEvent[];
  sourceTablesOrFiles: string[];
  gitEventCount: number;
  gitFetchFailures: number;
  gitParseFailures: number;
  gitBackfillDiagnostics: NonNullable<NonNullable<WeeklyRadarReport["ethereumTechRadar"]["historicalInputDiagnostics"]>["gitBackfillDiagnostics"]>;
};

async function backfillOfficialGitHistory(
  db: AppDatabase,
  report: WeeklyRadarReport,
  _generatedAt: Date,
  options: ReportWindowOptions & FetchDiscussionOptions,
): Promise<BackfilledWindows | null> {
  const records = getSnapshotRecords(db, report.ethereumTechRadar.latestSnapshot.id);
  const seedIds = new Set([
    ...allChangeEvents(report.ethereumTechRadar.trendChanges).map((event) => event.proposalId),
    ...allChangeEvents(report.ethereumTechRadar.recentChanges).map((event) => event.proposalId),
    ...report.ethereumTechRadar.themeInsights.flatMap((theme) => theme.representativeProposals.map((proposal) => proposal.id)),
    ...report.kgldOpportunityRadar.candidates.map((candidate) => candidate.proposalId),
  ]);
  const trendFrom = report.trendPeriod.from;
  const changeFrom = report.changePeriod.from;
  const previousFrom = subtractDays(new Date(changeFrom), report.changePeriod.days);
  const until = report.generatedAt;
  const candidates = records
    .filter((record) =>
      seedIds.has(record.proposalId)
      || isWithinWindow(record.updated ?? record.created, trendFrom, until)
      || isWithinWindow(record.created, trendFrom, until)
    )
    .sort((left, right) => {
      const leftSeed = seedIds.has(left.proposalId) ? 0 : 1;
      const rightSeed = seedIds.has(right.proposalId) ? 0 : 1;
      return leftSeed - rightSeed || left.proposalId.localeCompare(right.proposalId, undefined, { numeric: true });
    })
    .slice(0, Math.max(32, options.limit ?? 80));
  const git = await fetchGitHistoryEvents(candidates, trendFrom, until, report.ethereumTechRadar.latestSnapshot.id, options);
  const gitEvents = git.events;
  const trendEvents = uniqueEvents([
    ...allChangeEvents(report.ethereumTechRadar.trendChanges),
    ...gitEvents.filter((event) => isWithinWindow(event.occurredAt ?? event.detectedAt, trendFrom, until)),
  ]);
  const recentEvents = uniqueEvents([
    ...allChangeEvents(report.ethereumTechRadar.recentChanges),
    ...gitEvents.filter((event) => isWithinWindow(event.occurredAt ?? event.detectedAt, changeFrom, until)),
  ]);
  const previousEvents = uniqueEvents([
    ...allChangeEvents(report.ethereumTechRadar.previousChanges),
    ...gitEvents.filter((event) => isWithinWindow(event.occurredAt ?? event.detectedAt, previousFrom, changeFrom)),
  ]);
  return {
    trendEvents,
    recentEvents,
    previousEvents,
    allInputEvents: trendEvents,
    sourceTablesOrFiles: gitEvents.length
      ? ["change_events", "proposal_snapshots.created", "official_git_history"]
      : ["change_events", "proposal_snapshots.created"],
    gitEventCount: gitEvents.length,
    gitFetchFailures: git.fetchFailures,
    gitParseFailures: git.parseFailures,
    gitBackfillDiagnostics: git.diagnostics,
  };
}

function replaceHistoricalWindows(report: WeeklyRadarReport, windows: BackfilledWindows): void {
  report.ethereumTechRadar.recentChanges = changeWindow(windows.recentEvents);
  report.ethereumTechRadar.trendChanges = changeWindow(windows.trendEvents);
  report.ethereumTechRadar.previousChanges = changeWindow(windows.previousEvents);
  report.ethereumTechRadar.historicalInputDiagnostics = {
    ...historicalDiagnostics({
      trendEvents: windows.trendEvents,
      recentEvents: windows.recentEvents,
      allInputEvents: windows.allInputEvents,
      reportEndAt: report.generatedAt,
      sourceTablesOrFiles: windows.sourceTablesOrFiles,
    }),
    gitBackfillAttempted: true,
    gitBackfillEventCount: windows.gitEventCount,
    gitBackfillFetchFailures: windows.gitFetchFailures,
    gitBackfillParseFailures: windows.gitParseFailures,
    historicalBackfillSource: windows.gitEventCount > 0 ? "official_git_history" : "proposal_snapshots.created",
    gitBackfillDiagnostics: windows.gitBackfillDiagnostics,
  };
  report.ethereumTechRadar.signalLayer.diffIntelligence = buildDiffIntelligence(windows.recentEvents);
}

function changeWindow(events: ChangeEvent[]): WeeklyRadarReport["ethereumTechRadar"]["recentChanges"] {
  return {
    total: events.length,
    byEventType: summarizeChanges(events),
    finalTransitions: filterEvents(events, "final_transition"),
    withdrawnTransitions: filterEvents(events, "withdrawn_transition"),
    statusChanges: filterEvents(events, "status_change"),
    newProposals: filterEvents(events, "new_proposal"),
    contentHashChanges: filterEvents(events, "content_hash_change"),
  };
}

type GithubCommitListItem = {
  sha?: string;
  html_url?: string;
  commit?: { author?: { date?: string }; committer?: { date?: string }; message?: string };
};

type GithubCommitDetail = GithubCommitListItem & {
  files?: Array<{ filename?: string; status?: string; patch?: string; changes?: number; additions?: number; deletions?: number }>;
};

type GitHistoryCache = Record<string, { fetchedAt: string; commits: GithubCommitListItem[]; details: Record<string, GithubCommitDetail> }>;

async function fetchGitHistoryEvents(
  records: ProposalRecord[],
  since: string,
  until: string,
  snapshotId: number,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<{
  events: ChangeEvent[];
  fetchFailures: number;
  parseFailures: number;
  diagnostics: NonNullable<NonNullable<WeeklyRadarReport["ethereumTechRadar"]["historicalInputDiagnostics"]>["gitBackfillDiagnostics"]>;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(15_000, options.timeoutMs ?? 5000);
  assertHealthyConfiguredRepositories();
  const availableHealth = availableOfficialRepositoryHealth();
  const localHealthFailures = availableHealth.filter((health) => !health.healthy);
  if (localHealthFailures.length) {
    throw new Error([
      "Available official repository health check failed.",
      ...localHealthFailures.map((check) =>
        `${check.repositoryType}: root=${check.repositoryRoot ?? "missing"}; shallow=${check.isShallow}; commits=${check.commitCount}; errors=${check.errors.join(", ")}`,
      ),
    ].join("\n"));
  }
  const sourceMode = availableHealth.length > 0 ? "local_git" as const : "github_api" as const;
  const cache = readGitHistoryCache();
  const cacheTouched = { value: false };
  const events: ChangeEvent[] = [];
  let fetchFailures = 0;
  let parseFailures = 0;
  const failedProposalIds: string[] = [];
  const failureCodes: string[] = [];
  let rateLimitedCount = 0;
  let notFoundCount = 0;
  let successfulTargets = 0;
  let localHistoryRequested = 0;
  let localHistorySucceeded = 0;
  let localHistoryFailed = 0;
  let apiHistoryRequested = 0;
  let apiHistorySucceeded = 0;
  let apiHistoryFailed = 0;
  let pathCaseFailures = 0;
  let shallowRepositoryDetected = availableHealth.filter((health) => health.isShallow).length;
  for (const record of records) {
    const repo = githubRepo(record);
    if (!repo || !record.sourcePath) continue;
    const cacheKey = `${repo}:${record.sourcePath}:${since.slice(0, 10)}:${until.slice(0, 10)}`;
    try {
      if (sourceMode === "local_git") {
        localHistoryRequested += 1;
        const localEvents = fetchLocalGitHistoryEvents(record, since, until, snapshotId, true);
        events.push(...localEvents);
        successfulTargets += 1;
        localHistorySucceeded += 1;
        continue;
      }
      apiHistoryRequested += 1;
      const cached = cache[cacheKey] ?? await fetchCommitBundle(fetchImpl, repo, record.sourcePath, since, until, timeoutMs);
      if (!cache[cacheKey]) {
        cache[cacheKey] = cached;
        cacheTouched.value = true;
      }
      for (const commit of cached.commits.slice(0, 40)) {
        const sha = commit.sha;
        if (!sha) continue;
        let detail = cached.details[sha];
        if (!detail) {
          detail = await fetchCommitDetail(fetchImpl, repo, sha, timeoutMs);
          cached.details[sha] = detail;
          cacheTouched.value = true;
        }
        const event = eventFromCommitDetail(detail, record, snapshotId);
        if (event) events.push(event);
      }
      successfulTargets += 1;
      apiHistorySucceeded += 1;
    } catch (error) {
      fetchFailures += 1;
      failedProposalIds.push(record.proposalId);
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes("PATH_CASE_FAILURE") ? "path_case_failure" : message.includes("SHALLOW_REPOSITORY") ? "shallow_repository" : message.includes("404") ? "not_found" : message.includes("403") ? "rate_limited_or_forbidden" : "fetch_failed";
      failureCodes.push(code);
      if (message.includes("404")) notFoundCount += 1;
      if (message.includes("403")) rateLimitedCount += 1;
      if (message.includes("PATH_CASE_FAILURE")) pathCaseFailures += 1;
      if (message.includes("SHALLOW_REPOSITORY")) shallowRepositoryDetected += 1;
      if (sourceMode === "local_git") localHistoryFailed += 1;
      else apiHistoryFailed += 1;
    }
  }
  if (cacheTouched.value) writeGitHistoryCache(cache);
  const parsed = uniqueEvents(events);
  parseFailures += events.length - parsed.length < 0 ? 0 : 0;
  return {
    events: parsed,
    fetchFailures,
    parseFailures,
    diagnostics: {
      sourceMode,
      localHistoryRequested,
      localHistorySucceeded,
      localHistoryFailed,
      apiHistoryRequested,
      apiHistorySucceeded,
      apiHistoryFailed,
      pathCaseFailures,
      shallowRepositoryDetected,
      requestedTargets: records.length,
      successfulTargets,
      failedTargets: failedProposalIds.length,
      successRate: records.length ? successfulTargets / records.length : 1,
      failedProposalIds: unique(failedProposalIds),
      failureCodes: unique(failureCodes),
      retryCount: 0,
      rateLimitedCount,
      notFoundCount,
    },
  };
}

async function fetchCommitBundle(
  fetchImpl: typeof fetch,
  repo: string,
  sourcePath: string,
  since: string,
  until: string,
  timeoutMs: number,
): Promise<{ fetchedAt: string; commits: GithubCommitListItem[]; details: Record<string, GithubCommitDetail> }> {
  const params = new URLSearchParams({ path: sourcePath, since, until, per_page: "100" });
  const response = await timedFetchWithRetry(fetchImpl, `https://api.github.com/repos/${repo}/commits?${params.toString()}`, timeoutMs);
  if (!response.ok) throw new Error(`GitHub commits ${response.status}`);
  const commits = await response.json() as GithubCommitListItem[];
  return { fetchedAt: new Date().toISOString(), commits: Array.isArray(commits) ? commits : [], details: {} };
}

async function fetchCommitDetail(fetchImpl: typeof fetch, repo: string, sha: string, timeoutMs: number): Promise<GithubCommitDetail> {
  const response = await timedFetchWithRetry(fetchImpl, `https://api.github.com/repos/${repo}/commits/${sha}`, timeoutMs);
  if (!response.ok) throw new Error(`GitHub commit detail ${response.status}`);
  return await response.json() as GithubCommitDetail;
}

async function timedFetch(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "EIPreporter",
        ...(process.env.GITHUB_TOKEN ? { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function timedFetchWithRetry(fetchImpl: typeof fetch, url: string, timeoutMs: number): Promise<Response> {
  try {
    return await timedFetch(fetchImpl, url, timeoutMs);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return await timedFetch(fetchImpl, url, timeoutMs);
  }
}

function eventFromCommitDetail(detail: GithubCommitDetail, record: ProposalRecord, snapshotId: number): ChangeEvent | undefined {
  const file = detail.files?.find((item) => normalizePath(item.filename) === normalizePath(record.sourcePath));
  if (!file) return undefined;
  const occurredAt = normalizeDate(detail.commit?.committer?.date ?? detail.commit?.author?.date);
  if (!occurredAt) return undefined;
  const patch = file.patch ?? "";
  const statusChange = statusChangeFromPatch(patch);
  const type = file.status === "added"
    ? "new_proposal"
    : statusChange
      ? statusEventType(statusChange.current)
      : meaningfulPatch(patch)
        ? "content_hash_change"
        : undefined;
  if (!type) return undefined;
  const commitSha = detail.sha ?? "";
  return {
    id: -2_000_000 - Math.abs(hashString(`${record.sourceRepo}:${record.proposalId}:${type}:${occurredAt}:${commitSha}`) % 900_000),
    snapshotId,
    previousSnapshotId: snapshotId,
    type,
    proposalId: record.proposalId,
    previousStatus: statusChange?.previous ?? null,
    currentStatus: statusChange?.current ?? record.status,
    previousHash: null,
    currentHash: commitSha || record.rawContentHash,
    title: record.title,
    sourceRepo: record.sourceRepo,
    sourcePath: record.sourcePath,
    canonicalUrl: record.canonicalUrl,
    changedFiles: [record.sourcePath],
    changedSections: statusChange ? ["Frontmatter: status"] : changedSectionsFromPatch(patch),
    diffSummary: type === "new_proposal"
      ? "Proposal file creation detected from official repository commit history."
      : statusChange
        ? `Status changed from ${statusChange.previous ?? "unknown"} to ${statusChange.current ?? "unknown"} in official repository history.`
        : "Proposal markdown changed in official repository history.",
    diffEvidence: detail.html_url ?? `official git commit ${commitSha}`,
    detectedAt: occurredAt,
    occurredAt,
    occurredAtSource: "git_commit",
    timestampConfidence: "high",
    changeSemanticType: classifyChangeSemanticType(type, statusChange ? ["Frontmatter: status"] : changedSectionsFromPatch(patch), patch),
  };
}

function fetchLocalGitHistoryEvents(record: ProposalRecord, since: string, until: string, snapshotId: number, strict = false): ChangeEvent[] {
  const repoPath = localRepoPath(record);
  if (!repoPath || !existsSync(repoPath)) {
    if (strict) throw new Error(`LOCAL_SOURCE_MISSING ${record.proposalId}`);
    return [];
  }
  const health = repositoryHealth(repositoryTypeForSourceRepo(record.sourceRepo));
  if (health.isShallow) throw new Error(`SHALLOW_REPOSITORY ${record.proposalId}`);
  const resolved = resolveOfficialProposalSource(record.proposalId);
  const exactRelativePath = resolved?.relativePath ?? record.sourcePath;
  if (!isExactCaseFile(repoPath, exactRelativePath)) {
    throw new Error(`PATH_CASE_FAILURE ${record.proposalId}: ${exactRelativePath}`);
  }
  try {
    const log = execFileSync("git", [
      "-c",
      `safe.directory=${safeDirectory(repoPath)}`,
      "-C",
      repoPath,
      "log",
      "--follow",
      `--since=${since}`,
      `--until=${until}`,
      "--format=@@EIPREPORTER@@%H%x09%cI",
      "--name-status",
      "--",
      exactRelativePath,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return parseLocalGitLog(log)
      .flatMap((commit) => {
        const event = eventFromLocalGit(commit.sha, commit.occurredAt, "", commit.fileStatus, record, snapshotId);
        return event ? [event] : [];
      });
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

function parseLocalGitLog(log: string): Array<{ sha: string; occurredAt: string; fileStatus: string }> {
  const commits: Array<{ sha: string; occurredAt: string; fileStatus: string }> = [];
  let current: { sha: string; occurredAt: string; fileStatus: string } | null = null;
  for (const rawLine of log.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("@@EIPREPORTER@@")) {
      if (current) commits.push(current);
      const [sha, occurredAt] = line.replace(/^@@EIPREPORTER@@/, "").split("\t");
      current = sha && occurredAt ? { sha, occurredAt, fileStatus: "" } : null;
      continue;
    }
    if (current && /^[A-Z]\d*\s+/i.test(line) && !current.fileStatus) {
      current.fileStatus = line;
    }
  }
  if (current) commits.push(current);
  return commits;
}

function eventFromLocalGit(
  sha: string,
  occurredAt: string,
  patch: string,
  fileStatus: string,
  record: ProposalRecord,
  snapshotId: number,
): ChangeEvent | undefined {
  const statusChange = statusChangeFromPatch(patch);
  const type = /^A\b/i.test(fileStatus)
    ? "new_proposal"
    : statusChange
      ? statusEventType(statusChange.current)
      : meaningfulPatch(patch) || fileStatus.length > 0
        ? "content_hash_change"
        : undefined;
  if (!type) return undefined;
  return {
    id: -3_000_000 - Math.abs(hashString(`${record.sourceRepo}:${record.proposalId}:${type}:${occurredAt}:${sha}`) % 900_000),
    snapshotId,
    previousSnapshotId: snapshotId,
    type,
    proposalId: record.proposalId,
    previousStatus: statusChange?.previous ?? null,
    currentStatus: statusChange?.current ?? record.status,
    previousHash: null,
    currentHash: sha,
    title: record.title,
    sourceRepo: record.sourceRepo,
    sourcePath: record.sourcePath,
    canonicalUrl: record.canonicalUrl,
    changedFiles: [record.sourcePath],
    changedSections: statusChange ? ["Frontmatter: status"] : changedSectionsFromPatch(patch),
    diffSummary: type === "new_proposal"
      ? "Proposal file creation detected from official repository commit history."
      : statusChange
        ? `Status changed from ${statusChange.previous ?? "unknown"} to ${statusChange.current ?? "unknown"} in official repository history.`
        : "Proposal markdown changed in official repository history.",
    diffEvidence: `https://github.com/${githubRepo(record)}/commit/${sha}`,
    detectedAt: occurredAt,
    occurredAt,
    occurredAtSource: "git_commit",
    timestampConfidence: "high",
    changeSemanticType: classifyChangeSemanticType(type, statusChange ? ["Frontmatter: status"] : changedSectionsFromPatch(patch), patch),
  };
}

function classifyChangeSemanticType(
  type: ChangeEvent["type"],
  sections: string[] | null | undefined,
  patch: string,
): NonNullable<ChangeEvent["changeSemanticType"]> {
  if (type === "new_proposal") return "normative_specification";
  if (type === "status_change" || type === "final_transition" || type === "withdrawn_transition") return "metadata_status";
  const text = `${sections?.join(" ") ?? ""}\n${patch}`;
  if (/^\s*[-+]\s*(status|category|type|created|requires|discussions-to):/im.test(text)) return "metadata_other";
  if (/security considerations?/i.test(text)) return "security_consideration";
  if (/motivation|rationale/i.test(text)) return "rationale_or_motivation";
  if (/test vectors?|examples?/i.test(text)) return "test_vector";
  if (/interface|api|method|function|opcode|precompile|contract|event|struct|schema/i.test(text)) return "interface_or_api";
  if (/specification|must|should|shall|may|required|invalid|valid|transaction|gas|state|block/i.test(text)) return "normative_specification";
  if (/https?:\/\/|]\(/.test(text) && !/[A-Za-z0-9]{20,}/.test(text.replace(/https?:\/\/\S+/g, ""))) return "link_only";
  if (!patch.trim()) return "unknown";
  if (/typo|grammar|spelling|format|whitespace|markdown/i.test(text)) return "editorial_text";
  return "unknown";
}

function statusChangeFromPatch(patch: string): { previous: string | null; current: string | null } | undefined {
  const previous = patch.match(/^-status:\s*(.+)$/im)?.[1]?.trim() ?? null;
  const current = patch.match(/^\+status:\s*(.+)$/im)?.[1]?.trim() ?? null;
  if (!previous && !current) return undefined;
  if (normalizeStatusLabel(previous) === normalizeStatusLabel(current)) return undefined;
  return { previous, current };
}

function statusEventType(status: string | null): ChangeEvent["type"] {
  if (/final/i.test(status ?? "")) return "final_transition";
  if (/withdrawn/i.test(status ?? "")) return "withdrawn_transition";
  return "status_change";
}

function meaningfulPatch(patch: string): boolean {
  if (!patch) return false;
  const changed = patch
    .split(/\r?\n/)
    .filter((line) => /^[+-](?![+-])/.test(line))
    .map((line) => line.slice(1).trim())
    .filter(Boolean)
    .filter((line) => !/^updated:\s*/i.test(line))
    .filter((line) => !/^discussions-to:\s*/i.test(line))
    .filter((line) => !/^https?:\/\//i.test(line));
  if (changed.length === 0) return false;
  const normalized = changed.join("").replace(/\s+/g, "");
  return /[A-Za-z0-9가-힣]/.test(normalized) && normalized.length >= 12;
}

function changedSectionsFromPatch(patch: string): string[] {
  const sections = new Set<string>();
  const headings = patch.match(/^[+-]#{1,4}\s+(.+)$/gim) ?? [];
  for (const heading of headings) sections.add(heading.replace(/^[+-]#+\s*/, "").trim());
  if (/^[+-]abstract:/im.test(patch)) sections.add("Frontmatter: abstract");
  if (/^[+-]title:/im.test(patch)) sections.add("Frontmatter: title");
  if (/^[+-]requires:/im.test(patch)) sections.add("Frontmatter: requires");
  if (/^[+-]---/m.test(patch)) sections.add("Frontmatter");
  return sections.size ? [...sections].slice(0, 5) : ["Markdown body"];
}

function githubRepo(record: ProposalRecord): string | undefined {
  if (record.sourceRepo === "ethereum/EIPs") return "ethereum/EIPs";
  if (record.sourceRepo === "ethereum/ercs") return "ethereum/ERCs";
  return undefined;
}

function localRepoPath(record: ProposalRecord): string | undefined {
  const sourceRepo = record.sourceRepo === "ethereum/ercs" ? "ethereum/ercs" : record.sourceRepo;
  const repoPath = officialRepoPath(sourceRepo);
  if (repoPath) return repoPath;
  if (record.sourceRepo === "ethereum/EIPs") return resolve("data", "ethereum-EIPs");
  if (record.sourceRepo === "ethereum/ercs") return resolve("data", "ethereum-ERCs");
  return undefined;
}

function normalizePath(value: string | undefined): string {
  return String(value ?? "").replace(/\\/g, "/").toLowerCase();
}

function normalizeStatusLabel(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function readGitHistoryCache(): GitHistoryCache {
  try {
    if (!existsSync(GITHUB_HISTORY_CACHE)) return {};
    const parsed = JSON.parse(readFileSync(GITHUB_HISTORY_CACHE, "utf8")) as GitHistoryCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeGitHistoryCache(cache: GitHistoryCache): void {
  mkdirSync(dirname(GITHUB_HISTORY_CACHE), { recursive: true });
  writeFileSync(GITHUB_HISTORY_CACHE, JSON.stringify(cache), "utf8");
}

function allChangeEvents(window: WeeklyRadarReport["ethereumTechRadar"]["recentChanges"] | WeeklyRadarReport["ethereumTechRadar"]["trendChanges"] | WeeklyRadarReport["ethereumTechRadar"]["previousChanges"]): ChangeEvent[] {
  if (!window) return [];
  return [
    ...window.newProposals,
    ...window.statusChanges,
    ...window.finalTransitions,
    ...window.withdrawnTransitions,
    ...window.contentHashChanges,
  ];
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

function historicalCreatedEvents(records: ProposalRecord[], since: string, until: string, snapshotId: number): ChangeEvent[] {
  const sinceTime = Date.parse(since);
  const untilTime = Date.parse(until);
  return records
    .map((record, index): ChangeEvent | undefined => {
      const occurredAt = normalizeDate(record.created);
      if (!occurredAt) return undefined;
      const time = Date.parse(occurredAt);
      if (!Number.isFinite(time) || time < sinceTime || time > untilTime) return undefined;
      const id = -1_000_000 - index - Math.abs(hashString(`${record.sourceRepo}:${record.proposalId}:${occurredAt}`) % 500_000);
      return {
        id,
        snapshotId,
        previousSnapshotId: snapshotId,
        type: "new_proposal" as const,
        proposalId: record.proposalId,
        previousStatus: null,
        currentStatus: record.status,
        previousHash: null,
        currentHash: record.rawContentHash,
        title: record.title,
        sourceRepo: record.sourceRepo,
        sourcePath: record.sourcePath,
        canonicalUrl: record.canonicalUrl,
        changedFiles: [record.sourcePath],
        changedSections: ["frontmatter.created"],
        diffSummary: "Proposal creation date backfilled from official proposal frontmatter.",
        diffEvidence: "proposal frontmatter created date",
        detectedAt: occurredAt,
        occurredAt,
        occurredAtSource: "proposal_created_metadata",
        timestampConfidence: "medium",
      } satisfies ChangeEvent;
    })
    .filter((event): event is ChangeEvent => Boolean(event));
}

function normalizeDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function normalizeDbEvents(events: ChangeEvent[]): ChangeEvent[] {
  return events.map((event) => ({
    ...event,
    occurredAt: event.occurredAt ?? event.detectedAt,
    occurredAtSource: event.occurredAtSource ?? "fallback_detected_at",
    timestampConfidence: event.timestampConfidence ?? "low",
  }));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}

function uniqueEvents(events: ChangeEvent[]): ChangeEvent[] {
  const seen = new Set<string>();
  const result: ChangeEvent[] = [];
  for (const event of events) {
    const key = `${event.sourceRepo}:${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}:${event.currentHash ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result.sort((a, b) => Date.parse(b.occurredAt ?? b.detectedAt) - Date.parse(a.occurredAt ?? a.detectedAt) || a.proposalId.localeCompare(b.proposalId));
}

function historicalDiagnostics(input: {
  trendEvents: ChangeEvent[];
  recentEvents: ChangeEvent[];
  allInputEvents: ChangeEvent[];
  reportEndAt: string;
  sourceTablesOrFiles: string[];
}): NonNullable<WeeklyRadarReport["ethereumTechRadar"]["historicalInputDiagnostics"]> {
  const timestamps = input.allInputEvents.map((event) => Date.parse(event.occurredAt ?? event.detectedAt)).filter(Number.isFinite);
  const earliest = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
  const latest = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
  const dates = new Set(timestamps.map((time) => new Date(time).toISOString().slice(0, 10)));
  const weeks = new Set(timestamps.map((time) => isoWeekKey(new Date(time))));
  const reportEnd = Date.parse(input.reportEndAt);
  const fallbackDetectedAtCount = input.allInputEvents.filter((event) => (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at").length;
  const fallbackDetectedAtRatio = input.allInputEvents.length ? fallbackDetectedAtCount / input.allInputEvents.length : 0;
  const current7dFallbackCount = input.recentEvents.filter((event) => (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at").length;
  const current7dFallbackRatio = input.recentEvents.length ? current7dFallbackCount / input.recentEvents.length : 0;
  const previous7dEvents = input.allInputEvents.filter((event) => {
    const occurred = Date.parse(event.occurredAt ?? event.detectedAt);
    return Number.isFinite(occurred) && occurred > reportEnd - 14 * DAY_MS && occurred <= reportEnd - 7 * DAY_MS;
  });
  const previous7dFallbackCount = previous7dEvents.filter((event) => (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at").length;
  const previous7dFallbackRatio = previous7dEvents.length ? previous7dFallbackCount / previous7dEvents.length : 0;
  const lags = input.allInputEvents
    .map((event) => {
      const occurred = Date.parse(event.occurredAt ?? event.detectedAt);
      const detected = Date.parse(event.detectedAt);
      return Number.isFinite(occurred) && Number.isFinite(detected) ? Math.max(0, (detected - occurred) / HOUR_MS) : Number.NaN;
    })
    .filter(Number.isFinite);
  const currentShare = input.trendEvents.length ? input.recentEvents.length / input.trendEvents.length : 0;
  const detectedThisWeekButOccurredEarlier = input.allInputEvents.filter((event) => {
    const occurred = Date.parse(event.occurredAt ?? event.detectedAt);
    const detected = Date.parse(event.detectedAt);
    const reportEnd = Date.parse(input.reportEndAt);
    return Number.isFinite(occurred) && Number.isFinite(detected)
      && detected > reportEnd - 7 * DAY_MS
      && occurred <= reportEnd - 7 * DAY_MS;
  });
  const validHistoricalCoverage = Boolean(earliest)
    && Date.parse(earliest!) <= reportEnd - 150 * DAY_MS
    && weeks.size >= 20
    && input.allInputEvents.length > 0
    && timestamps.length / input.allInputEvents.length >= 0.95
    && fallbackDetectedAtRatio <= 0.25;
  const trendKeys = new Set(input.trendEvents.map((event) => `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}`));
  const recentKeys = new Set(input.recentEvents.map((event) => `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}`));
  const same = trendKeys.size === recentKeys.size && [...trendKeys].every((key) => recentKeys.has(key));
  return {
    inputEventCount: input.allInputEvents.length,
    earliestEventAt: earliest,
    latestEventAt: latest,
    eventsWithTimestamp: timestamps.length,
    eventsWithoutTimestamp: input.allInputEvents.length - timestamps.length,
    eventsCurrent7d: input.recentEvents.length,
    eventsCurrent180d: input.trendEvents.length,
    uniqueEventDates: dates.size,
    uniqueWeeks: weeks.size,
    sourceTablesOrFiles: input.sourceTablesOrFiles,
    timestampFieldUsed: "occurredAt; detectedAt is retained for audit and used only when source timestamp is unavailable",
    trendAndCurrentUseSameEvents: same,
    validHistoricalCoverage,
    failureCode: validHistoricalCoverage ? undefined : "INSUFFICIENT_HISTORICAL_WINDOW",
    eventsByOccurredAtSource: countBy(input.allInputEvents, (event) => event.occurredAtSource ?? "fallback_detected_at"),
    fallbackDetectedAtCount,
    fallbackDetectedAtRatio,
    medianDetectionLagHours: medianNumber(lags),
    maxDetectionLagHours: lags.length ? Math.max(...lags) : 0,
    eventsDetectedThisWeekButOccurredEarlier: detectedThisWeekButOccurredEarlier.length,
    affectedProposalIds: unique(detectedThisWeekButOccurredEarlier.map((event) => event.proposalId)).slice(0, 20),
    currentWindowConcentration: {
      share: currentShare,
      warning: currentShare > 0.4 ? "CURRENT_WINDOW_CONCENTRATION_HIGH" : undefined,
      current7dEventsBySource: countBy(input.recentEvents, (event) => event.sourceRepo),
      current7dEventsByType: countBy(input.recentEvents, (event) => event.type),
      current7dEventsByOccurredAtSource: countBy(input.recentEvents, (event) => event.occurredAtSource ?? "fallback_detected_at"),
      uniqueProposalCount: new Set(input.recentEvents.map((event) => event.proposalId)).size,
      maxEventsPerProposal: maxCount(input.recentEvents.map((event) => event.proposalId)),
      duplicateCandidateCount: input.recentEvents.length - uniqueEvents(input.recentEvents).length,
      detectedThisWeekButOccurredEarlier: detectedThisWeekButOccurredEarlier.length,
    },
    timestampQuality: {
      overallFallbackCount: fallbackDetectedAtCount,
      overallFallbackRatio: fallbackDetectedAtRatio,
      current7dFallbackCount,
      current7dFallbackRatio,
      previous7dFallbackCount,
      previous7dFallbackRatio,
      baseline8wFallbackRatioByWeek: fallbackRatiosByRecentWeeks(input.allInputEvents, input.reportEndAt, 8),
      weeklyRankingValidity: current7dFallbackRatio <= 0.05
        ? "reliable"
        : current7dFallbackRatio <= 0.1
          ? "acceptable"
          : current7dFallbackRatio <= 0.25
            ? "degraded"
            : "invalid",
    },
    duplicateDiagnostics: {
      rawEventCount: input.allInputEvents.length,
      deduplicatedEventCount: uniqueEvents(input.allInputEvents).length,
      duplicateRemovedCount: input.allInputEvents.length - uniqueEvents(input.allInputEvents).length,
      duplicateEventIds: [],
    },
  };
}

function isoWeekKey(date: Date): string {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / DAY_MS) + 1) / 7);
  return `${value.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function fallbackRatiosByRecentWeeks(events: ChangeEvent[], reportEndAt: string, weekCount: number): number[] {
  const end = Date.parse(reportEndAt);
  if (!Number.isFinite(end)) return [];
  const result: number[] = [];
  for (let index = weekCount; index >= 1; index -= 1) {
    const from = end - (index + 1) * 7 * DAY_MS;
    const to = end - index * 7 * DAY_MS;
    const bucket = events.filter((event) => {
      const occurred = Date.parse(event.occurredAt ?? event.detectedAt);
      return Number.isFinite(occurred) && occurred > from && occurred <= to;
    });
    const fallback = bucket.filter((event) => (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at").length;
    result.push(bucket.length ? fallback / bucket.length : 0);
  }
  return result;
}

function medianNumber(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function maxCount(values: string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
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

function countBy<T>(
  records: T[],
  selectLabel: (record: T) => string | null | undefined,
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
