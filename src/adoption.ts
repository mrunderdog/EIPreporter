import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  AdoptionEvidenceItem,
  AdoptionEvidenceLevel,
  AdoptionEvidenceSource,
  AdoptionLayer,
  EvidenceTaxonomySummary,
  EvidenceType,
  SourceCollectionDiagnostic,
  ThemeInsight,
  WatchlistItem,
  WeeklyRadarReport,
} from "./types.ts";

type AdoptionReportInput = {
  generatedAt: string;
  ethereumTechRadar: Omit<WeeklyRadarReport["ethereumTechRadar"], "adoptionLayer" | "narrativeLayer"> & {
    adoptionLayer?: WeeklyRadarReport["ethereumTechRadar"]["adoptionLayer"];
    narrativeLayer?: WeeklyRadarReport["ethereumTechRadar"]["narrativeLayer"];
  };
};

type GitHubSearchOptions = {
  token?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
  itemLimit?: number;
  cachePath?: string;
};

type GitHubSearchResponse = {
  total_count?: number;
  items?: GitHubSearchResult[];
};

type GitHubSearchResult = {
  html_url?: string;
  title?: string;
  body?: string;
  path?: string;
  name?: string;
  state?: string;
  updated_at?: string;
  repository?: {
    full_name?: string;
    html_url?: string;
  };
  pull_request?: {
    url?: string;
    html_url?: string;
    merged_at?: string | null;
  };
};

type GitHubPullFile = {
  filename?: string;
  status?: string;
};

type SearchKind = "issue" | "pr" | "code";

type GithubItemResult = {
  item: AdoptionEvidenceItem;
  hadEndpointSuccess: boolean;
  hadEndpointFailure: boolean;
  diagnostics: SourceCollectionDiagnostic[];
};

type DebugSummary = Record<SearchKind, {
  rawResultCount: number;
  acceptedCount: number;
  ignoredCanonicalCount: number;
  ignoredLowRelevanceCount: number;
  deduplicatedCount: number;
}>;

type CachedLayer = {
  cachedAt: string;
  status: "collected" | "skipped" | "failed" | "fallback";
  layer: AdoptionLayer;
};

const FALLBACK_SUMMARY = "No implementation or external reference evidence collected in this run.";
const FALLBACK_CAUTION = "Treat as discussion/momentum signal until implementation references or spec diffs appear.";
const NO_EXTERNAL_MESSAGE = "No external implementation evidence was collected for this run.";
const DISCUSSION_ONLY_MESSAGE = "This signal remains discussion/momentum-driven.";
const GITHUB_SKIPPED_MESSAGE = "GitHub evidence collection skipped because GITHUB_TOKEN is not configured.";
const GITHUB_FAILED_MESSAGE = "GitHub evidence collection could not be completed for this run.";
const DEFAULT_REPOS = [
  "ethereum/EIPs",
  "ethereum/execution-specs",
  "ethereum/pm",
  "ethereum/go-ethereum",
  "ethereum/consensus-specs",
];
const MAX_RELATED_PROPOSALS = 5;
const MAX_RAW_PR_RESULTS_PER_QUERY = 20;
const MAX_ACCEPTED_SOURCE_CANDIDATES_PER_ITEM = 25;
const MAX_RETAINED_SOURCES_PER_ITEM = 5;
const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SHORT_CACHE_TTL_MS = 60 * 60 * 1000;
const STALE_SUCCESS_FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function buildAdoptionLayer(report: AdoptionReportInput): AdoptionLayer {
  const items = topWatchlistItems(report, 1).map((item) => buildFallbackItem(report, item, "Unknown"));
  return {
    items,
    generatedBy: "fallback",
    collectionStatus: "fallback",
    sourceDiagnostics: [derivedDiagnostic("adoption_fallback", "empty", items.length)],
    evidenceSummary: evidenceSummaryForItems(items),
  };
}

export async function buildAdoptionLayerWithGithubSearch(
  report: AdoptionReportInput,
  options: GitHubSearchOptions = {},
): Promise<AdoptionLayer> {
  const token = options.token ?? process.env.GITHUB_TOKEN;
  const now = options.now ?? new Date(report.generatedAt);
  const cachePath = options.cachePath ?? defaultCachePath();
  const cacheKey = cacheKeyFor(report, token);

  if (process.env.EIPREPORTER_BYPASS_ADOPTION_CACHE !== "1") {
    const cached = readCachedLayer(cachePath, cacheKey, now);
    if (cached) return withCacheDiagnostic(cached, now);
  }

  if (!token) {
    const items = topWatchlistItems(report, 1).map((item) => buildFallbackItem(report, item, "Unknown"));
    const layer = {
      items,
      generatedBy: "fallback" as const,
      collectionStatus: "skipped" as const,
      note: GITHUB_SKIPPED_MESSAGE,
      sourceDiagnostics: [githubSkippedDiagnostic("GitHub adoption search", "GITHUB_TOKEN is not configured", items.length)],
      evidenceSummary: evidenceSummaryForItems(items),
    };
    writeCachedLayer(cachePath, cacheKey, layer, now);
    return layer;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const observedAt = now.toISOString();

  try {
    const itemResults: GithubItemResult[] = [];
    for (const watchlistItem of topWatchlistItems(report, options.itemLimit ?? 3)) {
      itemResults.push(await buildGithubItem(report, watchlistItem, token, fetchImpl, observedAt, options.timeoutMs ?? 7000));
    }
    if (itemResults.length > 0 && itemResults.every((result) => result.hadEndpointFailure && !result.hadEndpointSuccess)) {
      const items = topWatchlistItems(report, 1).map((item) => buildFallbackItem(report, item, "Unknown"));
      const layer = {
        items,
        generatedBy: "fallback" as const,
        collectionStatus: "failed" as const,
        note: GITHUB_FAILED_MESSAGE,
        sourceDiagnostics: itemResults.flatMap((result) => result.diagnostics),
        evidenceSummary: evidenceSummaryForItems(items),
      };
      writeCachedLayer(cachePath, cacheKey, layer, now);
      return layer;
    }
    const items = itemResults.map((result) => result.item);
    const diagnostics = itemResults.flatMap((result) => result.diagnostics);
    const layer = { items, generatedBy: "github_search" as const, collectionStatus: "collected" as const, sourceDiagnostics: diagnostics, evidenceSummary: evidenceSummaryForItems(items) };
    writeCachedLayer(cachePath, cacheKey, layer, now);
    return layer;
  } catch (error) {
    const items = topWatchlistItems(report, 1).map((item) => buildFallbackItem(report, item, "Unknown"));
    const layer = {
      items,
      generatedBy: "fallback" as const,
      collectionStatus: "failed" as const,
      note: GITHUB_FAILED_MESSAGE,
      sourceDiagnostics: [githubFailureDiagnostic("GitHub adoption search", error, items.length)],
      evidenceSummary: evidenceSummaryForItems(items),
    };
    writeCachedLayer(cachePath, cacheKey, layer, now);
    return layer;
  }
}

export function adoptionEvidenceForProposal(
  layer: AdoptionLayer | undefined,
  proposalIds: string[],
): AdoptionEvidenceItem | undefined {
  const ids = new Set(proposalIds);
  return layer?.items.find((item) => ids.has(item.proposalId));
}

export function adoptionStatusLabel(level: AdoptionEvidenceLevel | undefined): string {
  if (level === "Mention") return "Mention";
  if (level === "Reference") return "Reference";
  if (level === "Implementation") return "Implementation evidence";
  if (level === "Unknown") return "Unknown";
  return "None collected";
}

export function topWatchlistAdoptionLevel(report: AdoptionReportInput): AdoptionEvidenceLevel {
  const top = topWatchlistItems(report, 1)[0];
  if (!top) return "Unknown";
  const evidence = adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, top.relatedProposals);
  return evidence?.evidenceLevel ?? "Unknown";
}

