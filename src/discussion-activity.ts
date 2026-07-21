import {
  getCachedDiscussionActivity,
  upsertCachedDiscussionActivity,
  type AppDatabase,
} from "./db.ts";
import type { DiscussionHeatItem } from "./types.ts";

export type FetchDiscussionOptions = {
  db?: AppDatabase;
  fetchImpl?: typeof fetch;
  now?: Date;
  limit?: number;
  timeoutMs?: number;
  cacheTtlHours?: number;
};

type DiscourseTopicJson = {
  id?: unknown;
  title?: unknown;
  created_at?: unknown;
  last_posted_at?: unknown;
  bumped_at?: unknown;
  posts_count?: unknown;
  reply_count?: unknown;
  participant_count?: unknown;
  views?: unknown;
  tags?: unknown;
  posters?: unknown;
  details?: {
    participants?: unknown;
  };
};

const DEFAULT_LIMIT = 25;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "EIPreporter/1.0 (+https://github.com/mrunderdog/EIPreporter)";
const THEME_PRIORITY = [
  "Account Abstraction",
  "Wallet UX",
  "Identity / Credential",
  "Data Availability",
  "EVM / Gas / Opcode",
  "Network Upgrade / Governance",
  "Block / Validator Operations",
];

export async function enrichDiscussionHeat(
  items: DiscussionHeatItem[],
  options: FetchDiscussionOptions = {},
): Promise<DiscussionHeatItem[]> {
  const now = options.now ?? new Date();
  const limit = Number.isInteger(options.limit) && Number(options.limit) > 0
    ? Number(options.limit)
    : DEFAULT_LIMIT;
  const enriched: DiscussionHeatItem[] = [];

  for (const item of items.slice(0, limit)) {
    enriched.push(await enrichDiscussionItem(item, { ...options, now }));
  }

  for (const item of items.slice(limit)) {
    enriched.push(item);
  }

  return enriched.sort(compareDiscussionHeat);
}

export async function enrichDiscussionItem(
  item: DiscussionHeatItem,
  options: FetchDiscussionOptions = {},
): Promise<DiscussionHeatItem> {
  if (!item.discussionUrl) return withUnavailableActivity(item, "Discussion URL unavailable.");

  const now = options.now ?? new Date();
  const cached = readFreshCache(item.discussionUrl, now, options);
  if (cached) return applyActivity(item, cached);

  try {
    const topicJsonUrls = buildDiscourseTopicJsonUrlCandidates(item.discussionUrl);
    if (!topicJsonUrls.length) {
      return cacheAndApply(item, {
        discussionSource: sourceName(item.discussionUrl),
        discussionActivityScore: calculateDiscussionActivityScore({ hasDiscussionLink: true }),
        discussionScore: calculateDiscussionActivityScore({ hasDiscussionLink: true }),
        activityLevel: "Unknown",
        discussionSummaryFallback: "Activity details unavailable.",
        whyItMatters: buildDiscussionFallbackWhyItMatters(item),
        error: "Unsupported discussion URL format.",
      }, now, options);
    }

    const json = await fetchFirstJson(topicJsonUrls, options);
    const activity = extractDiscourseActivity(json, item.discussionUrl, now);
    return cacheAndApply(item, activity, now, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return cacheAndApply(item, {
      discussionSource: sourceName(item.discussionUrl),
      discussionActivityScore: calculateDiscussionActivityScore({ hasDiscussionLink: true }),
      discussionScore: calculateDiscussionActivityScore({ hasDiscussionLink: true }),
      activityLevel: "Unknown",
      discussionSummaryFallback: "Activity details unavailable.",
      whyItMatters: buildDiscussionFallbackWhyItMatters(item),
      error: detail,
    }, now, options);
  }
}

export function buildDiscourseTopicJsonUrl(rawUrl: string): string | null {
  return buildDiscourseTopicJsonUrlCandidates(rawUrl)[0] ?? null;
}

export function buildDiscourseTopicJsonUrlCandidates(rawUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return [];
  }

  if (!isLikelyDiscourseTopicUrl(url)) return [];

  const candidates: string[] = [];
  const addCandidate = (pathname: string) => {
    const candidate = new URL(url.toString());
    candidate.pathname = pathname;
    candidate.search = "";
    candidate.hash = "";
    const value = candidate.toString();
    if (!candidates.includes(value)) candidates.push(value);
  };

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  addCandidate(normalizedPath.endsWith(".json") ? normalizedPath : `${normalizedPath}.json`);

  const topicId = extractDiscourseTopicId(rawUrl);
  if (topicId) {
    addCandidate(`/t/${topicId}.json`);
    addCandidate(`/t/-/${topicId}.json`);
  }

  return candidates;
}

