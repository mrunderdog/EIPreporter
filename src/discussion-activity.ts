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
  post_stream?: {
    posts?: unknown;
    stream?: unknown;
  };
};

type DiscoursePost = {
  id?: unknown;
  post_number?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  username?: unknown;
  name?: unknown;
  cooked?: unknown;
  raw?: unknown;
  reply_to_post_number?: unknown;
  hidden?: unknown;
  deleted_at?: unknown;
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
  if (!item.discussionUrl) {
    const discovered = await discoverDiscussionUrl(item, options);
    if (discovered.discussionUrl) return enrichDiscussionItem({ ...item, ...discovered }, options);
    return {
      ...withUnavailableActivity(item, "frontmatter thread 없음 · 추가 탐색 미실행"),
      ...discovered,
    };
  }

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
        discussionCollectionStatus: "parse_failed",
        discussionFetchAttempted: true,
        activityLevel: "Unknown",
        discussionSummaryFallback: "Activity details unavailable.",
        whyItMatters: buildDiscussionFallbackWhyItMatters(item),
        error: "Unsupported discussion URL format.",
      }, now, options);
    }

    const json = await fetchFirstJson(topicJsonUrls, options);
    const activity = await extractDiscourseActivityWithPagination(json, item.discussionUrl, now, options);
    return cacheAndApply(item, activity, now, options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return cacheAndApply(item, {
      discussionSource: sourceName(item.discussionUrl),
      discussionActivityScore: calculateDiscussionActivityScore({ hasDiscussionLink: true }),
      discussionScore: calculateDiscussionActivityScore({ hasDiscussionLink: true }),
      discussionCollectionStatus: "fetch_failed",
      discussionFetchAttempted: true,
      activityLevel: "Unknown",
      discussionSummaryFallback: "Activity details unavailable.",
      whyItMatters: buildDiscussionFallbackWhyItMatters(item),
      error: detail,
    }, now, options);
  }
}

async function discoverDiscussionUrl(
  item: DiscussionHeatItem,
  options: FetchDiscussionOptions,
): Promise<Partial<DiscussionHeatItem>> {
  const methodsTried: NonNullable<DiscussionHeatItem["discussionDiscovery"]>["methodsTried"] = ["frontmatter_discussions_to", "eips_page_link", "existing_database", "magicians_search"];
  const queries = unique([
    item.proposalId,
    item.title ? `"${item.title}"` : "",
  ].filter(Boolean));
  const candidates: string[] = [];
  for (const query of queries) {
    try {
      const url = new URL("https://ethereum-magicians.org/search.json");
      url.searchParams.set("q", query);
      const json = await fetchJson(url.toString(), options);
      candidates.push(...discussionCandidatesFromSearch(json, item));
    } catch {
      // Search failure is recorded as no confirmed URL; fetch failures for confirmed URLs are tracked separately.
    }
  }
  const uniqueCandidates = unique(candidates);
  const exact = uniqueCandidates.filter((url) => url.toLowerCase().includes(item.proposalId.toLowerCase()));
  const accepted = exact.length === 1 ? exact[0] : uniqueCandidates.length === 1 && searchCandidateLooksExact(uniqueCandidates[0]!, item) ? uniqueCandidates[0] : undefined;
  const result = accepted ? "url_confirmed" : uniqueCandidates.length > 1 ? "discovery_ambiguous" : "discovery_completed_not_found";
  return {
    discussionUrl: accepted ?? null,
    discussionLinks: accepted ? [accepted] : item.discussionLinks,
    discussionCollectionStatus: accepted ? "url_confirmed" : "url_not_found",
    discussionDiscovery: {
      searchAttempted: true,
      discoveryCompleted: true,
      methodsTried,
      matchedBy: accepted ? "magicians_search" : undefined,
      candidateUrls: uniqueCandidates,
      result,
    },
  };
}

