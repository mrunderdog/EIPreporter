import {
  getEmergingActivitySnapshots,
  getEmergingAlertState,
  getLatestEmergingActivitySnapshotsSince,
  insertEmergingLayer,
  insertEmergingActivitySnapshots,
  upsertEmergingAlertState,
  type AppDatabase,
} from "./db.ts";
import { REPOSITORIES } from "./github.ts";
import type {
  ChangeEvent,
  EmergingActivitySnapshot,
  EmergingDiagnostics,
  EmergingIssue,
  EmergingLayer,
  EmergingRawSignal,
  EmergingSource,
  EmergingVelocity,
  ProposalRecord,
  SourceCollectionDiagnostic,
  SourceRepo,
} from "./types.ts";

const USER_AGENT = "EIPreporter/1.0 (+https://github.com/mrunderdog/EIPreporter)";
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const OBSERVATION_WINDOW_DAYS = 7;
const MAGICIANS_PAGE_SIZE = 30;
const MAGICIANS_MAX_PAGES = 12;
const MAGICIANS_MAX_TOPICS = 360;

export const EMERGING_THRESHOLDS = {
  earlyHeat: 35,
  hotHeat: 60,
  hotHeatIncrease: 18,
  decisionHeat: 55,
  alertHeatIncrease: 18,
  rollingHistoryDays: 14,
} as const;

type FetchOptions = {
  fetchImpl?: typeof fetch;
  githubToken?: string;
  now?: Date;
  timeoutMs?: number;
  limit?: number;
};

export async function collectEmergingSourceSignals(options: FetchOptions = {}): Promise<{
  rawSignals: EmergingRawSignal[];
  sourceStatus: SourceCollectionDiagnostic[];
}> {
  const now = options.now ?? new Date();
  const collectedAt = now.toISOString();
  const results = await Promise.all([
    collectMagiciansDiscovery({ ...options, now }),
    collectGithubPrDiscovery({ ...options, now }),
  ]);
  return {
    rawSignals: results.flatMap((result) => result.rawSignals),
    sourceStatus: results.map((result) => result.status),
  };
}