export function extractDiscourseTopicId(rawUrl: string): number | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const segments = url.pathname
    .replace(/\.json$/i, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const tIndex = segments.indexOf("t");
  if (tIndex === -1) return null;

  for (let index = segments.length - 1; index > tIndex; index -= 1) {
    if (/^\d+$/.test(segments[index])) return Number(segments[index]);
  }
  return null;
}

export function extractDiscourseActivity(
  json: unknown,
  discussionUrl: string,
  now = new Date(),
): Partial<DiscussionHeatItem> {
  const topic = json && typeof json === "object" ? json as DiscourseTopicJson : {};
  const createdAt = readString(topic.created_at);
  const lastActivityAt = readString(topic.last_posted_at) ?? readString(topic.bumped_at);
  const replyCount = readNumber(topic.reply_count)
    ?? boundedSubtract(readNumber(topic.posts_count), 1);
  const participantCount = readNumber(topic.participant_count)
    ?? readParticipantCount(topic.posters)
    ?? readParticipantCount(topic.details?.participants);
  const viewCount = readNumber(topic.views);
  const tags = readStringArray(topic.tags);
  const freshnessDays = calculateFreshnessDays(lastActivityAt, now);
  const discussionActivityScore = calculateDiscussionActivityScore({
    hasDiscussionLink: true,
    replyCount,
    freshnessDays,
    participantCount,
    viewCount,
  });

  return {
    discussionTopicId: readNumber(topic.id) ?? undefined,
    discussionTitle: readString(topic.title) ?? undefined,
    discussionSource: sourceName(discussionUrl),
    discussionCreatedAt: createdAt ?? undefined,
    discussionLastActivityAt: lastActivityAt ?? undefined,
    discussionReplyCount: replyCount,
    discussionParticipantCount: participantCount,
    discussionViewCount: viewCount,
    discussionTags: tags.length ? tags : undefined,
    discussionFreshnessDays: freshnessDays,
    discussionActivityScore,
    discussionScore: discussionActivityScore,
    activityLevel: classifyDiscussionActivity(discussionActivityScore, true),
    discussionSummaryFallback: "Discussion metadata collected from public topic activity.",
    whyItMatters: whyItMatters(freshnessDays, discussionActivityScore),
  };
}

export function calculateDiscussionActivityScore(input: {
  hasDiscussionLink: boolean;
  replyCount?: number;
  freshnessDays?: number;
  participantCount?: number;
  viewCount?: number;
}): number {
  let score = input.hasDiscussionLink ? 10 : 0;

  const replies = input.replyCount;
  if (replies !== undefined) {
    if (replies >= 51) score += 20;
    else if (replies >= 21) score += 15;
    else if (replies >= 6) score += 10;
    else if (replies >= 1) score += 5;
  }

  const freshness = input.freshnessDays;
  if (freshness !== undefined) {
    if (freshness <= 7) score += 25;
    else if (freshness <= 30) score += 15;
    else if (freshness <= 90) score += 8;
  }

  const participants = input.participantCount;
  if (participants !== undefined) {
    if (participants >= 16) score += 15;
    else if (participants >= 6) score += 10;
    else if (participants >= 2) score += 5;
  }

  const views = input.viewCount;
  if (views !== undefined) {
    if (views >= 2_000) score += 10;
    else if (views >= 500) score += 5;
  }

  return Math.min(100, score);
}