function discussionCandidatesFromSearch(json: unknown, item: DiscussionHeatItem): string[] {
  const payload = json && typeof json === "object" ? json as { topics?: unknown; posts?: unknown } : {};
  const records = [
    ...(Array.isArray(payload.topics) ? payload.topics : []),
    ...(Array.isArray(payload.posts) ? payload.posts : []),
  ].filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === "object");
  return records.flatMap((record) => {
    const title = readString(record.title) ?? "";
    const slug = readString(record.slug);
    const id = readNumber(record.id) ?? readNumber(record.topic_id);
    const text = `${title} ${readString(record.blurb) ?? ""} ${readString(record.excerpt) ?? ""}`;
    if (!id || !slug) return [];
    if (!new RegExp(`\\b${escapeRegExp(item.proposalId)}\\b`, "i").test(text)) return [];
    return [`https://ethereum-magicians.org/t/${slug}/${id}`];
  });
}

function searchCandidateLooksExact(url: string, item: DiscussionHeatItem): boolean {
  return url.toLowerCase().includes(item.proposalId.toLowerCase());
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
  const addCandidate = (pathname: string, search = "") => {
    const candidate = new URL(url.toString());
    candidate.pathname = pathname;
    candidate.search = search;
    candidate.hash = "";
    const value = candidate.toString();
    if (!candidates.includes(value)) candidates.push(value);
  };

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  const normalizedJsonPath = normalizedPath.endsWith(".json") ? normalizedPath : `${normalizedPath}.json`;
  addCandidate(normalizedJsonPath, "?print=true");
  addCandidate(normalizedJsonPath);

  const topicId = extractDiscourseTopicId(rawUrl);
  if (topicId) {
    addCandidate(`/t/${topicId}.json`, "?print=true");
    addCandidate(`/t/${topicId}.json`);
    addCandidate(`/t/-/${topicId}.json`, "?print=true");
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
  return extractDiscourseActivityFromPosts(json, discussionUrl, now, undefined);
}

async function extractDiscourseActivityWithPagination(
  json: unknown,
  discussionUrl: string,
  now: Date,
  options: FetchDiscussionOptions,
): Promise<Partial<DiscussionHeatItem>> {
  const topic = json && typeof json === "object" ? json as DiscourseTopicJson : {};
  const initialPosts = readPosts(topic.post_stream?.posts);
  const totalPostIds = readNumberArray(topic.post_stream?.stream);
  const fetchedIds = new Set(initialPosts.map(postId).filter((value): value is number => value !== undefined));
  const missingIds = totalPostIds.filter((id) => !fetchedIds.has(id));
  const fetchedPosts: DiscoursePost[] = [];
  const stillMissing: number[] = [];
  for (const id of missingIds) {
    try {
      const post = await fetchDiscoursePost(discussionUrl, id, options);
      if (post) {
        fetchedPosts.push(post);
        fetchedIds.add(id);
      } else {
        stillMissing.push(id);
      }
    } catch {
      stillMissing.push(id);
    }
  }
  const allPosts = uniquePosts([...initialPosts, ...fetchedPosts]);
  return extractDiscourseActivityFromPosts(json, discussionUrl, now, {
    posts: allPosts,
    totalPostIds,
    fetchedPostIds: [...fetchedIds].sort((a, b) => a - b),
    missingPostIds: stillMissing,
  });
}

function extractDiscourseActivityFromPosts(
  json: unknown,
  discussionUrl: string,
  now = new Date(),
  override: { posts: DiscoursePost[]; totalPostIds: number[]; fetchedPostIds: number[]; missingPostIds: number[] } | undefined,
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
  const initialPosts = readPosts(topic.post_stream?.posts);
  const totalPostIds = override?.totalPostIds ?? readNumberArray(topic.post_stream?.stream);
  const posts = override?.posts ?? initialPosts;
  const fetchedPostIds = override?.fetchedPostIds ?? unique(posts.map(postId).filter((value): value is number => value !== undefined)).sort((a, b) => a - b);
  const missingPostIds = override?.missingPostIds ?? totalPostIds.filter((id) => !fetchedPostIds.includes(id));
  const hasPostArray = Array.isArray(topic.post_stream?.posts);
  const postSignals = extractPostSignals(posts, now, discussionUrl);
  const parsedTopic = Boolean(readNumber(topic.id) || readString(topic.title) || createdAt || lastActivityAt);
  const expectedCount = totalPostIds.length || readNumber(topic.posts_count) || posts.length;
  const paginationComplete = parsedTopic
    && postSignals.postTimestampTrace.length > 0
    && missingPostIds.length === 0
    && latestPostConsistent(postSignals.latestCollectedPostAt, lastActivityAt);
  const collectionStatus = parsedTopic && posts.length > 0
    ? paginationComplete ? "posts_fully_collected" : "posts_partially_collected"
    : hasPostArray ? "parse_failed" : "parse_failed";

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
    discussionCollectionStatus: collectionStatus,
    discussionFetchAttempted: true,
    postsCollectedCount: postSignals.postsCollectedCount,
    totalPostIds,
    fetchedPostIds,
    missingPostIds,
    postsExpectedCount: expectedCount,
    paginationComplete,
    latestCollectedPostAt: postSignals.latestCollectedPostAt,
    postTimestampTrace: postSignals.postTimestampTrace,
    postsInCurrent7d: postSignals.postsInCurrent7d,
    postsInPrevious7d: postSignals.postsInPrevious7d,
    participantCountCurrent7d: postSignals.participantCountCurrent7d,
    authorParticipatedCurrent7d: postSignals.authorParticipatedCurrent7d,
    latestPostAuthors: postSignals.latestPostAuthors,
    keyIssues: postSignals.keyIssues,
    objections: postSignals.objections,
    alternatives: postSignals.alternatives,
    unresolvedQuestions: postSignals.unresolvedQuestions,
    specChangeReferences: postSignals.specChangeReferences,
    discussionAnalysis: postSignals.discussionAnalysis,
    activityLevel: classifyDiscussionActivity(discussionActivityScore, parsedTopic),
    discussionSummaryFallback: collectionStatus === "posts_fully_collected"
      ? "Discussion post activity metadata collected from public topic."
      : collectionStatus === "posts_partially_collected"
        ? "Discussion topic metadata received, but only part of the post stream was collected."
        : "Discussion topic metadata received, but posts were not parsed.",
    whyItMatters: whyItMatters(freshnessDays, discussionActivityScore),
  };
}