export function buildOfficialRepoSignals(
  records: ProposalRecord[],
  recentEvents: ChangeEvent[],
  now = new Date(),
): EmergingRawSignal[] {
  const eventByProposal = new Map<string, ChangeEvent[]>();
  for (const event of recentEvents) {
    const list = eventByProposal.get(event.proposalId) ?? [];
    list.push(event);
    eventByProposal.set(event.proposalId, list);
  }
  return records
    .filter((record) => eventByProposal.has(record.proposalId))
    .map((record) => {
      const events = eventByProposal.get(record.proposalId) ?? [];
      const lastEvent = events
        .map((event) => event.occurredAt ?? event.detectedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? record.updated ?? record.created ?? now.toISOString();
      return {
        source: "official_repo",
        sourceId: `${record.sourceRepo}:${record.proposalId}`,
        sourceRepo: record.sourceRepo,
        url: record.canonicalUrl,
        title: `${record.proposalId}: ${record.title ?? "Untitled proposal"}`,
        category: record.category,
        status: record.status,
        createdAt: record.created,
        lastActivityAt: lastEvent,
        primaryProposalId: record.proposalId,
        relatedProposalIds: extractRelatedProposalIds(`${record.title ?? ""} ${record.description ?? ""}`, record.proposalId),
        extractedEipIds: [record.proposalId],
        collectedAt: now.toISOString(),
        facts: {
          changeTypes: [...new Set(events.map((event) => event.type))],
          sourcePath: record.sourcePath,
        },
      };
    });
}

export function buildEmergingLayer(input: {
  db?: AppDatabase;
  now?: Date;
  records?: ProposalRecord[];
  recentEvents?: ChangeEvent[];
  rawSignals?: EmergingRawSignal[];
  sourceStatus?: SourceCollectionDiagnostic[];
  persist?: boolean;
}): EmergingLayer {
  const now = input.now ?? new Date();
  const officialSignals = buildOfficialRepoSignals(input.records ?? [], input.recentEvents ?? [], now);
  const rollingSignals = input.db ? restoreRollingSignals(input.db, now) : [];
  const rawSignals = dedupeRawSignals([...(input.rawSignals ?? []), ...rollingSignals, ...officialSignals]);
  const snapshots = rawSignals.map(activitySnapshotFromSignal).filter((snapshot): snapshot is EmergingActivitySnapshot => Boolean(snapshot));
  if (input.db && input.persist !== false) insertEmergingActivitySnapshots(input.db, snapshots);
  const issues = scoreEmergingIssues(resolveEmergingIssues(rawSignals), input.db, now);
  const layer = {
    generatedAt: now.toISOString(),
    sourceStatus: [
      ...(input.sourceStatus ?? []),
      {
        sourceName: "Official EIP/ERC repositories",
        sourceType: "local_snapshot",
        requestAttempted: false,
        result: officialSignals.length ? "success" : "empty",
        retryCount: 0,
        cachedDataAvailable: false,
        recordCountCollected: officialSignals.length,
      },
    ],
    rawSignals,
    issues,
    whatsHappeningNow: issues.filter((issue) => issue.status === "HOT_ISSUE").slice(0, 5),
    emergingSignals: issues.filter((issue) => issue.status === "EARLY_SIGNAL").slice(0, 8),
    decisionWatch: issues.filter((issue) => issue.status === "DECISION_WATCH").slice(0, 8),
    diagnostics: buildEmergingDiagnostics(issues, rawSignals, input.sourceStatus ?? []),
    generatedBy: "deterministic_emerging_signal_engine",
  } satisfies EmergingLayer;
  if (input.db && input.persist !== false) insertEmergingLayer(input.db, layer);
  return layer;
}

export async function buildEmergingLayerWithSources(input: {
  db?: AppDatabase;
  now?: Date;
  records?: ProposalRecord[];
  recentEvents?: ChangeEvent[];
  githubToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  limit?: number;
}): Promise<EmergingLayer> {
  const collected = await collectEmergingSourceSignals(input);
  return buildEmergingLayer({
    db: input.db,
    now: input.now,
    records: input.records,
    recentEvents: input.recentEvents,
    rawSignals: collected.rawSignals,
    sourceStatus: collected.sourceStatus,
  });
}

export function detectEmergingAlerts(
  db: AppDatabase,
  layer: EmergingLayer,
  now = new Date(),
): EmergingIssue[] {
  const alerts: EmergingIssue[] = [];
  for (const issue of layer.issues) {
    if (issue.status !== "HOT_ISSUE" && issue.status !== "DECISION_WATCH") continue;
    const previous = getEmergingAlertState(db, issue.issueId);
    const statusCrossed = !previous || previous.lastStatus !== issue.status;
    const heatJumped = previous ? issue.heatScore - previous.lastHeatScore >= EMERGING_THRESHOLDS.alertHeatIncrease : true;
    if (statusCrossed || heatJumped) {
      alerts.push(issue);
      upsertEmergingAlertState(db, issue.issueId, issue.status, issue.heatScore, now.toISOString());
    }
  }
  return alerts;
}

export function formatEmergingTelegramAlert(issue: EmergingIssue, reportUrl?: string): string {
  const eip = issue.eipIds[0] ?? "Unnumbered topic";
  const sourceNames = issue.sources.map(sourceLabel).join(" · ");
  const velocity7d = issue.metrics.velocity.find((item) => item.windowHours === 168);
  const deltas = [
    velocity7d?.replyDelta !== undefined ? `+${velocity7d.replyDelta} replies` : "",
    velocity7d?.viewDelta !== undefined ? `+${velocity7d.viewDelta} views` : "",
  ].filter(Boolean).join(" / ") || "activity delta unavailable";
  const lines = [
    "HOT ISSUE",
    "",
    `${eip} / ${issue.title}`,
    "",
    `Heat ${issue.heatScore}${issue.heatChange ? ` +${issue.heatChange}` : ""}`,
    `Sources: ${sourceNames}`,
    `7d: ${deltas}`,
    "",
    "Why it is moving:",
    issue.summaries.whyMoving,
    "",
    "Watch:",
    issue.summaries.watchNext,
    "",
    reportUrl ? `Report: ${reportUrl}` : "",
    `Source: ${issue.sourceSignals[0]?.url ?? ""}`,
  ].filter((line) => line !== "");
  return lines.join("\n");
}

function resolveEmergingIssues(signals: EmergingRawSignal[]): EmergingIssue[] {
  const groups = new Map<string, EmergingRawSignal[]>();
  for (const signal of signals) {
    const key = issueKey(signal);
    const list = groups.get(key) ?? [];
    list.push(signal);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([issueId, sourceSignals]) => {
    const primaryProposalId = primaryProposalIdForSignals(sourceSignals);
    const relatedProposalIds = sanitizeRelatedProposalIds(sourceSignals.flatMap((signal) => signal.relatedProposalIds ?? []), primaryProposalId);
    const eipIds = [...new Set([primaryProposalId, ...relatedProposalIds, ...sourceSignals.flatMap((signal) => signal.extractedEipIds).filter((id) => id !== primaryProposalId && !relatedProposalIds.includes(id))].filter((id): id is string => Boolean(id)))].sort(compareProposalIds);
    const preferred = sourceSignals.sort(compareSignalFreshness)[0]!;
    const sources = [...new Set(sourceSignals.map((signal) => signal.source))];
    const createdAt = minIso(sourceSignals.map((signal) => signal.createdAt));
    const lastActivityAt = maxIso(sourceSignals.map((signal) => signal.lastActivityAt));
    return {
      issueId,
      title: cleanTitle(preferred.title),
      primaryProposalId,
      relatedProposalIds,
      eipIds,
      status: "EARLY_SIGNAL",
      stage: inferStage(sourceSignals),
      heatScore: 0,
      confidenceScore: 0,
      sources,
      createdAt,
      lastActivityAt,
      metrics: {
        replyCount: maxKnown(sourceSignals.map((signal) => signal.replyCount)),
        viewCount: maxKnown(sourceSignals.map((signal) => signal.viewCount)),
        participantCount: maxKnown(sourceSignals.map((signal) => signal.participantCount)),
        velocity: [],
      },
      scoreBreakdown: [],
      sourceSignals,
      summaries: {
        whatIsHappening: "",
        whyMoving: "",
        whyItMatters: "",
        watchNext: "",
      },
      facts: {
        sourceCount: sources.length,
      },
    } satisfies EmergingIssue;
  });
}

function scoreEmergingIssues(issues: EmergingIssue[], db: AppDatabase | undefined, now: Date): EmergingIssue[] {
  return issues.map((issue) => {
    const velocity = issue.sourceSignals.flatMap((signal) => calculateVelocity(signal, db, now));
    const weeklyVelocity = velocity.find((item) => item.windowHours === 168);
    const velocityScore = Math.min(25, Math.max(
      weeklyVelocity ? velocityPoints(weeklyVelocity) : 0,
      ...velocity.filter((item) => item.windowHours !== 168).map((item) => Math.round(velocityPoints(item) * 0.65)),
      0,
    ));
    const absoluteActivityScore = absoluteActivityPoints(
      issue.metrics.replyCount,
      issue.metrics.viewCount,
      issue.metrics.participantCount,
    );
    const participationScore = participationPoints(issue.metrics.replyCount, issue.metrics.participantCount);
    const freshnessScore = freshnessPoints(issue.createdAt, issue.lastActivityAt, now);
    const spreadScore = Math.min(15, Math.max(0, (issue.sources.length - 1) * 8 + (issue.sources.includes("official_repo") ? 3 : 0)));
    const authorityScore = 0;
    const githubPrActivityScore = issue.sources.includes("github_pr") ? 5 : 0;
    const officialStatusScore = officialStatusPoints(issue);
    const decisionScore = decisionPoints(issue);
    const materialityScore = materialityPoints(`${issue.title} ${issue.sourceSignals.flatMap((signal) => signal.labels ?? []).join(" ")}`);
    const heatScore = clampScore(
      velocityScore
      + absoluteActivityScore
      + participationScore
      + freshnessScore
      + spreadScore
      + authorityScore
      + githubPrActivityScore
      + officialStatusScore
      + decisionScore
      + materialityScore,
    );
    const confidenceScore = clampScore(
      35
      + issue.sources.length * 12
      + (issue.eipIds.length ? 12 : 0)
      + (issue.sourceSignals.some((signal) => signal.replyCount !== undefined || signal.viewCount !== undefined) ? 10 : 0)
      + (issue.sourceSignals.some((signal) => signal.participantCount !== undefined) ? 8 : 0),
    );
    const status = classifyEmerging(issue, heatScore, decisionScore);
    const heatChange = Math.max(...velocity.map((item) => item.windowHours === 168 ? (item.replyDelta ?? 0) + Math.floor((item.viewDelta ?? 0) / 100) : 0), 0);
    return {
      ...issue,
      status,
      heatScore,
      heatChange,
      confidenceScore,
      metrics: { ...issue.metrics, velocity },
      scoreBreakdown: [
        { label: "7-day Velocity", value: velocityScore, reason: "Weekly activity growth from stored snapshots; shorter windows are supporting signals only." },
        { label: "Absolute Activity", value: absoluteActivityScore, reason: "Current replies, views, and participant breadth support cold-start detection." },
        { label: "Participation", value: participationScore, reason: "Replies and known participant breadth." },
        { label: "Freshness", value: freshnessScore, reason: "Recent creation or recent source activity." },
        { label: "Cross-source Spread", value: spreadScore, reason: `${issue.sources.length} independent source(s).` },
        { label: "Authority / Contributor", value: authorityScore, reason: "No stable public authority metadata accepted in P0." },
        { label: "GitHub PR Activity", value: githubPrActivityScore, reason: "Open PR or draft activity is a production weekly signal." },
        { label: "Official Status", value: officialStatusScore, reason: "Review, Last Call, Final, and Withdrawn states shape weekly priority." },
        { label: "Decision Proximity", value: decisionScore, reason: "Only explicit public decision-related labels/text are counted." },
        { label: "Materiality", value: materialityScore, reason: "Protocol-impact topic terms are treated as a small supporting signal." },
      ],
      summaries: summarizeIssue(issue, velocity),
    };
  }).sort((a, b) => b.heatScore - a.heatScore || b.confidenceScore - a.confidenceScore || String(b.lastActivityAt ?? "").localeCompare(String(a.lastActivityAt ?? "")));
}

async function collectMagiciansDiscovery(options: FetchOptions): Promise<{ rawSignals: EmergingRawSignal[]; status: SourceCollectionDiagnostic }> {
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * DAY_MS).toISOString();
  const baseUrl = "https://ethereum-magicians.org/latest.json";
  const maxPages = Math.max(1, Math.ceil((options.limit ?? MAGICIANS_MAX_TOPICS) / MAGICIANS_PAGE_SIZE), MAGICIANS_MAX_PAGES);
  const maxTopics = Math.max(options.limit ?? 0, MAGICIANS_MAX_TOPICS);
  const topicsWithinWindow: unknown[] = [];
  let pagesFetched = 0;
  let topicsScanned = 0;
  let stoppedReason = "completed";
  let truncated = false;
  try {
    for (let page = 0; page < maxPages; page += 1) {
      const url = `${baseUrl}?page=${page}`;
      const json = await fetchJson(url, options);
      pagesFetched += 1;
      const topicList = (json as { topic_list?: { topics?: unknown[]; more_topics_url?: string } }).topic_list;
      const topics = Array.isArray(topicList?.topics) ? topicList.topics : [];
      if (!topics.length) {
        stoppedReason = "empty_page";
        break;
      }
      topicsScanned += topics.length;
      const inWindow = topics.filter((topic) => topicOverlapsWindow(topic, windowStart));
      topicsWithinWindow.push(...inWindow);
      const pageStillOverlaps = topics.some((topic) => topicOverlapsWindow(topic, windowStart));
      if (topicsScanned >= maxTopics) {
        stoppedReason = "max_topics";
        truncated = true;
        break;
      }
      if (!pageStillOverlaps) {
        stoppedReason = "window_exhausted";
        break;
      }
      if (!topicList?.more_topics_url) {
        stoppedReason = "no_more_topics";
        break;
      }
      if (page === maxPages - 1) {
        stoppedReason = "max_pages";
        truncated = true;
      }
    }
    const rawSignals = topicsWithinWindow.flatMap((value) => magiciansTopicToSignal(value, now));
    return {
      rawSignals,
      status: {
        ...sourceStatus("Ethereum Magicians latest topics", "github_api", baseUrl, "success", rawSignals.length),
        freshness: {
          collectedAt: now.toISOString(),
          stale: false,
        },
        requestQuery: JSON.stringify({
          pagesFetched,
          topicsScanned,
          topicsWithinWindow: topicsWithinWindow.length,
          rawSignalsCreated: rawSignals.length,
          paginationStoppedReason: stoppedReason,
          truncated,
        }),
      },
    };
  } catch (error) {
    return {
      rawSignals: [],
      status: {
        ...sourceStatus("Ethereum Magicians latest topics", "github_api", baseUrl, "failure", 0, error),
        requestQuery: JSON.stringify({
          pagesFetched,
          topicsScanned,
          topicsWithinWindow: topicsWithinWindow.length,
          rawSignalsCreated: 0,
          paginationStoppedReason: "failure",
          truncated,
        }),
      },
    };
  }
}