export function topWatchlistAdoptionMissing(report: AdoptionReportInput): boolean {
  const level = topWatchlistAdoptionLevel(report);
  return level === "None" || level === "Unknown";
}

export function noExternalEvidenceMessage(): string {
  return `${NO_EXTERNAL_MESSAGE} ${DISCUSSION_ONLY_MESSAGE}`;
}

export function githubSkippedMessage(): string {
  return GITHUB_SKIPPED_MESSAGE;
}

export function adoptionSearchTerms(report: AdoptionReportInput, item: WatchlistItem): string[] {
  const proposalIds = item.relatedProposals.slice(0, MAX_RELATED_PROPOSALS);
  const primaryTitle = proposalIds
    .map((proposalId) => titleForProposal(report, proposalId))
    .find((title): title is string => Boolean(title));
  return [...new Set([item.relatedProposals[0], primaryTitle, ...proposalIds].filter((term): term is string => Boolean(term)))];
}

export function adoptionSearchRepos(envValue = process.env.EIPREPORTER_ADOPTION_REPOS): string[] {
  const configured = envValue?.split(",").map((repo) => repo.trim()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_REPOS;
}

export function buildGithubSearchQueries(report: AdoptionReportInput, item: WatchlistItem, envValue?: string): string[] {
  const repoScope = adoptionSearchRepos(envValue).map((repo) => `repo:${repo}`).join(" ");
  return adoptionSearchTerms(report, item).flatMap((term) => [
    githubQueryForKind(term, repoScope, "issue"),
    githubQueryForKind(term, repoScope, "pr"),
    githubQueryForKind(term, repoScope, "code"),
  ]);
}

function topWatchlistItems(report: AdoptionReportInput, limit: number): WatchlistItem[] {
  return (report.ethereumTechRadar.watchlistLayer?.items ?? []).slice(0, limit);
}

function buildFallbackItem(
  report: AdoptionReportInput,
  item: WatchlistItem,
  level: AdoptionEvidenceLevel,
): AdoptionEvidenceItem {
  const proposalId = item.relatedProposals[0] ?? "Unknown";
  return {
    proposalId,
    title: titleForProposal(report, proposalId) ?? item.title,
    theme: item.theme,
    evidenceLevel: level,
    evidenceScore: 0,
    sources: [],
    summary: FALLBACK_SUMMARY,
    caution: FALLBACK_CAUTION,
  };
}

async function buildGithubItem(
  report: AdoptionReportInput,
  item: WatchlistItem,
  token: string,
  fetchImpl: typeof fetch,
  observedAt: string,
  timeoutMs: number,
): Promise<GithubItemResult> {
  const proposalId = item.relatedProposals[0] ?? "Unknown";
  const proposalTitle = titleForProposal(report, proposalId);
  const repoScope = adoptionSearchRepos().map((repo) => `repo:${repo}`).join(" ");
  const sources: AdoptionEvidenceSource[] = [];
  const diagnostics: SourceCollectionDiagnostic[] = [];
  const debug = newDebugSummary();
  let hadEndpointSuccess = false;
  let hadEndpointFailure = false;

  for (const term of adoptionSearchTerms(report, item)) {
    for (const kind of ["issue", "pr", "code"] as const) {
      if (sources.length >= MAX_ACCEPTED_SOURCE_CANDIDATES_PER_ITEM) break;
      const query = githubQueryForKind(term, repoScope, kind);
      const endpointResult = await searchGithubEndpoint(query, kind, token, fetchImpl, timeoutMs);
      diagnostics.push(endpointResult.diagnostic);
      if (endpointResult.ok) {
        hadEndpointSuccess = true;
      } else {
        hadEndpointFailure = true;
        continue;
      }
      const rawItems = endpointResult.response.items ?? [];
      debug[kind].rawResultCount += endpointResult.response.total_count ?? rawItems.length;
      const limitedItems = kind === "pr" ? rawItems.slice(0, MAX_RAW_PR_RESULTS_PER_QUERY) : rawItems;
      for (const result of limitedItems) {
        const source = await acceptedSourceFromGithubResult(result, term, observedAt, kind, token, fetchImpl, timeoutMs, proposalId, proposalTitle);
        if (source.status === "accepted") {
          sources.push(source.source);
          debug[kind].acceptedCount += 1;
        } else if (source.reason === "canonical") {
          debug[kind].ignoredCanonicalCount += 1;
        } else {
          debug[kind].ignoredLowRelevanceCount += 1;
        }
        if (sources.length >= MAX_ACCEPTED_SOURCE_CANDIDATES_PER_ITEM) break;
      }
    }
    if (sources.length >= MAX_ACCEPTED_SOURCE_CANDIDATES_PER_ITEM) break;
  }

  const acceptedSources = dedupeSources(sources.map((source) => enrichEvidenceSource(source, proposalId)), Number.POSITIVE_INFINITY);
  const dedupedSources = acceptedSources.slice(0, MAX_RETAINED_SOURCES_PER_ITEM);
  for (const kind of Object.keys(debug) as SearchKind[]) {
    debug[kind].deduplicatedCount = debug[kind].acceptedCount - acceptedSources.filter((source) => searchKindForSource(source) === kind).length;
  }
  if (!dedupedSources.length) {
    const fallback = buildFallbackItem(report, item, "None");
    printDebugSummary(debug, fallback.evidenceLevel);
    return { item: fallback, hadEndpointSuccess, hadEndpointFailure, diagnostics };
  }

  const score = Math.min(100, Math.max(...dedupedSources.map(scoreSource)));
  const level = evidenceLevelForSources(score, dedupedSources);
  const evidenceItem = {
    proposalId,
    title: titleForProposal(report, proposalId) ?? item.title,
    theme: item.theme,
    evidenceLevel: level,
    evidenceScore: score,
    sources: dedupedSources,
    rawResultCount: totalRawResultCount(debug),
    acceptedSourceCount: acceptedSources.length,
    retainedSourceCount: dedupedSources.length,
    renderedSourceCount: Math.min(3, dedupedSources.length),
    directSourceCount: acceptedSources.filter((source) => source.relationship === "direct").length,
    clusterSourceCount: acceptedSources.filter((source) => source.relationship === "cluster_related").length,
    summary: summaryForEvidence(level, dedupedSources.length, dedupedSources),
    caution: cautionForEvidence(level),
  };
  printDebugSummary(debug, level);
  return { item: evidenceItem, hadEndpointSuccess, hadEndpointFailure, diagnostics };
}

function githubQueryForKind(term: string, repoScope: string, kind: SearchKind): string {
  const base = `${JSON.stringify(term)} ${repoScope}`;
  if (kind === "issue") return `${base} is:issue`;
  if (kind === "pr") return `${base} is:pull-request`;
  return base;
}

async function searchGithubEndpoint(
  query: string,
  kind: SearchKind,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: true; response: GitHubSearchResponse; diagnostic: SourceCollectionDiagnostic } | { ok: false; error: unknown; diagnostic: SourceCollectionDiagnostic }> {
  if ((kind === "issue" || kind === "pr") && !/\bis:(issue|pull-request)\b/.test(query)) {
    const error = new Error("Refusing to call /search/issues without an issue or pull-request qualifier");
    return { ok: false, error, diagnostic: githubEndpointDiagnostic(query, kind, "failure", 0, error.message) };
  }
  const endpoint = kind === "code" ? "code" : "issues";
  const perPage = kind === "pr" ? MAX_RAW_PR_RESULTS_PER_QUERY : 5;
  const url = `https://api.github.com/search/${endpoint}?q=${encodeURIComponent(query)}&per_page=${perPage}`;
  try {
    const result = await githubSearch(url, token, fetchImpl, timeoutMs);
    const count = result.response.items?.length ?? 0;
    return { ok: true, response: result.response, diagnostic: githubEndpointDiagnostic(query, kind, count > 0 ? "success" : "empty", count, undefined, url, result.status, result.retryCount) };
  } catch (error) {
    return { ok: false, error, diagnostic: githubEndpointDiagnostic(query, kind, "failure", 0, errorMessage(error), url, statusFromError(error), retryCountFromError(error)) };
  }
}

async function githubSearch(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ response: GitHubSearchResponse; status: number; retryCount: number }> {
  const result = await githubSearchAttempt(url, token, fetchImpl, timeoutMs, true);
  return { ...result, response: result.response as GitHubSearchResponse };
}

async function githubSearchAttempt(
  url: string,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  canRetry: boolean,
): Promise<{ response: unknown; status: number; retryCount: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "EIPreporter",
      },
      signal: controller.signal,
    });
    if (response.ok) return { response: await response.json() as GitHubSearchResponse, status: response.status, retryCount: canRetry ? 0 : 1 };
    const retryable = [502, 503, 504].includes(response.status);
    const rateLimited = response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
    if (canRetry && retryable) return githubSearchAttempt(url, token, fetchImpl, timeoutMs, false);
    throw githubHttpError(rateLimited ? "GitHub adoption search rate limited" : `GitHub adoption search failed: ${response.status}`, response.status, canRetry ? 0 : 1);
  } finally {
    clearTimeout(timeout);
  }
}

