import {
  getEmergingActivitySnapshots,
  getEmergingAlertState,
  insertEmergingActivitySnapshots,
  upsertEmergingAlertState,
  type AppDatabase,
} from "./db.ts";
import { REPOSITORIES } from "./github.ts";
import type {
  ChangeEvent,
  EmergingActivitySnapshot,
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
}): EmergingLayer {
  const now = input.now ?? new Date();
  const officialSignals = buildOfficialRepoSignals(input.records ?? [], input.recentEvents ?? [], now);
  const rawSignals = dedupeRawSignals([...(input.rawSignals ?? []), ...officialSignals]);
  const snapshots = rawSignals.map(activitySnapshotFromSignal).filter((snapshot): snapshot is EmergingActivitySnapshot => Boolean(snapshot));
  if (input.db) insertEmergingActivitySnapshots(input.db, snapshots);
  const issues = scoreEmergingIssues(resolveEmergingIssues(rawSignals), input.db, now);
  return {
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
    generatedBy: "deterministic_emerging_signal_engine",
  };
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
  const velocity24 = issue.metrics.velocity.find((item) => item.windowHours === 24);
  const deltas = [
    velocity24?.replyDelta !== undefined ? `+${velocity24.replyDelta} replies` : "",
    velocity24?.viewDelta !== undefined ? `+${velocity24.viewDelta} views` : "",
  ].filter(Boolean).join(" / ") || "activity delta unavailable";
  const lines = [
    "HOT ISSUE",
    "",
    `${eip} / ${issue.title}`,
    "",
    `Heat ${issue.heatScore}${issue.heatChange ? ` +${issue.heatChange}` : ""}`,
    `Sources: ${sourceNames}`,
    `24h: ${deltas}`,
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
    const eipIds = [...new Set(sourceSignals.flatMap((signal) => signal.extractedEipIds))].sort(compareProposalIds);
    const preferred = sourceSignals.sort(compareSignalFreshness)[0]!;
    const sources = [...new Set(sourceSignals.map((signal) => signal.source))];
    const createdAt = minIso(sourceSignals.map((signal) => signal.createdAt));
    const lastActivityAt = maxIso(sourceSignals.map((signal) => signal.lastActivityAt));
    return {
      issueId,
      title: cleanTitle(preferred.title),
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
    const velocityScore = Math.min(25, Math.max(...velocity.map(velocityPoints), 0));
    const participationScore = participationPoints(issue.metrics.replyCount, issue.metrics.participantCount);
    const freshnessScore = freshnessPoints(issue.createdAt, issue.lastActivityAt, now);
    const spreadScore = Math.min(15, Math.max(0, (issue.sources.length - 1) * 8 + (issue.sources.includes("official_repo") ? 3 : 0)));
    const authorityScore = 0;
    const decisionScore = decisionPoints(issue);
    const materialityScore = materialityPoints(`${issue.title} ${issue.sourceSignals.flatMap((signal) => signal.labels ?? []).join(" ")}`);
    const heatScore = clampScore(velocityScore + participationScore + freshnessScore + spreadScore + authorityScore + decisionScore + materialityScore);
    const confidenceScore = clampScore(
      35
      + issue.sources.length * 12
      + (issue.eipIds.length ? 12 : 0)
      + (issue.sourceSignals.some((signal) => signal.replyCount !== undefined || signal.viewCount !== undefined) ? 10 : 0)
      + (issue.sourceSignals.some((signal) => signal.participantCount !== undefined) ? 8 : 0),
    );
    const status = classifyEmerging(issue, heatScore, decisionScore);
    const heatChange = Math.max(...velocity.map((item) => item.windowHours === 24 ? (item.replyDelta ?? 0) + Math.floor((item.viewDelta ?? 0) / 100) : 0), 0);
    return {
      ...issue,
      status,
      heatScore,
      heatChange,
      confidenceScore,
      metrics: { ...issue.metrics, velocity },
      scoreBreakdown: [
        { label: "Velocity", value: velocityScore, reason: "Rolling activity growth from stored snapshots." },
        { label: "Participation", value: participationScore, reason: "Replies and known participant breadth." },
        { label: "Freshness", value: freshnessScore, reason: "Recent creation or recent source activity." },
        { label: "Cross-source Spread", value: spreadScore, reason: `${issue.sources.length} independent source(s).` },
        { label: "Authority / Contributor", value: authorityScore, reason: "No stable public authority metadata accepted in P0." },
        { label: "Decision Proximity", value: decisionScore, reason: "Only explicit public decision-related labels/text are counted." },
        { label: "Materiality", value: materialityScore, reason: "Protocol-impact topic terms are treated as a small supporting signal." },
      ],
      summaries: summarizeIssue(issue, velocity),
    };
  }).sort((a, b) => b.heatScore - a.heatScore || b.confidenceScore - a.confidenceScore || String(b.lastActivityAt ?? "").localeCompare(String(a.lastActivityAt ?? "")));
}