async function collectGithubPrDiscovery(options: FetchOptions): Promise<{ rawSignals: EmergingRawSignal[]; status: SourceCollectionDiagnostic }> {
  const now = options.now ?? new Date();
  const rawSignals: EmergingRawSignal[] = [];
  const failures: string[] = [];
  let prsScanned = 0;
  let detailRequests = 0;
  for (const repo of REPOSITORIES) {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls?state=open&sort=updated&direction=desc&per_page=${Math.min(50, options.limit ?? 30)}`;
    try {
      const prs = await fetchJson(url, options);
      if (Array.isArray(prs)) {
        prsScanned += prs.length;
        for (const pr of prs) {
          const resolved = detailRequests < 10
            ? await resolveGithubPrForDiscovery(pr, repo, options, now).then((result) => {
              if (result.detailRequested) detailRequests += 1;
              return result.rawSignals;
            })
            : githubPrToSignal(pr, repo.sourceRepo, now);
          rawSignals.push(...resolved);
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    rawSignals,
    status: {
      ...sourceStatus("GitHub EIP/ERC open PRs", "github_api", "ethereum/EIPs + ethereum/ercs pulls", failures.length ? failures.length === REPOSITORIES.length ? "failure" : "partial_failure" : "success", rawSignals.length, failures.join(" | ")),
      requestAttempted: true,
      requestQuery: JSON.stringify({ PRsScanned: prsScanned, rawSignalsCreated: rawSignals.length, detailRequests }),
    },
  };
}

async function resolveGithubPrForDiscovery(
  value: unknown,
  repo: { owner: string; repo: string; sourceRepo: SourceRepo },
  options: FetchOptions,
  now: Date,
): Promise<{ rawSignals: EmergingRawSignal[]; detailRequested: boolean }> {
  const initial = githubPrToSignal(value, repo.sourceRepo, now);
  const signal = initial[0];
  if (!signal || !githubIdentityNeedsDetail(signal)) return { rawSignals: initial, detailRequested: false };
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = readNumber(record.number);
  if (!number) return { rawSignals: initial, detailRequested: false };
  try {
    const filesUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls/${number}/files?per_page=30`;
    const files = await fetchJson(filesUrl, options);
    const changedFiles = Array.isArray(files)
      ? files.map((file) => readString((file as Record<string, unknown>).filename)).filter((item): item is string => Boolean(item))
      : [];
    if (!changedFiles.length) return { rawSignals: initial, detailRequested: true };
    return {
      rawSignals: githubPrToSignal({ ...record, changedFiles }, repo.sourceRepo, now),
      detailRequested: true,
    };
  } catch {
    return { rawSignals: initial, detailRequested: true };
  }
}