export function classifyDiscussionActivity(
  score: number | undefined,
  metadataAvailable: boolean,
): "High" | "Medium" | "Low" | "Unknown" {
  if (!metadataAvailable || score === undefined) return "Unknown";
  if (score >= 60) return "High";
  if (score >= 35) return "Medium";
  if (score >= 10) return "Low";
  return "Unknown";
}

export function calculateFreshnessDays(value: string | undefined | null, now = new Date()): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS));
}

function readFreshCache(
  discussionUrl: string,
  now: Date,
  options: FetchDiscussionOptions,
): Partial<DiscussionHeatItem> | null {
  if (!options.db) return null;
  const cached = getCachedDiscussionActivity(options.db, discussionUrl);
  if (!cached) return null;

  const ttlHours = options.cacheTtlHours ?? DEFAULT_CACHE_TTL_HOURS;
  const fetchedAt = Date.parse(cached.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return null;
  if (isUnavailableActivity(cached.activity)) return null;
  return now.getTime() - fetchedAt <= ttlHours * HOUR_MS ? cached.activity : null;
}

function cacheAndApply(
  item: DiscussionHeatItem,
  activity: Partial<DiscussionHeatItem>,
  now: Date,
  options: FetchDiscussionOptions,
): DiscussionHeatItem {
  if (options.db && item.discussionUrl) {
    upsertCachedDiscussionActivity(options.db, item.discussionUrl, now.toISOString(), activity);
  }
  return applyActivity(item, activity);
}

function applyActivity(
  item: DiscussionHeatItem,
  activity: Partial<DiscussionHeatItem>,
): DiscussionHeatItem {
  const whyItMatters = isLegacyUnavailableText(activity.whyItMatters)
    ? buildDiscussionFallbackWhyItMatters(item)
    : activity.whyItMatters ?? item.whyItMatters;
  const discussionSummaryFallback = isLegacyUnavailableText(activity.discussionSummaryFallback)
    ? "Activity details unavailable."
    : activity.discussionSummaryFallback;
  return {
    ...item,
    ...activity,
    discussionScore: activity.discussionActivityScore ?? activity.discussionScore ?? item.discussionScore,
    discussionSummaryFallback,
    whyItMatters,
  };
}

function withUnavailableActivity(item: DiscussionHeatItem, message: string): DiscussionHeatItem {
  return {
    ...item,
    discussionActivityScore: item.discussionScore ?? 0,
    activityLevel: "Unknown",
    discussionSummaryFallback: message,
    whyItMatters: buildDiscussionFallbackWhyItMatters(item),
  };
}

async function fetchFirstJson(urls: string[], options: FetchDiscussionOptions): Promise<unknown> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      return await fetchJson(url, options);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join(" | ") || "No Discourse JSON endpoint candidates.");
}