function githubHttpError(message: string, status: number, retryCount: number): Error {
  const error = new Error(message) as Error & { status?: number; retryCount?: number };
  error.status = status;
  error.retryCount = retryCount;
  return error;
}

function statusFromError(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : undefined;
}

function retryCountFromError(error: unknown): number {
  return typeof error === "object" && error !== null && "retryCount" in error && typeof (error as { retryCount?: unknown }).retryCount === "number"
    ? (error as { retryCount: number }).retryCount
    : 0;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = "cause" in error ? error.cause as { code?: unknown; errno?: unknown; syscall?: unknown; hostname?: unknown; message?: unknown } | undefined : undefined;
  const details = cause
    ? [cause.message, cause.code ? `code=${String(cause.code)}` : "", cause.errno ? `errno=${String(cause.errno)}` : "", cause.syscall ? `syscall=${String(cause.syscall)}` : "", cause.hostname ? `hostname=${String(cause.hostname)}` : ""].filter(Boolean).join(" ")
    : "";
  return details ? `${error.message}: ${details}` : error.message;
}

function githubEndpointDiagnostic(
  query: string,
  kind: SearchKind,
  result: SourceCollectionDiagnostic["result"],
  recordCountCollected: number,
  failureReason?: string,
  requestUrl?: string,
  httpStatus?: number,
  retryCount = 0,
): SourceCollectionDiagnostic {
  return {
    sourceName: `GitHub ${kind} search`,
    sourceType: "github_search",
    requestAttempted: true,
    requestUrl,
    requestQuery: query,
    result,
    httpStatus,
    failureReason,
    retryCount,
    cachedDataAvailable: false,
    recordCountCollected,
  };
}