function githubIdentityNeedsDetail(signal: EmergingRawSignal): boolean {
  return !signal.primaryProposalId || signal.extractedEipIds.length > 1;
}

function magiciansTopicToSignal(value: unknown, now: Date): EmergingRawSignal[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const id = readNumber(record.id);
  const slug = readString(record.slug);
  const title = readString(record.title);
  if (!id || !title) return [];
  const url = `https://ethereum-magicians.org/t/${slug ?? "-"}/${id}`;
  const posters = Array.isArray(record.posters) ? record.posters : [];
  const identity = resolveProposalIdentity({
    title,
    labels: readStringArray(record.tags),
  });
  return [{
    source: "ethereum_magicians",
    sourceId: String(id),
    url,
    title,
    category: readString((record.category_id)),
    createdAt: readString(record.created_at),
    lastActivityAt: readString(record.bumped_at) ?? readString(record.last_posted_at),
    replyCount: readNumber(record.reply_count) ?? boundedSubtract(readNumber(record.posts_count), 1),
    viewCount: readNumber(record.views),
    participantCount: readNumber(record.participant_count) ?? (posters.length || undefined),
    authorLogins: posters
      .map((poster) => readString((poster as Record<string, unknown>).user_id) ?? readString((poster as Record<string, unknown>).description))
      .filter((item): item is string => Boolean(item)),
    labels: readStringArray(record.tags),
    primaryProposalId: identity.primaryProposalId,
    relatedProposalIds: identity.relatedProposalIds,
    extractedEipIds: identity.allProposalIds,
    collectedAt: now.toISOString(),
    facts: {
      sourceTopicId: id,
      postersKnown: posters.length,
    },
  }];
}