async function fetchJson(url: string, options: FetchDiscussionOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Discussion JSON request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function isLikelyDiscourseTopicUrl(url: URL): boolean {
  return url.hostname === "ethereum-magicians.org"
    || /^\/t(?:\/|$)/.test(url.pathname);
}

function sourceName(rawUrl: string): string {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
    if (hostname === "ethereum-magicians.org") return "Ethereum Magicians";
    return hostname;
  } catch {
    return "Unknown";
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
}

function readParticipantCount(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function boundedSubtract(value: number | undefined, amount: number): number | undefined {
  return value === undefined ? undefined : Math.max(0, value - amount);
}

function whyItMatters(freshnessDays: number | undefined, score: number): string {
  if (freshnessDays !== undefined && freshnessDays <= 30) {
    return "Fresh activity suggests the proposal is still being debated or refined.";
  }
  if (score >= 45) {
    return "Active discussion may indicate early community alignment or unresolved design questions.";
  }
  return "Older discussion exists, but recent activity is limited.";
}

function isLegacyUnavailableText(value: string | undefined): boolean {
  return value === "Discussion metadata available; activity details unavailable.";
}

function isUnavailableActivity(activity: Partial<DiscussionHeatItem>): boolean {
  return activity.activityLevel === "Unknown"
    && !activity.discussionLastActivityAt
    && !activity.discussionReplyCount
    && !activity.discussionParticipantCount
}

export function buildDiscussionFallbackWhyItMatters(item: Pick<DiscussionHeatItem, "theme" | "title" | "status">): string {
  const theme = inferFallbackTheme(item.theme, item.title);
  if (item.status === "Final" || item.status === "Withdrawn") {
    return `Discussion link exists, but public activity metadata could not be verified. Because the proposal is ${item.status}, treat it mainly as historical context unless status or spec-diff signals change.`;
  }
  if (theme === "Network Upgrade / Governance") {
    return "Discussion link exists for a network-upgrade proposal, but public activity metadata could not be verified. Track only if the proposal moves status or appears in upgrade planning.";
  }
  if (theme === "EVM / Gas / Opcode") {
    return "Discussion link exists for an execution-layer proposal. Activity metadata is unavailable, so monitor status changes and spec diffs before treating it as a strong signal.";
  }
  if (theme === "Data Availability") {
    return "Discussion link exists for a data-availability proposal. Without activity metadata, treat it as a watchlist item rather than an active heat signal.";
  }
  if (theme === "Identity / Credential") {
    return "Discussion link exists for an identity or credential proposal. This may matter for compliance and authorization models, but activity details are unavailable.";
  }
  if (theme === "Account Abstraction" || theme === "Wallet UX") {
    return "Discussion link exists for a wallet or account-abstraction proposal. Activity metadata is unavailable, so watch status movement and spec-diff evidence before prioritizing.";
  }
  return "Discussion link exists, but public activity metadata could not be verified. Treat it as a watchlist signal until status, spec diff, or discussion evidence increases.";
}

function inferFallbackTheme(theme: DiscussionHeatItem["theme"], title: string | null): DiscussionHeatItem["theme"] {
  if (theme !== "Unclassified") return theme;
  const text = (title ?? "").toLowerCase();
  if (/(identity|credential|attestation|permission|authorization)/.test(text)) return "Identity / Credential";
  if (/(blob|data availability|da\b|sampling)/.test(text)) return "Data Availability";
  if (/(evm|gas|opcode|precompile)/.test(text)) return "EVM / Gas / Opcode";
  if (/(upgrade|fork|governance|nomenclature|process)/.test(text)) return "Network Upgrade / Governance";
  return theme;
}

export function compareDiscussionHeat(left: DiscussionHeatItem, right: DiscussionHeatItem): number {
  const leftLast = Date.parse(left.discussionLastActivityAt ?? "");
  const rightLast = Date.parse(right.discussionLastActivityAt ?? "");
  return (right.discussionActivityScore ?? right.discussionScore ?? 0)
    - (left.discussionActivityScore ?? left.discussionScore ?? 0)
    || (Number.isFinite(rightLast) ? rightLast : 0) - (Number.isFinite(leftLast) ? leftLast : 0)
    || themePriority(left.theme) - themePriority(right.theme)
    || proposalNumber(right.proposalId) - proposalNumber(left.proposalId)
    || right.proposalId.localeCompare(left.proposalId, undefined, { numeric: true });
}

function themePriority(theme: DiscussionHeatItem["theme"]): number {
  const index = THEME_PRIORITY.indexOf(theme);
  return index === -1 ? THEME_PRIORITY.length : index;
}

function proposalNumber(proposalId: string): number {
  const match = proposalId.match(/\d+/);
  return match ? Number(match[0]) : 0;
}