function githubSkippedDiagnostic(sourceName: string, reason: string, recordCountCollected: number): SourceCollectionDiagnostic {
  return {
    sourceName,
    sourceType: "github_search",
    requestAttempted: false,
    result: "skipped",
    failureReason: reason,
    retryCount: 0,
    cachedDataAvailable: false,
    recordCountCollected,
  };
}

function githubFailureDiagnostic(sourceName: string, error: unknown, recordCountCollected: number): SourceCollectionDiagnostic {
  return {
    sourceName,
    sourceType: "github_search",
    requestAttempted: true,
    result: "failure",
    httpStatus: statusFromError(error),
    failureReason: errorMessage(error),
    retryCount: retryCountFromError(error),
    cachedDataAvailable: false,
    recordCountCollected,
  };
}

function derivedDiagnostic(sourceName: string, result: SourceCollectionDiagnostic["result"], recordCountCollected: number): SourceCollectionDiagnostic {
  return {
    sourceName,
    sourceType: "derived",
    requestAttempted: false,
    result,
    retryCount: 0,
    cachedDataAvailable: false,
    recordCountCollected,
  };
}

function titleForProposal(report: AdoptionReportInput, proposalId: string): string | undefined {
  for (const theme of report.ethereumTechRadar.themeInsights) {
    const proposal = theme.representativeProposals.find((item) => item.id === proposalId);
    if (proposal?.title) return proposal.title;
  }
  const discussion = report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === proposalId);
  return discussion?.title ?? undefined;
}

async function acceptedSourceFromGithubResult(
  result: GitHubSearchResult,
  matchedTerm: string,
  observedAt: string,
  searchKind: SearchKind,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  proposalId: string,
  proposalTitle: string | undefined,
): Promise<
  | { status: "accepted"; source: AdoptionEvidenceSource }
  | { status: "ignored"; reason: "canonical" | "low_relevance" }
> {
  if (searchKind === "code") {
    if (isCanonicalEipCodeResult(result, proposalId)) return { status: "ignored", reason: "canonical" };
    if (isGeneratedCanonicalReference(result)) return { status: "ignored", reason: "low_relevance" };
    if (isLowRelevanceCodePath(result.path)) return { status: "ignored", reason: "low_relevance" };
    const sourceType = sourceTypeForCodePath(result.path);
    const repo = githubRepoForResult(result);
    const sourceText = `${result.name ?? ""}\n${result.path ?? ""}`;
    if (repo === "ethereum/EIPs" && isCanonicalProposalPath(result.path)) return { status: "ignored", reason: "low_relevance" };
    const direct = sourceTextMatchesDirect(sourceText, proposalId, proposalTitle);
    if (!isImplementationPath(result.path) && !sourceTextMatchesTarget(sourceText, proposalId, proposalTitle)) return { status: "ignored", reason: "low_relevance" };
    const implementation = isClientImplementationRepo(repo) && isImplementationPath(result.path) && direct;
    const releaseImplementation = sourceType === "release_note" && hasImplementationSemantics(sourceText);
    const relationship = direct ? "direct" as const : "cluster_related" as const;
    const semanticType = implementation
      ? "client_code_reference" as const
      : releaseImplementation
        ? "client_implementation_pr" as const
        : relationship === "cluster_related"
          ? "cluster_reference" as const
          : sourceType === "documentation"
          ? "protocol_spec_reference" as const
          : "incidental_mention" as const;
    return { status: "accepted", source: {
      sourceType,
      semanticType,
      relationship,
      repo,
      title: result.name ?? result.path ?? "GitHub code result",
      url: result.html_url,
      matchedTerm,
      observedAt,
      updatedAt: result.updated_at,
      path: result.path,
      state: "unknown",
      evidenceKind: implementation || releaseImplementation ? "implementation" : "reference",
      confidence: implementation || releaseImplementation ? "Medium" : "Low",
    } };
  }

  const title = result.title ?? "GitHub search result";
  const isPullRequest = searchKind === "pr" || Boolean(result.pull_request);
  const merged = Boolean(result.pull_request?.merged_at);
  if (sourceMentionsDifferentProposalInTitle(title, proposalId)) return { status: "ignored", reason: "low_relevance" };
  if (searchKind === "pr") {
    const relevance = await classifyPullRequestRelevance(result, proposalId, proposalTitle, token, fetchImpl, timeoutMs);
    if (relevance === "ignored_canonical") return { status: "ignored", reason: "canonical" };
    if (relevance === "ignored_low") return { status: "ignored", reason: "low_relevance" };
    const source = {
      sourceType: "github_pr" as const,
      semanticType: semanticTypeForPullRequestRelevance(relevance),
      relationship: sourceTextMatchesDirect(title, proposalId, proposalTitle) || relevance === "implementation" ? "direct" as const : "cluster_related" as const,
      repo: githubRepoForResult(result),
      title,
      url: result.pull_request?.html_url ?? result.html_url,
      matchedTerm,
      observedAt,
      updatedAt: result.updated_at,
      state: normalizedGithubState(result, merged),
      evidenceKind: relevance === "implementation" ? "implementation" as const : "reference" as const,
      confidence: relevance === "implementation" && merged ? "High" as const : relevance === "implementation" ? "Medium" as const : "Medium" as const,
    };
    return { status: "accepted", source };
  }
  const titleBody = `${title}\n${result.body ?? ""}`;
  if (!sourceTextMatchesTarget(titleBody, proposalId, proposalTitle)) return { status: "ignored", reason: "low_relevance" };
  const reference = /spec|planning|reference|document|eip|erc|discussion/i.test(titleBody);
  if (!reference && result.state === "closed") return { status: "ignored", reason: "low_relevance" };
  const semanticType = semanticTypeForIssue(result, proposalId);
  const relationship = sourceTextMatchesDirect(title, proposalId, proposalTitle) ? "direct" as const : "incidental" as const;
  if (relationship === "incidental") return { status: "ignored", reason: "low_relevance" };
  return { status: "accepted", source: {
    sourceType: isPullRequest ? "github_pr" : "github_issue",
    semanticType,
    relationship,
    repo: result.repository?.full_name,
    title,
    url: result.pull_request?.html_url ?? result.html_url,
    matchedTerm,
    observedAt,
    updatedAt: result.updated_at,
    state: normalizedGithubState(result, merged),
    evidenceKind: reference ? "reference" : "mention",
    confidence: reference ? "Medium" : "Low",
  } };
}