function githubPrToSignal(value: unknown, sourceRepo: SourceRepo, now: Date): EmergingRawSignal[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const number = readNumber(record.number);
  const title = readString(record.title);
  const url = readString(record.html_url);
  if (!number || !title || !url) return [];
  const labels = Array.isArray(record.labels)
    ? record.labels.map((label) => readString((label as Record<string, unknown>).name)).filter((item): item is string => Boolean(item))
    : [];
  const body = readString(record.body) ?? "";
  const identity = resolveProposalIdentity({
    title,
    body,
    labels,
    sourceRepo,
    changedFiles: readChangedFiles(record),
    frontmatterProposalId: readFrontmatterProposalId(record, sourceRepo),
  });
  return [{
    source: "github_pr",
    sourceId: `${sourceRepo}#${number}`,
    sourceRepo,
    url,
    title,
    status: Boolean(record.draft) ? "draft" : readString(record.state),
    createdAt: readString(record.created_at),
    lastActivityAt: readString(record.updated_at),
    replyCount: readNumber(record.comments) !== undefined || readNumber(record.review_comments) !== undefined
      ? (readNumber(record.comments) ?? 0) + (readNumber(record.review_comments) ?? 0)
      : undefined,
    participantCount: readString((record.user as Record<string, unknown> | undefined)?.login) ? 1 : undefined,
    authorLogins: [readString((record.user as Record<string, unknown> | undefined)?.login)].filter((item): item is string => Boolean(item)),
    labels,
    primaryProposalId: identity.primaryProposalId,
    relatedProposalIds: identity.relatedProposalIds,
    extractedEipIds: identity.allProposalIds,
    collectedAt: now.toISOString(),
    facts: {
      pullNumber: number,
      draft: Boolean(record.draft),
      sourceRepo,
    },
  }];
}

function calculateVelocity(signal: EmergingRawSignal, db: AppDatabase | undefined, now: Date): EmergingVelocity[] {
  const windows: Array<6 | 24 | 72 | 168> = [6, 24, 72, 168];
  if (!db) return windows.map((windowHours) => ({ windowHours }));
  return windows.map((windowHours) => {
    const since = new Date(now.getTime() - windowHours * HOUR_MS).toISOString();
    const history = getEmergingActivitySnapshots(db, signal.source, signal.sourceId, since);
    const previous = history[0];
    const replyDelta = delta(signal.replyCount, previous?.replyCount);
    const viewDelta = delta(signal.viewCount, previous?.viewCount);
    const participantDelta = delta(signal.participantCount, previous?.participantCount);
    return {
      windowHours,
      replyDelta,
      viewDelta,
      participantDelta,
      replyGrowthPct: growthPct(signal.replyCount, previous?.replyCount),
      viewGrowthPct: growthPct(signal.viewCount, previous?.viewCount),
    };
  });
}

function velocityPoints(value: EmergingVelocity): number {
  const reply = value.replyDelta ?? 0;
  const views = value.viewDelta ?? 0;
  const participants = value.participantDelta ?? 0;
  const floor = reply >= 5 || views >= 250 || participants >= 3;
  if (!floor) return 0;
  const growth = Math.max(value.replyGrowthPct ?? 0, value.viewGrowthPct ?? 0);
  const raw = Math.log2(1 + reply) * 5 + Math.log2(1 + views / 100) * 4 + participants * 2 + Math.min(8, growth / 50);
  return Math.min(25, Math.round(raw));
}

function absoluteActivityPoints(replies: number | undefined, views: number | undefined, participants: number | undefined): number {
  let score = 0;
  if (replies !== undefined) score += Math.min(10, Math.log2(1 + replies) * 1.9);
  if (views !== undefined) score += Math.min(8, Math.log2(1 + views / 80) * 2.1);
  if (participants !== undefined) score += Math.min(7, Math.log2(1 + participants) * 2.1);
  const hasStrongFloor = (replies ?? 0) >= 20 || (views ?? 0) >= 1200 || (participants ?? 0) >= 8;
  return hasStrongFloor ? Math.round(score) : Math.min(10, Math.round(score));
}

function participationPoints(replies: number | undefined, participants: number | undefined): number {
  let score = 0;
  if (replies !== undefined) score += Math.min(8, Math.log2(1 + replies) * 1.6);
  if (participants !== undefined) score += Math.min(7, Math.log2(1 + participants) * 2.1);
  return Math.round(score);
}

function freshnessPoints(createdAt: string | null | undefined, lastActivityAt: string | null | undefined, now: Date): number {
  const createdDays = ageDays(createdAt, now);
  const activeDays = ageDays(lastActivityAt, now);
  if (createdDays !== undefined && createdDays <= 7 && activeDays !== undefined && activeDays <= 2) return 15;
  if (activeDays !== undefined && activeDays <= 1) return 12;
  if (activeDays !== undefined && activeDays <= 7) return 9;
  if (activeDays !== undefined && activeDays <= 30) return 5;
  return 0;
}

function decisionPoints(issue: EmergingIssue): number {
  const text = `${issue.title} ${issue.sourceSignals.flatMap((signal) => signal.labels ?? []).join(" ")}`.toLowerCase();
  return /\blast call\b|\bpfi\b|\bfork\b|\ball ?core ?devs\b|\bacd\b|\bdecision\b|\binclusion\b/.test(text) ? 10 : 0;
}

function materialityPoints(text: string): number {
  return /(consensus|issuance|execution|security|account abstraction|gas|state growth|scaling|validator|governance|rwa|wallet)/i.test(text) ? 5 : 0;
}