function extractPostSignals(value: unknown, now: Date, discussionUrl = ""): {
  postsCollectedCount: number;
  postTimestampTrace: string[];
  latestCollectedPostAt?: string;
  postsInCurrent7d: number;
  postsInPrevious7d: number;
  participantCountCurrent7d: number;
  authorParticipatedCurrent7d: boolean;
  latestPostAuthors: string[];
  keyIssues: string[];
  objections: string[];
  alternatives: string[];
  unresolvedQuestions: string[];
  specChangeReferences: string[];
  discussionAnalysis: NonNullable<DiscussionHeatItem["discussionAnalysis"]>;
} {
  const posts = readPosts(value)
    .filter((post) => !readString(post.deleted_at))
    .sort((a, b) => (readNumber(a.post_number) ?? 0) - (readNumber(b.post_number) ?? 0) || timestamp(a.created_at) - timestamp(b.created_at));
  const timestampTrace = posts
    .map((post) => readString(post.created_at))
    .filter((value): value is string => Boolean(value));
  const latestCollectedPostAt = timestampTrace.length
    ? new Date(Math.max(...timestampTrace.map((value) => Date.parse(value)).filter(Number.isFinite))).toISOString()
    : undefined;
  const currentFrom = now.getTime() - 7 * DAY_MS;
  const previousFrom = now.getTime() - 14 * DAY_MS;
  const currentPosts = posts.filter((post) => inWindow(post.created_at, currentFrom, now.getTime()));
  const previousPosts = posts.filter((post) => inWindow(post.created_at, previousFrom, currentFrom));
  const currentAuthors = unique(currentPosts.map(postAuthor).filter(Boolean) as string[]);
  const latestPostAuthors = unique([...posts]
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))
    .map(postAuthor)
    .filter(Boolean) as string[])
    .slice(0, 5);
  const currentText = currentPosts.map(postText).join("\n");
  const analysis = buildDiscussionAnalysis(posts, discussionUrl);
  return {
    postsCollectedCount: posts.length,
    postTimestampTrace: timestampTrace,
    latestCollectedPostAt,
    postsInCurrent7d: currentPosts.length,
    postsInPrevious7d: previousPosts.length,
    participantCountCurrent7d: currentAuthors.length,
    authorParticipatedCurrent7d: currentPosts.some((post) => /\bauthor\b|eip[-_ ]?editor|erc[-_ ]?editor/i.test(postAuthor(post) ?? "")),
    latestPostAuthors,
    keyIssues: extractIssuePhrases(currentText, /\b(issue|concern|problem|question|risk|trade[- ]off)\b/i),
    objections: extractIssuePhrases(currentText, /\b(object|objection|concern|disagree|not agree|problematic)\b/i),
    alternatives: extractIssuePhrases(currentText, /\b(alternative|instead|option|proposal|approach)\b/i),
    unresolvedQuestions: extractIssuePhrases(currentText, /\?|unresolved|open question|not decided/i),
    specChangeReferences: extractIssuePhrases(currentText, /\b(spec|specification|eip|erc|change|update|edit|PR)\b/i),
    discussionAnalysis: analysis,
  };
}