async function collectMagiciansDiscovery(options: FetchOptions): Promise<{ rawSignals: EmergingRawSignal[]; status: SourceCollectionDiagnostic }> {
  const now = options.now ?? new Date();
  const url = "https://ethereum-magicians.org/latest.json";
  try {
    const json = await fetchJson(url, options);
    const topics = Array.isArray((json as { topic_list?: { topics?: unknown[] } }).topic_list?.topics)
      ? (json as { topic_list: { topics: unknown[] } }).topic_list.topics
      : [];
    const rawSignals = topics.slice(0, options.limit ?? 60).flatMap((value) => magiciansTopicToSignal(value, now));
    return {
      rawSignals,
      status: sourceStatus("Ethereum Magicians latest topics", "github_api", url, "success", rawSignals.length),
    };
  } catch (error) {
    return {
      rawSignals: [],
      status: sourceStatus("Ethereum Magicians latest topics", "github_api", url, "failure", 0, error),
    };
  }
}

async function collectGithubPrDiscovery(options: FetchOptions): Promise<{ rawSignals: EmergingRawSignal[]; status: SourceCollectionDiagnostic }> {
  const now = options.now ?? new Date();
  const rawSignals: EmergingRawSignal[] = [];
  const failures: string[] = [];
  for (const repo of REPOSITORIES) {
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/pulls?state=open&sort=updated&direction=desc&per_page=${Math.min(50, options.limit ?? 30)}`;
    try {
      const prs = await fetchJson(url, options);
      if (Array.isArray(prs)) {
        rawSignals.push(...prs.flatMap((pr) => githubPrToSignal(pr, repo.sourceRepo, now)));
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
    },
  };
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
    extractedEipIds: extractProposalIds(`${title} ${readStringArray(record.tags).join(" ")}`),
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
  return [{
    source: "github_pr",
    sourceId: `${sourceRepo}#${number}`,
    sourceRepo,
    url,
    title,
    status: readString(record.draft) === "true" ? "draft" : readString(record.state),
    createdAt: readString(record.created_at),
    lastActivityAt: readString(record.updated_at),
    replyCount: readNumber(record.comments) !== undefined || readNumber(record.review_comments) !== undefined
      ? (readNumber(record.comments) ?? 0) + (readNumber(record.review_comments) ?? 0)
      : undefined,
    participantCount: readString((record.user as Record<string, unknown> | undefined)?.login) ? 1 : undefined,
    authorLogins: [readString((record.user as Record<string, unknown> | undefined)?.login)].filter((item): item is string => Boolean(item)),
    labels,
    extractedEipIds: extractProposalIds(`${title}\n${body}\n${labels.join(" ")}`),
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

function classifyEmerging(issue: EmergingIssue, heat: number, decisionScore: number): EmergingIssue["status"] {
  if (decisionScore > 0 && heat >= EMERGING_THRESHOLDS.decisionHeat) return "DECISION_WATCH";
  if (issue.stage === "IMPLEMENTATION" && heat >= EMERGING_THRESHOLDS.decisionHeat) return "IMPLEMENTATION_WATCH";
  if (heat >= EMERGING_THRESHOLDS.hotHeat) return "HOT_ISSUE";
  return "EARLY_SIGNAL";
}

function summarizeIssue(issue: EmergingIssue, velocity: EmergingVelocity[]): EmergingIssue["summaries"] {
  const sourceText = issue.sources.map(sourceLabel).join(" + ");
  const velocity24 = velocity.find((item) => item.windowHours === 24);
  const moving = [
    velocity24?.replyDelta !== undefined && velocity24.replyDelta > 0 ? `24시간 댓글 +${velocity24.replyDelta}` : "",
    velocity24?.viewDelta !== undefined && velocity24.viewDelta > 0 ? `24시간 조회 +${velocity24.viewDelta}` : "",
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
  };
}

function issueKey(signal: EmergingRawSignal): string {
  const ids = signal.extractedEipIds.map((id) => id.toUpperCase()).sort(compareProposalIds);
  if (ids.length) return `proposal:${ids.join("+")}`;
  return `topic:${normalizeTitle(signal.title)}`;
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