function officialStatusPoints(issue: EmergingIssue): number {
  const statuses = issue.sourceSignals
    .map((signal) => signal.status?.toLowerCase())
    .filter((status): status is string => Boolean(status));
  if (statuses.some((status) => status.includes("last call"))) return 7;
  if (statuses.some((status) => status.includes("review"))) return 5;
  if (statuses.some((status) => status.includes("final") || status.includes("withdrawn"))) return 4;
  if (statuses.some((status) => status.includes("draft"))) return 2;
  return 0;
}

function classifyEmerging(issue: EmergingIssue, heat: number, decisionScore: number): EmergingIssue["status"] {
  if (decisionScore > 0 && heat >= EMERGING_THRESHOLDS.decisionHeat) return "DECISION_WATCH";
  if (issue.stage === "IMPLEMENTATION" && heat >= EMERGING_THRESHOLDS.decisionHeat) return "IMPLEMENTATION_WATCH";
  if (heat >= EMERGING_THRESHOLDS.hotHeat) return "HOT_ISSUE";
  return "EARLY_SIGNAL";
}

function summarizeIssue(issue: EmergingIssue, velocity: EmergingVelocity[]): EmergingIssue["summaries"] {
  const sourceText = issue.sources.map(sourceLabel).join(" + ");
  const velocity7d = velocity.find((item) => item.windowHours === 168);
  const moving = [
    velocity7d?.replyDelta !== undefined && velocity7d.replyDelta > 0 ? `7일 댓글 +${velocity7d.replyDelta}` : "",
    velocity7d?.viewDelta !== undefined && velocity7d.viewDelta > 0 ? `7일 조회 +${velocity7d.viewDelta}` : "",
    issue.sources.length > 1 ? "복수 출처에서 동시에 포착" : "",
  ].filter(Boolean).join(", ");
  return {
    whatIsHappening: `${sourceText}에서 ${issue.eipIds[0] ?? "번호 없는 주제"} 관련 activity가 포착됐습니다.`,
    whyMoving: moving || "아직 증가 속도를 판단할 snapshot이 부족합니다.",
    whyItMatters: materialityPoints(issue.title) > 0
      ? "프로토콜·지갑·거버넌스 영향 가능성이 있는 기술 키워드가 포함되어 있어 후속 근거 확인이 필요합니다."
      : "아직 중요성 판단 근거 부족. 활동 증가와 다른 출처 연결 여부를 먼저 확인해야 합니다.",
    watchNext: issue.sources.includes("github_pr")
      ? "PR review, draft 해제, 공식 문서 merge 여부를 확인합니다."
      : "GitHub PR 또는 공식 proposal 문서로 연결되는지 확인합니다.",
  };
}

function activitySnapshotFromSignal(signal: EmergingRawSignal): EmergingActivitySnapshot | null {
  if (signal.replyCount === undefined && signal.viewCount === undefined && signal.participantCount === undefined) return null;
  return {
    source: signal.source,
    sourceId: signal.sourceId,
    collectedAt: signal.collectedAt,
    replyCount: signal.replyCount,
    viewCount: signal.viewCount,
    participantCount: signal.participantCount,
    sourceRepo: signal.sourceRepo,
    url: signal.url,
    title: signal.title,
    category: signal.category,
    status: signal.status,
    createdAt: signal.createdAt,
    lastActivityAt: signal.lastActivityAt,
    primaryProposalId: signal.primaryProposalId,
    relatedProposalIds: sanitizeRelatedProposalIds(signal.relatedProposalIds ?? [], signal.primaryProposalId),
    extractedEipIds: signal.extractedEipIds,
    authorLogins: signal.authorLogins,
    labels: signal.labels,
    facts: signal.facts,
  };
}

function restoreRollingSignals(db: AppDatabase, now: Date): EmergingRawSignal[] {
  const since = new Date(now.getTime() - OBSERVATION_WINDOW_DAYS * DAY_MS).toISOString();
  return getLatestEmergingActivitySnapshotsSince(db, since)
    .filter((snapshot) => snapshot.title && snapshot.url)
    .filter((snapshot) => isWithinObservationWindow(snapshot.lastActivityAt ?? snapshot.createdAt ?? snapshot.collectedAt, since))
    .map((snapshot): EmergingRawSignal => ({
      source: snapshot.source,
      sourceId: snapshot.sourceId,
      sourceRepo: snapshot.sourceRepo,
      url: snapshot.url!,
      title: snapshot.title!,
      category: snapshot.category,
      status: snapshot.status,
      createdAt: snapshot.createdAt,
      lastActivityAt: snapshot.lastActivityAt ?? snapshot.collectedAt,
      replyCount: snapshot.replyCount,
      viewCount: snapshot.viewCount,
      participantCount: snapshot.participantCount,
      authorLogins: snapshot.authorLogins,
      labels: snapshot.labels,
      primaryProposalId: snapshot.primaryProposalId,
      relatedProposalIds: sanitizeRelatedProposalIds(snapshot.relatedProposalIds ?? [], snapshot.primaryProposalId),
      extractedEipIds: snapshot.extractedEipIds ?? [],
      collectedAt: now.toISOString(),
      facts: { ...(snapshot.facts ?? {}), restoredFromRollingSnapshot: true, previousCollectedAt: snapshot.collectedAt },
    }));
}

function issueKey(signal: EmergingRawSignal): string {
  if (signal.primaryProposalId) return `proposal:${signal.primaryProposalId.toUpperCase()}`;
  const ids = signal.extractedEipIds.map((id) => id.toUpperCase()).sort(compareProposalIds);
  if (ids.length === 1 && (titleStartsWithProposalId(signal.title, ids[0]) || titleProposalActionId(signal.title) === ids[0])) return `proposal:${ids[0]}`;
  return `topic:${normalizeTitle(signal.title)}`;
}