async function fetchDiscoursePost(rawTopicUrl: string, postId: number, options: FetchDiscussionOptions): Promise<DiscoursePost | undefined> {
  const url = new URL(rawTopicUrl);
  url.pathname = `/posts/${postId}.json`;
  url.search = "";
  url.hash = "";
  const json = await fetchJson(url.toString(), options);
  if (!json || typeof json !== "object") return undefined;
  const record = json as { post?: unknown };
  const value = record.post && typeof record.post === "object" ? record.post : json;
  return value && typeof value === "object" ? value as DiscoursePost : undefined;
}

function readPosts(value: unknown): DiscoursePost[] {
  return Array.isArray(value) ? value.filter((item): item is DiscoursePost => Boolean(item) && typeof item === "object") : [];
}

function postId(post: DiscoursePost): number | undefined {
  return readNumber(post.id);
}

function uniquePosts(posts: DiscoursePost[]): DiscoursePost[] {
  const byId = new Map<number | string, DiscoursePost>();
  posts.forEach((post, index) => {
    const key = postId(post) ?? `${readString(post.created_at) ?? "unknown"}:${readString(post.username) ?? index}`;
    if (!byId.has(key)) byId.set(key, post);
  });
  return [...byId.values()];
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? unique(value.map((item) => typeof item === "number" ? item : Number(item)).filter((item) => Number.isInteger(item) && item > 0))
    : [];
}

function latestPostConsistent(latestCollectedPostAt: string | undefined, lastActivityAt: string | undefined): boolean {
  if (!lastActivityAt) return Boolean(latestCollectedPostAt);
  if (!latestCollectedPostAt) return false;
  const delta = Math.abs(Date.parse(latestCollectedPostAt) - Date.parse(lastActivityAt));
  return Number.isFinite(delta) && delta <= 2_000;
}