function githubRepoForResult(result: GitHubSearchResult): string | undefined {
  const explicit = result.repository?.full_name;
  if (explicit) return explicit;
  const url = result.pull_request?.html_url ?? result.html_url;
  const match = url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)/i);
  return match?.[1];
}

function normalizedGithubState(result: GitHubSearchResult, merged: boolean): AdoptionEvidenceSource["state"] {
  if (merged) return "merged";
  if (result.state === "open" || result.state === "closed") return result.state;
  return "unknown";
}

async function classifyPullRequestRelevance(
  result: GitHubSearchResult,
  proposalId: string,
  proposalTitle: string | undefined,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<"ignored_canonical" | "ignored_low" | "substantive_canonical" | "canonical_status_change" | "coordination" | "implementation"> {
  const repo = githubRepoForResult(result);
  const titleBody = `${result.title ?? ""}\n${result.body ?? ""}`;
  if (sourceMentionsDifferentProposalInTitle(result.title ?? "", proposalId)) return "ignored_low";
  const files = await pullRequestFiles(result, token, fetchImpl, timeoutMs);
  const onlyCanonicalFile = repo === "ethereum/EIPs" && files.length > 0 && files.every((file) => isCanonicalEipPath(file.filename, proposalId));
  const targetFileMatch = files.some((file) => isCanonicalEipPath(file.filename, proposalId));
  const executableFileMatch = files.some((file) => isImplementationPath(file.filename));
  const lowRelevance = /typo|format|formatting|cleanup|link only|link-only|metadata|automated|auto-update|spelling|grammar|generated/i.test(titleBody);
  const proposalCreation = /add\s+eip|create\s+eip|new\s+eip|proposal/i.test(titleBody) && onlyCanonicalFile;

  if (!sourceTextMatchesTarget(titleBody, proposalId, proposalTitle) && !targetFileMatch) return "ignored_low";
  if (repo === "ethereum/EIPs" && onlyCanonicalFile && proposalCreation) return "ignored_canonical";
  if (repo === "ethereum/EIPs" && onlyCanonicalFile && lowRelevance) return "ignored_low";
  if (repo === "ethereum/EIPs" && onlyCanonicalFile && /status|move to|last call|review|final|withdraw/i.test(titleBody)) return "canonical_status_change";
  if (repo === "ethereum/EIPs" && onlyCanonicalFile) return "substantive_canonical";
  if (repo === "ethereum/EIPs") return /status|process|discussion|agenda|reference|meta|review/i.test(titleBody) ? "coordination" : "ignored_low";
  if (result.state === "closed" && !result.pull_request?.merged_at && !/implement|support|spec|reference|coordinate/i.test(titleBody)) return "ignored_low";
  if (lowRelevance) return "ignored_low";
  if (hasImplementationSemantics(titleBody) && executableFileMatch && isClientImplementationRepo(repo)) return "implementation";
  if (/spec|planning|reference|document|eip|erc|discussion|coordinate/i.test(titleBody)) return "coordination";
  return "ignored_low";
}

async function pullRequestFiles(
  result: GitHubSearchResult,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<GitHubPullFile[]> {
  const repo = githubRepoForResult(result);
  const number = pullRequestNumber(result);
  if (!repo || !number) return [];
  try {
    const response = await githubSearchAttempt(
      `https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=20`,
      token,
      fetchImpl,
      timeoutMs,
      true,
    );
    return Array.isArray(response.response) ? response.response as GitHubPullFile[] : [];
  } catch {
    return [];
  }
}

function sourceTypeForCodePath(path: string | undefined): AdoptionEvidenceSource["sourceType"] {
  if (!path) return "code_reference";
  if (/release|changelog/i.test(path)) return "release_note";
  if (/\.md$|docs?\//i.test(path)) return "documentation";
  return "code_reference";
}

function isImplementationPath(path: string | undefined): boolean {
  if (!path) return false;
  if (/\.md$|docs?\//i.test(path)) return false;
  return /\.(ts|js|go|rs|py|java|cpp|c|h|hpp|sol|yaml|yml|json)$/i.test(path);
}

function isClientImplementationRepo(repo: string | undefined): boolean {
  return Boolean(repo && /^(ethereum\/go-ethereum)$/i.test(repo));
}

function isLowRelevanceCodePath(path: string | undefined): boolean {
  if (!path) return false;
  return /(^|\/)(test|tests|fixtures?|mocks?|snapshots?|generated|vendor|third_party|node_modules|scripts?)(\/|$)/i.test(path)
    || /(^|\/)\.github\/ACDbot\/artifacts\//i.test(path)
    || /(^|\/)(tldr|summary|index)\.json$/i.test(path)
    || /\.lock$/i.test(path)
    || /(^|\/)(README|SECURITY|CONTRIBUTING|CODEOWNERS)(\.md)?$/i.test(path);
}

function dedupeSources(sources: AdoptionEvidenceSource[], limit = MAX_RETAINED_SOURCES_PER_ITEM): AdoptionEvidenceSource[] {
  const byKey = new Map<string, AdoptionEvidenceSource>();
  for (const source of sources) {
    const key = dedupeKey(source);
    const existing = byKey.get(key);
    if (!existing || shouldReplaceDuplicateSource(existing, source)) byKey.set(key, source);
  }
  return [...byKey.values()].slice(0, limit);
}

function shouldReplaceDuplicateSource(existing: AdoptionEvidenceSource, candidate: AdoptionEvidenceSource): boolean {
  if (sourceStateRank(candidate) !== sourceStateRank(existing)) return sourceStateRank(candidate) > sourceStateRank(existing);
  return Date.parse(candidate.updatedAt ?? "") > Date.parse(existing.updatedAt ?? "");
}

function sourceStateRank(source: AdoptionEvidenceSource): number {
  if (source.state === "open") return 3;
  if (source.state === "merged") return 2;
  if (source.state === "closed") return 1;
  return 0;
}

function scoreSource(source: AdoptionEvidenceSource): number {
  if (source.relationship === "incidental") return 0;
  if (source.relationship === "cluster_related") return source.semanticType === "cluster_reference" ? 20 : 15;
  if (source.semanticType === "implementation_tracker") return 35;
  if (source.semanticType === "core_developer_coordination") return 25;
  if (source.semanticType === "canonical_status_change") return 20;
  if (source.semanticType === "canonical_document_change") return 10;
  if (source.semanticType === "client_implementation_pr") return source.state === "merged" ? 70 : 55;
  if (source.semanticType === "client_code_reference") return 50;
  if (sourceRepo(source) === "ethereum/EIPs" && source.path && isCanonicalEipPath(source.path, source.matchedTerm)) return 0;
  if (sourceRepo(source) === "ethereum/EIPs" && source.sourceType === "github_pr") return source.evidenceKind === "reference" ? 25 : 10;
  if (sourceRepo(source) === "ethereum/EIPs" && source.sourceType === "code_reference") return 0;
  if (source.sourceType === "release_note") return source.evidenceKind === "implementation" ? 70 : 35;
  if (source.state === "merged" && source.evidenceKind === "implementation") return 70;
  if (source.sourceType === "code_reference") return source.evidenceKind === "implementation" ? 50 : 30;
  if (source.sourceType === "documentation") return 30;
  if (source.sourceType === "github_pr") return source.evidenceKind === "implementation" ? 50 : 35;
  if (source.sourceType === "github_issue") return source.evidenceKind === "reference" ? 20 : 10;
  if (source.sourceType === "github_repo") return 10;
  return 10;
}

function hasImplementationSemantics(text: string): boolean {
  return /\b(implement(?:s|ed|ing|ation)?|prototype|add(?:ed|s)? support|support(?:s|ed|ing)?|client|execution|code|handler|validator|parser|serializer|transaction type)\b/i.test(text);
}

function semanticTypeForPullRequestRelevance(
  relevance: "substantive_canonical" | "canonical_status_change" | "coordination" | "implementation",
): AdoptionEvidenceSource["semanticType"] {
  if (relevance === "implementation") return "client_implementation_pr";
  if (relevance === "canonical_status_change") return "canonical_status_change";
  if (relevance === "substantive_canonical") return "canonical_document_change";
  return "core_developer_coordination";
}

function semanticTypeForIssue(result: GitHubSearchResult, proposalId: string): AdoptionEvidenceSource["semanticType"] {
  const repo = githubRepoForResult(result);
  const titleBody = `${result.title ?? ""}\n${result.body ?? ""}`;
  if (repo === "ethereum/execution-specs" && /\bimplementation tracker\b/i.test(titleBody)) return "implementation_tracker";
  if (repo === "ethereum/pm" || /all core devs|acde|acdc|agenda|call/i.test(titleBody)) return "core_developer_coordination";
  if (sourceMentionsDifferentProposalInTitle(result.title ?? "", proposalId)) return "cluster_reference";
  if (/spec|reference|document/i.test(titleBody)) return "protocol_spec_reference";
  return "incidental_mention";
}

function sourceTextMatchesTarget(text: string, proposalId: string, proposalTitle: string | undefined): boolean {
  if (new RegExp(`\\b${escapeRegExp(proposalId)}\\b`, "i").test(text)) return true;
  const normalizedTitle = proposalTitle?.replace(/[`"']/g, "").trim();
  return Boolean(normalizedTitle && normalizedTitle.length >= 8 && new RegExp(`\\b${escapeRegExp(normalizedTitle)}\\b`, "i").test(text.replace(/[`"']/g, "")));
}

function sourceTextMatchesDirect(text: string, proposalId: string, proposalTitle: string | undefined): boolean {
  if (sourceMentionsDifferentProposalInTitle(text.split(/\r?\n/)[0] ?? text, proposalId)) return false;
  return sourceTextMatchesTarget(text, proposalId, proposalTitle);
}

function sourceMentionsDifferentProposalInTitle(title: string, proposalId: string): boolean {
  const targetNumber = proposalId.match(/\d+/)?.[0];
  if (!targetNumber) return false;
  const mentioned = [...title.matchAll(/\b(?:EIP|ERC)-(\d+)\b/gi)].map((match) => match[1]);
  return mentioned.length > 0 && !mentioned.includes(targetNumber);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCanonicalEipCodeResult(result: GitHubSearchResult, proposalId: string): boolean {
  return githubRepoForResult(result) === "ethereum/EIPs" && isCanonicalEipPath(result.path, proposalId);
}

function isGeneratedCanonicalReference(result: GitHubSearchResult): boolean {
  return githubRepoForResult(result) === "ethereum/EIPs" && /^(EIPS\/README\.md|README\.md|_data\/|assets\/|scripts\/|tests\/)/i.test(result.path ?? "");
}

function isCanonicalEipPath(path: string | undefined, proposalId: string | undefined): boolean {
  const number = proposalId?.match(/\d+/)?.[0];
  return Boolean(number && path && new RegExp(`^EIPS/eip-${number}\\.md$`, "i").test(path));
}

function isCanonicalProposalPath(path: string | undefined): boolean {
  return Boolean(path && /^EIPS\/eip-\d+\.md$/i.test(path));
}

function pullRequestNumber(result: GitHubSearchResult | AdoptionEvidenceSource): string | undefined {
  const searchResult = result as GitHubSearchResult;
  const source = result as AdoptionEvidenceSource;
  const url = searchResult.pull_request?.html_url ?? searchResult.html_url ?? source.url;
  return url?.match(/\/pull\/(\d+)/)?.[1];
}

function dedupeKey(source: AdoptionEvidenceSource): string {
  const prNumber = pullRequestNumber(source);
  const repo = sourceRepo(source);
  if (repo && prNumber) return `pr:${repo}#${prNumber}`;
  if (repo && source.sourceType === "github_issue" && source.title) return `issue-title:${repo}:${normalizedSourceTitle(source.title)}`;
  if (source.url) return `url:${source.url}`;
  if (repo && source.path) return `path:${repo}:${source.path}`;
  if (repo && source.title) return `title:${repo}:${normalizedSourceTitle(source.title)}`;
  return `source:${source.sourceType}:${source.title ?? source.path ?? source.matchedTerm ?? "unknown"}`;
}

function normalizedSourceTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function sourceRepo(source: AdoptionEvidenceSource): string | undefined {
  if (source.repo) return source.repo;
  const match = source.url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)/i);
  return match?.[1];
}

function searchKindForSource(source: AdoptionEvidenceSource): SearchKind {
  if (source.sourceType === "github_issue") return "issue";
  if (source.sourceType === "github_pr") return "pr";
  return "code";
}

function newDebugSummary(): DebugSummary {
  return {
    issue: { rawResultCount: 0, acceptedCount: 0, ignoredCanonicalCount: 0, ignoredLowRelevanceCount: 0, deduplicatedCount: 0 },
    pr: { rawResultCount: 0, acceptedCount: 0, ignoredCanonicalCount: 0, ignoredLowRelevanceCount: 0, deduplicatedCount: 0 },
    code: { rawResultCount: 0, acceptedCount: 0, ignoredCanonicalCount: 0, ignoredLowRelevanceCount: 0, deduplicatedCount: 0 },
  };
}

function totalRawResultCount(debug: DebugSummary): number {
  return Object.values(debug).reduce((total, item) => total + item.rawResultCount, 0);
}

function printDebugSummary(debug: DebugSummary, finalEvidenceLevel: AdoptionEvidenceLevel): void {
  if (process.env.EIPREPORTER_DEBUG_ADOPTION !== "1") return;
  for (const kind of ["issue", "pr", "code"] as const) {
    const item = debug[kind];
    console.error([
      `adoption_debug query_type=${kind}`,
      `raw_result_count=${item.rawResultCount}`,
      `accepted_count=${item.acceptedCount}`,
      `ignored_canonical_count=${item.ignoredCanonicalCount}`,
      `ignored_low_relevance_count=${item.ignoredLowRelevanceCount}`,
      `deduplicated_count=${Math.max(0, item.deduplicatedCount)}`,
      `final_evidence_level=${finalEvidenceLevel}`,
    ].join(" "));
  }
}

function evidenceLevelForScore(score: number): AdoptionEvidenceLevel {
  if (score <= 0) return "None";
  if (score <= 20) return "Mention";
  if (score <= 40) return "Reference";
  return "Implementation";
}

function evidenceLevelForSources(score: number, sources: AdoptionEvidenceSource[]): AdoptionEvidenceLevel {
  const scoredLevel = evidenceLevelForScore(score);
  if (scoredLevel === "None") return scoredLevel;
  if (sources.some(isVerifiedImplementationSource)) return "Implementation";
  if (sources.some((source) => source.evidenceKind === "reference")) return "Reference";
  return scoredLevel;
}

function isVerifiedImplementationSource(source: AdoptionEvidenceSource): boolean {
  return source.relationship === "direct"
    && (source.semanticType === "client_implementation_pr" || source.semanticType === "client_code_reference")
    && source.evidenceKind === "implementation";
}

function evidenceTypeForSource(source: AdoptionEvidenceSource): EvidenceType {
  if (source.sourceType === "release_note") return "release";
  if (source.semanticType === "canonical_status_change" || source.semanticType === "canonical_document_change") return "change";
  if (source.semanticType === "client_implementation_pr" || source.semanticType === "client_code_reference") return "implementation";
  if (source.semanticType === "protocol_spec_reference") return "specification";
  if (source.semanticType === "core_developer_coordination" || source.sourceType === "github_issue") return "discussion";
  return "derived";
}

function sourceAuthorityForType(type: EvidenceType): AdoptionEvidenceSource["sourceAuthority"] {
  if (type === "specification" || type === "change") return "canonical";
  if (type === "implementation") return "client";
  if (type === "discussion") return "discussion";
  if (type === "release") return "release";
  if (type === "business") return "business";
  return "derived";
}

function enrichEvidenceSource(source: AdoptionEvidenceSource, proposalId: string): AdoptionEvidenceSource {
  const evidenceType = evidenceTypeForSource(source);
  return {
    ...source,
    evidenceType,
    sourceAuthority: sourceAuthorityForType(evidenceType),
    directlySupportedClaim: directlySupportedClaim(source, proposalId, evidenceType),
    confidenceContribution: scoreSource(source),
  };
}

function directlySupportedClaim(source: AdoptionEvidenceSource, proposalId: string, type: EvidenceType): string {
  if (type === "implementation") return `${proposalId} has client implementation tracking evidence from ${source.repo ?? source.sourceType}.`;
  if (type === "release") return `${proposalId} appears in release-oriented evidence from ${source.repo ?? source.sourceType}.`;
  if (type === "change") return `${proposalId} has canonical specification or status change evidence.`;
  if (type === "specification") return `${proposalId} is referenced by specification evidence.`;
  if (type === "discussion") return `${proposalId} has public discussion or coordination evidence.`;
  return `${proposalId} has derived or weak supporting evidence.`;
}

function evidenceSummaryForItems(items: AdoptionEvidenceItem[]): EvidenceTaxonomySummary {
  const summary: EvidenceTaxonomySummary = {
    specification: 0,
    change: 0,
    discussion: 0,
    implementation: 0,
    release: 0,
    activation: 0,
    adoption: 0,
    business: 0,
    derived: 0,
  };
  for (const source of items.flatMap((item) => item.sources)) {
    summary[source.evidenceType ?? evidenceTypeForSource(source)] += 1;
  }
  return summary;
}

function summaryForEvidence(level: AdoptionEvidenceLevel, sourceCount: number, sources: AdoptionEvidenceSource[] = []): string {
  if (sources.some((source) => source.semanticType === "implementation_tracker")) {
    return "Implementation tracking references were found, but no verified client implementation or production support was identified.";
  }
  if (level === "Mention") return `External mentions were found, but no implementation evidence was identified. Retained source count: ${sourceCount}.`;
  if (level === "Reference") return `${sourceCount} retained reference source(s) were collected. This is not client support or production adoption evidence.`;
  if (level === "Implementation") return `${sourceCount} retained source(s) indicate implementation evidence. This does not imply adoption or client support.`;
  return FALLBACK_SUMMARY;
}

function cautionForEvidence(level: AdoptionEvidenceLevel): string {
  if (level === "Mention") return "A mention is not implementation evidence; keep this as discussion/reference signal.";
  if (level === "Reference") return "Reference evidence should be reviewed manually before upgrading the signal.";
  if (level === "Implementation") return "구현 근거만으로 릴리스, 운영 채택, 실제 사용을 판단할 수 없습니다.";
  return FALLBACK_CAUTION;
}

function defaultCachePath(): string {
  return resolve("data", "adoption-evidence-cache.json");
}

function cacheKeyFor(report: AdoptionReportInput, token: string | undefined): string {
  const watchlist = topWatchlistItems(report, token ? 3 : 1)
    .map((item) => item.relatedProposals.slice(0, MAX_RELATED_PROPOSALS).join(","))
    .join("|");
  return JSON.stringify({
    date: report.generatedAt.slice(0, 10),
    token: Boolean(token),
    repos: adoptionSearchRepos().join(","),
    watchlist,
  });
}

function readCachedLayer(path: string, key: string, now: Date): AdoptionLayer | null {
  if (!existsSync(path)) return null;
  try {
    const cache = JSON.parse(readFileSync(path, "utf8")) as Record<string, CachedLayer>;
    const entry = cache[key];
    if (!entry) return readFreshCollectedLayer(cache, key, now, SUCCESS_CACHE_TTL_MS);
    if (entry.status !== "collected") {
      const collected = readFreshCollectedLayer(cache, key, now, STALE_SUCCESS_FALLBACK_TTL_MS);
      if (collected) return collected;
    }
    const age = now.getTime() - Date.parse(entry.cachedAt);
    const ttl = entry.status === "collected" ? SUCCESS_CACHE_TTL_MS : SHORT_CACHE_TTL_MS;
    return age >= 0 && age < ttl ? entry.layer : null;
  } catch {
    return null;
  }
}

function withCacheDiagnostic(layer: AdoptionLayer, now: Date): AdoptionLayer {
  const latest = latestSourceTime(layer);
  return {
    ...layer,
    sourceDiagnostics: [
      {
        sourceName: "Adoption evidence cache",
        sourceType: "cache",
        requestAttempted: false,
        result: latest ? "cache_hit" : "stale_cache",
        retryCount: 0,
        cachedDataAvailable: true,
        lastSuccessfulCollectionAt: latest,
        recordCountCollected: layer.items.reduce((sum, item) => sum + item.sources.length, 0),
        freshness: {
          collectedAt: now.toISOString(),
          sourceUpdatedAt: latest,
          ageDays: latest ? Math.max(0, Math.floor((now.getTime() - Date.parse(latest)) / (24 * 60 * 60 * 1000))) : undefined,
          stale: latest ? now.getTime() - Date.parse(latest) > STALE_SUCCESS_FALLBACK_TTL_MS : true,
        },
      },
      ...(layer.sourceDiagnostics ?? []),
    ],
    evidenceSummary: layer.evidenceSummary ?? evidenceSummaryForItems(layer.items),
  };
}

function latestSourceTime(layer: AdoptionLayer): string | undefined {
  return layer.items
    .flatMap((item) => item.sources.flatMap((source) => [source.updatedAt, source.observedAt]))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function readFreshCollectedLayer(cache: Record<string, CachedLayer>, key: string, now: Date, ttlMs: number): AdoptionLayer | null {
  const target = parseCacheKey(key);
  if (!target) return null;
  let latest: CachedLayer | null = null;
  for (const [candidateKey, candidate] of Object.entries(cache)) {
    if (candidate.status !== "collected") continue;
    const parsed = parseCacheKey(candidateKey);
    if (!parsed || !sameCacheScope(target, parsed)) continue;
    const age = now.getTime() - Date.parse(candidate.cachedAt);
    if (age < 0 || age >= ttlMs) continue;
    if (!latest || Date.parse(candidate.cachedAt) > Date.parse(latest.cachedAt)) latest = candidate;
  }
  return latest?.layer ?? null;
}

function parseCacheKey(key: string): { token: boolean; repos: string; watchlist: string } | null {
  try {
    const parsed = JSON.parse(key) as { token?: unknown; repos?: unknown; watchlist?: unknown };
    if (typeof parsed.token !== "boolean" || typeof parsed.repos !== "string" || typeof parsed.watchlist !== "string") return null;
    return { token: parsed.token, repos: parsed.repos, watchlist: parsed.watchlist };
  } catch {
    return null;
  }
}

function sameCacheScope(
  left: { token: boolean; repos: string; watchlist: string },
  right: { token: boolean; repos: string; watchlist: string },
): boolean {
  return left.token === right.token
    && left.repos === right.repos
    && normalizedWatchlistScope(left.watchlist) === normalizedWatchlistScope(right.watchlist);
}

function normalizedWatchlistScope(value: string): string {
  return value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .join(",");
}

function writeCachedLayer(path: string, key: string, layer: AdoptionLayer, now: Date): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const cache = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8")) as Record<string, CachedLayer>
      : {};
    cache[key] = {
      cachedAt: now.toISOString(),
      status: layer.collectionStatus ?? "fallback",
      layer,
    };
    writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  } catch {
    // Cache failures must not affect report generation.
  }
}