function buildEmergingDiagnostics(
  issues: EmergingIssue[],
  rawSignals: EmergingRawSignal[],
  sourceStatus: SourceCollectionDiagnostic[],
): EmergingDiagnostics {
  const renderedMain = new Set([
    ...issues.filter((issue) => issue.status === "HOT_ISSUE").slice(0, 5).map((issue) => issue.issueId),
    ...issues.filter((issue) => issue.status === "EARLY_SIGNAL").slice(0, 8).map((issue) => issue.issueId),
    ...issues.filter((issue) => issue.status === "DECISION_WATCH").slice(0, 8).map((issue) => issue.issueId),
  ]);
  const magiciansStatus = sourceStatus.find((status) => status.sourceName.includes("Magicians"));
  const githubStatus = sourceStatus.find((status) => status.sourceName.includes("GitHub EIP/ERC open PRs"));
  return {
    magicians: parseMagiciansDiagnostics(magiciansStatus?.requestQuery),
    github: parseGithubDiagnostics(githubStatus?.requestQuery),
    emerging: {
      rawSignalCount: rawSignals.length,
      resolvedIssueCount: issues.length,
      hotCount: issues.filter((issue) => issue.status === "HOT_ISSUE").length,
      earlyCount: issues.filter((issue) => issue.status === "EARLY_SIGNAL").length,
      decisionCount: issues.filter((issue) => issue.status === "DECISION_WATCH").length,
    },
    issues: issues.map((issue, index) => ({
      issueId: issue.issueId,
      primaryProposalId: issue.primaryProposalId,
      sourceSignals: issue.sourceSignals.map((signal) => ({
        source: signal.source,
        sourceId: signal.sourceId,
        title: signal.title,
        url: signal.url,
      })),
      heatScore: issue.heatScore,
      confidenceScore: issue.confidenceScore,
      status: issue.status,
      rankingPosition: index + 1,
      rendered: renderedMain.has(issue.issueId),
      notRenderedReason: renderedMain.has(issue.issueId) ? undefined : "available_in_full_emerging_view",
    })),
  };
}

function parseMagiciansDiagnostics(value: string | undefined): EmergingDiagnostics["magicians"] {
  const parsed = parseJsonObject(value);
  return {
    pagesFetched: Number(parsed.pagesFetched ?? 0),
    topicsScanned: Number(parsed.topicsScanned ?? 0),
    topicsWithinWindow: Number(parsed.topicsWithinWindow ?? 0),
    rawSignalsCreated: Number(parsed.rawSignalsCreated ?? 0),
    paginationStoppedReason: String(parsed.paginationStoppedReason ?? "unknown"),
    truncated: Boolean(parsed.truncated),
  };
}

function parseGithubDiagnostics(value: string | undefined): EmergingDiagnostics["github"] {
  const parsed = parseJsonObject(value);
  return {
    PRsScanned: Number(parsed.PRsScanned ?? 0),
    rawSignalsCreated: Number(parsed.rawSignalsCreated ?? 0),
  };
}

function topicOverlapsWindow(value: unknown, windowStartIso: string): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return [
    readString(record.created_at),
    readString(record.bumped_at),
    readString(record.last_posted_at),
  ].some((date) => isWithinObservationWindow(date, windowStartIso));
}

function isWithinObservationWindow(value: string | null | undefined, windowStartIso: string): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.parse(windowStartIso);
}

function sanitizeRelatedProposalIds(ids: string[], primaryProposalId?: string): string[] {
  return [...new Set(ids.filter((id) => id && id !== primaryProposalId))].sort(compareProposalIds);
}