function buildDiscussionAnalysis(posts: DiscoursePost[], discussionUrl: string): NonNullable<DiscussionHeatItem["discussionAnalysis"]> {
  const analysisPosts = posts
    .filter((post) => !isSystemOrTinyPost(post))
    .slice(-80);
  const keyIssues = extractAnalysisItems(analysisPosts, /\b(issue|concern|problem|question|risk|trade[- ]off)\b/i, discussionUrl);
  const objections = extractAnalysisItems(analysisPosts, /\b(object|objection|concern|disagree|not agree|problematic)\b/i, discussionUrl);
  const alternatives = extractAnalysisItems(analysisPosts, /\b(alternative|instead|option|approach)\b/i, discussionUrl);
  const unresolvedQuestions = extractAnalysisItems(analysisPosts, /\?|unresolved|open question|not decided/i, discussionUrl);
  const specificationReferences = extractAnalysisItems(analysisPosts, /\b(spec|specification|eip|erc|change|update|edit|PR)\b/i, discussionUrl);
  const proposalAuthorResponses = extractAnalysisItems(analysisPosts, /\b(author|editor|champion)\b/i, discussionUrl);
  return {
    analysisAttempted: posts.length > 0,
    analysisCompleted: false,
    analyzedPostCount: analysisPosts.length,
    contentAvailable: analysisPosts.some((post) => postText(post).length > 0),
    keyIssues,
    objections,
    alternatives,
    unresolvedQuestions,
    proposalAuthorResponses,
    specificationReferences,
  };
}

function extractAnalysisItems(posts: DiscoursePost[], pattern: RegExp, discussionUrl: string): NonNullable<DiscussionHeatItem["discussionAnalysis"]>["keyIssues"] {
  const items = posts.flatMap((post) => {
    const text = postText(post);
    const sentence = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => item.trim())
      .find((item) => item.length >= 16 && pattern.test(item));
    if (!sentence) return [];
    const id = postId(post);
    const postNumber = readNumber(post.post_number);
    return [{
      text: sentence.slice(0, 180),
      sourcePostIds: id ? [id] : [],
      sourceUsernames: [postAuthor(post)].filter((value): value is string => Boolean(value)),
      sourceDates: [readString(post.created_at)].filter((value): value is string => Boolean(value)),
      evidenceUrl: postNumber ? `${discussionUrl.replace(/\/+$/, "")}/${postNumber}` : discussionUrl,
    }];
  });
  return uniqueByText(items).slice(0, 3);
}

function uniqueByText<T extends { text: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isSystemOrTinyPost(post: DiscoursePost): boolean {
  const author = postAuthor(post) ?? "";
  const text = postText(post).toLowerCase();
  return /system|discobot/i.test(author) || /^(thanks|thank you|\+1|bump|ok|agree)\.?$/i.test(text) || text.length < 12;
}

function inWindow(value: unknown, fromInclusive: number, toExclusive: number): boolean {
  const time = timestamp(value);
  return Number.isFinite(time) && time >= fromInclusive && time < toExclusive;
}

function timestamp(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

function postAuthor(post: DiscoursePost): string | undefined {
  return readString(post.username) ?? readString(post.name);
}

function postText(post: DiscoursePost): string {
  return stripHtml(readString(post.raw) ?? readString(post.cooked) ?? "");
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractIssuePhrases(text: string, pattern: RegExp): string[] {
  if (!text) return [];
  return unique(text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12 && pattern.test(item))
    .map((item) => item.slice(0, 180)))
    .slice(0, 3);
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
  if (!cached.activity.discussionCollectionStatus || cached.activity.discussionFetchAttempted !== true) return null;
  if (cached.activity.discussionCollectionStatus === "posts_partially_collected") return null;
  if (cached.activity.discussionCollectionStatus === "posts_fully_collected" && cached.activity.paginationComplete !== true) return null;
  if (cached.activity.discussionAnalysis?.analysisCompleted === true) return null;
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
    discussionCollectionStatus: item.discussionUrl ? "url_confirmed" : "not_searched",
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

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function boundedSubtract(value: number | undefined, amount: number): number | undefined {
  return value === undefined ? undefined : Math.max(0, value - amount);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