function dedupeRawSignals(signals: EmergingRawSignal[]): EmergingRawSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.source}:${signal.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceStatus(
  sourceName: string,
  sourceType: SourceCollectionDiagnostic["sourceType"],
  requestUrl: string,
  result: SourceCollectionDiagnostic["result"],
  recordCountCollected: number,
  error?: unknown,
): SourceCollectionDiagnostic {
  return {
    sourceName,
    sourceType,
    requestAttempted: true,
    requestUrl,
    result,
    failureReason: error ? error instanceof Error ? error.message : String(error) : undefined,
    retryCount: 0,
    cachedDataAvailable: false,
    recordCountCollected,
  };
}

async function fetchJson(url: string, options: FetchOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
    if (options.githubToken && url.includes("api.github.com")) headers.Authorization = `Bearer ${options.githubToken}`;
    const response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function extractProposalIds(text: string): string[] {
  const ids = [...text.matchAll(/\b(EIP|ERC)[-\s]?(\d{1,6})\b/gi)]
    .map((match) => `${match[1]!.toUpperCase()}-${Number(match[2])}`);
  return [...new Set(ids)].sort(compareProposalIds);
}

export function resolveProposalIdentity(input: {
  title?: string;
  body?: string;
  labels?: string[];
  sourceRepo?: SourceRepo;
  frontmatterProposalId?: string;
  filename?: string;
  changedFiles?: string[];
  metadataProposalId?: string;
  discussionsToProposalId?: string;
}): { primaryProposalId?: string; relatedProposalIds: string[]; allProposalIds: string[] } {
  const text = [input.title, input.body, ...(input.labels ?? [])].filter(Boolean).join("\n");
  const allProposalIds = extractProposalIds(text);
  const primaryProposalId = [
    normalizeProposalId(input.frontmatterProposalId),
    proposalIdFromFilename(input.filename),
    ...(input.changedFiles ?? []).map(proposalIdFromFilename),
    normalizeProposalId(input.metadataProposalId),
    normalizeProposalId(input.discussionsToProposalId),
    titleLeadingProposalId(input.title ?? "") ?? titleProposalActionId(input.title ?? ""),
  ].find((id): id is string => Boolean(id));
  const relatedProposalIds = sanitizeRelatedProposalIds(allProposalIds, primaryProposalId);
  return {
    primaryProposalId,
    relatedProposalIds,
    allProposalIds: [...new Set([primaryProposalId, ...relatedProposalIds].filter((id): id is string => Boolean(id)))].sort(compareProposalIds),
  };
}

export function extractRelatedProposalIds(text: string, primaryProposalId?: string): string[] {
  return sanitizeRelatedProposalIds(extractProposalIds(text), primaryProposalId);
}

function primaryProposalIdForSignals(signals: EmergingRawSignal[]): string | undefined {
  const counts = new Map<string, number>();
  for (const signal of signals) {
    if (!signal.primaryProposalId) continue;
    counts.set(signal.primaryProposalId, (counts.get(signal.primaryProposalId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || compareProposalIds(a[0], b[0]))[0]?.[0];
}

function titleLeadingProposalId(title: string): string | undefined {
  return normalizeProposalId(title.match(/^\s*(EIP|ERC)[-\s]?(\d{1,6})\b/i)?.slice(1, 3).join("-"));
}

function titleProposalActionId(title: string): string | undefined {
  const match = title.match(/^\s*(?:add|draft|create|new)\s+(EIP|ERC)[-\s]?(\d{1,6})\b/i);
  return match ? `${match[1]!.toUpperCase()}-${Number(match[2])}` : undefined;
}

function titleStartsWithProposalId(title: string, proposalId: string): boolean {
  return titleLeadingProposalId(title) === proposalId;
}

function proposalIdFromFilename(value: string | undefined | null): string | undefined {
  const match = String(value ?? "").match(/\b(eip|erc)-(\d{1,6})\.md\b/i);
  return match ? `${match[1]!.toUpperCase()}-${Number(match[2])}` : undefined;
}

function normalizeProposalId(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const match = String(value).match(/\b(EIP|ERC)?[-\s]?(\d{1,6})\b/i);
  if (!match) return undefined;
  const prefix = match[1]?.toUpperCase();
  if (prefix === "EIP" || prefix === "ERC") return `${prefix}-${Number(match[2])}`;
  return undefined;
}

function readChangedFiles(record: Record<string, unknown>): string[] {
  const files = record.changedFiles ?? record.files;
  if (!Array.isArray(files)) return [];
  return files.map((file) => typeof file === "string" ? file : readString((file as Record<string, unknown>)?.filename)).filter((item): item is string => Boolean(item));
}

function readFrontmatterProposalId(record: Record<string, unknown>, sourceRepo?: SourceRepo): string | undefined {
  const frontmatter = record.frontmatter;
  if (frontmatter && typeof frontmatter === "object") {
    const ercValue = readString((frontmatter as Record<string, unknown>).erc);
    const eipValue = readString((frontmatter as Record<string, unknown>).eip);
    const value = ercValue ?? eipValue;
    const kind = ercValue || sourceRepo === "ethereum/ercs" ? "ERC" : "EIP";
    return value && /^\d+$/.test(value) ? `${kind}-${value}` : value;
  }
  return readString(record.frontmatterProposalId);
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function inferStage(signals: EmergingRawSignal[]): EmergingIssue["stage"] {
  if (signals.some((signal) => signal.source === "github_pr")) return "PRE_MERGE";
  if (signals.some((signal) => signal.source === "official_repo")) return "STANDARDIZING";
  if (signals.some((signal) => signal.source === "ethereum_magicians")) return "DISCUSSION";
  return "UNKNOWN";
}

function sourceLabel(source: EmergingSource): string {
  if (source === "ethereum_magicians") return "Magicians";
  if (source === "github_pr") return "GitHub";
  return "Official";
}

function compareSignalFreshness(left: EmergingRawSignal, right: EmergingRawSignal): number {
  return Date.parse(right.lastActivityAt ?? right.createdAt ?? "") - Date.parse(left.lastActivityAt ?? left.createdAt ?? "");
}

function compareProposalIds(left: string, right: string): number {
  const ln = Number(left.match(/\d+/)?.[0] ?? 0);
  const rn = Number(right.match(/\d+/)?.[0] ?? 0);
  return ln - rn || left.localeCompare(right);
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/\b(eip|erc)[-\s]?\d{1,6}\b/gi, "").replace(/[^a-z0-9가-힣]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function maxKnown(values: Array<number | undefined>): number | undefined {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length ? Math.max(...known) : undefined;
}

function maxIso(values: Array<string | null | undefined>): string | undefined {
  const times = values.map((value) => value ? Date.parse(value) : Number.NaN).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : undefined;
}

function minIso(values: Array<string | null | undefined>): string | undefined {
  const times = values.map((value) => value ? Date.parse(value) : Number.NaN).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : undefined;
}

function delta(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined || previous === undefined) return undefined;
  return Math.max(0, current - previous);
}

function growthPct(current: number | undefined, previous: number | undefined): number | undefined {
  if (current === undefined || previous === undefined || previous < 3) return undefined;
  return Math.max(0, (current - previous) / previous * 100);
}

function ageDays(value: string | null | undefined, now: Date): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, (now.getTime() - time) / DAY_MS);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function boundedSubtract(value: number | undefined, amount: number): number | undefined {
  return value === undefined ? undefined : Math.max(0, value - amount);
}
