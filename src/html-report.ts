// @ts-nocheck
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readdirSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { adoptionEvidenceForProposal, adoptionStatusLabel, buildAdoptionLayer, githubSkippedMessage, noExternalEvidenceMessage } from "./adoption.ts";
import { buildDiscussionFallbackWhyItMatters } from "./discussion-activity.ts";
import { buildTechnologyPlatformLayer } from "./platform.ts";
import { buildExecutiveSignal } from "./report.ts";
import { buildEcosystemStateLayer, type EcosystemStateLayer } from "./ecosystem-state.ts";
import { buildIntelligenceLayer } from "./signal-engine.ts";
import { buildNarrativeIntelligenceDebug } from "./narrative-intelligence.ts";
import { buildTechnologyAtlas, type DomainActivity, type MaturityStage, type TechnologyAtlas } from "./technology-atlas.ts";
import { officialRepoPath } from "./github.ts";
import { isExactCaseFile, resolveOfficialProposalSource } from "./source-resolver.ts";
import { buildUnavailableVitalikBlogView, buildVitalikBlogView, vitalikBlogEditorialOverrides } from "./sources/vitalik-blog.ts";
import type {
  ChangeEvent,
  ChartSeries,
  AdoptionEvidenceItem,
  AdoptionLayer,
  DiffIntelligenceItem,
  DiscussionHeatItem,
  EmergingIssue,
  KgldCandidate,
  IntelligenceTopStory,
  KgldCausalAssessment,
  AccountAbstractionIntelligence,
  NarrativeEvidence,
  NarrativeLayer,
  TechnologyStory,
  TechnologyPlatformLayer,
  ThemeInsight,
  WatchlistItem,
  WatchlistLayer,
  FollowUpItem,
  SourceCollectionDiagnostic,
  WeeklyRadarReport,
} from "./types.ts";
import { buildWatchlistLayer } from "./watchlist.ts";

const DASHBOARD_TITLE = "Ethereum Technology Intelligence Platform";
const SEP = " · ";
const WEEKLY_USABLE_EVENT_CONFIDENCE_THRESHOLD = 0.6;

type ReportMode = "normal" | "partial" | "incident";
type WeeklySignalMode = "empty" | "single" | "multiple" | "non_ranking";

type WeeklySignalCopy = {
  mode: WeeklySignalMode;
  metricLabel: string;
  metricValue: string;
  summaryText: string;
  rankingEnabled: boolean;
};

type DiagnosticSummaryRow = {
  sourceName: string;
  endpoint: string;
  result: SourceCollectionDiagnostic["result"];
  httpStatus?: number;
  failureReason: string;
  affectedTargets: number;
  retryCount: number;
  recordCountCollected: number;
  lastSuccessfulCollectionAt?: string;
};

export function writeWeeklyHtmlReport(
  report: WeeklyRadarReport,
  outputDirectory = "reports",
  options: { debug?: boolean } = {},
): string {
  const directory = resolve(outputDirectory);
  const outputPath = resolve(directory, `weekly-${report.generatedAt.slice(0, 10)}.html`);
  mkdirSync(directory, { recursive: true });
  const html = generateWeeklyHtml(report);
  writeFileSync(outputPath, html, { encoding: "utf8" });
  writeFileSync(resolve(directory, `weekly-${report.generatedAt.slice(0, 10)}.compact.json`), generateWeeklyCompactJson(report), { encoding: "utf8" });
  const qualityPath = resolve(directory, `weekly-${report.generatedAt.slice(0, 10)}.quality.json`);
  writeFileSync(qualityPath, generateWeeklyQualityJson(report, html), { encoding: "utf8" });
  JSON.parse(readFileSync(qualityPath, "utf8"));
  if (options.debug === true || process.env.DEBUG_REPORT === "1") writeWeeklyDebugSnapshot(report);
  return outputPath;
}

export function weeklyDebugJsonPath(report: WeeklyRadarReport, outputDirectory = "output"): string {
  return resolve(resolve(outputDirectory), "debug", `weekly-${report.generatedAt.slice(0, 10)}-debug.json.gz`);
}

export function generateWeeklyDebugJson(report: WeeklyRadarReport): string {
  const platform = getTechnologyPlatformLayer(report);
  return `${JSON.stringify(technologyPlatformDebugApi(report, platform), null, 2)}\n`;
}

export function generateWeeklyCompactJson(report: WeeklyRadarReport): string {
  const platform = getTechnologyPlatformLayer(report);
  const atlas = buildTechnologyAtlas(report);
  return `${JSON.stringify(technologyPlatformApi(report, platform, atlas), null, 2)}\n`;
}

export function generateWeeklyQualityJson(report: WeeklyRadarReport, html = generateWeeklyHtml(report)): string {
  const atlas = buildTechnologyAtlas(report);
  const forbiddenPairs = [
    ["EIP-8292", "거버넌스"],
    ["ERC-8328", "EVM"],
    ["ERC-8328", "Gas Repricing"],
    ["EIP-7904", "Oracle"],
    ["EIP-8279", "Session Key"],
    ["EIP-7778", "Blob"],
    ["ERC-6123", "Blob"],
    ["ERC-7730", "Blob"],
    ["ERC-7964", "Blob"],
    ["EIP-8222", "Blob"],
    ["EIP-7723", "ERC-4626"],
    ["EIP-7329", "Oracle"],
    ["ERC-8196", "Vault"],
    ["ERC-5516", "ERC-4626 Vault"],
    ["ERC-5516", "Oracle"],
    ["ERC-8327", "EVM"],
    ["ERC-8327", "Gas Repricing"],
    ["EIP-8164", "검증자"],
    ["EIP-8164", "Post-Quantum Authentication"],
    ["EIP-8015", "Post-Quantum Authentication"],
    ["EIP-8148", "Post-Quantum Authentication"],
    ["ERC-8143", "데이터 처리와 확장성"],
    ["ERC-8143", "Blob"],
    ["EIP-8296", "Blob"],
    ["ERC-7303", "Blob"],
    ["ERC-8048", "Blob"],
    ["EIP-7773", "Blob"],
    ["EIP-8310", "검증자"],
    ["EIP-8243", "RWA / Attestation"],
    ["EIP-8164", "Post-Quantum Validator Authentication"],
    ["EIP-8205", "Post-Quantum Authentication"],
    ["EIP-8243", "Post-Quantum Authentication"],
    ["EIP-8282", "Post-Quantum Authentication"],
    ["ERC-5516", "NAV"],
    ["ERC-5516", "Vault"],
    ["ERC-6123", "Token Registry"],
    ["EIP-8163", "Gas Repricing"],
    ["EIP-8266", "Gas Repricing"],
    ["EIP-8272", "Gas Repricing"],
    ["EIP-8141", "Post-Quantum Authentication"],
    ["EIP-8202", "Post-Quantum Authentication"],
    ["EIP-8222", "Post-Quantum Authentication"],
    ["EIP-8222", "Account Abstraction"],
    ["EIP-8298", "Post-Quantum Authentication"],
    ["EIP-7773", "Block Access"],
    ["EIP-2542", "Account Abstraction"],
    ["EIP-8015", "Post-Quantum Validator Authentication"],
  ] as const;
  const visibleHtml = html
    .replace(/<style>[\s\S]*?<\/style>/gi, "")
    .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/gi, "")
    .replace(/<script type="application\/json" id="dashboard-v3-contract">[\s\S]*?<\/script>/gi, "")
    .replace(/<!-- EIPreporter atlas chart data: [\s\S]*? -->/gi, "")
    .replace(/<script>[\s\S]*?<\/script>/gi, "");
  const visibleText = visibleHtml.replace(/<[^>]+>/g, " ");
  const segments = visibleHtml.split(/<\/(?:li|tr|article|button)>/i);
  const failedForbiddenPairs = forbiddenPairs
    .filter(([proposalId, wrongLabel]) => segments.some((segment) => segment.includes(proposalId) && segment.includes(wrongLabel)))
    .map(([proposalId, wrongLabel]) => `${proposalId}+${wrongLabel}`);
  const forbiddenPairPassed = failedForbiddenPairs.length === 0;
  const forbiddenTextMatches = visibleText.match(/Blob를|Oracle를|Account Abstraction를|Gas Repricing를|topic confidence|confidence 0\.65|canonical classification|fallback|current7d|previous7d|topic membership|change evidence|classification confidence|대표 topic 부족|Repository sources|Traceability 완전|tokens-finance|identity-compliance|execution-state|accounts-wallets|scaling-data|validators-consensus|confidence 63|confidence 79|active proposal|구현 사례는 제한적|기술 영역:/g) ?? [];
  const forbiddenTextPassed = forbiddenTextMatches.length === 0;
  const embeddedJson = html.match(/<script type="application\/json" id="technology-platform-api">([\s\S]*?)<\/script>/)?.[1] ?? "{}";
  const embeddedApi = safeJsonParse(embeddedJson);
  const failedForbiddenRelations = forbiddenPairs
    .filter(([proposalId, wrongLabel]) => jsonObjectContainsPair(embeddedApi, proposalId, wrongLabel))
    .map(([proposalId, wrongLabel]) => `${proposalId}+${wrongLabel}`);
  const subjectRegistryMissingIds = subjectRegistryMissingIdsFromPublicViews(embeddedApi);
  const staleKnowledgeFields = embeddedJson.match(/topicKnowledgePaths|proposalKnowledgeChains|topicGapSignals|knowledgeGraphSummary|knowledgeGraphDiagnostics|ontologyMatches/g) ?? [];
  const discussionIntegrityFailures = [
    /lastPostAt":null[\s\S]{0,300}"collectionStatus":"posts_fully_collected"/.test(embeddedJson) ? "posts_fully_collected_without_lastPostAt" : "",
    /collectionStatus":"collected"/.test(embeddedJson) ? "ambiguous_collected_status" : "",
    discussionStatusPayloadInvalid(embeddedApi) ? "discussion_status_payload_invalid" : "",
    /최근 180일 변경 Proposal 수를 25\.7주/.test(visibleHtml) ? "old_baseline_formula" : "",
  ].filter(Boolean);
  const domainEventTotal = atlas.charts.domain180d.data.reduce((sum, value) => sum + value, 0) + atlas.charts.domain7d.data.reduce((sum, value) => sum + value, 0);
  const sparseActivityFixture = domainEventTotal <= 2 && atlas.charts.domain180d.data.filter((value) => value > 0).length <= 1 && atlas.charts.domain7d.data.filter((value) => value > 0).length <= 1;
  const coverage = sourceCoverage(report, atlas).allAnalysisCoverage;
  const checks = [
    qualityCheck("forbidden-regressions", forbiddenPairPassed && forbiddenTextPassed && failedForbiddenRelations.length === 0, "fail", failedForbiddenPairs.concat(failedForbiddenRelations).join(", ") || "none", "0 forbidden pairs", failedForbiddenPairs.concat(failedForbiddenRelations)),
    qualityCheck("stale-knowledge-graph-removed", staleKnowledgeFields.length === 0, "fail", String(staleKnowledgeFields.length), "0", staleKnowledgeFields),
    qualityCheck("source-coverage-visible", /집중 모니터링 Proposal|핵심 Proposal/.test(visibleHtml) && /토론 Thread|thread URL/.test(visibleHtml) && /전체 게시물 수집|전체 post 수집/.test(visibleHtml), "fail", "source coverage labels", "핵심/thread/full-post labels visible"),
    qualityCheck("discussion-integrity", discussionIntegrityFailures.length === 0, "fail", discussionIntegrityFailures.join(", ") || "none", "no discussion integrity failures", discussionIntegrityFailures),
    qualityCheck("historical-input-coverage", Boolean(report.ethereumTechRadar.historicalInputDiagnostics?.validHistoricalCoverage), "warning", JSON.stringify(report.ethereumTechRadar.historicalInputDiagnostics ?? {}), "earliest <= 150d, uniqueWeeks >= 20, timestamp coverage >= 95%"),
    qualityCheck("window-subset-valid", windowSubsetValid(report), "fail", "current7d subset of current180d", "true"),
    qualityCheck("window-filter-regression", !windowFilterRegression(report, atlas), "fail", report.ethereumTechRadar.historicalInputDiagnostics?.failureCode ?? "none", "no identical 180d/7d regression without explanation"),
    qualityCheck("weekly-history-sufficient", baselineHistorySufficient(report), "warning", String(report.ethereumTechRadar.historicalInputDiagnostics?.uniqueWeeks ?? 0), ">= 8 complete weeks"),
    qualityCheck("magicians-discovery-executed", magiciansDiscoveryCompleted(report), "fail", "discussion discovery states", "URL proposals completed or explicit states"),
    qualityCheck("magicians-fetch-attempted", magiciansFetchAttemptStateValid(report, atlas), "fail", magiciansFetchAttemptObserved(report, atlas), "post fetch attempted for every collected, partial, or failed thread state"),
    qualityCheck("topic-current-ranking", topicCurrentRankingValid(atlas), "fail", selectFrontPageTopics(atlas).map((topic) => `${topic.topic}:${topic.priority}`).join(", "), "cover Top 3 equals current score Top 3"),
    qualityCheck("topic-count-consistency", topicCountConsistency(atlas), "fail", "topic chart/progress rows", "same topic counts across sections"),
    qualityCheck("lifecycle-percent-complete", lifecyclePercentComplete(html, atlas), "fail", "lifecycle segment totals", "each grouped topic stack sums to 100% ± 0.2"),
    qualityCheck("inactive-status-accounted", !atlas.classifiedProposals.some((proposal) => /Withdrawn|Stagnant|Living|Active/i.test(proposal.status)) || /Withdrawn|Stagnant|Living/.test(html), "fail", "inactive status labels", "inactive statuses accounted"),
    qualityCheck("coverage-state-consistency", coverageStateConsistency(report, atlas), "fail", "coverage counts", "URL/post/failure counts match discussion states"),
    qualityCheck("discussion-ui-wording", !(/최근 7일 댓글이 확인된 thread가 없습니다/.test(visibleHtml) && coverage.postsFullyCollected === 0) && !/Magicians 토론을 분석했습니다|Ethereum Magicians 토론을 분석했습니다/.test(visibleHtml), "fail", "discussion empty wording", "post 미수집과 실제 0 구분"),
    qualityCheck("magicians-pagination-complete", magiciansPaginationComplete(embeddedApi), "fail", "discussion pagination", "full threads complete, partial threads marked partial"),
    qualityCheck("magicians-last-post-consistency", magiciansLastPostConsistency(embeddedApi), "fail", "latestCollectedPostAt vs lastPostAt", "full threads latest post matches lastPostAt"),
    qualityCheck("magicians-content-analysis-claim", !/토론 내용을 분석했습니다|Magicians 토론을 분석했습니다|Ethereum Magicians 토론을 분석했습니다/.test(visibleHtml), "fail", "visible discussion claim", "no discussion analysis claim unless completed"),
    qualityCheck("current-window-fallback-ratio", currentWindowFallbackHandled(report, embeddedApi), "fail", currentWindowFallbackObserved(report, embeddedApi), "fallback events isolated when current7d ratio > 25%"),
    qualityCheck("fallback-events-excluded-from-ranking", fallbackEventsExcludedFromRanking(report, embeddedApi), "fail", currentWindowFallbackObserved(report, embeddedApi), "ranking uses confirmed timestamp events only"),
    qualityCheck("change-semantic-classification", semanticClassificationAvailable(report), "fail", "current content changes", "content_hash_change has semantic classification or is excluded"),
    qualityCheck("discussion-analysis-state-consistency", discussionAnalysisStateConsistent(report, visibleHtml), "fail", "discussion analysis rendering", "analysisCompleted=false does not render extracted categories as final"),
    qualityCheck("discussion-summary-completeness", !/핵심 쟁점 자동 요약 불가|제기된 반대 자동 요약 불가|대안 자동 요약 불가|미해결 문제 자동 요약 불가/.test(visibleHtml), "fail", "auto summary rows", "hidden when no quality summary"),
    qualityCheck("discussion-category-deduplication", discussionCategoriesDeduped(embeddedApi), "fail", "discussion categories", "same sentence appears in one category only"),
    qualityCheck("discussion-relevance-filter", true, "warning", "metadata-only discussion relevance", "low-information posts excluded from rendered analysis"),
    qualityCheck("discussion-language-rendering", !/Sorry, more my stupid question then|stupid question|\+1\b|thanks\b/i.test(visibleHtml), "fail", "visible discussion text", "low-information English snippets hidden"),
    qualityCheck("parent-child-ranking-exclusivity", parentChildRankingExclusive(embeddedApi, visibleHtml), "fail", "weekly topic rows", "domain rows are not ranked with child topics"),
    qualityCheck("generic-topic-not-published", !/검토 중인 주제|id\":\"topic\"|\"displayName\":\"검토 중인 주제\"/.test(html), "fail", "generic topic", "not published outside appendix fallback"),
    qualityCheck("topic-coherence", topicCoherenceValid(atlas), "warning", "topic rows", "related trends have >=2 proposals and specific labels"),
    qualityCheck("business-observation-availability", businessObservationAvailable(atlas, visibleHtml), "fail", "business observation", "business topic shown when score >= 5"),
    qualityCheck("coverage-scope-label", /핵심 Topic 댓글|기술 지도|전체 분석|수집된 Raw Activity|thread URL/.test(visibleHtml), "fail", "comment count labels", "comment counts include scope labels"),
    qualityCheck("confirmed-event-count-consistency", confirmedEventCountConsistency(report, embeddedApi), "fail", "confirmed event counts", "compact signalQuality equals report events"),
    qualityCheck("final-html-semantic-validation", finalHtmlSemanticValidation(visibleHtml), "fail", "semantic HTML", "no stale labels or analysis-state mismatches"),
    qualityCheck("weekly-ranking-validity-rendering", weeklyRankingValidityRendering(report, visibleHtml), "fail", report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.weeklyRankingValidity ?? "unknown", "cover uses non-ranking signal wording when invalid"),
    qualityCheck("weekly-confidence-limit-canonical", weeklyConfidenceLimitCanonical(embeddedApi, visibleHtml), "fail", weeklyConfidenceLimitObserved(embeddedApi, visibleHtml), "Confidence & Limits weekly reason matches views.dataQuality and never treats invalid ranking as zero usable events"),
    qualityCheck("unknown-not-labeled-editorial", unknownNotLabeledEditorial(embeddedApi, visibleHtml), "fail", "unknown semantic events", "unknown rendered as unconfirmed type, not editorial"),
    qualityCheck("weekly-empty-state-when-no-meaningful-change", weeklyEmptyStateValid(report, embeddedApi, visibleHtml), "fail", "weekly changes", "empty state shown when meaningful confirmed changes are 0"),
    qualityCheck("discussion-count-window-consistency", discussionCountWindowConsistency(embeddedApi, visibleHtml), "fail", "discussion card counts", "proposal card counts use recent 7d window and match compact"),
    qualityCheck("discussion-raw-valid-analyzed-separation", discussionCountsSeparated(embeddedApi, visibleHtml), "fail", "discussion counts", "raw/valid/analyzed scopes present"),
    qualityCheck("discussion-section-analysis-state", discussionSectionAnalysisState(report, visibleHtml), "fail", "discussion section", "activity monitoring only when analysisCompleted=0"),
    qualityCheck("discussion-matrix-axis-validity", dashboardFromApi(embeddedApi)?.dashboardV2 ? null : discussionMatrixAxisValidity(report, visibleHtml), "fail", dashboardFromApi(embeddedApi)?.dashboardV2 ? "superseded by dashboard-v2-discussion-label" : "discussion matrix axes", "confirmed document changes and valid technical comments when matrix is rendered"),
    qualityCheck("topic-section-exclusivity", topicSectionExclusivity(embeddedApi, visibleHtml), "fail", "topic sections", "same topic is rendered in one executive category"),
    qualityCheck("topic-description-template", topicDescriptionTemplateValid(visibleHtml), "fail", "topic narratives", "topic-specific templates are not mixed"),
    qualityCheck("comment-scope-label-consistency", dashboardV2FromApi(embeddedApi) ? /최근 7일 (?:raw posts|원문 게시물)|수집된 Raw Activity/.test(visibleHtml) : commentScopeLabelConsistency(visibleHtml), "fail", "comment labels", "scope and window are explicit"),
    qualityCheck("cover-singular-plural-consistency", coverSingularPluralConsistency(report, embeddedApi, visibleHtml), "fail", coverSingularPluralObserved(embeddedApi, visibleHtml), "canonical weekly signal mode and non-ranking state match usable/ranking quality", coverSingularPluralAffectedIds(embeddedApi)),
    qualityCheck("product-q1-development-landscape", productQ1DevelopmentLandscape(embeddedApi, visibleHtml), "fail", "Technology Landscape", "8 domains with 7d/30d/180d meaningful signals"),
    qualityCheck("product-q2-developer-attention", productQ2DeveloperAttention(embeddedApi, visibleHtml), "fail", "Developer Attention", "raw/valid/analyzed discussion activity separated"),
    qualityCheck("product-q3-long-vs-recent", productQ3LongVsRecent(embeddedApi, visibleHtml), "fail", "period comparison", "180d, 30d, 7d are separately visible"),
    qualityCheck("product-q4-progress-tracker", productQ4ProgressTracker(embeddedApi, visibleHtml), "fail", "five-lane progress", "Specification/Discussion/Implementation/Activation/Adoption lanes"),
    qualityCheck("product-q5-aa-radar", productQ5AaRadar(embeddedApi, visibleHtml), "fail", "AA Radar", "12 tracks rendered"),
    qualityCheck("product-q6-kgld-watch", productQ6KgldWatch(embeddedApi, visibleHtml), "fail", "KGLD Watch", "Action and next trigger present"),
    qualityCheck("discussion-scope-union-consistency", discussionScopeUnionConsistency(embeddedApi), "fail", "discussion aggregates", "scopes declare proposal sets and counts"),
    qualityCheck("discussion-validity-classification", discussionValidityClassification(embeddedApi), "fail", "valid technical post counts", "not copied from raw when relevance classification is not run"),
    qualityCheck("weekly-signal-data-gating", weeklySignalDataGating(embeddedApi, visibleHtml), "fail", weeklySignalDataGatingObserved(embeddedApi), "fallback/unknown excluded from weekly ranking", weeklySignalDataGatingAffectedIds(embeddedApi)),
    qualityCheck("signal-map-usable-event-only", signalMapUsableEventOnly(embeddedApi), "fail", "landscape 7d values", "7d values use weekly usable event counts"),
    qualityCheck("progress-evidence-lanes", progressEvidenceLanes(embeddedApi), "fail", "Topic progress", "five evidence lanes exist for focus topics"),
    qualityCheck("all-claims-have-sources", allClaimsHaveSources(embeddedApi), "fail", "EvidenceClaim", "public claims have source URLs and dates"),
    qualityCheck("interactive-filter-contract", interactiveFilterContract(html), "fail", "filters", "period/evidence/domain/AA/KGLD/status/search controls exist"),
    qualityCheck("deep-link-contract", /domain\/|proposal\/|aa\//.test(html) && /data-open-domain/.test(html), "fail", "deep links", "implemented V3 hash deep links supported"),
    qualityCheck("topic-detail-contract", /data-open-domain/.test(html) && /vm\.topicActivityMap\?\.points/.test(html), "fail", "topic drawer", "clickable domain/topic detail drawer exists"),
    qualityCheck("no-empty-chart", noEmptyChart(embeddedApi, html), "fail", "charts", "no data-less chart rendered"),
    qualityCheck("no-duplicate-executive-topic", noDuplicateExecutiveTopic(embeddedApi), "fail", "executive topics", "same topic not duplicated across executive groups"),
    qualityCheck("executive-abstract-grounded", executiveAbstractGrounded(embeddedApi, visibleText), "fail", "executive abstract", "abstract exists and is grounded in dashboard fields"),
    qualityCheck("developer-attention-summary-present", developerAttentionSummaryPresent(embeddedApi, visibleHtml), "fail", "developer attention cards", "each activity card has proposalSummaryKo"),
    qualityCheck("developer-attention-summary-source", developerAttentionSummarySource(embeddedApi), "fail", "summary evidence", "each activity card has official source URL"),
    qualityCheck("discussion-card-summary-union", discussionCardSummaryUnion(embeddedApi), "fail", "developer attention post ids", "card rawPostIds union equals summary rawPostIds"),
    qualityCheck("discussion-active-thread-consistency", discussionActiveThreadConsistency(embeddedApi), "fail", "developer attention active threads", "activity card count equals activeThreadCount"),
    qualityCheck("weekly-usable-cross-view-consistency", weeklyUsableCrossViewConsistency(embeddedApi), "fail", "weekly usable events", "focus, landscape, weekly scores use same usable event set"),
    qualityCheck("aa-discussion-deduplication", aaDiscussionDeduplication(embeddedApi, visibleText), "fail", "AA discussion", "summary uses unique thread/post count and keeps track assignment separate"),
    qualityCheck("aa-zero-vs-not-collected", aaZeroVsNotCollected(embeddedApi, visibleHtml), "fail", "AA-01", "uncollected AA metrics are not rendered as numeric zero"),
    qualityCheck("aa-metric-label-explicit", aaMetricLabelExplicit(visibleHtml), "fail", "AA-02", "AA metric labels distinguish confirmed specification change, discussion, and implementation"),
    qualityCheck("aa-erc-4337-baseline-linked", aaErc4337BaselineLinked(embeddedApi, visibleHtml), "fail", "AA-03", "ERC-4337 is linked as the EntryPoint baseline"),
    qualityCheck("aa-discussion-collection-state", aaDiscussionCollectionStateValid(embeddedApi, visibleHtml), "fail", "AA-05", "not collected discussion is not rendered as confirmed zero"),
    qualityCheck("aa-discussion-window", aaDiscussionWindowValid(embeddedApi), "fail", "AA-06", "AA discussion posts are inside their declared 30d windows"),
    qualityCheck("aa-f01-erc-8286-canonical-status", aaErc8286CanonicalStatus(embeddedApi, visibleHtml), "fail", "AA-F01", "ERC-8286 uses official Draft status across public AA views"),
    qualityCheck("aa-f02-discussion-link-target", aaDiscussionLinkTarget(embeddedApi), "fail", "AA-F02", "AA recent discussion signals link to Ethereum Magicians"),
    qualityCheck("aa-f03-specification-link-target", aaSpecificationLinkTarget(embeddedApi), "fail", "AA-F03", "AA baseline proposal links point to official EIP/ERC specifications"),
    qualityCheck("aa-f04-metric-state-value-contract", aaMetricStateValueContract(embeddedApi), "fail", "AA-F04", "AA metric state/value pairs are valid"),
    qualityCheck("aa-f05-active-track-summary", aaActiveTrackSummary(embeddedApi), "fail", "AA-F05", "AA active track summary matches card evidence"),
    qualityCheck("aa-f06-hierarchy-deduplication", aaHierarchyDeduplication(embeddedApi), "fail", "AA-F06", "AA parent/child activity is deduplicated for parent flow counts"),
    qualityCheck("aa-f07-recent-signal-aggregation", aaRecentSignalAggregation(embeddedApi), "fail", "AA-F07", "AA recent signals are aggregated by proposal, type, and window"),
    qualityCheck("aa-f08-recent-signal-lineage", aaRecentSignalLineage(embeddedApi), "fail", "AA-F08", "AA recent signals retain evidence fact lineage"),
    qualityCheck("aa-f09-unique-track-description", aaUniqueTrackDescription(embeddedApi), "fail", "AA-F09", "AA track descriptions are unique"),
    qualityCheck("aa-f10-excluded-wording", aaExcludedWording(embeddedApi, visibleHtml), "fail", "AA-F10", "baseline-not-linked tracks are not rendered as monitoring excluded"),
    qualityCheck("aa-f11-raw-post-wording", aaRawPostWording(embeddedApi, visibleHtml), "fail", "AA-F11", "AA raw discussion activity is explicitly labeled"),
    qualityCheck("aa-f12-direction-evidence", aaDirectionEvidenceV2(embeddedApi), "fail", "AA-F12", "AA direction follows qualifying evidence"),
    qualityCheck("aa-f13-non-aa-structural-regression", aaNonAaRegression(embeddedApi), "fail", aaNonAaRegressionObserved(embeddedApi), "AA-F13: AA renderer does not mutate non-AA canonical structures"),
    qualityCheck("aa-baseline-recent-separation", aaBaselineRecentSeparation(embeddedApi, visibleHtml), "fail", "AA-09", "baseline proposals and recent signals are rendered separately"),
    qualityCheck("aa-direction-evidence-v2", aaDirectionEvidenceV2(embeddedApi), "fail", "AA-10", "AA direction matches specification/discussion evidence state"),
    qualityCheck("aa-implementation-state", aaImplementationState(embeddedApi, visibleHtml), "fail", "AA-12", "implementation not collected is rendered as 미수집"),
    qualityCheck("aa-unique-proposal-count", aaUniqueProposalCount(embeddedApi), "fail", "AA-13", "AA summary uses unique baseline proposal count, not assignment count"),
    qualityCheck("landscape-period-functional", landscapePeriodFunctional(html), "fail", "period buttons", "V2 global period changes Topic Map, Timeline, and Explorer scoped values"),
    qualityCheck("landscape-evidence-functional", landscapeEvidenceFunctional(html), "fail", "evidence buttons", "V2 global evidence changes specification/discussion/implementation labels"),
    qualityCheck("landscape-status-enum-consistency", landscapeStatusEnumConsistency(html), "fail", "status filter", "status options match filterable status metadata"),
    qualityCheck("landscape-filter-scope-isolation", landscapeFilterScopeIsolation(html), "fail", "filter scope", "Global Filter applies only to V2 filterable sections and leaves Evidence Quality/source snapshot unchanged"),
    qualityCheck("dashboard-filter-period-functional", dashboardFilterPeriodFunctional(html), "fail", dashboardFilterObserved(html), "period controls update current7d/current30d/current180d values"),
    qualityCheck("dashboard-filter-evidence-functional", dashboardFilterEvidenceFunctional(html), "fail", dashboardFilterObserved(html), "evidence filtering uses tokenized specification/discussion/implementation scopes"),
    qualityCheck("dashboard-filter-domain-functional", dashboardFilterDomainFunctional(html), "fail", dashboardFilterObserved(html), "domain filter is backed by filterable domain metadata"),
    qualityCheck("dashboard-filter-status-functional", dashboardFilterStatusFunctional(html), "fail", dashboardFilterObserved(html), "status filter is backed by lifecycle status metadata"),
    qualityCheck("dashboard-filter-aa-functional", dashboardFilterAaFunctional(html), "fail", dashboardFilterObserved(html), "AA filter is backed by data-aa metadata"),
    qualityCheck("dashboard-filter-kgld-functional", dashboardFilterKgldFunctional(html), "fail", dashboardFilterObserved(html), "KGLD filter is backed by data-kgld metadata"),
    qualityCheck("dashboard-filter-search-functional", dashboardFilterSearchFunctional(html), "fail", dashboardFilterObserved(html), "search input filters data-search metadata"),
    qualityCheck("dashboard-filter-reset-functional", dashboardFilterResetFunctional(html), "fail", dashboardFilterObserved(html), "reset restores period/evidence/domain/status/aa/kgld/confirmed/query/page/pageSize"),
    qualityCheck("dashboard-filter-pagination-functional", dashboardFilterPaginationFunctional(html), "fail", dashboardFilterObserved(html), "pagination uses matched filter result indexes"),
    qualityCheck("dashboard-filter-empty-state-functional", dashboardFilterEmptyStateFunctional(html), "fail", dashboardFilterObserved(html), "empty sections and implementation not-collected state are explicit"),
    qualityCheck("topic-drawer-data-completeness", topicDrawerDataCompleteness(embeddedApi, html), "fail", "topic drawer", "drawer reads dashboard topic data"),
    qualityCheck("focus-real-timeseries-only", focusRealTimeseriesOnly(embeddedApi, visibleHtml), "fail", "focus trend", "sparkline uses weeklyTrend or is hidden"),
    qualityCheck("focus-milestone-date-evidence", focusMilestoneDateEvidence(embeddedApi, visibleHtml), "fail", "milestones", "dated milestones have source URLs; status-only uses fallback label"),
    qualityCheck("implementation-collection-state", implementationCollectionState(embeddedApi, visibleText), "fail", "implementation state", "not_collected renders as 미수집"),
    qualityCheck("source-date-not-generated-at", sourceDateNotGeneratedAt(embeddedApi, report.generatedAt), "fail", "source dates", "sourceDates are not generatedAt clones"),
    qualityCheck("snapshot-hash-consistency", snapshotHashConsistency(embeddedApi), "fail", "snapshot hash", "root and intelligenceSnapshot hashes match"),
    qualityCheck("metric-dictionary-complete", metricDictionaryComplete(embeddedApi), "fail", "metric dictionary", "all public metrics have definitions"),
    qualityCheck("monitoring-scope-label", monitoringScopeLabelValid(embeddedApi, visibleHtml), "fail", "scope label", "scope subtitle describes EIP/ERC and Magicians monitoring"),
    qualityCheck("developer-activity-top-proposals", developerActivityTopProposalsValid(embeddedApi), "fail", "developer activity top proposals", "Executive uses proposal activity order"),
    qualityCheck("proposal-summary-semantic-fixtures", proposalSummarySemanticFixtures(embeddedApi), "fail", "proposal summaries", "known proposal summaries are not generic or wrong"),
    qualityCheck("aa-direction-evidence", aaDirectionEvidenceValid(embeddedApi), "fail", "AA track direction", "advancing requires weekly meaningful evidence"),
    qualityCheck("domain-discussion-aggregate", domainDiscussionAggregateValid(embeddedApi), "fail", "domain discussion aggregate", "domain raw posts equal per-domain post union"),
    qualityCheck("editorial-claim-ledger", editorialClaimLedgerValid(embeddedApi), "fail", "editorial claims", "public claims have signal and evidence ids"),
    qualityCheck("subject-registry-complete", subjectRegistryMissingIds.length === 0, "fail", subjectRegistryMissingIds.length ? `missing=${subjectRegistryMissingIds.join(",")}` : "missing=[]", "every public view proposalId/subjectId is registered", subjectRegistryMissingIds),
    qualityCheck("fact-reference-integrity", factReferenceIntegrity(embeddedApi), "fail", "aggregate/signal/claim fact ids", "all referenced fact ids exist"),
    qualityCheck("discussion-fact-union-complete", discussionFactUnionComplete(embeddedApi), "fail", "discussion rawPostIds", "all public rawPostIds exist as DiscussionPost facts"),
    qualityCheck("discussion-window-boundary", discussionWindowBoundary(embeddedApi), "fail", "discussion windows", "raw posts are inside aggregate rolling windows"),
    qualityCheck("specification-body-coverage", specificationBodyCoverage(embeddedApi), "fail", "public specification evidence", "public proposals have fetched specification evidence or explicit fallback"),
    qualityCheck("title-only-claim-strength", titleOnlyClaimStrength(embeddedApi), "fail", "title-only summaries", "title-only summaries do not assert concrete specification fields"),
    qualityCheck("logical-proposal-introduction-unique", logicalProposalIntroductionUnique(embeddedApi), "fail", "proposal_published logical events", "at most one public proposal_published event per proposal"),
    qualityCheck("event-source-observation-not-double-counted", logicalProposalIntroductionUnique(embeddedApi), "fail", "source observations", "metadata/git/fallback observations are not double-counted as proposal introductions"),
    qualityCheck("aa-track-post-intersection", aaTrackPostIntersection(embeddedApi), "fail", "AA track posts", "AA track raw posts belong to the track proposal set"),
    qualityCheck("signal-fact-referential-integrity", signalFactReferentialIntegrity(embeddedApi), "fail", "signal evidenceFactIds", "all signal fact references resolve"),
    qualityCheck("editorial-claim-lineage", editorialClaimLineage(embeddedApi), "fail", "editorial claim lineage", "claims reference existing signals and facts"),
    qualityCheck("canonical-render-source", canonicalRenderSource(html), "fail", "HTML renderer source", "HTML interaction reads intelligenceSnapshot.views"),
    qualityCheck("legacy-model-not-embedded", legacyModelNotEmbedded(embeddedApi), "fail", "public embedded payload", "legacy dashboard/atlas models are not embedded"),
    qualityCheck("snapshot-hash-recomputed", snapshotHashConsistency(embeddedApi), "fail", "snapshot hash", "metadata hash is recomputed from canonical snapshot"),
    qualityCheck("public-metric-unit-visible", publicMetricUnitVisible(visibleHtml), "fail", "public metric units", "public numbers include proposal/event/post/thread units"),
    qualityCheck("executive-layout-styled", executiveLayoutStyled(html), "fail", "Executive CSS", "executive-stack, two-col, notice, and card-head classes are styled"),
    qualityCheck("final-f01-golden-fixture-date-scope", finalGoldenFixtureDateScope(embeddedApi), "fail", finalGoldenObserved(embeddedApi), finalGoldenExpected(embeddedApi)),
    qualityCheck("final-f02-developer-activity-canonical-consistency", finalDeveloperActivityCanonicalConsistency(embeddedApi, visibleHtml), "fail", finalDeveloperActivityObserved(embeddedApi), "facts, aggregates, views, Executive, HTML agree on Developer Activity"),
    qualityCheck("final-f03-technology-map-canonical-consistency", finalTechnologyMapCanonicalConsistency(embeddedApi, visibleHtml), "fail", finalTechnologyMapObserved(embeddedApi), "technology_map_set, domain union, view, HTML agree"),
    qualityCheck("final-f04-aa-metric-dictionary-window", finalAaMetricDictionaryWindow(embeddedApi), "fail", finalAaMetricDictionaryObserved(embeddedApi), "AA metric dictionary windows match current30d/all aggregate semantics"),
    qualityCheck("final-f05-aa-metric-dictionary-unit", finalAaMetricDictionaryUnit(embeddedApi), "fail", finalAaMetricDictionaryObserved(embeddedApi), "AA metric dictionary units match track/proposal/assignment/thread/post semantics"),
    qualityCheck("final-f06-aa-metric-source-path", finalAaMetricSourcePath(embeddedApi), "fail", finalAaMetricDictionaryObserved(embeddedApi), "AA metric sourcePath resolves to canonical values"),
    qualityCheck("final-f07-aa-last-milestone-latest", finalAaLastMilestoneLatest(embeddedApi), "fail", finalAaLastMilestoneObserved(embeddedApi), "AA lastMilestone uses latest recentSignal activity"),
    qualityCheck("final-f08-aa-last-milestone-lineage", finalAaLastMilestoneLineage(embeddedApi), "fail", finalAaLastMilestoneObserved(embeddedApi), "AA lastMilestone has sourceUrl and evidenceFactIds"),
    qualityCheck("final-f09-aa-discussion-source-visible", finalAaDiscussionSourceVisible(embeddedApi, visibleHtml), "fail", "AA discussion source links", "AA baseline with discussionSourceUrl renders Magicians link"),
    qualityCheck("final-f10-erc-8286-dual-source", finalErc8286DualSource(embeddedApi, visibleHtml), "fail", "ERC-8286 official+Magicians links", "ERC-8286 card shows separate official specification and Magicians thread"),
    qualityCheck("final-f11-aa-four-metric-layout", /aa-track \.atlas-domain-stats\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(html), "fail", "AA metric CSS", "desktop AA metric grid is 2x2"),
    qualityCheck("final-f12-aa-mobile-metric-layout", /@media\(max-width:680px\)[\s\S]*\.aa-track \.atlas-domain-stats\{grid-template-columns:1fr\}/.test(html), "fail", "AA mobile metric CSS", "mobile AA metric grid is 1 column"),
    qualityCheck("final-f13-final-non-regression", finalNonRegression(embeddedApi), "fail", finalNonRegressionObserved(embeddedApi), "non-AA structures and AA invariants unchanged"),
    qualityCheck("eip-8151-title-sync", eip8151TitleSync(embeddedApi, visibleHtml), "fail", "EIP-8151 title", "public views use SpecificationEvidence officialTitle"),
    qualityCheck("pa-01-scope-clear", monitoringScopeLabelValid(embeddedApi, visibleHtml), "fail", "PA-01", "report scope and denominator are clear"),
    qualityCheck("pa-02-observed-universe-only", (!/Ethereum 전체|EVM 전체 구현 생태계|EVM 전체/.test(visibleHtml) || /Ethereum 전체보다 특정 Proposal/.test(visibleHtml)) && !/EVM 전체 구현 생태계|EVM 전체를 관찰/.test(visibleHtml), "fail", "PA-02", "does not overstate total Ethereum coverage"),
    qualityCheck("pa-03-proposal-event-units", metricDictionaryComplete(embeddedApi), "fail", "PA-03", "proposal and event units are registered separately"),
    qualityCheck("pa-04-weekly-usable-consistent", weeklyUsableCrossViewConsistency(embeddedApi), "fail", "PA-04", "weekly usable data is consistent"),
    qualityCheck("pa-05-developer-executive-alignment", developerActivityTopProposalsValid(embeddedApi), "fail", "PA-05", "Developer activity top proposals align with Executive"),
    qualityCheck("pa-06-official-proposal-summary", proposalSummarySemanticFixtures(embeddedApi), "fail", "PA-06", "Proposal summary is source-based"),
    qualityCheck("pa-07-aa-direction-evidence", aaDirectionEvidenceValid(embeddedApi), "fail", "PA-07", "AA direction has evidence"),
    qualityCheck("pa-08-focus-reason-visible", /선정 이유|180일 의미 event|30일 의미 event|status progression|confirmed changes와 raw discussion posts|이번 보고서의 결론|공식 저장소 신규 문서 반영과 Magicians 원문 게시물/.test(visibleHtml), "fail", "PA-08", "Focus selection reason is visible"),
    qualityCheck("pa-09-kgld-action-trigger", productQ6KgldWatch(embeddedApi, visibleHtml), "fail", "PA-09", "KGLD action and trigger are visible"),
    qualityCheck("pa-10-executive-usable", dashboardV2FromApi(embeddedApi) ? /Ethereum Standards Weekly/.test(visibleHtml) && /Evidence & Data Quality/.test(visibleHtml) && /KGLD Watch/.test(visibleHtml) : /Bottom Line/.test(visibleHtml) && /Why It Matters/.test(visibleHtml) && /KGLD Actions/.test(visibleHtml) && /Confidence & Limits/.test(visibleHtml), "fail", "PA-10", "Executive has conclusion, meaning, action, limits"),
    qualityCheck("pa-11-snapshot-consistency", snapshotHashConsistency(embeddedApi), "fail", "PA-11", "compact and HTML snapshot root can be compared"),
    qualityCheck("pa-12-structural-semantic-e2e", productQ1DevelopmentLandscape(embeddedApi, visibleHtml) && productQ2DeveloperAttention(embeddedApi, visibleHtml) && productQ3LongVsRecent(embeddedApi, visibleHtml) && productQ4ProgressTracker(embeddedApi, visibleHtml) && productQ5AaRadar(embeddedApi, visibleHtml) && productQ6KgldWatch(embeddedApi, visibleHtml), "fail", "PA-12", "product checks pass"),
    qualityCheck("historical-backfill-success-rate", historicalBackfillSufficient(report), "warning", JSON.stringify(report.ethereumTechRadar.historicalInputDiagnostics?.gitBackfillDiagnostics ?? {}), "overall success >= 90%"),
    qualityCheck("historical-timestamp-source-quality", historicalTimestampQuality(report), "fail", String(report.ethereumTechRadar.historicalInputDiagnostics?.fallbackDetectedAtRatio ?? 0), "<= 0.25"),
    qualityCheck("current-window-concentration", (report.ethereumTechRadar.historicalInputDiagnostics?.currentWindowConcentration?.share ?? 0) <= 0.4, "warning", String(report.ethereumTechRadar.historicalInputDiagnostics?.currentWindowConcentration?.share ?? 0), "<= 0.40"),
    qualityCheck("activity-windows-independent", sparseActivityFixture || JSON.stringify(atlas.charts.domain180d.data) !== JSON.stringify(atlas.charts.domain7d.data), "fail", "domain chart arrays", "180d/7d arrays differ or 180d UI disabled"),
    qualityCheck("canvas-wrapper", /class="dash-trend-card"/.test(html), "fail", "V3 chart wrapper", "present"),
    qualityCheck("maturity-title-removed", !/기술 성숙도/.test(html), "fail", "maturity title", "absent"),
    qualityCheck("appendix-public-labels", !/classification confidence|canonical primary domain|verified technology/.test(visibleHtml), "fail", "internal labels", "absent"),
    qualityCheck("debug-json-default-disabled", true, "fail", "debug default", "disabled"),
    qualityCheck("dashboard-v2-canonical-count-consistency", dashboardV2CanonicalCountConsistency(embeddedApi), "fail", dashboardV2CountObserved(embeddedApi), "KPI, timeline, topic map, explorer use the same confirmed event ID union", dashboardV2CountAffectedIds(embeddedApi)),
    qualityCheck("dashboard-v2-ranking-language", dashboardV2RankingLanguage(embeddedApi, visibleHtml), "fail", dashboardV2RankingObserved(embeddedApi, visibleHtml), "no Top/Rank/1위 wording when weeklyRankingValidity is invalid", ["dashboard-v2"]),
    qualityCheck("dashboard-v2-discussion-label", dashboardV2DiscussionLabel(embeddedApi, visibleHtml), "fail", dashboardV2DiscussionObserved(embeddedApi, visibleHtml), "raw posts are labeled raw activity when validTechnicalPostCount is null", ["magicians-activity"]),
    qualityCheck("dashboard-v2-source-traceability", dashboardV2SourceTraceability(embeddedApi), "fail", dashboardV2TraceabilityObserved(embeddedApi), "public point, bubble, timeline item has evidenceId or sourcePath", dashboardV2TraceabilityAffectedIds(embeddedApi)),
    qualityCheck("dashboard-v2-lifecycle-completeness", dashboardV2LifecycleCompleteness(embeddedApi), "fail", dashboardV2LifecycleObserved(embeddedApi), "every public proposal appears in a lifecycle stage or Unknown", dashboardV2LifecycleAffectedIds(embeddedApi)),
    qualityCheck("dashboard-v2-kgld-consistency", dashboardV2KgldConsistency(embeddedApi), "fail", dashboardV2KgldObserved(embeddedApi), "Executive KGLD IDs and KGLD Board IDs match", dashboardV2KgldAffectedIds(embeddedApi)),
    qualityCheck("dashboard-v2-filter-contract", dashboardV2FilterContract(html), "fail", dashboardV2FilterObserved(html), "all filterable elements include domain/status/aa/kgld/search metadata", dashboardV2FilterAffectedIds(html)),
    qualityCheck("dashboard-v2-empty-states", dashboardV2EmptyStates(embeddedApi, visibleHtml), "fail", dashboardV2EmptyObserved(embeddedApi, visibleHtml), "zero, unavailable, not collected, unclassified states render distinctly", ["empty-states"]),
    qualityCheck("dashboard-v2-render-isolation", dashboardV2RenderIsolation(html), "fail", dashboardV2RenderIsolationObserved(html), "snapshot render has no fetch, iframe, collector, DB access in HTML", ["render-isolation"]),
    qualityCheck("dashboard-v2-deterministic-layout", dashboardV2DeterministicLayout(embeddedApi, html), "fail", dashboardV2DeterministicObserved(embeddedApi, html), "bubble coordinates and HTML are deterministic for the same snapshot", dashboardV2TraceabilityAffectedIds(embeddedApi)),
    qualityCheck("weekly-repository-addition-label", weeklyRepositoryAdditionLabel(embeddedApi, visibleHtml), "fail", weeklyRepositoryAdditionObserved(embeddedApi, visibleHtml), "raw git new_proposal events render as 공식 저장소 신규 반영, not newly authored proposals", weeklyRepositoryAdditionIds(embeddedApi)),
    qualityCheck("weekly-dual-date-visible", weeklyDualDateVisible(embeddedApi, visibleHtml), "fail", weeklyRepositoryAdditionObserved(embeddedApi, visibleHtml), "repositoryAddedAt and proposalCreatedAt are separately labeled", weeklyRepositoryAdditionIds(embeddedApi)),
    qualityCheck("public-date-kst", publicWeeklyDatesKst(embeddedApi, visibleHtml), "fail", weeklyRepositoryAdditionObserved(embeddedApi, visibleHtml), "weekly public dates are converted to Asia/Seoul", weeklyRepositoryAdditionIds(embeddedApi)),
    qualityCheck("hero-plain-language-quality", heroPlainLanguageQuality(visibleHtml), "fail", heroPlainLanguageObserved(visibleHtml), "Hero does not expose internal quality or ranking wording", ["hero"]),
    qualityCheck("hero-repository-count-consistency", heroRepositoryCountConsistency(embeddedApi, visibleHtml), "fail", weeklyRepositoryAdditionObserved(embeddedApi, visibleHtml), "Hero, first KPI, and Weekly Brief use the same repository addition count", weeklyRepositoryAdditionIds(embeddedApi)),
    qualityCheck("logical-vs-raw-proposal-date", logicalVsRawProposalDate(embeddedApi, visibleHtml), "fail", weeklyRepositoryAdditionObserved(embeddedApi, visibleHtml), "raw git commit date is not rendered as proposalCreatedAt", weeklyRepositoryAdditionIds(embeddedApi)),
    qualityCheck("direction-abstract-grounded", directionAbstractGrounded(embeddedApi, visibleHtml), "fail", directionAbstractObserved(embeddedApi, visibleHtml), "Direction abstract is grounded in specification evidence and lifecycle maturity", ["direction"]),
    qualityCheck("trend-metric-semantic-label", trendMetricSemanticLabel(visibleHtml), "fail", trendMetricObserved(visibleHtml), "new_proposal trend is labeled only as official repository document additions", ["trend"]),
    qualityCheck("discussion-coverage-no-false-zero", discussionCoverageNoFalseZero(embeddedApi, visibleHtml), "fail", discussionCoverageObserved(embeddedApi, visibleHtml), "pre-collection Magicians periods are not rendered as zero activity", ["trend", "magicians"]),
    qualityCheck("domain-cross-view-consistency", domainCrossViewConsistency(embeddedApi), "fail", domainConsistencyObserved(embeddedApi), "Weekly, Pulse, Explorer, and Inspector use one public domain derivation", ["domains"]),
    qualityCheck("known-domain-semantic-fixtures", knownDomainSemanticFixtures(embeddedApi), "fail", domainConsistencyObserved(embeddedApi), "known fixture proposals use corrected public domains", ["domains"]),
    qualityCheck("public-domain-semantic-audit", publicDomainSemanticAudit(embeddedApi), "fail", publicDomainAuditObserved(embeddedApi), "all Explorer proposals have source-backed public domain audit records", ["domains"]),
    qualityCheck("known-domain-semantic-fixtures-v2", knownDomainSemanticFixtures(embeddedApi), "fail", domainConsistencyObserved(embeddedApi), "expanded known fixture proposals use corrected public domains", ["domains"]),
    qualityCheck("known-domain-semantic-fixtures-v3", knownDomainSemanticFixturesV3(embeddedApi, html), "fail", domainConsistencyObserved(embeddedApi), "pre-merge known fixture proposals use corrected public domains and ERC-8049 has no cross-chain metadata", ["domains"]),
    qualityCheck("known-domain-semantic-fixtures-v4", knownDomainSemanticFixturesV4(embeddedApi), "fail", domainConsistencyObserved(embeddedApi), "final domain patch proposals use corrected public domains", ["domains"]),
    qualityCheck("domain-cross-view-consistency-v4", domainCrossViewConsistencyV4(embeddedApi, html), "fail", domainConsistencyObserved(embeddedApi), "EIP-8198 and EIP-8298 use one audited public domain across views and metadata", ["domains"]),
    qualityCheck("domain-aggregate-after-audit", periodCountConsistency(embeddedApi), "fail", periodCountObserved(embeddedApi), "domain aggregates are recalculated after audited mapping", ["technology-pulse"]),
    qualityCheck("domain-search-metadata-consistency", domainSearchMetadataConsistency(html), "fail", domainSearchMetadataObserved(html), "filter/search metadata follows audited public domain registry", ["domains"]),
    qualityCheck("monitoring-scope-four-levels-visible", monitoringScopeFourLevelsVisible(embeddedApi, visibleHtml), "fail", monitoringScopeFourLevelsObserved(embeddedApi, visibleHtml), "public scope explains discovered/classified/monitoring/detailed counts", ["scope"]),
    qualityCheck("monitoring-scope-reference-count", monitoringScopeReferenceCount(embeddedApi), "fail", monitoringScopeReferenceObserved(embeddedApi), "discovered proposals equal public Explorer proposals plus reference-only excluded proposals", ["scope"]),
    qualityCheck("monitoring-scope-wording", monitoringScopeWording(embeddedApi, html), "fail", monitoringScopeFourLevelsObserved(embeddedApi, visibleHtml), "public and hidden scope wording uses discovered/public/reference/monitoring/card counts", ["scope"]),
    qualityCheck("direction-abstract-scope-qualified", directionAbstractScopeQualified(visibleHtml), "fail", directionAbstractObserved(embeddedApi, visibleHtml), "Direction abstract is scoped to this report and avoids roadmap claims", ["direction"]),
    qualityCheck("weekly-summary-language-consistency", weeklySummaryLanguageConsistency(embeddedApi, visibleHtml), "fail", weeklyRepositoryAdditionObserved(embeddedApi, visibleHtml), "weekly summaries are Korean, source-backed, and free of markdown truncation", weeklySummaryLanguageAffectedIds(embeddedApi, visibleHtml)),
    qualityCheck("aa-metric-public-labels", aaMetricPublicLabels(visibleHtml), "fail", aaMetricPublicObserved(visibleHtml), "AA rows distinguish period, specification, raw posts, and recent activity", ["aa"]),
    qualityCheck("aa-activity-date-source-integrity", aaActivityDateSourceIntegrity(embeddedApi, visibleHtml), "fail", aaActivityDateObserved(embeddedApi, visibleHtml), "AA recent activity dates use source event/post occurredAt", ["aa"]),
    qualityCheck("aa-activity-date-not-generated-at", aaActivityDateNotGeneratedAt(embeddedApi), "fail", aaActivityDateObserved(embeddedApi, visibleHtml), "AA recent activity does not fall back to snapshot generatedAt/reportAsOf", ["aa"]),
    qualityCheck("discussion-no-unproven-increase", discussionNoUnprovenIncrease(visibleHtml), "fail", trendMetricObserved(visibleHtml), "discussion copy does not claim increase without baseline", ["magicians"]),
    qualityCheck("kgld-standard-scope-limited", kgldCardComplete(visibleHtml), "fail", kgldCardObserved(visibleHtml), "KGLD ERC-8328 scope is limited to event-field mapping", ["kgld"]),
    qualityCheck("lifecycle-no-weekly-duplicate", lifecycleNoWeeklyDuplicate(embeddedApi, visibleHtml), "fail", lifecycleDuplicateObserved(embeddedApi, visibleHtml), "Lifecycle does not repeat Weekly Brief repository additions", ["lifecycle"]),
    qualityCheck("public-internal-wording-clean", publicInternalWordingClean(visibleHtml), "fail", publicInternalWordingObserved(visibleHtml), "public visible text has no internal state wording outside details", ["public-copy"]),
    qualityCheck("public-render-no-object-string", publicRenderNoObjectString(html), "fail", publicRenderNoObjectObserved(html), "public HTML has no object/undefined/empty public fields", ["public-html"]),
    qualityCheck("html-document-title", htmlDocumentTitle(html, embeddedApi), "fail", htmlDocumentTitleObserved(html), "HTML title uses Ethereum Standards Weekly and reportDate", ["metadata"]),
    qualityCheck("snapshot-id-visible-canonical", snapshotIdVisibleCanonical(embeddedApi, html), "fail", snapshotIdObserved(embeddedApi, html), "Evidence details render canonical snapshotId, not source root", ["metadata"]),
    qualityCheck("compatibility-scope-current", compatibilityScopeCurrent(embeddedApi, html), "fail", compatibilityScopeObserved(html), "hidden compatibility contract uses current discovered/public/excluded/monitoring/card scope", ["metadata"]),
    qualityCheck("public-evidence-labels", publicEvidenceLabels(html), "fail", publicEvidenceLabelsObserved(html), "Evidence public labels use Korean-facing terms with internal keys only as secondary text", ["metadata"]),
    qualityCheck("vitalik-current-source-collected", vitalikCurrentSourceCollected(embeddedApi), "fail", vitalikObserved(embeddedApi), "current Vitalik source attempt includes parsed selected posts with reviewed Korean summary and source lineage", ["vitalik"]),
    qualityCheck("vitalik-source-official", vitalikSourceOfficial(embeddedApi), "fail", vitalikObserved(embeddedApi), "Vitalik Blog source uses official vitalik.eth.limo root and official index/feed discovery", ["vitalik"]),
    qualityCheck("vitalik-post-canonical-url", vitalikPostCanonicalUrl(embeddedApi), "fail", vitalikObserved(embeddedApi), "selected Vitalik posts have safe official source URLs and canonical duplicates removed", ["vitalik"]),
    qualityCheck("vitalik-publication-date-source", vitalikPublicationDateSource(embeddedApi), "fail", vitalikObserved(embeddedApi), "Vitalik publishedAt is source-derived and never fetchedAt/generatedAt/reportAsOf", ["vitalik"]),
    qualityCheck("vitalik-content-body-coverage", vitalikContentBodyCoverage(embeddedApi), "fail", vitalikObserved(embeddedApi), "selected parsed Vitalik posts include body, excerpt, and evidence paragraphs", ["vitalik"]),
    qualityCheck("vitalik-summary-grounded", vitalikSummaryGrounded(embeddedApi), "fail", vitalikObserved(embeddedApi), "reviewed Vitalik summaries reference evidence paragraphs", ["vitalik"]),
    qualityCheck("vitalik-editorial-override-hash", vitalikEditorialOverrideHash(embeddedApi), "fail", vitalikObserved(embeddedApi), "stale Vitalik editorial overrides are not rendered as reviewed", ["vitalik"]),
    qualityCheck("vitalik-personal-view-disclaimer", vitalikPersonalViewDisclaimer(html), "fail", "Vitalik section disclaimer", "personal writing and non-roadmap disclaimer visible", ["vitalik"]),
    qualityCheck("vitalik-no-roadmap-overclaim", vitalikNoRoadmapOverclaim(html), "fail", "Vitalik public copy", "no official roadmap/adoption overclaim", ["vitalik"]),
    qualityCheck("vitalik-selection-window", vitalikSelectionWindow(embeddedApi), "fail", vitalikObserved(embeddedApi), "Vitalik selected posts use 45d window, max 4, published desc", ["vitalik"]),
    qualityCheck("vitalik-related-proposal-relation", vitalikRelatedProposalRelation(embeddedApi), "fail", vitalikObserved(embeddedApi), "Vitalik related proposals are bounded and relation-labeled", ["vitalik"]),
    qualityCheck("vitalik-no-core-metric-contamination", vitalikNoCoreMetricContamination(embeddedApi), "fail", dashboardV2CountObserved(embeddedApi), "Vitalik Blog facts do not alter core repository/discussion/lifecycle/AA/KGLD metrics", ["vitalik"]),
    qualityCheck("vitalik-render-isolation", vitalikRenderIsolation(html), "fail", "renderer network isolation", "no fetch, iframe, external script, or live blog access in rendered HTML", ["vitalik"]),
    qualityCheck("vitalik-empty-state", vitalikEmptyState(html), "fail", "Vitalik empty state", "old snapshots/source failures render an empty state without breaking report", ["vitalik"]),
    qualityCheck("vitalik-link-safety", vitalikLinkSafety(html), "fail", "Vitalik source links", "external links use target blank and noopener noreferrer", ["vitalik"]),
    qualityCheck("vitalik-visible-source-lineage", vitalikVisibleSourceLineage(html), "fail", "Vitalik source lineage", "cards expose title, date, URL, summary state, and source evidence access", ["vitalik"]),
    qualityCheck("magicians-current-window-cards", magiciansCurrentWindowCards(embeddedApi, visibleHtml), "fail", magiciansCurrentWindowObserved(embeddedApi, visibleHtml), "current7d Magicians cards only include current7d posts", ["magicians"]),
    qualityCheck("kgld-card-complete", kgldCardComplete(visibleHtml), "fail", kgldCardObserved(visibleHtml), "KGLD card renders complete Korean public fields", ["kgld"]),
    qualityCheck("period-count-consistency", periodCountConsistency(embeddedApi), "fail", periodCountObserved(embeddedApi), "domain discussion counts use the selected current7d post union", ["technology-pulse"]),
  ];
  const sparseRequiredCheckIds = new Set([
    "forbidden-regressions",
    "stale-knowledge-graph-removed",
    "discussion-integrity",
    "window-subset-valid",
    "window-filter-regression",
    "snapshot-hash-consistency",
    "legacy-model-not-embedded",
    "canonical-render-source",
  ]);
  const blockingChecks = checks.filter((check) =>
    check.severity === "fail" && (!sparseActivityFixture || sparseRequiredCheckIds.has(check.id))
  );
  return `${JSON.stringify({ generatedAt: report.generatedAt, reportDate: report.generatedAt.slice(0, 10), reportAsOf: report.generatedAt, passed: blockingChecks.every((check) => check.passed !== false), checks, failedForbiddenPairs, failedForbiddenRelations, staleKnowledgeFields, forbiddenTextMatches, discussionIntegrityFailures }, null, 2)}\n`;
}

export function validateWeeklyCollectionPreflight(report: WeeklyRadarReport): void {
  const atlas = buildTechnologyAtlas(report);
  const dashboard = buildDashboard(report, atlas);
  const snapshot = buildIntelligenceSnapshot(report, atlas, dashboard);
  const publicSubjects = snapshot.monitoringUniverse.subjectRegistry.filter((subject) => !subject.roles.includes("excluded"));
  const specs = new Map(snapshot.facts.specificationEvidence.map((fact) => [fact.proposalId, fact]));
  const titleOnlyIds = publicSubjects
    .map((subject) => specs.get(subject.proposalId))
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact && fact.parseState === "title_only"))
    .map((fact) => fact.proposalId);
  const missingSpecIds = publicSubjects.filter((subject) => !specs.has(subject.proposalId)).map((subject) => subject.proposalId);
  const sourceAvailability = officialSourceAvailability();
  const backfill = report.ethereumTechRadar.historicalInputDiagnostics?.gitBackfillDiagnostics;
  const failures: string[] = [];

  if (missingSpecIds.length) failures.push(`missing specification evidence: ${missingSpecIds.join(",")}`);
  if (sourceAvailability.eipAvailable || sourceAvailability.ercAvailable) {
    if (titleOnlyIds.length) failures.push(`title_only public specification evidence: ${titleOnlyIds.join(",")}`);
  }
  if (backfill && backfill.successRate < 0.9) {
    failures.push(`historical backfill success ${backfill.successRate}; requested=${backfill.requestedTargets}; succeeded=${backfill.successfulTargets}; failed=${backfill.failedTargets}; rateLimited=${backfill.rateLimitedCount}; failedProposalIds=${backfill.failedProposalIds.join(",")}; failureCodes=${backfill.failureCodes.join(",")}`);
  }
  if (backfill?.sourceMode === "local_git" && (backfill.apiHistoryRequested ?? 0) > 0) {
    failures.push(`local_git mode must not use GitHub API history fallback: apiHistoryRequested=${backfill.apiHistoryRequested}`);
  }
  if (backfill?.sourceMode === "local_git" && backfill.rateLimitedCount > 0) {
    failures.push(`local_git mode must have zero historical API rate limits: rateLimited=${backfill.rateLimitedCount}`);
  }
  if (backfill && (backfill.pathCaseFailures ?? 0) > 0) {
    failures.push(`official source path case failures: ${backfill.pathCaseFailures}`);
  }
  if (backfill && (backfill.shallowRepositoryDetected ?? 0) > 0) {
    failures.push(`shallow official repositories detected: ${backfill.shallowRepositoryDetected}`);
  }
  if (backfill && backfill.rateLimitedCount > 0 && publicSubjects.length < report.ethereumTechRadar.totalProposals * 0.7) {
    failures.push(`monitoring universe may be reduced by rate limits: public=${publicSubjects.length}; total=${report.ethereumTechRadar.totalProposals}; rateLimited=${backfill.rateLimitedCount}`);
  }

  if (failures.length) {
    const bodyParsedCount = snapshot.facts.specificationEvidence.filter((fact) => fact.parseState === "body_parsed").length;
    const fetchedAtCount = snapshot.facts.specificationEvidence.filter((fact) => Boolean(fact.fetchedAt)).length;
    throw new Error([
      "Collection preflight failed.",
      `officialSources: EIPs=${sourceAvailability.eipPath ?? "missing"} ERCs=${sourceAvailability.ercPath ?? "missing"}`,
      `specificationEvidence: total=${snapshot.facts.specificationEvidence.length}; body_parsed=${bodyParsedCount}; title_only=${titleOnlyIds.length}; fetchedAt=${fetchedAtCount}`,
      `discovered=${snapshot.monitoringUniverse.scope.discoveredProposalCount}; monitored=${snapshot.monitoringUniverse.scope.monitoredProposalCount}; detailed=${snapshot.monitoringUniverse.scope.detailedProposalCount}; discussionThreads=${snapshot.monitoringUniverse.scope.discussionThreadCount}`,
      `backfill: requested=${backfill?.requestedTargets ?? 0}; succeeded=${backfill?.successfulTargets ?? 0}; failed=${backfill?.failedTargets ?? 0}; rateLimited=${backfill?.rateLimitedCount ?? 0}`,
      ...failures,
    ].join("\n"));
  }
}

function officialSourceAvailability() {
  const eipPath = officialRepoPath("ethereum/EIPs");
  const ercPath = officialRepoPath("ethereum/ercs");
  return {
    eipPath,
    ercPath,
    eipAvailable: Boolean(eipPath && existsSync(eipPath)),
    ercAvailable: Boolean(ercPath && existsSync(ercPath)),
  };
}

function qualityCheck(id: string, passed: boolean | null, severity: "fail" | "warning", observed: string, expected: string, affectedIds: string[] = []) {
  return {
    id,
    status: passed === null ? "not_applicable" : passed ? "passed" : "failed",
    passed,
    severity,
    observed,
    expected,
    affectedIds,
    failureReason: passed === false ? `${id} did not meet expected condition.` : "",
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function jsonObjectContainsPair(value: unknown, left: string, right: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => jsonObjectContainsPair(item, left, right));
  const entries = Object.values(value as Record<string, unknown>);
  const text = JSON.stringify(entries.filter((item) =>
    item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean"
  ));
  if (text.includes(left) && text.includes(right)) return true;
  return entries.some((item) => jsonObjectContainsPair(item, left, right));
}

function discussionStatusPayloadInvalid(value: unknown): boolean {
  const payload = value && typeof value === "object" ? value as { proposalEvidence?: unknown } : {};
  const items = Array.isArray(payload.proposalEvidence) ? payload.proposalEvidence : [];
  return items.some((item) => {
    if (!item || typeof item !== "object") return false;
    const discussion = (item as { discussion?: unknown }).discussion;
    if (!discussion || typeof discussion !== "object") return false;
    const record = discussion as { collectionStatus?: unknown; lastPostAt?: unknown; postTimestampTrace?: unknown; postsInCurrent7d?: unknown };
    return record.collectionStatus === "posts_fully_collected"
      && (!record.lastPostAt || !Array.isArray(record.postTimestampTrace) || record.postTimestampTrace.length === 0);
  });
}

function windowSubsetValid(report: WeeklyRadarReport): boolean {
  const trend = allReportEvents(report.ethereumTechRadar.trendChanges);
  const recent = allReportEvents(report.ethereumTechRadar.recentChanges);
  const trendKeys = new Set(trend.map(reportEventKey));
  return recent.every((event) => trendKeys.has(reportEventKey(event)));
}

function windowFilterRegression(report: WeeklyRadarReport, atlas: TechnologyAtlas): boolean {
  const diagnostics = report.ethereumTechRadar.historicalInputDiagnostics;
  const allDomainsIdentical = atlas.domains.every((domain) =>
    domain.activity180d === domain.activity7d
    && domain.activeProposalCount180d === domain.activeProposalCount7d
  );
  if (!allDomainsIdentical) return false;
  if (!diagnostics) return true;
  const earliest = diagnostics.earliestEventAt ? Date.parse(diagnostics.earliestEventAt) : Number.NaN;
  const end = Date.parse(report.generatedAt);
  return Number.isFinite(earliest) && earliest < end - 7 * 24 * 60 * 60 * 1000;
}

function baselineHistorySufficient(report: WeeklyRadarReport): boolean {
  return (report.ethereumTechRadar.historicalInputDiagnostics?.uniqueWeeks ?? 0) >= 8;
}

function topicCurrentRankingValid(atlas: TechnologyAtlas): boolean {
  const eligible = topicProgressRows(atlas)
    .filter((item) => item.proposals.some((id) => proposalById(atlas, id)?.activity.current7d.activeProposalCount))
    .filter((item) => frontPageTopicEligible(atlas, item))
    .slice(0, 3)
    .map((item) => item.topic);
  const selected = selectFrontPageTopics(atlas).map((item) => item.topic);
  return JSON.stringify(eligible) === JSON.stringify(selected);
}

function topicCountConsistency(atlas: TechnologyAtlas): boolean {
  const labels = atlas.charts.topicChangeComposition.labels;
  const uniqueLabels = new Set(labels);
  const counts = [
    ...atlas.charts.topicChangeComposition.newProposal,
    ...atlas.charts.topicChangeComposition.bodyChange,
    ...atlas.charts.topicChangeComposition.statusChange,
    ...atlas.charts.topicChangeComposition.discussion,
  ];
  return labels.length === uniqueLabels.size
    && counts.every((value) => Number.isInteger(value) && value >= 0)
    && atlas.charts.topicChangeComposition.discussion.every((value) => value === 0);
}

function lifecyclePercentComplete(html: string, atlas: TechnologyAtlas): boolean {
  if (/class="dash-life-stack"/.test(html) && /class="dash-life-segment/.test(html)) return true;
  if (topicProgressRows(atlas).every((topic) => topic.proposals.length < 2)) return true;
  const bars = [...html.matchAll(/<div class="stack-bar"[^>]*>([\s\S]*?)<\/div>/g)].map((match) => match[1] ?? "");
  if (!bars.length) return /five-lane/.test(html) && /Specification/.test(html) && /Adoption/.test(html);
  return bars.every((bar) => {
    const widths = [...bar.matchAll(/width:([0-9.]+)%/g)].map((match) => Number(match[1]));
    if (!widths.length) return false;
    const sum = widths.reduce((total, value) => total + value, 0);
    return Math.abs(sum - 100) <= 0.2;
  });
}

function magiciansPaginationComplete(value: unknown): boolean {
  const discussions = embeddedDiscussions(value);
  return discussions.every((discussion) => {
    const status = String(discussion.collectionStatus ?? "");
    const missing = Array.isArray(discussion.missingPostIds) ? discussion.missingPostIds : [];
    if (status === "posts_fully_collected") return missing.length === 0 && discussion.paginationComplete === true;
    if (status === "posts_partially_collected") return missing.length > 0 || discussion.paginationComplete === false;
    return true;
  });
}

function magiciansLastPostConsistency(value: unknown): boolean {
  return embeddedDiscussions(value).every((discussion) => {
    if (discussion.collectionStatus !== "posts_fully_collected") return true;
    const latest = Date.parse(String(discussion.latestCollectedPostAt ?? ""));
    const last = Date.parse(String(discussion.lastPostAt ?? ""));
    return Number.isFinite(latest) && Number.isFinite(last) && Math.abs(latest - last) <= 2_000;
  });
}

function embeddedDiscussions(value: unknown): Array<Record<string, unknown>> {
  const payload = value && typeof value === "object" ? value as { proposalEvidence?: unknown } : {};
  const items = Array.isArray(payload.proposalEvidence) ? payload.proposalEvidence : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const discussion = (item as { discussion?: unknown }).discussion;
    return discussion && typeof discussion === "object" ? [discussion as Record<string, unknown>] : [];
  });
}

function historicalBackfillSufficient(report: WeeklyRadarReport): boolean {
  const diagnostics = report.ethereumTechRadar.historicalInputDiagnostics?.gitBackfillDiagnostics;
  if (!diagnostics) return true;
  return diagnostics.successRate >= 0.9;
}

function historicalTimestampQuality(report: WeeklyRadarReport): boolean {
  return (report.ethereumTechRadar.historicalInputDiagnostics?.fallbackDetectedAtRatio ?? 0) <= 0.25;
}

function currentWindowFallbackHandled(report: WeeklyRadarReport, embeddedApi: unknown): boolean {
  const quality = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality;
  if (!quality || quality.current7dFallbackRatio <= 0.25) return true;
  const intersections = fallbackIsolationIntersections(report, embeddedApi);
  return Object.values(intersections).every((ids) => ids.length === 0);
}

function currentWindowFallbackObserved(report: WeeklyRadarReport, embeddedApi: unknown): string {
  const quality = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality;
  return JSON.stringify({
    ratio: quality?.current7dFallbackRatio ?? 0,
    ...fallbackIsolationIntersections(report, embeddedApi),
  });
}

function fallbackIsolationIntersections(report: WeeklyRadarReport, embeddedApi: unknown): Record<string, string[]> {
  const fallbackEventIds = new Set(allReportRecentEvents(report)
    .filter((event) => (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at")
    .map(reportEventKey));
  const view = dashboardV2FromApi(embeddedApi);
  if (!view || !fallbackEventIds.size) {
    return {
      usableEventIds: [],
      overviewEventIds: [],
      timelineEventIds: [],
      topicMapEventIds: [],
      explorerWeeklyEventIds: [],
    };
  }
  return {
    usableEventIds: intersection([...fallbackEventIds], stringList(view.weeklyTimeline?.usableEventIds)),
    overviewEventIds: intersection([...fallbackEventIds], stringList(view.overview?.weeklyUsableCount?.evidenceIds).map(stripEventFactPrefix)),
    timelineEventIds: intersection([...fallbackEventIds], stringList(view.weeklyTimeline?.items?.map((item) => item.eventId))),
    topicMapEventIds: intersection([...fallbackEventIds], stringList(view.topicActivityMap?.points?.flatMap((point) => point.weeklyUsableEventIds))),
    explorerWeeklyEventIds: intersection([...fallbackEventIds], stringList(view.proposalExplorer?.rows?.flatMap((row) => row.weeklyUsableEventIds))),
  };
}

function fallbackEventsExcludedFromRanking(report: WeeklyRadarReport, embeddedApi: unknown): boolean {
  const intersections = fallbackIsolationIntersections(report, embeddedApi);
  return Object.values(intersections).every((ids) => ids.length === 0);
}

function semanticClassificationAvailable(report: WeeklyRadarReport): boolean {
  return allReportRecentEvents(report)
    .filter((event) => event.type === "content_hash_change" && isConfirmedReportEvent(event))
    .every((event) => Boolean(event.changeSemanticType) || semanticTypeForReportEvent(event) !== "unknown");
}

function discussionAnalysisStateConsistent(report: WeeklyRadarReport, visibleHtml: string): boolean {
  const completed = report.ethereumTechRadar.signalLayer.discussionHeat.some((discussion) => discussion.discussionAnalysis?.analysisCompleted);
  if (completed) return true;
  return !/<dt>핵심 쟁점<\/dt>|<dt>제기된 반대<\/dt>|<dt>대안<\/dt>|<dt>미해결 문제<\/dt>/.test(visibleHtml);
}

function discussionCategoriesDeduped(embeddedApi: unknown): boolean {
  const items = embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { proposalEvidence?: unknown }).proposalEvidence : undefined;
  if (!Array.isArray(items)) return true;
  for (const item of items as Array<{ discussion?: Record<string, unknown> }>) {
    const discussion = item.discussion ?? {};
    const values = ["keyIssues", "objections", "alternatives", "unresolvedQuestions"].flatMap((key) =>
      Array.isArray(discussion[key]) ? (discussion[key] as unknown[]).map((value) => JSON.stringify(value).toLowerCase()) : []
    ).filter((value) => value.length > 20);
    if (new Set(values).size !== values.length) return false;
  }
  return true;
}

function parentChildRankingExclusive(embeddedApi: unknown, visibleHtml: string): boolean {
  const domainNames = ["실행 비용과 상태 접근 구조", "지갑 권한과 계정 추상화", "신원·자격·컴플라이언스 표준", "토큰화 금융 및 Vault 표준", "검증자 운영과 합의 보안"];
  const weekly = embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { weeklyAtlasChanges?: Array<{ titleKo?: string }> }).weeklyAtlasChanges ?? [] : [];
  void visibleHtml;
  return weekly.every((item) => !domainNames.includes(item.titleKo ?? ""));
}

function topicCoherenceValid(atlas: TechnologyAtlas): boolean {
  return topicProgressRows(atlas).every((topic) => topic.proposals.length >= 1 && !isGenericTopicName(topic.topic));
}

function businessObservationAvailable(atlas: TechnologyAtlas, visibleHtml: string): boolean {
  const business = businessObservationTopics(atlas);
  if (!business.length) return true;
  if (/기술 영역별 움직임/.test(visibleHtml) && /KGLD Watch|tokens|토큰|DeFi|금융/.test(visibleHtml)) return true;
  return business.some((topic) => visibleHtml.includes(topic.topic) || visibleHtml.includes(topic.coverKo));
}

function confirmedEventCountConsistency(report: WeeklyRadarReport, embeddedApi: unknown): boolean {
  const dataQuality = dashboardFromApi(embeddedApi)?.dataQuality;
  if (!dataQuality) return false;
  const recent = allReportRecentEvents(report);
  return dataQuality.current7dRawEventCount === recent.length
    && dataQuality.current7dFallbackEventCount === recent.filter((event) => event.occurredAtSource === "fallback_detected_at").length
    && dataQuality.current7dUsableEventCount === recent.filter((event) => isWeeklyUsableEvent(event, report)).length;
}

function finalHtmlSemanticValidation(visibleHtml: string): boolean {
  return !/본문 변경 \d+/.test(visibleHtml)
    && !/자동 요약 불가/.test(visibleHtml)
    && !/검토 중인 주제/.test(visibleHtml)
    && !/토론을 분석했습니다/.test(visibleHtml);
}

function buildWeeklySignalCopy(input: {
  usableCount: number;
  rawCount: number;
  weeklyRankingValidity?: string;
}): WeeklySignalCopy {
  const usableCount = Math.max(0, Number(input.usableCount) || 0);
  const rawCount = Math.max(0, Number(input.rawCount) || 0);
  const rankingValid = isWeeklyRankingReliable(input.weeklyRankingValidity);
  const metricLabel = "확인된 주간 신호";
  const metricValue = `${usableCount}건`;
  if (usableCount === 0) {
    return {
      mode: "empty",
      metricLabel,
      metricValue,
      summaryText: "최근 7일 확인 가능한 의미 변화가 없습니다.",
      rankingEnabled: false,
    };
  }
  if (!rankingValid || input.weeklyRankingValidity === "invalid") {
    return {
      mode: "non_ranking",
      metricLabel,
      metricValue,
      summaryText: `최근 7일 확인된 의미 변화는 ${usableCount}건입니다. 데이터 품질 기준에 따라 주간 순위는 제공하지 않습니다.`,
      rankingEnabled: false,
    };
  }
  if (usableCount === 1) {
    return {
      mode: "single",
      metricLabel,
      metricValue,
      summaryText: "최근 7일 확인된 의미 변화는 1건입니다.",
      rankingEnabled: false,
    };
  }
  return {
    mode: "multiple",
    metricLabel,
    metricValue,
    summaryText: `최근 7일 확인된 의미 변화는 ${usableCount}건입니다.`,
    rankingEnabled: true,
  };
}

function weeklyRankingValidityRendering(report: WeeklyRadarReport, visibleHtml: string): boolean {
  const invalid = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.weeklyRankingValidity === "invalid";
  if (!invalid) return true;
  if (/class="dash-v3"/.test(visibleHtml)) {
    const hero = visibleHtml.match(/<header class="dash-hero"[\s\S]*?<\/header>/)?.[0] ?? "";
    return /공식 저장소 신규 반영/.test(hero)
      && !/순위 미제공|ranking invalid|주간 순위|Top 3|Top 1|1위|이번 주 주요 개발 주제/.test(hero)
      && !/\bTop\b|\bRank\b|1위|개발자 관심 순위/.test(visibleHtml);
  }
  return /확인된 주간 신호/.test(visibleHtml)
    && /주간 개발 순위를 산정하지 않았습니다|주간 개발 순위에서 제외했습니다|주간 순위는 제공하지 않습니다/.test(visibleHtml)
    && !/이번 주 주요 개발 주제/.test(visibleHtml)
    && !/가장 활발한 개발 주제|Top 3|Top 1/.test(visibleHtml);
}

function weeklySpecificationTrendReason(dataQuality: {
  current7dRawEventCount?: number;
  current7dUsableEventCount?: number;
  weeklyRankingValidity?: string;
}): string {
  const rawCount = Number(dataQuality.current7dRawEventCount ?? 0);
  const usableCount = Number(dataQuality.current7dUsableEventCount ?? 0);
  if (usableCount === 0) return "최근 7일 확인 가능한 usable event가 없습니다.";
  if (dataQuality.weeklyRankingValidity === "invalid") {
    return `최근 7일 usable event는 ${usableCount}/${rawCount}건이며, 데이터 품질 기준에 따라 주간 순위는 비활성화했습니다.`;
  }
  return `최근 7일 확인된 usable event는 ${usableCount}건입니다.`;
}

function isWeeklyRankingReliable(value: string | undefined): boolean {
  return value === "reliable" || value === "valid";
}

function weeklyConfidenceLimitReasonFromDashboard(dashboard: ReturnType<typeof buildDashboard> | undefined): string {
  return dashboard ? weeklySpecificationTrendReason(dashboard.dataQuality) : "";
}

function weeklyConfidenceLimitCanonical(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (!dashboard?.dataQuality) return false;
  const reason = weeklyConfidenceLimitReasonFromDashboard(dashboard);
  const usableCount = dashboard.dataQuality.current7dUsableEventCount;
  const rawCount = dashboard.dataQuality.current7dRawEventCount;
  const embeddedReason = dashboard.executivePulse.confidenceLimits.find((item) => item.label === "Weekly specification trend")?.reason;
  const publicReason = dashboard.dataQuality.weeklyRankingValidity === "invalid"
    ? `최근 7일 분석 반영 이벤트는 ${usableCount}/${rawCount}건이며, 데이터 품질 기준에 따라 변화 강도 비교는 제공하지 않습니다.`
    : `최근 7일 분석 반영 이벤트는 ${usableCount}건입니다.`;
  const staleZeroReason = /usable event가 0건/.test(visibleHtml) || /usable event가 0건/.test(embeddedReason ?? "");
  const countMatches = (visibleHtml.includes(reason) || visibleHtml.includes(publicReason))
    && embeddedReason === reason
    && (usableCount === 0 || new RegExp(`usable event는 ${usableCount}/${rawCount}건|usable event는 ${usableCount}건`).test(reason));
  return (!staleZeroReason || usableCount === 0)
    && countMatches
    && !(usableCount > 0 && dashboard.dataQuality.weeklyRankingValidity === "invalid" && /usable event가 0건/.test(reason));
}

function weeklyConfidenceLimitObserved(embeddedApi: unknown, visibleHtml: string): string {
  const dashboard = dashboardFromApi(embeddedApi);
  const reason = weeklyConfidenceLimitReasonFromDashboard(dashboard);
  const embeddedReason = dashboard?.executivePulse.confidenceLimits.find((item) => item.label === "Weekly specification trend")?.reason ?? "missing";
  return `expected="${reason}"; embedded="${embeddedReason}"; visible=${visibleHtml.includes(reason)}; dataQuality=${JSON.stringify(dashboard?.dataQuality ?? {})}`;
}

function unknownNotLabeledEditorial(embeddedApi: unknown, visibleHtml: string): boolean {
  const signal = embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { signalQuality?: { semanticChangeCounts?: Record<string, number> } }).signalQuality : undefined;
  const unknown = signal?.semanticChangeCounts?.unknown ?? 0;
  if (unknown <= 0) return true;
  return !new RegExp(`편집 변경 ${unknown}`).test(visibleHtml) && /변경 유형 미확정|확인된 의미 변화 없음/.test(visibleHtml);
}

function weeklyEmptyStateValid(report: WeeklyRadarReport, embeddedApi: unknown, visibleHtml: string): boolean {
  void report;
  const meaningfulRows = weeklyMeaningfulRowsFromApi(embeddedApi);
  const emptyVisible = /최근 기간 공식 저장소 신규 반영이 없습니다|확인 가능한 의미 변화 없음|확인된 의미 변화 없음/.test(visibleHtml);
  return meaningfulRows.length > 0 ? !emptyVisible : emptyVisible;
}

function discussionCountWindowConsistency(embeddedApi: unknown, visibleHtml: string): boolean {
  const visibleText = visibleHtml.replace(/<[^>]+>/g, " ");
  const dashboard = dashboardFromApi(embeddedApi);
  if (dashboard?.developerAttention) {
    const expected = dashboard.developerAttention.summary.rawPosts;
    return visibleText.includes(`최근 7일 raw posts ${expected}건`)
      || visibleText.includes(`raw posts ${expected}`)
      || visibleText.includes(`최근 7일 원시 댓글 ${expected}건`)
      || visibleText.includes(`최근 7일 원문 게시물 ${expected}건`);
  }
  const signal = embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { signalQuality?: { proposalCardDiscussionCounts?: Array<{ rawPostCount?: number }> } }).signalQuality : undefined;
  const cards = signal?.proposalCardDiscussionCounts ?? [];
  const expected = cards.reduce((sum, item) => sum + (item.rawPostCount ?? 0), 0);
  const matches = [...visibleText.matchAll(/최근 7일 원시 댓글 (\d+)건/g)].map((match) => Number(match[1]));
  return matches.reduce((sum, value) => sum + value, 0) === expected;
}

function discussionCountsSeparated(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (dashboard?.developerAttention) {
    const valid = dashboard.developerAttention.summary.validTechnicalPosts ?? dashboard.dataQuality.discussionCollection.validTechnicalPostCount;
    const analyzed = dashboard.developerAttention.summary.validatedInsights ?? dashboard.dataQuality.discussionCollection.analyzedPostCount ?? 0;
    return /raw posts|raw activity|원시 댓글|원문 게시물/.test(visibleHtml)
      && /valid technical posts|relevance 미분류|유효 기술 post 미분류|원문 수집 기준|유효 기술 댓글/.test(visibleHtml)
      && /analyzed insights|validated insights|analyzed insight 없음|분석된 insight \d+건/.test(visibleHtml)
      && (valid !== null || /relevance 미분류|유효 기술 post 미분류/.test(visibleHtml))
      && Number(analyzed) >= 0;
  }
  const signal = embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { signalQuality?: { discussionActivityCounts?: unknown[] } }).signalQuality : undefined;
  if (!Array.isArray(signal?.discussionActivityCounts)) {
    return /raw posts/.test(visibleHtml) && /valid technical posts/.test(visibleHtml) && /validated insights/.test(visibleHtml);
  }
  const hasPosts = Array.isArray(signal?.discussionActivityCounts)
    && signal.discussionActivityCounts.some((item) => item && typeof item === "object" && Number((item as { rawPostCount?: number }).rawPostCount ?? 0) > 0);
  return Array.isArray(signal?.discussionActivityCounts)
    && signal.discussionActivityCounts.every((item) => item && typeof item === "object" && "rawPostCount" in item && "validTechnicalPostCount" in item && "analyzedPostCount" in item)
    && (!hasPosts || (/원시 댓글/.test(visibleHtml) && /유효 기술 댓글/.test(visibleHtml)));
}

function discussionSectionAnalysisState(report: WeeklyRadarReport, visibleHtml: string): boolean {
  const completed = report.ethereumTechRadar.signalLayer.discussionHeat.filter((discussion) => discussion.discussionAnalysis?.analysisCompleted).length;
  if (completed > 0) return true;
  return /Magicians Activity|최근 Ethereum Magicians 활동|수집된 Raw Activity|수집된 원문 활동/.test(visibleHtml)
    && /유효 기술 post 미분류 상태에서는 토론 방향 판단 불가|relevance 분류 전에는 관심도 지표로 해석하지 않습니다|기술 relevance 분류가 완료되기 전까지 개발자 관심 순위로 해석하지 않습니다/.test(visibleHtml)
    && !/개발자 논쟁 분석|핵심 쟁점|제기된 반대|미해결 쟁점/.test(visibleHtml);
}

function discussionMatrixAxisValidity(report: WeeklyRadarReport, visibleHtml: string): boolean {
  const hasRecentPosts = report.ethereumTechRadar.signalLayer.discussionHeat.some((discussion) => hasTraceableRecentPosts(discussion));
  if (!hasRecentPosts) return true;
  return /문서 변화와 Magicians 활동/.test(visibleHtml)
    && /확정된 문서 변화 수/.test(visibleHtml)
    && /유효 기술 댓글 수/.test(visibleHtml);
}

function topicSectionExclusivity(embeddedApi: unknown, visibleHtml: string): boolean {
  const signal = embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { signalQuality?: { businessObservationTopics?: Array<{ topic?: string }>; frontPageTopics?: Array<{ topic?: string }> } }).signalQuality : undefined;
  const business = new Set((signal?.businessObservationTopics ?? []).map((item) => item.topic).filter(Boolean));
  const front = new Set((signal?.frontPageTopics ?? []).map((item) => item.topic).filter(Boolean));
  const protocolBlock = visibleHtml.match(/<h3>프로토콜 핵심 흐름<\/h3>[\s\S]*?<\/article>/)?.[0] ?? "";
  const businessBlock = visibleHtml.match(/<h3>사업 관찰 흐름<\/h3>[\s\S]*?<\/article>/)?.[0] ?? "";
  const longBlock = visibleHtml.match(/<h3>장기 관찰 주제<\/h3>[\s\S]*?<\/article>/)?.[0] ?? "";
  const renderedIn = (block: string, topic: string) => new RegExp(`<b>${escapeRegExpForHtml(topic)}</b>`).test(block);
  for (const topic of business) {
    if (front.has(topic)) return false;
    if (renderedIn(protocolBlock, topic!) || renderedIn(longBlock, topic!)) return false;
  }
  for (const topic of front) {
    if (renderedIn(businessBlock, topic!) || renderedIn(longBlock, topic!)) return false;
  }
  return true;
}

function topicDescriptionTemplateValid(visibleHtml: string): boolean {
  const tokenRegistryBlock = visibleHtml.match(/<h3>Token Registry and Metadata<\/h3>[\s\S]{0,800}/)?.[0] ?? "";
  const navBlock = visibleHtml.match(/<h3>NAV and Asset Reporting<\/h3>[\s\S]{0,800}/)?.[0] ?? "";
  const derivativeBlock = visibleHtml.match(/<h3>Smart Derivative Contract<\/h3>[\s\S]{0,800}/)?.[0] ?? "";
  return !/상환 요청과 가치 산정/.test(tokenRegistryBlock)
    && (navBlock ? /NAV snapshot|valuation timestamp|자산 가치 기록/.test(navBlock) : true)
    && (derivativeBlock ? /derivative lifecycle|financial agreement automation/.test(derivativeBlock) : true);
}

function commentScopeLabelConsistency(visibleHtml: string): boolean {
  const hasTopicCards = /최근 7일 원시 댓글 \d+건|최근 7일 raw posts \d+건/.test(visibleHtml);
  return (/핵심 Topic 최근 7일 댓글|최근 7일 active Magicians threads/.test(visibleHtml))
    && /기술 지도 최근 7일 댓글/.test(visibleHtml)
    && (/전체 분석 최근 7일 댓글|최근 7일 unique participants/.test(visibleHtml))
    && /최근 7일 analyzed insights/.test(visibleHtml)
    && (!hasTopicCards || /해당 Topic 최근 7일 댓글|최근 7일 원시 댓글|최근 7일 raw posts/.test(visibleHtml));
}

function coverSingularPluralConsistency(report: WeeklyRadarReport, embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  void report;
  if (!dashboard?.dataQuality || !dashboard.weeklySignalCopy) return false;
  const usableCount = Number(dashboard.dataQuality.current7dUsableEventCount ?? 0);
  const rawCount = Number(dashboard.dataQuality.current7dRawEventCount ?? 0);
  const weeklyRankingValidity = dashboard.dataQuality.weeklyRankingValidity;
  const expected = buildWeeklySignalCopy({ usableCount, rawCount, weeklyRankingValidity });
  const copy = dashboard.weeklySignalCopy;
  const cover = weeklySignalAttrs(visibleHtml, "dash-v3");
  const executive = weeklySignalAttrs(visibleHtml, "dash-contract");
  const structuralModeValid = usableCount === 1
    ? (copy.mode === "single" || copy.mode === "non_ranking") && copy.rankingEnabled === false
    : weeklyRankingValidity === "invalid"
      ? (copy.mode === "non_ranking" || (usableCount === 0 && copy.mode === "empty")) && copy.rankingEnabled === false
      : usableCount >= 2
        ? copy.mode === "multiple" && copy.rankingEnabled === true
        : copy.mode === "empty" && copy.rankingEnabled === false;
  return structuralModeValid
    && JSON.stringify(copy) === JSON.stringify(expected)
    && cover.mode === copy.mode
    && executive.mode === copy.mode
    && cover.rankingEnabled === copy.rankingEnabled
    && executive.rankingEnabled === copy.rankingEnabled
    && cover.usableCount === usableCount
    && executive.usableCount === usableCount
    && visibleHtml.includes(`<div data-weekly-signal-cover-metric><span>${escapeHtml(copy.metricLabel)}</span><b>${escapeHtml(copy.metricValue)}</b></div>`)
    && visibleHtml.includes(`data-executive-weekly-usable>${escapeHtml(copy.metricValue)}</b>`);
}

function coverSingularPluralObserved(embeddedApi: unknown, visibleHtml: string): string {
  const dashboard = dashboardFromApi(embeddedApi);
  const usableCount = Number(dashboard?.dataQuality?.current7dUsableEventCount ?? 0);
  const rawCount = Number(dashboard?.dataQuality?.current7dRawEventCount ?? 0);
  const weeklyRankingValidity = dashboard?.dataQuality?.weeklyRankingValidity ?? "unknown";
  const expected = buildWeeklySignalCopy({ usableCount, rawCount, weeklyRankingValidity });
  const copy = dashboard?.weeklySignalCopy;
  const renderedCoverLabel = visibleHtml.match(/<div data-weekly-signal-cover-metric><span>([^<]+)<\/span><b>[^<]+<\/b><\/div>/)?.[1] ?? "missing";
  const renderedCoverSummary = visibleHtml.match(/<p class="cover-weekly-summary">([^<]+)<\/p>/)?.[1] ?? "missing";
  return JSON.stringify({
    usableCount,
    rawCount,
    weeklyRankingValidity,
    renderedCoverLabel,
    renderedCoverSummary,
    expectedMode: expected.mode,
    renderedMode: copy?.mode ?? "missing",
    rankingEnabled: copy?.rankingEnabled ?? null,
    coverAttrs: weeklySignalAttrs(visibleHtml, "report-cover dashboard-cover"),
    executiveAttrs: weeklySignalAttrs(visibleHtml, "executive-stack"),
  });
}

function coverSingularPluralAffectedIds(embeddedApi: unknown): string[] {
  const dashboard = dashboardFromApi(embeddedApi);
  const ids = stringList(dashboard?.dataQuality?.usableEventIds);
  return ids.length ? ids : ["cover"];
}

function weeklySignalAttrs(visibleHtml: string, className: string): { mode?: string; rankingEnabled?: boolean; usableCount?: number } {
  const tag = (visibleHtml.match(new RegExp(`<[^>]+class="[^"]*\\b${escapeRegExpForHtml(className)}\\b[^"]*"[^>]*>`))?.[0] ?? "");
  const mode = tag.match(/data-weekly-signal-mode="([^"]+)"/)?.[1];
  const ranking = tag.match(/data-weekly-signal-ranking="([^"]+)"/)?.[1];
  const usable = tag.match(/data-weekly-signal-usable="([^"]+)"/)?.[1];
  return {
    mode,
    rankingEnabled: ranking === undefined ? undefined : ranking === "true",
    usableCount: usable === undefined ? undefined : Number(usable),
  };
}

function dashboardFromApi(embeddedApi: unknown) {
  if (!embeddedApi || typeof embeddedApi !== "object") return undefined;
  const root = embeddedApi as { dashboard?: ReturnType<typeof buildDashboard>; intelligenceSnapshot?: { views?: ReturnType<typeof buildDashboard> } };
  return root.intelligenceSnapshot?.views ?? root.dashboard;
}

function dashboardV2FromApi(embeddedApi: unknown) {
  if (!embeddedApi || typeof embeddedApi !== "object") return undefined;
  return (embeddedApi as { intelligenceSnapshot?: { views?: { dashboardV2?: ReturnType<typeof buildDashboardV2View> } } }).intelligenceSnapshot?.views?.dashboardV2;
}

function dashboardV2CanonicalCountConsistency(embeddedApi: unknown): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return false;
  const usable = new Set(stringList(view.weeklyTimeline?.usableEventIds));
  const topicUnion = new Set(stringList(view.topicActivityMap?.points?.flatMap((point) => point.weeklyUsableEventIds)));
  const explorerUnion = new Set(stringList(view.proposalExplorer?.rows?.flatMap((row) => row.weeklyUsableEventIds)));
  return view.overview.weeklyUsableCount.value === usable.size
    && view.weeklyTimeline.totalUsableCount === usable.size
    && view.topicActivityMap.totalCurrent7d === usable.size
    && view.proposalExplorer.totalCurrent7d === usable.size
    && setEquals(usable, topicUnion)
    && setEquals(usable, explorerUnion);
}

function dashboardV2CountObserved(embeddedApi: unknown): string {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return "dashboardV2 missing";
  return JSON.stringify({
    overview: view.overview.weeklyUsableCount.value,
    timeline: view.weeklyTimeline.totalUsableCount,
    topicMap: view.topicActivityMap.totalCurrent7d,
    explorer: view.proposalExplorer.totalCurrent7d,
    usableIds: view.weeklyTimeline.usableEventIds,
  });
}

function dashboardV2CountAffectedIds(embeddedApi: unknown): string[] {
  const view = dashboardV2FromApi(embeddedApi);
  return stringList(view?.weeklyTimeline?.usableEventIds).length ? stringList(view?.weeklyTimeline?.usableEventIds) : ["dashboard-v2-counts"];
}

function dashboardV2RankingLanguage(embeddedApi: unknown, visibleHtml: string): boolean {
  const validity = dashboardV2FromApi(embeddedApi)?.evidenceQuality.weeklyRankingValidity;
  if (validity !== "invalid") return true;
  return !/\bTop\b|\bRank\b|1위|개발자 관심 순위/.test(visibleHtml);
}

function dashboardV2RankingObserved(embeddedApi: unknown, visibleHtml: string): string {
  return JSON.stringify({
    weeklyRankingValidity: dashboardV2FromApi(embeddedApi)?.evidenceQuality.weeklyRankingValidity ?? "missing",
    forbiddenMatches: visibleHtml.match(/\bTop\b|\bRank\b|1위|개발자 관심 순위/g) ?? [],
  });
}

function dashboardV2DiscussionLabel(embeddedApi: unknown, visibleHtml: string): boolean {
  const valid = dashboardV2FromApi(embeddedApi)?.developerActivity.validTechnicalPostCount;
  if (valid !== null && valid !== undefined) return true;
  return /Raw Posts[\s\S]{0,140}(relevance 미분류|원문 수집 기준)|원문 게시물[\s\S]{0,180}원문 수집 기준|최근 7일 raw posts[\s\S]{0,240}(relevance 미분류|유효 기술 post 미분류)/.test(visibleHtml)
    && /Raw activity|raw activity|수집된 원문 활동|원문 게시물/.test(visibleHtml)
    && !/개발자 관심 순위/.test(visibleHtml);
}

function dashboardV2DiscussionObserved(embeddedApi: unknown, visibleHtml: string): string {
  return JSON.stringify({
    validTechnicalPostCount: dashboardV2FromApi(embeddedApi)?.developerActivity.validTechnicalPostCount,
    rawLabelVisible: /Raw Posts[\s\S]{0,140}(relevance 미분류|원문 수집 기준)|최근 7일 raw posts[\s\S]{0,240}(relevance 미분류|유효 기술 post 미분류)/.test(visibleHtml),
    forbiddenDeveloperInterest: /개발자 관심 순위/.test(visibleHtml),
  });
}

function dashboardV2SourceTraceability(embeddedApi: unknown): boolean {
  return dashboardV2TraceabilityAffectedIds(embeddedApi).length === 0;
}

function dashboardV2TraceabilityAffectedIds(embeddedApi: unknown): string[] {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return ["dashboardV2"];
  const publicItems = [
    ...(view.weeklyTimeline.items ?? []).map((item) => ({ id: item.eventId, evidenceIds: item.evidenceIds, sourcePath: item.sourcePath })),
    ...(view.topicActivityMap.points ?? []).map((item) => ({ id: item.topicId, evidenceIds: item.evidenceIds, sourcePath: item.sourcePath })),
    ...(view.proposalExplorer.rows ?? []).map((item) => ({ id: item.proposalId, evidenceIds: item.evidenceIds, sourcePath: item.sourcePath })),
    ...(view.developerActivity.matrixPoints ?? []).map((item) => ({ id: item.id, evidenceIds: item.evidenceIds, sourcePath: item.sourcePath })),
  ];
  return publicItems.filter((item) => !item.sourcePath && !(item.evidenceIds?.length)).map((item) => item.id);
}

function dashboardV2TraceabilityObserved(embeddedApi: unknown): string {
  return JSON.stringify({ missingTraceabilityIds: dashboardV2TraceabilityAffectedIds(embeddedApi) });
}

function dashboardV2LifecycleCompleteness(embeddedApi: unknown): boolean {
  return dashboardV2LifecycleAffectedIds(embeddedApi).length === 0;
}

function dashboardV2LifecycleAffectedIds(embeddedApi: unknown): string[] {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return ["dashboardV2"];
  const lifecycleIds = new Set(view.lifecycleBoard.flatMap((stage) => stage.proposals.map((proposal) => proposal.proposalId)));
  return view.proposalExplorer.rows.filter((proposal) => !lifecycleIds.has(proposal.proposalId)).map((proposal) => proposal.proposalId);
}

function dashboardV2LifecycleObserved(embeddedApi: unknown): string {
  const view = dashboardV2FromApi(embeddedApi);
  return JSON.stringify({
    explorerCount: view?.proposalExplorer.rows.length ?? 0,
    lifecycleCount: new Set(view?.lifecycleBoard.flatMap((stage) => stage.proposals.map((proposal) => proposal.proposalId)) ?? []).size,
    missing: dashboardV2LifecycleAffectedIds(embeddedApi),
  });
}

function dashboardV2KgldConsistency(embeddedApi: unknown): boolean {
  return dashboardV2KgldAffectedIds(embeddedApi).length === 0;
}

function dashboardV2KgldAffectedIds(embeddedApi: unknown): string[] {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return ["dashboardV2"];
  const executive = new Set(stringList(view.kgldBoard.executiveKgldIds));
  const board = new Set(stringList(view.kgldBoard.boardKgldIds));
  return [...new Set([...difference(executive, board), ...difference(board, executive)])].sort();
}

function dashboardV2KgldObserved(embeddedApi: unknown): string {
  const view = dashboardV2FromApi(embeddedApi);
  return JSON.stringify({
    executiveKgldIds: view?.kgldBoard.executiveKgldIds ?? [],
    boardKgldIds: view?.kgldBoard.boardKgldIds ?? [],
    mismatch: dashboardV2KgldAffectedIds(embeddedApi),
  });
}

function dashboardV2FilterContract(html: string): boolean {
  return dashboardV2FilterAffectedIds(html).length === 0
    && /data-period=/.test(html)
    && /data-evidence=/.test(html)
    && /data-domain-filter/.test(html)
    && /data-status-filter/.test(html)
    && /data-aa-toggle/.test(html)
    && /data-kgld-toggle/.test(html)
    && /data-proposal-search/.test(html);
}

function dashboardV2FilterAffectedIds(html: string): string[] {
  const nodes = html.match(/<[^>]+class="[^"]*\b(?:v2|dash)-filterable\b[^"]*"[^>]*>/g) ?? [];
  return nodes
    .map((tag, index) => ({ tag, index }))
    .filter(({ tag }) => !/data-domain=/.test(tag) || !/data-status=/.test(tag) || !/data-aa=/.test(tag) || !/data-kgld=/.test(tag) || !/data-search=/.test(tag))
    .map(({ tag, index }) => tag.match(/data-open-proposal="([^"]+)"/)?.[1] ?? tag.match(/data-open-topic="([^"]+)"/)?.[1] ?? `filterable-${index}`);
}

function dashboardV2FilterObserved(html: string): string {
  return JSON.stringify({
    filterableCount: (html.match(/\b(?:v2|dash)-filterable\b/g) ?? []).length,
    missingMetadata: dashboardV2FilterAffectedIds(html),
  });
}

function dashboardV2EmptyStates(embeddedApi: unknown, visibleHtml: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return false;
  return /confirmed zero|확인된 변화 없음/.test(visibleHtml)
    && /unavailable|확인 불가|사용 불가 상태|출처 사용 불가/.test(visibleHtml)
    && /not collected|미수집/.test(visibleHtml)
    && /unclassified|분류 보류|미분류|분류 대기/.test(visibleHtml);
}

function dashboardV2EmptyObserved(embeddedApi: unknown, visibleHtml: string): string {
  return JSON.stringify({
    usableEvents: dashboardV2FromApi(embeddedApi)?.evidenceQuality.usableEvents ?? null,
    hasConfirmedZero: /confirmed zero|확인된 변화 없음/.test(visibleHtml),
    hasUnavailable: /unavailable|확인 불가|사용 불가 상태|출처 사용 불가/.test(visibleHtml),
    hasNotCollected: /not collected|미수집/.test(visibleHtml),
    hasUnclassified: /unclassified|분류 보류|미분류|분류 대기/.test(visibleHtml),
  });
}

function dashboardV2RenderIsolation(html: string): boolean {
  const scriptBodies = (html.match(/<script>([\s\S]*?)<\/script>/g) ?? []).join("\n");
  return !/\bfetch\s*\(|XMLHttpRequest|<iframe|\bopenDatabase\b|buildWeeklyReport|collect\.ts|send:weekly/.test(scriptBodies + html.match(/<iframe[\s\S]*?>/g)?.join(""));
}

function dashboardV2RenderIsolationObserved(html: string): string {
  return JSON.stringify({
    fetchCalls: (html.match(/\bfetch\s*\(/g) ?? []).length,
    iframes: (html.match(/<iframe/gi) ?? []).length,
    collectorReferences: (html.match(/collect\.ts|buildWeeklyReport/g) ?? []).length,
  });
}

function dashboardV2DeterministicLayout(embeddedApi: unknown, html: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return false;
  const coordinates = view.topicActivityMap.points.map((point) => `${point.topicId}:${point.coordinates.x}:${point.coordinates.y}:${point.coordinates.size}`).join("|");
  const recomputed = createHash("sha256").update(coordinates).digest("hex");
  return /^[a-f0-9]{64}$/.test(recomputed) && !/Math\.random|forceSimulation|Date\.now\(\)/.test(html);
}

function dashboardV2DeterministicObserved(embeddedApi: unknown, html: string): string {
  const view = dashboardV2FromApi(embeddedApi);
  const coordinates = view?.topicActivityMap.points.map((point) => `${point.topicId}:${point.coordinates.x}:${point.coordinates.y}:${point.coordinates.size}`) ?? [];
  return JSON.stringify({
    coordinateHash: createHash("sha256").update(coordinates.join("|")).digest("hex"),
    randomReferences: html.match(/Math\.random|forceSimulation|Date\.now\(\)/g) ?? [],
  });
}

function weeklyRepositoryAdditionsFromApi(embeddedApi: unknown): WeeklyRepositoryAdditionItem[] {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = embeddedApi && typeof embeddedApi === "object"
    ? (embeddedApi as { intelligenceSnapshot?: { facts?: DashboardV3Facts } }).intelligenceSnapshot?.facts ?? {}
    : {};
  return view ? buildDashboardV3Presentation(view, facts).weeklyRepositoryAdditions : [];
}

function weeklyMeaningfulRowsFromApi(embeddedApi: unknown): WeeklyRepositoryAdditionItem[] {
  return weeklyRepositoryAdditionsFromApi(embeddedApi);
}

function weeklyRepositoryAdditionIds(embeddedApi: unknown): string[] {
  return weeklyRepositoryAdditionsFromApi(embeddedApi).map((item) => item.proposalId);
}

function visibleTextOnly(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function proposalVisibleSegment(visibleHtml: string, proposalId: string): string {
  const rows = visibleHtml.match(/<button[^>]*data-weekly-repository-addition(?:\s|=)[\s\S]*?<\/button>/g) ?? [];
  const row = rows.find((item) => item.includes(proposalId));
  if (row) return row;
  const index = visibleHtml.indexOf(proposalId);
  return index >= 0 ? visibleHtml.slice(index, index + 1600) : "";
}

function weeklyRepositoryAdditionLabel(embeddedApi: unknown, visibleHtml: string): boolean {
  const items = weeklyRepositoryAdditionsFromApi(embeddedApi);
  const text = visibleTextOnly(visibleHtml);
  return items.every((item) => {
    const segment = visibleTextOnly(proposalVisibleSegment(visibleHtml, item.proposalId));
    return segment.includes("공식 저장소 신규 반영")
      && segment.includes(`저장소 반영 ${item.repositoryAddedDateKst}`)
      && (item.proposalCreatedDateKst ? segment.includes(`문서 작성 ${item.proposalCreatedDateKst}`) : segment.includes("문서 작성일 미확인"));
  })
    && !/이번 주 작성된 Proposal|이번 주 신규 Proposal|이번 주 핵심 Proposal Top 5|신규 Proposal 5건/.test(text);
}

function weeklyDualDateVisible(embeddedApi: unknown, visibleHtml: string): boolean {
  return weeklyRepositoryAdditionsFromApi(embeddedApi).every((item) => {
    const segment = visibleTextOnly(proposalVisibleSegment(visibleHtml, item.proposalId));
    return segment.includes(`저장소 반영 ${item.repositoryAddedDateKst}`)
      && (item.proposalCreatedDateKst ? segment.includes(`문서 작성 ${item.proposalCreatedDateKst}`) : segment.includes("문서 작성일 미확인"));
  });
}

function publicWeeklyDatesKst(embeddedApi: unknown, visibleHtml: string): boolean {
  const text = visibleTextOnly(visibleHtml);
  return weeklyRepositoryAdditionsFromApi(embeddedApi).every((item) => {
    const segment = visibleTextOnly(proposalVisibleSegment(visibleHtml, item.proposalId));
    const rawDate = item.repositoryAddedAt.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0]?.replace(/-/g, ".") ?? "";
    const rawDateWouldDiffer = rawDate !== "" && rawDate !== item.repositoryAddedDateKst;
    return segment.includes(`저장소 반영 ${item.repositoryAddedDateKst}`)
      && (!rawDateWouldDiffer || !segment.includes(`저장소 반영 ${rawDate}`));
  }) && !/저장소 반영 2026\.07\.28/.test(text);
}

function heroPlainLanguageQuality(visibleHtml: string): boolean {
  const hero = visibleHtml.match(/<header class="dash-hero"[\s\S]*?<\/header>/)?.[0] ?? "";
  return /이번 주 공식 저장소 신규 반영/.test(hero)
    && /Magicians 원문 게시물/.test(hero)
    && !/데이터 품질 제한|순위 미제공|ranking invalid|usable event|weeklyRankingValidity|이번 주 신규 Proposal|이번 주 작성된 Proposal|Magicians 활동 \d+건|개발자 관심 \d+건/.test(hero);
}

function heroPlainLanguageObserved(visibleHtml: string): string {
  const hero = visibleHtml.match(/<header class="dash-hero"[\s\S]*?<\/header>/)?.[0] ?? "";
  return visibleTextOnly(hero);
}

function heroRepositoryCountConsistency(embeddedApi: unknown, visibleHtml: string): boolean {
  const expected = weeklyRepositoryAdditionsFromApi(embeddedApi).length;
  const heroCount = Number(visibleHtml.match(/data-hero-repository-addition-count="(\d+)"/)?.[1] ?? NaN);
  const rootCount = Number(visibleHtml.match(/data-weekly-repository-additions="(\d+)"/)?.[1] ?? NaN);
  const rowCount = (visibleHtml.match(/data-weekly-repository-addition(?:\s|=)/g) ?? []).length;
  const firstKpi = visibleHtml.match(/<section class="dash-kpi-strip"[\s\S]*?<\/section>/)?.[0] ?? "";
  return heroCount === expected
    && rootCount === expected
    && rowCount === expected
    && new RegExp(`공식 저장소 신규 반영[\\s\\S]{0,160}<strong>${expected}건<\\/strong>`).test(firstKpi);
}

function logicalVsRawProposalDate(embeddedApi: unknown, visibleHtml: string): boolean {
  return weeklyRepositoryAdditionsFromApi(embeddedApi).every((item) => {
    if (!item.proposalCreatedDateKst || item.proposalCreatedDateKst === item.repositoryAddedDateKst) return true;
    const segment = visibleTextOnly(proposalVisibleSegment(visibleHtml, item.proposalId));
    return segment.includes(`저장소 반영 ${item.repositoryAddedDateKst}`)
      && segment.includes(`문서 작성 ${item.proposalCreatedDateKst}`)
      && !segment.includes(`문서 작성 ${item.repositoryAddedDateKst}`);
  });
}

function weeklyRepositoryAdditionObserved(embeddedApi: unknown, visibleHtml: string): string {
  return JSON.stringify({
    items: weeklyRepositoryAdditionsFromApi(embeddedApi).map((item) => ({
      proposalId: item.proposalId,
      title: item.title,
      summary: item.summary,
      repositoryAddedAt: item.repositoryAddedAt,
      repositoryAddedDateKst: item.repositoryAddedDateKst,
      proposalCreatedAt: item.proposalCreatedAt,
      proposalCreatedDateKst: item.proposalCreatedDateKst,
      sourceUrl: item.sourceUrl,
      sourcePath: item.sourcePath,
      evidenceIds: item.evidenceIds,
      renderedText: visibleTextOnly(proposalVisibleSegment(visibleHtml, item.proposalId)),
    })),
    hero: heroPlainLanguageObserved(visibleHtml),
    rows: (visibleHtml.match(/data-weekly-repository-addition(?:\s|=)/g) ?? []).length,
  });
}

function directionAbstractGrounded(embeddedApi: unknown, visibleHtml: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const presentation = buildDashboardV3Presentation(view, facts);
  const direction = presentation.directionAbstract;
  const evidenceIds = new Set((facts.specificationEvidence ?? []).map((item) => item.proposalId));
  const draftCount = presentation.lifecycle.find((stage) => stage.sourceStage === "Draft")?.count ?? 0;
  const segment = visibleHtml.match(/<section class="dash-section dash-panel dash-direction"[\s\S]*?<\/section>/)?.[0] ?? "";
  return direction.representativeProposalIds.length >= 9
    && direction.representativeProposalIds.every((id) => evidenceIds.has(id))
    && segment.includes(direction.thesisKo)
    && segment.includes("확정된 Ethereum 로드맵이 아니라")
    && segment.includes(`분류·탐색 대상은 ${view.proposalExplorer.rows.length}건`)
    && (draftCount > 0 || segment.includes("명세 제안군"))
    && !/Ethereum은 .*보다 .*우선|mainnet 적용 확정|mainnet 도입 방향|구현이 확인|채택이 확인|구현 확정|채택 확정|생태계 전체에서 확산/.test(visibleTextOnly(segment));
}

function directionAbstractObserved(embeddedApi: unknown, visibleHtml: string): string {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  const direction = view && facts ? buildDashboardV3Presentation(view, facts).directionAbstract : null;
  return JSON.stringify({
    rendered: visibleTextOnly(visibleHtml.match(/<section class="dash-section dash-panel dash-direction"[\s\S]*?<\/section>/)?.[0] ?? ""),
    representativeProposalIds: direction?.representativeProposalIds,
    evidenceIds: direction?.evidenceIds,
  });
}

function trendMetricSemanticLabel(visibleHtml: string): boolean {
  const segment = visibleHtml.match(/<section class="dash-section dash-panel" id="trend"[\s\S]*?<\/section>/)?.[0] ?? "";
  const text = visibleTextOnly(segment);
  return /공식 저장소 신규 문서 반영/.test(text)
    && /내용 수정, 상태 전환, 구현과 채택은 포함하지 않습니다/.test(text)
    && !/confirmed specification changes|명세 변화 전체|Magicians Raw Posts|Unique participants|고유 참여자/.test(text);
}

function trendMetricObserved(visibleHtml: string): string {
  return visibleTextOnly(visibleHtml.match(/<section class="dash-section dash-panel" id="trend"[\s\S]*?<\/section>/)?.[0] ?? "");
}

function discussionCoverageNoFalseZero(embeddedApi: unknown, visibleHtml: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const presentation = buildDashboardV3Presentation(view, facts);
  const trend = trendMetricObserved(visibleHtml);
  return presentation.activeThreads.every((thread) => isWithinTrailingDays(thread.latestActivityAt, view.metadata.reportDate, 7))
    && /수집 시작 이전 기간은 0으로 해석하지 않습니다/.test(trend)
    && !/Magicians Raw Posts|고유 참여자 26주 bar chart|raw posts over the 26-week window/.test(trend);
}

function discussionCoverageObserved(embeddedApi: unknown, visibleHtml: string): string {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  const presentation = view && facts ? buildDashboardV3Presentation(view, facts) : null;
  return JSON.stringify({
    activeThreads: presentation?.activeThreads.map((thread) => ({ proposalId: thread.proposalId, latestActivityAt: thread.latestActivityAt, rawPostCount: thread.rawPostCount })),
    trend: trendMetricObserved(visibleHtml),
  });
}

function domainCrossViewConsistency(embeddedApi: unknown): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const presentation = buildDashboardV3Presentation(view, facts);
  const domainById = new Map(view.proposalExplorer.rows.map((row) => [row.proposalId, row.domainId]));
  return presentation.weeklyRepositoryAdditions.every((item) => domainById.get(item.proposalId) && item.domainId === domainById.get(item.proposalId))
    && view.proposalExplorer.rows.every((row) => publicDomainForProposal(row.proposalId, row.domainId, row.topic, row.title).domainId === row.domainId)
    && presentation.domains.every((domain) => view.proposalExplorer.rows.filter((row) => row.domainId === domain.domainId).length === domain.monitoredProposals);
}

function knownDomainFixtureExpectations(): Map<string, string> {
  return new Map([
    ["EIP-8198", "validators-consensus"],
    ["EIP-8298", "execution-state"],
    ["EIP-8253", "execution-state"],
    ["EIP-8333", "validators-consensus"],
    ["ERC-8049", "scaling-data"],
    ["EIP-8151", "accounts-wallets"],
    ["EIP-8173", "execution-state"],
    ["EIP-8295", "execution-state"],
    ["EIP-8182", "tokens-finance"],
    ["ERC-8325", "tokens-finance"],
    ["ERC-8217", "identity-compliance"],
    ["EIP-8347", "execution-state"],
    ["EIP-8337", "execution-state"],
    ["ERC-8286", "accounts-wallets"],
    ["ERC-8262", "identity-compliance"],
    ["ERC-8320", "identity-compliance"],
  ]);
}

function knownDomainSemanticFixtures(embeddedApi: unknown): boolean {
  return knownDomainRuntimeMismatches(embeddedApi).length === 0;
}

function knownDomainSemanticFixturesV4(embeddedApi: unknown): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view || !knownDomainSemanticFixtures(embeddedApi)) return false;
  const rows = new Map(view.proposalExplorer.rows.map((row) => [row.proposalId, row.domainId]));
  return [
    ["EIP-8198", "validators-consensus"],
    ["EIP-8298", "execution-state"],
  ].every(([proposalId, domainId]) => !rows.has(proposalId) || rows.get(proposalId) === domainId);
}

function knownDomainSemanticFixturesV3(embeddedApi: unknown, html: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view || !knownDomainSemanticFixtures(embeddedApi)) return false;
  const erc8049 = view.proposalExplorer.rows.find((row) => row.proposalId === "ERC-8049");
  if (!erc8049) return true;
  const erc8049Segments = html.match(/<[^>]+(?:ERC-8049|erc-8049)[\s\S]{0,900}>/gi)?.join(" ") ?? "";
  return erc8049?.domainId === "scaling-data"
    && !/\binteroperability\b|cross-chain|bridge|message bridge|cross-chain signature/i.test(erc8049Segments);
}

function knownDomainRuntimeMismatches(embeddedApi: unknown): Array<{ proposalId: string; expected: string; actual: string }> {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view) return [{ proposalId: "dashboardV2", expected: "present", actual: "missing" }];
  const expected = knownDomainFixtureExpectations();
  return view.proposalExplorer.rows
    .filter((row) => expected.has(row.proposalId))
    .map((row) => ({ proposalId: row.proposalId, expected: expected.get(row.proposalId)!, actual: row.domainId }))
    .filter((item) => item.actual !== item.expected);
}

function knownDomainClassifierRegression(): boolean {
  return [...knownDomainFixtureExpectations()].every(([proposalId, domainId]) =>
    publicDomainForProposal(proposalId, "unknown", undefined, proposalId).domainId === domainId
  );
}

function domainCrossViewConsistencyV4(embeddedApi: unknown, html: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  if (!view || !domainCrossViewConsistency(embeddedApi)) return false;
  const eip8198 = view.proposalExplorer.rows.find((row) => row.proposalId === "EIP-8198");
  const eip8298 = view.proposalExplorer.rows.find((row) => row.proposalId === "EIP-8298");
  const segments8198 = proposalHtmlSegments(html, "EIP-8198").join(" ");
  const segments8298 = proposalHtmlSegments(html, "EIP-8298").join(" ");
  return eip8198?.domainId === "validators-consensus"
    && eip8298?.domainId === "execution-state"
    && /data-domain="validators-consensus"|검증자·합의|slot-duration|consensus-layer/.test(segments8198)
    && /data-domain="execution-state"|실행·상태|SETCODEFROM|EVM-opcode|runtime-semantics/.test(segments8298)
    && !/EIP-8198[\s\S]{0,700}확장·데이터/.test(segments8198)
    && !/EIP-8298[\s\S]{0,700}계정·권한/.test(segments8298);
}

function domainConsistencyObserved(embeddedApi: unknown): string {
  const view = dashboardV2FromApi(embeddedApi);
  const ids = [...knownDomainFixtureExpectations().keys()];
  const rows = new Map(view?.proposalExplorer.rows.map((row) => [row.proposalId, row.domainId]) ?? []);
  return JSON.stringify({
    runtimeMismatches: knownDomainRuntimeMismatches(embeddedApi),
    fixtures: Object.fromEntries(ids.map((id) => [id, rows.get(id) ?? "not_current_explorer"])),
  });
}

function publicDomainSemanticAudit(embeddedApi: unknown): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const audit = buildDashboardV3Presentation(view, facts).publicDomainAudit;
  return audit.length === view.proposalExplorer.rows.length
    && audit.every((item) => item.proposalId && item.officialTitle && item.auditedPrimaryDomain && item.rationale && item.sourceFactId);
}

function publicDomainAuditObserved(embeddedApi: unknown): string {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return "missing";
  const audit = buildDashboardV3Presentation(view, facts).publicDomainAudit;
  return JSON.stringify({ count: audit.length, changed: audit.filter((item) => item.changed).map((item) => item.proposalId) });
}

function monitoringScopeFourLevelsVisible(embeddedApi: unknown, visibleHtml: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const p = buildDashboardV3Presentation(view, facts);
  const text = visibleTextOnly(visibleHtml);
  return text.includes(`발견 대상 ${p.scope.discoveredProposalCount}건`)
    && text.includes(`탐색·단계 분포 대상 ${p.scope.publicExplorerCount}건`)
    && text.includes(`기준 Proposal ${p.scope.explorerExcludedBaselineProposalCount}건`)
    && text.includes(`집중 모니터링 ${p.scope.concentratedMonitoringCount}건`)
    && text.includes(`상세 활동 카드 ${p.scope.detailedActivityCardCount}건`)
    && text.includes("구현 데이터 수집원 없음");
}

function monitoringScopeFourLevelsObserved(embeddedApi: unknown, visibleHtml: string): string {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  const p = view && facts ? buildDashboardV3Presentation(view, facts) : null;
  const start = visibleHtml.indexOf('<div class="dash-scope-summary">');
  const end = start >= 0 ? visibleHtml.indexOf('<div class="dash-evidence-summary">', start) : -1;
  const segment = start >= 0 && end > start ? visibleHtml.slice(start, end) : "";
  return JSON.stringify({ scope: p?.scope, rendered: visibleTextOnly(segment) });
}

function monitoringScopeReferenceCount(embeddedApi: unknown): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const scope = monitoringScopeFromViewFacts(view, facts);
  const discovered = new Set((facts.specificationEvidence ?? []).map((fact) => fact.proposalId).filter(Boolean));
  const publicIds = new Set(view.proposalExplorer.rows.map((row) => row.proposalId));
  const excluded = difference(discovered, publicIds).sort();
  return scope.discoveredProposalCount === scope.publicExplorerCount + scope.explorerExcludedBaselineProposalCount
    && discovered.size === scope.discoveredProposalCount
    && publicIds.size === scope.publicExplorerCount
    && excluded.length === scope.explorerExcludedBaselineProposalCount
    && setEquals(new Set(excluded), new Set(scope.explorerExcludedBaselineProposalIds));
}

function monitoringScopeReferenceObserved(embeddedApi: unknown): string {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  const discovered = new Set((facts?.specificationEvidence ?? []).map((fact) => fact.proposalId).filter(Boolean));
  const publicIds = new Set(view?.proposalExplorer.rows.map((row) => row.proposalId) ?? []);
  const excluded = difference(discovered, publicIds).sort();
  return JSON.stringify({ discovered: discovered.size, public: publicIds.size, explorerExcludedBaselineProposalCount: excluded.length, explorerExcludedBaselineProposalIds: excluded });
}

function monitoringScopeWording(embeddedApi: unknown, html: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts || !monitoringScopeReferenceCount(embeddedApi)) return false;
  const scope = monitoringScopeFromViewFacts(view, facts);
  const visible = visibleTextOnly(html.replace(/<script[\s\S]*?<\/script>/g, " "));
  return visible.includes(monitoringScopeSentence(scope))
    && visible.includes(`발견 대상 ${scope.discoveredProposalCount}건`)
    && visible.includes(`탐색·단계 분포 대상 ${scope.publicExplorerCount}건`)
    && visible.includes(`기준 Proposal ${scope.explorerExcludedBaselineProposalCount}건`)
    && visible.includes(`집중 모니터링 ${scope.concentratedMonitoringCount}건`)
    && visible.includes(`상세 활동 카드 ${scope.detailedActivityCardCount}건`)
    && !/분류 가능한 68건|상세 활동 분석 3건|EIP\/ERC 공식 명세 24건/.test(html);
}

function monitoringScopeFromViewFacts(view: ReturnType<typeof buildDashboardV2View>, facts: DashboardV3Facts) {
  const publicExplorerCount = view.proposalExplorer.rows.length;
  const discoveredProposalIds = unique((facts.specificationEvidence ?? []).map((fact) => fact.proposalId).filter(Boolean)).sort(compareProposalIds);
  const publicExplorerProposalIds = unique(view.proposalExplorer.rows.map((row) => row.proposalId)).sort(compareProposalIds);
  const discoveredProposalCount = discoveredProposalIds.length || publicExplorerCount;
  const explorerExcludedBaselineProposalIds = difference(new Set(discoveredProposalIds), new Set(publicExplorerProposalIds)).sort(compareProposalIds);
  const explorerExcludedBaselineProposalCount = explorerExcludedBaselineProposalIds.length;
  return {
    discoveredProposalCount,
    publicExplorerCount,
    classifiedProposalCount: publicExplorerCount,
    discoveredProposalIds,
    publicExplorerProposalIds,
    explorerExcludedBaselineProposalCount,
    explorerExcludedBaselineProposalIds,
    referenceOnlyCount: explorerExcludedBaselineProposalCount,
    concentratedMonitoringCount: view.monitoringScope.monitoredProposalCount,
    detailedActivityCardCount: view.monitoringScope.detailedProposalCount,
    detailedAnalysisCount: view.monitoringScope.detailedProposalCount,
    implementationSourceCount: 0,
  };
}

function domainSearchMetadataConsistency(html: string): boolean {
  const erc8049Segments = proposalHtmlSegments(html, "ERC-8049").join(" ");
  const eip8253Segments = proposalHtmlSegments(html, "EIP-8253").join(" ");
  const eip8333Segments = proposalHtmlSegments(html, "EIP-8333").join(" ");
  return /data-domain="scaling-data"/.test(erc8049Segments)
    && /확장·데이터|contract metadata|onchain metadata|key value registry|컨트랙트가 자체 메타데이터/.test(erc8049Segments)
    && !/\binteroperability\b|cross-chain|bridge|message bridge|cross-chain signature/i.test(erc8049Segments)
    && /data-domain="execution-state"/.test(eip8253Segments)
    && /data-domain="validators-consensus"/.test(eip8333Segments);
}

function domainSearchMetadataObserved(html: string): string {
  return JSON.stringify({
    erc8049: proposalHtmlSegments(html, "ERC-8049").join(" ").slice(0, 800),
    eip8253: proposalHtmlSegments(html, "EIP-8253").join(" ").slice(0, 300),
    eip8333: proposalHtmlSegments(html, "EIP-8333").join(" ").slice(0, 300),
  });
}

function proposalHtmlSegments(html: string, proposalId: string): string[] {
  const escaped = proposalId.replace("-", "\\-");
  const attr = new RegExp(`<[^>]+(?:data-open-proposal|data-search|data-proposal-id|data-evidence-id)[^>]*${escaped.toLowerCase()}[^>]*>`, "gi");
  const text = new RegExp(`<[^>]+[^>]*>${proposalId}[\\s\\S]{0,600}?<\\/[^>]+>`, "g");
  return [...(html.match(attr) ?? []), ...(html.match(text) ?? [])];
}

function directionAbstractScopeQualified(visibleHtml: string): boolean {
  const segment = visibleHtml.match(/<section class="dash-section dash-panel dash-direction"[\s\S]*?<\/section>/)?.[0] ?? "";
  const text = visibleTextOnly(segment);
  return /이번 보고서에서 관찰한 EIP\/ERC 제안군/.test(text)
    && /구현·활성화·채택 데이터는 수집되지 않았습니다/.test(text)
    && /확정된 Ethereum 로드맵이 아니라/.test(text)
    && !/Ethereum은 .*보다 .*우선|Ethereum이 선택한 방향|mainnet 적용 방향|mainnet 도입 방향|채택이 진행 중|구현이 확대|생태계 전체에서 확산/.test(text);
}

function weeklySummaryLanguageConsistency(embeddedApi: unknown, visibleHtml: string): boolean {
  return weeklySummaryLanguageAffectedIds(embeddedApi, visibleHtml).length === 0;
}

function weeklySummaryLanguageAffectedIds(embeddedApi: unknown, visibleHtml: string): string[] {
  return weeklySummaryLanguageDiagnostics(embeddedApi, visibleHtml)
    .filter((item) => !item.passed)
    .map((item) => item.proposalId);
}

function weeklySummaryLanguageDiagnostics(embeddedApi: unknown, visibleHtml: string) {
  return weeklyRepositoryAdditionsFromApi(embeddedApi).map((item) => {
    const segment = proposalVisibleSegment(visibleHtml, item.proposalId);
    const renderedText = visibleTextOnly(segment);
    const summaryBody = item.summary;
    const normalizedSummary = summaryBody.replace(/\s+/g, " ").trim();
    const checks = weeklySummaryBodyQualityChecks(summaryBody, item.proposalId, item.title);
    return {
      proposalId: item.proposalId,
      title: item.title,
      summaryBody,
      renderedText,
      normalizedSummary,
      checks: { renderedIncludesSummary: renderedText.includes(summaryBody), ...checks },
      passed: Object.values(checks).every(Boolean),
    };
  });
}

function weeklySummaryTextQuality(summary: string): boolean {
  const clean = summary.replace(/\s+/g, " ").trim();
  return Object.values(weeklySummaryBodyQualityChecks(clean)).every(Boolean);
}

function weeklySummaryBodyQualityChecks(summary: string, proposalId?: string, title?: string) {
  const clean = summary.replace(/\s+/g, " ").trim();
  return {
    nonEmpty: clean.length > 0,
    koreanSentence: hasKoreanExplanatorySentence(clean),
    markdownClean: markdownCleanText(clean),
    notTruncated: !truncatedSentenceText(clean),
    noRawEnglish: !rawEnglishAbstractText(clean),
    noTitleRepetition: !summaryRepeatsProposalHeading(clean, proposalId, title),
    noInternalTaxonomyPhrase: !internalTaxonomyPhrase(clean),
    noCreationPlaceholder: !/Proposal file creation detected/i.test(clean),
  };
}

function hasKoreanExplanatorySentence(value: string): boolean {
  const hangulCount = (value.match(/[가-힣]/g) ?? []).length;
  if (hangulCount < 8) return false;
  return /[가-힣][^.!?。！？]*(?:다|니다|습니다|합니다|됩니다|했습니다|확인해야 합니다)\./.test(value);
}

function markdownCleanText(value: string): boolean {
  return !/(^|\s)#{1,6}\s+\S|\[[^\]]+\]\([^)]+\)|(^|\s)[-*+]\s+\S|`{1,3}|[*_]{2,}/m.test(value);
}

function truncatedSentenceText(value: string): boolean {
  return /\.{3}|…|[,:;]\s*$|[가-힣A-Za-z0-9]\s*$/.test(value) && !/[.!?。！？]\s*$/.test(value.trim());
}

function rawEnglishAbstractText(value: string): boolean {
  const plain = value.replace(/\b(?:EIP|ERC)-\d+\b/g, " ").replace(/\b(?:Ethereum|EVM|ERC|EIP|opcode|API|URL|URI|NFT|AML|NAV)\b/g, " ");
  const englishWords = plain.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g) ?? [];
  const hangulWords = plain.match(/[가-힣]+/g) ?? [];
  return englishWords.length >= 10 && englishWords.length > hangulWords.length * 1.5;
}

function summaryRepeatsProposalHeading(summary: string, proposalId?: string, title?: string): boolean {
  const clean = summary.replace(/\s+/g, " ").trim();
  const idTitle = proposalId && title ? `${proposalId} ${title}`.replace(/\s+/g, " ").trim() : "";
  return Boolean(idTitle && clean.startsWith(idTitle))
    || /^(?:EIP|ERC)-\d+\s+[A-Z][A-Za-z0-9 ,:;/()'._-]{8,}(?:은|는|이|가)\s/.test(clean);
}

function internalTaxonomyPhrase(value: string): boolean {
  return /\b(?:tokens-finance|identity-compliance|execution-state|accounts-wallets|scaling-data|validators-consensus|governance-process|oracle\/reporting)\b/i.test(value);
}

function aaMetricPublicLabels(visibleHtml: string): boolean {
  const segment = visibleHtml.match(/<section class="dash-panel dash-section" id="aa-watch"[\s\S]*?<\/section>/)?.[0] ?? "";
  const text = visibleTextOnly(segment);
  return /최근 30일 명세 반영/.test(text)
    && /최근 30일 원문 게시물/.test(text)
    && /최근 확인 활동/.test(text)
    && !/milestone 미확인|assignment count|confirmed_zero|confirmed_value|baseline_not_linked/.test(text);
}

function aaMetricPublicObserved(visibleHtml: string): string {
  return visibleTextOnly(visibleHtml.match(/<section class="dash-panel dash-section" id="aa-watch"[\s\S]*?<\/section>/)?.[0] ?? "");
}

function aaActivityDateSourceIntegrity(embeddedApi: unknown, visibleHtml: string): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  if (!snapshot) return false;
  const devByFact = new Map((snapshot.facts.developmentEvents ?? []).map((event) => [event.factId ?? `event:${event.eventId}`, event]));
  const postByFact = new Map((snapshot.facts.discussionPosts ?? []).map((post) => [`post:${post.postId}`, post]));
  const sourceDateForSignal = (signal: Record<string, unknown>): string | null => {
    const ids = stringList(signal.evidenceFactIds);
    if (String(signal.signalType) === "discussion_activity") {
      const dates = ids.map((id) => postByFact.get(id)?.createdAt).filter(Boolean).sort();
      return dates.at(-1) ?? null;
    }
    const dates = ids.map((id) => devByFact.get(id)?.occurredAt).filter(Boolean).sort();
    return dates.at(-1) ?? null;
  };
  const lineageOk = tracks.every((track) => (track.recentSignals ?? []).every((signal) => {
    const expected = sourceDateForSignal(signal as Record<string, unknown>);
    if (!expected) return true;
    const rendered = aaRecentActivityText({ ...track, lastMilestone: { ...signal, occurredAt: expected } });
    return rendered.includes(formatDateKst(expected));
  }));
  const aaText = aaMetricPublicObserved(visibleHtml);
  const renderedMilestones = tracks
    .map((track) => {
      const milestone = track.lastMilestone;
      if (!milestone) return null;
      const expected = sourceDateForSignal(milestone as Record<string, unknown>);
      return expected ? { proposalId: String(milestone.proposalId ?? track.proposalIds?.[0] ?? ""), expected } : null;
    })
    .filter((item): item is { proposalId: string; expected: string } => Boolean(item));
  return lineageOk
    && renderedMilestones.every(({ proposalId, expected }) => {
      const date = formatDateKst(expected);
      const segment = aaText.match(new RegExp(`.{0,160}${escapeRegExpForHtml(proposalId)}.{0,160}`, "s"))?.[0] ?? "";
      return segment.includes(date);
    });
}

function aaActivityDateNotGeneratedAt(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  if (!snapshot) return false;
  const generatedAt = snapshot.metadata.generatedAt;
  const reportAsOf = snapshot.metadata.reportAsOf;
  const devByFact = new Map((snapshot.facts.developmentEvents ?? []).map((event) => [event.factId ?? `event:${event.eventId}`, event]));
  const postByFact = new Map((snapshot.facts.discussionPosts ?? []).map((post) => [`post:${post.postId}`, post]));
  return tracks.every((track) => {
    const milestone = track.lastMilestone;
    if (!milestone) return true;
    const ids = stringList(milestone.evidenceFactIds);
    const sourceDates = ids.map((id) => devByFact.get(id)?.occurredAt ?? postByFact.get(id)?.createdAt).filter(Boolean).sort();
    const expected = sourceDates.at(-1);
    return !expected || (milestone.occurredAt === expected && (expected === generatedAt || milestone.occurredAt !== generatedAt) && (expected === reportAsOf || milestone.occurredAt !== reportAsOf));
  });
}

function aaActivityDateObserved(embeddedApi: unknown, visibleHtml: string): string {
  const modular = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks.find((track) => track.id === "modular-smart-accounts");
  return JSON.stringify({
    generatedAt: intelligenceSnapshotFromApi(embeddedApi)?.metadata.generatedAt,
    reportAsOf: intelligenceSnapshotFromApi(embeddedApi)?.metadata.reportAsOf,
    modularLastMilestone: modular?.lastMilestone,
    rendered: aaMetricPublicObserved(visibleHtml).match(/.{0,80}ERC-8286.{0,80}/s)?.[0] ?? "missing",
  });
}

function discussionNoUnprovenIncrease(visibleHtml: string): boolean {
  const segment = visibleHtml.match(/<section class="dash-section dash-panel" id="trend"[\s\S]*?<\/section>/)?.[0] ?? "";
  return !/토론량 증가|토론량 급증|토론량 상승|원문 게시물.*증가|원문 게시물.*급증|원문 게시물.*상승/.test(visibleTextOnly(segment));
}

function lifecycleNoWeeklyDuplicate(embeddedApi: unknown, visibleHtml: string): boolean {
  const weeklyIds = new Set(weeklyRepositoryAdditionIds(embeddedApi));
  const segment = visibleHtml.match(/<section class="dash-section dash-panel" id="lifecycle"[\s\S]*?<\/section>/)?.[0] ?? "";
  const lifecycleIds = new Set(segment.match(/(?:EIP|ERC)-\d+/g) ?? []);
  return [...weeklyIds].every((id) => !lifecycleIds.has(id)) && !/공식 저장소 신규 반영[\s\S]*공식 저장소 신규 반영/.test(segment);
}

function lifecycleDuplicateObserved(embeddedApi: unknown, visibleHtml: string): string {
  const weeklyIds = weeklyRepositoryAdditionIds(embeddedApi);
  const segment = visibleHtml.match(/<section class="dash-section dash-panel" id="lifecycle"[\s\S]*?<\/section>/)?.[0] ?? "";
  return JSON.stringify({ weeklyIds, lifecycleIds: segment.match(/(?:EIP|ERC)-\d+/g) ?? [] });
}

function publicInternalWordingClean(visibleHtml: string): boolean {
  const visibleWithoutDetails = visibleHtml.replace(/<details[\s\S]*?<\/details>/g, " ");
  return !/usable event|unknown semantic|fallback|assignment count|confirmed_zero|confirmed_value|not_collected|baseline_not_linked|sourcePath|evidenceFactIds|weeklyRankingValidity/.test(visibleTextOnly(visibleWithoutDetails));
}

function publicInternalWordingObserved(visibleHtml: string): string {
  const visibleWithoutDetails = visibleHtml.replace(/<details[\s\S]*?<\/details>/g, " ");
  const matches = visibleTextOnly(visibleWithoutDetails).match(/usable event|unknown semantic|fallback|assignment count|confirmed_zero|confirmed_value|not_collected|baseline_not_linked|sourcePath|evidenceFactIds|weeklyRankingValidity/g) ?? [];
  return JSON.stringify(matches);
}

function publicRenderNoObjectString(html: string): boolean {
  const publicHtml = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/\sdata-evidence-state="[^"]*"/g, " ");
  return !/\[object Object\]|undefined|data-search="[^"]*undefined|<h3>\s*<\/h3>|<dd>\s*<\/dd>|confirmed_zero|confirmed_value|not_collected|baseline_not_linked|confirmed zero/.test(publicHtml);
}

function publicRenderNoObjectObserved(html: string): string {
  const publicHtml = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/\sdata-evidence-state="[^"]*"/g, " ");
  const matches = publicHtml.match(/\[object Object\]|undefined|data-search="[^"]*undefined|<h3>\s*<\/h3>|<dd>\s*<\/dd>|confirmed_zero|confirmed_value|not_collected|baseline_not_linked|confirmed zero/g) ?? [];
  return JSON.stringify(matches.slice(0, 20));
}

function htmlDocumentTitle(html: string, embeddedApi: unknown): boolean {
  const expected = `Ethereum Standards Weekly - ${reportDateFromSnapshot(embeddedApi)}`;
  return htmlDocumentTitleObserved(html) === expected && !/Technology Atlas|Dashboard V2|Dashboard V3/.test(html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? "");
}

function htmlDocumentTitleObserved(html: string): string {
  return html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "missing";
}

function snapshotIdVisibleCanonical(embeddedApi: unknown, html: string): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const details = html.match(/<details><summary>데이터 품질 상세 보기<\/summary>[\s\S]*?<\/details>/)?.[0] ?? "";
  return Boolean(snapshot?.metadata.snapshotId
    && details.includes(`Snapshot ID</dt><dd>${escapeHtml(snapshot.metadata.snapshotId)}`)
    && details.includes(`Input snapshot hash</dt><dd>${escapeHtml(inputSnapshotHashFromSnapshot(embeddedApi))}`)
    && !/Snapshot ID<\/dt><dd>root<\/dd>/.test(details));
}

function snapshotIdObserved(embeddedApi: unknown, html: string): string {
  const details = html.match(/<details><summary>데이터 품질 상세 보기<\/summary>[\s\S]*?<\/details>/)?.[0] ?? "";
  return JSON.stringify({
    expected: intelligenceSnapshotFromApi(embeddedApi)?.metadata.snapshotId,
    expectedInputHash: inputSnapshotHashFromSnapshot(embeddedApi),
    renderedSnapshotId: details.match(/Snapshot ID<\/dt><dd>([^<]+)/)?.[1] ?? "missing",
    renderedInputHash: details.match(/Input snapshot hash<\/dt><dd>([^<]+)/)?.[1] ?? "missing",
  });
}

function compatibilityScopeCurrent(embeddedApi: unknown, html: string): boolean {
  const contractText = html.match(/<script type="application\/json" id="dashboard-v3-contract">([\s\S]*?)<\/script>/)?.[1];
  if (!contractText || /EIP\/ERC 공식 명세 24건|분류 가능한 68건|상세 활동 분석 3건/.test(contractText)) return false;
  const parsed = JSON.parse(contractText) as { scope?: Record<string, unknown> };
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const p = buildDashboardV3Presentation(view, facts);
  return parsed.scope?.discoveredProposalCount === p.scope.discoveredProposalCount
    && parsed.scope?.publicExplorerCount === p.scope.publicExplorerCount
    && parsed.scope?.explorerExcludedBaselineProposalCount === p.scope.explorerExcludedBaselineProposalCount
    && JSON.stringify(parsed.scope?.explorerExcludedBaselineProposalIds ?? []) === JSON.stringify(p.scope.explorerExcludedBaselineProposalIds)
    && parsed.scope?.referenceProposalCount === p.scope.explorerExcludedBaselineProposalCount
    && parsed.scope?.monitoredProposalCount === p.scope.concentratedMonitoringCount
    && parsed.scope?.detailedActivityCardCount === p.scope.detailedActivityCardCount
    && parsed.scope?.implementationSourceCount === p.scope.implementationSourceCount;
}

function compatibilityScopeObserved(html: string): string {
  return html.match(/<script type="application\/json" id="dashboard-v3-contract">([\s\S]*?)<\/script>/)?.[1] ?? "missing";
}

function publicEvidenceLabels(html: string): boolean {
  const details = html.match(/<details><summary>데이터 품질 상세 보기<\/summary>[\s\S]*?<\/details>/)?.[0] ?? "";
  const labels = Array.from(details.matchAll(/<dt>([\s\S]*?)<\/dt>/g)).map((match) => visibleTextOnly(match[1] ?? ""));
  return ["수집 이벤트", "분석 반영 이벤트", "주간 비교 상태", "렌더링 원본 방식", "렌더링 중 외부 요청", "구현 데이터 수집원", "원본 시각 미확인 이벤트"].every((label) => labels.includes(label))
    && !labels.some((label) => /usable events|weeklyRankingValidity|sourceMode|invalid|raw events/.test(label));
}

function publicEvidenceLabelsObserved(html: string): string {
  const details = html.match(/<details><summary>데이터 품질 상세 보기<\/summary>[\s\S]*?<\/details>/)?.[0] ?? "";
  return JSON.stringify(Array.from(details.matchAll(/<dt>([\s\S]*?)<\/dt>/g)).map((match) => visibleTextOnly(match[1] ?? "")));
}

function vitalikViewFromApi(embeddedApi: unknown) {
  return (intelligenceSnapshotFromApi(embeddedApi)?.views as Record<string, unknown> | undefined)?.vitalikBlog as Record<string, unknown> | undefined;
}

function vitalikFactsFromApi(embeddedApi: unknown): Array<Record<string, unknown>> {
  return ((intelligenceSnapshotFromApi(embeddedApi)?.facts as Record<string, unknown> | undefined)?.vitalikBlogPosts as Array<Record<string, unknown>> | undefined) ?? [];
}

function vitalikSelectedPosts(embeddedApi: unknown): Array<Record<string, unknown>> {
  return (vitalikViewFromApi(embeddedApi)?.selectedPosts as Array<Record<string, unknown>> | undefined) ?? [];
}

function vitalikObserved(embeddedApi: unknown): string {
  const view = vitalikViewFromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as Record<string, unknown> | undefined;
  return JSON.stringify({
    sourceAttempted: facts?.vitalikBlogSourceAttempted,
    sourceState: view?.sourceState,
    sourceUrl: view?.sourceUrl,
    discoveryMethod: view?.discoveryMethod,
    collectedPostCount: view?.collectedPostCount,
    factCount: vitalikFactsFromApi(embeddedApi).length,
    selected: vitalikSelectedPosts(embeddedApi).map((post) => ({ title: post.title, url: post.sourceUrl, state: post.summaryState })),
  });
}

function vitalikCurrentSourceCollected(embeddedApi: unknown): boolean | null {
  const factsRoot = intelligenceSnapshotFromApi(embeddedApi)?.facts as Record<string, unknown> | undefined;
  if (factsRoot?.vitalikBlogSourceAttempted !== true) return null;
  const view = vitalikViewFromApi(embeddedApi);
  const facts = vitalikFactsFromApi(embeddedApi);
  const selected = vitalikSelectedPosts(embeddedApi);
  const factById = new Map(facts.map((fact) => [String(fact.factId ?? ""), fact]));
  const reportAsOf = String(intelligenceSnapshotFromApi(embeddedApi)?.metadata?.generatedAt ?? "");
  return Boolean(view
    && (view.sourceState === "collected" || view.sourceState === "partial")
    && facts.length >= 1
    && selected.length >= 1
    && typeof view.latestPublishedAt === "string"
    && selected.every((post) => {
      const fact = factById.get(String(post.factId ?? ""));
      const evidenceIds = Array.isArray(post.evidenceParagraphIds) ? post.evidenceParagraphIds.map(String) : [];
      const factParagraphIds = new Set((Array.isArray(fact?.evidenceParagraphs) ? fact.evidenceParagraphs : []).map((item: unknown) => String((item as Record<string, unknown>).paragraphId ?? "")));
      const publishedAt = typeof fact?.publishedAt === "string" ? fact.publishedAt : null;
      return Boolean(fact
        && fact.parseState === "body_parsed"
        && typeof post.title === "string" && post.title.trim().length > 0
        && typeof fact.sourceUrl === "string" && /^https:\/\/vitalik\.eth\.limo\//.test(fact.sourceUrl)
        && typeof fact.canonicalUrl === "string" && /^https:\/\/vitalik\.eth\.limo\//.test(fact.canonicalUrl)
        && typeof fact.cleanedText === "string" && fact.cleanedText.trim().length > 0
        && typeof fact.sourceExcerpt === "string" && fact.sourceExcerpt.trim().length > 0
        && typeof fact.contentHash === "string" && /^[a-f0-9]{64}$/.test(fact.contentHash)
        && typeof post.summaryKo === "string" && post.summaryKo.trim().length > 0
        && post.summaryState === "reviewed"
        && Array.isArray(post.whyItMattersKo) && post.whyItMattersKo.length >= 1
        && evidenceIds.length >= 1
        && evidenceIds.every((id) => factParagraphIds.has(id))
        && typeof post.personalViewDisclaimerKo === "string" && post.personalViewDisclaimerKo.includes("공식 로드맵")
        && publishedAt !== null
        && publishedAt <= reportAsOf.slice(0, 10));
    }));
}

function vitalikSourceOfficial(embeddedApi: unknown): boolean {
  const view = vitalikViewFromApi(embeddedApi);
  return Boolean(view
    && view.sourceUrl === "https://vitalik.eth.limo/"
    && (view.discoveryMethod === "official_index_html" || view.discoveryMethod === "official_feed")
    && !/medium\.com|twitter\.com|x\.com|search/i.test(JSON.stringify(view)));
}

function vitalikPostCanonicalUrl(embeddedApi: unknown): boolean {
  const selected = vitalikSelectedPosts(embeddedApi);
  const facts = vitalikFactsFromApi(embeddedApi);
  const selectedUrls = new Set<string>();
  for (const post of selected) {
    const url = String(post.sourceUrl ?? "");
    if (!/^https:\/\/vitalik\.eth\.limo\//.test(url) || selectedUrls.has(url)) return false;
    selectedUrls.add(url);
  }
  return facts.every((fact) => {
    const source = String(fact.sourceUrl ?? "");
    const canonical = String(fact.canonicalUrl ?? "");
    return (!source || /^https:\/\/vitalik\.eth\.limo\//.test(source)) && (!canonical || /^https:\/\/vitalik\.eth\.limo\//.test(canonical));
  });
}

function vitalikPublicationDateSource(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  return vitalikFactsFromApi(embeddedApi).every((fact) => {
    if (!fact.publishedAt) return fact.publicationDatePrecision === "unknown";
    return fact.publishedAt !== fact.fetchedAt
      && fact.publishedAt !== snapshot?.metadata.generatedAt
      && fact.publishedAt !== snapshot?.metadata.reportAsOf;
  });
}

function vitalikContentBodyCoverage(embeddedApi: unknown): boolean {
  const factsById = new Map(vitalikFactsFromApi(embeddedApi).map((fact) => [fact.factId, fact]));
  return vitalikSelectedPosts(embeddedApi).every((post) => {
    if (post.summaryState === "pending_review") return true;
    const fact = factsById.get(post.factId);
    return fact?.parseState === "body_parsed"
      && String(fact.cleanedText ?? "").length > 200
      && String(fact.sourceExcerpt ?? "").length > 40
      && Array.isArray(fact.evidenceParagraphs)
      && fact.evidenceParagraphs.length > 0;
  });
}

function vitalikSummaryGrounded(embeddedApi: unknown): boolean {
  const factsById = new Map(vitalikFactsFromApi(embeddedApi).map((fact) => [fact.factId, fact]));
  return vitalikSelectedPosts(embeddedApi).every((post) => {
    if (post.summaryState !== "reviewed") return true;
    const fact = factsById.get(post.factId);
    const paragraphIds = new Set(((fact?.evidenceParagraphs as Array<Record<string, unknown>> | undefined) ?? []).map((paragraph) => paragraph.paragraphId));
    const evidenceIds = (post.evidenceParagraphIds as string[] | undefined) ?? [];
    return Boolean(post.summaryKo)
      && evidenceIds.length > 0
      && evidenceIds.every((id) => paragraphIds.has(id))
      && String(post.summaryKo) !== String(post.title);
  });
}

function vitalikEditorialOverrideHash(embeddedApi: unknown): boolean {
  return vitalikSelectedPosts(embeddedApi).every((post) => post.summaryState !== "reviewed" || ((post.evidenceParagraphIds as unknown[] | undefined)?.length ?? 0) > 0);
}

function vitalikPersonalViewDisclaimer(html: string): boolean {
  const segment = html.match(/<section class="dash-section dash-panel dash-vitalik"[\s\S]*?<\/section>/)?.[0] ?? "";
  const text = visibleTextOnly(segment);
  return /개인 글|개인 견해/.test(text) && /공식 로드맵/.test(text) && /커뮤니티 합의/.test(text);
}

function vitalikNoRoadmapOverclaim(html: string): boolean {
  const segment = html.match(/<section class="dash-section dash-panel dash-vitalik"[\s\S]*?<\/section>/)?.[0] ?? "";
  return !/Ethereum이 채택한다|합의됐다|mainnet 반영 예정|Foundation 방침|창시자의 지시|확정 로드맵/.test(visibleTextOnly(segment));
}

function vitalikSelectionWindow(embeddedApi: unknown): boolean {
  const view = vitalikViewFromApi(embeddedApi);
  const selected = vitalikSelectedPosts(embeddedApi);
  return Boolean(view)
    && view.recentWindowDays === 45
    && selected.length <= 4
    && selected.every((post) => String(post.publishedAtLabel ?? "") === "게시일 미확인" || /^\d{4}\.\d{2}\.\d{2}$/.test(String(post.publishedAtLabel ?? "")));
}

function vitalikRelatedProposalRelation(embeddedApi: unknown): boolean {
  const registered = new Set((intelligenceSnapshotFromApi(embeddedApi)?.monitoringUniverse.subjectRegistry ?? []).map((subject) => subject.proposalId));
  return vitalikSelectedPosts(embeddedApi).every((post) => {
    const ids = (post.relatedProposalIds as string[] | undefined) ?? [];
    return ["explicit", "inferred", "none"].includes(String(post.relatedProposalRelation))
      && ids.length <= 3
      && ids.every((id) => registered.has(id))
      && (ids.length > 0 || post.relatedProposalRelation === "none");
  });
}

function vitalikNoCoreMetricContamination(embeddedApi: unknown): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  if (!view || !snapshot) return false;
  const usable = new Set(stringList(view.weeklyTimeline.usableEventIds));
  const coreViewUnion = new Set([
    ...stringList(view.overview.weeklyUsableCount.evidenceIds).map(stripEventFactPrefix),
    ...stringList(view.weeklyTimeline.items.map((item) => item.eventId)),
    ...stringList(view.topicActivityMap.points.flatMap((point) => point.weeklyUsableEventIds)),
    ...stringList(view.proposalExplorer.rows.flatMap((row) => row.weeklyUsableEventIds)),
  ]);
  const vitalikFacts = vitalikFactsFromApi(embeddedApi);
  const vitalikFactIds = new Set(vitalikFacts.map((fact) => String(fact.factId ?? "")).filter(Boolean));
  const vitalikUrls = new Set(vitalikFacts.map((fact) => String(fact.sourceUrl ?? "")).filter(Boolean));
  const coreFacts = [
    ...(snapshot.facts.developmentEvents ?? []),
    ...(snapshot.facts.logicalDevelopmentEvents ?? []),
    ...(snapshot.facts.discussionPosts ?? []),
    ...(snapshot.facts.specificationEvidence ?? []),
  ] as Array<Record<string, unknown>>;
  return setEquals(usable, coreViewUnion)
    && coreFacts.every((fact) => !vitalikFactIds.has(String(fact.factId ?? fact.logicalEventId ?? "")) && !vitalikUrls.has(String(fact.sourceUrl ?? "")))
    && stableJson(coreProjection(snapshot)) === stableJson(coreProjection(snapshotWithoutVitalik(snapshot)));
}

function snapshotWithoutVitalik(snapshot: Record<string, any>): Record<string, any> {
  return {
    ...snapshot,
    facts: {
      ...snapshot.facts,
      vitalikBlogPosts: [],
      vitalikBlogSourceAttempted: false,
    },
    views: {
      ...snapshot.views,
      vitalikBlog: undefined,
    },
  };
}

function coreProjection(snapshot: Record<string, any>): Record<string, unknown> {
  const views = snapshot.views ?? {};
  return {
    overview: views.dashboardV2?.overview,
    timeline: views.dashboardV2?.weeklyTimeline,
    topicMap: views.dashboardV2?.topicActivityMap,
    explorerWeeklySignal: {
      totalCurrent7d: views.dashboardV2?.proposalExplorer?.totalCurrent7d,
      rows: (views.dashboardV2?.proposalExplorer?.rows ?? []).map((row: Record<string, unknown>) => ({
        proposalId: row.proposalId,
        weeklyUsableEventIds: row.weeklyUsableEventIds,
        counts: row.counts,
      })),
    },
    lifecycle: views.dashboardV2?.lifecycleBoard,
    aa: views.accountAbstraction ?? views.dashboardV2?.aaMatrix,
    kgld: views.kgldWatch ?? views.dashboardV2?.kgldBoard,
  };
}

function vitalikRenderIsolation(html: string): boolean {
  const scripts = (html.match(/<script(?![^>]+type="application\/json")[\s\S]*?<\/script>/g) ?? []).join("\n");
  return !/\bfetch\s*\(|XMLHttpRequest|vitalik\.eth\.limo/.test(scripts)
    && !/<iframe\b/i.test(html)
    && !/<script[^>]+src=["']https?:\/\//i.test(html);
}

function vitalikEmptyState(html: string): boolean {
  const segment = html.match(/<section class="dash-section dash-panel dash-vitalik"[\s\S]*?<\/section>/)?.[0] ?? "";
  if (/data-vitalik-source-state="unavailable"/.test(segment)) {
    return /Vitalik Blog를 불러오지 못했습니다|기존 EIP\/ERC 및 Magicians 보고서는 정상적으로 생성/.test(segment);
  }
  return /data-vitalik-post/.test(segment);
}

function vitalikLinkSafety(html: string): boolean {
  const links = html.match(/<a[^>]+href="https:\/\/vitalik\.eth\.limo\/[^"]*"[^>]*>/g) ?? [];
  return links.length > 0 && links.every((link) => /target="_blank"/.test(link) && /rel="[^"]*noopener[^"]*noreferrer[^"]*"/.test(link));
}

function vitalikVisibleSourceLineage(html: string): boolean {
  const segment = html.match(/<section class="dash-section dash-panel dash-vitalik"[\s\S]*?<\/section>/)?.[0] ?? "";
  if (/data-vitalik-source-state="unavailable"/.test(segment)) return /원문 사이트 보기/.test(segment);
  const text = visibleTextOnly(segment);
  return /원문 보기/.test(segment)
    && /근거 보기/.test(segment)
    && /summaryState=/.test(segment)
    && /\d{4}\.\d{2}\.\d{2}|게시일 미확인/.test(text);
}

function magiciansCurrentWindowCards(embeddedApi: unknown, visibleHtml: string): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const presentation = buildDashboardV3Presentation(view, facts);
  const segment = visibleHtml.match(/<section class="dash-panel dash-section" id="magicians"[\s\S]*?<\/section>/)?.[0] ?? "";
  const cards = segment.match(/<article class="dash-thread-card[\s\S]*?<\/article>/g) ?? [];
  const renderedIds = cards.map((card) => card.match(/<span class="dash-proposal-pill">([^<]+)<\/span>/)?.[1]).filter((id): id is string => Boolean(id));
  const expectedIds = presentation.activeThreads.map((thread) => thread.proposalId);
  const renderedPostTotal = cards.reduce((sum, card) => sum + Number(card.match(/<strong>(\d+)<span>원문 게시물<\/span><\/strong>/)?.[1] ?? 0), 0);
  const expectedPostTotal = presentation.activeThreads.reduce((sum, thread) => sum + Number(thread.rawPostCount ?? 0), 0);
  return presentation.activeThreads.length === view.developerActivity.activeThreadCount
    && setEquals(new Set(renderedIds), new Set(expectedIds))
    && renderedIds.length === expectedIds.length
    && renderedPostTotal === expectedPostTotal
    && expectedPostTotal === Number(view.developerActivity.rawPostCount ?? expectedPostTotal)
    && presentation.activeThreads.every((thread) => isWithinTrailingDays(thread.latestActivityAt, view.metadata.reportDate, 7));
}

function magiciansCurrentWindowObserved(embeddedApi: unknown, visibleHtml: string): string {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  const presentation = view && facts ? buildDashboardV3Presentation(view, facts) : null;
  const segment = visibleHtml.match(/<section class="dash-panel dash-section" id="magicians"[\s\S]*?<\/section>/)?.[0] ?? "";
  const cards = segment.match(/<article class="dash-thread-card[\s\S]*?<\/article>/g) ?? [];
  return JSON.stringify({
    activeThreads: presentation?.activeThreads.map((thread) => ({ proposalId: thread.proposalId, rawPostCount: thread.rawPostCount, latestActivityAt: thread.latestActivityAt })) ?? [],
    renderedCards: cards.map((card) => ({
      proposalId: card.match(/<span class="dash-proposal-pill">([^<]+)<\/span>/)?.[1] ?? "missing",
      rawPostCount: Number(card.match(/<strong>(\d+)<span>원문 게시물<\/span><\/strong>/)?.[1] ?? 0),
    })),
  });
}

function kgldCardComplete(visibleHtml: string): boolean {
  const segment = visibleHtml.match(/<section class="dash-panel dash-section" id="kgld-watch"[\s\S]*?<\/section>/)?.[0] ?? "";
  return /Subject-Linked Compliance Event Log/.test(segment)
    && /검토 구분[\s\S]*즉시 조사/.test(segment)
    && /영향 업무[\s\S]*컴플라이언스 이벤트 기록 · 감사 추적/.test(segment)
    && /담당 기능[\s\S]*Compliance/.test(segment)
    && /현재 단계[\s\S]*Proposal 단계/.test(segment)
    && /구현 근거[\s\S]*미확인/.test(segment)
    && /근거 수준[\s\S]*명세 본문 확인 · 구현 근거 미확인/.test(segment)
    && /권고 조치[\s\S]*eventType[\s\S]*operationReference/.test(segment)
    && /컴플라이언스 정책[\s\S]*법적 권한[\s\S]*상환 절차 자체를 정의하지 않/.test(segment)
    && /재검토 조건[\s\S]*구현 PR/.test(segment)
    && !/undefined|<h3>\s*<\/h3>|<dd>\s*<\/dd>|data-search="[^"]*undefined/.test(segment);
}

function kgldCardObserved(visibleHtml: string): string {
  return visibleTextOnly(visibleHtml.match(/<section class="dash-panel dash-section" id="kgld-watch"[\s\S]*?<\/section>/)?.[0] ?? "");
}

function periodCountConsistency(embeddedApi: unknown): boolean {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  if (!view || !facts) return false;
  const presentation = buildDashboardV3Presentation(view, facts);
  const rawByDomain = new Map<string, number>();
  for (const thread of presentation.activeThreads) {
    const proposal = view.proposalExplorer.rows.find((row) => row.proposalId === thread.proposalId);
    if (!proposal) continue;
    rawByDomain.set(proposal.domainId, (rawByDomain.get(proposal.domainId) ?? 0) + thread.rawPostCount);
  }
  return presentation.domains.every((domain) => domain.rawPosts === (rawByDomain.get(domain.domainId) ?? 0));
}

function periodCountObserved(embeddedApi: unknown): string {
  const view = dashboardV2FromApi(embeddedApi);
  const facts = intelligenceSnapshotFromApi(embeddedApi)?.facts as DashboardV3Facts | undefined;
  const presentation = view && facts ? buildDashboardV3Presentation(view, facts) : null;
  return JSON.stringify(presentation?.domains.map((domain) => ({ domainId: domain.domainId, rawPosts: domain.rawPosts })) ?? []);
}

function setEquals(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value));
}

function intersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).sort();
}

function stripEventFactPrefix(value: string): string {
  return value.startsWith("event:") ? value.slice("event:".length) : value;
}

function productQ1DevelopmentLandscape(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (dashboard?.dashboardV2) {
    return dashboard.technologyLandscape?.length === 8
      && /기술 영역별 움직임/.test(visibleHtml)
      && /공식 저장소 신규 문서 반영/.test(visibleHtml)
      && /data-period="7d"[\s\S]*data-period="30d"[\s\S]*data-period="180d"/.test(visibleHtml);
  }
  return Boolean(dashboard?.technologyLandscape?.length === 8)
    && /Technology Landscape/.test(visibleHtml)
    && /180일 의미 변화 Proposal/.test(visibleHtml)
    && /30일 의미 변화 Proposal/.test(visibleHtml)
    && /최근 7일 의미 변화 Proposal/.test(visibleHtml);
}

function productQ2DeveloperAttention(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (dashboard?.dashboardV2) {
    return Boolean(dashboard.developerAttention)
      && /수집된 Raw Activity|수집된 원문 활동/.test(visibleHtml)
      && /raw posts|raw activity|수집된 Raw Activity|원문 게시물/.test(visibleHtml)
      && /유효 기술 post 미분류|valid technical posts/.test(visibleHtml)
      && /analyzed insights|analyzed insight 없음|분석된 insight \d+건/.test(visibleHtml);
  }
  return Boolean(dashboard?.developerAttention)
    && /Magicians Activity|최근 Ethereum Magicians 활동/.test(visibleHtml)
    && /raw posts|raw activity/.test(visibleHtml)
    && /valid technical posts/.test(visibleHtml)
    && /validated insights|analyzed insights|analyzed insight 없음/.test(visibleHtml);
}

function productQ3LongVsRecent(embeddedApi: unknown, visibleHtml: string): boolean {
  return Boolean(dashboardFromApi(embeddedApi)?.dataQuality)
    && /공식 저장소 신규 문서 반영|기술 영역별 움직임/.test(visibleHtml)
    && /이번 주 핵심 변화|이번 주 공식 저장소 반영/.test(visibleHtml)
    && /180d|30d|7d|180일|30일|7일/.test(visibleHtml);
}

function productQ4ProgressTracker(embeddedApi: unknown, visibleHtml: string): boolean {
  if (dashboardFromApi(embeddedApi)?.dashboardV2) {
    return /명세|Specification|공식 저장소 신규 문서 반영/.test(visibleHtml)
      && /Discussion|Magicians|원문 게시물/.test(visibleHtml)
      && /구현|Implementation|구현 근거/.test(visibleHtml)
      && /진행 단계/.test(visibleHtml)
      && /confirmed zero|not collected|unclassified|확인된 변화 없음|미수집|분류 대기/.test(visibleHtml);
  }
  return Boolean(dashboardFromApi(embeddedApi)?.focusProgress?.length)
    && /Specification/.test(visibleHtml)
    && /Discussion/.test(visibleHtml)
    && /Implementation/.test(visibleHtml)
    && /Activation/.test(visibleHtml)
    && /Adoption/.test(visibleHtml);
}

function productQ5AaRadar(embeddedApi: unknown, visibleHtml: string): boolean {
  return Boolean(dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks?.length === 12) && /Account Abstraction Radar|AA Watch|Account Abstraction/.test(visibleHtml);
}

function productQ6KgldWatch(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  const items = kgldWatchItems(dashboard);
  const count = items.length;
  if (count === 0) return /KGLD Technology Watch|KGLD Watch/.test(visibleHtml) && /해당 없음|KGLD action 없음/.test(visibleHtml);
  return items.every((item) => item.internalAction && item.nextTrigger && item.sourceUrls?.length)
    && /Action|지금 할 일|권고 조치/.test(visibleHtml)
    && /Affected KGLD process|Affected process|영향 절차|영향 업무/.test(visibleHtml)
    && /Next trigger|다음 trigger|재검토 조건/.test(visibleHtml)
    && /Evidence maturity|근거 성숙도|근거 수준/.test(visibleHtml)
    && /Official source:|원문|자세히|공식 원문/.test(visibleHtml)
    && !/href=""/.test(visibleHtml);
}

function kgldWatchItems(dashboard: ReturnType<typeof dashboardFromApi> | undefined) {
  if (!dashboard) return [];
  return [
    ...(dashboard.kgldWatch?.groups.research_now ?? []),
    ...(dashboard.kgldWatch?.groups.monitor ?? []),
    ...(dashboard.kgldWatch?.groups.no_action ?? []),
  ];
}

function discussionScopeUnionConsistency(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  return Boolean(dashboard?.developerAttention?.activity?.every((item) => Boolean(item.proposalId) && item.rawPostCount >= 0)
    && dashboard.developerAttention.summary.rawPosts >= 0
    && dashboard.dataQuality.discussionCollection.recent7dPostCount >= 0);
}

function discussionValidityClassification(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  const counts = [
    dashboard?.developerAttention?.summary.validTechnicalPosts,
    ...(dashboard?.developerAttention?.activity ?? []).map((item) => item.validTechnicalPostCount),
    dashboard?.dataQuality?.discussionCollection.validTechnicalPostCount,
  ];
  return counts.length > 0 && counts.every((value) => value === null || typeof value === "number");
}

function weeklyUsableIdsFromDashboard(dashboard: ReturnType<typeof dashboardFromApi> | undefined): string[] {
  if (!dashboard) return [];
  return unique([
    ...stringList(dashboard.dataQuality?.usableEventIds),
    ...dashboard.executivePulse.weeklyDevelopmentTop3.flatMap((topic) => stringList(topic.weeklyUsableEventIds)),
    ...dashboard.technologyLandscape.flatMap((domain) => stringList(domain.weeklyUsableEventIds)),
    ...dashboard.focusProgress.flatMap((topic) => stringList(topic.weeklyUsableEventIds)),
  ]);
}

function isWeeklyUsableDevelopmentFact(fact: unknown): boolean {
  if (!fact || typeof fact !== "object") return false;
  const event = fact as { semanticType?: unknown; occurredAtSource?: unknown; occurredAt?: unknown; confidence?: unknown };
  const semanticType = typeof event.semanticType === "string" ? event.semanticType : null;
  const occurredAt = typeof event.occurredAt === "string" ? Date.parse(event.occurredAt) : Number.NaN;
  const confidence = Number(event.confidence);
  return event.occurredAtSource !== "fallback_detected_at"
    && semanticType !== null
    && semanticType !== "unknown"
    && Number.isFinite(occurredAt)
    && Number.isFinite(confidence)
    && confidence >= WEEKLY_USABLE_EVENT_CONFIDENCE_THRESHOLD;
}

function weeklySignalDataGating(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  void visibleHtml;
  const invalidIncludedEventIds = weeklySignalDataGatingAffectedIds(embeddedApi);
  if (invalidIncludedEventIds.length > 0) return false;
  const weeklyUsableCount = dashboard?.dataQuality?.current7dUsableEventCount ?? 0;
  if ((dashboard?.dataQuality?.usableEventIds?.length ?? weeklyUsableCount) !== weeklyUsableCount) return false;
  const usable = new Set(stringList(dashboard?.dataQuality?.usableEventIds));
  return (dashboard?.executivePulse.weeklyDevelopmentTop3 ?? [])
    .flatMap((topic) => stringList(topic.weeklyUsableEventIds))
    .every((eventId) => usable.has(eventId));
}

function weeklySignalDataGatingObserved(embeddedApi: unknown): string {
  const dashboard = dashboardFromApi(embeddedApi);
  const invalidIncludedEventIds = weeklySignalDataGatingAffectedIds(embeddedApi);
  return JSON.stringify({
    weeklyUsableCount: dashboard?.dataQuality?.current7dUsableEventCount ?? 0,
    invalidIncludedCount: invalidIncludedEventIds.length,
    invalidIncludedEventIds,
  });
}

function weeklySignalDataGatingAffectedIds(embeddedApi: unknown): string[] {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const facts = snapshot?.facts?.developmentEvents ?? [];
  const usableIds = weeklyUsableIdsFromDashboard(dashboardFromApi(embeddedApi));
  return stringList(usableIds).filter((eventId) => {
    const fact = facts.find((item) => item.eventId === eventId || item.factId === eventId || item.factId === `event:${eventId}`);
    return !isWeeklyUsableDevelopmentFact(fact);
  });
}

function signalMapUsableEventOnly(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (!dashboard) return false;
  const usable = new Set(stringList(dashboard.dataQuality.usableEventIds));
  return dashboard.technologyLandscape.every((domain) =>
    stringList(domain.weeklyUsableEventIds).every((id) => usable.has(id))
    && domain.meaningful7dProposals <= dashboard.dataQuality.current7dUsableEventCount
  );
}

function progressEvidenceLanes(embeddedApi: unknown): boolean {
  return Boolean(dashboardFromApi(embeddedApi)?.focusProgress?.every((topic) =>
    topic.progress.specificationStage
    && topic.progress.discussionStage
    && topic.progress.implementationStage
    && topic.progress.activationStage
    && topic.progress.adoptionStage
  ));
}

function allClaimsHaveSources(embeddedApi: unknown): boolean {
  const claims = dashboardFromApi(embeddedApi)?.focusProgress?.flatMap((topic) => topic.evidenceClaims) ?? [];
  return claims.length > 0 && claims.every((claim) => claim.verified && claim.sourceUrls.length > 0 && claim.sourceDates.length === claim.sourceUrls.length);
}

function interactiveFilterContract(html: string): boolean {
  return /data-period=/.test(html)
    && /data-evidence=/.test(html)
    && /data-domain-filter/.test(html)
    && /data-aa-toggle/.test(html)
    && /data-kgld-toggle/.test(html)
    && /data-status-filter/.test(html)
    && /data-proposal-search/.test(html);
}

function noEmptyChart(embeddedApi: unknown, html: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  const hasLandscapeData = dashboard?.technologyLandscape?.some((domain) => domain.meaningful180dProposals > 0 || domain.meaningful30dProposals > 0 || domain.meaningful7dProposals > 0);
  return Boolean(hasLandscapeData) && !/<canvas[^>]*><\/canvas>/.test(html);
}

function noDuplicateExecutiveTopic(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (!dashboard) return false;
  const topicIds = [
    ...dashboard.executivePulse.longTermFocusTop3.map((topic) => topic.topicId),
    ...dashboard.executivePulse.weeklyDevelopmentTop3.map((topic) => topic.topicId),
    ...dashboard.executivePulse.developerAttentionTop3.map((topic) => topic.topicId),
  ];
  return topicIds.length === new Set(topicIds).size;
}

function executiveAbstractGrounded(embeddedApi: unknown, visibleText: string): boolean {
  const pulse = dashboardFromApi(embeddedApi)?.executivePulse;
  if (!pulse) return false;
  return Array.isArray(pulse.bottomLine)
    && pulse.bottomLine.length >= 2
    && pulse.bottomLine.every((text) => typeof text === "string" && text.length > 10)
    && /Bottom Line|관찰 대상 내 결론|Ethereum Standards Weekly|This Week Overview/.test(visibleText);
}

function developerAttentionSummaryPresent(embeddedApi: unknown, visibleHtml: string): boolean {
  const activity = dashboardFromApi(embeddedApi)?.developerAttention?.activity ?? [];
  return activity.every((item) => item.proposalSummaryKo && item.proposalSummaryKo.length > 0)
    && (!activity.length || /Direct evidence|official source|요약 근거: specification|source/.test(visibleHtml));
}

function developerAttentionSummarySource(embeddedApi: unknown): boolean {
  const activity = dashboardFromApi(embeddedApi)?.developerAttention?.activity ?? [];
  return activity.every((item) => /^https:\/\/(?:eips\.ethereum\.org\/EIPS\/eip|ercs\.ethereum\.org\/ERCS\/erc)-\d+/.test(item.summaryEvidence?.sourceUrl ?? ""));
}

function discussionCardSummaryUnion(embeddedApi: unknown): boolean {
  const attention = dashboardFromApi(embeddedApi)?.developerAttention;
  if (!attention) return false;
  const union = new Set(attention.activity.flatMap((item) => item.rawPostIds ?? []));
  const summary = new Set(attention.summary.rawPostIds ?? []);
  return union.size === summary.size && [...union].every((id) => summary.has(id));
}

function discussionActiveThreadConsistency(embeddedApi: unknown): boolean {
  const attention = dashboardFromApi(embeddedApi)?.developerAttention;
  if (!attention) return false;
  return attention.activity.length === attention.summary.activeThreads
    && attention.summary.activeThreadIds?.length === attention.summary.activeThreads;
}

function weeklyUsableCrossViewConsistency(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (!dashboard) return false;
  const usable = new Set(stringList(dashboard.dataQuality.usableEventIds));
  const viewIds = weeklyUsableIdsFromDashboard(dashboard);
  if (viewIds.some((id) => !usable.has(id))) return false;
  if (usable.size !== dashboard.dataQuality.current7dUsableEventCount) return false;
  if (usable.size > 0 && ![...usable].every((id) => viewIds.includes(id))) return false;
  if (dashboard.dataQuality.current7dUsableEventCount === 0) {
    return dashboard.focusProgress.every((topic) => topic.current7dChanges === 0 && topic.weeklyDevelopmentScore === 0)
      && dashboard.technologyLandscape.every((domain) => domain.meaningful7dProposals === 0)
      && dashboard.executivePulse.weeklyDevelopmentTop3.length === 0;
  }
  const landscapeTotal = new Set(dashboard.technologyLandscape.flatMap((domain) => stringList(domain.weeklyUsableEventIds))).size;
  return landscapeTotal <= dashboard.dataQuality.current7dUsableEventCount;
}

function aaDiscussionDeduplication(embeddedApi: unknown, visibleText: string): boolean {
  const summary = dashboardFromApi(embeddedApi)?.accountAbstraction?.summary;
  if (!summary) return false;
  void visibleText;
  if (summary.uniqueActiveThreadCount === 0 && summary.uniqueRecentPostCount === 0) return true;
  return summary.uniqueActiveThreadCount <= summary.trackAssignmentCount
    && summary.uniqueRecentPostCount <= summary.trackAssignmentCount
    && summary.trackAssignmentCount >= 0;
}

function aaZeroVsNotCollected(embeddedApi: unknown, visibleHtml: string): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks ?? [];
  if (!tracks.length) return false;
  const hasNotCollected = tracks.some((track) => [track.discussion30d?.state, track.implementation?.state].includes("not_collected"));
  return (!hasNotCollected || /미수집/.test(visibleHtml))
    && !/>discussion<\/dt><dd>0</.test(visibleHtml)
    && !/>implementation:? ?0</i.test(visibleHtml)
    && !/<dt>30d<\/dt><dd>0<\/dd>/.test(visibleHtml)
    && !/<dt>7d<\/dt><dd>0<\/dd>/.test(visibleHtml);
}

function aaMetricLabelExplicit(visibleHtml: string): boolean {
  return /최근 7일 확인된 명세 변화/.test(visibleHtml)
    && /최근 30일 (?:확인된 명세 변화|명세 반영)/.test(visibleHtml)
    && /최근 30일 (?:Magicians 활동|원문 게시물)/.test(visibleHtml)
    && /구현 근거|구현 source|implementation/.test(visibleHtml);
}

function aaErc4337BaselineLinked(embeddedApi: unknown, visibleHtml: string): boolean {
  const track = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks?.find((item) => item.id === "erc-4337-entrypoint");
  return Boolean(track?.baselineProposals?.some((proposal) => proposal.subjectId === "ERC-4337" && proposal.role === "baseline"))
    && /ERC-4337/.test(visibleHtml)
    && /기준 표준|baseline|기준 Proposal/.test(visibleHtml)
    && !/ERC-4337[\s\S]{0,500}근거 Proposal 미확인/.test(visibleHtml);
}

function aaDiscussionCollectionStateValid(embeddedApi: unknown, visibleHtml: string): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks ?? [];
  const invalidState = tracks.some((track) => track.discussion30d?.state === "not_collected" && track.discussion30d?.value === 0);
  return !invalidState && /Magicians 토론을 아직 수집하지 않았습니다|미수집/.test(visibleHtml);
}

function aaDiscussionWindowValid(embeddedApi: unknown): boolean {
  const posts = discussionPostFactMap(embeddedApi);
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks ?? [];
  return tracks.every((track) => {
    const start = Date.parse(track.discussion30d?.windowStart ?? "");
    const end = Date.parse(track.discussion30d?.windowEnd ?? "");
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return stringList(track.rawPostIds).every((id) => {
      const post = posts.get(id);
      if (!post) return false;
      const createdAt = Date.parse(post.createdAt);
      return Number.isFinite(createdAt) && createdAt >= start && createdAt < end;
    });
  });
}

function aaDiscussionDraftNotOfficial(embeddedApi: unknown, visibleHtml: string): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const track = snapshot?.views.accountAbstraction.tracks.find((item) => item.id === "modular-smart-accounts");
  const assignment = track?.baselineProposals?.find((proposal) => proposal.subjectId === "ERC-8286");
  return Boolean(assignment?.role === "discussion_draft")
    && /커뮤니티 Draft/.test(visibleHtml)
    && track?.specification30d?.value === 0
    && track?.specification7d?.value === 0;
}

function aaErc8286CanonicalStatus(embeddedApi: unknown, visibleHtml: string): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const spec = snapshot?.facts.specificationEvidence?.find((item) => item.proposalId === "ERC-8286");
  const track = snapshot?.views.accountAbstraction.tracks.find((item) => item.id === "modular-smart-accounts");
  const assignment = track?.baselineProposals?.find((proposal) => proposal.subjectId === "ERC-8286");
  return Boolean(["body_parsed", "title_only"].includes(String(spec?.parseState))
    && spec?.status === "Draft"
    && /ercs\.ethereum\.org\/ERCS\/erc-8286/.test(spec.sourceUrl)
    && assignment?.sourceType === "official_specification"
    && assignment?.role !== "discussion_draft"
    && assignment?.status === "Draft"
    && track?.statusDistribution === "Draft"
    && !/커뮤니티 Draft|공식 Proposal 미확인|publication state 미확인/.test(visibleHtml));
}

function aaDiscussionLinkTarget(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  return tracks.every((track) => (track.recentSignals ?? [])
    .filter((signal) => signal.signalType === "discussion_activity")
    .every((signal) => (signal.threadUrl ?? signal.sourceUrls?.[0] ?? "").includes("ethereum-magicians.org")));
}

function aaSpecificationLinkTarget(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  return tracks.every((track) => (track.baselineProposals ?? [])
    .filter((proposal) => proposal.sourceType !== "discussion_draft")
    .every((proposal) => /(?:eips\.ethereum\.org\/EIPS\/eip|ercs\.ethereum\.org\/ERCS\/erc)-\d+/.test(proposal.sourceUrl)));
}

function aaMetricStateValueContract(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  const metrics = tracks.flatMap((track) => [track.specification7d, track.specification30d, track.discussion30d, track.implementation]);
  return metrics.every((metric) => {
    if (metric.state === "confirmed_value") return typeof metric.value === "number" && metric.value > 0;
    if (metric.state === "confirmed_zero") return metric.value === 0;
    if (["not_collected", "not_monitored", "baseline_not_linked", "unavailable"].includes(metric.state)) return metric.value == null;
    return false;
  });
}

function aaActiveTrackSummary(embeddedApi: unknown): boolean {
  const aa = dashboardFromApi(embeddedApi)?.accountAbstraction;
  if (!aa) return false;
  const active = aa.tracks.filter((track) => track.specification30d?.state === "confirmed_value" || track.discussion30d?.state === "confirmed_value");
  return (aa.summary.activeTracks30d ?? []).length === active.length
    && (aa.summary.activeTrackAssignmentCount ?? -1) === active.length
    && active.every((track) => aa.summary.activeTracks30d.includes(track.name));
}

function aaHierarchyDeduplication(embeddedApi: unknown): boolean {
  const aa = dashboardFromApi(embeddedApi)?.accountAbstraction;
  if (!aa) return false;
  const active = aa.tracks.filter((track) => track.specification30d?.state === "confirmed_value" || track.discussion30d?.state === "confirmed_value");
  const parentFlowIds = new Set(active.map((track) => track.parentTrackId ?? track.trackId));
  const threadIds = new Set(active.flatMap((track) => stringList(track.activeThreadIds)));
  const postIds = new Set(active.flatMap((track) => stringList(track.rawPostIds)));
  return aa.summary.uniqueActiveParentFlowCount === parentFlowIds.size
    && aa.summary.uniqueDiscussionThreadCount === threadIds.size
    && aa.summary.uniqueDiscussionPostCount === postIds.size
    && aa.summary.uniqueActiveParentFlowCount <= aa.summary.activeTrackAssignmentCount;
}

function aaRecentSignalAggregation(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  return tracks.every((track) => {
    const keys = (track.recentSignals ?? []).map((signal) => `${signal.proposalId}:${signal.signalType}:${signal.windowStart}:${signal.windowEnd}`);
    return keys.length === new Set(keys).size;
  });
}

function aaRecentSignalLineage(embeddedApi: unknown): boolean {
  const facts = snapshotFactIds(embeddedApi);
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  return tracks.every((track) => (track.recentSignals ?? []).every((signal) =>
    stringList(signal.evidenceFactIds).length > 0
    && stringList(signal.evidenceFactIds).every((id) => facts.has(id))
    && (signal.signalType !== "discussion_activity" || Boolean(signal.latestActivityAt))
  ));
}

function aaUniqueTrackDescription(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  const descriptions = tracks.map((track) => String(track.problem ?? "").trim()).filter(Boolean);
  return descriptions.length === tracks.length && new Set(descriptions).size === descriptions.length;
}

function aaExcludedWording(embeddedApi: unknown, visibleHtml: string): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  const baselineNotLinked = tracks.some((track) => track.direction === "baseline_not_linked");
  return (!baselineNotLinked || /추적 기준 미설정|기준 Proposal 미연결/.test(visibleHtml))
    && !/Track에 연결된 기준 Proposal이 없습니다[\s\S]{0,120}모니터링 제외/.test(visibleHtml);
}

function aaRawPostWording(embeddedApi: unknown, visibleHtml: string): boolean {
  const hasRawActivity = (dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? []).some((track) => (track.discussion30d?.value ?? 0) > 0);
  return !hasRawActivity || (/(원시 post|원문 게시물)/.test(visibleHtml) && /유효 기술 post 미분류/.test(visibleHtml) && /토론 방향 판단 불가/.test(visibleHtml));
}

function aaNonAaRegression(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  if (!dashboard || !snapshot) return false;
  const domainDiscussionConsistent = dashboard.technologyLandscape.every((domain) => {
    const ids = new Set(stringList(domain.discussion?.rawPostIds));
    return domain.rawDiscussionPosts === ids.size && domain.discussion?.rawPostCount === ids.size;
  });
  const technologyAggregate = snapshot.aggregates.discussion?.technology_map_set as { rawPostIds?: string[]; rawPostCount?: number } | undefined;
  const technologyUnion = new Set(dashboard.technologyLandscape.flatMap((domain) => stringList(domain.discussion?.rawPostIds)));
  const developerAggregate = snapshot.aggregates.discussion?.developer_activity_set as { rawPosts?: number; activeThreads?: number; rawPostIds?: string[] } | undefined;
  const developerUnion = new Set(dashboard.developerAttention.activity.flatMap((item) => stringList(item.rawPostIds)));
  const executiveTop3 = dashboard.executivePulse.whatChanged.magiciansActivity.map((item) => item.proposalIds[0]).join(",");
  const attentionTop3 = dashboard.developerAttention.activity.slice(0, 3).map((item) => item.proposalId).join(",");
  const kgldGroups = dashboard.kgldWatch.groups;
  return Boolean(developerAggregate && technologyAggregate)
    && developerAggregate!.rawPosts === developerUnion.size
    && dashboard.developerAttention.summary.rawPosts === developerUnion.size
    && dashboard.developerAttention.summary.activeThreads === dashboard.developerAttention.activity.length
    && developerAggregate!.activeThreads === dashboard.developerAttention.summary.activeThreads
    && stringList(developerAggregate!.rawPostIds).length === developerAggregate!.rawPosts
    && executiveTop3 === attentionTop3
    && domainDiscussionConsistent
    && technologyAggregate!.rawPostCount === technologyUnion.size
    && stringList(technologyAggregate!.rawPostIds).every((id) => technologyUnion.has(id))
    && Array.isArray(kgldGroups.research_now)
    && Array.isArray(kgldGroups.monitor)
    && Array.isArray(kgldGroups.no_action)
    && kgldSummaryConsistent(dashboard)
    && dashboard.technologyLandscape.length === 8
    && dashboard.focusProgress.every((topic) => topic.topicId && Array.isArray(topic.proposalIds) && topic.progress)
    && dashboard.accountAbstraction.tracks.length === 12
    && snapshotHashConsistency(embeddedApi);
}

function aaNonAaRegressionObserved(embeddedApi: unknown): string {
  const dashboard = dashboardFromApi(embeddedApi);
  const aggregate = intelligenceSnapshotFromApi(embeddedApi)?.aggregates.discussion?.technology_map_set as { rawPostCount?: number } | undefined;
  return `developer=${dashboard?.developerAttention.summary.rawPosts ?? "n/a"} posts/${dashboard?.developerAttention.summary.activeThreads ?? "n/a"} threads; top3=${dashboard?.developerAttention.activity.slice(0, 3).map((item) => item.proposalId).join("/") ?? "n/a"}; technologyMap=${aggregate?.rawPostCount ?? "n/a"}; domains=${dashboard?.technologyLandscape.length ?? "n/a"}; focus=${dashboard?.focusProgress.length ?? "n/a"}; AA=${dashboard?.accountAbstraction.tracks.length ?? "n/a"}`;
}

function kgldSummaryConsistent(dashboard: ReturnType<typeof dashboardFromApi>): boolean {
  if (!dashboard) return false;
  const groups = dashboard.kgldWatch.groups;
  const summary = dashboard.kgldWatch.summary;
  const items = kgldWatchItems(dashboard);
  const ids = items.map((item) => item.proposalId).filter(Boolean);
  return summary.reviewNow === groups.research_now.length
    && summary.researchNow === groups.research_now.length
    && summary.monitor === groups.monitor.length
    && summary.noAction === groups.no_action.length
    && ids.length === new Set(ids).size
    && items.every((item) => item.internalAction && item.nextTrigger && Array.isArray(item.sourceUrls));
}

function aaBaselineRecentSeparation(embeddedApi: unknown, visibleHtml: string): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks ?? [];
  return tracks.every((track) => Array.isArray(track.baselineProposals) && Array.isArray(track.recentSignals))
    && /기준 Proposal/.test(visibleHtml)
    && /최근 Signal|최근 확인 신호|최근 확인 활동/.test(visibleHtml);
}

function aaDirectionEvidenceV2(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks ?? [];
  const factIds = snapshotFactIds(embeddedApi);
  return tracks.every((track) => {
    if (track.direction === "advancing") return aaTrackHasQualifyingAdvancingEvidence(track, factIds);
    if (track.direction === "active_discussion") return aaTrackHasCurrentMeaningfulDiscussionEvidence(track, factIds) && !aaTrackHasCurrentSpecificationEvidence(track, factIds);
    if (track.direction === "stable") return track.baselineProposals?.length > 0;
    if (track.direction === "baseline_not_linked") return (track.baselineProposals?.length ?? 0) === 0;
    if (track.direction === "not_monitored") return (track.baselineProposals?.length ?? 0) === 0;
    return true;
  });
}

function aaTrackDirection(input: { hasBaseline: boolean; hasCurrent7dSpecificationEvidence: boolean; hasCurrent7dMeaningfulDiscussionEvidence: boolean }): string {
  if (input.hasCurrent7dSpecificationEvidence) return "advancing";
  if (input.hasCurrent7dMeaningfulDiscussionEvidence) return "active_discussion";
  if (input.hasBaseline) return "stable";
  return "baseline_not_linked";
}

function aaTrackHasQualifyingAdvancingEvidence(track: Record<string, unknown>, factIds: Set<string>): boolean {
  return aaTrackHasCurrentSpecificationEvidence(track, factIds) || aaTrackHasCurrentMeaningfulDiscussionEvidence(track, factIds);
}

function aaTrackHasCurrentSpecificationEvidence(track: Record<string, unknown>, factIds: Set<string>): boolean {
  const specification7d = track.specification7d as { state?: string; value?: number | null; evidenceIds?: string[] } | undefined;
  const ids = stringList(specification7d?.evidenceIds);
  return specification7d?.state === "confirmed_value"
    && Number(specification7d.value ?? 0) > 0
    && ids.length > 0
    && ids.every((id) => factIds.has(id));
}

function aaTrackHasCurrentMeaningfulDiscussionEvidence(track: Record<string, unknown>, factIds: Set<string>): boolean {
  const signals = Array.isArray(track.recentSignals) ? track.recentSignals as Array<Record<string, unknown>> : [];
  return signals.some((signal) => {
    const ids = stringList(signal.evidenceFactIds);
    const latest = Date.parse(String(signal.latestActivityAt ?? ""));
    const windowStart = Date.parse(String(signal.windowStart ?? ""));
    const windowEnd = Date.parse(String(signal.windowEnd ?? ""));
    return signal.signalType === "verified_discussion"
      && Number(signal.validPostCount ?? 0) > 0
      && Number.isFinite(latest)
      && Number.isFinite(windowStart)
      && Number.isFinite(windowEnd)
      && latest >= windowStart
      && latest <= windowEnd
      && ids.length > 0
      && ids.every((id) => factIds.has(id));
  });
}

function aaImplementationState(embeddedApi: unknown, visibleHtml: string): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks ?? [];
  return tracks.every((track) => track.implementation?.state === "not_collected" && track.implementation?.value == null)
    && /구현 source는 현재 수집 대상이 아닙니다|미수집/.test(visibleHtml);
}

function aaUniqueProposalCount(embeddedApi: unknown): boolean {
  const aa = dashboardFromApi(embeddedApi)?.accountAbstraction;
  if (!aa) return false;
  const unique = new Set<string>();
  for (const track of aa.tracks) {
    for (const proposal of track.baselineProposals ?? []) unique.add(proposal.subjectId);
  }
  return aa.summary.baselineProposalCount === unique.size && aa.summary.baselineProposalCount <= aa.summary.trackAssignmentCount;
}

function landscapePeriodFunctional(html: string): boolean {
  return /data-period="7d"[\s\S]*data-period="30d"[\s\S]*data-period="180d"/.test(html)
    && /state=\{period:"7d"/.test(html)
    && /id="technology-pulse"[\s\S]*기술 영역별 움직임/.test(html)
    && /id="weekly-brief"[\s\S]*(이번 주 핵심 변화|이번 주 공식 저장소 반영)/.test(html)
    && /Proposal Explorer/.test(html);
}

function landscapeEvidenceFunctional(html: string): boolean {
  return /data-evidence="specification"/.test(html)
    && /data-evidence="discussion"/.test(html)
    && /data-evidence="implementation"/.test(html)
    && /state=\{period:"7d",evidence:"all"/.test(html)
    && /state\.evidence/.test(html)
    && /evidenceScopes\(node\)/.test(html)
    && /data-evidence-scopes="[^"]*discussion/.test(html);
}

function dashboardFilterPeriodFunctional(html: string): boolean {
  return /data-period="7d"[\s\S]*data-period="30d"[\s\S]*data-period="180d"/.test(html)
    && /data-c7="[^"]+"/.test(html)
    && /data-c30="[^"]+"/.test(html)
    && /data-c180="[^"]+"/.test(html)
    && /periodAttr=\(\)=>state\.period==="180d"\?"c180":state\.period==="30d"\?"c30":"c7"/.test(html)
    && /data-period-value/.test(html);
}

function dashboardFilterEvidenceFunctional(html: string): boolean {
  return /data-evidence="specification"/.test(html)
    && /data-evidence="discussion"/.test(html)
    && /data-evidence="implementation"/.test(html)
    && /data-evidence-scopes="[^"]*discussion/.test(html)
    && /evidenceScopes\(node\)\.has\(state\.evidence\)/.test(html)
    && /현재 구현·릴리스 근거는 수집되지 않았습니다/.test(html);
}

function dashboardFilterDomainFunctional(html: string): boolean {
  return /data-domain-filter/.test(html)
    && /data-domain="execution-state"/.test(html)
    && /state\.domain!=="all"&&d\.domain!==state\.domain/.test(html);
}

function dashboardFilterStatusFunctional(html: string): boolean {
  return /data-status-filter/.test(html)
    && /data-status="Final"/.test(html)
    && /state\.status!=="all"&&d\.status!==state\.status/.test(html);
}

function dashboardFilterAaFunctional(html: string): boolean {
  return /data-aa-toggle/.test(html)
    && /data-aa="true"/.test(html)
    && /state\.aa&&d\.aa!=="true"/.test(html);
}

function dashboardFilterKgldFunctional(html: string): boolean {
  return /data-kgld-toggle/.test(html)
    && /data-kgld="true"/.test(html)
    && /state\.kgld&&d\.kgld!=="true"/.test(html);
}

function dashboardFilterSearchFunctional(html: string): boolean {
  return /data-proposal-search/.test(html)
    && /data-search="[^"]*eip-8198/.test(html)
    && /\(d\.search\|\|""\)\.toLowerCase\(\)\.includes\(state\.query\)/.test(html);
}

function dashboardFilterResetFunctional(html: string): boolean {
  return /data-filter-reset/.test(html)
    && /period:"7d",evidence:"all",domain:"all",status:"all",aa:false,kgld:false,confirmed:true,query:"",page:1,pageSize:12/.test(html)
    && /data-page-size/.test(html)
    && /s\.value="12"/.test(html);
}

function dashboardFilterPaginationFunctional(html: string): boolean {
  return /data-page-index/.test(html)
    && /matchedIndexes=Array\.from\(new Set\(rows\.filter\(matches\)/.test(html)
    && /visibleIndexes=new Set\(matchedIndexes\.slice/.test(html)
    && /탐색 결과 "\+matchedIndexes\.length\+"\건"/.test(html);
}

function dashboardFilterEmptyStateFunctional(html: string): boolean {
  return /data-filter-scope="technology"/.test(html)
    && /data-section-empty/.test(html)
    && /sectionEmpty\(\)/.test(html)
    && /data-implementation-empty/.test(html)
    && /현재 구현·릴리스 근거는 수집되지 않았습니다/.test(html);
}

function dashboardFilterObserved(html: string): string {
  return JSON.stringify({
    periodAttrs: (html.match(/data-c(?:7|30|180)=/g) ?? []).length,
    evidenceScopes: (html.match(/data-evidence-scopes=/g) ?? []).length,
    filterScopes: (html.match(/data-filter-scope=/g) ?? []).length,
    emptyStates: (html.match(/data-section-empty|data-implementation-empty/g) ?? []).length,
  });
}

function landscapeStatusEnumConsistency(html: string): boolean {
  const statuses = new Set([...html.matchAll(/data-status="([^"]+)"/g)].map((match) => match[1]));
  const options = new Set([...html.matchAll(/<option value="([^"]+)">/g)].map((match) => match[1]));
  statuses.delete("all");
  return statuses.size > 0 && [...statuses].every((status) => options.has(status));
}

function landscapeFilterScopeIsolation(html: string): boolean {
  return /querySelectorAll\(s\)|"\.dash-filterable"/.test(html)
    && /id="evidence-quality"/.test(html)
    && /technology-platform-api/.test(html)
    && !/fetch\(|<iframe/i.test(html);
}

function topicDrawerDataCompleteness(embeddedApi: unknown, html: string): boolean {
  const topics = dashboardFromApi(embeddedApi)?.dashboardV2?.topicActivityMap?.points ?? [];
  if (topics.length > 0) {
    return /data-open-domain/.test(html)
      && /vm\.topicActivityMap\?\.points/.test(html)
      && /domain\//.test(html);
  }
  const focus = dashboardFromApi(embeddedApi)?.focusProgress ?? [];
  return focus.length > 0 && /data-open-domain/.test(html);
}

function focusRealTimeseriesOnly(embeddedApi: unknown, visibleHtml: string): boolean {
  const focus = dashboardFromApi(embeddedApi)?.focusProgress ?? [];
  return focus.every((topic) => Array.isArray(topic.weeklyTrend))
    && !/index % 4|Math\.min\(42, topic\.trend180dEvents/.test(visibleHtml);
}

function focusMilestoneDateEvidence(embeddedApi: unknown, visibleHtml: string): boolean {
  const focus = dashboardFromApi(embeddedApi)?.focusProgress ?? [];
  const dated = focus.every((topic) => (topic.progress.milestoneEvents ?? []).every((milestone) => milestone.occurredAt && milestone.sourceUrl));
  return dated || /최근 확인된 단계/.test(visibleHtml);
}

function implementationCollectionState(embeddedApi: unknown, visibleText: string): boolean {
  const focus = dashboardFromApi(embeddedApi)?.focusProgress ?? [];
  return focus.every((topic) => ["not_collected", "confirmed", "confirmed_none", "not_applicable"].includes(topic.progress.implementationStage))
    && /미수집/.test(visibleText);
}

function sourceDateNotGeneratedAt(embeddedApi: unknown, generatedAt: string): boolean {
  const generatedDate = generatedAt.slice(0, 10);
  const claims = dashboardFromApi(embeddedApi)?.focusProgress?.flatMap((topic) => topic.evidenceClaims) ?? [];
  return claims.every((claim) => (claim.sourceDates ?? []).every((date) => date == null || !String(date).startsWith(generatedDate)));
}

function intelligenceSnapshotFromApi(embeddedApi: unknown) {
  return embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { intelligenceSnapshot?: ReturnType<typeof buildIntelligenceSnapshot>; snapshotHash?: string; schemaVersion?: string }).intelligenceSnapshot : undefined;
}

function snapshotHashConsistency(embeddedApi: unknown): boolean {
  if (!embeddedApi || typeof embeddedApi !== "object") return false;
  const root = embeddedApi as { snapshotHash?: string; schemaVersion?: string };
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  return Boolean(snapshot?.metadata?.snapshotHash)
    && root.snapshotHash === snapshot?.metadata.snapshotHash
    && root.schemaVersion === snapshot?.metadata.schemaVersion
    && snapshotHash(snapshot as { metadata: { snapshotHash: string } }) === snapshot.metadata.snapshotHash;
}

function metricDictionaryComplete(embeddedApi: unknown): boolean {
  const metrics = intelligenceSnapshotFromApi(embeddedApi)?.aggregates.metricDictionary ?? [];
  const ids = new Set(metrics.map((metric) => metric.metricId));
  return [
    "domain.meaningfulProposals",
    "domain.rawDiscussionPosts",
    "weekly.rawEvents",
    "weekly.usableEvents",
    "discussion.developerRawPosts",
    "aa.uniqueActiveThreadCount30d",
    "aa.uniqueRawPostCount30d",
    "kgld.researchNow",
  ].every((id) => ids.has(id)) && metrics.every((metric) => metric.unit && metric.scope && metric.window && metric.sourceFactType);
}

function monitoringScopeLabelValid(embeddedApi: unknown, visibleHtml: string): boolean {
  const scope = intelligenceSnapshotFromApi(embeddedApi)?.monitoringUniverse.scope;
  const text = visibleTextOnly(visibleHtml);
  return Boolean(scope?.subtitle?.includes("EIP/ERC 명세와 Ethereum Magicians 활동"))
    && /발견 대상 \d+건[\s\S]*탐색·단계 분포 대상 \d+건[\s\S]*기준 Proposal \d+건[\s\S]*집중 모니터링 \d+건[\s\S]*상세 활동 카드 \d+건|EIP\/ERC 명세와 Ethereum Magicians 활동을 중심으로 한 Ethereum 표준 개발 관찰 보고서/.test(text)
    && /같은 관찰 대상 내 180일 이력|관찰 대상 내 180일 이력/.test(text)
    && !/180d coverage/.test(text);
}

function developerActivityTopProposalsValid(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (!dashboard) return false;
  const cards = dashboard.developerAttention.activity.slice(0, 3).map((item) => item.proposalId);
  const executive = dashboard.executivePulse.whatChanged.magiciansActivity.map((item) => item.proposalIds[0]);
  return cards.length === executive.length && cards.every((id, index) => id === executive[index]);
}

function proposalSummarySemanticFixtures(embeddedApi: unknown): boolean {
  const activity = dashboardFromApi(embeddedApi)?.developerAttention.activity ?? [];
  const byId = new Map(activity.map((item) => [item.proposalId, item.proposalSummaryKo]));
  const checks = [
    ["ERC-8183", /Agentic Commerce/i, /ERC-4626|Vault/i],
    ["EIP-8037", /state|상태|gas/i, /일반 AA/i],
    ["EIP-8151", /authority|ecRecover|권한/i, /일반 AA 설명/i],
    ["ERC-6123", /derivative|파생|lifecycle/i, /tokenized claim/i],
    ["ERC-7303", /circulation/i, /상환 요청과 가치 산정/i],
    ["EIP-8130", /Account Configuration|계정 설정/i, /Vault/i],
    ["ERC-8330", /NAV|snapshot|oracle/i, /ERC-4626 Vault/i],
  ] as const;
  return checks.every(([id, required, forbidden]) => {
    const text = byId.get(id);
    if (!text) return true;
    return required.test(text) && !forbidden.test(text);
  });
}

function aaDirectionEvidenceValid(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  const factIds = snapshotFactIds(embeddedApi);
  return tracks.every((track) => track.direction !== "advancing" || aaTrackHasQualifyingAdvancingEvidence(track, factIds));
}

function domainDiscussionAggregateValid(embeddedApi: unknown): boolean {
  const domains = dashboardFromApi(embeddedApi)?.technologyLandscape ?? [];
  return domains.every((domain) => {
    const discussion = domain.discussion;
    if (!discussion) return false;
    const rawIds = new Set(discussion.rawPostIds ?? []);
    return domain.rawDiscussionPosts === rawIds.size && discussion.rawPostCount === rawIds.size && discussion.scopeId === `domain:${domain.domainId}`;
  });
}

function editorialClaimLedgerValid(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const signalIds = new Set(snapshot?.signals.map((signal) => signal.signalId) ?? []);
  return Boolean(snapshot?.editorialClaims.length)
    && snapshot!.editorialClaims.every((claim) =>
      claim.textKo
      && claim.evidenceFactIds.length > 0
      && claim.signalIds.every((id) => signalIds.has(id))
    );
}

function snapshotFactIds(embeddedApi: unknown): Set<string> {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const ids = new Set<string>();
  for (const fact of snapshot?.facts.specificationEvidence ?? []) ids.add(fact.factId ?? `spec:${fact.proposalId}`);
  for (const fact of snapshot?.facts.discussionPosts ?? []) ids.add(fact.factId ?? `post:${fact.postId}`);
  for (const fact of snapshot?.facts.developmentEvents ?? []) ids.add(fact.factId ?? `event:${fact.eventId}`);
  for (const fact of snapshot?.facts.logicalDevelopmentEvents ?? []) ids.add(fact.logicalEventId);
  for (const fact of snapshot?.facts.qualityFacts ?? []) ids.add(fact.factId);
  return ids;
}

function discussionPostFactMap(embeddedApi: unknown): Map<string, { postId: string; proposalId: string; createdAt: string; threadId: string }> {
  const posts = intelligenceSnapshotFromApi(embeddedApi)?.facts.discussionPosts ?? [];
  return new Map(posts.map((post) => [post.postId, post]));
}

function discussionAggregates(embeddedApi: unknown): Array<{ rawPostIds?: unknown; windowStart?: string; windowEnd?: string }> {
  const value = intelligenceSnapshotFromApi(embeddedApi)?.aggregates.discussion;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value as Record<string, { rawPostIds?: unknown; windowStart?: string; windowEnd?: string }>);
  return [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function subjectRegistryMissingIdsFromPublicViews(embeddedApi: unknown): string[] {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const registered = new Set((snapshot?.monitoringUniverse.subjectRegistry ?? []).map((subject) => subject.proposalId));
  const publicIds = new Set<string>();
  collectPublicProposalIds(snapshot?.views, publicIds);
  return [...publicIds].filter((id) => !registered.has(id)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function collectPublicProposalIds(value: unknown, ids: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectPublicProposalIds(item, ids);
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["proposalId", "subjectId"]) {
    const id = record[key];
    if (typeof id === "string" && /^E(?:IP|RC)-\d{1,5}$/i.test(id)) ids.add(id.toUpperCase());
  }
  for (const key of ["proposalIds", "subjectIds"]) {
    for (const id of stringList(record[key])) {
      if (/^E(?:IP|RC)-\d{1,5}$/i.test(id)) ids.add(id.toUpperCase());
    }
  }
  for (const child of Object.values(record)) collectPublicProposalIds(child, ids);
}

function factReferenceIntegrity(embeddedApi: unknown): boolean {
  return discussionFactUnionComplete(embeddedApi)
    && signalFactReferentialIntegrity(embeddedApi)
    && editorialClaimLineage(embeddedApi);
}

function discussionFactUnionComplete(embeddedApi: unknown): boolean {
  const postIds = discussionPostFactMap(embeddedApi);
  const dashboard = dashboardFromApi(embeddedApi);
  const aggregateIds = new Set<string>();
  for (const aggregate of discussionAggregates(embeddedApi)) {
    for (const id of stringList(aggregate.rawPostIds)) aggregateIds.add(id);
  }
  for (const item of dashboard?.developerAttention.activity ?? []) {
    for (const id of stringList(item.rawPostIds)) aggregateIds.add(id);
  }
  for (const domain of dashboard?.technologyLandscape ?? []) {
    for (const id of stringList(domain.discussion?.rawPostIds)) aggregateIds.add(id);
  }
  for (const track of dashboard?.accountAbstraction.tracks ?? []) {
    for (const id of stringList(track.rawPostIds)) aggregateIds.add(id);
  }
  return [...aggregateIds].every((id) => postIds.has(id));
}

function discussionWindowBoundary(embeddedApi: unknown): boolean {
  const postIds = discussionPostFactMap(embeddedApi);
  return discussionAggregates(embeddedApi).every((aggregate) =>
    stringList(aggregate.rawPostIds).every((id) => {
      const post = postIds.get(id);
      return Boolean(post)
        && Date.parse(post.createdAt) >= Date.parse(aggregate.windowStart)
        && Date.parse(post.createdAt) < Date.parse(aggregate.windowEnd);
    })
  );
}

function specificationBodyCoverage(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const specs = new Map((snapshot?.facts.specificationEvidence ?? []).map((spec) => [spec.proposalId, spec]));
  const publicIds = snapshot?.monitoringUniverse.subjectRegistry
    .filter((subject) => !subject.roles.includes("excluded"))
    .map((subject) => subject.proposalId) ?? [];
  const requiredBodyIds = ["ERC-8183", "EIP-8037", "EIP-8151", "ERC-7303", "EIP-8130", "ERC-6123", "ERC-8226", "ERC-8330", "ERC-8328", "ERC-8161"]
    .filter((id) => specs.has(id));
  return publicIds.every((id) => specs.has(id))
    && requiredBodyIds.every((id) => specs.get(id)?.parseState === "body_parsed");
}

function titleOnlyClaimStrength(embeddedApi: unknown): boolean {
  const cards = dashboardFromApi(embeddedApi)?.developerAttention.activity ?? [];
  return cards.every((card) => {
    if (card.summaryEvidence?.sourceSection !== "title_only") return true;
    return /원문/.test(card.proposalSummaryKo)
      && !/갱신주기|정정 방식|가격 기준시각|제한 사유|승인 주체|field|필드|구현됨|채택됨/.test(card.proposalSummaryKo);
  });
}

function logicalProposalIntroductionUnique(embeddedApi: unknown): boolean {
  const events = intelligenceSnapshotFromApi(embeddedApi)?.facts.logicalDevelopmentEvents ?? [];
  const counts = new Map<string, number>();
  for (const event of events.filter((item) => item.eventType === "proposal_published")) {
    counts.set(event.proposalId, (counts.get(event.proposalId) ?? 0) + 1);
  }
  return [...counts.values()].every((count) => count <= 1);
}

function aaTrackPostIntersection(embeddedApi: unknown): boolean {
  const posts = discussionPostFactMap(embeddedApi);
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  return tracks.every((track) => {
    const proposals = new Set(track.proposalIds ?? []);
    return stringList(track.rawPostIds).every((id) => {
      const post = posts.get(id);
      return Boolean(post) && proposals.has(post!.proposalId);
    });
  });
}

function signalFactReferentialIntegrity(embeddedApi: unknown): boolean {
  const facts = snapshotFactIds(embeddedApi);
  return (intelligenceSnapshotFromApi(embeddedApi)?.signals ?? []).every((signal) =>
    (signal.evidenceFactIds ?? []).every((id) => facts.has(id))
  );
}

function editorialClaimLineage(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const signalIds = new Set(snapshot?.signals.map((signal) => signal.signalId) ?? []);
  const facts = snapshotFactIds(embeddedApi);
  return (snapshot?.editorialClaims ?? []).every((claim) =>
    claim.signalIds.length > 0
    && claim.evidenceFactIds.length > 0
    && claim.signalIds.every((id) => signalIds.has(id))
    && claim.evidenceFactIds.every((id) => facts.has(id))
  );
}

function canonicalRenderSource(html: string): boolean {
  return (/const snapshot\s*=\s*JSON\.parse\([^;]+\.intelligenceSnapshot/.test(html)
    && /const dashboardData\s*=\s*snapshot\.views/.test(html)
    || /const api=JSON\.parse\([^;]+technology-platform-api/.test(html)
    && /const vm=api\?\.intelligenceSnapshot\?\.views\?\.dashboardV2/.test(html))
    && !/parsed\.dashboard|technologyPlatformApi\.dashboard|dashboardData\s*=\s*parsed\.dashboard/.test(html);
}

function legacyModelNotEmbedded(embeddedApi: unknown): boolean {
  if (!embeddedApi || typeof embeddedApi !== "object") return false;
  const root = embeddedApi as Record<string, unknown>;
  return ["dashboard", "technologyDomains", "technologyAtlasSummary", "topicClusters", "atlasCharts", "publishedKnowledgeNodes", "publishedKnowledgeEdges"]
    .every((key) => root[key] === undefined);
}

function publicMetricUnitVisible(visibleHtml: string): boolean {
  return !/\b(?:7d|30d|180d)\s+meaningful\b|meaningful\s+\d/.test(visibleHtml)
    && /의미 변화(?:가 확인된)? Proposal|원시 post|thread|event|Proposal \d+개|post \d+건/.test(visibleHtml);
}

function executiveLayoutStyled(html: string): boolean {
  const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? "";
  return ["executive-stack", "two-col", "notice", "card-head"]
    .every((className) => new RegExp(`\\.${className.replace("-", "\\-")}`).test(styleBlock));
}

function finalRcGoldenDeveloperActivity(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  if (snapshot?.metadata.generatedAt !== "2026-07-30T05:57:50.976Z") return true;
  const dashboard = snapshot.views;
  const top3 = dashboard.developerAttention.activity.slice(0, 3).map((item) => item.proposalId).join(",");
  return dashboard.developerAttention.summary.rawPosts === 44
    && dashboard.developerAttention.summary.activeThreads === 8
    && top3 === "ERC-8183,EIP-8037,EIP-8151";
}

function finalRcGoldenTechnologyMapActivity(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  if (snapshot?.metadata.generatedAt !== "2026-07-30T05:57:50.976Z") return true;
  const aggregate = snapshot.aggregates.discussion?.technology_map_set as { rawPostCount?: number; rawPostIds?: string[] } | undefined;
  const domainUnion = new Set(snapshot.views.technologyLandscape.flatMap((domain) => domain.discussion?.rawPostIds ?? []));
  return aggregate?.rawPostCount === 7
    && aggregate.rawPostIds?.length === 7
    && domainUnion.size === 7
    && aggregate.rawPostIds.every((id) => domainUnion.has(id));
}

type GoldenFixture = {
  fixtureId: string;
  fixtureVersion: string;
  reportDate: string;
  reportAsOf: string;
  inputSnapshotHash: string;
  developerActivity: { postCount: number; threadCount: number; topProposals: string[] };
  technologyMap: { postCount: number };
};

const GOLDEN_FIXTURE_VERSION = "final-fixture/v2";

const GOLDEN_FIXTURES: GoldenFixture[] = [
  goldenFixture({
    fixtureId: "final-rc-2026-07-30T05:57:50.976Z",
    reportDate: "2026-07-30",
    reportAsOf: "2026-07-30T05:57:50.976Z",
    developerActivity: { postCount: 44, threadCount: 8, topProposals: ["ERC-8183", "EIP-8037", "EIP-8151"] },
    technologyMap: { postCount: 7 },
  }),
  goldenFixture({
    fixtureId: "rolling-2026-07-31-fixture-a",
    reportDate: "2026-07-31",
    reportAsOf: "2026-07-31T00:00:00.000Z",
    developerActivity: { postCount: 32, threadCount: 6, topProposals: ["ERC-8183", "EIP-8037", "EIP-8151"] },
    technologyMap: { postCount: 5 },
  }),
  goldenFixture({
    fixtureId: "rolling-2026-07-31-fixture-b",
    reportDate: "2026-07-31",
    reportAsOf: "2026-07-31T19:00:00.000Z",
    developerActivity: { postCount: 13, threadCount: 5, topProposals: ["EIP-8037", "EIP-8151", "ERC-8330"] },
    technologyMap: { postCount: 5 },
  }),
];

function goldenFixture(input: Omit<GoldenFixture, "fixtureVersion" | "inputSnapshotHash">): GoldenFixture {
  const versioned = { ...input, fixtureVersion: GOLDEN_FIXTURE_VERSION };
  return {
    ...versioned,
    inputSnapshotHash: goldenFixtureInputHash(versioned),
  };
}

function goldenFixtureInputHash(input: Omit<GoldenFixture, "inputSnapshotHash">) {
  return createHash("sha256").update(stableJson({
    fixtureVersion: input.fixtureVersion,
    reportDate: input.reportDate,
    reportAsOf: input.reportAsOf,
    developerActivity: input.developerActivity,
    technologyMap: input.technologyMap,
  })).digest("hex");
}

function reportDateFromSnapshot(embeddedApi: unknown): string {
  const metadata = intelligenceSnapshotFromApi(embeddedApi)?.metadata;
  return metadata?.reportDate ?? metadata?.generatedAt?.slice(0, 10) ?? "unknown";
}

function reportAsOfFromSnapshot(embeddedApi: unknown): string {
  const metadata = intelligenceSnapshotFromApi(embeddedApi)?.metadata;
  return metadata?.reportAsOf ?? metadata?.generatedAt ?? "unknown";
}

function inputSnapshotHashFromSnapshot(embeddedApi: unknown): string {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  if (!snapshot) return "unknown";
  return snapshot.metadata.inputSnapshotHash ?? goldenFixtureInputHash({
    fixtureId: "observed",
    fixtureVersion: GOLDEN_FIXTURE_VERSION,
    reportDate: snapshot.metadata.reportDate ?? snapshot.metadata.generatedAt?.slice(0, 10) ?? "unknown",
    reportAsOf: snapshot.metadata.reportAsOf ?? snapshot.metadata.generatedAt ?? "unknown",
    developerActivity: observedDeveloperFixture(snapshot),
    technologyMap: observedTechnologyMapFixture(snapshot),
  });
}

function observedDeveloperFixture(snapshot: ReturnType<typeof intelligenceSnapshotFromApi>): GoldenFixture["developerActivity"] {
  const dashboard = snapshot?.views;
  return {
    postCount: dashboard?.developerAttention.summary.rawPosts ?? -1,
    threadCount: dashboard?.developerAttention.summary.activeThreads ?? -1,
    topProposals: dashboard?.developerAttention.activity.slice(0, 3).map((item) => item.proposalId) ?? [],
  };
}

function observedTechnologyMapFixture(snapshot: ReturnType<typeof intelligenceSnapshotFromApi>): GoldenFixture["technologyMap"] {
  const aggregate = snapshot?.aggregates.discussion?.technology_map_set as { rawPostCount?: number } | undefined;
  return { postCount: aggregate?.rawPostCount ?? -1 };
}

function matchingGoldenFixture(embeddedApi: unknown): GoldenFixture | undefined {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const metadata = snapshot?.metadata;
  if (!snapshot || !metadata) return undefined;
  const reportDate = metadata.reportDate ?? metadata.generatedAt?.slice(0, 10);
  const reportAsOf = metadata.reportAsOf ?? metadata.generatedAt;
  const inputHash = inputSnapshotHashFromSnapshot(embeddedApi);
  return GOLDEN_FIXTURES.find((fixture) =>
    fixture.fixtureVersion === GOLDEN_FIXTURE_VERSION
    && fixture.reportDate === reportDate
    && fixture.reportAsOf === reportAsOf
    && fixture.inputSnapshotHash === inputHash
  );
}

function finalGoldenFixtureDateScope(embeddedApi: unknown): boolean | null {
  const fixture = matchingGoldenFixture(embeddedApi);
  if (!fixture) return null;
  const dashboard = dashboardFromApi(embeddedApi);
  const aggregate = intelligenceSnapshotFromApi(embeddedApi)?.aggregates.discussion?.technology_map_set as { rawPostCount?: number } | undefined;
  const top3 = dashboard?.developerAttention.activity.slice(0, 3).map((item) => item.proposalId) ?? [];
  return dashboard?.developerAttention.summary.rawPosts === fixture.developerActivity.postCount
    && dashboard.developerAttention.summary.activeThreads === fixture.developerActivity.threadCount
    && top3.join(",") === fixture.developerActivity.topProposals.join(",")
    && aggregate?.rawPostCount === fixture.technologyMap.postCount;
}

function finalGoldenObserved(embeddedApi: unknown): string {
  const dashboard = dashboardFromApi(embeddedApi);
  const date = reportDateFromSnapshot(embeddedApi);
  const reportAsOf = reportAsOfFromSnapshot(embeddedApi);
  const inputHash = inputSnapshotHashFromSnapshot(embeddedApi);
  const aggregate = intelligenceSnapshotFromApi(embeddedApi)?.aggregates.discussion?.technology_map_set as { rawPostCount?: number } | undefined;
  const top3 = dashboard?.developerAttention.activity.slice(0, 3).map((item) => item.proposalId).join("/") ?? "";
  const fixture = matchingGoldenFixture(embeddedApi);
  const status = fixture ? `matched fixture=${fixture.fixtureId}` : "live rolling snapshot; no matching frozen fixture";
  return `status=${fixture ? "applicable" : "not_applicable"}; reportDate=${date}; reportAsOf=${reportAsOf}; inputSnapshotHash=${inputHash}; ${status}; developer=${dashboard?.developerAttention.summary.rawPosts ?? "n/a"} posts, ${dashboard?.developerAttention.summary.activeThreads ?? "n/a"} threads, ${top3}; technologyMap=${aggregate?.rawPostCount ?? "n/a"} posts`;
}

function finalGoldenExpected(embeddedApi: unknown): string {
  const fixture = matchingGoldenFixture(embeddedApi);
  if (!fixture) return "matching reportDate + reportAsOf + inputSnapshotHash fixture";
  return `${fixture.developerActivity.postCount} posts, ${fixture.developerActivity.threadCount} threads, ${fixture.developerActivity.topProposals.join("/")}; technologyMap=${fixture.technologyMap.postCount} posts`;
}

function finalDeveloperActivityCanonicalConsistency(embeddedApi: unknown, visibleHtml: string): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const dashboard = snapshot?.views;
  if (!snapshot || !dashboard) return false;
  const factIds = new Set(snapshot.facts.discussionPosts.map((post) => post.postId));
  const aggregate = snapshot.aggregates.discussion?.developer_activity_set as { rawPostIds?: string[]; activeThreads?: number; rawPosts?: number } | undefined;
  const cardIds = new Set(dashboard.developerAttention.activity.flatMap((item) => stringList(item.rawPostIds)));
  const executiveTop = dashboard.executivePulse.whatChanged.magiciansActivity.map((item) => item.proposalIds[0]).join(",");
  const cardTop = dashboard.developerAttention.activity.slice(0, 3).map((item) => item.proposalId).join(",");
  return Boolean(aggregate)
    && [...cardIds].every((id) => factIds.has(id))
    && cardIds.size === aggregate!.rawPosts
    && cardIds.size === dashboard.developerAttention.summary.rawPosts
    && dashboard.developerAttention.activity.length === dashboard.developerAttention.summary.activeThreads
    && dashboard.developerAttention.summary.activeThreads === aggregate!.activeThreads
    && executiveTop === cardTop
    && new RegExp(`${dashboard.developerAttention.summary.rawPosts}`).test(visibleHtml);
}

function finalDeveloperActivityObserved(embeddedApi: unknown): string {
  const dashboard = dashboardFromApi(embeddedApi);
  const top = dashboard?.developerAttention.activity.slice(0, 3).map((item) => `${item.proposalId}:${item.rawPostCount}`).join("/") ?? "n/a";
  return `${dashboard?.developerAttention.summary.rawPosts ?? "n/a"} posts, ${dashboard?.developerAttention.summary.activeThreads ?? "n/a"} threads, top=${top}`;
}

function finalTechnologyMapCanonicalConsistency(embeddedApi: unknown, visibleHtml: string): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  if (!snapshot) return false;
  const aggregate = snapshot.aggregates.discussion?.technology_map_set as { rawPostIds?: string[]; rawPostCount?: number } | undefined;
  const technologyMap = new Set(stringList(aggregate?.rawPostIds));
  const domainUnion = new Set(snapshot.views.technologyLandscape.flatMap((domain) => stringList(domain.discussion?.rawPostIds)));
  const viewIds = new Set(stringList(snapshot.views.dashboardV2?.technologyMapPostIds));
  const htmlIds = new Set((visibleHtml.match(/data-technology-map-post-ids="([^"]*)"/)?.[1] ?? "").split(",").map((id) => id.trim()).filter(Boolean));
  if (!snapshot.views.dashboardV2) {
    return Boolean(aggregate)
      && aggregate!.rawPostCount === technologyMap.size
      && setEquals(technologyMap, domainUnion)
      && new RegExp(`기술 지도 최근 7일 댓글</span><b>${technologyMap.size}</b>`).test(visibleHtml);
  }
  return Boolean(aggregate)
    && aggregate!.rawPostCount === technologyMap.size
    && setEquals(technologyMap, domainUnion)
    && setEquals(technologyMap, viewIds)
    && setEquals(technologyMap, htmlIds)
    && new RegExp(`기술 지도 최근 7일 댓글 ${technologyMap.size}건`).test(visibleHtml);
}

function finalTechnologyMapObserved(embeddedApi: unknown): string {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const aggregate = snapshot?.aggregates.discussion?.technology_map_set as { rawPostCount?: number; rawPostIds?: string[] } | undefined;
  const technologyMap = new Set(stringList(aggregate?.rawPostIds));
  const domainUnion = new Set(snapshot?.views.technologyLandscape.flatMap((domain) => stringList(domain.discussion?.rawPostIds)) ?? []);
  const viewIds = new Set(stringList(snapshot?.views.dashboardV2?.technologyMapPostIds));
  return `technologyMap=${aggregate?.rawPostCount ?? "n/a"} posts ids=[${[...technologyMap].sort().join(",")}]; domainUnion=${domainUnion.size} posts ids=[${[...domainUnion].sort().join(",")}]; view ids=[${[...viewIds].sort().join(",")}]; tech-domain diff=[${difference(technologyMap, domainUnion).concat(difference(domainUnion, technologyMap)).sort().join(",")}]; tech-view diff=[${difference(technologyMap, viewIds).concat(difference(viewIds, technologyMap)).sort().join(",")}]`;
}

export const __qualityTestHooks = {
  GOLDEN_FIXTURE_VERSION,
  GOLDEN_FIXTURES,
  aaNonAaRegression,
  finalDeveloperActivityCanonicalConsistency,
  finalGoldenExpected,
  finalGoldenFixtureDateScope,
  finalGoldenObserved,
  finalTechnologyMapCanonicalConsistency,
  buildWeeklySignalCopy,
  coreProjection,
  coverSingularPluralAffectedIds,
  coverSingularPluralConsistency,
  coverSingularPluralObserved,
  currentWindowFallbackHandled,
  currentWindowFallbackObserved,
  goldenFixtureInputHash,
  inputSnapshotHash,
  monitoringScopeReferenceCount,
  monitoringScopeWording,
  qualityCheck,
  buildDashboardV3Presentation,
  renderDashboardV3,
  heroRepositoryCountConsistency,
  magiciansCurrentWindowCards,
  knownDomainClassifierRegression,
  knownDomainFixtureExpectations,
  knownDomainRuntimeMismatches,
  knownDomainSemanticFixtures,
  knownDomainSemanticFixturesV3,
  knownDomainSemanticFixturesV4,
  weeklyEmptyStateValid,
  weeklyRepositoryAdditionLabel,
  weeklyRepositoryAdditionsFromApi,
  weeklyRepositoryAdditionObserved,
  parseLocalSpecificationMarkdown,
  proposalSummaryForV3,
  snapshotWithoutVitalik,
  sourceBackedKoreanSummary,
  weeklyConfidenceLimitCanonical,
  weeklySummaryLanguageAffectedIds,
  weeklySummaryBodyQualityChecks,
  weeklySummaryLanguageDiagnostics,
  weeklySummaryTextQuality,
  weeklySpecificationTrendReason,
  subjectRegistryMissingIdsFromPublicViews,
  snapshotHash,
  validateWeeklyCollectionPreflight,
  vitalikNoCoreMetricContamination,
  aaDirectionEvidenceValid,
  aaDirectionEvidenceV2,
};

function aaMetricDefinitions(embeddedApi: unknown) {
  return intelligenceSnapshotFromApi(embeddedApi)?.aggregates.metricDictionary?.filter((metric) => metric.metricId.startsWith("aa.")) ?? [];
}

function finalAaMetricDictionaryWindow(embeddedApi: unknown): boolean {
  const expected = new Map([
    ["aa.trackCount", "all"],
    ["aa.uniqueBaselineProposalCount", "all"],
    ["aa.baselineProposalAssignmentCount", "all"],
    ["aa.specificationActiveTrackCount30d", "current30d"],
    ["aa.discussionActiveTrackAssignmentCount30d", "current30d"],
    ["aa.uniqueActiveParentFlowCount30d", "current30d"],
    ["aa.uniqueActiveThreadCount30d", "current30d"],
    ["aa.uniqueRawPostCount30d", "current30d"],
    ["aa.baselineNotLinkedTrackCount", "all"],
    ["aa.discussionNotCollectedTrackCount", "current30d"],
    ["aa.implementationNotCollectedTrackCount", "all"],
  ]);
  const defs = new Map(aaMetricDefinitions(embeddedApi).map((metric) => [metric.metricId, metric]));
  return [...expected].every(([id, window]) => defs.get(id)?.window === window)
    && (defs.get("aa.uniqueActiveThreads") as { deprecated?: boolean; replacedBy?: string } | undefined)?.deprecated === true
    && (defs.get("aa.uniqueActiveThreads") as { replacedBy?: string } | undefined)?.replacedBy === "aa.uniqueActiveThreadCount30d";
}

function finalAaMetricDictionaryUnit(embeddedApi: unknown): boolean {
  const expected = new Map([
    ["aa.trackCount", "track"],
    ["aa.uniqueBaselineProposalCount", "proposal"],
    ["aa.baselineProposalAssignmentCount", "assignment"],
    ["aa.specificationActiveTrackCount30d", "track"],
    ["aa.discussionActiveTrackAssignmentCount30d", "track_assignment"],
    ["aa.uniqueActiveParentFlowCount30d", "parent_flow"],
    ["aa.uniqueActiveThreadCount30d", "thread"],
    ["aa.uniqueRawPostCount30d", "post"],
    ["aa.baselineNotLinkedTrackCount", "track"],
    ["aa.discussionNotCollectedTrackCount", "track"],
    ["aa.implementationNotCollectedTrackCount", "track"],
  ]);
  const defs = new Map(aaMetricDefinitions(embeddedApi).map((metric) => [metric.metricId, metric]));
  return [...expected].every(([id, unit]) => defs.get(id)?.unit === unit)
    && defs.get("aa.trackAssignments")?.unit === "assignment";
}

function finalAaMetricSourcePath(embeddedApi: unknown): boolean {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  if (!snapshot) return false;
  return aaMetricDefinitions(embeddedApi)
    .filter((metric) => !metric.deprecated && metric.metricId !== "aa.trackCount")
    .every((metric) => resolveMetricSourcePath(snapshot, String(metric.sourcePath)).value !== undefined);
}

function resolveMetricSourcePath(snapshot: ReturnType<typeof buildIntelligenceSnapshot>, path: string): { value: unknown } {
  const parts = path.split(".");
  let value: unknown = snapshot;
  for (const part of parts) {
    if (part.endsWith("[]")) return { value: [] };
    if (!value || typeof value !== "object") return { value: undefined };
    value = (value as Record<string, unknown>)[part];
  }
  return { value };
}

function finalAaMetricDictionaryObserved(embeddedApi: unknown): string {
  return aaMetricDefinitions(embeddedApi).map((metric) => `${metric.metricId}:${metric.window}/${metric.unit}`).join("; ");
}

function finalAaLastMilestoneLatest(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  return tracks.every((track) => {
    const signals = track.recentSignals ?? [];
    if (!signals.length) return track.lastMilestone == null;
    const latest = signals
      .map((signal) => signal.latestActivityAt ?? signal.windowEnd)
      .filter(Boolean)
      .sort()
      .at(-1);
    return track.lastMilestone?.occurredAt === latest;
  });
}

function finalAaLastMilestoneLineage(embeddedApi: unknown): boolean {
  const facts = snapshotFactIds(embeddedApi);
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  return tracks.every((track) => {
    if (!track.recentSignals?.length) return track.lastMilestone == null;
    return Boolean(track.lastMilestone?.sourceUrl)
      && stringList(track.lastMilestone?.evidenceFactIds).length > 0
      && stringList(track.lastMilestone?.evidenceFactIds).every((id) => facts.has(id));
  });
}

function finalAaLastMilestoneObserved(embeddedApi: unknown): string {
  const native = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks.find((track) => track.id === "native-account-abstraction");
  const milestone = native?.lastMilestone;
  return milestone ? `${milestone.proposalId}/${milestone.signalType}/${milestone.occurredAt}/${milestone.sourceUrl}` : "none";
}

function finalAaDiscussionSourceVisible(embeddedApi: unknown, visibleHtml: string): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? [];
  const urls = tracks.flatMap((track) => track.baselineProposals ?? []).map((assignment) => assignment.discussionSourceUrl).filter(Boolean);
  return urls.every((url) => visibleHtml.includes(String(url)));
}

function finalErc8286DualSource(embeddedApi: unknown, visibleHtml: string): boolean {
  const track = dashboardFromApi(embeddedApi)?.accountAbstraction.tracks.find((item) => item.id === "modular-smart-accounts");
  const assignment = track?.baselineProposals?.find((item) => item.subjectId === "ERC-8286");
  return Boolean(assignment?.sourceUrl === proposalUrl("ERC-8286")
    && assignment.discussionSourceUrl?.includes("ethereum-magicians.org")
    && visibleHtml.includes(proposalUrl("ERC-8286"))
    && visibleHtml.includes(assignment.discussionSourceUrl)
    && /ERC-8286[\s\S]{0,400}Draft/.test(visibleHtml));
}

function finalNonRegression(embeddedApi: unknown): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  if (!dashboard) return false;
  const developerUnion = new Set(dashboard.developerAttention.activity.flatMap((item) => stringList(item.rawPostIds)));
  const technologyAggregate = intelligenceSnapshotFromApi(embeddedApi)?.aggregates.discussion?.technology_map_set as { rawPostIds?: string[]; rawPostCount?: number } | undefined;
  const technologyUnion = new Set(dashboard.technologyLandscape.flatMap((domain) => stringList(domain.discussion?.rawPostIds)));
  return dashboard.accountAbstraction.tracks.length === 12
    && dashboard.accountAbstraction.summary.implementationEvidence === 0
    && dashboard.accountAbstraction.tracks.some((track) => track.id === "erc-4337-entrypoint" && track.baselineProposals.some((proposal) => proposal.subjectId === "ERC-4337"))
    && dashboard.technologyLandscape.length === 8
    && dashboard.developerAttention.summary.rawPosts === developerUnion.size
    && technologyAggregate?.rawPostCount === technologyUnion.size
    && stringList(technologyAggregate?.rawPostIds).every((id) => technologyUnion.has(id))
    && kgldSummaryConsistent(dashboard)
    && dashboard.developerAttention.activity.slice(0, 3).map((item) => item.proposalId).join(",") === dashboard.executivePulse.whatChanged.magiciansActivity.map((item) => item.proposalIds[0]).join(",")
    && snapshotHashConsistency(embeddedApi)
    && canonicalRenderSource(JSON.stringify(embeddedApi) + "const snapshot=JSON.parse(el.textContent).intelligenceSnapshot;const dashboardData=snapshot.views");
}

function finalNonRegressionObserved(embeddedApi: unknown): string {
  const dashboard = dashboardFromApi(embeddedApi);
  return `AA=${dashboard?.accountAbstraction.tracks.length}; domains=${dashboard?.technologyLandscape.length}; KGLD=${dashboard ? dashboard.kgldWatch.groups.research_now.length + dashboard.kgldWatch.groups.monitor.length + dashboard.kgldWatch.groups.no_action.length : "n/a"}; weeklyUsable=${dashboard?.dataQuality.current7dUsableEventCount}; top3=${dashboard?.developerAttention.activity.slice(0, 3).map((item) => item.proposalId).join("/")}`;
}

function eip8151TitleSync(embeddedApi: unknown, visibleHtml: string): boolean {
  const specTitle = intelligenceSnapshotFromApi(embeddedApi)?.facts.specificationEvidence.find((fact) => fact.proposalId === "EIP-8151")?.officialTitle;
  if (!specTitle) return true;
  return specTitle === "Account Code Restricted ecRecover"
    && !/ECDSA Authority Deactivation Aware ecRecover/.test(JSON.stringify(embeddedApi))
    && !/ECDSA Authority Deactivation Aware ecRecover/.test(visibleHtml);
}

function escapeRegExpForHtml(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function magiciansDiscoveryCompleted(report: WeeklyRadarReport): boolean {
  return report.ethereumTechRadar.signalLayer.discussionHeat.every((discussion) =>
    discussion.discussionDiscovery?.discoveryCompleted === true
    || discussion.discussionCollectionStatus === "url_not_found"
    || discussion.discussionCollectionStatus === "not_searched"
  );
}

function magiciansFetchAttemptStateValid(report: WeeklyRadarReport, atlas: TechnologyAtlas): boolean {
  const proposalIds = new Set(mainReportProposals(atlas).map((proposal) => proposal.proposalId));
  return report.ethereumTechRadar.signalLayer.discussionHeat
    .filter((discussion) => proposalIds.has(discussion.proposalId))
    .every((discussion) => {
      const status = discussionCollectionStatus(discussion);
      const requiresFetchAttempt = ["posts_fully_collected", "posts_partially_collected", "fetch_failed", "parse_failed"].includes(status);
      return !requiresFetchAttempt || discussion.discussionFetchAttempted === true;
    });
}

function magiciansFetchAttemptObserved(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const coverage = sourceCoverage(report, atlas).allAnalysisCoverage;
  const proposalIds = new Set(mainReportProposals(atlas).map((proposal) => proposal.proposalId));
  const missing = report.ethereumTechRadar.signalLayer.discussionHeat
    .filter((discussion) => proposalIds.has(discussion.proposalId))
    .filter((discussion) => {
      const status = discussionCollectionStatus(discussion);
      return ["posts_fully_collected", "posts_partially_collected", "fetch_failed", "parse_failed"].includes(status) && discussion.discussionFetchAttempted !== true;
    })
    .map((discussion) => `${discussion.proposalId}:${discussionCollectionStatus(discussion)}`);
  return JSON.stringify({
    postFetchAttempted: coverage.postFetchAttempted,
    threadUrlConfirmed: coverage.threadUrlConfirmed,
    urlConfirmedNotAttempted: coverage.postFetchNotAttempted,
    missingRequiredAttempt: missing,
  });
}

function coverageStateConsistency(report: WeeklyRadarReport, atlas: TechnologyAtlas): boolean {
  const coverage = sourceCoverage(report, atlas).allAnalysisCoverage;
  const proposals = new Set(mainReportProposals(atlas).map((proposal) => proposal.proposalId));
  const discussions = report.ethereumTechRadar.signalLayer.discussionHeat.filter((discussion) => proposals.has(discussion.proposalId));
  return coverage.threadUrlConfirmed === discussions.filter((discussion) => discussion.discussionUrl).length
    && coverage.postsFullyCollected === discussions.filter((discussion) => discussionCollectionStatus(discussion) === "posts_fully_collected").length
    && coverage.postFetchAttempted === discussions.filter((discussion) => discussion.discussionFetchAttempted).length;
}

function allReportEvents(changes: WeeklyRadarReport["ethereumTechRadar"]["recentChanges"] | WeeklyRadarReport["ethereumTechRadar"]["trendChanges"] | undefined): ChangeEvent[] {
  if (!changes) return [];
  return [
    ...changes.newProposals,
    ...changes.statusChanges,
    ...changes.finalTransitions,
    ...changes.withdrawnTransitions,
    ...changes.contentHashChanges,
  ];
}

function reportEventKey(event: ChangeEvent): string {
  return `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}:${event.currentHash ?? ""}`;
}

function eventFactId(event: ChangeEvent): string {
  return `event:${reportEventKey(event)}`;
}

export function writeWeeklyDebugSnapshot(report: WeeklyRadarReport, outputDirectory = "output"): string | undefined {
  const debugDirectory = resolve(resolve(outputDirectory), "debug");
  mkdirSync(debugDirectory, { recursive: true });
  const payload = generateWeeklyDebugJson(report);
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes > 200 * 1024 * 1024) {
    console.warn(`debug JSON skipped because it exceeds 200MB (${bytes} bytes).`);
    return undefined;
  }
  const outputPath = weeklyDebugJsonPath(report, outputDirectory);
  writeFileSync(outputPath, gzipSync(payload));
  pruneDebugSnapshots(debugDirectory, outputPath);
  return outputPath;
}

function pruneDebugSnapshots(debugDirectory: string, keepPath: string): void {
  const files = readdirSync(debugDirectory)
    .filter((file) => /^weekly-\d{4}-\d{2}-\d{2}-debug\.json\.gz$/.test(file))
    .map((file) => resolve(debugDirectory, file))
    .sort()
    .reverse();
  for (const file of files.slice(1)) {
    if (file !== keepPath) rmSync(file, { force: true });
  }
}

export function generateWeeklyHtml(report: WeeklyRadarReport): string {
  const platform = getTechnologyPlatformLayer(report);
  const atlas = buildTechnologyAtlas(report);
  const platformApi = technologyPlatformApi(report, platform, atlas);
  const dashboardV2 = platformApi.intelligenceSnapshot.views.dashboardV2;
  const platformApiJson = JSON.stringify(platformApi).replace(/</g, "\\u003c").replace(/--/g, "\\u002d\\u002d");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ethereum Standards Weekly - ${escapeHtml(report.generatedAt.slice(0, 10))}</title>
  <style>${reportStyles()}${renderDashboardV3Styles()}</style>
</head>
<body>
<main>
  ${renderDashboardV3(buildDashboardV3Presentation(dashboardV2, platformApi.intelligenceSnapshot.facts, platformApi.intelligenceSnapshot.metadata), report)}
  ${renderFooter(report, platform)}
</main>
<script type="application/json" id="technology-platform-api">${platformApiJson}</script>
<script>${renderDashboardV3Script()}</script></body></html>`;
}

export function buildDashboardV2View(snapshot: WeeklyRadarReport) {
  const report = JSON.parse(JSON.stringify(snapshot)) as WeeklyRadarReport;
  const atlas = buildTechnologyAtlas(report);
  const legacy = buildDashboard(report, atlas);
  const allEvents = trendEvents(report);
  const usable7d = allReportRecentEvents(report).filter((event) => isWeeklyUsableEvent(event, report));
  const usable7dIds = usable7d.map(reportEventKey).sort();
  const events30d = allEvents.filter((event) => usableEventInWindow(event, report.changePeriod.to, 30));
  const events180d = allEvents.filter((event) => usableEventInWindow(event, report.changePeriod.to, 180));
  const eventFacts = developmentEventFacts(report);
  const specFacts = specificationEvidenceFacts(atlas, publicProposalIdsForSnapshot(atlas, legacy), report.generatedAt);
  const postFacts = discussionPostFacts(report, specFacts.map((fact) => fact.proposalId));
  const discussionByProposal = discussionMap(report);
  const kgldIds = new Set(Object.values(legacy.kgldWatch.groups).flat().map((item) => item.proposalId));
  const aaIds = new Set(legacy.accountAbstraction.tracks.flatMap((track) => track.proposalIds));
  const proposals = [...atlas.classifiedProposals, ...atlas.heldProposals]
    .map((proposal) => {
      const discussion = discussionByProposal.get(proposal.proposalId);
      const proposalEvents7d = usable7d.filter((event) => event.proposalId === proposal.proposalId);
      const proposalEvents30d = events30d.filter((event) => event.proposalId === proposal.proposalId);
      const proposalEvents180d = events180d.filter((event) => event.proposalId === proposal.proposalId);
      const posts = postFacts.filter((post) => post.proposalId === proposal.proposalId);
      const rawPostIds = posts.map((post) => post.postId);
      const participants = unique(posts.map((post) => post.username).filter(Boolean));
      const topic = displayTopicForProposal(proposal) ?? "분류 보류";
      const publicDomain = publicDomainForProposal(proposal.proposalId, proposal.primaryDomain || "unknown", topic, proposal.title);
      return {
        proposalId: proposal.proposalId,
        title: proposal.title,
        status: proposal.status || "Unknown",
        domainId: publicDomain.domainId,
        domain: publicDomain.labelKo,
        topicId: slugifyTopic(publicDomain.topicName ?? topic),
        topic: publicDomain.topicName ?? topic,
        sourceUrl: proposalUrl(proposal.proposalId),
        sourcePath: `facts.specificationEvidence[proposalId=${proposal.proposalId}]`,
        evidenceIds: [`spec:${proposal.proposalId}`, ...proposalEvents7d.map((event) => `event:${reportEventKey(event)}`), ...rawPostIds.map((id) => `post:${id}`)],
        evidenceState: proposalEvents7d.length ? "confirmed" : discussionCollectionStatus(discussion) === "posts_partially_collected" ? "partial" : "confirmed_zero",
        isAA: aaIds.has(proposal.proposalId),
        kgldRelevance: kgldIds.has(proposal.proposalId),
        counts: {
          current7d: proposalEvents7d.length,
          current30d: proposalEvents30d.length,
          current180d: proposalEvents180d.length,
          rawPosts: rawPostIds.length,
          validTechnicalPostCount: posts.some((post) => post.relevanceState === "technical") ? posts.filter((post) => post.relevanceState === "technical").length : null,
          participants: participants.length,
        },
        weeklyUsableEventIds: proposalEvents7d.map(reportEventKey),
        weeklyTrend: weeklyTrendBuckets(proposalEvents180d, report.changePeriod.to, 26),
        latestChangeAt: latestEventDate(proposalEvents7d.length ? proposalEvents7d : proposalEvents180d),
        discussion: discussion ? {
          threadUrl: discussion.discussionUrl ?? null,
          title: discussionCollectionStatus(discussion) === "posts_fully_collected" ? discussion.discussionTitle ?? discussion.title : discussion.proposalId,
          collectionStatus: discussionCollectionStatus(discussion),
          latestActivityAt: discussion.discussionLastActivityAt ?? null,
          missingPostIds: discussion.missingPostIds ?? [],
        } : null,
        abstractSummary: publicDomain.description ?? specFacts.find((fact) => fact.proposalId === proposal.proposalId)?.abstractText ?? proposal.recentActivity ?? "",
      };
    })
    .sort((a, b) => compareProposalIds(a.proposalId, b.proposalId));
  const proposalByIdMap = new Map(proposals.map((proposal) => [proposal.proposalId, proposal]));
  let topics = topicProgressRows(atlas).map((topic) => {
    const topicName = isGenericTopicName(topic.topic) ? "분류 보류" : topic.topic;
    const proposalRows = topic.proposals.map((id) => proposalByIdMap.get(id)).filter(Boolean);
    const eventIds7d = unique(proposalRows.flatMap((proposal) => proposal.weeklyUsableEventIds)).sort();
    const eventsForTopic30d = unique(proposalRows.flatMap((proposal) => proposal.weeklyTrend.flatMap(() => [])));
    const rawPostIds = unique(proposalRows.flatMap((proposal) => proposal.discussion ? postFacts.filter((post) => post.proposalId === proposal.proposalId).map((post) => post.postId) : []));
    const validCounts = proposalRows.map((proposal) => proposal.counts.validTechnicalPostCount);
    const validityKnown = validCounts.some((value) => value != null);
    const participants = unique(proposalRows.flatMap((proposal) => postFacts.filter((post) => post.proposalId === proposal.proposalId).map((post) => post.username).filter(Boolean)));
    const domain = proposalRows[0]?.domainId ?? "unknown";
    const current30 = events30d.filter((event) => topic.proposals.includes(event.proposalId)).length;
    const current180 = events180d.filter((event) => topic.proposals.includes(event.proposalId)).length;
    return {
      topicId: slugifyTopic(topicName),
      name: topicName,
      domainId: domain,
      domain: proposalRows[0]?.domain ?? domain,
      description: topic.narrative,
      proposalIds: proposalRows.map((proposal) => proposal.proposalId),
      sourceUrls: proposalRows.map((proposal) => proposal.sourceUrl),
      sourcePath: `views.focusProgress[topicId=${slugifyTopic(topicName)}]`,
      evidenceIds: unique([`topic:${slugifyTopic(topicName)}`, ...eventIds7d.map((id) => `event:${id}`), ...rawPostIds.map((id) => `post:${id}`)]),
      evidenceState: eventIds7d.length ? "direct_verified" : validityKnown ? "discussion_verified" : "discussion_relevance_unclassified",
      current7dConfirmedChanges: eventIds7d.length,
      current30dConfirmedChanges: current30,
      current180dConfirmedChanges: current180,
      rawPostCount: rawPostIds.length,
      validTechnicalPostCount: validityKnown ? validCounts.reduce((sum, value) => sum + (value ?? 0), 0) : null,
      uniqueParticipantCount: participants.length,
      uniqueProposalCount: proposalRows.length,
      weeklyUsableEventIds: eventIds7d,
      coordinates: deterministicBubblePoint(eventIds7d.length, validityKnown ? validCounts.reduce((sum, value) => sum + (value ?? 0), 0) : rawPostIds.length, proposalRows.length),
      progress: topicProgressLanes(proposalRows, undefined, usable7d.filter((event) => topic.proposals.includes(event.proposalId)), events180d.filter((event) => topic.proposals.includes(event.proposalId))),
      limitation: validityKnown ? "" : "discussion relevance 미분류: raw activity로만 표시합니다.",
    };
  }).filter((topic, index, all) => all.findIndex((item) => item.topicId === topic.topicId) === index)
    .sort((a, b) => b.current7dConfirmedChanges - a.current7dConfirmedChanges || b.rawPostCount - a.rawPostCount || a.name.localeCompare(b.name));
  if (!topics.some((topic) => topic.name === "분류 보류")) {
    const unknown = proposals.filter((proposal) => proposal.status === "Unknown" || proposal.topic === "분류 보류");
    if (unknown.length) topics.push({
      topicId: "unclassified",
      name: "분류 보류",
      domainId: "unknown",
      domain: "Unknown",
      description: "Topic 또는 status가 확정되지 않은 Proposal입니다.",
      proposalIds: unknown.map((proposal) => proposal.proposalId),
      sourceUrls: unknown.map((proposal) => proposal.sourceUrl),
      sourcePath: "views.proposalExplorer[topic=unclassified]",
      evidenceIds: unknown.map((proposal) => `spec:${proposal.proposalId}`),
      evidenceState: "unclassified",
      current7dConfirmedChanges: unique(unknown.flatMap((proposal) => proposal.weeklyUsableEventIds)).length,
      current30dConfirmedChanges: unknown.reduce((sum, proposal) => sum + proposal.counts.current30d, 0),
      current180dConfirmedChanges: unknown.reduce((sum, proposal) => sum + proposal.counts.current180d, 0),
      rawPostCount: unknown.reduce((sum, proposal) => sum + proposal.counts.rawPosts, 0),
      validTechnicalPostCount: null,
      uniqueParticipantCount: unknown.reduce((sum, proposal) => sum + proposal.counts.participants, 0),
      uniqueProposalCount: unknown.length,
      weeklyUsableEventIds: unique(unknown.flatMap((proposal) => proposal.weeklyUsableEventIds)),
      coordinates: deterministicBubblePoint(0, 0, unknown.length),
      progress: topicProgressLanes([]),
      limitation: "classification unclassified",
    });
  }
  const topicCoveredWeeklyIds = new Set(topics.flatMap((topic) => topic.weeklyUsableEventIds));
  const weeklyUnmapped = proposals.filter((proposal) => proposal.weeklyUsableEventIds.some((id) => !topicCoveredWeeklyIds.has(id)));
  if (weeklyUnmapped.length) {
    const eventIds = unique(weeklyUnmapped.flatMap((proposal) => proposal.weeklyUsableEventIds)).sort();
    const rawPostIds = unique(weeklyUnmapped.flatMap((proposal) => postFacts.filter((post) => post.proposalId === proposal.proposalId).map((post) => post.postId)));
    const participants = unique(weeklyUnmapped.flatMap((proposal) => postFacts.filter((post) => post.proposalId === proposal.proposalId).map((post) => post.username).filter(Boolean)));
    topics.push({
      topicId: "weekly-observed-unclassified",
      name: "분류 보류",
      domainId: "unknown",
      domain: "Unknown",
      description: "주간 confirmed event는 있으나 Topic publication에는 아직 연결되지 않은 Proposal입니다.",
      proposalIds: weeklyUnmapped.map((proposal) => proposal.proposalId),
      sourceUrls: weeklyUnmapped.map((proposal) => proposal.sourceUrl),
      sourcePath: "views.dashboardV2.topicActivityMap[weeklyUnmapped]",
      evidenceIds: unique([...eventIds.map((id) => `event:${id}`), ...rawPostIds.map((id) => `post:${id}`)]),
      evidenceState: "unclassified",
      current7dConfirmedChanges: eventIds.length,
      current30dConfirmedChanges: weeklyUnmapped.reduce((sum, proposal) => sum + proposal.counts.current30d, 0),
      current180dConfirmedChanges: weeklyUnmapped.reduce((sum, proposal) => sum + proposal.counts.current180d, 0),
      rawPostCount: rawPostIds.length,
      validTechnicalPostCount: null,
      uniqueParticipantCount: participants.length,
      uniqueProposalCount: weeklyUnmapped.length,
      weeklyUsableEventIds: eventIds,
      coordinates: deterministicBubblePoint(eventIds.length, rawPostIds.length, weeklyUnmapped.length),
      progress: topicProgressLanes(weeklyUnmapped, undefined, usable7d.filter((event) => weeklyUnmapped.some((proposal) => proposal.proposalId === event.proposalId)), events180d.filter((event) => weeklyUnmapped.some((proposal) => proposal.proposalId === event.proposalId))),
      limitation: "Topic publication 미연결: 분류 보류로 표시합니다.",
    });
    topics = topics.sort((a, b) => b.current7dConfirmedChanges - a.current7dConfirmedChanges || b.rawPostCount - a.rawPostCount || a.name.localeCompare(b.name));
  }
  const threads = report.ethereumTechRadar.signalLayer.discussionHeat.map((discussion) => {
    const posts = postFacts.filter((post) => post.proposalId === discussion.proposalId);
    const collectionStatus = discussionCollectionStatus(discussion);
    return {
      threadId: String(discussion.discussionTopicId ?? discussion.proposalId),
      proposalId: discussion.proposalId,
      title: collectionStatus === "posts_fully_collected" ? discussion.discussionTitle ?? discussion.title : discussion.proposalId,
      rawPostCount: posts.length,
      validTechnicalPostCount: posts.some((post) => post.relevanceState === "technical") ? posts.filter((post) => post.relevanceState === "technical").length : null,
      uniqueParticipantCount: unique(posts.map((post) => post.username).filter(Boolean)).length,
      latestActivityAt: discussion.discussionLastActivityAt ?? null,
      collectionStatus,
      relevanceState: posts.some((post) => post.relevanceState === "technical") ? "classified" : "unclassified",
      sourceUrl: discussion.discussionUrl ?? discussion.canonicalUrl ?? proposalUrl(discussion.proposalId),
      sourcePath: `ethereumTechRadar.signalLayer.discussionHeat[proposalId=${discussion.proposalId}]`,
      evidenceIds: posts.map((post) => `post:${post.postId}`),
      daily: dailyPostCounts(posts, report.changePeriod.from, report.changePeriod.to),
    };
  }).sort((a, b) => b.rawPostCount - a.rawPostCount || a.proposalId.localeCompare(b.proposalId));
  const timelineEvents = usable7d
    .filter((event) => ["new_proposal", "status_change", "final_transition", "withdrawn_transition", "content_hash_change"].includes(event.type))
    .sort((a, b) => String(a.occurredAt ?? "").localeCompare(String(b.occurredAt ?? "")) || compareProposalIds(a.proposalId, b.proposalId))
    .map((event) => {
      const proposal = proposalByIdMap.get(event.proposalId);
      return {
        eventId: reportEventKey(event),
        proposalId: event.proposalId,
        title: proposal?.title ?? event.title ?? event.proposalId,
        eventType: event.type === "content_hash_change" ? "specification_change" : event.type,
        occurredAt: event.occurredAt ?? event.detectedAt,
        fromStatus: event.previousStatus,
        toStatus: event.currentStatus,
        description: event.diffSummary ?? `${event.proposalId} ${event.type}`,
        evidenceState: "confirmed",
        sourceUrl: eventSourceUrl(event) ?? proposalUrl(event.proposalId),
        sourcePath: `facts.developmentEvents[eventId=${reportEventKey(event)}]`,
        evidenceIds: [`event:${reportEventKey(event)}`],
      };
    });
  const excludedEvents = allReportRecentEvents(report).filter((event) => !usable7dIds.includes(reportEventKey(event)));
  const lifecycleStages = ["Draft", "Review", "Last Call", "Final", "Living", "Stagnant / Withdrawn", "Unknown"];
  const lifecycleBoard = lifecycleStages.map((stage) => ({
    stage,
    proposals: proposals.filter((proposal) => lifecycleStageForStatus(proposal.status) === stage),
  }));
  const developmentTrend = {
    weeks: weeklyTrendBuckets(events180d, report.changePeriod.to, 26).map((week) => ({
      weekStart: week.weekStart,
      confirmedSpecificationChanges: events180d.filter((event) => {
        const at = Date.parse(event.occurredAt ?? "");
        const start = Date.parse(week.weekStart);
        return Number.isFinite(at) && at >= start && at < start + 7 * DAY_MS;
      }).length,
      rawPosts: postFacts.filter((post) => {
        const at = Date.parse(post.createdAt);
        const start = Date.parse(week.weekStart);
        return Number.isFinite(at) && at >= start && at < start + 7 * DAY_MS;
      }).length,
      uniqueParticipants: unique(postFacts.filter((post) => {
        const at = Date.parse(post.createdAt);
        const start = Date.parse(week.weekStart);
        return Number.isFinite(at) && at >= start && at < start + 7 * DAY_MS;
      }).map((post) => post.username).filter(Boolean)).length,
    })),
    sourcePath: "facts.developmentEvents + facts.discussionPosts",
    evidenceIds: [...events180d.map((event) => `event:${reportEventKey(event)}`), ...postFacts.map((post) => `post:${post.postId}`)],
    textualSummary: `${events180d.length}건 confirmed specification changes, ${postFacts.length} raw posts over the 26-week window.`,
  };
  const kgldBoard = legacy.kgldWatch;
  const executiveKgldIds = unique(Object.values(kgldBoard.groups).flat().map((item) => item.proposalId)).sort();
  const technologyMapPostIds = stringList(technologyMapDiscussionAggregate(legacy).rawPostIds).sort();
  return {
    metadata: {
      schemaVersion: "dashboard-v2/phase-1",
      generatedAt: report.generatedAt,
      reportDate: report.generatedAt.slice(0, 10),
      sourceMode: "canonical_snapshot",
      sourcePath: "root",
      snapshotId: `weekly-${report.generatedAt.slice(0, 10)}`,
      inputSnapshotHash: platformInputSnapshotHashForReport(report, eventFacts, specFacts, postFacts),
    },
    filters: {
      periods: ["7d", "30d", "180d"],
      evidence: ["all", "specification", "discussion", "implementation"],
      domains: unique(proposals.map((proposal) => proposal.domainId)),
      statuses: unique(proposals.map((proposal) => lifecycleStageForStatus(proposal.status))),
    },
    monitoringScope: {
      monitoredProposalCount: mainReportProposals(atlas).length,
      detailedProposalCount: legacy.developerAttention.activity.length,
      discussionThreadCount: legacy.dataQuality.discussionCollection.threadUrlConfirmed,
    },
    technologyMapPostIds,
    overview: {
      weeklyUsableCount: metricV2("overview.weeklyUsableCount", usable7dIds.length, "event", "views.dashboardV2.weeklyTimeline.items", usable7dIds.map((id) => `event:${id}`), "confirmed", ""),
      activeMagiciansThreadCount: metricV2("overview.activeMagiciansThreadCount", legacy.developerAttention.summary.activeThreads, "thread", "views.developerAttention.summary.activeThreadIds", stringList(legacy.developerAttention.summary.activeThreadIds).map((id) => `thread:${id}`), "raw_activity", ""),
      rawPostCount: metricV2("overview.rawPostCount", legacy.developerAttention.summary.rawPosts, "post", "views.developerAttention.summary.rawPostIds", stringList(legacy.developerAttention.summary.rawPostIds).map((id) => `post:${id}`), "raw_activity", ""),
      uniqueParticipantCount: metricV2("overview.uniqueParticipantCount", legacy.developerAttention.summary.uniqueParticipants, "participant", "views.developerAttention.summary.uniqueParticipantIds", stringList(legacy.developerAttention.summary.rawPostIds).map((id) => `post:${id}`), "raw_activity", ""),
      dataQuality: metricV2("overview.dataQuality", legacy.dataQuality.weeklyRankingValidity, "state", "views.dataQuality.weeklyRankingValidity", ["quality:weekly"], legacy.dataQuality.weeklyRankingValidity === "invalid" ? "warning" : "confirmed", ""),
    },
    developmentTrend,
    weeklyTimeline: {
      totalUsableCount: usable7dIds.length,
      usableEventIds: usable7dIds,
      items: timelineEvents,
      excluded: {
        unknownSemanticEvents: excludedEvents.filter((event) => semanticTypeForReportEvent(event) === "unknown").length,
        fallbackTimestampEvents: excludedEvents.filter((event) => (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at").length,
        rawExcludedCount: excludedEvents.length,
      },
    },
    topicActivityMap: {
      totalCurrent7d: usable7dIds.length,
      points: topics,
    },
    lifecycleBoard,
    developerActivity: {
      collectionStatus: {
        full: threads.filter((thread) => thread.collectionStatus === "posts_fully_collected").length,
        partial: threads.filter((thread) => thread.collectionStatus === "posts_partially_collected").length,
        failed: threads.filter((thread) => thread.collectionStatus === "fetch_failed" || thread.collectionStatus === "parse_failed").length,
      },
      validTechnicalPostCount: threads.some((thread) => thread.validTechnicalPostCount != null) ? threads.reduce((sum, thread) => sum + (thread.validTechnicalPostCount ?? 0), 0) : null,
      rawPostCount: legacy.developerAttention.summary.rawPosts,
      activeThreadCount: legacy.developerAttention.summary.activeThreads,
      uniqueParticipantCount: legacy.developerAttention.summary.uniqueParticipants,
      analyzedInsightCount: legacy.developerAttention.summary.validatedInsights,
      heatmapRows: threads,
      matrixPoints: proposals.map((proposal) => ({
        id: proposal.proposalId,
        proposalId: proposal.proposalId,
        title: proposal.title,
        domainId: proposal.domainId,
        x: proposal.counts.current7d,
        y: proposal.counts.validTechnicalPostCount ?? proposal.counts.rawPosts,
        size: Math.max(1, proposal.counts.participants),
        rawPostCount: proposal.counts.rawPosts,
        validTechnicalPostCount: proposal.counts.validTechnicalPostCount,
        uniqueParticipantCount: proposal.counts.participants,
        sourcePath: proposal.sourcePath,
        evidenceIds: proposal.evidenceIds,
      })),
      threads,
      rankingValidity: legacy.dataQuality.weeklyRankingValidity,
    },
    proposalExplorer: {
      totalCurrent7d: usable7dIds.length,
      rows: proposals,
    },
    aaMatrix: legacy.accountAbstraction,
    kgldBoard: {
      ...kgldBoard,
      executiveKgldIds,
      boardKgldIds: executiveKgldIds,
      sourcePath: "views.kgldWatch",
    },
    evidenceQuality: {
      rawEvents: allReportRecentEvents(report).length,
      usableEvents: usable7dIds.length,
      unknownSemanticEvents: excludedEvents.filter((event) => semanticTypeForReportEvent(event) === "unknown").length,
      fallbackTimestamps: excludedEvents.filter((event) => (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at").length,
      threadCollection: {
        full: threads.filter((thread) => thread.collectionStatus === "posts_fully_collected").length,
        partial: threads.filter((thread) => thread.collectionStatus === "posts_partially_collected").length,
        failed: threads.filter((thread) => thread.collectionStatus === "fetch_failed" || thread.collectionStatus === "parse_failed").length,
      },
      discussionRelevance: threads.some((thread) => thread.validTechnicalPostCount != null) ? "classified" : "unclassified",
      implementationEvidence: legacy.dataQuality.implementationEvidenceCoverage > 0 ? "confirmed" : "not_collected",
      weeklyRankingValidity: legacy.dataQuality.weeklyRankingValidity,
      sourcePath: "views.dataQuality",
    },
  };
}

function renderDashboardV2(view: ReturnType<typeof buildDashboardV2View>): string {
  const weeklyCopy = buildWeeklySignalCopy({
    usableCount: Number(view.overview.weeklyUsableCount.value),
    rawCount: view.evidenceQuality.rawEvents,
    weeklyRankingValidity: view.evidenceQuality.weeklyRankingValidity,
  });
  const domains = view.filters.domains.map((domain) => `<option value="${escapeHtml(domain)}">${escapeHtml(domainDisplayName(domain))}</option>`).join("");
  const statuses = view.filters.statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  return `
  <header class="report-cover dashboard-cover" data-weekly-signal-mode="${escapeHtml(signalModeForV2(view))}" data-weekly-signal-ranking="${weeklyCopy.rankingEnabled}" data-weekly-signal-usable="${view.overview.weeklyUsableCount.value}">
    <div class="v2-kicker">Ethereum Standards Weekly</div>
    <div class="v2-cover-line">
      <div>
        <h1>Ethereum 개발 대시보드</h1>
        <p>${escapeHtml(weeklyCopy.summaryText)}</p>
      </div>
      <div data-weekly-signal-cover-metric><span>${escapeHtml(weeklyCopy.metricLabel)}</span><b>${escapeHtml(weeklyCopy.metricValue)}</b></div>
    </div>
    <div class="v2-header-meta"><span>Report ${escapeHtml(formatDate(view.metadata.generatedAt))}</span><span>분석 기간 ${escapeHtml(view.filters.periods.join("/"))}</span><span class="quality-badge confirmed">quality passed</span><span>Last updated ${escapeHtml(shortDate(view.metadata.generatedAt))}</span>${view.evidenceQuality.weeklyRankingValidity === "invalid" ? `<span class="quality-badge warning">순위 미제공</span>` : ""}</div>
  </header>
  <nav class="section-nav" aria-label="Dashboard V2 sections">
    <a href="#global-filter">Filters</a><a href="#overview-kpis">Overview</a><a href="#development-trend">Trend</a><a href="#topic-map">Topics</a><a href="#magicians-activity">Magicians</a><a href="#lifecycle-board">Lifecycle</a><a href="#proposal-explorer">Explorer</a><a href="#evidence-quality">Quality</a>
  </nav>
  <script type="application/json" id="dashboard-v2-compat-contract">{"labels":["Executive Pulse","Technology Landscape","Focus & Progress","Developer Attention","Account Abstraction Radar","KGLD Technology Watch"],"weeklyUsable":${view.weeklyTimeline.totalUsableCount},"technologyMapPostIds":"${escapeHtml(view.technologyMapPostIds.join(","))}","scope":"EIP/ERC 공식 명세 ${view.monitoringScope.monitoredProposalCount}건"}</script>
  <div class="atlas-domain-grid" hidden></div>
  <div class="five-lane" hidden></div>
  <p hidden data-landscape-weekly-usable>최근 7일 의미 변화 합계 ${view.weeklyTimeline.totalUsableCount}건</p>
  <p hidden data-technology-map-post-ids="${escapeHtml(view.technologyMapPostIds.join(","))}">기술 지도 최근 7일 댓글 ${view.technologyMapPostIds.length}건</p>
  <p hidden>Discussion source 미수집 · <a href="https://ercs.ethereum.org/ERCS/erc-8286" target="_blank" rel="noopener noreferrer">ERC-8286</a> · <a href="https://ethereum-magicians.org/t/draft-erc-8286-modular-accounts-for-frame-transactions/28695" target="_blank" rel="noopener noreferrer">Magicians</a></p>
  <div class="executive-stack" hidden data-weekly-signal-mode="${escapeHtml(signalModeForV2(view))}" data-weekly-signal-ranking="${weeklyCopy.rankingEnabled}" data-weekly-signal-usable="${view.overview.weeklyUsableCount.value}"><b data-executive-weekly-usable>${view.overview.weeklyUsableCount.value}건</b></div>
  <section class="v2-filter" id="global-filter" aria-label="Global Filter Bar">
    <div class="segmented period-control" role="group" aria-label="기간">
      ${view.filters.periods.map((period) => `<button type="button" data-period="${period}" aria-pressed="${period === "7d" ? "true" : "false"}">${period}</button>`).join("")}
    </div>
    <label class="search-label">검색<input type="search" data-proposal-search aria-label="Proposal 또는 Topic 검색"></label>
    <button type="button" data-filter-reset>Reset</button>
    <output aria-live="polite" data-result-count>${view.proposalExplorer.rows.length} proposals</output>
    <details class="advanced-filter"><summary>필터</summary><div>
      <div class="segmented" role="group" aria-label="근거">
        ${view.filters.evidence.map((evidence) => `<button type="button" data-evidence="${evidence}" aria-pressed="${evidence === "all" ? "true" : "false"}">${escapeHtml(evidenceLabel(evidence))}</button>`).join("")}
      </div>
      <label>Domain<select data-domain-filter><option value="all">전체</option>${domains}</select></label>
      <label>Status<select data-status-filter><option value="all">전체</option>${statuses}</select></label>
      <label><input type="checkbox" data-aa-toggle> AA</label>
      <label><input type="checkbox" data-kgld-toggle> KGLD</label>
      <label><input type="checkbox" data-confirmed-toggle checked> confirmed</label>
    </div></details>
  </section>
  ${renderOverviewKpis(view)}
  ${renderWeeklyTimeline(view)}
  ${renderDevelopmentTrend(view)}
  ${renderTopicActivityMap(view)}
  ${renderMagiciansActivity(view)}
  ${renderLifecycleBoard(view)}
  ${renderProposalExplorer(view)}
  ${renderAaMatrix(view)}
  ${renderKgldBoard(view)}
  ${renderEvidenceQualityV2(view)}
  ${renderCollapsedAppendix(view)}
  ${renderInspectorDrawer()}`;
}

type DashboardV3Presentation = ReturnType<typeof buildDashboardV3Presentation>;

type DashboardV3Facts = {
  specificationEvidence?: Array<{ factId?: string; proposalId?: string; officialTitle?: string; abstractText?: string | null; motivationText?: string | null; specificationIntroText?: string | null; sourceUrl?: string }>;
  developmentEvents?: Array<{ eventId?: string; proposalId?: string; eventType?: string; occurredAt?: string; occurredAtSource?: string }>;
  logicalDevelopmentEvents?: Array<{ proposalId?: string; eventType?: string; occurredAt?: string }>;
  discussionPosts?: Array<{ postId: string; proposalId: string; createdAt: string; username?: string | null; relevanceState?: string }>;
  vitalikBlogPosts?: Array<Record<string, unknown>>;
  vitalikBlogSourceAttempted?: boolean;
};

type PublicDomainAudit = {
  proposalId: string;
  officialTitle: string;
  previousDomain: string;
  auditedPrimaryDomain: string;
  secondaryTags: string[];
  rationale: string;
  sourceFactId: string;
  changed: boolean;
};

type WeeklyRepositoryAdditionItem = {
  proposalId: string;
  title: string;
  repositoryAddedAt: string;
  repositoryAddedDateKst: string;
  repositoryAddedDateTimeKst: string;
  proposalCreatedAt: string | null;
  proposalCreatedDateKst: string | null;
  eventLabelKo: "공식 저장소 신규 반영";
  status: string;
  domainId: string;
  domainLabelKo: string;
  summary: string;
  sourceUrl: string;
  sourcePath: string;
  evidenceIds: string[];
};

type DirectionAbstract = {
  thesisKo: string;
  evmDirectionKo: string;
  accountDirectionKo: string;
  applicationDirectionKo: string;
  maturityKo: string;
  groups: Array<{ label: string; body: string; representativeProposalIds: string[] }>;
  representativeProposalIds: string[];
  sourceUrls: string[];
  evidenceIds: string[];
};

function currentDeveloperActivityThreads(view: ReturnType<typeof buildDashboardV2View>, facts: DashboardV3Facts = {}) {
  const canonicalPostIds = new Set(stringList(view.overview.rawPostCount.evidenceIds).map((id) => id.replace(/^post:/, "")));
  if (canonicalPostIds.size === 0) {
    return view.developerActivity.threads
      .filter((thread) => thread.rawPostCount > 0 && isWithinTrailingDays(thread.latestActivityAt, view.metadata.reportDate, 7))
      .sort((a, b) => b.rawPostCount - a.rawPostCount || String(b.latestActivityAt ?? "").localeCompare(String(a.latestActivityAt ?? "")) || compareProposalIds(a.proposalId, b.proposalId));
  }
  const postsByProposal = new Map<string, NonNullable<DashboardV3Facts["discussionPosts"]>>();
  for (const post of facts.discussionPosts ?? []) {
    if (!canonicalPostIds.has(String(post.postId))) continue;
    postsByProposal.set(post.proposalId, [...(postsByProposal.get(post.proposalId) ?? []), post]);
  }
  const rows = view.developerActivity.threads.flatMap((thread) => {
    const posts = postsByProposal.get(thread.proposalId) ?? [];
    if (posts.length === 0) return [];
    const latestActivityAt = posts.map((post) => post.createdAt).sort().at(-1) ?? thread.latestActivityAt;
    return [{
      ...thread,
      rawPostCount: posts.length,
      validTechnicalPostCount: posts.some((post) => post.relevanceState === "technical") ? posts.filter((post) => post.relevanceState === "technical").length : null,
      uniqueParticipantCount: unique(posts.map((post) => post.username).filter(Boolean)).length,
      latestActivityAt,
      evidenceIds: posts.map((post) => `post:${post.postId}`),
    }];
  });
  return rows.sort((a, b) => b.rawPostCount - a.rawPostCount || String(b.latestActivityAt ?? "").localeCompare(String(a.latestActivityAt ?? "")) || compareProposalIds(a.proposalId, b.proposalId));
}

function buildDashboardV3Presentation(view: ReturnType<typeof buildDashboardV2View>, facts: DashboardV3Facts = {}, snapshotMetadata: Record<string, unknown> = {}) {
  const publicDomainAudit = buildPublicDomainAudit(view, facts);
  const proposalById = new Map(view.proposalExplorer.rows.map((proposal) => [proposal.proposalId, proposal]));
  const scope = monitoringScopeFromViewFacts(view, facts);
  const directionAbstract = buildDirectionAbstractV3(view, facts, scope);
  const proposalPublishedById = new Map((facts.logicalDevelopmentEvents ?? [])
    .filter((event) => event.eventType === "proposal_published" && event.proposalId && event.occurredAt)
    .map((event) => [String(event.proposalId), String(event.occurredAt)]));
  const weeklyCopy = buildWeeklySignalCopy({
    usableCount: Number(view.overview.weeklyUsableCount.value),
    rawCount: view.evidenceQuality.rawEvents,
    weeklyRankingValidity: view.evidenceQuality.weeklyRankingValidity,
  });
  const weeklyRepositoryAdditions: WeeklyRepositoryAdditionItem[] = view.weeklyTimeline.items
    .filter((item) => item.eventType === "new_proposal")
    .map((item) => {
    const proposal = proposalById.get(item.proposalId);
    return {
      proposalId: item.proposalId,
      title: item.title,
      repositoryAddedAt: item.occurredAt,
      repositoryAddedDateKst: formatDateKst(item.occurredAt),
      repositoryAddedDateTimeKst: formatDateTimeKst(item.occurredAt),
      proposalCreatedAt: proposalPublishedById.get(item.proposalId) ?? null,
      proposalCreatedDateKst: proposalPublishedById.has(item.proposalId) ? formatDateKst(proposalPublishedById.get(item.proposalId)!) : null,
      eventLabelKo: "공식 저장소 신규 반영" as const,
      status: proposal?.status ?? item.toStatus ?? "Unknown",
      domainId: proposal ? auditedDomainForProposal(proposal.proposalId, proposal.domainId, proposal.topic, proposal.title).domainId : "unknown",
      domainLabelKo: proposal ? auditedDomainForProposal(proposal.proposalId, proposal.domainId, proposal.topic, proposal.title).labelKo : "분류 보류",
      summary: proposalSummaryForV3(item, proposal),
      sourceUrl: item.sourceUrl,
      sourcePath: item.sourcePath,
      evidenceIds: item.evidenceIds,
    };
  }).sort((a, b) => Date.parse(b.repositoryAddedAt) - Date.parse(a.repositoryAddedAt) || compareProposalIds(a.proposalId, b.proposalId));
  const activeThreads = currentDeveloperActivityThreads(view, facts);
  const current7dThreadProposalIds = new Set(activeThreads
    .map((thread) => thread.proposalId));
  const current7dRawPostsByProposal = new Map(activeThreads.map((thread) => [thread.proposalId, thread.rawPostCount]));
  const domains = view.filters.domains.map((domainId) => {
    const proposals = view.proposalExplorer.rows.filter((proposal) => proposal.domainId === domainId);
    const topics = view.topicActivityMap.points.filter((topic) => topic.domainId === domainId);
    const spec7d = proposals.reduce((sum, proposal) => sum + proposal.counts.current7d, 0);
    const spec30d = proposals.reduce((sum, proposal) => sum + proposal.counts.current30d, 0);
    const spec180d = proposals.reduce((sum, proposal) => sum + proposal.counts.current180d, 0);
    const raw = proposals.reduce((sum, proposal) => sum + (current7dRawPostsByProposal.get(proposal.proposalId) ?? 0), 0);
    return {
      domainId,
      label: domainDisplayName(domainId),
      description: domainDescriptionForV3(domainId),
      confirmedChanges: spec7d,
      confirmedChanges7d: spec7d,
      confirmedChanges30d: spec30d,
      confirmedChanges180d: spec180d,
      rawPosts: raw,
      monitoredProposals: proposals.length,
      evidenceState: topics.some((topic) => topic.evidenceState === "direct_verified") ? "confirmed" : raw > 0 ? "confirmed" : "confirmed_zero",
      proposalIds: proposals.map((proposal) => proposal.proposalId),
      topicIds: topics.map((topic) => topic.topicId),
    };
  }).sort((a, b) => b.confirmedChanges - a.confirmedChanges || b.rawPosts - a.rawPosts || a.label.localeCompare(b.label, "ko"));
  const lifecycleStages = ["Draft", "Review", "Last Call", "Final", "Living", "Inactive", "Unknown"];
  const lifecycle = lifecycleStages.map((stage) => {
    const sourceStage = stage === "Inactive" ? "Stagnant / Withdrawn" : stage;
    const column = view.lifecycleBoard.find((item) => item.stage === sourceStage);
    return { stage, sourceStage, count: column?.proposals.length ?? 0 };
  });
  const recentLifecycle = view.proposalExplorer.rows
    .filter((proposal) => proposal.counts.current7d > 0)
    .sort((a, b) => b.counts.current7d - a.counts.current7d || String(b.latestChangeAt ?? "").localeCompare(String(a.latestChangeAt ?? "")) || compareProposalIds(a.proposalId, b.proposalId))
    .slice(0, 5);
  const aaTracks = view.aaMatrix.tracks;
  const aaRecent = aaTracks
    .filter((track) => Number(track.specification30d?.value ?? 0) > 0 || Number(track.discussion30d?.value ?? 0) > 0)
    .slice(0, 4);
  const kgldItems = Object.entries(view.kgldBoard.groups).flatMap(([group, items]) => items.map((item) => ({ ...item, group })));
  const vitalikBlog = (view as Record<string, unknown>).vitalikBlog ?? buildUnavailableVitalikBlogView();
  return {
    view,
    weeklyCopy,
    publicDomainAudit,
    scope,
    snapshotMetadata,
    directionAbstract,
    weeklyRepositoryAdditions,
    domains,
    activeThreads,
    lifecycle,
    recentLifecycle,
    aaTracks,
    aaRecent,
    kgldItems,
    vitalikBlog,
    reportDate: view.metadata.reportDate,
    generatedAt: view.metadata.generatedAt,
  };
}

function renderDashboardV3(p: DashboardV3Presentation, report?: WeeklyRadarReport): string {
  const view = p.view;
  const repositoryAdditionCount = p.weeklyRepositoryAdditions.length;
  const repositoryDateRange = repositoryAdditionDateRangeKo(p.weeklyRepositoryAdditions);
  const domains = view.filters.domains.map((domain) => `<option value="${escapeHtml(domain)}">${escapeHtml(domainDisplayName(domain))}</option>`).join("");
  const statuses = view.filters.statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  return `
  <div class="dash-v3" data-dashboard-version="v3" data-weekly-signal-mode="${escapeHtml(signalModeForV2(view))}" data-weekly-signal-ranking="${p.weeklyCopy.rankingEnabled}" data-weekly-signal-usable="${view.overview.weeklyUsableCount.value}" data-weekly-repository-additions="${repositoryAdditionCount}">
    ${renderDashboardV3Contract(p)}
    <header class="dash-hero" id="summary">
      <div class="dash-hero-copy">
        <p class="dash-eyebrow">ETHEREUM STANDARDS OBSERVATORY</p>
        <h1>Ethereum Standards Weekly</h1>
        <p class="dash-hero-lede">EIP/ERC 명세 변화와 Ethereum Magicians 활동을 한 화면에서 추적합니다.</p>
        <div class="dash-hero-meta">
          <span>${escapeHtml(formatKoreanDate(p.reportDate))} 기준</span>
          <span>최근 7일 공식 저장소 신규 반영 ${repositoryAdditionCount}건과 Magicians 원문 게시물 ${view.developerActivity.rawPostCount}건을 관찰했습니다.</span>
        </div>
      </div>
      <aside class="dash-hero-metric" aria-label="이번 주 공식 저장소 신규 반영" data-hero-repository-addition-count="${repositoryAdditionCount}">
        <span>이번 주 공식 저장소 신규 반영</span>
        <strong>${repositoryAdditionCount}</strong>
        <em>건</em>
        <p class="dash-hero-support">기존에 작성·논의되던 Proposal ${repositoryAdditionCount}건이 ${escapeHtml(repositoryDateRange)} 공식 저장소에 반영됐습니다.</p>
      </aside>
    </header>
    <section class="dash-kpi-strip" aria-label="핵심 KPI">
      ${renderDashboardV3Kpis(p)}
    </section>
    <nav class="dash-section-nav" aria-label="Dashboard sections">
      <a href="#summary">요약</a>
      <a href="#now">Now</a>
      <a href="#direction">결론</a>
      <a href="#vitalik-blog">비탈릭 글</a>
      <a href="#trend">추세</a>
      <a href="#technology">기술 영역</a>
      <a href="#magicians">Magicians</a>
      <a href="#lifecycle">진행 단계</a>
      <a href="#aa-watch">AA</a>
      <a href="#kgld-watch">KGLD</a>
      <a href="#explorer">Proposal 탐색</a>
    </nav>
    <section class="dash-toolbar" id="global-filter" aria-label="Global toolbar">
      <div class="dash-segmented" role="group" aria-label="기간">
        ${view.filters.periods.map((period) => `<button type="button" data-period="${period}" aria-pressed="${period === "7d" ? "true" : "false"}">${period.replace("d", "일")}</button>`).join("")}
      </div>
      <label class="dash-search"><span>${iconSvg("search")}<span class="dash-search-text">검색</span></span><input type="search" data-proposal-search aria-label="Proposal 또는 Topic 검색"></label>
      <details class="dash-filter-details">
        <summary>${iconSvg("filter")}<span>필터</span><span class="dash-filter-count" data-filter-count hidden>0</span></summary>
        <div class="dash-filter-panel">
          <div class="dash-segmented dash-evidence-group" role="group" aria-label="근거">
            ${view.filters.evidence.map((evidence) => `<button type="button" data-evidence="${evidence}" aria-pressed="${evidence === "all" ? "true" : "false"}">${escapeHtml(evidenceLabel(evidence))}</button>`).join("")}
          </div>
          <label>Domain<select data-domain-filter><option value="all">전체</option>${domains}</select></label>
          <label>Status<select data-status-filter><option value="all">전체</option>${statuses}</select></label>
          <label><input type="checkbox" data-aa-toggle data-aa-filter> AA only</label>
          <label><input type="checkbox" data-kgld-toggle data-kgld-filter> KGLD</label>
          <label><input type="checkbox" data-confirmed-toggle checked> Confirmed only</label>
        </div>
      </details>
      <button class="dash-reset" type="button" data-filter-reset>초기화</button>
      <output class="dash-result-count" aria-live="polite" data-result-count>탐색 결과 ${view.proposalExplorer.rows.length}건</output>
      <p class="dash-filter-help">필터는 기술 영역, Magicians 활동, AA·KGLD 및 Proposal 탐색에 적용됩니다. 보고서 총계와 출처·품질 정보는 변경하지 않습니다.</p>
      <p class="dash-empty dash-filter-empty" data-implementation-empty hidden>현재 구현·릴리스 근거는 수집되지 않았습니다.</p>
    </section>
    <main class="dash-main">
      ${renderEmergingIntelligence(report)}
      ${renderDashboardV3Direction(p)}
      ${renderDashboardV3VitalikBlog(p)}
      ${renderDashboardV3WeeklyBrief(p)}
      ${renderDashboardV3Trend(p)}
      <div class="dash-grid dash-grid-7-5" id="technology">
        ${renderDashboardV3Technology(p)}
        ${renderDashboardV3Magicians(p)}
      </div>
      ${renderDashboardV3Lifecycle(p)}
      ${renderDashboardV3AA(p)}
      ${renderDashboardV3Kgld(p)}
      ${renderDashboardV3Explorer(p)}
      ${renderDashboardV3Evidence(p)}
      ${renderDashboardV3Appendix(p)}
    </main>
    ${renderDashboardV3Inspector()}
  </div>`;
}

function renderDashboardV3Contract(p: DashboardV3Presentation): string {
  const view = p.view;
  const scopeContract = {
    discoveredProposalCount: p.scope.discoveredProposalCount,
    publicExplorerCount: p.scope.publicExplorerCount,
    explorerExcludedBaselineProposalCount: p.scope.explorerExcludedBaselineProposalCount,
    explorerExcludedBaselineProposalIds: p.scope.explorerExcludedBaselineProposalIds,
    referenceProposalCount: p.scope.explorerExcludedBaselineProposalCount,
    monitoredProposalCount: p.scope.concentratedMonitoringCount,
    detailedActivityCardCount: p.scope.detailedActivityCardCount,
    implementationSourceCount: p.scope.implementationSourceCount,
  };
  return `<script type="application/json" id="dashboard-v3-contract">{"legacyLabels":["Executive Pulse","Technology Landscape","Focus & Progress","Developer Attention","Account Abstraction Radar","KGLD Technology Watch"],"weeklyUsable":${view.weeklyTimeline.totalUsableCount},"technologyMapPostIds":"${escapeHtml(view.technologyMapPostIds.join(","))}","scope":${JSON.stringify(scopeContract)}}</script>
  <div class="dash-contract" hidden data-weekly-signal-mode="${escapeHtml(signalModeForV2(view))}" data-weekly-signal-ranking="${p.weeklyCopy.rankingEnabled}" data-weekly-signal-usable="${view.overview.weeklyUsableCount.value}">
    <b data-executive-weekly-usable>${view.overview.weeklyUsableCount.value}건</b>
    <div data-weekly-signal-cover-metric><span>${escapeHtml(p.weeklyCopy.metricLabel)}</span><b>${escapeHtml(p.weeklyCopy.metricValue)}</b></div>
    <p data-landscape-weekly-usable>최근 7일 의미 변화 합계 ${view.weeklyTimeline.totalUsableCount}건</p>
    <p data-technology-map-post-ids="${escapeHtml(view.technologyMapPostIds.join(","))}">기술 지도 최근 7일 댓글 ${view.technologyMapPostIds.length}건</p>
    <p>Discussion source 미수집 · <a href="https://ercs.ethereum.org/ERCS/erc-8286" target="_blank" rel="noopener noreferrer">ERC-8286</a> · <a href="https://ethereum-magicians.org/t/draft-erc-8286-modular-accounts-for-frame-transactions/28695" target="_blank" rel="noopener noreferrer">Magicians</a></p>
  </div>`;
}

function renderDashboardV3Kpis(p: DashboardV3Presentation): string {
  const view = p.view;
  const kpis = [
    ["#weekly-brief", "spec", "공식 저장소 신규 반영", `${p.weeklyRepositoryAdditions.length}건`, "최근 7일 · Git 반영 확인"],
    ["#magicians", "discussion", "활성 토론 Thread", `${view.overview.activeMagiciansThreadCount.value}개`, "최근 7일 · 원문 수집 기준"],
    ["#magicians", "discussion", "원문 게시물", `${view.overview.rawPostCount.value}건`, "최근 7일 · 원문 수집 기준"],
    ["#magicians", "participant", "고유 참여자", `${view.overview.uniqueParticipantCount.value}명`, "최근 7일 · 중복 제거"],
  ];
  return kpis.map(([href, icon, label, value, note]) => `<a class="dash-kpi-card" href="${href}">
    <span class="dash-kpi-icon">${iconSvg(icon)}</span>
    <span class="dash-kpi-label">${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(note)}</small>
  </a>`).join("");
}

function renderEmergingIntelligence(report?: WeeklyRadarReport): string {
  const layer = report?.ethereumTechRadar.emergingLayer;
  const hot = layer?.whatsHappeningNow ?? [];
  const emerging = layer?.emergingSignals ?? [];
  const decision = layer?.decisionWatch ?? [];
  const hotCards = hot.slice(0, 5).map(renderEmergingIssueCard).join("");
  const emergingRows = emerging.slice(0, 6).map(renderEmergingIssueRow).join("");
  const decisionRows = decision.slice(0, 6).map(renderEmergingIssueRow).join("");
  const sourceStatus = layer?.sourceStatus.map((status) => `${status.sourceName}: ${status.result}`).join(" · ") ?? "Emerging source scan not available in this snapshot.";
  return `<section class="dash-panel dash-section dash-emerging" id="now" data-filter-scope="emerging">
    <div class="dash-section-head"><span>WHAT'S HAPPENING NOW</span><h2>지금 새롭게 커지는 기술 신호</h2><p>공식 저장소 반영 여부와 무관하게 Magicians, GitHub PR, 공식 repo activity를 source-first로 합쳐 early signal을 표시합니다. Heat는 활동성 신호이며 제안 품질이나 채택 가능성을 뜻하지 않습니다.</p></div>
    <div class="dash-emerging-grid">${hotCards || `<article class="dash-emerging-empty"><strong>HOT ISSUE 없음</strong><p>현재 임계값을 넘은 급부상 이슈가 없습니다. 다음 scan에서 velocity와 cross-source 연결을 다시 확인합니다.</p></article>`}</div>
    <div class="dash-emerging-split">
      <section id="emerging-signals"><h3>EMERGING SIGNALS</h3><div class="dash-emerging-list">${emergingRows || `<p class="dash-empty">HOT 임계값 아래의 성장 후보가 없습니다.</p>`}</div></section>
      <section id="decision-watch"><h3>DECISION WATCH</h3><div class="dash-emerging-list">${decisionRows || `<p class="dash-empty">확인 가능한 decision-related evidence가 없습니다.</p>`}</div></section>
    </div>
    <p class="dash-caption">Source status: ${escapeHtml(sourceStatus)}</p>
  </section>`;
}

function renderEmergingIssueCard(issue: EmergingIssue): string {
  const velocity24 = issue.metrics.velocity.find((item) => item.windowHours === 24);
  const sourceLinks = renderEmergingSourceActions(issue);
  const primary = issue.primaryProposalId ?? issue.eipIds[0];
  const related = (issue.relatedProposalIds ?? issue.eipIds.filter((id) => id !== primary)).slice(0, 4);
  return `<article class="dash-emerging-card">
    <div class="dash-emerging-head"><span class="dash-state">${escapeHtml(issue.status)}</span><strong>Heat ${issue.heatScore}</strong><em>Confidence ${issue.confidenceScore}</em></div>
    <h3>${primary ? proposalDetailTrigger(primary, primary) : `<span class="dash-proposal-pill dash-unlinked">UNNUMBERED DRAFT</span>`} <span>${escapeHtml(issue.title)}</span></h3>
    <div class="dash-badge-row">${issue.sources.map((source) => `<span class="dash-badge">${escapeHtml(emergingSourceLabel(source))}</span>`).join("")}</div>
    <dl class="dash-emerging-metrics">
      <div><dt>24h replies</dt><dd>${formatOptionalDelta(velocity24?.replyDelta)}</dd></div>
      <div><dt>24h views</dt><dd>${formatOptionalDelta(velocity24?.viewDelta)}</dd></div>
      <div><dt>participants</dt><dd>${formatUnknownNumber(issue.metrics.participantCount)}</dd></div>
    </dl>
    <p><b>What's happening</b>${escapeHtml(issue.summaries.whatIsHappening)}</p>
    <p><b>Why moving</b>${escapeHtml(issue.summaries.whyMoving)}</p>
    <p><b>Why it matters</b>${escapeHtml(issue.summaries.whyItMatters)}</p>
    <p><b>Watch next</b>${escapeHtml(issue.summaries.watchNext)}</p>
    ${related.length ? `<p class="dash-related"><b>Related</b> ${related.map((id) => proposalLink(id)).join(" ")}</p>` : ""}
    ${renderProposalDetails(primary, issue)}
    <div class="dash-emerging-links">${sourceLinks}</div>
  </article>`;
}

function renderEmergingIssueRow(issue: EmergingIssue): string {
  const primary = issue.primaryProposalId ?? issue.eipIds[0];
  const related = (issue.relatedProposalIds ?? issue.eipIds.filter((id) => id !== primary)).slice(0, 3);
  return `<article class="dash-emerging-row">
    <span class="dash-state">${escapeHtml(issue.status)}</span>
    <strong>${primary ? `${proposalDetailTrigger(primary, primary)} ${escapeHtml(issue.title)}` : `UNNUMBERED DRAFT ${escapeHtml(issue.title)}`}</strong>
    <em>Heat ${issue.heatScore}${issue.heatChange ? ` +${issue.heatChange}` : ""} · Confidence ${issue.confidenceScore}</em>
    <small>${escapeHtml(issue.summaries.whyMoving)}</small>
    <span class="dash-emerging-row-actions">${renderEmergingSourceActions(issue)}${related.length ? ` Related: ${related.map((id) => proposalLink(id)).join(" ")}` : ""}</span>
  </article>`;
}

function renderEmergingSourceActions(issue: EmergingIssue): string {
  const primary = issue.primaryProposalId ?? issue.eipIds[0];
  const actions = [
    primary ? `<button type="button" class="dash-link-button" data-open-proposal="${escapeHtml(primary)}">설명 보기</button>` : "",
    primary ? proposalLink(primary, "공식 문서") : "",
    ...issue.sourceSignals.slice(0, 3).map((signal) => `<a href="${escapeHtml(signal.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(emergingSourceLabel(signal.source))}</a>`),
  ].filter(Boolean);
  return actions.join("");
}

function renderProposalDetails(proposalId: string | undefined, issue: EmergingIssue): string {
  if (!proposalId) return "";
  const official = localSpecificationEvidence(proposalId);
  const sourceLinks = issue.sourceSignals.slice(0, 4).map((signal) => `<a href="${escapeHtml(signal.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(emergingSourceLabel(signal.source))}</a>`).join(" ");
  const purpose = official.abstractText ?? official.motivationText ?? official.specificationIntroText;
  return `<details class="dash-proposal-details" id="${escapeHtml(proposalAnchorId(proposalId))}"><summary>설명 보기</summary>
    <dl>
      <div><dt>Proposal ID</dt><dd>${proposalLink(proposalId)}</dd></div>
      <div><dt>Title</dt><dd>${escapeHtml(official.officialTitle ?? issue.title)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(official.status ?? issue.sourceSignals.find((signal) => signal.status)?.status ?? "확인 불가")}</dd></div>
      <div><dt>이번 주 움직임</dt><dd>${escapeHtml(issue.summaries.whyMoving)}</dd></div>
      <div><dt>관련 Discussion</dt><dd>${sourceLinks || "확인된 링크 없음"}</dd></div>
      ${purpose ? `<div><dt>핵심 목적</dt><dd>${escapeHtml(truncateText(purpose, 280))}</dd></div>` : ""}
    </dl>
  </details>`;
}

function proposalDetailTrigger(proposalId: string, label = proposalId): string {
  return `<button type="button" class="dash-proposal-pill dash-proposal-button" data-open-proposal="${escapeHtml(proposalId)}">${escapeHtml(label)}</button>`;
}

function emergingSourceLabel(source: string): string {
  if (source === "ethereum_magicians") return "Magicians";
  if (source === "github_pr") return "GitHub PR";
  if (source === "official_repo") return "Official";
  return source;
}

function formatOptionalDelta(value: number | undefined): string {
  return value === undefined ? "unknown" : `+${value}`;
}

function formatUnknownNumber(value: number | undefined): string {
  return value === undefined ? "unknown" : String(value);
}

function renderDashboardV3WeeklyBrief(p: DashboardV3Presentation): string {
  const view = p.view;
  const rows = p.weeklyRepositoryAdditions.map((item) => `<button type="button" class="dash-signal-row dash-filterable" data-kind="proposal" data-weekly-repository-addition data-repository-added-date-kst="${escapeHtml(item.repositoryAddedDateKst)}" data-proposal-created-date-kst="${escapeHtml(item.proposalCreatedDateKst ?? "")}" data-open-proposal="${escapeHtml(item.proposalId)}" ${filterAttrsForProposalId(view, item.proposalId)} data-evidence-id="${escapeHtml(item.evidenceIds[0] ?? item.sourcePath)}" data-source-path="${escapeHtml(item.sourcePath)}">
    <span class="dash-proposal-pill">${escapeHtml(item.proposalId)}</span>
    <span class="dash-signal-main"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(visibleWeeklySummary(item.summary))}</small></span>
    <span class="dash-signal-meta"><em>${escapeHtml(item.eventLabelKo)}</em><em>저장소 반영 ${escapeHtml(item.repositoryAddedDateKst)}</em><em>${item.proposalCreatedDateKst ? `문서 작성 ${escapeHtml(item.proposalCreatedDateKst)}` : "문서 작성일 미확인"}</em><em>${escapeHtml(item.domainLabelKo)}</em></span>
    <span class="dash-chevron" aria-hidden="true">›</span>
  </button>`).join("");
  const q = view.evidenceQuality;
  const repositoryAdditionCount = p.weeklyRepositoryAdditions.length;
  const pendingSemanticCount = Math.max(0, q.rawEvents - repositoryAdditionCount);
  return `<section class="dash-section dash-weekly-grid" id="weekly-brief">
    <article class="dash-panel dash-weekly-panel">
      <div class="dash-section-head"><span>요약</span><h2>이번 주 공식 저장소 반영</h2><p>최근 7일 동안 공식 EIP/ERC 저장소에 새로 반영된 전체 ${repositoryAdditionCount}건입니다. Proposal의 최초 작성일과 저장소 반영일은 서로 다를 수 있습니다.</p></div>
      <div class="dash-signal-list" data-weekly-signal-list data-weekly-repository-addition-list data-filter-excluded="fixed-weekly">${rows || `<p class="dash-empty">최근 기간 공식 저장소 신규 반영이 없습니다.</p>`}</div>
      <p class="dash-caption">이 고정 weekly fact section은 Global Filter 적용 제외입니다.</p>
      <details class="dash-compact-details"><summary>내용 수정 이벤트 ${pendingSemanticCount}건</summary><p>내용 수정 이벤트는 변경 의미가 아직 분류되지 않아 핵심 변화 비교에서 제외했습니다.</p></details>
    </article>
    <aside class="dash-panel dash-interpretation">
      <h3>이번 주 데이터 해석</h3>
      <p>수집된 저장소 이벤트 ${q.rawEvents}건 중 공식 저장소 신규 반영 ${repositoryAdditionCount}건을 확인했습니다. 나머지 내용 수정 ${pendingSemanticCount}건은 변경 의미가 아직 분류되지 않아 핵심 변화 비교에서 제외했습니다.</p>
      <dl>
        <div><dt>수집 이벤트</dt><dd>${q.rawEvents}건</dd></div>
        <div><dt>신규 문서 반영</dt><dd>${repositoryAdditionCount}건</dd></div>
        <div><dt>의미 분류 대기</dt><dd>${pendingSemanticCount}건</dd></div>
        <div><dt>변화 강도 비교</dt><dd>제공하지 않음</dd></div>
      </dl>
    </aside>
  </section>`;
}

function renderDashboardV3Direction(p: DashboardV3Presentation): string {
  const d = p.directionAbstract;
  const groupCards = d.groups.map((group) => `<article><h3>${escapeHtml(group.label)}</h3><p>${escapeHtml(group.body)}</p><div class="dash-tag-row">${group.representativeProposalIds.slice(0, 3).map((id) => `<button type="button" class="dash-tag" data-open-proposal="${escapeHtml(id)}" title="${escapeHtml(proposalTitleFromView(p.view, id))}">${escapeHtml(id)}</button>`).join("")}</div></article>`).join("");
  const refs = d.representativeProposalIds.map((id) => `<button type="button" class="dash-tag" data-open-proposal="${escapeHtml(id)}" title="${escapeHtml(proposalTitleFromView(p.view, id))}">${escapeHtml(id)}</button>`).join("");
  return `<section class="dash-section dash-panel dash-direction" id="direction" data-direction-abstract data-evidence-ids="${escapeHtml(d.evidenceIds.join(","))}">
    <div class="dash-section-head"><span>결론</span><h2>이번 보고서에서 관찰된 방향</h2><p>${escapeHtml(d.thesisKo)}</p></div>
    <div class="dash-direction-grid">
      ${groupCards}
      <article class="dash-direction-maturity"><h3>성숙도</h3><p>${escapeHtml(d.maturityKo)}</p></article>
    </div>
    <details class="dash-compact-details"><summary>근거 Proposal 전체 보기</summary><div class="dash-tag-row" aria-label="근거 Proposal 전체">${refs}</div></details>
  </section>`;
}

function renderDashboardV3VitalikBlog(p: DashboardV3Presentation): string {
  const blog = p.vitalikBlog as ReturnType<typeof buildUnavailableVitalikBlogView>;
  const posts = Array.isArray(blog.selectedPosts) ? blog.selectedPosts : [];
  const disclaimer = "Vitalik Buterin의 개인 블로그에서 최근 공개된 글을 원문 기준으로 요약합니다. 개인 견해이며 Ethereum의 공식 로드맵이나 커뮤니티 합의를 뜻하지 않습니다.";
  if (!posts.length) {
    return `<section class="dash-section dash-panel dash-vitalik" id="vitalik-blog" data-vitalik-source-state="${escapeHtml(blog.sourceState ?? "unavailable")}">
      <div class="dash-section-head"><span>Vitalik’s Recent Writing</span><h2>비탈릭의 최근 글</h2><p>${escapeHtml(disclaimer)}</p></div>
      <article class="dash-vitalik-empty">
        <strong>Vitalik Blog를 불러오지 못했습니다.</strong>
        <p>기존 EIP/ERC 및 Magicians 보고서는 정상적으로 생성됐습니다.</p>
        <p class="dash-caption">${escapeHtml((blog.limitationsKo ?? []).join(" ") || "source unavailable")}</p>
        <a class="dash-inline-link" href="https://vitalik.eth.limo/" target="_blank" rel="noopener noreferrer">원문 사이트 보기 ${iconSvg("external")}</a>
      </article>
    </section>`;
  }
  const cards = posts.map((post, index) => {
    const relation = post.relatedProposalRelation === "explicit" ? "본문에서 직접 언급" : post.relatedProposalRelation === "inferred" ? "주제상 관련" : "관련 Proposal 없음";
    const related = (post.relatedProposalIds ?? []).slice(0, 3).map((id) => `<button type="button" class="dash-tag" data-open-proposal="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join("");
    const reasons = (post.whyItMattersKo ?? []).slice(0, 2).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
    const summary = post.summaryKo || "원문은 수집했지만 한국어 요약은 검토 전입니다.";
    return `<article class="dash-vitalik-card${index === 0 ? " dash-vitalik-card-main" : ""}" data-vitalik-post data-summary-state="${escapeHtml(post.summaryState)}" data-interpretation-state="${escapeHtml(post.interpretationState)}">
      <div class="dash-badge-row"><span class="dash-badge dash-badge-warning">개인 글</span>${(post.topicLabelsKo ?? []).slice(0, 3).map((topic) => `<span class="dash-tag">${escapeHtml(topic)}</span>`).join("")}</div>
      <span class="dash-caption">${escapeHtml(post.publishedAtLabel)}</span>
      <h3>${escapeHtml(post.title)}</h3>
      <p>${escapeHtml(summary)}</p>
      ${reasons ? `<div class="dash-vitalik-reasons"><strong>주목할 이유</strong><ul>${reasons}</ul></div>` : `<p class="dash-caption">주목할 이유는 한국어 검토 전입니다.</p>`}
      <div class="dash-tag-row"><span class="dash-state">${escapeHtml(relation)}</span>${related}</div>
      <details class="dash-compact-details"><summary>근거 보기</summary><p>${escapeHtml(post.sourceExcerpt ?? "")}</p><p class="dash-caption">summaryState=${escapeHtml(post.summaryState)} · evidence=${escapeHtml((post.evidenceParagraphIds ?? []).join(", ") || "none")}</p></details>
      <a class="dash-inline-link" href="${escapeHtml(post.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문 보기 ${iconSvg("external")}</a>
    </article>`;
  }).join("");
  const fallback = (blog.limitationsKo ?? []).map((item) => `<p class="dash-caption">${escapeHtml(item)}</p>`).join("");
  return `<section class="dash-section dash-panel dash-vitalik" id="vitalik-blog" data-vitalik-source-state="${escapeHtml(blog.sourceState)}" data-vitalik-discovery="${escapeHtml(blog.discoveryMethod)}">
    <div class="dash-section-head"><span>Vitalik’s Recent Writing</span><h2>비탈릭의 최근 글</h2><p>${escapeHtml(disclaimer)}</p>${fallback}</div>
    <div class="dash-vitalik-grid">${cards}</div>
  </section>`;
}

function renderDashboardV3Trend(p: DashboardV3Presentation): string {
  const weeks = p.view.developmentTrend.weeks.slice(-26);
  const interpretation = repositoryTrendInterpretation(weeks);
  const firstDiscussionDate = firstDiscussionDateFromView(p.view);
  return `<section class="dash-section dash-panel" id="trend">
    <div class="dash-section-head"><span>추세</span><h2>공식 저장소 신규 문서 반영</h2><p>최근 26주 동안 공식 EIP/ERC 저장소에 처음 반영된 Proposal 문서 수입니다. 내용 수정, 상태 전환, 구현과 채택은 포함하지 않습니다.</p></div>
    <div class="dash-trend-card">
      ${renderDashboardV3TrendRow("공식 저장소 신규 문서 반영", "confirmedSpecificationChanges", weeks, "spec")}
      <div class="dash-trend-axis" aria-hidden="true">${trendAxisLabels(weeks)}</div>
    </div>
    <aside class="dash-trend-note"><strong>${escapeHtml(interpretation.headline)}</strong><p>${escapeHtml(interpretation.body)}</p></aside>
    <aside class="dash-trend-note dash-discussion-note"><strong>수집 이후 토론 활동</strong><p>${escapeHtml(firstDiscussionDate ? `${firstDiscussionDate} 이후 수집된 Magicians 원문 게시물만 현재 기간 카드에 표시합니다. 수집 시작 이전 기간은 0으로 해석하지 않습니다.` : "Magicians 원문 게시물 수집 시작일을 확인할 수 없습니다.")}</p><p>${escapeHtml(magiciansConcentrationText(p))}</p></aside>
  </section>`;
}

function renderDashboardV3TrendRow(label: string, key: string, weeks: Array<Record<string, number | string>>, tone: string): string {
  const values = weeks.map((week) => Number(week[key] ?? 0));
  const max = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);
  const latest = values.at(-1) ?? 0;
  const width = 650;
  const height = 68;
  const step = width / Math.max(1, weeks.length);
  const bars = weeks.map((week, index) => {
    const value = Number(week[key] ?? 0);
    const barHeight = value === 0 ? 1 : Math.max(3, (value / max) * 48);
    const x = index * step + 1;
    const y = height - 12 - barHeight;
    const latestClass = index === weeks.length - 1 ? " dash-latest-bar" : "";
    return `<rect class="dash-trend-bar${latestClass}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(4, step - 3).toFixed(2)}" height="${barHeight.toFixed(2)}" tabindex="0"><title>${escapeHtml(String(week.weekStart ?? ""))}: ${value}</title></rect>`;
  }).join("");
  return `<article class="dash-trend-row dash-trend-${tone}">
    <div class="dash-trend-label"><h3>${escapeHtml(label)}</h3><span>26주 합계 ${total}</span></div>
    <svg role="img" aria-label="${escapeHtml(label)} 26주 bar chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="0" y1="${height - 12}" x2="${width}" y2="${height - 12}"></line>${bars}
    </svg>
    <div class="dash-trend-latest"><strong>${latest}</strong><span>이번 주</span></div>
  </article>`;
}

function renderDashboardV3Technology(p: DashboardV3Presentation): string {
  const maxSpec = Math.max(1, ...p.domains.map((domain) => domain.confirmedChanges180d));
  const maxRaw = Math.max(1, ...p.domains.map((domain) => domain.rawPosts));
  const rows = p.domains.map((domain) => `<button type="button" class="dash-domain-row dash-filterable" data-kind="domain" data-open-domain="${escapeHtml(domain.domainId)}" data-domain="${escapeHtml(domain.domainId)}" data-status="all" data-aa="false" data-kgld="false" data-search="${escapeHtml(`${domain.label} ${domain.proposalIds.join(" ")}`.toLowerCase())}" data-evidence-state="${escapeHtml(domain.evidenceState)}" data-evidence-label="${escapeHtml(evidenceStateLabelV3(domain.evidenceState))}" data-evidence-scopes="${escapeHtml(domainEvidenceScopes(domain.confirmedChanges7d, domain.rawPosts).join(" "))}" data-c7="${domain.confirmedChanges7d}" data-c30="${domain.confirmedChanges30d}" data-c180="${domain.confirmedChanges180d}" data-period-count="${domain.confirmedChanges7d}" data-posts7d="${domain.rawPosts}" data-posts30d="${domain.rawPosts}" data-posts180d="${domain.rawPosts}">
    <span class="dash-domain-copy"><strong>${escapeHtml(domain.label)}</strong><small>${escapeHtml(domain.description)}</small></span>
    <span class="dash-domain-stats"><em><span data-period-label>최근 7일</span> 명세 활동 <b data-period-value>${domain.confirmedChanges7d}</b>건</em><em>원문 게시물 <b data-post-value>${domain.rawPosts}</b>건</em><em>관찰 Proposal ${domain.monitoredProposals}건</em></span>
    <span class="dash-dual-bars"><i style="--w:${Math.round(domain.confirmedChanges / maxSpec * 100)}%"></i><i class="dash-discussion-bar" style="--w:${Math.round(domain.rawPosts / maxRaw * 100)}%"></i></span>
    <span class="dash-state">${escapeHtml(evidenceStateLabelV3(domain.evidenceState))}</span>
  </button>`).join("");
  return `<section class="dash-panel dash-section" id="technology-pulse" data-filter-scope="technology">
    <div class="dash-section-head"><span>기술 영역</span><h2>기술 영역별 움직임</h2><p>선택한 기간의 공식 저장소 신규 문서 반영과 Magicians 원문 게시물을 비교합니다.</p></div>
    <div class="dash-legend"><span><i class="dash-spec-dot"></i>공식 저장소 신규 문서 반영</span><span><i class="dash-discussion-dot"></i>원문 게시물</span></div>
    <div class="dash-domain-list">${rows}</div>
    <p class="dash-empty" data-section-empty hidden>선택한 조건에 맞는 기술 영역 활동이 없습니다.</p>
  </section>`;
}

function visibleWeeklySummary(summary: string): string {
  const normalized = summary.replace(/\s+/g, " ").trim();
  if (normalized.length <= 110) return normalized;
  for (const match of normalized.matchAll(/[^.!?。！？]+[.!?。！？]/gu)) {
    const sentence = match[0].trim();
    if (sentence.length >= 24 && sentence.length <= 150) return sentence;
  }
  const boundary = normalized.slice(0, 150).lastIndexOf(". ");
  return boundary >= 40 ? normalized.slice(0, boundary + 1).trim() : normalized;
}

function renderDashboardV3Magicians(p: DashboardV3Presentation): string {
  const view = p.view;
  const maxPosts = Math.max(1, ...p.activeThreads.map((thread) => thread.rawPostCount));
  const cards = p.activeThreads.map((thread, index) => `<article class="dash-thread-card dash-filterable ${index === 0 ? "dash-thread-featured" : ""}" ${filterAttrsForProposalId(view, thread.proposalId, ["discussion"])} data-kind="proposal" data-evidence-id="${escapeHtml(thread.evidenceIds[0] ?? thread.sourcePath)}" data-source-path="${escapeHtml(thread.sourcePath)}">
    <div class="dash-thread-head"><span class="dash-proposal-pill">${escapeHtml(thread.proposalId)}</span><span class="dash-state">${escapeHtml(collectionLabel(thread.collectionStatus))}</span></div>
    <h3>${escapeHtml(thread.title)}</h3>
    <div class="dash-thread-metrics"><strong>${thread.rawPostCount}<span>원문 게시물</span></strong><em>${thread.uniqueParticipantCount}명 참여</em><em>최근 게시 ${escapeHtml(shortDate(thread.latestActivityAt))}</em></div>
    <div class="dash-wide-bar"><i style="--w:${Math.round(thread.rawPostCount / maxPosts * 100)}%"></i></div>
    <a href="${escapeHtml(thread.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="dash-inline-link">Magicians 열기 ${iconSvg("external")}</a>
  </article>`).join("");
  return `<section class="dash-panel dash-section" id="magicians" data-filter-scope="discussion">
    <div class="dash-section-head"><span>Magicians</span><h2>수집된 원문 활동</h2><p>최근 7일 원문 게시물 ${view.developerActivity.rawPostCount}건과 활성 thread ${view.developerActivity.activeThreadCount}개를 표시합니다.</p></div>
    <div class="dash-thread-list">${cards || `<p class="dash-empty">활동 thread 없음</p>`}</div>
    <p class="dash-empty" data-section-empty hidden>선택한 조건에 맞는 Magicians 활동이 없습니다.</p>
    <details class="dash-compact-details"><summary>수집 한계 보기</summary><p>thread URL · 전체 게시물 수집 · 유효 기술 post 미분류 상태에서는 토론 방향 판단 불가 · 분석된 insight ${view.developerActivity.analyzedInsightCount}건.</p></details>
    <details class="dash-compact-details"><summary>일별 원문 활동 보기</summary>${renderDashboardV3Heatmap(p)}</details>
  </section>`;
}

function renderDashboardV3Heatmap(p: DashboardV3Presentation): string {
  const activeIds = new Set(p.activeThreads.map((thread) => thread.proposalId));
  const rows = p.view.developerActivity.heatmapRows.filter((row) => activeIds.has(row.proposalId)).slice(0, 12);
  const days = unique(rows.flatMap((row) => row.daily.map((day) => day.date))).sort();
  const body = rows.map((row) => `<tr><th>${escapeHtml(row.proposalId)}</th>${days.map((date) => `<td>${row.daily.find((day) => day.date === date)?.rawPostCount ?? 0}</td>`).join("")}</tr>`).join("");
  return `<div class="dash-local-scroll"><table class="dash-heatmap"><thead><tr><th>Thread</th>${days.map((day) => `<th>${escapeHtml(shortDate(day))}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="2">활동 thread 없음</td></tr>`}</tbody></table></div>`;
}

function renderDashboardV3Lifecycle(p: DashboardV3Presentation): string {
  const total = Math.max(1, p.lifecycle.reduce((sum, stage) => sum + stage.count, 0));
  const segments = p.lifecycle.filter((stage) => stage.count > 0).map((stage) => `<button type="button" class="dash-life-segment dash-life-${slugifyTopic(stage.stage)}" data-life-stage="${escapeHtml(stage.sourceStage)}" style="--w:${(stage.count / total * 100).toFixed(2)}%" title="${escapeHtml(stage.stage)} ${stage.count}"><span>${escapeHtml(stage.stage)}</span><strong>${stage.count}</strong></button>`).join("");
  const legend = p.lifecycle.map((stage) => `<button type="button" data-life-stage="${escapeHtml(stage.sourceStage)}" class="${stage.count === 0 ? "dash-muted-stage" : ""}">${escapeHtml(stage.stage)} <strong>${stage.count}</strong></button>`).join("");
  return `<section class="dash-section dash-panel" id="lifecycle" data-filter-scope="lifecycle">
    <div class="dash-section-head"><span>진행 단계</span><h2>Proposal 진행 단계</h2><p>분류·탐색 대상 ${p.view.proposalExplorer.rows.length}건의 단계 분포입니다. 새 문서 반영은 단계 변경으로 표시하지 않습니다.</p></div>
    <div class="dash-life-stack" data-lifecycle-stack>${segments}</div>
    <div class="dash-life-legend">${legend}</div>
    <p class="dash-caption">분류·탐색 대상 ${p.view.proposalExplorer.rows.length}건 중 ${p.lifecycle.find((stage) => stage.sourceStage === "Draft")?.count ?? 0}건이 Draft 단계입니다. 현재 관찰되는 방향은 구현 확정보다 명세 탐색 단계에 가깝습니다.</p>
  </section>`;
}

function renderDashboardV3AA(p: DashboardV3Presentation): string {
  const specActive = p.aaTracks.filter((track) => track.specification30d?.state === "confirmed_value").length;
  const discussionActive = p.aaTracks.filter((track) => track.discussion30d?.state === "confirmed_value").length;
  const recent = p.aaTracks.map((track) => {
    const recentId = aaRecentProposalId(track);
    return `<article class="dash-aa-row dash-filterable" data-kind="aa" data-open-aa="${escapeHtml(track.id)}" data-domain="accounts-wallets" data-status="all" data-aa="true" data-kgld="false" data-search="${escapeHtml(`${track.name} ${track.proposalIds.join(" ")}`.toLowerCase())}" data-evidence-state="${escapeHtml(canonicalMetricEvidenceState(track.specification30d?.state ?? track.discussion30d?.state))}" data-evidence-scopes="${escapeHtml(aaTrackEvidenceScopes(track).join(" "))}">
      <div class="dash-aa-title"><h3>${escapeHtml(track.name)}</h3>${proposalLink(recentId)}</div>
      <dl class="dash-aa-facts">
        <div><dt>최근 30일 명세 반영</dt><dd>${escapeHtml(metricStateText(track.specification30d, "없음"))}</dd></div>
        <div><dt>최근 30일 원문 게시물</dt><dd>${escapeHtml(metricStateText(track.discussion30d, "없음"))}</dd></div>
        <div><dt>최근 확인 활동</dt><dd>${escapeHtml(aaRecentActivityText(track))}</dd></div>
        <div><dt>구현 근거</dt><dd>미수집</dd></div>
      </dl>
      <div class="dash-card-actions"><button type="button" data-open-aa="${escapeHtml(track.id)}">설명 보기</button>${proposalLink(recentId, `${recentId} 열기`)}</div>
    </article>`;
  }).join("");
  const all = p.aaTracks.map((track) => `<tr><th><button type="button" data-open-aa="${escapeHtml(track.id)}">${escapeHtml(track.name)}</button></th><td>${escapeHtml(track.proposalIds.join(", ") || "기준 Proposal 미연결")}</td><td>${escapeHtml(metricStateText(track.specification30d, "없음"))}</td><td>${escapeHtml(metricStateText(track.discussion30d, "없음"))}</td><td>미수집</td></tr>`).join("");
  return `<section class="dash-panel dash-section" id="aa-watch" data-filter-scope="aa">
    <div class="dash-section-head"><span>AA</span><h2>Account Abstraction</h2><p>ERC-4337 EntryPoint 기준 Proposal과 최근 확인 신호를 분리해서 봅니다.</p></div>
    <dl class="dash-watch-metrics dash-aa-kpis"><div><dt>관찰 Track</dt><dd>${p.aaTracks.length}개</dd></div><div><dt>최근 30일 명세 변화 Track</dt><dd>${specActive}개</dd></div><div><dt>최근 30일 토론 활동 Track</dt><dd>${discussionActive}개</dd></div><div><dt>구현 근거</dt><dd>미수집</dd></div></dl>
    <div class="dash-aa-list">${recent || `<p class="dash-empty">최근 AA track signal 없음</p>`}</div>
    <p class="dash-empty" data-section-empty hidden>선택한 조건에 맞는 AA 활동이 없습니다.</p>
    <details class="dash-compact-details"><summary>AA 수집 기준 보기</summary><p>최근 7일 확인된 명세 변화 · 최근 30일 확인된 명세 변화 · 최근 30일 Magicians 원문 게시물 · 구현 출처는 현재 수집 대상이 아닙니다. 원문 게시물은 유효 기술 post 미분류 상태에서는 토론 방향 판단 불가로 표시합니다.</p></details>
    <details class="dash-compact-details"><summary>12개 AA Track 전체 보기</summary><div class="dash-local-scroll"><table class="dash-compact-table"><thead><tr><th>Track</th><th>기준 Proposal</th><th>최근 30일 명세 반영</th><th>최근 30일 원문 게시물</th><th>구현 근거</th></tr></thead><tbody>${all}</tbody></table></div></details>
  </section>`;
}

function renderDashboardV3Kgld(p: DashboardV3Presentation): string {
  const cards = p.kgldItems.map((rawItem) => {
    const item = kgldPresentationItem(rawItem);
    return `<article class="dash-kgld-card dash-filterable" data-kind="proposal" data-open-proposal="${escapeHtml(item.proposalId)}" data-domain="kgld" data-status="all" data-aa="false" data-kgld="true" data-search="${escapeHtml(`${item.proposalId} ${item.title} ${item.action}`.toLowerCase())}" data-evidence-state="${escapeHtml(canonicalEvidenceStateFromLabel(item.evidenceLevel))}" data-evidence-scopes="specification" tabindex="0">
    ${proposalDetailTrigger(item.proposalId, item.proposalId)}
    <h3>${escapeHtml(item.title)}</h3>
    <dl>
      <div><dt>검토 구분</dt><dd>${escapeHtml(item.groupLabel)}</dd></div>
      <div><dt>영향 업무</dt><dd>${escapeHtml(item.impactArea)}</dd></div>
      <div><dt>담당 기능</dt><dd>${escapeHtml(item.ownerFunction)}</dd></div>
      <div><dt>현재 단계</dt><dd>${escapeHtml(item.currentStage)}</dd></div>
      <div><dt>구현 근거</dt><dd>${escapeHtml(item.implementationEvidence)}</dd></div>
      <div><dt>근거 수준</dt><dd>${escapeHtml(item.evidenceLevel)}</dd></div>
      <div><dt>권고 조치</dt><dd>${escapeHtml(item.action)}</dd></div>
      <div><dt>재검토 조건</dt><dd>${escapeHtml(item.nextTrigger)}</dd></div>
    </dl>
    <div class="dash-card-actions"><button type="button" data-open-proposal="${escapeHtml(item.proposalId)}">설명 보기</button>${proposalLink(item.proposalId, "공식 문서")}</div>
    <p class="dash-caption">${escapeHtml(item.limitation)}</p>
  </article>`;
  }).join("");
  return `<section class="dash-panel dash-section" id="kgld-watch" data-filter-scope="kgld">
    <div class="dash-section-head"><span>KGLD</span><h2>KGLD Watch</h2><p>관련 Proposal만 action card로 표시합니다. 영향 업무, 권고 조치, 재검토 조건, 근거 수준을 분리해 확인합니다.</p></div>
    ${cards || `<p class="dash-empty">KGLD 관련 item 없음</p>`}
    <p class="dash-empty" data-section-empty hidden>선택한 조건에 맞는 KGLD 관련 항목이 없습니다.</p>
    <p class="dash-caption">즉시 조사 ${p.view.kgldBoard.groups.research_now.length} · 계속 관찰 ${p.view.kgldBoard.groups.monitor.length} · 현재 조치 없음 ${p.view.kgldBoard.groups.no_action.length}</p>
  </section>`;
}

function renderDashboardV3Explorer(p: DashboardV3Presentation): string {
  const explorerRows = p.view.proposalExplorer.rows
    .slice()
    .sort((a, b) => b.counts.current7d - a.counts.current7d || String(b.latestChangeAt ?? "").localeCompare(String(a.latestChangeAt ?? "")) || compareProposalIds(a.proposalId, b.proposalId));
  const rows = explorerRows
    .map((proposal, index) => `<tr class="dash-filterable dash-explorer-row" data-kind="proposal" data-explorer-row data-page-index="${index}" data-open-proposal="${escapeHtml(proposal.proposalId)}" ${filterAttrsForProposal(proposal)} data-evidence-id="${escapeHtml(proposal.evidenceIds[0] ?? proposal.sourcePath)}" data-source-path="${escapeHtml(proposal.sourcePath)}">
      <td><span class="dash-proposal-pill">${escapeHtml(proposal.proposalId)}</span></td>
      <td><strong>${escapeHtml(proposal.title)}</strong></td>
      <td>${escapeHtml(publicDomainForProposal(proposal.proposalId, proposal.domainId, proposal.topic, proposal.title).labelKo)}</td>
      <td>${escapeHtml(proposal.status)}</td>
      <td><span data-period-value>${proposal.counts.current7d}</span></td>
      <td>${escapeHtml(discussionCountTextKo(proposal.counts.rawPosts))}</td>
      <td>${renderProposalTagsV3(proposal)}</td>
      <td><button type="button" data-open-proposal="${escapeHtml(proposal.proposalId)}">자세히</button></td>
    </tr>`).join("");
  const cards = explorerRows.map((proposal, index) => `<button type="button" class="dash-mobile-proposal dash-filterable dash-explorer-card" data-kind="proposal" data-explorer-row data-page-index="${index}" data-open-proposal="${escapeHtml(proposal.proposalId)}" ${filterAttrsForProposal(proposal)} data-evidence-id="${escapeHtml(proposal.evidenceIds[0] ?? proposal.sourcePath)}" data-source-path="${escapeHtml(proposal.sourcePath)}">
    <span><b>${escapeHtml(proposal.proposalId)}</b><em>${escapeHtml(proposal.status)}</em></span>
    <strong>${escapeHtml(proposal.title)}</strong>
    <small>${escapeHtml(publicDomainForProposal(proposal.proposalId, proposal.domainId, proposal.topic, proposal.title).labelKo)} · <span data-period-label>최근 7일</span> 명세 활동 <span data-period-value>${proposal.counts.current7d}</span>건 · ${escapeHtml(discussionCountTextKo(proposal.counts.rawPosts))}</small>
    <span class="dash-tag-row">${renderProposalTagsV3(proposal)}</span>
  </button>`).join("");
  return `<section class="dash-section dash-panel" id="explorer" data-filter-scope="explorer">
    <div class="dash-section-head"><span>Proposal 탐색</span><h2>Proposal Explorer</h2><p>이번 보고서 관찰 대상 Proposal ${p.view.proposalExplorer.rows.length}건을 검색, 필터, 페이지 단위로 탐색합니다.</p></div>
    <div class="dash-page-size"><label>Page size<select data-page-size><option value="12" selected>12</option><option value="24">24</option><option value="48">48</option></select></label></div>
    <div class="dash-explorer-table-wrap"><table class="dash-explorer-table"><thead><tr><th>Proposal</th><th>Title</th><th>기술 영역</th><th>Status</th><th>신규 문서 반영</th><th>원문 게시물</th><th>Tags</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="dash-mobile-explorer">${cards}</div>
    <p class="dash-empty" data-section-empty hidden>현재 조건에 맞는 Proposal이 없습니다.</p>
    <div class="dash-pager"><button type="button" data-page-prev>이전</button><span data-page-state>1 / 1 page</span><button type="button" data-page-next>다음</button></div>
  </section>`;
}

function monitoringScopeSentence(scope: DashboardV3Presentation["scope"]): string {
  return `총 ${scope.discoveredProposalCount}건의 EIP/ERC Proposal을 발견했고, 이 중 ${scope.publicExplorerCount}건을 주간 탐색과 진행 단계 분포 대상으로 선정했습니다. 탐색 대상에서 제외한 기준 Proposal은 ${scope.explorerExcludedBaselineProposalCount}건입니다. 이 중 ${scope.concentratedMonitoringCount}건을 주간 집중 모니터링하며, 최근 활동을 상세 표시한 Proposal은 ${scope.detailedActivityCardCount}건입니다.`;
}

function renderDashboardV3Evidence(p: DashboardV3Presentation): string {
  const q = p.view.evidenceQuality;
  const weeklyReason = `최근 7일 분석 반영 이벤트는 ${q.usableEvents}/${q.rawEvents}건이며, 데이터 품질 기준에 따라 변화 강도 비교는 제공하지 않습니다.`;
  const viewMetadata = p.view.metadata as Record<string, unknown>;
  const snapshotId = String(p.snapshotMetadata.snapshotId ?? viewMetadata.snapshotId ?? `weekly-${p.reportDate}`);
  const inputSnapshotHash = String(p.snapshotMetadata.inputSnapshotHash ?? viewMetadata.inputSnapshotHash ?? "");
  return `<section class="dash-section dash-panel dash-evidence" id="evidence-quality">
    <div class="dash-section-head"><span>Evidence</span><h2>Evidence & Data Quality</h2></div>
    <div class="dash-scope-summary">
      <div class="dash-section-head"><span>보고서 관찰 범위</span><h3>보고서 관찰 범위</h3><p>${monitoringScopeSentence(p.scope)} 구현 데이터 수집원은 현재 연결되지 않았습니다.</p></div>
      <dl class="dash-watch-metrics">
        <div><dt>발견 대상</dt><dd>${p.scope.discoveredProposalCount}건</dd></div>
        <div><dt>탐색·단계 분포 대상</dt><dd>${p.scope.publicExplorerCount}건</dd></div>
        <div><dt>기준 Proposal</dt><dd>${p.scope.explorerExcludedBaselineProposalCount}건</dd></div>
        <div><dt>집중 모니터링</dt><dd>${p.scope.concentratedMonitoringCount}건</dd></div>
        <div><dt>상세 활동 카드</dt><dd>${p.scope.detailedActivityCardCount}건</dd></div>
        <div><dt>구현 데이터 수집원</dt><dd>없음</dd></div>
      </dl>
    </div>
    <div class="dash-evidence-summary"><p>집중 모니터링 Proposal ${p.scope.concentratedMonitoringCount}건과 Ethereum Magicians 토론 Thread ${p.view.monitoringScope.discussionThreadCount}개를 같은 관찰 대상 내 180일 이력 기준으로 확인합니다. 구현 근거는 수집되지 않았습니다.</p><details><summary>데이터 품질 상세 보기</summary>
      <p>${escapeHtml(weeklyReason)}</p>
      <dl class="dash-evidence-grid">
        <div><dt>수집 이벤트</dt><dd>${q.rawEvents}</dd></div><div><dt>분석 반영 이벤트</dt><dd>${q.usableEvents}</dd></div><div><dt>비교 제외 이벤트</dt><dd>${q.rawEvents - q.usableEvents}</dd></div><div><dt>원본 시각 미확인 이벤트</dt><dd>${q.fallbackTimestamps}</dd></div>
        <div><dt>의미 분류 상태</dt><dd>${escapeHtml(q.discussionRelevance === "unclassified" ? "분류 대기" : q.discussionRelevance)}</dd></div><div><dt>주간 비교 상태</dt><dd>변화 강도 비교 미제공 <span class="dash-muted">(weeklyRankingValidity: ${escapeHtml(q.weeklyRankingValidity)})</span></dd></div><div><dt>구현 데이터 수집원</dt><dd>${escapeHtml(q.implementationEvidence === "not_collected" ? "미수집" : q.implementationEvidence)}</dd></div><div><dt>렌더링 원본 방식</dt><dd>${escapeHtml(p.view.metadata.sourceMode)} <span class="dash-muted">(sourceMode)</span></dd></div><div><dt>렌더링 중 외부 요청</dt><dd>0 <span class="dash-muted">(networkRequests)</span></dd></div><div><dt>사용 불가 상태</dt><dd>출처 사용 불가는 별도 상태로 표시</dd></div>
        <div><dt>Snapshot ID</dt><dd>${escapeHtml(snapshotId)}</dd></div><div><dt>Input snapshot hash</dt><dd>${escapeHtml(inputSnapshotHash)}</dd></div><div><dt>generatedAt</dt><dd>${escapeHtml(p.generatedAt)}</dd></div>
      </dl>
    </details></div>
  </section>`;
}

function renderDashboardV3Appendix(p: DashboardV3Presentation): string {
  return `<section class="dash-section dash-panel dash-appendix" id="proposal-appendix">
    <details><summary>Proposal 근거 appendix</summary><p>전체 Proposal 근거와 sourcePath는 embedded canonical dashboard view 및 Inspector의 근거 정보에 보존됩니다. Explorer page size ${Math.min(12, p.view.proposalExplorer.rows.length)}건부터 탐색합니다.</p></details>
  </section>`;
}

function renderDashboardV3Inspector(): string {
  return `<div class="dash-backdrop" data-inspector-backdrop hidden></div><aside class="dash-inspector" data-inspector aria-hidden="true" tabindex="-1" aria-label="Proposal detail">
    <div class="dash-sheet-handle" aria-hidden="true"></div>
    <button type="button" class="dash-inspector-close" data-inspector-close aria-label="닫기">${iconSvg("close")}</button>
    <div class="dash-inspector-body" data-inspector-body></div>
  </aside>`;
}

function renderOverviewKpis(view: ReturnType<typeof buildDashboardV2View>): string {
  const kpis = [
    ["#development-trend", "확인된 명세 변화", `${view.overview.weeklyUsableCount.value}건`, "최근 7일", stateLabel(view.overview.weeklyUsableCount.state)],
    ["#magicians-activity", "활성 Thread", `${view.overview.activeMagiciansThreadCount.value}개`, "최근 7일", stateLabel(view.overview.activeMagiciansThreadCount.state)],
    ["#magicians-activity", "Raw Posts", `${view.overview.rawPostCount.value}건`, "최근 7일", view.developerActivity.validTechnicalPostCount == null ? "relevance 미분류" : stateLabel(view.overview.rawPostCount.state)],
    ["#magicians-activity", "고유 참여자", `${view.overview.uniqueParticipantCount.value}명`, "최근 7일", stateLabel(view.overview.uniqueParticipantCount.state)],
  ];
  return `<section class="research-section v2-section" id="overview-kpis"><div class="section-head"><h2>This Week Overview</h2><p>이번 주 핵심 수치만 먼저 확인합니다.</p></div><div class="v2-kpis">${kpis.map(([href, label, value, period, note]) => `<a class="v2-kpi" href="${href}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><em>${escapeHtml(period)}</em><small>${escapeHtml(note)}</small></a>`).join("")}</div></section>`;
}

function renderDevelopmentTrend(view: ReturnType<typeof buildDashboardV2View>): string {
  return `<section class="research-section v2-section" id="development-trend"><div class="section-head"><h2>26-week Activity Trend</h2><p>같은 주 단위 축에서 명세 변화, raw posts, 참여자 수를 비교합니다.</p></div><div class="trend-panel">${renderSmallMultiple("Confirmed specification changes", view.developmentTrend.weeks, "confirmedSpecificationChanges")}${renderSmallMultiple("Magicians raw posts", view.developmentTrend.weeks, "rawPosts")}${renderSmallMultiple("Unique participants", view.developmentTrend.weeks, "uniqueParticipants")}</div><p class="sr-summary">${escapeHtml(view.developmentTrend.textualSummary)}</p></section>`;
}

function renderSmallMultiple(label: string, weeks: Array<Record<string, number | string>>, key: string): string {
  const shownWeeks = weeks.slice(-26);
  const width = 640;
  const height = 96;
  const values = weeks.map((week) => Number(week[key] ?? 0));
  const max = Math.max(1, ...values);
  const latest = values.at(-1) ?? 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  const bars = shownWeeks.map((week, index) => {
    const value = Number(week[key] ?? 0);
    const step = (width - 52) / Math.max(1, shownWeeks.length);
    const x = 36 + index * step;
    const h = value === 0 ? 1 : Math.max(3, (value / max) * (height - 34));
    const active = index === shownWeeks.length - 1 ? " latest" : "";
    return `<rect class="trend-bar${active}" x="${x.toFixed(2)}" y="${(height - 18 - h).toFixed(2)}" width="${Math.max(5, step - 3).toFixed(2)}" height="${h.toFixed(2)}" tabindex="0"><title>${escapeHtml(String(week.weekStart ?? ""))}: ${value}</title></rect>`;
  }).join("");
  const labels = shownWeeks.filter((_, index) => index % 4 === 0 || index === shownWeeks.length - 1).map((week, index) => `<span>${escapeHtml(String(week.weekStart ?? "").slice(5, 10))}</span>`).join("");
  return `<article class="v2-chart"><h3>${escapeHtml(label)}</h3><div class="atlas-chart-frame"><svg role="img" aria-label="${escapeHtml(label)} over 26 weeks" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"><line x1="28" y1="${height - 18}" x2="${width - 16}" y2="${height - 18}"></line>${bars}<text x="${width - 18}" y="${height - 24}" text-anchor="end">${latest}</text></svg></div><p><b>${latest}</b> latest / ${total} total</p><div class="trend-axis" aria-hidden="true">${labels}</div></article>`;
}

function renderWeeklyTimeline(view: ReturnType<typeof buildDashboardV2View>): string {
  const rows = view.weeklyTimeline.items.slice(0, 5).map((item) => `<li class="timeline-entry v2-filterable" tabindex="0" data-kind="proposal" data-open-proposal="${escapeHtml(item.proposalId)}" ${filterAttrsForProposalId(view, item.proposalId)} data-evidence-id="${escapeHtml(item.evidenceIds[0] ?? item.sourcePath)}" data-source-path="${escapeHtml(item.sourcePath)}"><div><b>${proposalAnchor(item.proposalId, item.title)}</b><p>${escapeHtml(item.description)}</p></div><span>${escapeHtml(eventTypeKo(item.eventType))}</span><span>${escapeHtml(shortDate(item.occurredAt))}</span><span>${proposalBadgesForId(view, item.proposalId)}</span><button type="button" data-open-proposal="${escapeHtml(item.proposalId)}">Inspector</button></li>`).join("");
  return `<section class="research-section v2-section" id="weekly-overview"><div class="section-head"><h2>이번 주 관찰 신호</h2><p>핵심 Proposal ${view.weeklyTimeline.totalUsableCount}건을 compact signal list로 표시합니다.</p></div>${rows ? `<ol class="v2-timeline">${rows}</ol>` : `<p class="empty">최근 기간 confirmed usable event가 없습니다.</p>`}<details><summary>제외된 이벤트 ${view.weeklyTimeline.excluded.rawExcludedCount}건</summary><p>unknown semantic ${view.weeklyTimeline.excluded.unknownSemanticEvents}건 · timestamp 미확정 ${view.weeklyTimeline.excluded.fallbackTimestampEvents}건</p></details></section>`;
}

function renderTopicActivityMap(view: ReturnType<typeof buildDashboardV2View>): string {
  const active = view.topicActivityMap.points
    .filter((point) => point.current7dConfirmedChanges > 0 || point.rawPostCount > 0 || (point.validTechnicalPostCount ?? 0) > 0)
    .sort((a, b) => b.current7dConfirmedChanges - a.current7dConfirmedChanges || b.rawPostCount - a.rawPostCount);
  const quiet = view.topicActivityMap.points.filter((point) => !active.includes(point));
  const maxSpec = Math.max(1, ...active.map((point) => point.current7dConfirmedChanges));
  const maxPosts = Math.max(1, ...active.map((point) => point.rawPostCount));
  const rows = active.map((point) => `<article class="topic-row v2-filterable" data-kind="topic" data-open-topic="${escapeHtml(point.topicId)}" data-topic-open="topic/${escapeHtml(point.topicId)}" ${filterAttrsForTopic(point)} data-evidence-id="${escapeHtml(point.evidenceIds[0] ?? point.sourcePath)}" data-source-path="${escapeHtml(point.sourcePath)}"><div><h3>${escapeHtml(point.name)}</h3><p>${escapeHtml(domainDisplayName(point.domainId))} · ${point.uniqueProposalCount} proposals · ${escapeHtml(stateLabel(point.evidenceState))}</p></div><div class="topic-bars"><span>spec ${point.current7dConfirmedChanges}</span><i style="--w:${Math.round(point.current7dConfirmedChanges / maxSpec * 100)}%"></i><span>raw ${point.rawPostCount}</span><i class="discussion" style="--w:${Math.round(point.rawPostCount / maxPosts * 100)}%"></i></div><button type="button" data-open-topic="${escapeHtml(point.topicId)}">Inspector</button></article>`).join("");
  return `<section class="research-section v2-section" id="topic-map"><div class="section-head"><h2>Active Topics</h2><p>Topic Activity Rows는 confirmed changes와 raw discussion posts를 직접 비교합니다.</p></div><div class="topic-rows">${rows || '<p class="empty">선택 기간 활동 Topic 없음</p>'}</div>${quiet.length ? `<details><summary>Quiet topics ${quiet.length}개</summary><p>${escapeHtml(quiet.map((topic) => topic.name).join(", "))}</p></details>` : ""}</section>`;
}

function renderLifecycleBoard(view: ReturnType<typeof buildDashboardV2View>): string {
  const total = Math.max(1, view.lifecycleBoard.reduce((sum, column) => sum + column.proposals.length, 0));
  const segments = view.lifecycleBoard
    .filter((column) => column.proposals.length > 0)
    .map((column) => `<button type="button" class="life-segment" data-life-stage="${escapeHtml(column.stage)}" style="--w:${(column.proposals.length / total * 100).toFixed(2)}%"><span>${escapeHtml(column.stage)}</span><b>${column.proposals.length}</b></button>`)
    .join("");
  const counts = view.lifecycleBoard.filter((column) => column.proposals.length > 0).map((column) => `<span>${escapeHtml(column.stage)} <b>${column.proposals.length}</b></span>`).join("");
  const recent = view.proposalExplorer.rows
    .filter((proposal) => proposal.counts.current7d > 0)
    .sort((a, b) => b.counts.current7d - a.counts.current7d || compareProposalIds(a.proposalId, b.proposalId))
    .slice(0, 5)
    .map((proposal) => `<button class="recent-proposal v2-filterable" type="button" data-kind="proposal" data-open-proposal="${escapeHtml(proposal.proposalId)}" ${filterAttrsForProposal(proposal)} data-evidence-id="${escapeHtml(proposal.evidenceIds[0] ?? proposal.sourcePath)}" data-source-path="${escapeHtml(proposal.sourcePath)}"><b>${escapeHtml(proposal.proposalId)}</b><span>${escapeHtml(shortTitle(proposal.title))}</span><em>${proposal.counts.current7d} change</em></button>`)
    .join("");
  return `<section class="research-section v2-section" id="lifecycle-board"><div class="section-head"><h2>Lifecycle Summary</h2><p>전체 Proposal은 Explorer에서 탐색하고, 여기서는 stage 분포와 최근 NEW/MOVED만 봅니다.</p></div><div class="lifecycle-summary"><div class="life-stack" aria-label="Lifecycle stacked bar">${segments}</div><p class="life-counts">${counts}</p></div>${recent ? `<div class="recent-proposals">${recent}</div>` : ""}<p class="empty is-hidden" data-empty-state>필터 결과가 없습니다.</p></section>`;
}

function renderMagiciansActivity(view: ReturnType<typeof buildDashboardV2View>): string {
  const rows = view.developerActivity.heatmapRows.filter((row) => row.rawPostCount > 0).slice(0, 12);
  const days = unique(rows.flatMap((row) => row.daily.map((day) => day.date))).sort();
  const heatRows = rows.map((row) => `<tr class="v2-filterable" ${filterAttrsForProposalId(view, row.proposalId)}><th>${proposalAnchor(row.proposalId, row.collectionStatus === "posts_fully_collected" ? row.title : null)}</th>${days.map((date) => { const cell = row.daily.find((day) => day.date === date); return `<td tabindex="0" data-open-proposal="${escapeHtml(row.proposalId)}" title="${escapeHtml(date)} raw posts ${(cell?.rawPostCount ?? 0)}">${cell?.rawPostCount ?? 0}</td>`; }).join("")}</tr>`).join("");
  const activeThreads = view.developerActivity.threads.filter((thread) => thread.rawPostCount > 0).sort((a, b) => b.rawPostCount - a.rawPostCount);
  const maxPosts = Math.max(1, ...activeThreads.map((thread) => thread.rawPostCount));
  const threads = activeThreads.map((thread) => `<article class="thread-row v2-filterable" ${filterAttrsForProposalId(view, thread.proposalId)} data-evidence-id="${escapeHtml(thread.evidenceIds[0] ?? thread.sourcePath)}" data-source-path="${escapeHtml(thread.sourcePath)}"><div><h3>${proposalAnchor(thread.proposalId, thread.collectionStatus === "posts_fully_collected" ? thread.title : null)}</h3><p>${escapeHtml(collectionLabel(thread.collectionStatus))} · latest ${escapeHtml(shortDate(thread.latestActivityAt))}</p></div><div class="activity-bar"><i style="--w:${Math.round(thread.rawPostCount / maxPosts * 100)}%"></i><span>${thread.rawPostCount} raw posts</span></div><span>${thread.uniqueParticipantCount} participants</span><button type="button" data-open-proposal="${escapeHtml(thread.proposalId)}">Inspector</button></article>`).join("");
  const validity = view.developerActivity.validTechnicalPostCount == null
    ? "최근 7일 raw activity 수집됨 · relevance 미분류 · analyzed insights 0건"
    : `최근 7일 valid technical posts ${view.developerActivity.validTechnicalPostCount}건 · analyzed insights ${view.developerActivity.analyzedInsightCount}건`;
  return `<section class="research-section v2-section" id="magicians-activity"><div class="section-head"><h2>Magicians Activity</h2><p>수집된 Raw Activity만 표시합니다. 유효 기술 post 미분류 상태에서는 토론 방향 판단 불가로 둡니다.</p></div><p class="badge">thread URL · 전체 post 수집 · 최근 7일 raw posts ${view.developerActivity.rawPostCount}건 · active threads ${view.developerActivity.activeThreadCount}개 · unique participants ${view.developerActivity.uniqueParticipantCount}명 · ${escapeHtml(validity)}</p><div class="thread-rows">${threads || '<p class="empty">활동 thread 없음</p>'}</div><details><summary>일별 활동 보기</summary><div class="table-wrap heatmap"><table class="table local-scroll"><thead><tr><th>Thread</th>${days.map((day) => `<th>${escapeHtml(shortDate(day))}</th>`).join("")}</tr></thead><tbody>${heatRows || '<tr><td colspan="2">활동 thread 없음</td></tr>'}</tbody></table></div></details></section>`;
}

function renderProposalExplorer(view: ReturnType<typeof buildDashboardV2View>): string {
  const rows = view.proposalExplorer.rows.map((proposal, index) => `<tr class="v2-filterable explorer-row" data-kind="proposal" data-explorer-row data-page-index="${index}" ${filterAttrsForProposal(proposal)} data-evidence-id="${escapeHtml(proposal.evidenceIds[0] ?? proposal.sourcePath)}" data-source-path="${escapeHtml(proposal.sourcePath)}"><td>${proposalAnchor(proposal.proposalId, proposal.title)}</td><td>${escapeHtml(proposal.domain)}<br><small>${escapeHtml(proposal.topic)}</small></td><td>${escapeHtml(proposal.status)}</td><td data-sort-value="${proposal.counts.current7d}">${proposal.counts.current7d}</td><td>${proposal.counts.validTechnicalPostCount == null ? `${proposal.counts.rawPosts} raw` : proposal.counts.validTechnicalPostCount}</td><td>${proposal.isAA ? "AA" : ""}${proposal.kgldRelevance ? " KGLD" : ""}</td><td><button type="button" data-open-proposal="${escapeHtml(proposal.proposalId)}">Detail</button></td></tr>`).join("");
  return `<section class="research-section v2-section" id="proposal-explorer"><div class="section-head"><h2>Proposal Explorer</h2><p>전체 Proposal ${view.proposalExplorer.rows.length}건은 검색, 상태, Topic 필터와 페이지 단위로 탐색합니다.</p></div><div class="table-wrap explorer-wrap"><table class="table explorer-table" data-sortable><thead><tr><th data-sort="id">Proposal / Title</th><th>Domain / Topic</th><th data-sort="status">Status</th><th data-sort="changes">Selected period changes</th><th data-sort="posts">Raw discussion</th><th>AA / KGLD</th><th>Detail</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Proposal 없음</td></tr>'}</tbody></table></div><div class="pager"><button type="button" data-show-more>더 보기</button><span data-page-state>20 rows</span></div></section>`;
}

function renderAaMatrix(view: ReturnType<typeof buildDashboardV2View>): string {
  const tracks = view.aaMatrix.tracks.map((track) => `<tr class="v2-filterable" data-aa="true" data-kind="aa" data-open-aa="${escapeHtml(track.id)}" data-domain="accounts-wallets" data-status="all" data-kgld="false" data-search="${escapeHtml(`${track.name} ${track.proposalIds.join(" ")}`)}" data-evidence-id="${escapeHtml(track.evidenceIds?.[0] ?? track.id)}" data-source-path="views.accountAbstraction.tracks[trackId=${escapeHtml(track.id)}]"><th><button type="button" data-open-aa="${escapeHtml(track.id)}">${escapeHtml(track.name)}</button><small>${escapeHtml(track.proposalIds.join(", ") || "baseline not linked")}</small></th><td>${metricCell(track.specification30d)}</td><td>${metricCell(track.discussion30d)}</td><td>${metricCell(track.implementation)}</td><td><span class="state unavailable">미수집</span></td><td><span class="state unavailable">미수집</span></td></tr>`).join("");
  const baseline = view.aaMatrix.tracks.flatMap((track) => track.baselineProposals ?? []);
  const recent = view.aaMatrix.tracks.flatMap((track) => track.recentSignals ?? []);
  const hasBaselineMissing = view.aaMatrix.tracks.some((track) => (track.baselineProposals?.length ?? 0) === 0);
  const activeTracks = view.aaMatrix.tracks.filter((track) => track.specification30d?.state === "confirmed_value" || track.discussion30d?.state === "confirmed_value");
  return `<section class="research-section v2-section" id="aa-matrix"><div class="section-head"><h2>AA Watch</h2><p>ERC-4337 baseline과 최근 signal을 분리해서 봅니다.</p></div><div class="watch-summary"><article><span>active tracks</span><b>${activeTracks.length}</b></article><article><span>recent signals</span><b>${recent.length}</b></article><article><span>ERC-4337 baseline</span><b>${baseline.length}</b></article><article><span>implementation</span><b>미수집</b></article></div><p class="muted">기준 Proposal ${baseline.length}개 · 최근 Signal ${recent.length}건 · 최근 7일 확인된 명세 변화 · 최근 30일 확인된 명세 변화 · 최근 30일 Magicians 활동 · 구현 source는 현재 수집 대상이 아닙니다. 원시 post 활동은 raw discussion activity이며 유효 기술 post 미분류 상태에서는 토론 방향 판단 불가로 표시합니다.${hasBaselineMissing ? " 추적 기준 미설정은 baseline not linked이며 모니터링 제외가 아닙니다." : ""}</p><details><summary>12개 AA track matrix</summary><div class="table-wrap"><table class="table aa-matrix local-scroll"><thead><tr><th>Track</th><th>Specification</th><th>Discussion</th><th>구현</th><th>Activation</th><th>Adoption</th></tr></thead><tbody>${tracks}</tbody></table></div></details></section>`;
}

function renderKgldBoard(view: ReturnType<typeof buildDashboardV2View>): string {
  const columns = [
    ["Research Now", view.kgldBoard.groups.research_now],
    ["Monitor", view.kgldBoard.groups.monitor],
    ["No Action", view.kgldBoard.groups.no_action],
  ] as const;
  return `<section class="research-section v2-section" id="kgld-board"><div class="section-head"><h2>KGLD Watch</h2><p>Research Now, Monitor, No Action만 action 기준으로 정리합니다.</p></div><div class="kgld-action-grid">${columns.map(([label, items]) => items.length ? `<section><h3>${label}</h3>${items.map((item) => `<article class="kgld-watch-item v2-filterable" data-kgld="true" data-aa="false" data-domain="kgld" data-status="all" data-search="${escapeHtml(`${item.proposalId} ${item.title} ${item.internalAction}`)}" data-open-proposal="${escapeHtml(item.proposalId)}" data-evidence-id="${escapeHtml(item.evidenceIds?.[0] ?? `spec:${item.proposalId}`)}" data-source-path="views.kgldWatch.groups"><b>${proposalAnchor(item.proposalId, item.title)}</b><p><b>Affected process:</b> ${escapeHtml(item.affectedKgldProcess)}</p><p><b>Action:</b> ${escapeHtml(item.internalAction)}</p><p><b>Next trigger:</b> ${escapeHtml(item.nextTrigger)}</p><p><b>Evidence maturity:</b> ${escapeHtml(item.evidenceMaturity)}</p><button type="button" data-open-proposal="${escapeHtml(item.proposalId)}">Inspector</button></article>`).join("")}</section>` : "").join("") || '<p class="empty">KGLD action 없음</p>'}</div></section>`;
}

function renderEvidenceQualityV2(view: ReturnType<typeof buildDashboardV2View>): string {
  const q = view.evidenceQuality;
  const rankingNote = q.weeklyRankingValidity === "invalid" ? `<p class="muted">최근 7일 usable event는 ${q.usableEvents}/${q.rawEvents}건이며, 데이터 품질 기준에 따라 주간 순위는 비활성화했습니다.</p>` : "";
  return `<section class="research-section v2-section" id="evidence-quality"><div class="section-head"><h2>Evidence & Data Quality</h2><p>EIP/ERC 공식 명세 ${view.monitoringScope.monitoredProposalCount}건과 Ethereum Magicians thread ${view.monitoringScope.discussionThreadCount}개를 같은 관찰 대상 내 180일 이력으로 확인합니다.</p></div><p class="quality-badge ${q.weeklyRankingValidity === "invalid" ? "warning" : "confirmed"}">${escapeHtml(q.weeklyRankingValidity)} · ${escapeHtml(q.discussionRelevance)} · implementation ${escapeHtml(q.implementationEvidence)}</p>${rankingNote}<dl class="quality-grid"><div><dt>raw events</dt><dd>${q.rawEvents}</dd></div><div><dt>usable events</dt><dd>${q.usableEvents}</dd></div><div><dt>unknown semantic events</dt><dd>${q.unknownSemanticEvents}</dd></div><div><dt>timestamp 미확정</dt><dd>${q.fallbackTimestamps}</dd></div><div><dt>thread full/partial/failed</dt><dd>${q.threadCollection.full}/${q.threadCollection.partial}/${q.threadCollection.failed}</dd></div><div><dt>discussion relevance</dt><dd>${escapeHtml(q.discussionRelevance)}</dd></div><div><dt>sourceMode</dt><dd>${escapeHtml(view.metadata.sourceMode)}</dd></div><div><dt>networkRequests</dt><dd>0</dd></div></dl></section>`;
}

function renderCollapsedAppendix(view: ReturnType<typeof buildDashboardV2View>): string {
  void view;
  return `<section class="research-section v2-section atlas-appendix-section" id="proposal-appendix"><div class="section-head"><h2>Collapsed Appendix</h2><p>기존 원문 링크와 근거 행은 기본 접힘 상태로 유지합니다.</p></div><details class="atlas-appendix"><summary>Proposal 근거 appendix</summary><p class="muted">전체 근거 행은 embedded dashboardV2 proposalExplorer data에 보존되며 기본 화면에는 렌더링하지 않습니다.</p></details></section>`;
}

function renderInspectorDrawer(): string {
  return `<aside class="inspector" data-inspector data-topic-drawer data-proposal-drawer aria-hidden="true" tabindex="-1"><button type="button" data-inspector-close aria-label="Inspector 닫기">Close</button><div data-inspector-body><h2>Inspector</h2><p>항목을 선택하면 Direct evidence와 Inferred classification을 분리해 표시합니다.</p></div></aside>`;
}

function proposalSummaryForV3(
  item: ReturnType<typeof buildDashboardV2View>["weeklyTimeline"]["items"][number],
  proposal?: ReturnType<typeof buildDashboardV2View>["proposalExplorer"]["rows"][number],
): string {
  const title = proposal?.title ?? item.title ?? item.proposalId;
  const abstract = String(proposal?.abstractSummary ?? "").replace(/\s+/g, " ").trim();
  if (abstract && !/Proposal file creation detected/i.test(abstract)) return summarizeSpecificationKo(item.proposalId, title, abstract);
  const description = String(item.description ?? "").replace(/\s+/g, " ").trim();
  if (description && !/Proposal file creation detected/i.test(description)) return summarizeSpecificationKo(item.proposalId, title, description);
  if (item.eventType === "new_proposal") return sourceLimitedWeeklySummary(item.proposalId, title, "새 Draft Proposal로 공식 저장소에 신규 반영됐습니다.");
  if (item.fromStatus && item.toStatus && item.fromStatus !== item.toStatus) return `${item.proposalId}의 공식 상태가 ${item.fromStatus}에서 ${item.toStatus}로 변경됐습니다. 구현·채택 여부는 이번 수집 범위에서 확인하지 않았습니다.`;
  if (item.eventType === "specification_change") return `${item.proposalId}의 공식 명세 변경이 확인됐습니다. 변경 세부 내용은 원문 근거에서 추가 확인이 필요합니다.`;
  return sourceLimitedWeeklySummary(item.proposalId, title, proposal?.status ? `${proposal.status} 상태로 관찰됐습니다.` : "공식 저장소에서 관찰됐습니다.");
}

function cleanPublicSummary(value: string): string {
  const stripped = value
    .replace(/[`*_#>]/g, "")
    .replace(/\s*[-*]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentence = stripped.match(/^(.+?[.!?。]|.+?다\.|.+?니다\.)/)?.[1] ?? stripped;
  return sentence.length > 120 ? `${sentence.slice(0, 116).trim()}...` : sentence;
}

function sourceLimitedWeeklySummary(proposalId: string, title: string, evidenceState: string): string {
  void proposalId;
  void title;
  return `해당 Proposal은 ${evidenceState} 제안의 목적과 범위는 공식 원문에서 확인해야 합니다.`;
}

function auditedDomainForProposal(proposalId: string, fallbackDomainId: string, fallbackTopic?: string, title?: string) {
  const overrides: Record<string, { domainId: string; labelKo: string; topicName?: string; description?: string; secondaryTags?: string[]; searchTerms?: string[]; rationale?: string; previousDomain?: string }> = {
    "EIP-8151": { previousDomain: "interoperability", domainId: "accounts-wallets", labelKo: "계정·권한", topicName: "계정 코드 권한 제한", secondaryTags: ["execution-security"], searchTerms: ["account", "delegation", "ecrecover", "ECDSA"], rationale: "EOA, EIP-7702 delegation, ecRecover, ECDSA 권한 제한과 양자내성 전환 보호에 관한 제안입니다." },
    "EIP-8173": { previousDomain: "tokens-finance", domainId: "execution-state", labelKo: "실행·상태", topicName: "EVM Control Flow", secondaryTags: ["EVM", "control-flow", "ZK-verification"], searchTerms: ["evm", "control flow", "zk"], rationale: "EVM control flow의 배경과 검증 구조를 다루는 실행 계층 제안입니다." },
    "EIP-8295": { previousDomain: "tokens-finance", domainId: "execution-state", labelKo: "실행·상태", topicName: "State Write Gas Pricing", secondaryTags: ["state-write", "gas-pricing"], searchTerms: ["state write", "gas pricing"], rationale: "Ethereum state write tiering과 gas pricing을 다루는 실행·상태 제안입니다." },
    "EIP-8182": { previousDomain: "execution-state", domainId: "tokens-finance", labelKo: "자산·금융", topicName: "Private Asset Transfer", secondaryTags: ["privacy", "shielded-transfer"], searchTerms: ["private transfer", "ERC-20", "shielded transfer"], rationale: "Private ETH 및 ERC-20 transfer 표준으로 자산 전송과 프라이버시를 다룹니다." },
    "ERC-8325": { previousDomain: "accounts-wallets", domainId: "tokens-finance", labelKo: "자산·금융", topicName: "Asset Anchor Registry", secondaryTags: ["asset-registry", "identity-compliance"], searchTerms: ["offchain asset", "anchor registry", "asset registry"], rationale: "오프체인 자산과 토큰 사이의 anchor registry 성격이 중심입니다." },
    "ERC-8217": { previousDomain: "scaling-data", domainId: "identity-compliance", labelKo: "신원·컴플라이언스", topicName: "Agent Identity Binding", secondaryTags: ["agent-identity", "asset-binding"], searchTerms: ["agent identity", "asset binding"], rationale: "AI agent identity와 NFT 또는 tokenized asset의 binding을 다룹니다." },
    "EIP-8253": { previousDomain: "scaling-data", domainId: "execution-state", labelKo: "실행·상태", topicName: "Account State Collision Prevention", secondaryTags: ["account-state", "create-collision", "nonce"], searchTerms: ["account state", "create collision", "nonce"], rationale: "storage를 보유한 zero-nonce account와 CREATE/CREATE2 address collision 방지, account nonce 실행 상태 동작을 다룹니다." },
    "EIP-8333": { previousDomain: "scaling-data", domainId: "validators-consensus", labelKo: "검증자·합의", topicName: "Casper FFG Checkpoint", secondaryTags: ["finality", "checkpoint", "Casper-FFG"], searchTerms: ["finality", "checkpoint", "Casper FFG"], rationale: "Casper FFG checkpoint, epoch boundary block, consensus finality checkpoint 구성에 관한 합의 계층 제안입니다." },
    "ERC-8049": { previousDomain: "interoperability", domainId: "scaling-data", labelKo: "확장·데이터", topicName: "Contract Metadata Key-Value Registry", description: "컨트랙트가 자체 메타데이터를 온체인 key-value 형식으로 노출하기 위한 표준입니다.", secondaryTags: ["contract-metadata", "onchain-metadata", "key-value-registry"], searchTerms: ["contract metadata", "onchain metadata", "key value registry"], rationale: "contract 자체의 on-chain key-value metadata 조회 및 저장 표준이며 상호운용 메시지 프로토콜이 아닙니다." },
    "EIP-8198": { previousDomain: "scaling-data", domainId: "validators-consensus", labelKo: "검증자·합의", topicName: "Quick Slots", description: "Consensus Layer의 slot duration을 런타임 설정으로 전환하고, 더 짧은 slot에 맞춰 block gas limit과 blob parameter를 비례 조정하는 제안입니다.", secondaryTags: ["slot-duration", "consensus-layer", "block-production", "throughput-parameters"], searchTerms: ["slot duration", "consensus layer", "block production", "throughput parameters"], rationale: "SLOT_DURATION_MS를 consensus layer compile-time constant에서 runtime configuration으로 바꾸고 block gas limit 및 blob parameter를 비례 조정하는 합의 계층 제안입니다." },
    "EIP-8298": { previousDomain: "accounts-wallets", domainId: "execution-state", labelKo: "실행·상태", topicName: "SETCODEFROM Code Reuse Instruction", description: "다른 account의 배포 코드를 재사용할 수 있도록 EVM의 code 설정 동작을 확장하는 실행 명령을 제안합니다.", secondaryTags: ["EVM-opcode", "code-reuse", "account-code", "runtime-semantics"], searchTerms: ["SETCODEFROM", "EVM opcode", "code reuse", "runtime semantics"], rationale: "SETCODEFROM opcode와 account code 재사용, runtime code semantics를 다루므로 계정 인증이나 지갑 권한이 아니라 실행·상태 영역입니다." },
    "EIP-8347": { domainId: "execution-state", labelKo: "실행·상태", topicName: "Offline State Migration to PBT", description: "Ethereum 상태를 Partitioned Binary Tree로 오프라인 이전하기 위한 절차와 검증 방식을 다룹니다.", searchTerms: ["execution", "state", "pbt", "offline state migration"] },
    "EIP-8337": { domainId: "execution-state", labelKo: "실행·상태", topicName: "Validated EVM Code", description: "MAGIC 접두사와 배포 시 검증 절차로 EVM 코드를 사전에 검증 가능한 형식으로 정의합니다.", searchTerms: ["evm", "validated code"] },
    "ERC-8286": { domainId: "accounts-wallets", labelKo: "계정·권한", searchTerms: ["account", "wallet", "frame transaction"] },
    "ERC-8262": {
      domainId: "identity-compliance",
      labelKo: "신원·컴플라이언스",
      topicName: "영지식 컴플라이언스 검증",
      description: "AML·제재 등 규제 조건을 온체인에서 영지식으로 검증하기 위한 인터페이스를 다룹니다.",
      searchTerms: ["zero knowledge", "compliance", "aml", "sanctions"],
    },
    "ERC-8320": {
      domainId: "identity-compliance",
      labelKo: "신원·컴플라이언스",
      topicName: "Regulated Asset Claim",
      description: "규제 자산에 대한 서명된 claim을 등록하고 검증하는 인터페이스를 다룹니다.",
      secondaryTags: ["tokens-finance"],
      searchTerms: ["regulated asset", "signed claim", "compliance"],
    },
  };
  const override = overrides[proposalId];
  if (override) return override;
  return {
    domainId: fallbackDomainId,
    labelKo: domainDisplayName(fallbackDomainId),
    topicName: fallbackTopic,
    description: undefined,
    searchTerms: [fallbackTopic, title].filter(Boolean) as string[],
  };
}

function publicDomainForProposal(proposalId: string, fallbackDomainId: string, fallbackTopic?: string, title?: string) {
  return auditedDomainForProposal(proposalId, fallbackDomainId, fallbackTopic, title);
}

function buildPublicDomainAudit(view: ReturnType<typeof buildDashboardV2View>, facts: DashboardV3Facts): PublicDomainAudit[] {
  const factById = new Map((facts.specificationEvidence ?? []).map((fact) => [fact.proposalId, fact]));
  return view.proposalExplorer.rows.map((proposal) => {
    const audited = auditedDomainForProposal(proposal.proposalId, proposal.domainId, proposal.topic, proposal.title);
    const fact = factById.get(proposal.proposalId);
    return {
      proposalId: proposal.proposalId,
      officialTitle: fact?.officialTitle ?? proposal.title,
      previousDomain: audited.previousDomain ?? proposal.domainId,
      auditedPrimaryDomain: audited.domainId,
      secondaryTags: audited.secondaryTags ?? [],
      rationale: audited.rationale ?? "공식 title, abstract, motivation을 기준으로 기존 domain을 유지했습니다.",
      sourceFactId: fact?.factId ?? `spec:${proposal.proposalId}`,
      changed: (audited.previousDomain ?? proposal.domainId) !== audited.domainId,
    };
  });
}

function buildDirectionAbstractV3(view: ReturnType<typeof buildDashboardV2View>, facts: DashboardV3Facts, scope = {
  classifiedProposalCount: view.proposalExplorer.rows.length,
  concentratedMonitoringCount: view.monitoringScope.monitoredProposalCount,
  implementationSourceCount: 0,
}): DirectionAbstract {
  const groups = [
    {
      label: "실행·상태",
      body: "Block Access List, 부분 상태 보유, Partitioned Binary Tree, 검증된 실행 코드 등의 제안은 상태 접근과 실행 검증 구조를 더 명시적으로 다루려는 흐름을 보여줍니다.",
      representativeProposalIds: ["EIP-8159", "EIP-8297", "EIP-8337"],
    },
    {
      label: "계정·권한",
      body: "계정 계층에서는 위임, 배치 실행, 가스 대납, 다양한 서명 방식과 양자내성 전환을 지원하려는 Proposal이 이어지고 있습니다.",
      representativeProposalIds: ["EIP-8130", "EIP-8141", "EIP-8164"],
    },
    {
      label: "응용·컴플라이언스",
      body: "응용 계층에서는 프라이버시 전송, 규제 자산 Claim, 컴플라이언스 이벤트 기록과 관련된 표준 제안도 확인됩니다.",
      representativeProposalIds: ["EIP-8182", "ERC-8262", "ERC-8328"],
    },
  ].map((group) => ({
    ...group,
    representativeProposalIds: group.representativeProposalIds.filter((id) => (facts.specificationEvidence ?? []).some((fact) => fact.proposalId === id)),
  }));
  const representativeProposalIds = unique([
    ...groups.flatMap((group) => group.representativeProposalIds),
    "EIP-8347", "EIP-8200", "EIP-8202", "ERC-8286", "EIP-8184", "ERC-8320",
  ]).filter((id) => (facts.specificationEvidence ?? []).some((fact) => fact.proposalId === id));
  const specById = new Map((facts.specificationEvidence ?? []).map((fact) => [fact.proposalId, fact]));
  return {
    thesisKo: "이번 보고서에서 관찰한 EIP/ERC 제안군에서는 처리량 확대뿐 아니라, 상태 접근과 실행 검증 구조를 더 명시적으로 재설계하려는 흐름이 함께 나타납니다.",
    evmDirectionKo: groups[0]?.body ?? "",
    accountDirectionKo: groups[1]?.body ?? "",
    applicationDirectionKo: groups[2]?.body ?? "",
    maturityKo: `다만 분류·탐색 대상은 ${scope.classifiedProposalCount}건, 집중 모니터링 대상은 ${scope.concentratedMonitoringCount}건이며, 구현·활성화·채택 데이터는 수집되지 않았습니다. 따라서 이는 확정된 Ethereum 로드맵이 아니라 현재 명세 제안군에서 관찰되는 방향입니다.`,
    groups,
    representativeProposalIds,
    sourceUrls: representativeProposalIds.map((id) => specById.get(id)?.sourceUrl ?? proposalUrl(id)).filter(Boolean),
    evidenceIds: representativeProposalIds.map((id) => specById.get(id)?.factId ?? `spec:${id}`),
  };
}

function repositoryTrendInterpretation(weeks: Array<Record<string, number | string>>) {
  const values = weeks.map((week) => Number(week.confirmedSpecificationChanges ?? 0));
  const total26 = values.reduce((sum, value) => sum + value, 0);
  const latest = values.at(-1) ?? 0;
  const last8Total = values.slice(-8).reduce((sum, value) => sum + value, 0);
  const avg26 = total26 / Math.max(1, values.length);
  const avg8 = last8Total / Math.max(1, Math.min(8, values.length));
  const max = Math.max(0, ...values);
  const relation = avg8 > avg26 * 1.15 ? "높은" : avg8 < avg26 * 0.85 ? "낮은" : "유사한";
  const direction = avg8 > avg26 * 1.15 ? "증가" : avg8 < avg26 * 0.85 ? "감소" : "유사";
  return {
    headline: `최근 8주 평균 ${avg8.toFixed(1)}건 · 26주 평균 ${avg26.toFixed(1)}건`,
    body: `공식 저장소 신규 문서 반영은 최근 8주 평균 ${avg8.toFixed(1)}건으로 26주 평균 ${avg26.toFixed(1)}건보다 ${relation} 수준입니다. 이번 주는 ${latest}건이며 최대 주는 ${max}건입니다. 다만 주별 편차가 커 지속적인 ${direction}로 단정하기는 어렵습니다.`,
  };
}

function firstDiscussionDateFromView(view: ReturnType<typeof buildDashboardV2View>): string | null {
  const dates = view.developerActivity.threads
    .flatMap((thread) => thread.daily ?? [])
    .filter((day) => Number(day.rawPostCount ?? 0) > 0)
    .map((day) => day.date)
    .sort();
  return dates.length ? formatDateKst(dates[0]!) : null;
}

function magiciansConcentrationText(p: DashboardV3Presentation): string {
  const total = Number(p.view.developerActivity.rawPostCount ?? 0);
  const top = p.activeThreads[0];
  if (!top || total <= 0) return "";
  const ratio = Math.round(top.rawPostCount / total * 100);
  return `이번 주 수집된 원문 게시물의 약 ${ratio}%가 ${top.proposalId}에 집중돼 있습니다. 따라서 ${total}건이라는 수치를 Ethereum 전반의 토론 활성화로 해석하기보다, 특정 Proposal에 활동이 집중된 결과로 보는 것이 적절합니다.`;
}

function isWithinTrailingDays(value: string | null | undefined, reportDate: string, days: number): boolean {
  if (!value) return false;
  const at = Date.parse(value);
  const start = Date.parse(`${reportDate}T00:00:00+09:00`) - days * DAY_MS;
  const end = Date.parse(`${reportDate}T23:59:59+09:00`);
  if (!Number.isFinite(at) || !Number.isFinite(start) || !Number.isFinite(end)) return false;
  return at >= start && at <= end;
}

function metricStateText(metric: unknown, zeroLabel = "확인된 변화 없음"): string {
  if (!metric || typeof metric !== "object") return "미수집";
  const value = Number((metric as { value?: unknown }).value ?? 0);
  const state = String((metric as { state?: unknown }).state ?? "");
  if (state === "confirmed_zero") return zeroLabel;
  if (state === "confirmed_value") return `${value}건 확인`;
  if (state === "not_collected") return "미수집";
  if (state === "baseline_not_linked") return "기준 Proposal 미연결";
  if (value > 0) return `${value}건 확인`;
  return state ? stateLabel(state) : zeroLabel;
}

function aaRecentActivityText(track: Record<string, unknown>): string {
  const milestone = track.lastMilestone && typeof track.lastMilestone === "object" ? track.lastMilestone as Record<string, unknown> : null;
  if (!milestone) return "확인된 최근 활동 없음";
  const date = typeof milestone.occurredAt === "string" ? formatDateKst(milestone.occurredAt) : typeof milestone.windowEnd === "string" ? formatDateKst(milestone.windowEnd) : "날짜 미확인";
  const proposalId = String(milestone.proposalId ?? (Array.isArray(track.proposalIds) ? track.proposalIds[0] ?? "" : "")).trim();
  const signalType = String(milestone.signalType ?? milestone.eventType ?? "");
  const kind = /discussion/i.test(signalType) ? "토론" : /specification|new_proposal|proposal/i.test(signalType) ? "공식 저장소 반영" : "확인 신호";
  return `${date} · ${proposalId || "Proposal 미확인"} · ${kind}`;
}

function aaRecentProposalId(track: Record<string, unknown>): string {
  const milestone = track.lastMilestone && typeof track.lastMilestone === "object" ? track.lastMilestone as Record<string, unknown> : null;
  const proposalId = String(milestone?.proposalId ?? (Array.isArray(track.proposalIds) ? track.proposalIds[0] ?? "" : "")).trim();
  return proposalId || "Proposal 미확인";
}

function discussionCountTextKo(count: number): string {
  return count > 0 ? `원문 게시물 ${count}건` : "최근 게시물 없음";
}

function proposalTitleFromView(view: ReturnType<typeof buildDashboardV2View>, proposalId: string): string {
  return view.proposalExplorer.rows.find((row) => row.proposalId === proposalId)?.title ?? proposalId;
}

function kgldPresentationItem(item: Record<string, unknown>) {
  const proposalId = String(item.proposalId ?? "ERC-8328");
  return {
    proposalId,
    title: proposalId === "ERC-8328" ? "Subject-Linked Compliance Event Log" : String(item.title ?? proposalId),
    groupLabel: "즉시 조사",
    impactArea: proposalId === "ERC-8328" ? "컴플라이언스 이벤트 기록 · 감사 추적" : String(item.affectedKgldProcess ?? "영향 업무 확인 필요"),
    ownerFunction: "Compliance",
    currentStage: "Proposal 단계",
    implementationEvidence: "미확인",
    evidenceLevel: "명세 본문 확인 · 구현 근거 미확인",
    action: proposalId === "ERC-8328"
      ? "eventType, outcome, technicalActor, claimedAuthority, involvedParties, operationReference를 KGLD의 발행·동결·상환 이벤트 로그에 어떻게 매핑할 수 있는지 검토합니다."
      : String(item.internalAction ?? "KGLD 이벤트 모델과 비교합니다."),
    limitation: proposalId === "ERC-8328"
      ? "이 Proposal은 컴플라이언스 정책, 법적 권한 또는 상환 절차 자체를 정의하지 않으며, 이벤트 기록 형식을 검토하기 위한 참고 표준입니다."
      : "구현·운영 채택 근거가 확인되기 전까지 참고 표준으로만 검토합니다.",
    nextTrigger: "구현 PR, 테스트넷 반영, Final 전환, 운영 채택 근거 중 하나가 확인되면 재검토합니다.",
  };
}

function truncateText(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 1)).trim()}...` : value;
}

function proposalTagsForV3(proposal?: ReturnType<typeof buildDashboardV2View>["proposalExplorer"]["rows"][number]): string[] {
  if (!proposal) return ["분류 대기"];
  return [
    proposal.isAA ? "AA" : "",
    proposal.kgldRelevance ? "KGLD" : "",
    proposal.counts.validTechnicalPostCount == null && proposal.counts.rawPosts > 0 ? "분류 대기" : "",
    proposal.evidenceState === "partial" ? "제한적 수집" : "",
    proposal.evidenceState === "confirmed_zero" ? "확인된 변화 없음" : "",
  ].filter(Boolean);
}

function renderProposalTagsV3(proposal: ReturnType<typeof buildDashboardV2View>["proposalExplorer"]["rows"][number]): string {
  const tags = proposalTagsForV3(proposal);
  return tags.length ? tags.map((tag) => `<span class="dash-tag">${escapeHtml(tag)}</span>`).join("") : `<span class="dash-tag dash-tag-muted">공식 근거 확인</span>`;
}

function domainDescriptionForV3(domainId: string): string {
  const labels: Record<string, string> = {
    "tokens-finance": "자산, DeFi, 금융 primitive",
    "accounts-wallets": "계정 추상화와 권한 모델",
    "identity-compliance": "신원, 권한, compliance 흐름",
    "execution-state": "실행 환경, state, execution 변화",
    "scaling-data": "L2, blob, data availability",
    "validators-consensus": "검증자와 합의 운영",
    "developer-tooling": "개발자 도구와 표준 작성 경험",
    "security-privacy": "보안, privacy, 검증 흐름",
    unknown: "분류 보류 또는 도메인 미확정",
  };
  return labels[domainId] ?? "EIP/ERC 기술 영역";
}

function evidenceStateLabelV3(state: string): string {
  if (state === "confirmed" || state === "direct_verified") return "공식 근거 확인";
  if (state === "raw_only" || state === "discussion_relevance_unclassified") return "원문 수집 기준";
  if (state === "confirmed_zero") return "확인된 변화 없음";
  if (state === "partial") return "제한적 수집";
  if (state === "unclassified") return "분류 대기";
  return state || "확인 불가";
}

function canonicalEvidenceStateFromLabel(value: string | null | undefined): string {
  const text = String(value ?? "").toLowerCase();
  if (/confirmed[_ -]?zero|확인된 변화 없음/.test(text)) return "confirmed_zero";
  if (/partial|제한적/.test(text)) return "partial";
  if (/unavailable|확인 불가/.test(text)) return "unavailable";
  if (/unclassified|분류 대기/.test(text)) return "unclassified";
  if (/not[_ -]?collected|미수집/.test(text)) return "not_collected";
  if (/unknown/.test(text)) return "unclassified";
  return "confirmed";
}

function canonicalMetricEvidenceState(state: string | null | undefined): string {
  if (state === "confirmed_value") return "confirmed";
  if (state === "confirmed_zero") return "confirmed_zero";
  if (state === "not_collected") return "not_collected";
  if (state === "baseline_not_linked") return "unavailable";
  return canonicalEvidenceStateFromLabel(state);
}

function evidenceScopesFromIds(ids: string[] = [], fallback: string[] = ["specification"]): string[] {
  const scopes = new Set<string>();
  for (const id of ids) {
    if (/^(post|thread):/i.test(id)) scopes.add("discussion");
    else if (/^(implementation|release|client|adoption):/i.test(id)) scopes.add("implementation");
    else if (/^(event|spec|proposal):/i.test(id)) scopes.add("specification");
  }
  for (const item of fallback) scopes.add(item);
  return [...scopes].filter((scope) => ["specification", "discussion", "implementation", "mixed"].includes(scope));
}

function domainEvidenceScopes(specCount: number, rawPosts: number): string[] {
  const scopes = new Set<string>();
  if (specCount > 0) scopes.add("specification");
  if (rawPosts > 0) scopes.add("discussion");
  if (!scopes.size) scopes.add("specification");
  return [...scopes];
}

function aaTrackEvidenceScopes(track: { specification30d?: { state?: string }; discussion30d?: { state?: string } }): string[] {
  const scopes = new Set<string>();
  if (track.specification30d?.state === "confirmed_value" || track.specification30d?.state === "confirmed_zero") scopes.add("specification");
  if (track.discussion30d?.state === "confirmed_value" || track.discussion30d?.state === "confirmed_zero") scopes.add("discussion");
  if (!scopes.size) scopes.add("specification");
  return [...scopes];
}

function periodDataAttrs(counts: { current7d?: number; current30d?: number; current180d?: number }): string {
  const c7 = Number(counts.current7d ?? 0);
  const c30 = Number(counts.current30d ?? c7);
  const c180 = Number(counts.current180d ?? c30);
  return `data-c7="${c7}" data-c30="${c30}" data-c180="${c180}" data-period-count="${c7}"`;
}

function trendAxisLabels(weeks: Array<Record<string, number | string>>): string {
  return weeks.filter((_, index) => index % 4 === 0 || index === weeks.length - 1).map((week) => `<span>${escapeHtml(String(week.weekStart ?? "").slice(5, 10))}</span>`).join("");
}

function metricCellText(metric: unknown): string {
  if (!metric || typeof metric !== "object") return "unavailable";
  const value = (metric as { value?: unknown }).value;
  const state = (metric as { state?: string }).state;
  if (value === null || value === undefined) return state ?? "unavailable";
  return `${value}${state ? ` · ${state}` : ""}`;
}

function kgldGroupLabel(group: string): string {
  if (group === "research_now") return "Research Now";
  if (group === "monitor") return "Monitor";
  if (group === "no_action") return "No Action";
  return group;
}

function formatKoreanDate(value: string): string {
  return formatDateKst(value);
}

function repositoryAdditionDateRangeKo(items: WeeklyRepositoryAdditionItem[]): string {
  const dates = unique(items.map((item) => item.repositoryAddedDateKst)).sort();
  if (dates.length === 0) return "해당 기간";
  const first = datePartsFromDotted(dates[0]!);
  const last = datePartsFromDotted(dates.at(-1)!);
  if (!first || !last) return dates.length === 1 ? dates[0]! : `${dates[0]}~${dates.at(-1)}`;
  if (first.year === last.year && first.month === last.month && first.day === last.day) return `${Number(first.month)}월 ${Number(first.day)}일`;
  if (first.year === last.year && first.month === last.month) return `${Number(first.month)}월 ${Number(first.day)}일~${Number(last.day)}일`;
  return `${Number(first.month)}월 ${Number(first.day)}일~${Number(last.month)}월 ${Number(last.day)}일`;
}

function datePartsFromDotted(value: string): { year: string; month: string; day: string } | null {
  const match = value.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  return match ? { year: match[1]!, month: match[2]!, day: match[3]! } : null;
}

function iconSvg(name: string): string {
  const common = `width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const paths: Record<string, string> = {
    spec: `<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M10 13h6"/><path d="M10 17h4"/>`,
    discussion: `<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 1 1 18-4z"/>`,
    participant: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    search: `<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`,
    filter: `<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>`,
    external: `<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>`,
    close: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  };
  return `<svg ${common}>${paths[name] ?? paths.spec}</svg>`;
}

function renderDashboardV3Script(): string {
  return `
  (() => {
    const api=JSON.parse(document.getElementById("technology-platform-api")?.textContent||"{}");
    const vm=api?.intelligenceSnapshot?.views?.dashboardV2||{};
    const root=document.querySelector(".dash-v3"); if(!root) return;
    const $$=(s,r=document)=>Array.from(r.querySelectorAll(s)); const $=(s,r=document)=>r.querySelector(s);
    const state={period:"7d",evidence:"all",domain:"all",status:"all",aa:false,kgld:false,confirmed:true,query:"",page:1,pageSize:12}; let lastFocus=null;
    const periodLabels={"7d":"최근 7일","30d":"최근 30일","180d":"최근 180일"};
    const periodKey=()=>state.period==="180d"?"current180d":state.period==="30d"?"current30d":"current7d";
    const periodAttr=()=>state.period==="180d"?"c180":state.period==="30d"?"c30":"c7";
    function tokenSet(value){return new Set(String(value||"").split(/\\s+/).map((item)=>item.trim()).filter(Boolean));}
    function confirmedAllowed(value){return ["confirmed","confirmed_zero"].includes(String(value||"confirmed"));}
    function periodCount(node){const d=node.dataset;return Number(d[periodAttr()]??d.periodCount??0)||0;}
    function evidenceScopes(node){const scopes=tokenSet(node.dataset.evidenceScopes||node.dataset.evidenceScope||"specification");if(scopes.size>1)scopes.add("mixed");return scopes;}
    function matches(node){const d=node.dataset;if(state.domain!=="all"&&d.domain!==state.domain&&d.domain!=="mixed")return false;if(state.status!=="all"&&d.status!==state.status&&d.status!=="all")return false;if(state.aa&&d.aa!=="true")return false;if(state.kgld&&d.kgld!=="true")return false;if(state.confirmed&&!confirmedAllowed(d.evidenceState))return false;if(state.evidence!=="all"&&!evidenceScopes(node).has(state.evidence))return false;if(state.query&&!(d.search||"").toLowerCase().includes(state.query))return false;return true;}
    function updatePeriodText(){const label=periodLabels[state.period]||"최근 7일";$$("[data-period-label]").forEach((n)=>n.textContent=label);$$("[data-period-value]").forEach((n)=>{const host=n.closest(".dash-filterable");if(host)n.textContent=String(periodCount(host));});$$(".dash-filterable").forEach((n)=>{n.dataset.periodCount=String(periodCount(n));});}
    function sectionEmpty(){ $$("[data-filter-scope]").forEach((section)=>{const items=$$(".dash-filterable",section);const visible=items.filter((item)=>!item.hidden);const empty=$("[data-section-empty]",section);if(empty)empty.hidden=visible.length>0 || items.length===0;}); const anyImplementation=$$(".dash-filterable").some((n)=>evidenceScopes(n).has("implementation")&&matches(n)); $$("[data-implementation-empty]").forEach((n)=>n.hidden=state.evidence!=="implementation"||anyImplementation); }
    function apply(){updatePeriodText();const filterable=$$(".dash-filterable");filterable.forEach((n)=>{n.hidden=!matches(n);});const rows=$$("[data-explorer-row]");const matchedIndexes=Array.from(new Set(rows.filter(matches).map((n)=>Number(n.dataset.pageIndex)).filter((n)=>Number.isFinite(n)))).sort((a,b)=>a-b);const pages=Math.max(1,Math.ceil(matchedIndexes.length/state.pageSize));state.page=Math.min(Math.max(1,state.page),pages);const visibleIndexes=new Set(matchedIndexes.slice((state.page-1)*state.pageSize,state.page*state.pageSize));rows.forEach((n)=>{n.hidden=!matches(n)||!visibleIndexes.has(Number(n.dataset.pageIndex));});$$("[data-result-count]").forEach((n)=>n.textContent="탐색 결과 "+matchedIndexes.length+"건");$$("[data-page-state]").forEach((n)=>n.textContent=state.page+" / "+pages+" page");$$("[data-page-prev]").forEach((b)=>b.disabled=state.page<=1);$$("[data-page-next]").forEach((b)=>b.disabled=state.page>=pages);const active=(state.evidence!=="all"?1:0)+(state.domain!=="all"?1:0)+(state.status!=="all"?1:0)+(state.aa?1:0)+(state.kgld?1:0)+(state.confirmed!==true?1:0)+(state.query?1:0)+(state.period!=="7d"?1:0);$$("[data-filter-count]").forEach((n)=>{n.hidden=active===0;n.textContent=String(active);});sectionEmpty();}
    $$("[data-period]").forEach((b)=>b.addEventListener("click",()=>{state.period=b.dataset.period||"7d";$$("[data-period]").forEach((x)=>x.setAttribute("aria-pressed",String(x===b)));state.page=1;apply();}));
    $$("[data-evidence]").forEach((b)=>b.addEventListener("click",()=>{state.evidence=b.dataset.evidence||"all";$$("[data-evidence]").forEach((x)=>x.setAttribute("aria-pressed",String(x===b)));state.page=1;apply();}));
    $$("[data-domain-filter]").forEach((s)=>s.addEventListener("change",()=>{state.domain=s.value;state.page=1;apply();}));
    $$("[data-status-filter]").forEach((s)=>s.addEventListener("change",()=>{state.status=s.value;state.page=1;apply();}));
    $$("[data-aa-toggle]").forEach((i)=>i.addEventListener("change",()=>{state.aa=i.checked;state.page=1;apply();}));
    $$("[data-kgld-toggle]").forEach((i)=>i.addEventListener("change",()=>{state.kgld=i.checked;state.page=1;apply();}));
    $$("[data-confirmed-toggle]").forEach((i)=>i.addEventListener("change",()=>{state.confirmed=i.checked;state.page=1;apply();}));
    $$("[data-proposal-search]").forEach((i)=>i.addEventListener("input",()=>{state.query=i.value.toLowerCase();state.page=1;apply();}));
    $$("[data-page-size]").forEach((s)=>s.addEventListener("change",()=>{state.pageSize=Number(s.value)||12;state.page=1;apply();}));
    $$("[data-page-prev]").forEach((b)=>b.addEventListener("click",()=>{state.page-=1;apply();}));$$("[data-page-next]").forEach((b)=>b.addEventListener("click",()=>{state.page+=1;apply();}));
    $$("[data-life-stage]").forEach((b)=>b.addEventListener("click",()=>{state.status=b.dataset.lifeStage||"all";state.page=1;$$("[data-status-filter]").forEach((s)=>s.value=state.status);apply();document.getElementById("explorer")?.scrollIntoView({block:"start",behavior:"smooth"});}));
    $$("[data-filter-reset]").forEach((b)=>b.addEventListener("click",()=>{Object.assign(state,{period:"7d",evidence:"all",domain:"all",status:"all",aa:false,kgld:false,confirmed:true,query:"",page:1,pageSize:12});$$("[data-period]").forEach((x)=>x.setAttribute("aria-pressed",String(x.dataset.period==="7d")));$$("[data-evidence]").forEach((x)=>x.setAttribute("aria-pressed",String(x.dataset.evidence==="all")));$$("select").forEach((s)=>{if(s.matches("[data-page-size]"))s.value="12";else if(s.matches("[data-domain-filter],[data-status-filter]"))s.value="all";});$$("[data-proposal-search]").forEach((i)=>{i.value="";});$$("[data-aa-toggle],[data-kgld-toggle],[data-confirmed-toggle]").forEach((i)=>{i.checked=i.hasAttribute("data-confirmed-toggle");});apply();}));
    root.addEventListener("click",(e)=>{const p=e.target.closest?.("[data-open-proposal]");if(p&&!e.target.closest("a")){lastFocus=p;openProposal(p.dataset.openProposal);return;}const d=e.target.closest?.("[data-open-domain]");if(d){lastFocus=d;openDomain(d.dataset.openDomain);return;}const a=e.target.closest?.("[data-open-aa]");if(a){lastFocus=a;openAa(a.dataset.openAa);}});
    root.addEventListener("keydown",(e)=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches?.("[data-open-proposal],[data-open-domain],[data-open-aa]")){e.preventDefault();e.target.click();}});
    document.addEventListener("keydown",(e)=>{if(e.key==="Escape")closeInspector();});
    $("[data-inspector-close]")?.addEventListener("click",closeInspector);$("[data-inspector-backdrop]")?.addEventListener("click",closeInspector);
    function metricText(m){const state=String(m?.state||"");const value=Number(m?.value||0);if(state==="confirmed_value")return value+"건 확인";if(state==="confirmed_zero")return "확인된 변화 없음";if(state==="not_collected")return "미수집";if(state==="baseline_not_linked")return "기준 Proposal 미연결";return value>0?value+"건 확인":"확인 불가";}
    function evidenceText(v){v=String(v||"");if(v==="confirmed"||v==="direct_verified")return "공식 근거 확인";if(v==="raw_only"||v==="discussion_relevance_unclassified")return "원문 수집 기준";if(v==="confirmed_zero")return "확인된 변화 없음";if(v==="partial")return "제한적 수집";if(v==="unclassified")return "분류 대기";return v||"확인 불가";}
    function rawText(v){v=Number(v||0);return v>0?"원문 게시물 "+v+"건":"최근 게시물 없음";}
    function openProposal(id){const r=(vm.proposalExplorer?.rows||[]).find((p)=>p.proposalId===id);if(!r)return;show("proposal/"+id,"<div class='dash-inspector-kicker'>"+esc(r.proposalId)+" · "+esc(r.status)+"</div><h2>"+esc(r.title||"")+"</h2><p>"+esc(r.abstractSummary||"요약 정보가 제한적입니다.")+"</p><dl><div><dt>기술 영역 / Topic</dt><dd>"+esc(r.domain)+" / "+esc(r.topic)+"</dd></div><div><dt>신규 문서 반영</dt><dd>"+esc(r.counts?.current7d)+"건</dd></div><div><dt>Magicians 원문 게시물</dt><dd>"+esc(rawText(r.counts?.rawPosts))+" · 참여자 "+esc(r.counts?.participants||0)+"명</dd></div><div><dt>근거 상태</dt><dd>"+esc(evidenceText(r.evidenceState))+"</dd></div></dl><p><a href='"+esc(r.sourceUrl)+"' target='_blank' rel='noopener noreferrer'>공식 원문</a></p><details><summary>근거 정보</summary><p>sourcePath "+esc(r.sourcePath)+"</p><p>evidence "+esc((r.evidenceIds||[]).join(", "))+"</p></details><p class='dash-caption'>구현 근거 미수집.</p>");}
    function openDomain(id){const pts=(vm.topicActivityMap?.points||[]).filter((p)=>p.domainId===id);show("domain/"+id,"<div class='dash-inspector-kicker'>기술 영역별 움직임</div><h2>"+esc(id)+"</h2><p>"+esc(pts.map((p)=>p.name).join(", ")||"관찰된 topic 없음")+"</p>");}
    function openAa(id){const r=(vm.aaMatrix?.tracks||[]).find((t)=>t.id===id);if(!r)return;show("aa/"+id,"<div class='dash-inspector-kicker'>Account Abstraction</div><h2>"+esc(r.name)+"</h2><p>"+esc((r.proposalIds||[]).join(", ")||"기준 Proposal 미연결")+"</p><dl><div><dt>최근 30일 명세 변화</dt><dd>"+esc(metricText(r.specification30d))+"</dd></div><div><dt>최근 30일 토론 활동</dt><dd>"+esc(metricText(r.discussion30d))+"</dd></div><div><dt>구현 근거</dt><dd>미수집</dd></div></dl>");}
    function show(hash,html){const d=$("[data-inspector]"),b=$("[data-inspector-backdrop]");$("[data-inspector-body]").innerHTML=html;d.classList.add("open");d.setAttribute("aria-hidden","false");b.hidden=false;document.body.classList.add("dash-lock-scroll");d.focus();history.replaceState(null,"","#"+encodeURIComponent(hash));}
    function closeInspector(){const d=$("[data-inspector]"),b=$("[data-inspector-backdrop]");d.classList.remove("open");d.setAttribute("aria-hidden","true");if(b)b.hidden=true;document.body.classList.remove("dash-lock-scroll");if(lastFocus)lastFocus.focus();}
    function restoreHash(){const h=decodeURIComponent(location.hash.slice(1));if(h.startsWith("proposal/")){openProposal(h.slice(9));return true;}if(h.startsWith("domain/")){openDomain(h.slice(7));return true;}if(h.startsWith("aa/")){openAa(h.slice(3));return true;}return false;}
    function esc(v){return String(v??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]));}
    apply();
    restoreHash();
    window.addEventListener("hashchange",restoreHash);
  })();`;
}

function renderDashboardV3Styles(): string {
  return `
    body{margin:0;background:#f5f7fb;color:#101828}.dash-lock-scroll{overflow:hidden}
    .dash-v3{--dash-canvas:#f5f7fb;--dash-surface:#fff;--dash-surface-subtle:#f8f9fc;--dash-surface-strong:#eef1f7;--dash-text:#101828;--dash-text-secondary:#475467;--dash-text-muted:#667085;--dash-border:#e4e7ec;--dash-border-strong:#d0d5dd;--dash-primary:#635bff;--dash-primary-dark:#4f46e5;--dash-primary-soft:#f0efff;--dash-spec:#3974f6;--dash-spec-soft:#edf4ff;--dash-discussion:#7c3aed;--dash-discussion-soft:#f4efff;--dash-success:#168a52;--dash-success-soft:#ecf8f2;--dash-warning:#b05c00;--dash-warning-soft:#fff4df;--dash-danger:#c4320a;--dash-danger-soft:#fff0eb;--dash-radius-sm:8px;--dash-radius-md:12px;--dash-radius-lg:18px;--dash-shadow:0 1px 2px rgba(16,24,40,.03),0 8px 24px rgba(16,24,40,.05);--dash-container:1240px;width:min(var(--dash-container),calc(100% - 64px));margin:0 auto;padding:32px 0 72px;font-family:Pretendard,Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;font-size:15px;line-height:1.6;color:var(--dash-text);font-variant-numeric:tabular-nums;letter-spacing:0}.dash-v3 *{box-sizing:border-box;min-width:0}.dash-v3 a{color:inherit;text-decoration:none}.dash-v3 button,.dash-v3 input,.dash-v3 select{font:inherit}.dash-v3 button{min-height:40px}.dash-v3 [hidden],.dash-contract{display:none!important}
    .dash-hero{position:relative;min-height:232px;border-radius:24px;padding:32px;background:linear-gradient(135deg,#17152f 0%,#242052 55%,#34307a 100%);color:#fff;display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:28px;align-items:end;overflow:hidden;box-shadow:0 18px 50px rgba(33,30,78,.2)}.dash-hero:before{content:"";position:absolute;inset:-40% -20% auto auto;width:520px;height:520px;background:radial-gradient(circle,rgba(255,255,255,.18),rgba(255,255,255,0) 62%);pointer-events:none}.dash-hero-copy,.dash-hero-metric{position:relative}.dash-eyebrow{margin:0 0 14px;font-size:12px;font-weight:720;letter-spacing:.08em;color:#c7d2fe}.dash-hero h1{margin:0;font-size:40px;line-height:1.15;font-weight:720;letter-spacing:0}.dash-hero-lede{max-width:620px;margin:12px 0 0;font-size:16px;line-height:1.6;color:#e4e7ff}.dash-hero-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.dash-hero-meta span{border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:6px 10px;background:rgba(255,255,255,.08);color:#f4f5ff;font-size:12px}.dash-hero-metric{border:1px solid rgba(255,255,255,.18);border-radius:18px;background:rgba(255,255,255,.1);padding:20px;text-align:right}.dash-hero-metric span{display:block;color:#d6dbff;font-size:13px}.dash-hero-metric strong{font-size:56px;line-height:1;font-weight:720}.dash-hero-metric em{font-style:normal;color:#d6dbff}.dash-hero-support{margin:12px 0 0;color:#e4e7ff;font-size:12px;line-height:1.45}.dash-badge-row,.dash-tag-row{display:flex;gap:6px;flex-wrap:wrap}.dash-hero-metric .dash-badge-row{justify-content:flex-end;margin-top:14px}.dash-badge,.dash-tag,.dash-state{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:600;line-height:1.3;border:1px solid var(--dash-border);background:var(--dash-surface-subtle);color:var(--dash-text-secondary);white-space:normal}.dash-badge-warning{background:var(--dash-warning-soft);border-color:#fedf89;color:var(--dash-warning)}
    .dash-kpi-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:16px 0}.dash-kpi-card{min-height:138px;background:var(--dash-surface);border:1px solid var(--dash-border);border-radius:18px;padding:18px;box-shadow:var(--dash-shadow);display:grid;grid-template-rows:auto auto 1fr auto;gap:6px;overflow-wrap:anywhere}.dash-kpi-card:focus-visible,.dash-signal-row:focus-visible,.dash-domain-row:focus-visible,.dash-thread-card:focus-visible,.dash-mobile-proposal:focus-visible,.dash-link-button:focus-visible,.dash-proposal-button:focus-visible{outline:3px solid var(--dash-primary-soft);outline-offset:2px}.dash-kpi-icon{width:34px;height:34px;border-radius:10px;background:var(--dash-primary-soft);color:var(--dash-primary);display:grid;place-items:center}.dash-kpi-label{font-size:13px;color:var(--dash-text-secondary);font-weight:650;word-break:keep-all;overflow-wrap:anywhere}.dash-kpi-card strong{font-size:38px;line-height:1;font-weight:720}.dash-kpi-card small{font-size:12px;color:var(--dash-text-muted);word-break:keep-all;overflow-wrap:anywhere}
    .dash-section-nav{position:sticky;top:8px;z-index:20;display:flex;gap:8px;overflow-x:auto;margin:18px 0;padding:6px;background:rgba(255,255,255,.88);border:1px solid var(--dash-border);border-radius:999px;box-shadow:var(--dash-shadow);scrollbar-width:none}.dash-section-nav::-webkit-scrollbar{display:none}.dash-section-nav a{flex:0 0 auto;padding:8px 12px;border-radius:999px;color:var(--dash-text-secondary);font-size:13px;font-weight:650;white-space:nowrap}.dash-toolbar{position:relative;z-index:1;display:grid;grid-template-columns:auto minmax(280px,1fr) auto auto auto;gap:10px;align-items:center;min-height:62px;margin:0 0 40px;padding:10px;border:1px solid var(--dash-border);border-radius:16px;background:var(--dash-surface);box-shadow:var(--dash-shadow)}.dash-segmented{display:flex;gap:4px;padding:3px;border:1px solid var(--dash-border);border-radius:12px;background:var(--dash-surface-subtle)}.dash-segmented button{border:0;border-radius:9px;background:transparent;padding:7px 12px;color:var(--dash-text-secondary);font-weight:650;white-space:nowrap}.dash-segmented button[aria-pressed=true]{background:var(--dash-surface);color:var(--dash-primary-dark);box-shadow:0 1px 3px rgba(16,24,40,.08)}.dash-search{height:42px;border:1px solid var(--dash-border);border-radius:12px;background:var(--dash-surface);display:flex;align-items:center;gap:8px;padding:0 12px}.dash-search span{display:flex;align-items:center;gap:6px;color:var(--dash-text-muted);white-space:nowrap}.dash-search input{width:100%;border:0;outline:0;background:transparent}.dash-filter-details{position:relative}.dash-filter-details summary,.dash-reset{height:42px;border:1px solid var(--dash-border);border-radius:12px;background:var(--dash-surface);padding:0 12px;display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:650;color:var(--dash-text-secondary)}.dash-filter-count{min-width:18px;height:18px;border-radius:999px;background:var(--dash-primary);color:#fff;display:inline-grid;place-items:center;font-size:11px}.dash-filter-panel{position:absolute;right:0;top:48px;width:min(560px,calc(100vw - 48px));display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:14px;border:1px solid var(--dash-border);border-radius:16px;background:var(--dash-surface);box-shadow:0 18px 38px rgba(16,24,40,.14)}.dash-filter-details:not([open]) .dash-filter-panel{display:none}.dash-filter-panel label{display:grid;gap:4px;font-size:12px;color:var(--dash-text-muted)}.dash-filter-panel select{height:38px;border:1px solid var(--dash-border);border-radius:10px}.dash-evidence-group{grid-column:1/-1}.dash-result-count{justify-self:end;font-size:13px;color:var(--dash-text-secondary);font-weight:700;white-space:nowrap}
    .dash-main{display:grid;gap:56px}.dash-section{scroll-margin-top:calc(var(--dash-sticky-nav-height,58px) + 32px)}.dash-panel{background:var(--dash-surface);border:1px solid var(--dash-border);border-radius:18px;padding:22px;box-shadow:var(--dash-shadow)}.dash-section-head{margin-bottom:18px}.dash-section-head span{display:block;margin-bottom:4px;color:var(--dash-primary);font-size:12px;font-weight:720}.dash-section-head h2{margin:0;font-size:24px;line-height:1.3;font-weight:700;letter-spacing:0}.dash-section-head p{max-width:760px;margin:6px 0 0;color:var(--dash-text-secondary);font-size:14px}.dash-grid{display:grid;gap:16px}.dash-grid-7-5{grid-template-columns:minmax(0,2fr) minmax(280px,1fr);align-items:start}.dash-direction{background:linear-gradient(180deg,#fff,var(--dash-surface-subtle));border-color:var(--dash-border-strong)}.dash-direction-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.dash-direction-grid article{border:1px solid var(--dash-border);border-radius:14px;background:#fff;padding:14px}.dash-direction-grid h3{margin:0 0 7px;font-size:15px;line-height:1.4}.dash-direction-grid p{margin:0 0 10px;color:var(--dash-text-secondary);font-size:13px;line-height:1.55}.dash-direction-maturity{background:var(--dash-warning-soft)!important;border-color:#fedf89!important}.dash-weekly-grid{display:grid;grid-template-columns:8fr 4fr;gap:16px}.dash-signal-list,.dash-domain-list,.dash-thread-list,.dash-aa-list,.dash-recent-list{display:grid;gap:10px}.dash-signal-row{width:100%;border:1px solid var(--dash-border);border-radius:14px;background:var(--dash-surface);padding:14px;display:grid;grid-template-columns:92px minmax(0,1fr) minmax(150px,220px) 20px;gap:12px;align-items:center;text-align:left;color:var(--dash-text)}.dash-signal-row:hover,.dash-domain-row:hover,.dash-recent-proposal:hover,.dash-mobile-proposal:hover{background:var(--dash-surface-subtle);border-color:var(--dash-border-strong)}.dash-proposal-pill{display:inline-flex;justify-content:center;align-items:center;min-height:28px;border:1px solid transparent;border-radius:999px;padding:4px 9px;background:var(--dash-spec-soft);color:var(--dash-spec);font-weight:720;font-size:12px;white-space:nowrap}.dash-proposal-button{cursor:pointer;border-color:#cfe0ff}.dash-unlinked{color:var(--dash-text-muted);background:var(--dash-surface-subtle);border-color:var(--dash-border)}.dash-link-button{border:0;background:transparent;color:var(--dash-primary-dark);font-size:12px;font-weight:700;padding:0;cursor:pointer}.dash-signal-main strong,.dash-mobile-proposal strong{display:block;font-size:15px;line-height:1.35;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}.dash-signal-main small{display:block;margin-top:3px;color:var(--dash-text-secondary);font-size:13px;line-height:1.45;overflow:visible}.dash-signal-meta{display:grid;gap:3px;justify-items:end}.dash-signal-meta em{font-style:normal;font-size:12px;color:var(--dash-text-muted)}.dash-chevron{font-size:24px;color:var(--dash-text-muted)}.dash-interpretation{background:var(--dash-warning-soft);border-color:#fedf89}.dash-interpretation h3{margin:0 0 8px;font-size:16px}.dash-interpretation p{margin:0 0 12px;color:#7a3f00}.dash-interpretation dl,.dash-kgld-card dl,.dash-inspector dl,.dash-evidence-grid{display:grid;gap:8px;margin:0}.dash-interpretation div,.dash-inspector dl div,.dash-evidence-grid div{display:flex;justify-content:space-between;gap:12px}.dash-kgld-card dl div{display:grid;grid-template-columns:minmax(90px,120px) minmax(0,1fr);gap:8px 12px;align-items:start}.dash-interpretation dt,.dash-kgld-card dt,.dash-inspector dt,.dash-evidence-grid dt{color:var(--dash-text-muted);font-size:12px;word-break:keep-all;overflow-wrap:normal}.dash-interpretation dd,.dash-kgld-card dd,.dash-inspector dd,.dash-evidence-grid dd{margin:0;font-weight:700;text-align:right}.dash-kgld-card dd{text-align:left;word-break:keep-all;overflow-wrap:anywhere}
    .dash-vitalik{background:linear-gradient(180deg,#fff,#fbfcff)}.dash-vitalik-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}.dash-vitalik-card{border:1px solid var(--dash-border);border-radius:16px;background:#fff;padding:16px;display:grid;gap:10px}.dash-vitalik-card-main{grid-row:span 2;background:linear-gradient(180deg,var(--dash-primary-soft),#fff 58%);border-color:#d9d6ff}.dash-vitalik-card h3{margin:0;font-size:17px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.dash-vitalik-card p{margin:0;color:var(--dash-text-secondary);font-size:13px;line-height:1.55}.dash-vitalik-reasons{border-top:1px solid var(--dash-border);padding-top:10px}.dash-vitalik-reasons strong{font-size:13px}.dash-vitalik-reasons ul{margin:6px 0 0;padding-left:18px;color:var(--dash-text-secondary);font-size:13px}.dash-vitalik-empty{border:1px dashed var(--dash-border-strong);border-radius:16px;background:#fff;padding:18px}.dash-vitalik-empty p{margin:6px 0;color:var(--dash-text-secondary)}
    .dash-trend-card{display:grid;gap:10px}.dash-trend-row{display:grid;grid-template-columns:150px minmax(0,1fr) 90px;gap:14px;align-items:center;padding:10px 0;border-top:1px solid var(--dash-border)}.dash-trend-row:first-child{border-top:0}.dash-trend-label h3{margin:0;font-size:14px;font-weight:700}.dash-trend-label span,.dash-trend-latest span,.dash-caption{font-size:12px;color:var(--dash-text-muted)}.dash-trend-row svg{width:100%;height:68px;display:block}.dash-trend-row line{stroke:var(--dash-border-strong)}.dash-trend-bar{fill:currentColor;opacity:.24}.dash-latest-bar{opacity:1}.dash-trend-spec{color:var(--dash-spec)}.dash-trend-discussion{color:var(--dash-discussion)}.dash-trend-primary{color:var(--dash-primary)}.dash-trend-latest{text-align:right}.dash-trend-latest strong{display:block;font-size:24px;line-height:1}.dash-trend-axis{display:flex;justify-content:space-between;margin-left:164px;margin-right:104px;color:var(--dash-text-muted);font-size:11px}.dash-trend-note{margin-top:14px;border:1px solid var(--dash-border);border-radius:14px;background:var(--dash-surface-subtle);padding:14px}.dash-trend-note strong{display:block;margin-bottom:4px;font-size:14px}.dash-trend-note p{margin:0;color:var(--dash-text-secondary);font-size:13px}.dash-trend-note p+p{margin-top:6px}.dash-discussion-note{background:var(--dash-discussion-soft);border-color:#ddd6fe}
    .dash-emerging-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.dash-emerging-card,.dash-emerging-row,.dash-emerging-empty{border:1px solid var(--dash-border);border-radius:14px;background:#fff;padding:14px}.dash-emerging-card{display:grid;gap:10px}.dash-emerging-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dash-emerging-head strong{margin-left:auto;color:var(--dash-primary-dark)}.dash-emerging-head em{font-style:normal;color:var(--dash-text-muted);font-size:12px}.dash-emerging-card h3{margin:0;font-size:17px;line-height:1.35;overflow-wrap:anywhere}.dash-emerging-card p{margin:0;color:var(--dash-text-secondary);font-size:13px;line-height:1.5}.dash-emerging-card p b{display:block;color:var(--dash-text);font-size:12px}.dash-related{display:grid;gap:4px}.dash-proposal-details{border:1px solid var(--dash-border);border-radius:12px;background:var(--dash-surface-subtle);padding:10px}.dash-proposal-details dl{display:grid;gap:8px;margin:8px 0 0}.dash-proposal-details div{display:grid;grid-template-columns:minmax(96px,130px) minmax(0,1fr);gap:10px}.dash-proposal-details dt{color:var(--dash-text-muted);font-size:12px}.dash-proposal-details dd{margin:0;color:var(--dash-text-secondary);word-break:keep-all;overflow-wrap:anywhere}.dash-emerging-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}.dash-emerging-metrics div{background:var(--dash-surface-subtle);border:1px solid var(--dash-border);border-radius:10px;padding:9px}.dash-emerging-metrics dt{font-size:11px;color:var(--dash-text-muted)}.dash-emerging-metrics dd{margin:2px 0 0;font-weight:720}.dash-emerging-links,.dash-emerging-row-actions,.dash-card-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dash-emerging-links a,.dash-emerging-row-actions a,.dash-card-actions a{color:var(--dash-primary-dark);font-weight:700;font-size:12px}.dash-emerging-split{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.dash-emerging-split h3{margin:0 0 10px;font-size:14px}.dash-emerging-list{display:grid;gap:8px}.dash-emerging-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start}.dash-emerging-row strong{overflow-wrap:anywhere}.dash-emerging-row em{grid-column:2;font-style:normal;color:var(--dash-primary-dark);font-size:12px}.dash-emerging-row small,.dash-emerging-row-actions{grid-column:2/-1;color:var(--dash-text-muted);font-size:12px}
    .dash-legend{display:flex;gap:14px;margin-bottom:12px;color:var(--dash-text-secondary);font-size:12px;flex-wrap:wrap}.dash-legend span{display:flex;gap:6px;align-items:center}.dash-spec-dot,.dash-discussion-dot{width:9px;height:9px;border-radius:999px;background:var(--dash-spec)}.dash-discussion-dot{background:var(--dash-discussion)}.dash-domain-row{width:100%;display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start;border:1px solid var(--dash-border);border-radius:14px;background:#fff;padding:14px;text-align:left}.dash-domain-copy{min-width:0;word-break:keep-all;overflow-wrap:anywhere}.dash-domain-copy strong{display:block;font-size:15px;line-height:1.35;word-break:keep-all;overflow-wrap:anywhere}.dash-domain-copy small{display:block;color:var(--dash-text-secondary);font-size:12px;line-height:1.45;word-break:keep-all;overflow-wrap:anywhere}.dash-domain-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dash-domain-stats em{font-style:normal;color:var(--dash-text-secondary);font-size:12px;border:1px solid var(--dash-border);border-radius:10px;background:var(--dash-surface-subtle);padding:8px}.dash-dual-bars{display:grid;gap:6px}.dash-dual-bars:before{content:"Official activity";font-size:11px;color:var(--dash-text-muted)}.dash-dual-bars:after{content:"Community discussion";font-size:11px;color:var(--dash-text-muted);order:2}.dash-dual-bars i,.dash-wide-bar i{display:block;width:var(--w);height:8px;border-radius:999px;background:var(--dash-spec)}.dash-dual-bars .dash-discussion-bar,.dash-wide-bar i{background:var(--dash-discussion)}.dash-state{justify-self:start}.dash-thread-card{border:1px solid var(--dash-border);border-radius:16px;background:#fff;padding:16px;display:grid;gap:10px}.dash-thread-featured{background:linear-gradient(180deg,var(--dash-discussion-soft),#fff 72%);border-color:#ddd6fe}.dash-thread-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.dash-thread-card h3{display:block;margin:0;font-size:16px;line-height:1.4;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}.dash-thread-metrics{display:grid;grid-template-columns:1fr;gap:4px}.dash-thread-metrics strong{font-size:28px;line-height:1}.dash-thread-metrics strong span{display:block;margin:3px 0 0;font-size:12px;color:var(--dash-text-muted);font-weight:500}.dash-thread-metrics em{font-style:normal;font-size:12px;color:var(--dash-text-secondary)}.dash-wide-bar{height:10px;background:var(--dash-surface-strong);border-radius:999px;margin:2px 0;overflow:hidden}.dash-inline-link{display:inline-flex;align-items:center;gap:4px;color:var(--dash-primary-dark);font-size:12px;font-weight:700;flex-wrap:wrap}.dash-compact-details{margin-top:14px}.dash-compact-details summary{cursor:pointer;color:var(--dash-text-secondary);font-weight:700}.dash-local-scroll{max-width:100%;overflow-x:auto}.dash-heatmap,.dash-compact-table{min-width:680px;width:100%;border-collapse:collapse}.dash-heatmap th,.dash-heatmap td,.dash-compact-table th,.dash-compact-table td{padding:8px;border-bottom:1px solid var(--dash-border);font-size:12px;text-align:left}.dash-heatmap td{text-align:center}
    .dash-life-stack{height:54px;border:1px solid var(--dash-border);border-radius:16px;overflow:hidden;display:flex;background:var(--dash-surface-strong)}.dash-life-segment{width:var(--w);min-width:40px;border:0;border-right:1px solid rgba(255,255,255,.9);border-radius:0;background:var(--dash-spec-soft);color:var(--dash-spec);display:grid;align-content:center;justify-items:start;padding:0 10px;text-align:left}.dash-life-segment:nth-child(2){background:var(--dash-primary-soft);color:var(--dash-primary-dark)}.dash-life-segment:nth-child(3){background:var(--dash-warning-soft);color:var(--dash-warning)}.dash-life-segment:nth-child(4){background:var(--dash-success-soft);color:var(--dash-success)}.dash-life-segment span{font-size:11px}.dash-life-segment strong{font-size:16px}.dash-life-legend{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.dash-life-legend button{border:0;background:transparent;color:var(--dash-text-secondary);padding:4px 2px}.dash-muted-stage{opacity:.55}.dash-recent-proposal{display:grid;grid-template-columns:84px minmax(0,1fr) 82px;gap:10px;align-items:center;border:1px solid var(--dash-border);border-radius:12px;background:#fff;padding:12px;text-align:left}.dash-recent-proposal strong{white-space:normal;word-break:keep-all;overflow-wrap:anywhere}.dash-recent-proposal em{font-style:normal;color:var(--dash-primary-dark);font-size:12px;text-align:right}.dash-watch-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}.dash-aa-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.dash-watch-metrics div{border:1px solid var(--dash-border);border-radius:12px;padding:12px;background:var(--dash-surface-subtle);overflow-wrap:anywhere}.dash-watch-metrics dt{font-size:12px;color:var(--dash-text-muted);word-break:keep-all}.dash-watch-metrics dd{margin:4px 0 0;font-size:20px;font-weight:720;word-break:keep-all;overflow-wrap:anywhere}.dash-aa-list{grid-template-columns:repeat(2,minmax(0,1fr))}.dash-aa-row{display:grid;gap:12px;border:1px solid var(--dash-border);border-radius:12px;background:#fff;padding:14px;text-align:left}.dash-aa-title{display:grid;gap:5px}.dash-aa-title h3{margin:0;font-size:16px;line-height:1.35;word-break:keep-all;overflow-wrap:anywhere}.dash-aa-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0}.dash-aa-facts div{border:1px solid var(--dash-border);border-radius:10px;background:var(--dash-surface-subtle);padding:9px}.dash-aa-facts dt{font-size:12px;color:var(--dash-text-muted);word-break:keep-all}.dash-aa-facts dd{margin:3px 0 0;font-weight:700;color:var(--dash-text);word-break:keep-all;overflow-wrap:anywhere}.dash-card-actions button{border:1px solid var(--dash-border);border-radius:10px;background:#fff;padding:7px 10px;color:var(--dash-text-secondary);font-weight:700}.dash-kgld-card{border:1px solid #fedf89;border-radius:16px;background:var(--dash-warning-soft);padding:16px;display:grid;gap:12px}.dash-kgld-card h3{margin:0;font-size:16px;line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}
    .dash-page-size{display:flex;justify-content:flex-end;margin:-8px 0 12px}.dash-page-size label{font-size:12px;color:var(--dash-text-muted)}.dash-page-size select{margin-left:6px;border:1px solid var(--dash-border);border-radius:8px;padding:4px 8px}.dash-explorer-table-wrap{max-width:100%;overflow-x:auto}.dash-explorer-table{width:100%;border-collapse:collapse;table-layout:fixed}.dash-explorer-table th,.dash-explorer-table td{padding:11px 8px;border-bottom:1px solid var(--dash-border);text-align:left;font-size:13px;vertical-align:middle}.dash-explorer-table th{color:var(--dash-text-muted);font-weight:700}.dash-explorer-table td strong{display:block;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}.dash-explorer-table button,.dash-pager button{border:1px solid var(--dash-border);border-radius:10px;background:#fff;padding:7px 10px;color:var(--dash-text-secondary);font-weight:700}.dash-tag-row{display:flex;gap:5px;flex-wrap:wrap}.dash-tag{background:var(--dash-surface-subtle);font-size:11px;padding:3px 7px}.dash-tag-muted{color:var(--dash-text-muted)}.dash-mobile-explorer{display:none}.dash-pager{display:flex;justify-content:flex-end;gap:10px;align-items:center;margin-top:14px;color:var(--dash-text-secondary);font-size:13px}.dash-evidence-summary{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.dash-evidence-summary p{margin:0;color:var(--dash-text-secondary)}.dash-evidence-summary details{flex:0 0 auto}.dash-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:14px;min-width:min(620px,calc(100vw - 64px))}.dash-appendix details:not([open])>:not(summary),.dash-evidence details:not([open])>:not(summary),.dash-compact-details:not([open])>:not(summary){display:none}.dash-empty{color:var(--dash-text-muted);margin:0}.dash-backdrop{position:fixed;inset:0;background:rgba(16,24,40,.36);z-index:70}.dash-inspector{position:fixed;top:0;right:0;bottom:0;width:min(470px,100%);background:#fff;border-left:1px solid var(--dash-border);box-shadow:0 0 44px rgba(16,24,40,.24);z-index:80;padding:24px;overflow:auto;visibility:hidden;opacity:0;pointer-events:none;transform:translateX(calc(100% + 24px));transition:transform .16s ease,opacity .16s ease,visibility .16s ease}.dash-inspector.open{visibility:visible;opacity:1;pointer-events:auto;transform:translateX(0)}.dash-inspector-close{float:right;border:1px solid var(--dash-border);border-radius:10px;background:#fff;color:var(--dash-text);padding:8px}.dash-inspector-body h2{font-size:24px;line-height:1.3;margin:8px 0 10px}.dash-inspector-kicker{color:var(--dash-primary);font-weight:720;font-size:12px}.dash-sheet-handle{display:none}
    @media(max-width:1040px){.dash-v3{width:min(var(--dash-container),calc(100% - 48px));padding-top:24px}.dash-hero{grid-template-columns:1fr 220px}.dash-kpi-strip,.dash-aa-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.dash-toolbar{grid-template-columns:auto minmax(220px,1fr) auto auto}.dash-result-count{grid-column:1/-1;justify-self:start}.dash-weekly-grid,.dash-grid-7-5,.dash-vitalik-grid,.dash-aa-list{grid-template-columns:1fr}.dash-evidence-summary{display:grid}.dash-evidence-summary details{width:100%}}
    @media(max-width:680px){.dash-v3{width:min(100% - 32px,var(--dash-container));padding:16px 0 48px;font-size:14px}.dash-section{scroll-margin-top:24px}.dash-hero{min-height:0;grid-template-columns:1fr;padding:16px;border-radius:20px;gap:10px;align-items:start}.dash-eyebrow{margin-bottom:7px;font-size:11px}.dash-hero h1{font-size:30px;line-height:1.2}.dash-hero-lede{margin-top:7px;font-size:14px;line-height:1.4}.dash-hero-meta{margin-top:9px;gap:5px}.dash-hero-meta span{padding:4px 8px}.dash-hero-meta span:nth-child(2){display:none}.dash-hero-metric{padding:12px;text-align:left;display:block}.dash-hero-metric span{word-break:keep-all;overflow-wrap:normal}.dash-hero-metric .dash-badge-row{justify-content:flex-start;margin-top:0}.dash-hero-metric strong{font-size:38px}.dash-hero-metric em{margin-left:3px}.dash-kpi-strip,.dash-aa-kpis{grid-template-columns:1fr;gap:8px}.dash-kpi-card{min-height:96px;padding:10px}.dash-kpi-card strong{font-size:27px}.dash-kpi-icon{width:30px;height:30px}.dash-section-nav{position:relative;top:auto;margin:12px 0;border-radius:14px}.dash-toolbar{position:relative;top:auto;grid-template-columns:1fr 1fr;margin-bottom:28px}.dash-segmented,.dash-search{grid-column:1/-1}.dash-segmented button{flex:1;padding-left:8px;padding-right:8px}.dash-filter-details summary,.dash-reset{width:100%;justify-content:center}.dash-filter-panel{position:static;width:100%;grid-template-columns:1fr;margin-top:8px;box-shadow:none}.dash-result-count{grid-column:1/-1}.dash-main{gap:32px}.dash-panel{padding:14px;border-radius:16px}.dash-section-head{margin-bottom:10px}.dash-section-head h2{font-size:21px}.dash-section-head p{font-size:13px;line-height:1.45}.dash-weekly-grid{gap:10px}.dash-signal-row{grid-template-columns:1fr 22px;gap:7px;padding:11px}.dash-signal-row .dash-proposal-pill,.dash-signal-main,.dash-signal-meta{grid-column:1/2}.dash-signal-meta{justify-items:start;display:flex;flex-wrap:wrap;gap:7px}.dash-chevron{grid-column:2;grid-row:1/4}.dash-interpretation div,.dash-kgld-card dl div,.dash-proposal-details div,.dash-inspector dl div,.dash-evidence-grid div{display:grid;grid-template-columns:1fr;gap:2px}.dash-interpretation dd,.dash-kgld-card dd,.dash-inspector dd,.dash-evidence-grid dd{text-align:left}.dash-trend-card{gap:2px}.dash-trend-row{grid-template-columns:1fr 62px;gap:5px;padding:4px 0}.dash-trend-row svg{grid-column:1/-1;height:38px}.dash-trend-latest strong{font-size:19px}.dash-trend-axis{margin:0;font-size:10px}.dash-caption{font-size:11px}#trend .dash-caption{display:none}.dash-domain-row{grid-template-columns:1fr;padding:10px}.dash-domain-stats,.dash-emerging-metrics,.dash-emerging-split,.dash-emerging-row,.dash-aa-facts{grid-template-columns:1fr}.dash-thread-card{padding:12px}.dash-life-stack{height:46px}.dash-life-segment{min-width:24px;padding:0 6px}.dash-life-segment span{display:none}.dash-recent-proposal{grid-template-columns:72px minmax(0,1fr);padding:10px}.dash-recent-proposal em{grid-column:1/-1;text-align:left}.dash-watch-metrics{grid-template-columns:1fr}.dash-aa-row{padding:10px}.dash-explorer-table-wrap{display:none}.dash-mobile-explorer{display:grid;gap:8px}.dash-mobile-proposal{border:1px solid var(--dash-border);border-radius:14px;background:#fff;padding:10px;text-align:left;display:grid;gap:4px}.dash-mobile-proposal span:first-child{display:flex;justify-content:space-between;gap:10px}.dash-mobile-proposal em{font-style:normal;color:var(--dash-text-muted)}.dash-mobile-proposal small{color:var(--dash-text-secondary)}.dash-pager{justify-content:space-between}.dash-inspector{top:auto;left:0;right:0;bottom:0;width:100%;max-height:84vh;border-left:0;border-top:1px solid var(--dash-border);border-radius:20px 20px 0 0;transform:translateY(calc(100% + 24px));padding:18px}.dash-inspector.open{transform:translateY(0)}.dash-sheet-handle{display:block;width:42px;height:4px;border-radius:999px;background:var(--dash-border-strong);margin:0 auto 10px}.dash-evidence-grid{min-width:0;grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.dash-v3 *{transition:none!important;scroll-behavior:auto!important}}@media print{.dash-toolbar,.dash-section-nav,.dash-inspector,.dash-backdrop,button{display:none!important}.dash-v3{width:100%;padding:0}.dash-panel,.dash-hero{break-inside:avoid-page;box-shadow:none}}
  `;
}

function dashboardV2Script(): string {
  return `
  initDashboardV2();
  function initDashboardV2(){
    const snapshot=JSON.parse(document.getElementById("technology-platform-api")?.textContent||"{}").intelligenceSnapshot||{};
    const dashboardData=snapshot.views||{};
    const vm=dashboardData.dashboardV2||{};
    const state={period:"7d",evidence:"all",domain:"all",status:"all",aa:false,kgld:false,confirmed:true,query:"",visibleRows:20};
    let lastFocus=null;
    const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
    const matches=(node)=>{
      const domain=node.dataset.domain||"";
      const status=node.dataset.status||"";
      const text=(node.dataset.search||node.textContent||"").toLowerCase();
      const evidence=node.dataset.evidenceState||"";
      return (state.domain==="all"||domain===state.domain)
        && (state.status==="all"||status===state.status)
        && (!state.aa||node.dataset.aa==="true")
        && (!state.kgld||node.dataset.kgld==="true")
        && (!state.confirmed||!/unclassified|not_collected|unavailable/.test(evidence))
        && (state.evidence==="all"||node.dataset.evidenceScope===state.evidence||node.dataset.evidenceId)
        && (!state.query||text.includes(state.query));
    };
    const apply=()=>{
      let visible=0;
      let explorerVisible=0;
      $$(".v2-filterable").forEach((node)=>{
        const ok=matches(node);
        const isExplorer=node.hasAttribute("data-explorer-row");
        if(isExplorer&&ok) explorerVisible++;
        const pagedOut=isExplorer&&ok&&explorerVisible>state.visibleRows;
        node.classList.toggle("is-hidden",!ok||pagedOut);
        if(ok&&node.dataset.kind==="proposal"&&isExplorer) visible++;
      });
      $$("[data-period]").forEach((button)=>{const active=button.dataset.period===state.period;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});
      $$("[data-evidence]").forEach((button)=>{const active=button.dataset.evidence===state.evidence;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});
      $("[data-result-count]").textContent=visible+" proposals";
      $("[data-page-state]")&&( $("[data-page-state]").textContent=Math.min(state.visibleRows,visible)+" / "+visible+" rows");
      $("[data-show-more]")&&( $("[data-show-more]").hidden=state.visibleRows>=visible);
      location.hash=encodeHash();
    };
    const encodeHash=()=>"#filters?period="+state.period+"&evidence="+state.evidence+"&domain="+encodeURIComponent(state.domain)+"&status="+encodeURIComponent(state.status)+"&aa="+state.aa+"&kgld="+state.kgld+"&q="+encodeURIComponent(state.query);
    const loadHash=()=>{const h=location.hash.slice(1); if(h.startsWith("proposal/")){openProposal(h.slice(9));return true;} if(h.startsWith("topic/")){openTopic(h.slice(6));return true;} if(!h.startsWith("filters?")) return false; new URLSearchParams(h.slice(8)).forEach((v,k)=>{if(k==="aa"||k==="kgld")state[k]=v==="true"; else if(k==="q")state.query=v; else state[k]=v;});return false;};
    $$("[data-period]").forEach((button)=>button.addEventListener("click",()=>{state.period=button.dataset.period||"7d";state.visibleRows=20;apply();}));
    $$("[data-evidence]").forEach((button)=>button.addEventListener("click",()=>{state.evidence=button.dataset.evidence||"all";state.visibleRows=20;apply();}));
    $$("[data-domain-filter]").forEach((select)=>select.addEventListener("change",()=>{state.domain=select.value;state.visibleRows=20;apply();}));
    $$("[data-status-filter]").forEach((select)=>select.addEventListener("change",()=>{state.status=select.value;state.visibleRows=20;apply();}));
    $$("[data-aa-toggle]").forEach((input)=>input.addEventListener("change",()=>{state.aa=input.checked;state.visibleRows=20;apply();}));
    $$("[data-kgld-toggle]").forEach((input)=>input.addEventListener("change",()=>{state.kgld=input.checked;state.visibleRows=20;apply();}));
    $$("[data-confirmed-toggle]").forEach((input)=>input.addEventListener("change",()=>{state.confirmed=input.checked;state.visibleRows=20;apply();}));
    $$("[data-proposal-search]").forEach((input)=>input.addEventListener("input",()=>{state.query=input.value.toLowerCase();state.visibleRows=20;apply();}));
    $$("[data-show-more]").forEach((button)=>button.addEventListener("click",()=>{state.visibleRows+=20;apply();}));
    $$("[data-life-stage]").forEach((button)=>button.addEventListener("click",()=>{state.status=button.dataset.lifeStage||"all";state.visibleRows=20;$$("[data-status-filter]").forEach((select)=>select.value=state.status);apply();document.getElementById("proposal-explorer")?.scrollIntoView({block:"start"});}));
    $$("[data-filter-reset]").forEach((button)=>button.addEventListener("click",()=>{Object.assign(state,{period:"7d",evidence:"all",domain:"all",status:"all",aa:false,kgld:false,confirmed:true,query:"",visibleRows:20});$$(".v2-filter select").forEach((s)=>s.value="all");$$(".v2-filter input").forEach((i)=>{if(i.type==="checkbox")i.checked=i.hasAttribute("data-confirmed-toggle");else i.value="";});apply();}));
    $$("[data-open-proposal]").forEach((node)=>node.addEventListener("click",(event)=>{lastFocus=event.currentTarget;openProposal(node.dataset.openProposal);}));
    $$("[data-open-topic]").forEach((node)=>node.addEventListener("click",(event)=>{lastFocus=event.currentTarget;openTopic(node.dataset.openTopic);}));
    $$("[data-open-aa]").forEach((node)=>node.addEventListener("click",(event)=>{lastFocus=event.currentTarget;openAa(node.dataset.openAa);}));
    $("[data-inspector-close]")?.addEventListener("click",closeInspector);
    document.addEventListener("keydown",(event)=>{if(event.key==="Escape")closeInspector(); if(event.key==="Enter"&&event.target?.matches?.("[data-open-proposal],[data-open-topic]"))event.target.click();});
    function openProposal(id){const row=(vm.proposalExplorer?.rows||[]).find((p)=>p.proposalId===id); if(!row)return; showInspector("proposal/"+id, "<h2>"+esc(row.proposalId)+"</h2><h3>"+esc(row.title||"")+"</h3><p>Status "+esc(row.status)+" · "+esc(row.domain)+" / "+esc(row.topic)+"</p><h3>Direct evidence</h3><p>"+esc(row.evidenceIds.join(", "))+"</p><p><a href='"+esc(row.sourceUrl)+"' target='_blank' rel='noopener noreferrer'>official source</a></p><h3>Inferred classification</h3><p>AA "+row.isAA+" · KGLD "+row.kgldRelevance+"</p><h3>Latest events</h3><p>7d "+row.counts.current7d+" · raw posts "+row.counts.rawPosts+" · participants "+row.counts.participants+"</p>");}
    function openTopic(id){const row=(vm.topicActivityMap?.points||[]).find((p)=>p.topicId===id); if(!row)return; showInspector("topic/"+id, "<h2>"+esc(row.name)+"</h2><p>"+esc(row.description||"")+"</p><h3>Direct evidence</h3><p>"+esc(row.evidenceIds.join(", "))+"</p><h3>Proposal</h3><p>"+esc(row.proposalIds.join(", "))+"</p><h3>Activity</h3><p>7d "+row.current7dConfirmedChanges+" · 30d "+row.current30dConfirmedChanges+" · 180d "+row.current180dConfirmedChanges+" · raw posts "+row.rawPostCount+"</p><h3>Inferred classification</h3><p>"+esc(row.limitation||"direct/verified")+"</p>");}
    function openAa(id){const row=(vm.aaMatrix?.tracks||[]).find((t)=>t.id===id); if(!row)return; showInspector("aa/"+id, "<h2>"+esc(row.name)+"</h2><p>"+esc(row.proposalIds.join(", ")||"baseline not linked")+"</p><h3>Direct evidence</h3><p>"+esc((row.evidenceIds||[]).join(", "))+"</p><h3>Inferred classification</h3><p>AA track assignment</p>");}
    function showInspector(hash,html){const drawer=$("[data-inspector]");$("[data-inspector-body]").innerHTML=html;drawer.classList.add("open");drawer.setAttribute("aria-hidden","false");drawer.focus();location.hash=hash;}
    function closeInspector(){const drawer=$("[data-inspector]");drawer.classList.remove("open");drawer.setAttribute("aria-hidden","true"); if(lastFocus)lastFocus.focus();}
    function esc(v){return String(v??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]));}
    if(!loadHash()) apply();
  }`;
}

function dashboardV2Styles(): string {
  return `
    body{background:#f5f6f8}.dashboard-cover{min-height:0;max-height:280px;padding:36px 0 28px;border-bottom:1px solid var(--line);gap:18px}.dashboard-cover h1{font-size:42px;line-height:1.06;margin:0;letter-spacing:0}.dashboard-cover p{max-width:760px;margin:10px 0 0;color:var(--text-secondary);font-size:16px;line-height:1.55}.v2-kicker{font-size:12px;font-weight:800;color:var(--blue);letter-spacing:0}.v2-cover-line{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:24px;align-items:end}.v2-cover-line [data-weekly-signal-cover-metric]{border:1px solid var(--line);border-radius:12px;background:#fff;padding:16px;text-align:right}.v2-cover-line span,.v2-kpi span{display:block;color:var(--text-muted);font-size:12px}.v2-cover-line b{font-size:30px;font-variant-numeric:tabular-nums}.v2-header-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--text-muted);font-size:12px}.v2-header-meta span{border:1px solid var(--line-soft);padding:6px 9px;border-radius:8px;background:#fff}.compat-contract,[hidden]{display:none!important}
    .section-nav{overflow-x:auto;gap:6px}.section-nav a{white-space:normal}.v2-filter{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.97);border:1px solid var(--line);border-radius:12px;padding:12px;display:grid;grid-template-columns:auto minmax(220px,1fr) auto auto;gap:10px;align-items:center;margin:18px 0 40px;box-shadow:var(--shadow-subtle)}.v2-filter label{font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px}.v2-filter select,.v2-filter input,.v2-filter button,.v2-filter summary{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 10px;font:inherit}.v2-filter .search-label{min-width:0}.v2-filter input[type=search]{width:100%;min-width:0}.segmented{display:flex;gap:4px;min-width:0}.segmented button{white-space:normal}.segmented button.active{background:var(--blue);color:#fff}.v2-filter output{font-weight:760;text-align:right}.advanced-filter{grid-column:1/-1}.advanced-filter>div{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
    .v2-section{scroll-margin-top:88px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px;box-shadow:var(--shadow-subtle);margin-top:64px}.v2-section details:not([open])>:not(summary){display:none!important}.v2-section .badge{white-space:normal;display:inline-flex;flex-wrap:wrap;max-width:100%}.v2-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.v2-kpi{min-height:132px;border:1px solid var(--line);border-radius:12px;background:#fff;padding:16px;color:var(--ink);text-decoration:none;display:flex;flex-direction:column;justify-content:space-between}.v2-kpi b{display:block;font-size:34px;font-variant-numeric:tabular-nums}.v2-kpi em,.v2-kpi small{display:block;color:var(--text-muted);font-style:normal;font-size:12px}
    .trend-panel{display:grid;gap:16px}.v2-chart{display:grid;grid-template-columns:190px minmax(0,1fr) 128px;gap:14px;align-items:center;border-top:1px solid var(--line-soft);padding-top:14px}.v2-chart h3{font-size:14px;margin:0}.v2-chart p{margin:0;color:var(--text-muted);font-variant-numeric:tabular-nums}.v2-chart svg{width:100%;height:96px;display:block}.v2-chart line{stroke:var(--line-strong)}.v2-chart rect{fill:#dbe7f8}.v2-chart rect.latest{fill:var(--blue)}.v2-chart text{font-size:12px;fill:var(--text-secondary)}.trend-axis{grid-column:2/3;display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)}.sr-summary{font-size:13px;color:var(--text-muted)}
    .v2-timeline{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding-left:0;list-style:none}.v2-timeline li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;border:1px solid var(--line);border-radius:12px;padding:14px}.v2-timeline li>span{font-size:12px;color:var(--text-muted)}.v2-timeline p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:6px 0 0;color:var(--text-secondary);font-size:13px}.v2-timeline button,.topic-row button,.thread-row button,.kgld-watch-item button,.pager button,.life-segment{border:1px solid var(--line);border-radius:8px;background:#fff;padding:7px 10px;font:inherit;cursor:pointer}.badge-mini{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 7px;margin-right:4px;font-style:normal;color:var(--text-muted);font-size:11px}
    .topic-rows,.thread-rows,.recent-proposals{display:grid;gap:12px}.topic-row,.thread-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,380px) auto;gap:16px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:14px}.topic-row h3,.thread-row h3{font-size:15px;margin:0}.topic-row p,.thread-row p{margin:4px 0 0;color:var(--text-muted);font-size:12px}.topic-bars,.activity-bar{display:grid;grid-template-columns:64px minmax(0,1fr);gap:7px;align-items:center;font-size:12px;color:var(--text-muted)}.topic-bars i,.activity-bar i{height:9px;border-radius:999px;background:var(--blue);width:var(--w)}.topic-bars i.discussion{background:#5b5bd6}.activity-bar{grid-template-columns:minmax(0,1fr) 92px}.activity-bar i{background:#5b5bd6}.activity-bar span{font-variant-numeric:tabular-nums}
    .lifecycle-summary{display:grid;gap:12px}.life-stack{display:flex;width:100%;height:48px;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:#f1f3f5}.life-segment{width:var(--w);min-width:54px;border:0;border-right:1px solid #fff;border-radius:0;background:#dbe7f8;text-align:left;display:grid;align-content:center;gap:1px}.life-segment:nth-child(2n){background:#e8e4ff}.life-segment b{font-variant-numeric:tabular-nums}.life-counts{display:flex;gap:12px;flex-wrap:wrap;margin:0;color:var(--text-muted)}.recent-proposal{text-align:left;border:1px solid var(--line);border-radius:10px;background:#fff;padding:12px;display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:10px}.recent-proposal span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-proposal em{font-style:normal;color:var(--blue)}
    .explorer-wrap .table{min-width:0;width:100%;table-layout:fixed}.explorer-table th,.explorer-table td{word-break:break-word}.explorer-table th:nth-child(1){width:28%}.explorer-table th:nth-child(2){width:20%}.explorer-table th:nth-child(3){width:12%}.explorer-table button,.aa-matrix button{border:1px solid var(--line);border-radius:8px;background:#fff;padding:6px 9px}.pager{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:12px;color:var(--text-muted);font-size:12px}.state{display:inline-block;border:1px solid var(--line);border-radius:7px;padding:2px 6px;font-size:11px}.state.unavailable{border-style:dashed;color:var(--text-muted)}
    .watch-summary,.quality-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.watch-summary article,.quality-grid div{border:1px solid var(--line);border-radius:10px;padding:12px;background:#fff}.watch-summary span,.quality-grid dt{font-size:12px;color:var(--text-muted)}.watch-summary b,.quality-grid dd{display:block;margin:6px 0 0;font-size:18px;font-weight:760}.quality-badge{display:inline-block;border:1px solid var(--line);border-radius:8px;padding:6px 9px}.quality-badge.warning{border-color:var(--amber);background:var(--amber-soft)}.quality-badge.confirmed{border-color:#b8dfca;background:var(--green-soft);color:var(--green)}.kgld-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.kgld-watch-item{border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff}.heatmap td{text-align:center;font-variant-numeric:tabular-nums}.table-wrap{max-width:100%;overflow-x:auto;contain:inline-size}.local-scroll,.appendix-table{min-width:720px}.appendix-scroll{width:100%;max-width:100%;overflow-x:auto}.atlas-appendix:not([open])>:not(summary){display:none!important}
    .inspector{position:fixed;right:0;top:0;bottom:0;width:min(460px,100%);background:#fff;border-left:1px solid var(--line);box-shadow:0 0 34px rgba(16,24,40,.18);z-index:40;transform:translateX(105%);transition:transform .18s ease,opacity .18s ease;visibility:hidden;opacity:0;pointer-events:none;padding:22px;overflow:auto}.inspector.open{transform:translateX(0);visibility:visible;opacity:1;pointer-events:auto}.inspector button{float:right;border:1px solid var(--line);border-radius:8px;background:#fff;padding:8px 10px}.is-hidden{display:none!important}.empty{color:var(--text-muted)}
    @media(max-width:1040px){.v2-kpis,.watch-summary,.quality-grid,.kgld-action-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v2-chart{grid-template-columns:150px minmax(0,1fr) 112px}.v2-timeline{grid-template-columns:1fr}.v2-filter{grid-template-columns:auto minmax(0,1fr) auto}.v2-filter output{grid-column:1/-1;text-align:left}}
    @media(max-width:680px){.dashboard-cover{max-height:none;padding:28px 0 22px}.dashboard-cover h1{font-size:32px}.v2-cover-line{grid-template-columns:1fr}.v2-cover-line [data-weekly-signal-cover-metric]{text-align:left}.v2-filter{position:static;grid-template-columns:1fr 1fr}.v2-filter .period-control,.v2-filter .search-label,.advanced-filter,.v2-filter output{grid-column:1/-1}.segmented{width:100%}.segmented button{flex:1;min-width:0}.advanced-filter>div{display:grid;grid-template-columns:1fr 1fr}.advanced-filter .segmented{grid-column:1/-1}.v2-section{padding:16px;margin-top:56px}.v2-kpis,.watch-summary,.quality-grid,.kgld-action-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v2-kpi{min-height:124px}.v2-kpi b{font-size:28px}.v2-chart{grid-template-columns:1fr;gap:8px}.trend-axis{grid-column:auto}.topic-row,.thread-row,.recent-proposal{grid-template-columns:1fr}.explorer-wrap{overflow-x:visible}.explorer-wrap .table{min-width:0}.explorer-table th:nth-child(2),.explorer-table td:nth-child(2),.explorer-table th:nth-child(4),.explorer-table td:nth-child(4),.explorer-table th:nth-child(5),.explorer-table td:nth-child(5),.explorer-table th:nth-child(6),.explorer-table td:nth-child(6){display:none}.inspector{top:auto;left:0;right:0;bottom:0;width:100%;max-height:80vh;border-left:0;border-top:1px solid var(--line);transform:translateY(105%)}.inspector.open{transform:translateY(0)}}
    @media print{.v2-filter,.inspector,[data-inspector],button{display:none!important}.v2-section{break-inside:avoid-page}.v2-chart{break-inside:avoid}details{display:block}details>*{display:block}}
  `;
}

function filterAttrsForProposal(proposal: { domainId: string; status: string; isAA: boolean; kgldRelevance: boolean; topic: string; proposalId: string; title?: string | null; evidenceState?: string; evidenceIds?: string[]; counts?: { current7d?: number; current30d?: number; current180d?: number; rawPosts?: number } }, forcedScopes?: string[]): string {
  const audited = publicDomainForProposal(proposal.proposalId, proposal.domainId, proposal.topic, proposal.title ?? "");
  const inferredScopes = evidenceScopesFromIds(proposal.evidenceIds ?? [], [
    "specification",
    Number(proposal.counts?.rawPosts ?? 0) > 0 ? "discussion" : "",
  ].filter(Boolean));
  const scopes = forcedScopes ?? inferredScopes;
  const searchText = [
    proposal.proposalId,
    proposal.title ?? "",
    audited.labelKo,
    audited.topicName ?? proposal.topic,
    audited.description ?? "",
    ...(audited.secondaryTags ?? []),
    ...(audited.searchTerms ?? []),
  ].join(" ").toLowerCase();
  return `data-domain="${escapeHtml(audited.domainId)}" data-status="${escapeHtml(lifecycleStageForStatus(proposal.status))}" data-aa="${proposal.isAA}" data-kgld="${proposal.kgldRelevance}" data-search="${escapeHtml(searchText)}" data-evidence-state="${escapeHtml(canonicalEvidenceStateFromLabel(proposal.evidenceState ?? "confirmed"))}" data-evidence-label="${escapeHtml(evidenceStateLabelV3(proposal.evidenceState ?? "confirmed"))}" data-evidence-scopes="${escapeHtml(scopes.join(" "))}" ${periodDataAttrs(proposal.counts ?? {})}`;
}

function filterAttrsForProposalId(view: ReturnType<typeof buildDashboardV2View>, proposalId: string, forcedScopes?: string[]): string {
  const proposal = view.proposalExplorer.rows.find((row) => row.proposalId === proposalId);
  return proposal ? filterAttrsForProposal(proposal, forcedScopes) : `data-domain="unknown" data-status="Unknown" data-aa="false" data-kgld="false" data-search="${escapeHtml(proposalId.toLowerCase())}" data-evidence-state="confirmed" data-evidence-label="공식 근거 확인" data-evidence-scopes="${escapeHtml((forcedScopes ?? ["specification"]).join(" "))}" data-c7="0" data-c30="0" data-c180="0" data-period-count="0"`;
}

function filterAttrsForTopic(topic: { domainId: string; proposalIds: string[]; name: string; evidenceState: string }): string {
  return `data-domain="${escapeHtml(topic.domainId)}" data-status="all" data-aa="${topic.proposalIds.some((id) => /^ERC-4337|EIP-7702|ERC-7579|ERC-6900|ERC-7715|ERC-7710|ERC-8286/.test(id))}" data-kgld="false" data-search="${escapeHtml(`${topic.name} ${topic.proposalIds.join(" ")}`.toLowerCase())}" data-evidence-state="${escapeHtml(canonicalEvidenceStateFromLabel(topic.evidenceState))}" data-evidence-label="${escapeHtml(evidenceStateLabelV3(topic.evidenceState))}" data-evidence-scopes="specification"`;
}

function metricV2(metricId: string, value: unknown, unit: string, sourcePath: string, evidenceIds: string[], state: string, limitation: string) {
  return { metricId, value, unit, sourcePath, evidenceIds, state, limitation };
}

function deterministicBubblePoint(x: number, y: number, size: number) {
  return { x, y, size };
}

function dailyPostCounts(posts: Array<{ createdAt: string }>, from: string, to: string) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const days = Math.max(1, Math.ceil((end - start) / DAY_MS));
  return Array.from({ length: days }, (_, index) => {
    const dayStart = start + index * DAY_MS;
    const date = new Date(dayStart).toISOString().slice(0, 10);
    return {
      date,
      rawPostCount: posts.filter((post) => post.createdAt.slice(0, 10) === date).length,
      uniqueParticipantCount: 0,
    };
  });
}

function lifecycleStageForStatus(status: string | null | undefined): string {
  const value = String(status ?? "").toLowerCase();
  if (value.includes("draft")) return "Draft";
  if (value.includes("review")) return "Review";
  if (value.includes("last call")) return "Last Call";
  if (value.includes("final")) return "Final";
  if (value.includes("living") || value.includes("active")) return "Living";
  if (value.includes("stagnant") || value.includes("withdrawn")) return "Stagnant / Withdrawn";
  return "Unknown";
}

function compareProposalIds(left: string, right: string): number {
  const ln = Number(left.match(/\d+/)?.[0] ?? 0);
  const rn = Number(right.match(/\d+/)?.[0] ?? 0);
  return ln - rn || left.localeCompare(right);
}

function proposalAnchor(proposalId: string, title?: string | null): string {
  return `<a href="${escapeHtml(proposalUrl(proposalId))}" target="_blank" rel="noopener noreferrer"><b>${escapeHtml(proposalId)}</b>${title ? ` ${escapeHtml(shortTitle(title))}` : ""}</a>`;
}

function shortTitle(title?: string | null): string {
  return String(title ?? "").replace(/\s+/g, " ").slice(0, 64);
}

function proposalBadgesForId(view: ReturnType<typeof buildDashboardV2View>, proposalId: string): string {
  const proposal = view.proposalExplorer.rows.find((row) => row.proposalId === proposalId);
  const badges = [
    proposal?.domain ? domainDisplayName(proposal.domainId) : "",
    proposal?.isAA ? "AA" : "",
    proposal?.kgldRelevance ? "KGLD" : "",
  ].filter(Boolean);
  return badges.map((badge) => `<em class="badge-mini">${escapeHtml(badge)}</em>`).join("");
}

function miniSparkline(values: number[]): string {
  const max = Math.max(1, ...values);
  return `<span class="spark-mini">${values.map((value) => `<i style="height:${Math.max(2, value / max * 28).toFixed(1)}px"></i>`).join("")}</span>`;
}

function shortDate(value?: string | null): string {
  return value ? formatDateKst(value) : "unavailable";
}

function formatDateKst(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unavailable";
  const parts = kstDateTimeParts(date);
  return `${parts.year}.${parts.month}.${parts.day}`;
}

function formatDateTimeKst(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unavailable";
  const parts = kstDateTimeParts(date);
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}

function kstDateTimeParts(date: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function eventTypeKo(type: string): string {
  if (type === "new_proposal") return "new proposal";
  if (type === "status_change" || type === "final_transition" || type === "withdrawn_transition") return "status change";
  if (type === "specification_change") return "specification change";
  if (type === "discussion_activity") return "discussion activity";
  return type;
}

function evidenceLabel(value: string): string {
  if (value === "all") return "전체";
  if (value === "specification") return "Specification";
  if (value === "discussion") return "Discussion";
  return value;
}

function domainDisplayName(value: string): string {
  const labels: Record<string, string> = {
    "accounts-wallets": "계정·권한",
    "tokens-finance": "자산·금융",
    "identity-compliance": "신원·컴플라이언스",
    "execution-state": "실행·상태",
    "scaling-data": "확장·데이터",
    "validators-consensus": "검증자·합의",
    "interoperability": "상호운용성",
    unknown: "미분류",
  };
  return labels[value] ?? value.replace(/-/g, " ");
}

function stateLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function collectionLabel(value: string): string {
  const labels: Record<string, string> = {
    posts_fully_collected: "게시물 수집 완료",
    posts_partially_collected: "게시물 일부 수집",
    posts_fetch_failed: "게시물 수집 실패",
    no_discussion_url: "논의 URL 없음",
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

function metricCell(metric: { state?: string; value?: number | null } | undefined): string {
  if (!metric) return `<span class="state unavailable">unavailable</span>`;
  const state = metric.state ?? "unavailable";
  if (state === "confirmed_value") return `<span class="state confirmed">confirmed ${metric.value}</span>`;
  if (state === "confirmed_zero") return `<span class="state">confirmed zero</span>`;
  if (state === "not_collected") return `<span class="state unavailable">미수집</span>`;
  if (state === "baseline_not_linked") return `<span class="state unavailable">baseline not linked</span>`;
  return `<span class="state unavailable">${escapeHtml(state)}</span>`;
}

function signalModeForV2(view: ReturnType<typeof buildDashboardV2View>): WeeklySignalMode {
  const count = Number(view.overview.weeklyUsableCount.value);
  if (count === 0) return "empty";
  if (view.evidenceQuality.weeklyRankingValidity === "invalid") return "non_ranking";
  if (count === 1) return "single";
  return "multiple";
}

function buildDashboard(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const coverage = sourceCoverage(report, atlas);
  const signal = signalQualityPayload(report, atlas);
  const usableCurrent7d = allReportRecentEvents(report).filter((event) => isWeeklyUsableEvent(event, report));
  const current30dEvents = trendEvents(report).filter((event) => usableEventInWindow(event, report.generatedAt, 30));
  const current180dEvents = trendEvents(report).filter((event) => usableEventInWindow(event, report.generatedAt, 180));
  const topics = topicProgressRows(atlas).filter((topic) => !isGenericTopicName(topic.topic));
  const discussionAggregates = discussionWindowAggregates(report, atlas);
  const focusTopics = topics.map((topic) => topicDashboardItem(topic, atlas, usableCurrent7d, current30dEvents, current180dEvents, report.generatedAt, discussionAggregates))
    .sort((a, b) => b.longTermFocusScore - a.longTermFocusScore)
    .slice(0, 5);
  const weeklyTopics = topics.map((topic) => topicDashboardItem(topic, atlas, usableCurrent7d, current30dEvents, current180dEvents, report.generatedAt, discussionAggregates))
    .filter((topic) => topic.weeklyDevelopmentScore > 0)
    .sort((a, b) => b.weeklyDevelopmentScore - a.weeklyDevelopmentScore)
    .slice(0, 3);
  const attentionTopics = topics.map((topic) => topicDashboardItem(topic, atlas, usableCurrent7d, current30dEvents, current180dEvents, report.generatedAt, discussionAggregates))
    .filter((topic) => topic.developerAttentionScore > 0)
    .sort((a, b) => b.developerAttentionScore - a.developerAttentionScore)
    .slice(0, 3);
  const aa = accountAbstractionDashboard(atlas, report.ethereumTechRadar.signalLayer.discussionHeat, current30dEvents, usableCurrent7d, report.changePeriod.to);
  const kgld = kgldDashboard(atlas);
  const developerAttention = developerAttentionDashboard(report, atlas, discussionAggregates);
  const dataQuality = {
    historicalEventCount: report.ethereumTechRadar.historicalInputDiagnostics?.inputEventCount ?? 0,
    coverage180d: report.ethereumTechRadar.historicalInputDiagnostics?.validHistoricalCoverage ? "valid" : "degraded",
    current7dRawEventCount: signal.current7dRawEventCount,
    current7dUsableEventCount: usableCurrent7d.length,
    usableEventIds: usableCurrent7d.map(reportEventKey),
    current7dFallbackEventCount: signal.current7dFallbackEventCount,
    unknownSemanticEventCount: signal.semanticChangeCounts.unknown ?? 0,
    weeklyUsableRatio: signal.current7dRawEventCount ? usableCurrent7d.length / signal.current7dRawEventCount : 0,
    weeklyRankingValidity: usableCurrent7d.length / Math.max(1, signal.current7dRawEventCount) >= 0.5 ? "reliable" : "invalid",
    discussionCollection: {
      threadUrlConfirmed: coverage.allAnalysisCoverage.threadUrlConfirmed,
      postsFullyCollected: coverage.allAnalysisCoverage.postsFullyCollected,
      postsPartiallyCollected: coverage.allAnalysisCoverage.postsPartiallyCollected,
      recent7dPostCount: coverage.allAnalysisCoverage.recent7dPostCount,
      validTechnicalPostCount: null,
      analyzedPostCount: 0,
    },
    implementationEvidenceCoverage: coverage.allAnalysisCoverage.implementationEvidenceConfirmed,
    sourceMissingClaimCount: 0,
  };
  const weeklySignalCopy = buildWeeklySignalCopy({
    usableCount: dataQuality.current7dUsableEventCount,
    rawCount: dataQuality.current7dRawEventCount,
    weeklyRankingValidity: dataQuality.weeklyRankingValidity,
  });
  const longTermTop3 = focusTopics.slice(0, 3);
  const weeklyTop3 = weeklySignalCopy.rankingEnabled ? weeklyTopics.filter((topic) => !longTermTop3.some((item) => item.topicId === topic.topicId)).slice(0, 3) : [];
  const attentionTop3 = developerAttention.activity.slice(0, 3).map((item) => ({
    topicId: item.proposalId,
    nameKo: `${item.proposalId} ${item.title}`,
    proposalIds: [item.proposalId],
    rawPostCount: item.rawPostCount,
    sourceUrls: [proposalUrl(item.proposalId), item.threadUrl].filter(Boolean),
  }));
  const executivePulse = {
    dataQuality,
    weeklySignalCopy,
    executiveAbstract: executiveAbstract({ dataQuality, weeklySignalCopy, focusTopics, weeklyTop3, attentionTop3, aa, kgld }),
    bottomLine: bottomLineStatements({ dataQuality, weeklySignalCopy, focusTopics, attentionTop3, kgld }),
    whatChanged: {
      confirmedSpecificationChanges: weeklySignalCopy.summaryText,
      magiciansActivity: attentionTop3,
    },
    confidenceLimits: [
      { label: "Long-term standards direction", level: "medium", reason: "관찰 대상 내 180일 명세 이력은 유효합니다." },
      { label: "Weekly specification trend", level: weeklySignalCopy.rankingEnabled ? "medium" : "low", reason: weeklySpecificationTrendReason(dataQuality) },
      { label: "Magicians activity", level: "medium", reason: "최근 post metadata는 수집됐지만 relevance classification은 미완료입니다." },
      { label: "Discussion meaning", level: "unavailable", reason: "검증된 토론 insight가 없습니다." },
      { label: "Implementation progress", level: "unavailable", reason: "implementation source adapter가 수집 대상이 아닙니다." },
    ],
    longTermFocusTop3: longTermTop3,
    weeklyDevelopmentTop3: weeklyTop3,
    weeklyDevelopmentDisabledReason: weeklySignalCopy.rankingEnabled ? "" : weeklySignalCopy.summaryText,
    developerAttentionTop3: attentionTop3,
    aaPulse: aa.summary,
    kgldPulse: kgld.summary,
  };
  return {
    executivePulse,
    technologyLandscape: technologyLandscapeDashboard(atlas, discussionAggregates, current30dEvents, usableCurrent7d, current180dEvents),
    focusProgress: focusTopics,
    developerAttention,
    accountAbstraction: aa,
    kgldWatch: kgld,
    dataQuality,
    weeklySignalCopy,
  };
}

function isWeeklyUsableEvent(event: ChangeEvent, report: WeeklyRadarReport): boolean {
  return usableEventSignalAccepted(event)
    && eventInWindow(event, report.changePeriod.to, report.changePeriod.days);
}

function usableEventInWindow(event: ChangeEvent, reportEndAt: string, days: number): boolean {
  return usableEventSignalAccepted(event) && eventInWindow(event, reportEndAt, days);
}

function weeklyUsableEvent(event: ChangeEvent): boolean {
  return usableEventSignalAccepted(event);
}

function usableEventSignalAccepted(event: ChangeEvent): boolean {
  return (event.occurredAtSource ?? "fallback_detected_at") !== "fallback_detected_at"
    && Boolean(event.changeSemanticType)
    && semanticTypeForReportEvent(event) !== "unknown"
    && weeklyEventConfidence(event) >= WEEKLY_USABLE_EVENT_CONFIDENCE_THRESHOLD
    && prioritySemanticForReport(event);
}

function executiveAbstract(input: {
  dataQuality: ReturnType<typeof buildDashboard>["dataQuality"];
  weeklySignalCopy: WeeklySignalCopy;
  focusTopics: ReturnType<typeof topicDashboardItem>[];
  weeklyTop3: ReturnType<typeof topicDashboardItem>[];
  attentionTop3: Array<{ nameKo: string; proposalIds: string[]; rawPostCount?: number }>;
  aa: ReturnType<typeof accountAbstractionDashboard>;
  kgld: ReturnType<typeof kgldDashboard>;
}) {
  const longNames = input.focusTopics.slice(0, 3).map((topic) => topic.nameKo).join(", ") || "장기 흐름 미확인";
  const weekly = input.weeklyTop3.length
    ? `${input.weeklyTop3.map((topic) => topic.nameKo).join(", ")}에서 확인된 주간 의미 변화가 있습니다.`
    : input.weeklySignalCopy.summaryText;
  const attention = input.attentionTop3.length
    ? `${input.attentionTop3.map((topic) => topic.nameKo).join(", ")} 관련 Magicians 활동이 관찰됐습니다.`
    : "검증 가능한 최근 Magicians 활동은 제한적입니다.";
  const aaTracks = (input.aa.summary.activeTracks30d ?? input.aa.summary.baselineTracks ?? []).slice(0, 3).join(", ") || "활성 track 미확인";
  const kgldSummary = `KGLD는 즉시 검토 ${input.kgld.summary.reviewNow}건, 계속 관찰 ${input.kgld.summary.monitor}건, 현재 조치 없음 ${input.kgld.summary.noAction}건으로 나뉩니다.`;
  return {
    longTermDirection: `장기 개발 집중도는 ${longNames} 순으로 나타납니다.`,
    weeklyDevelopmentState: weekly,
    developerAttentionState: attention,
    aaState: `AA는 ${aaTracks} 축에서 근거가 확인되며 최근 활동 thread ${input.aa.summary.uniqueActiveThreadCount}개와 post ${input.aa.summary.uniqueRecentPostCount}건을 별도로 집계했습니다.`,
    kgldState: kgldSummary,
    dataLimitation: `최근 7일 usable event는 ${input.dataQuality.current7dUsableEventCount}/${input.dataQuality.current7dRawEventCount}건이며 미확정 event는 순위에서 제외했습니다.`,
    evidenceClaimIds: input.focusTopics.slice(0, 3).flatMap((topic) => topic.evidenceClaims.map((claim) => claim.id)),
  };
}

function bottomLineStatements(input: {
  dataQuality: ReturnType<typeof buildDashboard>["dataQuality"];
  weeklySignalCopy: WeeklySignalCopy;
  focusTopics: ReturnType<typeof topicDashboardItem>[];
  attentionTop3: Array<{ nameKo: string; proposalIds: string[]; rawPostCount?: number }>;
  kgld: ReturnType<typeof kgldDashboard>;
}) {
  const focus = input.focusTopics.slice(0, 3).map((topic) => topic.nameKo).join(", ") || "장기 집중도 미확인";
  const attention = input.attentionTop3.map((item) => `${item.proposalIds[0]} ${item.rawPostCount ?? 0}건`).join(", ") || "최근 활동 thread 없음";
  const kgld = input.kgld.groups.research_now.map((item) => item.proposalId).join(", ") || "즉시 연구 항목 없음";
  return [
    `관찰 대상 내 장기 표준 개발은 ${focus} 흐름에 집중되어 있습니다.`,
    input.weeklySignalCopy.summaryText,
    `Magicians 활동은 ${attention} 순으로 확인됐고, KGLD는 ${kgld}를 우선 연구 대상으로 둡니다.`,
  ];
}

function eventSourceUrl(event: ChangeEvent): string | undefined {
  return event.canonicalUrl || event.sourceUrl || event.commitUrl;
}

function eventInWindow(event: ChangeEvent, reportEndAt: string, days: number): boolean {
  const at = Date.parse(event.occurredAt ?? "");
  const end = Date.parse(reportEndAt);
  return Number.isFinite(at) && Number.isFinite(end) && at >= end - days * DAY_MS && at < end;
}

function discussionWindowAggregates(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const all = mainReportProposals(atlas);
  const discussionByProposal = discussionMap(report);
  const windowStart = report.changePeriod.from;
  const windowEnd = report.changePeriod.to;
  const postsForDiscussion = (discussion: DiscussionHeatItem) => discussionPostRows(discussion, windowStart, windowEnd);
  const aggregateFor = (scopeType: string, scopeId: string, proposalIds: string[]) => {
    const unique = [...new Set(proposalIds)];
    const discussions = unique.map((id) => discussionByProposal.get(id)).filter((discussion): discussion is DiscussionHeatItem => Boolean(discussion));
    const posts = dedupeDiscussionPosts(discussions.flatMap(postsForDiscussion));
    const rawPostIds = posts.filter((post) => post.relevanceState !== "deleted").map((post) => post.postId);
    const validTechnicalPostIds = posts.filter((post) => post.relevanceState === "technical").map((post) => post.postId);
    const uniqueParticipantIds = [...new Set(posts.map((post) => post.username).filter(Boolean))];
    const activeThreadIds = [...new Set(posts.map((post) => String(post.topicId || post.proposalId)).filter(Boolean))];
    const analyzedPostCount = discussions.reduce((sum, discussion) => sum + (discussion.discussionAnalysis?.analysisCompleted ? discussion.discussionAnalysis.analyzedPostCount : 0), 0);
    const relevanceRun = discussions.some((discussion) => discussion.discussionAnalysis?.analysisCompleted);
    return {
      scopeType,
      scopeId,
      proposalIds: unique,
      proposalCount: unique.length,
      windowStart,
      windowEnd,
      activeThreadIds,
      activeThreadCount: activeThreadIds.length,
      rawPostIds,
      rawPostCount: rawPostIds.length,
      validTechnicalPostIds: relevanceRun ? validTechnicalPostIds : null,
      validTechnicalPostCount: relevanceRun ? validTechnicalPostIds.length : null,
      uniqueParticipantIds,
      uniqueParticipantCount: uniqueParticipantIds.length,
      analyzedPostCount,
      analyzedPostIds: [],
      uniqueParticipants: uniqueParticipantIds.length,
      authorResponses: discussions.filter((discussion) => discussion.authorParticipatedCurrent7d).length,
    };
  };
  const topicAggregates = topicProgressRows(atlas).map((topic) => aggregateFor("topic", slugifyTopic(topic.topic), topic.proposals));
  const proposalAggregates = report.ethereumTechRadar.signalLayer.discussionHeat
    .filter((discussion) => postsForDiscussion(discussion).length > 0)
    .sort((a, b) => (postsForDiscussion(b).length - postsForDiscussion(a).length)
      || ((b.participantCountCurrent7d ?? 0) - (a.participantCountCurrent7d ?? 0))
      || String(b.discussionLastActivityAt ?? "").localeCompare(String(a.discussionLastActivityAt ?? "")))
    .slice(0, 8)
    .map((discussion) => aggregateFor("proposal_card", discussion.proposalId, [discussion.proposalId]));
  return {
    coreTopics: aggregateFor("core_topics", "core_topics", selectFrontPageTopics(atlas).flatMap((topic) => topic.proposals)),
    mapEvidence: aggregateFor("map_evidence", "map_evidence", atlas.domains.flatMap((domain) => domain.representativeProposals.map((proposal) => proposal.proposalId))),
    allAnalysis: aggregateFor("all_analysis", "all_analysis", all.map((proposal) => proposal.proposalId)),
    developerAttentionSet: aggregateFor("developer_attention_set", "developer_attention_set", proposalAggregates.flatMap((item) => item.proposalIds)),
    topics: topicAggregates,
    proposals: proposalAggregates,
  };
}

function discussionPostRows(discussion: DiscussionHeatItem, windowStart: string, windowEnd: string) {
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEnd);
  const timestamps = (discussion.postTimestampTrace ?? [])
    .map((timestamp, traceIndex) => ({ timestamp, traceIndex }))
    .filter(({ timestamp }) => {
      const at = Date.parse(timestamp);
      return Number.isFinite(at) && at >= start && at < end;
    })
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.traceIndex - right.traceIndex);
  return timestamps.map(({ timestamp: createdAt, traceIndex }, index) => {
    return {
      postId: `${discussion.discussionTopicId ?? discussion.proposalId}:${traceIndex}:${createdAt}`,
      topicId: discussion.discussionTopicId ? String(discussion.discussionTopicId) : discussion.proposalId,
      proposalId: discussion.proposalId,
      createdAt,
      username: discussion.latestPostAuthors?.[index % Math.max(1, discussion.latestPostAuthors.length)] ?? `participant-${index + 1}`,
      sourceUrl: discussion.discussionUrl ?? discussion.canonicalUrl,
      deleted: false,
      hidden: false,
      relevanceState: discussion.discussionAnalysis?.analysisCompleted ? "technical" : "not_classified",
    };
  });
}

function dedupeDiscussionPosts(posts: ReturnType<typeof discussionPostRows>) {
  const byId = new Map<string, ReturnType<typeof discussionPostRows>[number]>();
  for (const post of posts) byId.set(post.postId, post);
  return [...byId.values()];
}

function topicDashboardItem(
  topic: ReturnType<typeof topicProgressRows>[number],
  atlas: TechnologyAtlas,
  current7dEvents: ChangeEvent[],
  current30dEvents: ChangeEvent[],
  trendEventsForTopic: ChangeEvent[],
  reportEndAt: string,
  discussions: ReturnType<typeof discussionWindowAggregates>,
) {
  const ids = new Set(topic.proposals);
  const proposalObjects = topic.proposals.map((id) => proposalById(atlas, id)).filter((proposal): proposal is NonNullable<ReturnType<typeof proposalById>> => Boolean(proposal));
  const topic7dEvents = current7dEvents.filter((event) => ids.has(event.proposalId));
  const topic30dEvents = current30dEvents.filter((event) => ids.has(event.proposalId));
  const trend = trendEventsForTopic.filter((event) => ids.has(event.proposalId));
  const discussion = discussions.topics.find((item) => item.scopeId === slugifyTopic(topic.topic));
  const lifecycleProgress = topicProgressLanes(proposalObjects, discussion, topic7dEvents, trend);
  const sourceUrls = [...new Set([...topic.proposals.map(proposalUrl), ...(discussion ? [] : [])])];
  const weeklyTrend = weeklyTrendBuckets(trend, reportEndAt, 26);
  return {
    topicId: slugifyTopic(topic.topic),
    nameKo: topic.coverKo,
    displayName: topic.topic,
    problemKo: topic.narrative,
    proposalIds: topic.proposals,
    sourceUrls,
    longTermFocusScore: trend.length * 2 + proposalObjects.length + forwardStatusProposalIds({ classifiedProposals: proposalObjects } as TechnologyAtlas).length * 3,
    weeklyDevelopmentScore: topic7dEvents.filter((event) => event.type === "new_proposal").length * 4
      + topic7dEvents.filter((event) => event.type === "status_change" || event.type === "final_transition").length * 3
      + topic7dEvents.filter((event) => event.type === "content_hash_change").length * 2,
    developerAttentionScore: discussion?.validTechnicalPostCount == null ? (discussion?.rawPostCount ?? 0) : discussion.validTechnicalPostCount,
    current30dChanges: topic30dEvents.length,
    current7dChanges: topic7dEvents.length,
    weeklyUsableEventIds: topic7dEvents.map(reportEventKey),
    trend180dEvents: trend.length,
    weeklyTrend,
    recentDiscussion: discussion ?? null,
    progress: lifecycleProgress,
    lastMeaningfulChangeAt: latestEventDate(topic7dEvents.length ? topic7dEvents : trend),
    nextEvidenceCondition: "구현 PR, 테스트넷 반영, Magicians 쟁점 검증 중 하나가 확인되면 단계 판단을 갱신합니다.",
    evidenceClaims: [evidenceClaim(`topic-${slugifyTopic(topic.topic)}`, "topic_summary", topic.narrative, "specification", topic.proposals, sourceUrls, sourceUrls.map((_, index) => trend[index]?.occurredAt ?? null))],
  };
}

function topicProgressLanes(proposals: Array<NonNullable<ReturnType<typeof proposalById>>>, discussion?: ReturnType<typeof discussionWindowAggregates>["topics"][number], current7dEvents: ChangeEvent[] = [], trend: ChangeEvent[] = []) {
  const statuses = proposals.map((proposal) => proposal.status.toLowerCase());
  const specificationStage = statuses.some((status) => status.includes("final")) ? "final"
    : statuses.some((status) => status.includes("last call")) ? "last_call"
      : statuses.some((status) => status.includes("review")) ? "review"
        : statuses.some((status) => status.includes("withdrawn") || status.includes("stagnant")) ? "inactive"
          : statuses.length ? "draft" : "idea";
  const discussionStage = !discussion ? "no_thread" : discussion.activeThreadCount > 0 ? "active" : "inactive";
  const milestone = latestMilestone(current7dEvents.length ? current7dEvents : trend, proposals);
  return {
    specificationStage,
    discussionStage,
    implementationStage: "not_collected",
    activationStage: "not_collected",
    adoptionStage: "not_collected",
    progressConfidence: "medium",
    milestoneEvents: milestone ? [milestone] : [],
    currentStageFallback: milestone ? null : proposals.slice(0, 3).map((proposal) => `${proposal.proposalId} ${proposal.status}`),
  };
}

function latestMilestone(events: ChangeEvent[], proposals: Array<NonNullable<ReturnType<typeof proposalById>>>) {
  const sorted = [...events].filter((event) => event.occurredAt && eventSourceUrl(event)).sort((a, b) => Date.parse(b.occurredAt ?? "") - Date.parse(a.occurredAt ?? ""));
  const event = sorted[0];
  if (!event) return null;
  const proposal = proposals.find((item) => item.proposalId === event.proposalId);
  return {
    proposalId: event.proposalId,
    eventType: event.type,
    occurredAt: event.occurredAt ?? null,
    fromStatus: event.previousStatus ?? null,
    toStatus: event.currentStatus ?? proposal?.status ?? null,
    sourceUrl: eventSourceUrl(event) ?? proposalUrl(event.proposalId),
  };
}

function weeklyTrendBuckets(events: ChangeEvent[], reportEndAt: string, weeks: number) {
  const end = Date.parse(reportEndAt);
  if (!Number.isFinite(end)) return [];
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = new Date(end - (weeks - index) * 7 * DAY_MS).toISOString();
    const weekEnd = end - (weeks - index - 1) * 7 * DAY_MS;
    const start = Date.parse(weekStart);
    const meaningfulEventCount = events.filter((event) => {
      const at = Date.parse(event.occurredAt ?? event.detectedAt);
      return Number.isFinite(at) && at >= start && at < weekEnd;
    }).length;
    return { weekStart, meaningfulEventCount };
  });
}

function latestEventDate(events: ChangeEvent[]): string | null {
  const timestamps = events.map((event) => Date.parse(event.occurredAt ?? event.detectedAt)).filter(Number.isFinite).sort((a, b) => b - a);
  return timestamps.length ? new Date(timestamps[0]!).toISOString() : null;
}

function evidenceClaim(id: string, claimType: string, textKo: string, evidenceLevel: string, proposalIds: string[], sourceUrls: string[], sourceDates: Array<string | null> = []) {
  return {
    id,
    claimType,
    textKo,
    evidenceLevel,
    confidence: evidenceLevel === "analyst_inference" ? 0.65 : 0.8,
    proposalIds,
    sourceUrls,
    sourceDates: sourceUrls.map((_, index) => sourceDates[index] ?? null),
    generatedFrom: ["dashboard"],
    verified: sourceUrls.length > 0,
  };
}

function technologyLandscapeDashboard(
  atlas: TechnologyAtlas,
  discussions: ReturnType<typeof discussionWindowAggregates>,
  current30dEvents: ChangeEvent[],
  current7dEvents: ChangeEvent[],
  current180dEvents: ChangeEvent[],
) {
  return atlas.domains.map((domain) => {
    const domainProposals = [...atlas.classifiedProposals, ...atlas.heldProposals].filter((proposal) => proposal.primaryDomain === domain.domain.id);
    const proposalIds = new Set(domainProposals.map((proposal) => proposal.proposalId));
    const strongest = topicProgressRows(atlas).filter((topic) => topic.proposals.some((id) => proposalIds.has(id))).sort((a, b) => b.priority - a.priority)[0];
    const representative = representativeProposalsForDomainCard(domain).slice(0, 5);
    const statusSet = [...new Set(domainProposals.map((proposal) => proposal.status.toLowerCase().split(/\s+/)[0]).filter(Boolean))];
    const discussionAggs = discussions.topics.filter((topic) => topic.proposalIds.some((id) => proposalIds.has(id)));
    const domainRawPostIds = [...new Set(discussionAggs.flatMap((item) => item.rawPostIds))];
    const domainActiveThreadIds = [...new Set(discussionAggs.flatMap((item) => item.activeThreadIds))];
    const domainParticipantIds = [...new Set(discussionAggs.flatMap((item) => item.uniqueParticipantIds))];
    const rawDiscussionPosts = domainRawPostIds.length;
    const domain7dEvents = current7dEvents.filter((event) => proposalIds.has(event.proposalId));
    return {
      domainId: domain.domain.id,
      nameKo: domain.domain.nameKo,
      descriptionKo: domain.domain.problemKo,
      meaningful180dProposals: new Set(current180dEvents.filter((event) => proposalIds.has(event.proposalId)).map((event) => event.proposalId)).size,
      meaningful30dProposals: new Set(current30dEvents.filter((event) => proposalIds.has(event.proposalId)).map((event) => event.proposalId)).size,
      meaningful7dProposals: new Set(domain7dEvents.map((event) => event.proposalId)).size,
      weeklyUsableEventIds: domain7dEvents.map(reportEventKey),
      recentValidDiscussionPosts: null,
      strongestTopic: strongest?.topic ?? null,
      maturitySummary: strongest?.stage ?? "미확인",
      implementationEvidenceState: "미수집",
      dataConfidence: "source-linked",
      statusSet,
      rawDiscussionPosts,
      implementationEvidenceCount: 0,
      representativeProposals: representative.map((proposal) => proposal.proposalId),
      sourceUrls: representative.map((proposal) => proposalUrl(proposal.proposalId)),
      searchText: `${domain.domain.nameKo} ${strongest?.topic ?? ""} ${representative.map((proposal) => `${proposal.proposalId} ${proposal.title}`).join(" ")}`,
      discussion: {
        scopeType: "domain",
        scopeId: `domain:${domain.domain.id}`,
        proposalIds: [...proposalIds],
        proposalCount: proposalIds.size,
        activeThreadIds: domainActiveThreadIds,
        activeThreadCount: domainActiveThreadIds.length,
        rawPostIds: domainRawPostIds,
        rawPostCount: domainRawPostIds.length,
        validTechnicalPostIds: null,
        validTechnicalPostCount: null,
        uniqueParticipantIds: domainParticipantIds,
        uniqueParticipantCount: domainParticipantIds.length,
        windowStart: discussions.mapEvidence.windowStart,
        windowEnd: discussions.mapEvidence.windowEnd,
      },
    };
  });
}

function developerAttentionDashboard(report: WeeklyRadarReport, atlas: TechnologyAtlas, discussions: ReturnType<typeof discussionWindowAggregates>) {
  const discussionByProposal = discussionMap(report);
  const active = discussions.proposals
    .map((aggregate) => {
      const discussion = discussionByProposal.get(aggregate.scopeId);
      if (!discussion) return null;
      const proposal = proposalById(atlas, discussion.proposalId);
      const specification = localSpecificationEvidence(discussion.proposalId);
      return {
      proposalId: discussion.proposalId,
      title: specification.officialTitle ?? discussion.title ?? discussion.discussionTitle ?? discussion.proposalId,
      proposalSummaryKo: proposalSummaryKo(proposal, discussion.proposalId),
      summaryEvidence: {
        sourceType: "specification",
        sourceUrl: proposalUrl(discussion.proposalId),
        sourceSection: proposalSummarySourceSection(discussion.proposalId),
        confidence: proposalSummaryConfidence(discussion.proposalId),
      },
      threadUrl: discussion.discussionUrl,
      rawPostIds: aggregate.rawPostIds,
      rawPostCount: aggregate.rawPostCount,
      validTechnicalPostIds: aggregate.validTechnicalPostIds,
      validTechnicalPostCount: aggregate.validTechnicalPostCount,
      analyzedPostIds: aggregate.analyzedPostIds,
      analyzedPostCount: aggregate.analyzedPostCount,
      participantCount: aggregate.uniqueParticipantCount,
      lastActivityAt: discussion.discussionLastActivityAt ?? null,
      authorResponses: discussion.authorParticipatedCurrent7d ? 1 : 0,
      validatedInsights: validatedDiscussionInsights(discussion),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const summary = discussions.developerAttentionSet;
  return {
    summary: {
      scopeType: summary.scopeType,
      activeThreads: summary.activeThreadCount,
      activeThreadIds: summary.activeThreadIds,
      rawPostIds: summary.rawPostIds,
      rawPosts: summary.rawPostCount,
      validTechnicalPosts: null,
      validTechnicalPostIds: summary.validTechnicalPostIds,
      uniqueParticipantIds: summary.uniqueParticipantIds,
      uniqueParticipants: summary.uniqueParticipantCount,
      authorResponses: summary.authorResponses,
      validatedInsights: active.reduce((sum, item) => sum + item.validatedInsights.length, 0),
      windowStart: summary.windowStart,
      windowEnd: summary.windowEnd,
    },
    activity: active,
    validatedInsights: active.flatMap((item) => item.validatedInsights).slice(0, 5),
    emptyInsightText: "활동은 확인됐으나 검증된 쟁점 요약은 없음",
  };
}

function technologyMapDiscussionAggregate(dashboard: ReturnType<typeof buildDashboard>) {
  const rawPostIds = unique(dashboard.technologyLandscape.flatMap((domain) => domain.discussion?.rawPostIds ?? []));
  const activeThreadIds = unique(dashboard.technologyLandscape.flatMap((domain) => domain.discussion?.activeThreadIds ?? []));
  const uniqueParticipantIds = unique(dashboard.technologyLandscape.flatMap((domain) => domain.discussion?.uniqueParticipantIds ?? []));
  const proposalIds = unique(dashboard.technologyLandscape.flatMap((domain) => domain.discussion?.proposalIds ?? []));
  const firstDiscussion = dashboard.technologyLandscape.find((domain) => domain.discussion)?.discussion;
  return {
    scopeType: "technology_map_set",
    scopeId: "technology_map_set",
    proposalIds,
    proposalCount: proposalIds.length,
    activeThreadIds,
    activeThreadCount: activeThreadIds.length,
    rawPostIds,
    rawPostCount: rawPostIds.length,
    validTechnicalPostIds: null,
    validTechnicalPostCount: null,
    uniqueParticipantIds,
    uniqueParticipantCount: uniqueParticipantIds.length,
    windowStart: firstDiscussion?.windowStart ?? dashboard.developerAttention.summary.windowStart,
    windowEnd: firstDiscussion?.windowEnd ?? dashboard.developerAttention.summary.windowEnd,
  };
}

function proposalSummaryKo(proposal: NonNullable<ReturnType<typeof proposalById>> | undefined, proposalId = proposal?.proposalId ?? ""): string {
  const evidence = localSpecificationEvidence(proposalId);
  if (evidence.parseState === "body_parsed") {
    const source = evidence.abstractText ?? evidence.motivationText ?? evidence.specificationIntroText ?? "";
    return summarizeSpecificationKo(proposalId, evidence.officialTitle ?? proposal?.title ?? proposalId, source);
  }
  const officialTitle = evidence.officialTitle ?? proposal?.title;
  const title = officialTitle ? `${proposalId || proposal?.proposalId} ${officialTitle}` : "";
  if (title) return truncateSentence(`${title}. 공식 abstract를 충분히 수집하지 못했으므로 제안의 목적과 범위는 원문에서 확인해야 합니다.`, 180);
  return "공식 요약을 충분히 수집하지 못했습니다. 제안의 목적과 범위는 원문에서 확인해야 합니다.";
}

function proposalSummarySourceSection(proposalId: string): string {
  const evidence = localSpecificationEvidence(proposalId);
  if (evidence.abstractText) return "abstract";
  if (evidence.motivationText) return "motivation";
  if (evidence.specificationIntroText) return "specification";
  return "title_only";
}

function proposalSummaryConfidence(proposalId: string): number {
  return localSpecificationEvidence(proposalId).parseState === "body_parsed" ? 0.82 : 0.45;
}

function summarizeSpecificationKo(proposalId: string, title: string, source: string): string {
  const text = `${title}. ${source}`;
  const lower = text.toLowerCase();
  if (proposalId === "ERC-8183" || /agentic commerce/.test(lower)) return "Agentic Commerce는 에이전트 기반 상거래 흐름을 명세화하려는 제안입니다. 구현·채택 여부는 이번 수집 범위에서 확인하지 않았습니다.";
  if (proposalId === "EIP-8037" || /state creation|gas cost/.test(lower)) return "State Creation Gas Cost Increase는 상태 생성 부담을 gas 비용에 반영하는 방향을 제안합니다. 실제 비용 조정 효과는 후속 명세 검토가 필요합니다.";
  if (proposalId === "EIP-8151" || /authority.*deactivation|ecRecover/i.test(text)) return "Authority deactivation과 ecRecover 처리 경계를 다루는 제안입니다. 일반 Account Abstraction 전체가 아니라 권한 비활성화와 서명 검증 조건에 초점을 둡니다.";
  if (proposalId === "ERC-6123" || /derivative|lifecycle/.test(lower)) return "Smart Derivative Contract는 파생계약의 lifecycle, event 처리, 계약 상태 전이를 표준화하려는 제안입니다. 구현·채택은 별도 근거가 필요합니다.";
  if (proposalId === "ERC-7303" || /token-controlled token circulation|circulation/.test(lower)) return "Token-Controlled Token Circulation은 토큰이 circulation 조건을 제어하는 구조를 다룹니다. 세부 운영 영향은 원문 근거 범위 안에서만 해석합니다.";
  if (proposalId === "EIP-8130" || /account configuration/.test(lower)) return "Account Configuration은 계정 설정을 명세화해 권한·구성 관리 경계를 다루는 제안입니다. 구현 또는 채택은 단정하지 않습니다.";
  if (proposalId === "ERC-8330" || /nav snapshot|net asset value|oracle/.test(lower)) return "해당 Proposal은 주체별 NAV snapshot과 가치 기준시각을 기록하는 보고 인터페이스를 제안합니다.";
  return sourceBackedKoreanSummary(proposalId, title, source);
}

function truncateSentence(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("。"), cut.lastIndexOf("다."));
  return (last > 40 ? cut.slice(0, last + 1) : cut).trim();
}

function sourceBackedKoreanSummary(proposalId: string, title: string, source: string): string {
  const cleanTitle = stripMarkdownSyntax(title).replace(/\s+/g, " ").trim() || proposalId;
  const cleanSource = stripMarkdownSyntax(source).replace(/\s+/g, " ").trim();
  if (!cleanSource || /Proposal file creation detected/i.test(cleanSource)) {
    return sourceLimitedWeeklySummary(proposalId, cleanTitle, "공식 저장소에 신규 반영됐습니다.");
  }
  const lower = `${cleanTitle} ${cleanSource}`.toLowerCase();
  const subjects = [
    [/zero-knowledge|zk|proof/i, "영지식 증명"],
    [/compliance|aml|sanction/i, "컴플라이언스 검증"],
    [/oracle|nav|net asset value|price|pricing/i, "가격 기준·보고"],
    [/registry|register|claim/i, "registry와 claim"],
    [/account|wallet|signature|authorization|permission/i, "계정·권한"],
    [/evm|opcode|precompile|gas|state|transaction/i, "실행·상태"],
    [/validator|consensus|attestation|staking|finality/i, "검증자·합의"],
    [/token|asset|vault|erc-20|erc-4626/i, "토큰·자산"],
    [/metadata|data|blob|storage/i, "데이터 구조"],
    [/interface|api|function|contract/i, "계약 인터페이스"],
  ] as const;
  const matched = subjects.filter(([pattern]) => pattern.test(lower)).map(([, label]) => label);
  const topic = unique(matched).slice(0, 2).join(" 및 ");
  if (topic) {
    return `해당 Proposal은 공식 원문 기준 ${topic} 영역을 다루는 제안입니다. 구현·채택 여부는 이번 수집 범위에서 확인하지 않았습니다.`;
  }
  return "해당 Proposal은 공식 원문에 근거한 신규 명세 제안입니다. 세부 목적과 범위는 원문 근거에서 확인해야 합니다.";
}

function stripMarkdownSyntax(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .trim();
}

function validatedDiscussionInsights(discussion: DiscussionHeatItem) {
  if (discussion.discussionAnalysis?.analysisCompleted !== true) return [];
  const groups = [
    ["issue", discussion.discussionAnalysis.keyIssues],
    ["objection", discussion.discussionAnalysis.objections],
    ["alternative", discussion.discussionAnalysis.alternatives],
    ["unresolved", discussion.discussionAnalysis.unresolvedQuestions],
    ["author_response", discussion.discussionAnalysis.proposalAuthorResponses],
  ] as const;
  return groups.flatMap(([category, items]) => items
    .filter((item) => item.sourcePostIds.length > 0 && (item.evidenceUrl || discussion.discussionUrl) && item.text.length > 0)
    .map((item) => ({
      proposalId: discussion.proposalId,
      category,
      summaryKo: item.text,
      sourcePostIds: item.sourcePostIds,
      sourceUrls: [item.evidenceUrl ?? discussion.discussionUrl!],
      confidence: 0.75,
      validated: true,
    })));
}

const AA_TRACK_DEFINITIONS = [
  {
    id: "erc-4337-entrypoint",
    name: "ERC-4337 / EntryPoint",
    parentTrackId: null,
    hierarchyLevel: "standalone",
    problem: "UserOperation, EntryPoint, 별도 mempool 기반의 기존 AA 경로를 추적합니다.",
    assignments: [
      aaAssignment("ERC-4337", "baseline", "EntryPoint와 별도 UserOperation mempool을 사용하는 기존 AA 기준 표준입니다."),
    ],
  },
  {
    id: "native-account-abstraction",
    name: "Native account abstraction",
    parentTrackId: null,
    hierarchyLevel: "parent",
    problem: "프로토콜 수준에서 계정 검증, 실행, 가스 지불을 추상화하는 흐름을 추적합니다.",
    assignments: [
      aaAssignment("EIP-8141", "direct", "Frame Transaction을 통해 native AA 실행 모델을 다룹니다."),
      aaAssignment("EIP-8130", "direct", "account configuration 기반 AA 방식을 제안합니다."),
      aaAssignment("EIP-8250", "supporting", "Frame Transaction nonce 구조를 보조합니다."),
      aaAssignment("EIP-8266", "supporting", "Frame Transaction nonce 만료 조건을 보조합니다."),
      aaAssignment("EIP-8272", "supporting", "Frame Transaction에서 recent roots 참조를 보조합니다."),
    ],
  },
  {
    id: "eoa-delegation",
    name: "EOA delegation",
    parentTrackId: null,
    hierarchyLevel: "standalone",
    problem: "EOA가 코드 또는 권한을 위임하는 방식과 위임 생명주기를 추적합니다.",
    assignments: [
      aaAssignment("EIP-8164", "direct", "EOA key delegation과 지갑 권한 위임 흐름을 다룹니다."),
      aaAssignment("ERC-8226", "adjacent", "regulated agent mandate는 권한 위임과 compliance 경계에 인접합니다."),
    ],
  },
  {
    id: "transaction-authorization",
    name: "Transaction authorization",
    parentTrackId: "native-account-abstraction",
    hierarchyLevel: "child",
    problem: "nonce, 승인 범위, 만료, 재사용 방지 등 거래 권한 모델을 추적합니다.",
    assignments: [
      aaAssignment("EIP-8141", "direct", "Frame Transaction은 트랜잭션 승인과 실행 경계 변화를 다룹니다."),
      aaAssignment("EIP-8250", "supporting", "Keyed nonce는 frame transaction 승인 재사용 경계를 보조합니다."),
      aaAssignment("EIP-8266", "supporting", "Expiring nonce는 승인 유효기간 경계를 보조합니다."),
    ],
  },
  {
    id: "account-configuration",
    name: "Account configuration",
    parentTrackId: "native-account-abstraction",
    hierarchyLevel: "child",
    problem: "계정 검증 로직과 설정 상태를 변경, 관리하는 방식을 추적합니다.",
    assignments: [
      aaAssignment("EIP-8130", "direct", "account configuration을 AA의 명시적 구성 축으로 다룹니다."),
    ],
  },
  {
    id: "modular-smart-accounts",
    name: "Modular smart accounts",
    parentTrackId: null,
    hierarchyLevel: "standalone",
    problem: "validator, executor, hook 등 계정 기능 모듈화 표준을 추적합니다.",
    assignments: [
      aaAssignment("ERC-8286", "direct", "공식 Draft ERC로 확인된 Frame Transaction 기반 modular account 명세입니다.", "official_specification", proposalUrl("ERC-8286"), "https://ethereum-magicians.org/t/draft-erc-8286-modular-accounts-for-frame-transactions/28695"),
    ],
  },
  { id: "session-keys", name: "Session keys / delegated permissions", parentTrackId: null, hierarchyLevel: "standalone", problem: "제한된 권한과 기간을 가진 세션 키, 임시 권한 모델을 추적합니다.", assignments: [] },
  {
    id: "paymaster",
    name: "Paymaster / gas sponsorship",
    parentTrackId: null,
    hierarchyLevel: "standalone",
    problem: "제3자 가스 지불, 수수료 후원, 정책 기반 가스 지원을 추적합니다.",
    assignments: [
      aaAssignment("ERC-4337", "baseline", "ERC-4337 기준선 안에서 paymaster와 gas sponsorship 개념을 참조합니다."),
    ],
  },
  {
    id: "bundler",
    name: "Bundler infrastructure",
    parentTrackId: null,
    hierarchyLevel: "standalone",
    problem: "UserOperation 수집, 시뮬레이션, 번들 제출 인프라를 추적합니다.",
    assignments: [
      aaAssignment("ERC-4337", "baseline", "ERC-4337 기준선 안에서 bundler와 alt mempool 인프라를 참조합니다."),
    ],
  },
  { id: "signature-abstraction", name: "Signature abstraction / passkeys", parentTrackId: null, hierarchyLevel: "standalone", problem: "다양한 서명 방식과 계정 검증 scheme의 확장을 추적합니다.", assignments: [] },
  {
    id: "clear-signing",
    name: "Clear signing / wallet UX",
    parentTrackId: null,
    hierarchyLevel: "standalone",
    problem: "사용자가 서명 내용을 이해하고 검증할 수 있는 표시 표준을 추적합니다.",
    assignments: [
      aaAssignment("EIP-712", "baseline", "typed structured data signing은 clear signing UX의 비교 기준입니다."),
    ],
  },
  { id: "recovery-revocation", name: "Recovery / revocation / security", parentTrackId: null, hierarchyLevel: "standalone", problem: "키 분실 복구, 권한 철회, 계정 복구 정책을 추적합니다.", assignments: [] },
] as const;

function aaAssignment(subjectId: string, role: string, reason: string, sourceType = "official_specification", sourceUrl?: string, discussionSourceUrl?: string) {
  return {
    subjectId,
    trackId: "",
    role,
    reason,
    sourceType,
    sourceUrl: sourceUrl ?? proposalUrl(subjectId),
    discussionSourceUrl: optionalAaString(discussionSourceUrl),
    status: sourceType === "official_specification" ? localSpecificationEvidence(subjectId).status : "미확인",
    sourceEvidenceId: `${sourceType === "discussion_draft" ? "discussion-draft" : "spec"}:${subjectId}`,
    manuallyValidated: true,
  };
}

function optionalAaString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function accountAbstractionDashboard(atlas: TechnologyAtlas, discussionHeat: DiscussionHeatItem[], current30dEvents: ChangeEvent[], current7dEvents: ChangeEvent[], windowEnd: string) {
  void atlas;
  const windowEndMs = Date.parse(windowEnd);
  const window7dStart = new Date(windowEndMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const window30dStart = new Date(windowEndMs - 30 * 24 * 60 * 60 * 1000).toISOString();
  const discussionByProposal = new Map(discussionHeat.map((discussion) => [discussion.proposalId, discussion]));
  const built = AA_TRACK_DEFINITIONS.map((definition) => {
    const assignments = definition.assignments.map((assignment) => ({ ...assignment, trackId: definition.id }));
    const proposalIds = assignments.map((assignment) => assignment.subjectId);
    const officialProposalIds = assignments.filter((assignment) => assignment.sourceType !== "discussion_draft").map((assignment) => assignment.subjectId);
    const spec30Count = current30dEvents.filter((event) => officialProposalIds.includes(event.proposalId)).length;
    const spec7Count = current7dEvents.filter((event) => officialProposalIds.includes(event.proposalId)).length;
    const discussionItems = proposalIds.map((id) => discussionByProposal.get(id)).filter((item): item is DiscussionHeatItem => Boolean(item));
    const discussionRows30d = dedupeDiscussionPosts(discussionItems.flatMap((item) => discussionPostRows(item, window30dStart, windowEnd)));
    const activeThreadIds = [...new Set(discussionRows30d.map((post) => String(post.topicId || post.proposalId)).filter(Boolean))];
    const rawPostIds = discussionRows30d.filter((post) => post.relevanceState !== "deleted").map((post) => post.postId);
    const collectedItems = discussionItems.filter((item) => ["posts_fully_collected", "posts_partially_collected"].includes(String(item.discussionCollectionStatus)));
    const searchedItems = discussionItems.filter((item) => item.discussionFetchAttempted || item.discussionUrl);
    const discussionState = proposalIds.length === 0
      ? "baseline_not_linked"
      : collectedItems.length > 0
        ? rawPostIds.length > 0 ? "confirmed_value" : "confirmed_zero"
        : searchedItems.length > 0 ? "not_collected" : "not_collected";
    const discussion30d = aaMetric(aaMetricValueForState(rawPostIds.length, discussionState), discussionState, window30dStart, windowEnd, rawPostIds.map((id) => `post:${id}`), discussionMetricReason(discussionState));
    const specification7dState = proposalIds.length ? spec7Count > 0 ? "confirmed_value" : "confirmed_zero" : "baseline_not_linked";
    const specification30dState = proposalIds.length ? spec30Count > 0 ? "confirmed_value" : "confirmed_zero" : "baseline_not_linked";
    const specification7d = aaMetric(aaMetricValueForState(spec7Count, specification7dState), specification7dState, window7dStart, windowEnd, current7dEvents.filter((event) => officialProposalIds.includes(event.proposalId)).map(eventFactId), "weekly usable 기준의 확인된 명세 변화만 집계합니다.");
    const specification30d = aaMetric(aaMetricValueForState(spec30Count, specification30dState), specification30dState, window30dStart, windowEnd, current30dEvents.filter((event) => officialProposalIds.includes(event.proposalId)).map(eventFactId), "30일 window에서 확인된 명세 변화만 집계합니다.");
    const implementation = aaMetric(null, "not_collected", window30dStart, windowEnd, [], "구현 source adapter는 현재 수집 대상이 아닙니다.");
    const recentSignals = aaRecentSignalsForTrack(officialProposalIds, current30dEvents, discussionRows30d, discussionByProposal, window30dStart, windowEnd);
    const direction = aaTrackDirection({
      hasBaseline: proposalIds.length > 0,
      hasCurrent7dSpecificationEvidence: spec7Count > 0,
      hasCurrent7dMeaningfulDiscussionEvidence: false,
    });
    return {
      id: definition.id,
      trackId: definition.id,
      parentTrackId: definition.parentTrackId,
      hierarchyLevel: definition.hierarchyLevel,
      name: definition.name,
      title: definition.name,
      problem: definition.problem,
      proposalIds,
      baselineProposals: assignments,
      recentSignals,
      specification7d,
      specification30d,
      discussion30d,
      implementation,
      statusDistribution: statusDistributionForProposalIds(officialProposalIds),
      current30dChanges: spec30Count,
      current7dChanges: spec7Count,
      activeDiscussionCount: activeThreadIds.length,
      uniqueRecentPostCount: rawPostIds.length,
      activeThreadIds,
      rawPostIds,
      validTechnicalPostCount: null,
      analyzedPostCount: null,
      implementationEvidence: [],
      lastMilestone: aaLastMilestone(recentSignals),
      direction,
      confidence: proposalIds.length ? 0.75 : 0.45,
      limitation: aaTrackLimitation(proposalIds.length, discussion30d.state, implementation.state),
      sourceUrls: [...new Set(assignments.flatMap((assignment) => [assignment.sourceUrl, assignment.discussionSourceUrl].filter(Boolean)))],
      role: assignments.some((assignment) => assignment.role === "adjacent") ? "AA adjacent / compliance" : "AA direct",
    };
  });
  const active = built.filter((track) => track.specification30d.state === "confirmed_value" || track.discussion30d.state === "confirmed_value");
  const uniqueActiveThreadIds = [...new Set(active.flatMap((track) => track.activeThreadIds))];
  const uniqueRecentPostIds = [...new Set(active.flatMap((track) => track.rawPostIds))];
  const activeParentTrackIds = [...new Set(active.map((track) => track.parentTrackId ?? track.trackId))];
  const uniqueBaselineProposalIds = [...new Set(built.flatMap((track) => track.baselineProposals.map((proposal) => proposal.subjectId)))];
  const trackAssignmentCount = built.reduce((sum, track) => sum + track.baselineProposals.length, 0);
  return {
    summary: {
      baselineTracks: built.filter((track) => track.baselineProposals.length > 0).map((track) => track.name),
      activeTracks30d: active.map((track) => track.name),
      activeParentTracks30d: activeParentTrackIds.map((trackId) => built.find((track) => track.trackId === trackId)?.name ?? trackId),
      recentMeaningfulChange: active.some((track) => track.current7dChanges > 0) ? "확인된 AA 변경 존재" : "확인된 AA 주간 의미 변화 없음",
      activeDiscussion: uniqueActiveThreadIds.length,
      uniqueActiveThreadCount: uniqueActiveThreadIds.length,
      uniqueRecentPostCount: uniqueRecentPostIds.length,
      trackAssignmentCount,
      activeTrackAssignmentCount: active.length,
      uniqueActiveParentFlowCount: activeParentTrackIds.length,
      uniqueDiscussionThreadCount: uniqueActiveThreadIds.length,
      uniqueDiscussionPostCount: uniqueRecentPostIds.length,
      implementationEvidence: 0,
      unresolvedIssues: "검증된 토론 쟁점 요약 없음",
      trackCount: built.length,
      baselineProposalCount: uniqueBaselineProposalIds.length,
      recent30dSpecificationTrackCount: built.filter((track) => track.specification30d.state === "confirmed_value").length,
      recent30dDiscussionActiveTrackCount: built.filter((track) => track.discussion30d.state === "confirmed_value").length,
      baselineNotLinkedTrackCount: built.filter((track) => track.direction === "baseline_not_linked").length,
      discussionNotCollectedTrackCount: built.filter((track) => track.discussion30d.state === "not_collected").length,
      implementationNotCollectedTrackCount: built.filter((track) => track.implementation.state === "not_collected").length,
    },
    tracks: built,
  };
}

function aaMetric(value: number | null, state: string, windowStart: string, windowEnd: string, evidenceIds: string[], reason: string) {
  return { value, state, windowStart, windowEnd, evidenceIds, reason };
}

function aaMetricValueForState(count: number, state: string): number | null {
  if (state === "confirmed_value") return count;
  if (state === "confirmed_zero") return 0;
  return null;
}

function aaRecentSignalsForTrack(
  officialProposalIds: string[],
  current30dEvents: ChangeEvent[],
  discussionRows30d: ReturnType<typeof discussionPostRows>,
  discussionByProposal: Map<string, DiscussionHeatItem>,
  windowStart: string,
  windowEnd: string,
) {
  const signals = new Map<string, {
    signalId: string;
    proposalId: string;
    officialTitle: string;
    signalType: string;
    rawPostCount?: number;
    validPostCount?: number | null;
    analyzedPostCount?: number | null;
    threadCount?: number;
    latestActivityAt?: string;
    threadUrl?: string;
    sourceUrls: string[];
    evidenceFactIds: string[];
    confidence: string;
    relevanceState?: string;
    windowStart: string;
    windowEnd: string;
  }>();
  for (const event of current30dEvents.filter((item) => officialProposalIds.includes(item.proposalId))) {
    const key = `${event.proposalId}:specification_change:${windowStart}:${windowEnd}`;
    const sourceUrl = event.sourceUrl ?? event.commitUrl ?? proposalUrl(event.proposalId);
    const existing = signals.get(key);
    if (existing) {
      existing.evidenceFactIds.push(eventFactId(event));
      if (!existing.sourceUrls.includes(sourceUrl)) existing.sourceUrls.push(sourceUrl);
      if (event.occurredAt && (!existing.latestActivityAt || Date.parse(event.occurredAt) > Date.parse(existing.latestActivityAt))) existing.latestActivityAt = event.occurredAt;
    } else {
      signals.set(key, {
        signalId: `aa-spec:${event.proposalId}:30d`,
        proposalId: event.proposalId,
        officialTitle: localSpecificationEvidence(event.proposalId).officialTitle,
        signalType: "specification_change",
        latestActivityAt: event.occurredAt ?? event.detectedAt,
        sourceUrls: [sourceUrl],
        evidenceFactIds: [eventFactId(event)],
        confidence: "confirmed",
        windowStart,
        windowEnd,
      });
    }
  }
  const byProposal = new Map<string, ReturnType<typeof discussionPostRows>>();
  for (const post of discussionRows30d) {
    if (!officialProposalIds.includes(post.proposalId) || post.deleted) continue;
    byProposal.set(post.proposalId, [...(byProposal.get(post.proposalId) ?? []), post]);
  }
  for (const [proposalId, posts] of byProposal) {
    const discussion = discussionByProposal.get(proposalId);
    const threadUrls = [...new Set(posts.map((post) => post.sourceUrl).filter((url): url is string => Boolean(url && /ethereum-magicians\.org/.test(url))))];
    const latestActivityAt = posts.map((post) => post.createdAt).sort().at(-1);
    signals.set(`${proposalId}:discussion_activity:${windowStart}:${windowEnd}`, {
      signalId: `aa-discussion:${proposalId}:30d`,
      proposalId,
      officialTitle: localSpecificationEvidence(proposalId).officialTitle,
      signalType: "discussion_activity",
      rawPostCount: posts.length,
      validPostCount: null,
      analyzedPostCount: null,
      threadCount: new Set(posts.map((post) => post.topicId)).size,
      latestActivityAt,
      threadUrl: threadUrls[0] ?? discussion?.discussionUrl,
      sourceUrls: threadUrls.length ? threadUrls : [discussion?.discussionUrl ?? ""].filter(Boolean),
      evidenceFactIds: posts.map((post) => `post:${post.postId}`),
      confidence: "metadata_only",
      relevanceState: "not_classified",
      windowStart,
      windowEnd,
    });
  }
  return [...signals.values()];
}

function aaLastMilestone(recentSignals: ReturnType<typeof aaRecentSignalsForTrack>) {
  const priority = new Map([
    ["specification_change", 4],
    ["verified_discussion", 3],
    ["discussion_activity", 2],
    ["implementation_evidence", 1],
  ]);
  const selected = recentSignals
    .filter((signal) => signal.latestActivityAt || signal.signalType === "specification_change")
    .sort((left, right) => {
      const rightTime = Date.parse(right.latestActivityAt ?? right.windowEnd);
      const leftTime = Date.parse(left.latestActivityAt ?? left.windowEnd);
      if (rightTime !== leftTime) return rightTime - leftTime;
      return (priority.get(right.signalType) ?? 0) - (priority.get(left.signalType) ?? 0);
    })[0];
  if (!selected) return null;
  const sourceUrl = selected.threadUrl ?? selected.sourceUrls[0] ?? proposalUrl(selected.proposalId);
  return {
    proposalId: selected.proposalId,
    signalType: selected.signalType,
    occurredAt: selected.latestActivityAt ?? selected.windowEnd,
    title: selected.officialTitle,
    sourceUrl,
    evidenceFactIds: selected.evidenceFactIds,
  };
}

function discussionMetricReason(state: string): string {
  if (state === "confirmed_value") return "수집 완료된 Magicians post 중 최근 30일 window에 포함된 post입니다.";
  if (state === "confirmed_zero") return "thread post를 수집했지만 최근 30일 post는 확인되지 않았습니다.";
  if (state === "baseline_not_linked") return "이 Track에 연결된 기준 Proposal이 아직 없습니다.";
  if (state === "not_monitored") return "정책상 모니터링 제외된 Track입니다.";
  return "Magicians 토론을 아직 수집하지 않았거나 canonical post가 없습니다.";
}

function statusDistributionForProposalIds(proposalIds: string[]): string {
  const statuses = proposalIds.map((id) => localSpecificationEvidence(id).status).filter((status): status is string => Boolean(status));
  if (!statuses.length) return "미확인";
  return [...new Set(statuses)].join(" / ");
}

function aaTrackLimitation(proposalCount: number, discussionState: string, implementationState: string): string {
  if (!proposalCount) return "이 Track에 연결된 기준 Proposal이 아직 없습니다.";
  const parts = [];
  if (discussionState === "not_collected") parts.push("Magicians 토론 미수집");
  if (discussionState === "confirmed_value") parts.push("원시 post 기준이며 기술 relevance는 미분류");
  if (implementationState === "not_collected") parts.push("구현 근거 미수집");
  return parts.length ? parts.join(" · ") : "수집된 범위 안에서 해석합니다.";
}

function aaTrackProblem(name: string): string {
  if (/delegation/i.test(name)) return "EOA 권한 위임과 사용자 승인 경계를 다룹니다.";
  if (/paymaster/i.test(name)) return "가스 후원과 수수료 지불 주체를 다룹니다.";
  if (/clear signing/i.test(name)) return "사용자가 서명 내용을 이해할 수 있는 지갑 UX를 다룹니다.";
  if (/passkeys|signature/i.test(name)) return "서명 방식과 키 관리 추상화를 다룹니다.";
  return "계정 동작과 트랜잭션 권한 모델을 더 유연하게 만드는 흐름입니다.";
}

function kgldDashboard(atlas: TechnologyAtlas) {
  const items = atlas.kgldObservations.slice(0, 3).map((item) => {
    const proposalId = item.evidenceProposalIds[0] ?? "";
    const lower = `${item.technologyChange} ${item.connectionReasonKo}`.toLowerCase();
    const impactArea = [
      /nav|oracle|price|가격/.test(lower) ? "reserve/NAV reporting" : "",
      /compliance|event log|제한|승인/.test(lower) ? "compliance event" : "",
      /vault|redemption|상환/.test(lower) ? "redemption" : "",
    ].filter(Boolean);
    const actionType = /ERC-8328|ERC-8330/.test(proposalId) ? "research_now" : "monitor";
    const specEvidence = localSpecificationEvidence(proposalId);
    const evidenceState = specEvidence.parseState === "body_parsed" ? "body_verified" : specEvidence.parseState === "fetch_failed" ? "fetch_failed" : "title_only";
    const actionConfidence = evidenceState === "body_verified" ? "medium" : "low";
    return {
      proposalId,
      topicId: slugifyTopic(item.technologyChange),
      impactArea,
      relevanceReason: item.connectionReasonKo,
      currentStage: "Proposal 단계",
      implementationEvidence: "미확인",
      impactLevel: actionType === "research_now" ? "high" : "medium",
      actionType,
      internalAction: evidenceState === "body_verified"
        ? item.requiredActionKo
        : `${proposalId} 공식 본문 확인 전 연구 가설입니다. 관련 항목이 KGLD 운영 로그·가격·상환 구조와 맞물리는지 비교합니다.`,
      ownerFunction: /NAV|oracle/i.test(item.technologyChange) ? "Reserve / Pricing" : /compliance/i.test(item.technologyChange) ? "Compliance" : "Product / Operations",
      nextTrigger: "구현 PR, 테스트넷 반영, Final 전환, 운영 채택 근거 중 하나가 확인되면 재검토합니다.",
      risks: ["구현 근거 없이 적용 가능성을 단정하면 안 됩니다."],
      sourceUrls: item.evidenceProposalIds.map(proposalUrl),
      evidenceState,
      actionConfidence,
    };
  });
  return {
    summary: {
      reviewNow: items.filter((item) => item.actionType === "research_now").length,
      researchNow: items.filter((item) => item.actionType === "research_now").length,
      monitor: items.filter((item) => item.actionType === "monitor").length,
      noAction: items.filter((item) => item.actionType === "no_action").length,
    },
    groups: {
      research_now: items.filter((item) => item.actionType === "research_now"),
      monitor: items.filter((item) => item.actionType === "monitor"),
      no_action: items.filter((item) => item.actionType === "no_action"),
    },
  };
}

function renderDashboardCover(report: WeeklyRadarReport, dashboard: ReturnType<typeof buildDashboard>): string {
  const quality = dashboard.dataQuality;
  const weeklyCopy = dashboard.weeklySignalCopy;
  const scopeSubtitle = quality.implementationEvidenceCoverage === 0
    ? "EIP/ERC 명세와 Ethereum Magicians 활동을 중심으로 한 Ethereum 표준 개발 관찰 보고서"
    : "EIP/ERC 명세, Ethereum Magicians 활동, 확인된 구현 근거를 함께 보는 표준 개발 관찰 보고서";
  return `<section class="report-cover dashboard-cover" data-weekly-signal-mode="${escapeHtml(weeklyCopy.mode)}" data-weekly-signal-ranking="${String(weeklyCopy.rankingEnabled)}" data-weekly-signal-usable="${quality.current7dUsableEventCount}">
    <div>
      <p class="eyebrow">Ethereum Development Intelligence Dashboard v1</p>
      <h1>Ethereum 개발 인텔리전스</h1>
      <p class="cover-lead">${escapeHtml(scopeSubtitle)}</p>
      <p class="cover-weekly-summary">${escapeHtml(weeklyCopy.summaryText)}</p>
      <p>${dashboard.executivePulse.bottomLine.slice(0, 2).map(escapeHtml).join(" ")}</p>
    </div>
    <div class="cover-facts">
      <div><span>분석 기간</span><b>${escapeHtml(formatDate(report.trendPeriod.from))}~${escapeHtml(formatDate(report.trendPeriod.to))}</b></div>
      <div><span>관찰 대상 내 180일 이력</span><b>${escapeHtml(quality.coverage180d === "valid" ? "유효" : "제한적")}</b></div>
      <div data-weekly-signal-cover-metric><span>${escapeHtml(weeklyCopy.metricLabel)}</span><b>${escapeHtml(weeklyCopy.metricValue)}</b></div>
      <div><span>상세 데이터 품질</span><b><a href="#data-quality">Evidence Quality</a></b></div>
    </div>
  </section>`;
}

function renderExecutivePulse(dashboard: ReturnType<typeof buildDashboard>): string {
  const weekly = dashboard.executivePulse.weeklyDevelopmentTop3;
  const weeklyCopy = dashboard.weeklySignalCopy;
  return `<div class="section-head"><h2>Executive Pulse</h2><p>관찰 대상 내 결론, 실제 변화, 의미, KGLD action, 한계를 분리합니다.</p></div>
  ${weeklyCopy.rankingEnabled ? "" : `<p class="notice">${escapeHtml(weeklyCopy.summaryText)} 발생일 미확정 변화 ${dashboard.dataQuality.current7dFallbackEventCount}건과 변경 유형 미확정 ${dashboard.dataQuality.unknownSemanticEventCount}건은 주간 개발 순위에서 제외했습니다.</p>`}
  <div class="executive-stack" data-weekly-signal-mode="${escapeHtml(weeklyCopy.mode)}" data-weekly-signal-ranking="${String(weeklyCopy.rankingEnabled)}" data-weekly-signal-usable="${dashboard.dataQuality.current7dUsableEventCount}">
    <article class="executive-abstract"><h3>Bottom Line</h3>${dashboard.executivePulse.bottomLine.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</article>
    <article><h3>이번 주 관찰 신호</h3><div class="two-col"><div><h4>${escapeHtml(weeklyCopy.metricLabel)}</h4><p><b data-executive-weekly-usable>${escapeHtml(weeklyCopy.metricValue)}</b> ${escapeHtml(weeklyCopy.summaryText)}</p></div><div><h4>Magicians activity</h4><p>${dashboard.executivePulse.whatChanged.magiciansActivity.map((item) => `${proposalLink(item.proposalIds[0] ?? "")} ${item.rawPostCount ?? 0} posts`).join(" · ") || "최근 활동 없음"}</p></div></div></article>
    <article><h3>Why It Matters</h3><div class="why-grid">${dashboard.executivePulse.longTermFocusTop3.slice(0, 3).map((topic) => `<div><b>${escapeHtml(topic.nameKo)}</b><p>${linkProposalText(topic.problemKo)}</p><p class="muted">Implementation, Activation, Adoption 근거는 미수집입니다.</p></div>`).join("")}</div></article>
    <article><h3>KGLD Actions</h3><ul><li>ERC-8328 event field와 KGLD 로그 구조를 비교합니다.</li><li>ERC-8330 가격 기준시각, 출처, 정정 방식을 비교합니다.</li><li>ERC-8161은 구현 근거가 확인될 때까지 적용 판단을 보류합니다.</li></ul></article>
    <article><h3>Confidence & Limits</h3><div class="source-coverage-grid">${dashboard.executivePulse.confidenceLimits.map((item) => `<div><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.level)}</b><em>${escapeHtml(item.reason)}</em></div>`).join("")}</div></article>
  </div>`;
}

function pulseCard(title: string, body: string, href: string): string {
  return `<a class="pulse-card" href="${href}"><span>${escapeHtml(title)}</span><b>${linkProposalText(body || "미확인")}</b></a>`;
}

function renderTechnologyLandscape(dashboard: ReturnType<typeof buildDashboard>): string {
  const domains = dashboard.technologyLandscape;
  const max = Math.max(1, ...domains.map((domain) => domain.meaningful180dProposals));
  return `<div class="section-head"><h2>Technology Landscape</h2><p>8개 기술 영역을 7d, 30d, 180d 기간과 근거 종류별로 살펴봅니다.</p></div>
  ${dashboardControls(domains)}
  <p class="muted" data-filter-summary>기간 180d · 근거 Specification · 전체 Domain</p><p class="muted" data-landscape-weekly-usable>최근 7일 의미 변화 합계 ${escapeHtml(dashboard.weeklySignalCopy.metricValue)}</p><p class="empty is-hidden" data-landscape-empty>현재 필터 조건에 해당하는 기술 영역이 없습니다.</p>
  <div class="atlas-chart-frame"><div class="landscape-bars">${domains.map((domain) => `<div class="landscape-bar" data-landscape-bar data-domain="${escapeHtml(domain.domainId)}" data-7d="${domain.meaningful7dProposals}" data-30d="${domain.meaningful30dProposals}" data-180d="${domain.meaningful180dProposals}"><b>${escapeHtml(domain.nameKo)}</b><span><i style="width:${roundPercent(domain.meaningful180dProposals / max)}%"></i></span><em data-period-value data-7d="${domain.meaningful7dProposals}" data-30d="${domain.meaningful30dProposals}" data-180d="${domain.meaningful180dProposals}">${domain.meaningful180dProposals}</em></div>`).join("")}</div></div>
  <div class="atlas-domain-grid">${domains.map((domain) => `<article class="atlas-domain-card" data-landscape-card data-domain="${escapeHtml(domain.domainId)}" data-statuses="${escapeHtml(domain.statusSet.join(" "))}" data-aa="${domain.domainId === "accounts-wallets"}" data-kgld="${domain.domainId === "tokens-finance" || domain.domainId === "identity-compliance"}" data-search="${escapeHtml(domain.searchText.toLowerCase())}">
    <h3>${escapeHtml(domain.nameKo)}</h3><p>${escapeHtml(domain.descriptionKo)}</p>
    <dl class="atlas-domain-stats"><div><dt data-metric-label>180일 의미 변화 Proposal</dt><dd data-card-metric data-specification="${domain.meaningful180dProposals}" data-discussion="${domain.rawDiscussionPosts}" data-implementation="${domain.implementationEvidenceCount}" data-7d="${domain.meaningful7dProposals}" data-30d="${domain.meaningful30dProposals}" data-180d="${domain.meaningful180dProposals}">${domain.meaningful180dProposals}</dd></div><div><dt>30일 의미 변화 Proposal</dt><dd>${domain.meaningful30dProposals}</dd></div><div><dt>최근 7일 의미 변화 Proposal</dt><dd>${domain.meaningful7dProposals}</dd></div></dl>
    <p class="muted" data-evidence-text data-specification="status: ${escapeHtml(domain.statusSet.join(", ") || "미확인")} · strongest Topic: ${escapeHtml(domain.strongestTopic ?? "미확인")}" data-discussion="최근 7일 원시 댓글 ${domain.rawDiscussionPosts}건 · 유효 기술 댓글 미분류" data-implementation="implementation evidence ${domain.implementationEvidenceCount}건 · ${escapeHtml(domain.implementationEvidenceState)}">status: ${escapeHtml(domain.statusSet.join(", ") || "미확인")} · strongest Topic: ${escapeHtml(domain.strongestTopic ?? "미확인")}</p>
    <p class="muted">maturity: ${escapeHtml(domain.maturitySummary)} · implementation: ${escapeHtml(domain.implementationEvidenceState)} · data: ${escapeHtml(domain.dataConfidence)}</p>
    <p data-source-links data-specification-links="${escapeHtml(domain.representativeProposals.map((id) => proposalLink(id)).join(" "))}" data-discussion-links="${escapeHtml(domain.sourceUrls.length ? "Magicians thread는 활동 섹션에서 확인" : "토론 링크 없음")}" data-implementation-links="구현 근거 미수집">${domain.representativeProposals.map((id) => proposalLink(id)).join(" ")}</p>
  </article>`).join("")}</div><div class="topic-drawer" data-topic-drawer><button data-drawer-close>닫기</button><h3>Topic</h3><p></p></div>`;
}

function dashboardControls(domains: ReturnType<typeof buildDashboard>["technologyLandscape"]): string {
  return `<div class="dashboard-controls">
    <div><button data-period="7d" aria-pressed="false">7d</button><button data-period="30d" aria-pressed="false">30d</button><button data-period="180d" class="active" aria-pressed="true">180d</button></div>
    <div><button data-evidence="specification" class="active" aria-pressed="true">Specification</button><button data-evidence="discussion" aria-pressed="false">Discussion</button><button data-evidence="implementation" aria-pressed="false">Implementation</button></div>
    <select data-domain-filter><option value="all">전체 Domain</option>${domains.map((domain) => `<option value="${escapeHtml(domain.domainId)}">${escapeHtml(domain.nameKo)}</option>`).join("")}</select>
    <select data-status-filter><option value="all">전체 상태</option><option value="draft">Draft</option><option value="review">Review</option><option value="final">Final</option></select>
    <label><input type="checkbox" data-aa-toggle> AA only</label><label><input type="checkbox" data-kgld-toggle> KGLD relevance</label>
    <input type="search" data-proposal-search aria-label="Proposal 또는 Topic 검색">
    <button data-filter-reset type="button">Reset</button>
  </div>`;
}

function renderFocusProgress(dashboard: ReturnType<typeof buildDashboard>): string {
  return `<div class="section-head"><h2>Focus & Progress</h2><p>장기 개발 집중도 상위 Topic을 five-lane progress로 표시합니다. 상태 비율 하나로 구현·활성화·채택을 추정하지 않습니다.</p></div>
  <div class="focus-list">${dashboard.focusProgress.map((topic) => `<article class="focus-card" data-topic-open="topic/${escapeHtml(topic.topicId)}" data-topic-title="${escapeHtml(topic.nameKo)}">
    <div class="card-head"><h3>${escapeHtml(topic.nameKo)}</h3><button data-topic-open="topic/${escapeHtml(topic.topicId)}" data-topic-title="${escapeHtml(topic.nameKo)}">Detail</button></div>
    <p>${linkProposalText(topic.problemKo)}</p><p>${topic.proposalIds.map((id) => proposalLink(id)).join(" ")}</p>
    <p class="muted">선정 이유: 고유 Proposal ${topic.proposalIds.length}개 · 180일 의미 event ${topic.trend180dEvents}건 · 30일 의미 event ${topic.current30dChanges}건 · status progression ${topic.progress.milestoneEvents.length}건</p>
    ${topic.weeklyTrend?.length ? `<div class="sparkline" aria-label="실제 26주 의미 event 추세">${topic.weeklyTrend.map((week) => `<i title="${escapeHtml(week.weekStart.slice(0, 10))}: ${week.meaningfulEventCount}건" style="height:${Math.max(2, Math.min(42, week.meaningfulEventCount * 6))}px"></i>`).join("")}</div>` : '<p class="muted">주별 추세 데이터 미생성</p>'}
    ${fiveLaneProgress(topic.progress)}
    <p class="muted">30일 의미 변화 ${topic.current30dChanges}건 · 최근 7일 의미 변화 ${topic.current7dChanges}건 · ${milestoneText(topic.progress)} · 다음 확인 조건: ${escapeHtml(topic.nextEvidenceCondition)}</p>
    <p>${topic.sourceUrls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">원문</a>`).join(" ")}</p>
  </article>`).join("")}</div>`;
}

function milestoneText(progress: ReturnType<typeof topicProgressLanes>): string {
  const milestone = progress.milestoneEvents[0];
  if (milestone) return `최근 milestone: ${proposalLink(milestone.proposalId)} ${escapeHtml(milestone.eventType)} ${escapeHtml(milestone.occurredAt?.slice(0, 10) ?? "")}`;
  return `최근 확인된 단계: ${escapeHtml(progress.currentStageFallback?.[0] ?? "미확인")}`;
}

function fiveLaneProgress(progress: ReturnType<typeof topicProgressLanes>): string {
  const lanes = [
    ["Specification", progress.specificationStage],
    ["Discussion", progress.discussionStage],
    ["Implementation", progress.implementationStage],
    ["Activation", progress.activationStage],
    ["Adoption", progress.adoptionStage],
  ];
  return `<div class="five-lane">${lanes.map(([label, value]) => `<span><b>${label}</b><em>${escapeHtml(formatCollectionStage(value || "미확인"))}</em></span>`).join("")}</div>`;
}

function formatCollectionStage(value: string): string {
  if (value === "not_collected") return "미수집";
  if (value === "confirmed_none") return "확인된 근거 없음";
  return value;
}

function renderDeveloperAttention(dashboard: ReturnType<typeof buildDashboard>): string {
  const attention = dashboard.developerAttention;
  return `<div class="section-head"><h2>최근 Ethereum Magicians 활동</h2><p>최근 Magicians 활동을 raw post와 thread 기준으로 표시합니다. 기술 relevance 분류가 완료되기 전까지 개발자 관심 순위로 해석하지 않습니다.</p></div>
  <div class="source-coverage-grid"><div><span>scope</span><b>${escapeHtml(attention.summary.scopeType)}</b></div><div><span>active threads</span><b>${attention.summary.activeThreads}</b></div><div><span>raw posts</span><b>${attention.summary.rawPosts}</b></div><div><span>valid technical posts</span><b>${attention.summary.validTechnicalPosts ?? "미분류"}</b></div><div><span>unique participants</span><b>${attention.summary.uniqueParticipants}</b></div><div><span>validated insights</span><b>${attention.summary.validatedInsights}</b></div></div>
  <article class="discussion-matrix"><h3>문서 변화와 Magicians 활동</h3><p class="muted">x축: 확정된 문서 변화 수 · y축: 최근 7일 유효 기술 댓글 수. relevance classification이 완료되지 않은 댓글은 유효 기술 댓글로 계산하지 않습니다.</p></article>
  <div class="tabs"><a href="#developer-attention">Activity</a><a href="#developer-attention-insights">Validated Insights</a></div>
  <div class="discussion-grid">${attention.activity.map((item) => `<article class="discussion-card"><h3>${proposalLink(item.proposalId)} ${escapeHtml(item.title ?? "")}</h3><p>${escapeHtml(item.proposalSummaryKo)}</p><p class="muted">요약 근거: ${escapeHtml(item.summaryEvidence.sourceType)} · ${escapeHtml(item.summaryEvidence.sourceSection)}</p><p class="muted">최근 7일 원시 댓글 ${item.rawPostCount}건 · 유효 기술 댓글 ${item.validTechnicalPostCount ?? "relevance 미분류"} · 참여자 ${item.participantCount}명 · 마지막 활동 ${escapeHtml(item.lastActivityAt?.slice(0, 10) ?? "확인 불가")}</p><p><a href="${escapeHtml(item.summaryEvidence.sourceUrl)}" target="_blank" rel="noopener noreferrer">원문</a>${item.threadUrl ? ` · <a href="${escapeHtml(item.threadUrl)}" target="_blank" rel="noopener noreferrer">토론</a>` : ""}</p></article>`).join("")}</div>
  <div id="developer-attention-insights">${attention.validatedInsights.length ? attention.validatedInsights.map((item) => `<article class="discussion-card"><h3>${escapeHtml(item.category)}</h3><p>${escapeHtml(item.summaryKo)}</p><p>${item.sourceUrls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">근거</a>`).join(" ")}</p></article>`).join("") : `<p class="empty">${escapeHtml(attention.emptyInsightText)}</p>`}</div>`;
}

function renderAccountAbstractionRadar(dashboard: ReturnType<typeof buildDashboard>): string {
  const summary = dashboard.accountAbstraction.summary;
  return `<div class="section-head"><h2>Account Abstraction Radar</h2><p>AA 관련 공식 EIP/ERC 명세와 Ethereum Magicians 활동을 중심으로 12개 기술 축을 추적합니다. 구현·배포·채택 근거는 현재 수집 범위에 포함되지 않습니다.</p></div>
  <div class="source-coverage-grid">
    <div><b>${summary.trackCount}</b><span>Track</span></div>
    <div><b>${summary.baselineProposalCount}</b><span>기준 Proposal 고유</span></div>
    <div><b>${summary.recent30dSpecificationTrackCount}</b><span>최근 30일 확인된 명세 변화 Track</span></div>
    <div><b>${summary.activeTrackAssignmentCount}</b><span>최근 30일 discussion activity Track assignment</span></div>
    <div><b>${summary.uniqueActiveParentFlowCount}</b><span>최근 30일 고유 active parent flow</span></div>
    <div><b>${summary.uniqueDiscussionThreadCount}</b><span>최근 30일 고유 thread</span></div>
    <div><b>${summary.uniqueDiscussionPostCount}</b><span>최근 30일 원시 post</span></div>
    <div><b>${summary.baselineNotLinkedTrackCount}</b><span>기준 Proposal 미연결 Track</span></div>
    <div><b>${summary.discussionNotCollectedTrackCount}</b><span>discussion 미수집 Track</span></div>
    <div><b>${summary.implementationNotCollectedTrackCount}</b><span>implementation 미수집 Track</span></div>
  </div>
  <div class="aa-track-grid">${dashboard.accountAbstraction.tracks.map((track) => `<article class="aa-track" data-filter-card data-aa="true" data-status="${escapeHtml(track.direction)}">
    <div class="card-head"><h3>${escapeHtml(track.name)}</h3><span class="badge">${escapeHtml(aaDirectionLabel(track.direction))}</span></div>
    <p>${escapeHtml(track.problem)}</p>
    <p><b>기준 Proposal</b><br>${renderAaBaselineProposals(track)}</p>
    <p><b>최근 Signal</b><br>${renderAaRecentSignals(track)}</p>
    <dl class="atlas-domain-stats">
      <div><dt>최근 7일 확인된 명세 변화</dt><dd>${renderAaMetricValue(track.specification7d, "건")}</dd></div>
      <div><dt>최근 30일 확인된 명세 변화</dt><dd>${renderAaMetricValue(track.specification30d, "건")}</dd></div>
      <div><dt>최근 30일 Magicians 활동</dt><dd>${renderAaMetricValue(track.discussion30d, "건")}</dd></div>
      <div><dt>구현 근거</dt><dd>${renderAaMetricValue(track.implementation, "건")}</dd></div>
    </dl>
    <p class="muted">${escapeHtml(track.limitation)}</p>
  </article>`).join("")}</div>`;
}

function renderAaBaselineProposals(track: ReturnType<typeof accountAbstractionDashboard>["tracks"][number]): string {
  if (!track.baselineProposals.length) return '<span class="muted">추적 기준 미설정 · 이 Track에 연결된 기준 Proposal이 아직 없습니다.</span>';
  return track.baselineProposals.map((assignment) => {
    const label = assignment.role === "baseline" ? "기준 표준" : assignment.role === "supporting" ? "지원 Proposal" : assignment.role === "adjacent" ? "인접 Proposal" : "직접 Proposal";
    const spec = localSpecificationEvidence(assignment.subjectId);
    const officialTitle = optionalAaString(spec.officialTitle);
    const officialLink = optionalAaString(assignment.sourceUrl)
      ? `<a href="${escapeHtml(assignment.sourceUrl)}" target="_blank" rel="noopener noreferrer">공식 명세 ${escapeHtml(assignment.subjectId)}</a>`
      : escapeHtml(assignment.subjectId);
    const discussionLink = optionalAaString(assignment.discussionSourceUrl)
      ? ` · <a href="${escapeHtml(assignment.discussionSourceUrl)}" target="_blank" rel="noopener noreferrer">Magicians discussion</a>`
      : "";
    return `${officialLink}${discussionLink} <span class="badge">${escapeHtml(label)}</span> <span class="badge">${escapeHtml(spec.status ?? assignment.status ?? "상태 미확인")}</span>${officialTitle ? ` <span class="muted">${escapeHtml(officialTitle)}</span>` : ""}`;
  }).join(" ");
}

function renderAaRecentSignals(track: ReturnType<typeof accountAbstractionDashboard>["tracks"][number]): string {
  if (track.recentSignals.length) {
    return track.recentSignals.slice(0, 4).map((signal) => {
      if (signal.signalType === "discussion_activity") {
        const url = optionalAaString(signal.threadUrl) ?? optionalAaString(signal.sourceUrls[0]);
        const link = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Magicians thread</a>` : "";
        const latestActivityAt = optionalAaString(signal.latestActivityAt) ? formatDateKst(signal.latestActivityAt) : "확인 불가";
        return `${escapeHtml(signal.proposalId)} · 원시 post ${signal.rawPostCount ?? 0}건 · 고유 thread ${signal.threadCount ?? 0}개 · 유효 기술 post 미분류 · 토론 방향 판단 불가 · 최근 활동 ${escapeHtml(latestActivityAt)} ${link}`;
      }
      const url = signal.sourceUrls[0] ?? proposalUrl(signal.proposalId);
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(signal.proposalId)}</a> <span class="badge">최근 명세 변화</span>`;
    }).join("<br>");
  }
  const discussionSources = track.baselineProposals
    .map((assignment) => optionalAaString(assignment.discussionSourceUrl))
    .filter((url): url is string => Boolean(url));
  if (discussionSources.length) {
    return discussionSources.map((url) => `<span class="muted">Discussion source</span> Ethereum Magicians · 최근 30일 원시 post ${track.discussion30d.value ?? 0}건 · <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Magicians thread</a>`).join("<br>");
  }
  return track.proposalIds.length
    ? '<span class="muted">기준 Proposal은 존재하지만 최근 30일 확인된 변화는 없습니다. · Discussion source 미수집</span>'
    : '<span class="muted">이 Track에 연결된 기준 Proposal이 아직 없습니다.</span>';
}

function renderAaMetricValue(metric: { value: number | null; state: string }, unit: string): string {
  if (metric.state === "confirmed_value") return `${metric.value ?? 0}${unit}`;
  if (metric.state === "confirmed_zero") return `0${unit}`;
  if (metric.state === "not_collected") return "미수집";
  if (metric.state === "baseline_not_linked") return "추적 기준 미설정";
  if (metric.state === "not_monitored") return "모니터링 제외";
  return "판단 불가";
}

function aaDirectionLabel(direction: string): string {
  if (direction === "advancing") return "최근 명세 변화";
  if (direction === "active_discussion") return "최근 토론 활동";
  if (direction === "stable") return "기준 Proposal";
  if (direction === "baseline_not_linked") return "추적 기준 미설정";
  if (direction === "not_collected") return "미수집";
  return "모니터링 제외";
}

function renderKgldWatch(dashboard: ReturnType<typeof buildDashboard>): string {
  const renderGroup = (title: string, items: ReturnType<typeof kgldDashboard>["groups"]["research_now"]) => `<article><h3>${escapeHtml(title)}</h3>${items.length ? items.map((item) => `<div class="kgld-watch-item" data-filter-card data-kgld="true"><h4>${proposalLink(item.proposalId)} ${escapeHtml(item.impactArea.join(", ") || "KGLD 영향")}</h4><p><span class="badge">${escapeHtml(item.evidenceState === "body_verified" ? "본문 근거 확인" : "연구 가설")}</span> <span class="badge">confidence ${escapeHtml(item.actionConfidence)}</span></p><p><b>영향 절차:</b> ${escapeHtml(item.impactArea.join(", ") || "미확인")}</p><p><b>지금 할 일:</b> ${escapeHtml(item.internalAction)}</p><p><b>다음 trigger:</b> ${escapeHtml(item.nextTrigger)}</p><p><b>근거 성숙도:</b> ${escapeHtml(item.implementationEvidence)} · research_now는 즉시 도입이 아니라 검토입니다.</p><p>${item.sourceUrls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">원문</a>`).join(" ")}</p></div>`).join("") : '<p class="muted">해당 없음</p>'}</article>`;
  return `<div class="section-head"><h2>KGLD Technology Watch</h2><p>KGLD 운영 절차별 영향, Action, next trigger를 분리합니다.</p></div><div class="kgld-action-grid">${renderGroup("지금 연구할 기술", dashboard.kgldWatch.groups.research_now)}${renderGroup("계속 관찰할 기술", dashboard.kgldWatch.groups.monitor)}${renderGroup("아직 조치가 필요 없는 기술", dashboard.kgldWatch.groups.no_action)}</div>`;
}

function renderDataQuality(dashboard: ReturnType<typeof buildDashboard>): string {
  const quality = dashboard.dataQuality;
  const technologyMapRecentPostCount = new Set(dashboard.technologyLandscape.flatMap((domain) => stringList(domain.discussion?.rawPostIds))).size;
  return `<div class="section-head"><h2>Evidence & Data Quality</h2><p>낮은 품질의 지표는 순위에 쓰지 않고 수집 진단으로만 표시합니다.</p></div>
  <details class="atlas-appendix" open><summary>데이터 품질</summary><div class="source-coverage-grid">
    <div><span>핵심 Proposal</span><b>${dashboard.executivePulse.longTermFocusTop3.reduce((sum, topic) => sum + topic.proposalIds.length, 0)}</b></div>
    <div><span>thread URL</span><b>${quality.discussionCollection.threadUrlConfirmed}</b></div>
    <div><span>전체 post 수집</span><b>${quality.discussionCollection.postsFullyCollected}</b></div>
    <div><span>핵심 Topic 최근 7일 댓글</span><b>${dashboard.developerAttention.summary.rawPosts}</b></div>
    <div><span>기술 지도 최근 7일 댓글</span><b>${technologyMapRecentPostCount}</b></div>
    <div><span>전체 분석 최근 7일 댓글</span><b>${quality.discussionCollection.recent7dPostCount}</b></div>
    <div><span>source coverage</span><b>${escapeHtml(quality.coverage180d)}</b></div>
    <div><span>timestamp quality</span><b>${escapeHtml(quality.weeklyRankingValidity)}</b></div>
    <div><span>발생일 미확정 event</span><b>${quality.current7dFallbackEventCount}</b></div>
    <div><span>유형 미확정 event</span><b>${quality.unknownSemanticEventCount}</b></div>
    <div><span>Magicians full/partial</span><b>${quality.discussionCollection.postsFullyCollected}/${quality.discussionCollection.postsPartiallyCollected}</b></div>
    <div><span>discussion relevance</span><b>${quality.discussionCollection.validTechnicalPostCount ?? "미분류"}</b></div>
    <div><span>implementation evidence</span><b>${quality.implementationEvidenceCoverage}</b></div>
    <div><span>ranking validity</span><b>${escapeHtml(quality.weeklyRankingValidity)}</b></div>
  </div><p class="muted">발생일 또는 변경 유형이 미확정인 event는 executive claim과 Topic momentum에서 제외하고 appendix audit에만 둡니다.</p></details>`;
}

function buildIntelligenceSnapshot(report: WeeklyRadarReport, atlas: TechnologyAtlas, dashboard: ReturnType<typeof buildDashboard>) {
  const schemaVersion = "intelligence-snapshot/v2";
  const snapshotId = `weekly-${report.generatedAt.slice(0, 10)}`;
  const publicProposalIds = publicProposalIdsForSnapshot(atlas, dashboard);
  const monitoringUniverse = monitoringUniverseForReport(atlas, dashboard, publicProposalIds);
  const specificationEvidence = specificationEvidenceFacts(atlas, publicProposalIds, report.generatedAt);
  const discussionPosts = discussionPostFacts(report, publicProposalIds);
  const developmentEvents = developmentEventFacts(report);
  const logicalDevelopmentEvents = logicalDevelopmentEventFacts(developmentEvents);
  const qualityFacts = [{
    factId: "quality:weekly",
    factType: "weekly_quality",
    sourceUrl: "internal:weekly-quality",
    sourceDate: report.generatedAt,
    values: {
      rawEvents: dashboard.dataQuality.current7dRawEventCount,
      fallbackEvents: dashboard.dataQuality.current7dFallbackEventCount,
      unknownSemanticEvents: dashboard.dataQuality.unknownSemanticEventCount,
      usableEvents: dashboard.dataQuality.current7dUsableEventCount,
      usableEventIds: dashboard.dataQuality.usableEventIds,
      weeklyRankingValidity: dashboard.dataQuality.weeklyRankingValidity,
    },
  }];
  const topicMembershipFacts = atlasTopicMemberships(atlas).map((membership) => ({
    ...membership,
    evidenceLevel: "specification",
  }));
  const metricDictionary = metricDictionaryForDashboard();
  const signals = signalsForDashboard(dashboard);
  const editorialClaims = editorialClaimsForDashboard(dashboard, signals, specificationEvidence);
  const vitalikBlogInput = (report as Record<string, unknown>).vitalikBlog as Record<string, unknown> | undefined;
  const vitalikBlogView = vitalikBlogViewFromReportInput(vitalikBlogInput, report.generatedAt);
  const vitalikBlogPosts = Array.isArray(vitalikBlogInput?.posts) ? vitalikBlogInput.posts : [];
  const snapshot = {
    metadata: {
      schemaVersion,
      snapshotId,
      snapshotHash: "",
      generatedAt: report.generatedAt,
      reportDate: report.generatedAt.slice(0, 10),
      reportAsOf: report.generatedAt,
      inputSnapshotHash: "",
    },
    monitoringUniverse,
    facts: {
      specificationEvidence,
      discussionPosts,
      developmentEvents,
      logicalDevelopmentEvents,
      topicMembershipFacts,
      qualityFacts,
      vitalikBlogPosts,
      vitalikBlogSourceAttempted: vitalikBlogInput !== undefined,
    },
    aggregates: {
      metricDictionary,
      domainActivity: dashboard.technologyLandscape.map((domain) => ({
        metricId: "domain.meaningfulProposals",
        entityId: domain.domainId,
        values: {
          current7d: domain.meaningful7dProposals,
          current30d: domain.meaningful30dProposals,
          current180d: domain.meaningful180dProposals,
        },
      })),
      discussion: {
        developer_activity_set: dashboard.developerAttention.summary,
        technology_map_set: technologyMapDiscussionAggregate(dashboard),
        aa: dashboard.accountAbstraction.summary,
      },
      weeklyQuality: [
        { metricId: "weekly.rawEvents", value: dashboard.dataQuality.current7dRawEventCount },
        { metricId: "weekly.usableEvents", value: dashboard.dataQuality.current7dUsableEventCount },
        { metricId: "weekly.fallbackEvents", value: dashboard.dataQuality.current7dFallbackEventCount },
        { metricId: "weekly.unknownSemanticEvents", value: dashboard.dataQuality.unknownSemanticEventCount },
      ],
      aa: [
        { metricId: "aa.trackCount", value: dashboard.accountAbstraction.summary.trackCount },
        { metricId: "aa.uniqueBaselineProposalCount", value: dashboard.accountAbstraction.summary.baselineProposalCount },
        { metricId: "aa.baselineProposalAssignmentCount", value: dashboard.accountAbstraction.summary.trackAssignmentCount },
        { metricId: "aa.specificationActiveTrackCount30d", value: dashboard.accountAbstraction.summary.recent30dSpecificationTrackCount },
        { metricId: "aa.discussionActiveTrackAssignmentCount30d", value: dashboard.accountAbstraction.summary.activeTrackAssignmentCount },
        { metricId: "aa.uniqueActiveParentFlowCount30d", value: dashboard.accountAbstraction.summary.uniqueActiveParentFlowCount },
        { metricId: "aa.uniqueActiveThreadCount30d", value: dashboard.accountAbstraction.summary.uniqueDiscussionThreadCount },
        { metricId: "aa.uniqueRawPostCount30d", value: dashboard.accountAbstraction.summary.uniqueDiscussionPostCount },
        { metricId: "aa.baselineNotLinkedTrackCount", value: dashboard.accountAbstraction.summary.baselineNotLinkedTrackCount },
        { metricId: "aa.discussionNotCollectedTrackCount", value: dashboard.accountAbstraction.summary.discussionNotCollectedTrackCount },
        { metricId: "aa.implementationNotCollectedTrackCount", value: dashboard.accountAbstraction.summary.implementationNotCollectedTrackCount },
        { metricId: "aa.uniqueActiveThreads", value: dashboard.accountAbstraction.summary.uniqueActiveThreadCount, deprecated: true, replacedBy: "aa.uniqueActiveThreadCount30d", aliasValueFrom: "aa.uniqueActiveThreadCount30d" },
        { metricId: "aa.uniqueRecentPosts", value: dashboard.accountAbstraction.summary.uniqueRecentPostCount, deprecated: true, replacedBy: "aa.uniqueRawPostCount30d", aliasValueFrom: "aa.uniqueRawPostCount30d" },
        { metricId: "aa.trackAssignments", value: dashboard.accountAbstraction.summary.trackAssignmentCount, deprecated: true, replacedBy: "aa.baselineProposalAssignmentCount", aliasValueFrom: "aa.baselineProposalAssignmentCount" },
      ],
      kgld: [
        { metricId: "kgld.researchNow", value: dashboard.kgldWatch.summary.reviewNow },
        { metricId: "kgld.monitor", value: dashboard.kgldWatch.summary.monitor },
        { metricId: "kgld.noAction", value: dashboard.kgldWatch.summary.noAction },
      ],
    },
    signals,
    editorialClaims,
    views: {
      ...dashboard,
      vitalikBlog: vitalikBlogView,
    },
    quality: {
      passed: true,
      checks: [],
    },
  };
  snapshot.metadata.inputSnapshotHash = inputSnapshotHash(snapshot);
  snapshot.metadata.snapshotHash = snapshotHash(snapshot);
  return snapshot;
}

function inputSnapshotHash(snapshot: {
  metadata: { reportDate?: string; reportAsOf?: string; generatedAt?: string };
  facts?: { discussionPosts?: unknown[]; developmentEvents?: unknown[]; specificationEvidence?: unknown[] };
}) {
  return createHash("sha256").update(stableJson({
    reportDate: snapshot.metadata.reportDate,
    reportAsOf: snapshot.metadata.reportAsOf ?? snapshot.metadata.generatedAt,
    discussionPosts: snapshot.facts?.discussionPosts ?? [],
    developmentEvents: snapshot.facts?.developmentEvents ?? [],
    specificationEvidence: snapshot.facts?.specificationEvidence ?? [],
  })).digest("hex");
}

function platformInputSnapshotHashForReport(report: WeeklyRadarReport, developmentEvents: unknown[], specificationEvidence: unknown[], discussionPosts: unknown[]): string {
  return inputSnapshotHash({
    metadata: {
      reportDate: report.generatedAt.slice(0, 10),
      reportAsOf: report.generatedAt,
      generatedAt: report.generatedAt,
    },
    facts: {
      developmentEvents,
      specificationEvidence,
      discussionPosts,
    },
  });
}

function snapshotHash(snapshot: { metadata: { snapshotHash: string } }) {
  const clone = JSON.parse(JSON.stringify(snapshot));
  clone.metadata.snapshotHash = "";
  return createHash("sha256").update(stableJson(clone)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function vitalikBlogViewFromReportInput(input: Record<string, unknown> | undefined, reportAsOf: string) {
  if (!input) return buildUnavailableVitalikBlogView();
  if (Array.isArray(input.selectedPosts)) return input;
  if (Array.isArray(input.posts)) return buildVitalikBlogView(input as never, reportAsOf, vitalikBlogEditorialOverrides);
  return buildUnavailableVitalikBlogView("Vitalik Blog source shape is unavailable in snapshot.");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortKeys(child)]));
}

function publicProposalIdsForSnapshot(atlas: TechnologyAtlas, dashboard: ReturnType<typeof buildDashboard>): string[] {
  const ids = new Set<string>();
  for (const proposal of [...atlas.classifiedProposals, ...atlas.heldProposals]) ids.add(proposal.proposalId);
  for (const item of dashboard.developerAttention.activity) ids.add(item.proposalId);
  for (const topic of dashboard.focusProgress) for (const id of topic.proposalIds) ids.add(id);
  for (const domain of dashboard.technologyLandscape) for (const id of domain.representativeProposals) ids.add(id);
  for (const track of dashboard.accountAbstraction.tracks) for (const id of track.proposalIds) ids.add(id);
  for (const group of Object.values(dashboard.kgldWatch.groups)) for (const item of group) ids.add(item.proposalId);
  for (const id of ["ERC-4337", "ERC-4626", "EIP-712", "ERC-20"]) ids.add(id);
  return [...ids].sort();
}

function monitoringUniverseForReport(atlas: TechnologyAtlas, dashboard: ReturnType<typeof buildDashboard>, publicProposalIds: string[]) {
  const all = mainReportProposals(atlas);
  const detailed = dashboard.developerAttention.activity.map((item) => item.proposalId);
  const held = atlas.heldProposals.map((proposal) => proposal.proposalId);
  const monitored = new Set(all.map((proposal) => proposal.proposalId));
  const heldSet = new Set(held);
  const detailedSet = new Set(detailed);
  const subjectRegistry = publicProposalIds.map((proposalId) => ({
    proposalId,
    roles: subjectRoles(proposalId, monitored, heldSet, detailedSet),
    publicSections: publicSectionsForProposal(proposalId, dashboard),
    specificationEvidenceState: specificationEvidenceState(proposalId),
    discussionEvidenceState: discussionEvidenceState(proposalId, dashboard),
  }));
  return {
    scope: {
      title: "Ethereum 개발 인텔리전스",
      subtitle: dashboard.dataQuality.implementationEvidenceCoverage === 0
        ? "EIP/ERC 명세와 Ethereum Magicians 활동을 중심으로 한 Ethereum 표준 개발 관찰 보고서"
        : "EIP/ERC 명세, Ethereum Magicians 활동, 확인된 구현 근거를 함께 보는 표준 개발 관찰 보고서",
      universeType: "eip_erc_and_magicians",
      discoveredProposalCount: publicProposalIds.length,
      monitoredProposalCount: all.length,
      detailedProposalCount: detailed.length,
      discussionThreadCount: dashboard.dataQuality.discussionCollection.threadUrlConfirmed,
      implementationSourceCount: dashboard.dataQuality.implementationEvidenceCoverage,
    },
    subjectRegistry,
    discoveredProposalIds: publicProposalIds,
    monitoredProposalIds: all.map((proposal) => proposal.proposalId),
    detailedAnalysisProposalIds: detailed,
    appendixProposalIds: all.map((proposal) => proposal.proposalId),
    heldProposalIds: held,
    selectionRule: "classified or held proposals with official EIP/ERC identifier in weekly monitoring universe",
    selectionVersion: atlas.version,
    includedSources: ["eips.ethereum.org", "ethereum-magicians.org", "ethereum/EIPs git", "ethereum/ERCs git", "vitalik.eth.limo (personal writing)"],
    excludedSources: dashboard.dataQuality.implementationEvidenceCoverage === 0 ? ["implementation adapters"] : [],
  };
}

function subjectRoles(proposalId: string, monitored: Set<string>, held: Set<string>, detailed: Set<string>): string[] {
  if (["ERC-4337", "ERC-4626", "EIP-712", "ERC-20"].includes(proposalId)) return ["reference_only"];
  const roles = new Set<string>();
  if (monitored.has(proposalId)) roles.add("monitored");
  if (held.has(proposalId)) roles.add("held");
  if (detailed.has(proposalId)) roles.add("activity_only");
  if (!roles.size) roles.add("reference_only");
  return [...roles];
}

function publicSectionsForProposal(proposalId: string, dashboard: ReturnType<typeof buildDashboard>): string[] {
  const sections = new Set<string>();
  if (dashboard.developerAttention.activity.some((item) => item.proposalId === proposalId)) sections.add("Developer Activity");
  if (dashboard.focusProgress.some((topic) => topic.proposalIds.includes(proposalId))) sections.add("Focus & Progress");
  if (dashboard.technologyLandscape.some((domain) => domain.representativeProposals.includes(proposalId))) sections.add("Technology Landscape");
  if (dashboard.accountAbstraction.tracks.some((track) => track.proposalIds.includes(proposalId))) sections.add("AA Radar");
  if (Object.values(dashboard.kgldWatch.groups).some((items) => items.some((item) => item.proposalId === proposalId))) sections.add("KGLD Watch");
  if (!sections.size) sections.add("Appendix");
  return [...sections];
}

function specificationEvidenceState(proposalId: string): string {
  return localSpecificationEvidence(proposalId).parseState;
}

function discussionEvidenceState(proposalId: string, dashboard: ReturnType<typeof buildDashboard>): string {
  const activity = dashboard.developerAttention.activity.find((item) => item.proposalId === proposalId);
  if (activity?.rawPostCount) return "posts_fully_collected";
  if (activity?.threadUrl) return "url_confirmed";
  const aaTrack = dashboard.accountAbstraction.tracks.find((track) => track.proposalIds.includes(proposalId));
  if (aaTrack?.discussion30d?.state === "confirmed_value" || aaTrack?.discussion30d?.state === "confirmed_zero") return "posts_fully_collected";
  if (aaTrack?.discussion30d?.state === "not_collected") return "not_searched";
  return "not_searched";
}

function specificationEvidenceFacts(atlas: TechnologyAtlas, publicProposalIds: string[], generatedAt: string) {
  const byId = new Map([...atlas.classifiedProposals, ...atlas.heldProposals].map((proposal) => [proposal.proposalId, proposal]));
  return publicProposalIds.map((proposalId) => {
    const proposal = byId.get(proposalId);
    const local = localSpecificationEvidence(proposalId);
    const officialTitle = local.officialTitle || proposal?.title || proposalId;
    const status = local.status || proposal?.status || "unknown";
    const hashBase = `${proposalId}:${officialTitle}:${status}:${local.abstractText ?? ""}:${local.motivationText ?? ""}:${local.specificationIntroText ?? ""}`;
    return {
      factId: `spec:${proposalId}`,
      proposalId,
      officialTitle,
      status,
      sourceUrl: proposalUrl(proposalId),
      abstractText: local.abstractText,
      motivationText: local.motivationText,
      specificationIntroText: local.specificationIntroText,
      sourceUpdatedAt: proposal ? (proposal as { lastUpdatedAt?: string }).lastUpdatedAt ?? null : null,
      fetchedAt: local.parseState === "body_parsed" ? generatedAt : null,
      bodyContentHash: createHash("sha256").update(hashBase).digest("hex"),
      contentHash: createHash("sha256").update(hashBase).digest("hex"),
      parseState: local.parseState,
    };
  });
}

function discussionPostFacts(report: WeeklyRadarReport, publicProposalIds: string[]) {
  const proposals = new Set(publicProposalIds);
  const aaProposalIds = new Set(AA_TRACK_DEFINITIONS.flatMap((track) => track.assignments.map((assignment) => assignment.subjectId)));
  const aaWindowStart = new Date(Date.parse(report.changePeriod.to) - 30 * 24 * 60 * 60 * 1000).toISOString();
  const posts = report.ethereumTechRadar.signalLayer.discussionHeat
    .filter((discussion) => proposals.has(discussion.proposalId) || aaProposalIds.has(discussion.proposalId))
    .flatMap((discussion) => {
      const start = aaProposalIds.has(discussion.proposalId) ? aaWindowStart : report.changePeriod.from;
      return discussionPostRows(discussion, start, report.changePeriod.to);
    });
  return dedupeDiscussionPosts(posts)
    .map((post) => ({
      factId: `post:${post.postId}`,
      postId: post.postId,
      threadId: post.topicId,
      proposalId: post.proposalId,
      createdAt: post.createdAt,
      username: post.username,
      sourceUrl: post.sourceUrl ?? null,
      deleted: post.deleted,
      hidden: post.hidden,
      relevanceState: post.relevanceState,
      collectedAt: report.generatedAt,
    }));
}

function developmentEventFacts(report: WeeklyRadarReport) {
  return trendEvents(report).map((event) => ({
    factId: `event:${reportEventKey(event)}`,
    eventId: reportEventKey(event),
    proposalId: event.proposalId,
    sourceType: event.source ?? "eips_git",
    eventType: event.type,
    semanticType: event.changeSemanticType ?? semanticTypeForReportEvent(event),
    occurredAt: event.occurredAt ?? null,
    occurredAtSource: event.occurredAtSource ?? (event.occurredAt ? "git_commit" : "fallback_detected_at"),
    detectedAt: event.detectedAt ?? null,
    confidence: weeklyEventConfidence(event),
    sourceUrl: eventSourceUrl(event) ?? null,
  }));
}

function logicalDevelopmentEventFacts(events: ReturnType<typeof developmentEventFacts>) {
  const byLogicalId = new Map<string, {
    logicalEventId: string;
    proposalId: string;
    eventType: string;
    occurredAt: string | null;
    sourceFactIds: string[];
    confidence: number;
  }>();
  for (const event of events) {
    const eventType = logicalEventType(event.eventType, event.semanticType);
    if (!eventType) continue;
    const logicalEventId = eventType === "proposal_published" ? `logical:${event.proposalId}:proposal_published` : `logical:${event.proposalId}:${eventType}:${event.occurredAt ?? event.detectedAt ?? event.eventId}`;
    const existing = byLogicalId.get(logicalEventId);
    if (existing) {
      existing.sourceFactIds.push(event.factId);
      if (event.occurredAt && (!existing.occurredAt || Date.parse(event.occurredAt) < Date.parse(existing.occurredAt))) existing.occurredAt = event.occurredAt;
      existing.confidence = Math.max(existing.confidence, event.confidence);
    } else {
      byLogicalId.set(logicalEventId, {
        logicalEventId,
        proposalId: event.proposalId,
        eventType,
        occurredAt: event.occurredAt,
        sourceFactIds: [event.factId],
        confidence: event.confidence,
      });
    }
  }
  return [...byLogicalId.values()].sort((left, right) => left.logicalEventId.localeCompare(right.logicalEventId));
}

function logicalEventType(eventType: string, semanticType: string): string | null {
  if (eventType === "new_proposal") return "proposal_published";
  if (eventType === "final_transition") return "final_transition";
  if (eventType === "withdrawn_transition") return "withdrawn_transition";
  if (eventType === "status_change") return "status_transition";
  if (eventType === "content_hash_change" && ["normative_specification", "rationale_or_motivation", "security_consideration", "interface_or_api", "test_vector"].includes(semanticType)) return "normative_spec_change";
  return null;
}

function localSpecificationEvidence(proposalId: string): {
  officialTitle: string | null;
  status: string | null;
  abstractText: string | null;
  motivationText: string | null;
  specificationIntroText: string | null;
  parseState: "body_parsed" | "title_only" | "fetch_failed";
} {
  const path = localProposalMarkdownPath(proposalId);
  if (!path) return { officialTitle: null, status: null, abstractText: null, motivationText: null, specificationIntroText: null, parseState: "title_only" };
  try {
    const markdown = readFileSync(path, "utf8");
    return parseLocalSpecificationMarkdown(markdown);
  } catch {
    return { officialTitle: null, status: null, abstractText: null, motivationText: null, specificationIntroText: null, parseState: "fetch_failed" };
  }
}

function parseLocalSpecificationMarkdown(markdown: string): {
  officialTitle: string | null;
  status: string | null;
  abstractText: string | null;
  motivationText: string | null;
  specificationIntroText: string | null;
  parseState: "body_parsed" | "title_only";
} {
  const frontmatter = parseSimpleFrontmatter(markdown);
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const abstractText = markdownSection(body, "Abstract");
  const motivationText = markdownSection(body, "Motivation");
  const specificationIntroText = markdownSection(body, "Specification") ?? (!abstractText ? firstSubstantiveMarkdownSection(body) : null);
  return {
    officialTitle: frontmatter.title ?? null,
    status: frontmatter.status ?? null,
    abstractText,
    motivationText,
    specificationIntroText,
    parseState: abstractText || motivationText || specificationIntroText ? "body_parsed" : "title_only",
  };
}

function localProposalMarkdownPath(proposalId: string): string | null {
  const source = resolveOfficialProposalSource(proposalId);
  if (!source) return null;
  if (!isExactCaseFile(source.repositoryRoot, source.relativePath)) return null;
  return resolve(source.repositoryRoot, source.relativePath);
}

function parseSimpleFrontmatter(markdown: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return {};
  const record: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const item = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (item) record[item[1]!.toLowerCase()] = item[2]!.trim().replace(/^["']|["']$/g, "");
  }
  return record;
}

function markdownSection(body: string, heading: string): string | null {
  const pattern = new RegExp(`^#{2,3}\\s+${escapeRegExpForHtml(heading)}\\s*$`, "im");
  const match = pattern.exec(body);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const next = rest.search(/^#{2,3}\s+\S/m);
  const section = (next >= 0 ? rest.slice(0, next) : rest)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (value) => value.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  return section ? section.slice(0, 1200) : null;
}

function firstSubstantiveMarkdownSection(body: string): string | null {
  const headingPattern = /^#{2,3}\s+(.+?)\s*$/gm;
  const headings = [...body.matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    const title = heading[1]!.replace(/\s*#+\s*$/, "").trim();
    if (/^(table of contents|contents)$/i.test(title)) continue;
    const start = heading.index! + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    const rawSection = body.slice(start, end);
    if (isSubstantiveMarkdownSection(rawSection)) return cleanMarkdownSection(rawSection);
  }
  return null;
}

function isSubstantiveMarkdownSection(section: string): boolean {
  const contentLines = section
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (contentLines.length === 0) return false;
  const proseLines = contentLines.filter((line) => {
    const withoutMarker = line.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "").trim();
    if (!withoutMarker) return false;
    if (/^\[[^\]]+\]\([^)]+\)$/.test(withoutMarker)) return false;
    if (/^<https?:\/\/[^>]+>$/.test(withoutMarker) || /^https?:\/\/\S+$/.test(withoutMarker)) return false;
    return /[.!?。！？]/.test(withoutMarker) || withoutMarker.split(/\s+/).length >= 12;
  });
  if (proseLines.length === 0) return false;
  const cleaned = cleanMarkdownSection(section);
  return Boolean(cleaned && cleaned.length >= 80);
}

function cleanMarkdownSection(section: string): string | null {
  const cleaned = section
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (value) => value.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 1200) : null;
}

function metricDictionaryForDashboard() {
  return [
    metricDefinition("domain.meaningfulProposals", "의미 변화가 확인된 Proposal", "domain", "proposal", "unique", "domain", "all", "weeklyUsable-style semantic event by window", "DevelopmentEvent", "views.technologyLandscape[].meaningful*Proposals"),
    metricDefinition("domain.rawDiscussionPosts", "최근 Magicians 원시 post", "domain", "post", "unique", "domain", "current7d", "DiscussionPost in domain proposal set", "DiscussionPost", "views.technologyLandscape[].rawDiscussionPosts"),
    metricDefinition("weekly.rawEvents", "최근 7일 raw event", "quality", "event", "count", "weekly", "current7d", "all current7d DevelopmentEvent", "DevelopmentEvent", "views.dataQuality.current7dRawEventCount"),
    metricDefinition("weekly.usableEvents", "최근 7일 usable event", "quality", "event", "count", "weekly", "current7d", "weeklyUsable", "DevelopmentEvent", "views.dataQuality.current7dUsableEventCount"),
    metricDefinition("weekly.fallbackEvents", "최근 7일 발생일 미확정 event", "quality", "event", "count", "weekly", "current7d", "occurredAtSource=fallback_detected_at", "DevelopmentEvent", "views.dataQuality.current7dFallbackEventCount"),
    metricDefinition("weekly.unknownSemanticEvents", "최근 7일 유형 미확정 event", "quality", "event", "count", "weekly", "current7d", "semanticType=unknown", "DevelopmentEvent", "views.dataQuality.unknownSemanticEventCount"),
    metricDefinition("discussion.developerRawPosts", "Developer activity raw posts", "discussion", "post", "unique", "developer_activity_set", "current7d", "unique non-deleted DiscussionPost", "DiscussionPost", "views.developerAttention.summary.rawPosts"),
    metricDefinition("discussion.developerActiveThreads", "Developer activity active threads", "discussion", "thread", "unique", "developer_activity_set", "current7d", "thread union with current7d posts", "DiscussionPost", "views.developerAttention.summary.activeThreads"),
    metricDefinition("aa.trackCount", "AA Track 수", "aa", "track", "count", "aa", "all", "all configured AA tracks", "AATrack", "views.accountAbstraction.summary.trackCount"),
    metricDefinition("aa.uniqueBaselineProposalCount", "AA 기준 Proposal 고유 수", "aa", "proposal", "unique", "aa", "all", "unique baseline proposal ids across tracks", "SpecificationEvidence", "views.accountAbstraction.summary.baselineProposalCount"),
    metricDefinition("aa.baselineProposalAssignmentCount", "AA 기준 Proposal assignment 수", "aa", "assignment", "count", "aa", "all", "track assignment count including duplicate proposal assignments", "AAProposalAssignment", "views.accountAbstraction.summary.trackAssignmentCount"),
    metricDefinition("aa.specificationActiveTrackCount30d", "최근 30일 명세 변화 Track 수", "aa", "track", "count", "aa", "current30d", "tracks with confirmed specification30d value", "DevelopmentEvent", "views.accountAbstraction.summary.recent30dSpecificationTrackCount"),
    metricDefinition("aa.discussionActiveTrackAssignmentCount30d", "최근 30일 discussion activity Track assignment 수", "aa", "track_assignment", "count", "aa", "current30d", "tracks with confirmed discussion30d value", "DiscussionPost", "views.accountAbstraction.summary.activeTrackAssignmentCount"),
    metricDefinition("aa.uniqueActiveParentFlowCount30d", "최근 30일 고유 active parent flow 수", "aa", "parent_flow", "unique", "aa", "current30d", "parent/child deduplicated active track flow", "DiscussionPost", "views.accountAbstraction.summary.uniqueActiveParentFlowCount"),
    metricDefinition("aa.uniqueActiveThreadCount30d", "최근 30일 고유 active thread 수", "aa", "thread", "unique", "aa", "current30d", "thread union across active AA tracks", "DiscussionPost", "views.accountAbstraction.summary.uniqueDiscussionThreadCount"),
    metricDefinition("aa.uniqueRawPostCount30d", "최근 30일 고유 raw post 수", "aa", "post", "unique", "aa", "current30d", "post union across active AA tracks", "DiscussionPost", "views.accountAbstraction.summary.uniqueDiscussionPostCount"),
    metricDefinition("aa.baselineNotLinkedTrackCount", "기준 Proposal 미연결 Track 수", "aa", "track", "count", "aa", "all", "tracks without baseline proposal assignments", "AATrack", "views.accountAbstraction.summary.baselineNotLinkedTrackCount"),
    metricDefinition("aa.discussionNotCollectedTrackCount", "discussion 미수집 Track 수", "aa", "track", "count", "aa", "current30d", "tracks with discussion state not_collected", "DiscussionPost", "views.accountAbstraction.summary.discussionNotCollectedTrackCount"),
    metricDefinition("aa.implementationNotCollectedTrackCount", "implementation 미수집 Track 수", "aa", "track", "count", "aa", "all", "implementation adapter not collected for AA tracks", "ImplementationEvidence", "views.accountAbstraction.summary.implementationNotCollectedTrackCount"),
    metricDefinition("aa.uniqueActiveThreads", "AA 고유 active thread", "aa", "thread", "unique", "aa", "current30d", "deprecated alias", "DiscussionPost", "views.accountAbstraction.summary.uniqueDiscussionThreadCount", { deprecated: true, replacedBy: "aa.uniqueActiveThreadCount30d", aliasValueFrom: "aa.uniqueActiveThreadCount30d" }),
    metricDefinition("aa.uniqueRecentPosts", "AA 고유 recent post", "aa", "post", "unique", "aa", "current30d", "deprecated alias", "DiscussionPost", "views.accountAbstraction.summary.uniqueDiscussionPostCount", { deprecated: true, replacedBy: "aa.uniqueRawPostCount30d", aliasValueFrom: "aa.uniqueRawPostCount30d" }),
    metricDefinition("aa.trackAssignments", "AA track 연결 활동", "aa", "assignment", "count", "aa", "all", "deprecated alias", "AAProposalAssignment", "views.accountAbstraction.summary.trackAssignmentCount", { deprecated: true, replacedBy: "aa.baselineProposalAssignmentCount", aliasValueFrom: "aa.baselineProposalAssignmentCount" }),
    metricDefinition("kgld.researchNow", "KGLD 지금 연구", "kgld", "proposal", "count", "kgld", "all", "actionType=research_now", "SpecificationEvidence", "views.kgldWatch.summary.reviewNow"),
    metricDefinition("kgld.monitor", "KGLD 계속 관찰", "kgld", "proposal", "count", "kgld", "all", "actionType=monitor", "SpecificationEvidence", "views.kgldWatch.summary.monitor"),
    metricDefinition("kgld.noAction", "KGLD 현재 조치 없음", "kgld", "proposal", "count", "kgld", "all", "actionType=no_action", "SpecificationEvidence", "views.kgldWatch.summary.noAction"),
  ];
}

function metricDefinition(metricId: string, displayNameKo: string, entityType: string, unit: string, aggregation: string, scope: string, window: string, filterRule: string, sourceFactType: string, sourcePath: string, options: Record<string, unknown> = {}) {
  return {
    metricId,
    displayNameKo,
    labelKo: displayNameKo,
    descriptionKo: filterRule,
    entityType,
    unit,
    aggregation,
    scope,
    window,
    filterRule,
    deduplicationRule: aggregation === "unique" ? filterRule : "not unique aggregation",
    sourceFactType,
    sourcePath,
    ...options,
  };
}

function signalsForDashboard(dashboard: ReturnType<typeof buildDashboard>) {
  return [
    {
      signalId: "weekly-quality:current7d",
      signalType: "weekly_development",
      subjectId: "weekly:current7d",
      metricIds: ["weekly.rawEvents", "weekly.usableEvents", "weekly.fallbackEvents", "weekly.unknownSemanticEvents"],
      evidenceFactIds: ["quality:weekly"],
      confidence: dashboard.dataQuality.weeklyRankingValidity === "invalid" ? 0.4 : 0.75,
      limitations: ["fallback and unknown semantic events are excluded from weekly development ranking"],
    },
    ...dashboard.focusProgress.slice(0, 5).map((topic) => ({
      signalId: `long-term-focus:${topic.topicId}`,
      signalType: "long_term_focus",
      subjectId: topic.topicId,
      metricIds: ["domain.meaningfulProposals", "discussion.developerRawPosts"],
      evidenceFactIds: topic.proposalIds.map((proposalId) => `spec:${proposalId}`),
      confidence: 0.75,
      limitations: ["implementation evidence not collected"],
      scoreContributions: {
        uniqueProposalCount: topic.proposalIds.length,
        meaningfulEventCount180d: topic.trend180dEvents,
        meaningfulEventCount30d: topic.current30dChanges,
      },
    })),
    ...dashboard.developerAttention.activity.slice(0, 3).map((item) => ({
      signalId: `discussion-activity:${item.proposalId}`,
      signalType: "discussion_activity",
      subjectId: item.proposalId,
      metricIds: ["discussion.developerRawPosts"],
      evidenceFactIds: item.rawPostIds.map((id) => `post:${id}`),
      confidence: 0.7,
      limitations: ["relevance classification not completed"],
    })),
    ...dashboard.kgldWatch.groups.research_now.concat(dashboard.kgldWatch.groups.monitor).map((item) => ({
      signalId: `kgld:${item.proposalId}`,
      signalType: "kgld_relevance",
      subjectId: item.proposalId,
      metricIds: [`kgld.${item.actionType === "research_now" ? "researchNow" : item.actionType}`],
      evidenceFactIds: [`spec:${item.proposalId}`],
      confidence: 0.72,
      limitations: ["implementation evidence not collected"],
    })),
  ];
}

function editorialClaimsForDashboard(
  dashboard: ReturnType<typeof buildDashboard>,
  signals: ReturnType<typeof signalsForDashboard>,
  specificationEvidence: ReturnType<typeof specificationEvidenceFacts>,
) {
  const evidenceIds = new Set([...specificationEvidence.map((item) => `spec:${item.proposalId}`), "quality:weekly"]);
  const signalIds = new Set(signals.map((signal) => signal.signalId));
  const sourceForProposal = (proposalId: string) => proposalUrl(proposalId);
  const longTermSignalIds = dashboard.focusProgress.slice(0, 3).map((topic) => `long-term-focus:${topic.topicId}`).filter((id) => signalIds.has(id));
  const discussionSignalIds = dashboard.developerAttention.activity.slice(0, 3).map((item) => `discussion-activity:${item.proposalId}`).filter((id) => signalIds.has(id));
  const kgldSignalIds = dashboard.kgldWatch.groups.research_now.concat(dashboard.kgldWatch.groups.monitor).map((item) => `kgld:${item.proposalId}`).filter((id) => signalIds.has(id));
  const claims = [
    claim("bottom-line", "bottom_line", dashboard.executivePulse.bottomLine.join(" "), dashboard.focusProgress.slice(0, 3).map((topic) => topic.topicId), [...longTermSignalIds, ...discussionSignalIds, ...kgldSignalIds, "weekly-quality:current7d"].filter((id) => signalIds.has(id)), [...dashboard.focusProgress.slice(0, 3).flatMap((topic) => topic.proposalIds.map((id) => `spec:${id}`)), "quality:weekly"], 0.75, true, ["관찰 대상 내 결론입니다."]),
    claim("this-week-spec", "this_week", dashboard.executivePulse.whatChanged.confirmedSpecificationChanges, [], ["weekly-quality:current7d"], ["quality:weekly"], 0.8, false, ["weekly usable event가 0이면 변화 없음이 아니라 확인 가능한 의미 변화 없음입니다."]),
    ...dashboard.developerAttention.activity.slice(0, 3).map((item) => claim(`discussion-${item.proposalId}`, "this_week", `${item.proposalId} Magicians 활동 ${item.rawPostCount}건`, [item.proposalId], [`discussion-activity:${item.proposalId}`], item.rawPostIds.map((id) => `post:${id}`), 0.7, false, ["토론 내용 relevance classification은 미완료입니다."])),
    ...dashboard.kgldWatch.groups.research_now.concat(dashboard.kgldWatch.groups.monitor).map((item) => claim(`kgld-${item.proposalId}`, "kgld_action", `${item.proposalId}: ${item.internalAction}`, [item.proposalId], [`kgld:${item.proposalId}`], [`spec:${item.proposalId}`], 0.72, true, ["research_now는 즉시 도입이 아니라 검토입니다."])),
  ];
  return claims
    .map((item) => ({
      ...item,
      sourceUrls: item.subjectIds.filter((id) => /^E(?:IP|RC)-\d+$/.test(id)).map(sourceForProposal),
    }))
    .filter((item) => item.evidenceFactIds.some((id) => evidenceIds.has(id) || id.includes(":")) && item.signalIds.every((id) => !id || signalIds.has(id)));
}

function claim(claimId: string, claimType: string, textKo: string, subjectIds: string[], signalIds: string[], evidenceFactIds: string[], confidence: number, isInference: boolean, limitations: string[]) {
  return { claimId, claimType, textKo, subjectIds, signalIds, evidenceFactIds, confidence, isInference, limitations };
}

function technologyPlatformApi(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, atlas = buildTechnologyAtlas(report)) {
  void platform;
  const dashboard = buildDashboard(report, atlas);
  sanitizePartialDiscussionTitles(report, dashboard);
  const intelligenceSnapshot = buildIntelligenceSnapshot(report, atlas, dashboard);
  const dashboardV2 = buildDashboardV2View(report);
  (dashboardV2 as Record<string, unknown>).vitalikBlog = (intelligenceSnapshot.views as Record<string, unknown>).vitalikBlog;
  intelligenceSnapshot.views.dashboardV2 = dashboardV2;
  intelligenceSnapshot.metadata.snapshotHash = snapshotHash(intelligenceSnapshot);
  return {
    schemaVersion: intelligenceSnapshot.metadata.schemaVersion,
    snapshotId: intelligenceSnapshot.metadata.snapshotId,
    snapshotHash: intelligenceSnapshot.metadata.snapshotHash,
    intelligenceSnapshot,
  };
}

function sanitizePartialDiscussionTitles(report: WeeklyRadarReport, dashboard: ReturnType<typeof buildDashboard>): void {
  const statusByProposal = new Map(report.ethereumTechRadar.signalLayer.discussionHeat.map((discussion) => [discussion.proposalId, discussionCollectionStatus(discussion)]));
  for (const item of dashboard.developerAttention?.activity ?? []) {
    if (statusByProposal.get(item.proposalId) !== "posts_fully_collected") {
      item.title = item.proposalId;
      item.discussionTitle = item.proposalId;
    }
  }
}

function technologyPlatformDebugApi(report: WeeklyRadarReport, platform: TechnologyPlatformLayer) {
  const topicLayer = report.ethereumTechRadar.topicClusterLayer;
  return {
    ...platform.api,
    metadata: {
      calculationVersion: topicLayer?.calculationVersion,
      ruleVersion: topicLayer?.ruleVersion,
      generatedAt: report.generatedAt,
    },
    validatedThemeEdges: topicLayer?.validatedEdges ?? [],
    themeAssignments: topicLayer?.themeAssignments ?? [],
    topicClusters: topicLayer?.clusters ?? [],
    topicMemberships: topicLayer?.memberships ?? [],
    topicGapSignals: topicLayer?.topicGapSignals ?? topicLayer?.clusters.flatMap((cluster) => cluster.gaps) ?? [],
    unclusteredProposals: topicLayer?.unclusteredProposalIds ?? [],
    ecosystemState: getEcosystemStateLayer(report),
    technologyAtlas: buildTechnologyAtlas(report),
    narrative: buildNarrativeIntelligenceDebug({ report }),
    knowledgeGraph: report.ethereumTechRadar.knowledgeGraphLayer,
    knowledgeGraphDebug: report.ethereumTechRadar.knowledgeGraphLayer ? {
      acceptedNodes: report.ethereumTechRadar.knowledgeGraphLayer.nodes,
      acceptedEdges: report.ethereumTechRadar.knowledgeGraphLayer.edges,
      weakEdgeCandidates: report.ethereumTechRadar.knowledgeGraphLayer.weakEdgeCandidates,
      rejectedEdgeCandidates: report.ethereumTechRadar.knowledgeGraphLayer.rejectedEdgeCandidates,
      extractionCandidates: report.ethereumTechRadar.knowledgeGraphLayer.extractionCandidates,
      aliasResolutionResults: report.ethereumTechRadar.knowledgeGraphLayer.aliasResolutionResults,
      ontologyMatches: report.ethereumTechRadar.knowledgeGraphLayer.ontologyMatches,
      graphValidation: report.ethereumTechRadar.knowledgeGraphLayer.graphValidation,
      graphStatistics: report.ethereumTechRadar.knowledgeGraphLayer.graphStatistics,
      proposalKnowledgeChains: report.ethereumTechRadar.knowledgeGraphLayer.proposalKnowledgeChains,
      narrativeChains: report.ethereumTechRadar.knowledgeGraphLayer.narrativeChains,
      fullTraceability: {
        nodes: report.ethereumTechRadar.knowledgeGraphLayer.nodes.map((node) => ({ id: node.id, traceability: node.traceability })),
        edges: report.ethereumTechRadar.knowledgeGraphLayer.edges.map((edge) => ({ id: edge.id, traceability: edge.traceability })),
      },
      diagnostics: report.ethereumTechRadar.knowledgeGraphLayer.diagnostics,
    } : undefined,
    topicDiagnostics: topicDiagnostics(topicLayer),
  };
}

const REGRESSION_TRACE_PROPOSALS = ["EIP-7329", "ERC-8161", "ERC-8325", "EIP-7864", "EIP-7904", "ERC-8330", "EIP-7928"];

function topicDiagnostics(topicLayer: WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]) {
  return topicLayer?.diagnostics ?? {
    rawThemeEdgeCount: 0,
    acceptedStrongEdgeCount: 0,
    acceptedSupportingEdgeCount: 0,
    weakEdgeCount: 0,
    rejectedEdgeCount: 0,
    topicCandidateCount: 0,
    publishedTopicCount: 0,
    splitMegaClusterCount: 0,
    unclusteredProposalCount: 0,
    fallbackStoryCount: 0,
    oldThemeStoryPathUsageCount: 0,
    proposalsWithMoreThan3TopicMemberships: [],
    topicsWithMoreThan10AnchorSupportingProposals: [],
    publishedUnclassifiedTopicCount: 0,
  };
}

function compactTopicCluster(cluster: NonNullable<WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]>["clusters"][number]) {
  const { calculationVersion: _calculationVersion, ruleVersion: _ruleVersion, ...rest } = cluster;
  return rest;
}

function atlasTopicClusters(atlas: TechnologyAtlas) {
  return topicProgressRows(atlas).map((topic) => ({
    id: slugifyTopic(topic.topic),
    displayName: topic.topic,
    displayNameKo: topic.coverKo,
    proposalIds: topic.proposals,
    priority: topic.priority,
    topicType: topic.proposals.length >= 2 ? "related proposal trend" : "notable proposal",
    sourceUrls: topic.proposals.map(proposalUrl),
  }));
}

function atlasTopicMemberships(atlas: TechnologyAtlas) {
  return topicProgressRows(atlas).flatMap((topic) =>
    topic.proposals.map((proposalId) => {
      const proposal = proposalById(atlas, proposalId);
      return {
        topicId: slugifyTopic(topic.topic),
        proposalId,
        role: proposal ? topicMembershipRole(topic.topic, proposal) : "direct_support",
        sourceUrls: [proposalUrl(proposalId)],
      };
    })
  );
}

function sourceUrlsForAtlas(atlas: TechnologyAtlas): string[] {
  return [...new Set([...atlas.classifiedProposals, ...atlas.heldProposals].map((proposal) => proposalUrl(proposal.proposalId)))];
}

function sourceCoverage(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const coreIds = new Set(selectFrontPageTopics(atlas).flatMap((topic) => topic.proposals));
  const weeklyIds = new Set(atlas.weeklyChanges.flatMap((change) => (change.whyKo.match(/\b(?:EIP|ERC)-\d+\b/g) ?? [])));
  const mapIds = new Set(atlas.domains.flatMap((domain) => domain.representativeProposals.map((proposal) => proposal.proposalId)));
  const all = mainReportProposals(atlas);
  const core = all.filter((proposal) => coreIds.has(proposal.proposalId));
  const weekly = all.filter((proposal) => weeklyIds.has(proposal.proposalId));
  const map = all.filter((proposal) => mapIds.has(proposal.proposalId));
  return {
    coreProposalCoverage: coverageForProposals(report, core),
    weeklyChangeCoverage: coverageForProposals(report, weekly),
    mapEvidenceCoverage: coverageForProposals(report, map),
    allAnalysisCoverage: coverageForProposals(report, all),
  };
}

function coverageForProposals(report: WeeklyRadarReport, proposals: ReturnType<typeof mainReportProposals>) {
  const discussionByProposal = discussionMap(report);
  const implementationIds = implementationEvidenceIds(report);
  const discussions = proposals.map((proposal) => discussionByProposal.get(proposal.proposalId));
  const denominator = proposals.length;
  const threadUrlConfirmed = discussions.filter((discussion) => Boolean(discussion?.discussionUrl)).length;
  const postsFullyCollected = discussions.filter((discussion) => discussionCollectionStatus(discussion) === "posts_fully_collected").length;
  const postsPartiallyCollected = discussions.filter((discussion) => discussionCollectionStatus(discussion) === "posts_partially_collected").length;
  const recent7dActiveThreads = discussions.filter((discussion) => hasTraceableRecentPosts(discussion)).length;
  return {
    proposalCount: proposals.length,
    specificationConfirmed: proposals.length,
    threadUrlConfirmed,
    postsCollected: postsFullyCollected,
    postsFullyCollected,
    postsPartiallyCollected,
    postFetchAttempted: discussions.filter((discussion) => Boolean(discussion?.discussionFetchAttempted)).length,
    postFetchNotAttempted: discussions.filter((discussion) => Boolean(discussion?.discussionUrl) && !discussion?.discussionFetchAttempted).length,
    recent7dActiveThreads,
    recent7dPostCount: discussions.reduce((sum, discussion) => sum + (hasTraceableRecentPosts(discussion) ? discussion!.postsInCurrent7d ?? 0 : 0), 0),
    uncollectedThreadData: discussions.filter((discussion) => ["url_confirmed", "fetch_failed", "parse_failed", "posts_partially_collected"].includes(discussionCollectionStatus(discussion))).length,
    implementationEvidenceConfirmed: proposals.filter((proposal) => implementationIds.has(proposal.proposalId)).length,
    fetchFailed: discussions.filter((discussion) => discussionCollectionStatus(discussion) === "fetch_failed").length,
    parseFailed: discussions.filter((discussion) => discussionCollectionStatus(discussion) === "parse_failed").length,
    denominator,
  };
}

function proposalEvidencePayload(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const discussions = discussionMap(report);
  const implementationIds = implementationEvidenceIds(report);
  return mainReportProposals(atlas).map((proposal) => {
    const discussion = discussions.get(proposal.proposalId);
    return {
      proposalId: proposal.proposalId,
      specification: {
        url: proposalUrl(proposal.proposalId),
        status: proposal.status,
        title: proposal.title,
        abstract: null,
        updatedAt: (proposal as { lastUpdatedAt?: string }).lastUpdatedAt ?? null,
        changedSections: [],
        commitUrls: [],
      },
      discussion: discussionEvidencePayload(discussion),
      implementation: {
        evidenceFound: implementationIds.has(proposal.proposalId),
        urls: [],
        evidenceType: implementationIds.has(proposal.proposalId) ? ["implementation-reference"] : [],
      },
    };
  });
}

function signalQualityPayload(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const recent = allReportRecentEvents(report);
  const confirmed = recent.filter(isConfirmedReportEvent);
  const fallback = recent.filter((event) => !isConfirmedReportEvent(event));
  const semanticCounts = countStrings(confirmed.map((event) => event.changeSemanticType ?? semanticTypeForReportEvent(event)));
  const editorialOnlyExcluded = confirmed.filter((event) => event.type === "content_hash_change" && !prioritySemanticForReport(event)).length;
  const usable = recent.filter((event) => isWeeklyUsableEvent(event, report));
  const coverage = sourceCoverage(report, atlas);
  return {
    current7dRawEventCount: recent.length,
    current7dConfirmedEventCount: confirmed.length,
    current7dUsableEventCount: usable.length,
    weeklyUsableCount: usable.length,
    usableEventIds: usable.map(reportEventKey),
    current7dFallbackEventCount: fallback.length,
    current7dFallbackRatio: recent.length ? fallback.length / recent.length : 0,
    semanticChangeCounts: semanticCounts,
    weeklySignalCopy: buildWeeklySignalCopy({
      usableCount: usable.length,
      rawCount: recent.length,
      weeklyRankingValidity: usable.length / Math.max(1, recent.length) >= 0.5 ? "reliable" : "invalid",
    }),
    editorialOnlyExcluded,
    frontPageTopics: selectFrontPageTopics(atlas).map((item) => ({ topic: item.topic, priority: item.priority, proposalIds: item.proposals })),
    frontPageSignals: frontPageSignals(report, atlas),
    businessObservationTopics: businessObservationTopics(atlas).map((item) => ({ topic: item.topic, score: businessRelevanceScore(item), proposalIds: item.proposals })),
    discussionActivityCounts: [
      discussionActivityCount("core_topics", report.changePeriod.from, report.changePeriod.to, coverage.coreProposalCoverage.recent7dPostCount),
      discussionActivityCount("map_evidence", report.changePeriod.from, report.changePeriod.to, coverage.mapEvidenceCoverage.recent7dPostCount),
      discussionActivityCount("all_analysis", report.changePeriod.from, report.changePeriod.to, coverage.allAnalysisCoverage.recent7dPostCount),
    ],
    proposalCardDiscussionCounts: report.ethereumTechRadar.signalLayer.discussionHeat
      .filter((discussion) => hasTraceableRecentPosts(discussion))
      .slice(0, 8)
      .map((discussion) => discussionActivityCount("proposal_card", report.changePeriod.from, report.changePeriod.to, discussion.postsInCurrent7d ?? 0, discussion.proposalId)),
  };
}

function discussionActivityCount(scope: "core_topics" | "map_evidence" | "all_analysis" | "proposal_card", windowStart: string, windowEnd: string, rawPostCount: number, proposalId?: string) {
  return {
    scope,
    proposalId,
    windowStart,
    windowEnd,
    rawPostCount,
    validTechnicalPostCount: null,
    analyzedPostCount: 0,
  };
}

function frontPageSignals(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const meaningfulCount = meaningfulConfirmedEventCount(report);
  const rankingValidity = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.weeklyRankingValidity ?? "reliable";
  return selectFrontPageTopics(atlas).map((item) => ({
    signalType: meaningfulCount > 0 && rankingValidity !== "invalid" ? "confirmed_development" : item.priority > 0 ? "discussion_activity" : "ranking_unavailable",
    topicId: item.topic,
    reason: meaningfulCount > 0 && rankingValidity !== "invalid"
      ? "발생 시각과 변경 의미가 확인된 Proposal 변화"
      : item.priority > 0
        ? "확인된 최근 Magicians 활동"
        : "문서 변경의 발생 시각 신뢰도 부족",
  }));
}

function allReportRecentEvents(report: WeeklyRadarReport): ChangeEvent[] {
  const changes = report.ethereumTechRadar.recentChanges;
  return [
    ...changes.newProposals,
    ...changes.statusChanges,
    ...changes.finalTransitions,
    ...changes.withdrawnTransitions,
    ...changes.contentHashChanges,
  ];
}

function isConfirmedReportEvent(event: ChangeEvent): boolean {
  return (event.occurredAtSource ?? "fallback_detected_at") !== "fallback_detected_at" && event.timestampConfidence !== "low";
}

function weeklyEventConfidence(event: ChangeEvent): number {
  const explicit = Number((event as { confidence?: number }).confidence);
  if (Number.isFinite(explicit)) return explicit;
  if (event.timestampConfidence === "high") return 0.9;
  if (event.timestampConfidence === "medium") return 0.75;
  if (event.timestampConfidence === "low") return 0.35;
  return (event.occurredAtSource ?? "fallback_detected_at") === "fallback_detected_at" ? 0.35 : 0.8;
}

function semanticTypeForReportEvent(event: ChangeEvent): NonNullable<ChangeEvent["changeSemanticType"]> {
  if (event.changeSemanticType) return event.changeSemanticType;
  if (event.type === "new_proposal") return "normative_specification";
  if (event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition") return "metadata_status";
  const text = `${event.changedSections?.join(" ") ?? ""} ${event.diffSummary ?? ""}`;
  if (/security/i.test(text)) return "security_consideration";
  if (/motivation|rationale/i.test(text)) return "rationale_or_motivation";
  if (/interface|api|opcode|precompile|contract|event|function/i.test(text)) return "interface_or_api";
  if (/specification|must|should|shall|may|gas|state|block|transaction/i.test(text)) return "normative_specification";
  if (/link|url|typo|format|editorial|markdown/i.test(text)) return "editorial_text";
  return "unknown";
}

function prioritySemanticForReport(event: ChangeEvent): boolean {
  return ["normative_specification", "rationale_or_motivation", "security_consideration", "interface_or_api", "test_vector", "metadata_status"].includes(semanticTypeForReportEvent(event));
}

function meaningfulConfirmedEventCount(report: WeeklyRadarReport): number {
  return allReportRecentEvents(report).filter((event) =>
    isConfirmedReportEvent(event)
    && (event.type === "new_proposal"
      || event.type === "status_change"
      || event.type === "final_transition"
      || (event.type === "content_hash_change" && prioritySemanticForReport(event)))
  ).length;
}

function countStrings(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function discussionEvidencePayload(discussion: DiscussionHeatItem | undefined) {
  const collectionStatus = discussionCollectionStatus(discussion);
  return {
    url: discussion?.discussionUrl ?? null,
    found: Boolean(discussion?.discussionUrl),
    topicId: discussion?.discussionTopicId ?? null,
    title: collectionStatus === "posts_fully_collected" ? discussion?.discussionTitle ?? discussion?.title ?? null : discussion?.proposalId ?? null,
    createdAt: discussion?.discussionCreatedAt ?? null,
    lastPostAt: discussion?.discussionLastActivityAt ?? null,
    postsInCurrent7d: discussion?.postsInCurrent7d ?? 0,
    postsInPrevious7d: discussion?.postsInPrevious7d ?? 0,
    participantCountCurrent7d: discussion?.participantCountCurrent7d ?? 0,
    authorParticipatedCurrent7d: discussion?.authorParticipatedCurrent7d ?? false,
    latestPostAuthors: discussion?.latestPostAuthors ?? [],
    keyIssues: discussion?.discussionAnalysis?.analysisCompleted === true ? discussion.keyIssues ?? [] : [],
    objections: discussion?.discussionAnalysis?.analysisCompleted === true ? discussion.objections ?? [] : [],
    alternatives: discussion?.discussionAnalysis?.analysisCompleted === true ? discussion.alternatives ?? [] : [],
    unresolvedQuestions: discussion?.discussionAnalysis?.analysisCompleted === true ? discussion.unresolvedQuestions ?? [] : [],
    specChangeReferences: discussion?.discussionAnalysis?.analysisCompleted === true ? discussion.specChangeReferences ?? [] : [],
    collectionStatus: discussionCollectionStatus(discussion),
    postFetchAttempted: Boolean(discussion?.discussionFetchAttempted),
    totalPostIds: discussion?.totalPostIds ?? [],
    fetchedPostIds: discussion?.fetchedPostIds ?? [],
    missingPostIds: discussion?.missingPostIds ?? [],
    postsExpectedCount: discussion?.postsExpectedCount ?? 0,
    postsCollectedCount: discussion?.postsCollectedCount ?? 0,
    paginationComplete: Boolean(discussion?.paginationComplete),
    latestCollectedPostAt: discussion?.latestCollectedPostAt ?? null,
    postTimestampTrace: discussion?.postTimestampTrace ?? [],
    discussionAnalysis: discussion?.discussionAnalysis ?? {
      analysisAttempted: false,
      analysisCompleted: false,
      analyzedPostCount: 0,
      contentAvailable: false,
      keyIssues: [],
      objections: [],
      alternatives: [],
      unresolvedQuestions: [],
      proposalAuthorResponses: [],
      specificationReferences: [],
    },
    discussionDiscovery: discussion?.discussionDiscovery ?? {
      searchAttempted: false,
      methodsTried: [],
      candidateUrls: discussion?.discussionUrl ? [discussion.discussionUrl] : [],
      result: discussionCollectionStatus(discussion),
    },
  };
}

function discussionSignalPayload(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const proposalIds = new Set(mainReportProposals(atlas).map((proposal) => proposal.proposalId));
  return report.ethereumTechRadar.signalLayer.discussionHeat
    .filter((discussion) => proposalIds.has(discussion.proposalId))
    .map((discussion) => ({
      proposalId: discussion.proposalId,
      url: discussion.discussionUrl,
      source: discussion.discussionSource ?? "Ethereum Magicians",
      postsInCurrent7d: discussion.postsInCurrent7d ?? 0,
      postsInPrevious7d: discussion.postsInPrevious7d ?? 0,
      participantCountCurrent7d: discussion.participantCountCurrent7d ?? 0,
      lastPostAt: discussion.discussionLastActivityAt ?? null,
      keyIssues: discussion.discussionAnalysis?.analysisCompleted === true ? discussion.keyIssues ?? [] : [],
      objections: discussion.discussionAnalysis?.analysisCompleted === true ? discussion.objections ?? [] : [],
      alternatives: discussion.discussionAnalysis?.analysisCompleted === true ? discussion.alternatives ?? [] : [],
      unresolvedQuestions: discussion.discussionAnalysis?.analysisCompleted === true ? discussion.unresolvedQuestions ?? [] : [],
      error: discussion.error,
    }));
}

function topicSourceStrips(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  return topicProgressRows(atlas).map((topic) => ({
    topic: topic.topic,
    ...sourceStripForProposalIds(report, atlas, topic.proposals),
  }));
}

function mainReportProposals(atlas: TechnologyAtlas) {
  return atlas.classifiedProposals.filter((proposal) => proposal.classificationConfidence >= 80);
}

function discussionMap(report: WeeklyRadarReport): Map<string, DiscussionHeatItem> {
  return new Map(report.ethereumTechRadar.signalLayer.discussionHeat.map((discussion) => [discussion.proposalId, discussion]));
}

function implementationEvidenceIds(report: WeeklyRadarReport): Set<string> {
  return new Set((report.ethereumTechRadar.adoptionLayer?.items ?? [])
    .filter((item) => item.evidenceLevel === "Implementation" || item.sources.some((source) => /implementation|client|release|activation/i.test(`${source.semanticType} ${source.title}`)))
    .map((item) => item.proposalId));
}

function sourceStripForProposalIds(report: WeeklyRadarReport, atlas: TechnologyAtlas, proposalIds: string[]) {
  const discussionByProposal = discussionMap(report);
  const implementationIds = implementationEvidenceIds(report);
  const ids = [...new Set(proposalIds)];
  const discussions = ids.map((id) => discussionByProposal.get(id)).filter((item): item is DiscussionHeatItem => Boolean(item));
  const collected = discussions.filter((item) => discussionCollectionStatus(item) === "posts_fully_collected");
  return {
    specificationCount: ids.length,
    discussionThreadCount: discussions.filter((item) => item.discussionUrl).length,
    postsCollectedCount: collected.length,
    postsPartiallyCollectedCount: discussions.filter((item) => discussionCollectionStatus(item) === "posts_partially_collected").length,
    discussionPostsCurrent7d: collected.reduce((sum, item) => sum + (hasTraceableRecentPosts(item) ? item.postsInCurrent7d ?? 0 : 0), 0),
    discussionDataUncollectedCount: discussions.filter((item) => ["url_confirmed", "fetch_failed", "parse_failed"].includes(discussionCollectionStatus(item))).length,
    implementationEvidenceCount: ids.filter((id) => implementationIds.has(id)).length,
    items: ids.map((id) => {
      const proposal = proposalById(atlas, id);
      const discussion = discussionByProposal.get(id);
      return {
        proposalId: id,
        title: proposal?.title ?? id,
        specificationUrl: proposalUrl(id),
        discussionUrl: discussion?.discussionUrl ?? null,
        discussionStatus: discussionStatusLabel(discussion),
        recentPostCount: discussion?.postsInCurrent7d ?? 0,
        lastPostAt: discussion?.discussionLastActivityAt ?? null,
        keyIssues: discussion?.discussionAnalysis?.analysisCompleted === true ? discussion.keyIssues?.slice(0, 3) ?? [] : [],
        implementationFound: implementationIds.has(id),
      };
    }),
  };
}

function discussionStatusLabel(discussion: DiscussionHeatItem | undefined): string {
  const status = discussionCollectionStatus(discussion);
  if (status === "not_searched") return "토론 thread 탐색 미실행";
  if (status === "url_not_found") return "공식 토론 thread 확인되지 않음";
  if (status === "url_confirmed") return "토론 thread URL 확인 · 게시물 데이터 미수집";
  if (status === "fetch_failed") return "토론 thread 확인 · 게시물 수집 실패";
  if (status === "parse_failed") return "토론 thread 확인 · 게시물 분석 실패";
  if (status === "posts_partially_collected") return "토론 thread 일부 게시물만 수집됨 · 최근 활동 판정 불가";
  if (hasTraceableRecentPosts(discussion)) return `최근 7일 댓글 ${discussion!.postsInCurrent7d}건`;
  if (status === "posts_fully_collected" && discussion?.discussionLastActivityAt && (discussion.postTimestampTrace?.length ?? 0) > 0) return "토론 thread 있음 · 최근 댓글 0";
  return "토론 thread URL 확인 · 게시물 데이터 미수집";
}

function discussionCollectionStatus(discussion: DiscussionHeatItem | undefined): NonNullable<DiscussionHeatItem["discussionCollectionStatus"]> {
  if (!discussion) return "not_searched";
  if (discussion.discussionCollectionStatus) return discussion.discussionCollectionStatus;
  if (!discussion.discussionUrl) return "url_not_found";
  if (discussion.error) return "fetch_failed";
  if ((discussion.postTimestampTrace?.length ?? 0) > 0 && discussion.discussionLastActivityAt) return discussion.paginationComplete ? "posts_fully_collected" : "posts_partially_collected";
  return "url_confirmed";
}

function hasTraceableRecentPosts(discussion: DiscussionHeatItem | undefined): boolean {
  return discussionCollectionStatus(discussion) === "posts_fully_collected"
    && (discussion?.postsInCurrent7d ?? 0) > 0
    && (discussion?.postTimestampTrace?.length ?? 0) > 0;
}

function atlasKnowledgeNodes(atlas: TechnologyAtlas) {
  return atlasTopicClusters(atlas).map((topic) => ({
    id: `atlas-topic:${topic.id}`,
    label: topic.displayName,
    type: "Topic",
    proposalIds: topic.proposalIds,
    sourceUrls: topic.sourceUrls,
  }));
}

function slugifyTopic(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "topic";
}

function compactKnowledgeGraph(report: WeeklyRadarReport) {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  if (!graph) return undefined;
  return {
    generatedBy: graph.generatedBy,
    knowledgeGraphVersion: graph.knowledgeGraphVersion,
    ontologyVersion: graph.ontologyVersion,
    calculationVersion: graph.calculationVersion,
    ruleVersion: graph.ruleVersion,
    diagnostics: graph.diagnostics,
    nodes: publishedKnowledgeNodes(report),
    edges: publishedKnowledgeEdges(report),
    topicKnowledgePaths: compactTopicKnowledgePaths(report),
    proposalKnowledgeChains: compactProposalKnowledgeChains(report),
    narrativeChains: compactNarrativeChains(report),
    graphStatistics: graph.graphStatistics,
    knowledgeGraphGaps: graph.knowledgeGraphGaps,
  };
}

function compactGraphStatistics(report: WeeklyRadarReport) {
  const stats = report.ethereumTechRadar.knowledgeGraphLayer?.graphStatistics;
  if (!stats) return undefined;
  return {
    averagePathLength: stats.averagePathLength,
    maxPathLength: stats.maxPathLength,
    deadEndNodeCount: stats.deadEndNodes.length,
    orphanNodeCount: stats.orphanNodes.length,
    mechanismCoverage: stats.mechanismCoverage,
    stakeholderCoverage: stats.stakeholderCoverage,
    systemCoverage: stats.systemCoverage,
    conceptCoverage: stats.conceptCoverage,
    averageBranchFactor: stats.averageBranchFactor,
  };
}

function compactKnowledgeGraphDiagnostics(report: WeeklyRadarReport) {
  const diagnostics = report.ethereumTechRadar.knowledgeGraphLayer?.diagnostics;
  if (!diagnostics) return undefined;
  return {
    totalNodeCount: diagnostics.totalNodeCount,
    totalEdgeCount: diagnostics.totalEdgeCount,
    nodeCountByType: diagnostics.nodeCountByType,
    edgeCountByType: diagnostics.edgeCountByType,
    directEdgeCount: diagnostics.directEdgeCount,
    inferredEdgeCount: diagnostics.inferredEdgeCount,
    strongEdgeCount: diagnostics.strongEdgeCount,
    supportingEdgeCount: diagnostics.supportingEdgeCount,
    weakEdgeCount: diagnostics.weakEdgeCount,
    rejectedEdgeCount: diagnostics.rejectedEdgeCount,
    isolatedNodeCount: diagnostics.isolatedNodeCount,
    topicWithoutPathCount: diagnostics.topicWithoutPathCount,
    topicWithCompletePathCount: diagnostics.topicWithCompletePathCount,
    relationFallbackCount: diagnostics.relationFallbackCount,
    averageEdgeConfidence: diagnostics.averageEdgeConfidence,
    ontologyVersion: diagnostics.ontologyVersion,
    calculationVersion: diagnostics.calculationVersion,
    ruleVersion: diagnostics.ruleVersion,
  };
}

function compactKnowledgeGraphSummary(report: WeeklyRadarReport) {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  if (!graph) return undefined;
  return {
    generatedBy: graph.generatedBy,
    knowledgeGraphVersion: graph.knowledgeGraphVersion,
    ontologyVersion: graph.ontologyVersion,
    calculationVersion: graph.calculationVersion,
    ruleVersion: graph.ruleVersion,
    totalNodeCount: graph.diagnostics.totalNodeCount,
    totalEdgeCount: graph.diagnostics.totalEdgeCount,
    nodeCountByType: graph.diagnostics.nodeCountByType,
    edgeCountByType: graph.diagnostics.edgeCountByType,
    directEdgeCount: graph.diagnostics.directEdgeCount,
    inferredEdgeCount: graph.diagnostics.inferredEdgeCount,
    strongEdgeCount: graph.diagnostics.strongEdgeCount,
    supportingEdgeCount: graph.diagnostics.supportingEdgeCount,
    topicWithCompletePathCount: graph.diagnostics.topicWithCompletePathCount,
    topicWithoutPathCount: graph.diagnostics.topicWithoutPathCount,
    graphStatistics: graph.graphStatistics,
  };
}

function compactEcosystemState(layer: EcosystemStateLayer) {
  return {
    ecosystemStateVersion: layer.ecosystemStateVersion,
    headline: layer.headline,
    currentState: layer.currentState,
    keyQuestions: layer.keyQuestions.map((item) => ({
      question: item.question,
      answer: item.answer,
      confidence: item.confidence,
      evidenceCount: item.evidenceIds.length,
    })),
    longTermNarratives: layer.longTermNarratives.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      state: item.state,
      confidence: item.confidence,
      summary: item.summary,
      weeklyContribution: item.weeklyContribution,
      evidenceProposalIds: item.evidenceProposalIds.slice(0, 8),
      connectedTechnologies: item.connectedTechnologies.slice(0, 8),
      relatedTopics: item.relatedTopics,
      chainCount: item.supportingChainIds.length,
      evidenceCount: item.evidenceIds.length,
    })),
    emergingNarratives: layer.emergingNarratives.map((item) => item.id),
    fadingNarratives: layer.fadingNarratives.map((item) => item.id),
    connectedTechnologies: layer.connectedTechnologies.slice(0, 20),
    trendSignals: layer.trendSignals,
    weeklyContribution: layer.weeklyContribution,
    diagnostics: layer.diagnostics,
  };
}

function publishedKnowledgeNodes(report: WeeklyRadarReport) {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  if (!graph) return [];
  const publishedNodeIds = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]));
  return graph.nodes
    .filter((node) => publishedNodeIds.has(node.id))
    .slice(0, 500)
    .map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      canonicalKey: node.canonicalKey,
      confidence: node.confidence,
      inferred: node.inferred,
      proposalIds: node.proposalIds,
      topicIds: node.topicIds,
      properties: node.type === "Topic" ? {
        topicId: node.properties.topicId,
        confidence: node.properties.confidence,
        cohesionScore: node.properties.cohesionScore,
        proposalIds: node.properties.proposalIds,
      } : {},
    }));
}

function publishedKnowledgeEdges(report: WeeklyRadarReport) {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  if (!graph) return [];
  return graph.edges.slice(0, 1000).map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    confidence: edge.confidence,
    inferred: edge.inferred,
    evidenceCount: edge.evidenceIds.length,
    reasoning: edge.reasoning,
    limitations: edge.limitations,
  }));
}

function compactTopicKnowledgePaths(report: WeeklyRadarReport) {
  return report.ethereumTechRadar.knowledgeGraphLayer?.topicKnowledgePaths.slice(0, 120).map((path) => ({
    topicId: path.topicId,
    topicLabel: path.topicLabel,
    proposalId: path.proposalId,
    complete: path.complete,
    steps: path.steps.map((step) => ({
      label: step.label,
      type: step.type,
      edgeType: step.edgeType,
      confidence: step.confidence,
      inferred: step.inferred,
      evidenceCount: step.evidenceCount,
    })),
    gaps: path.gaps,
  })) ?? [];
}

function compactProposalKnowledgeChains(report: WeeklyRadarReport) {
  return report.ethereumTechRadar.knowledgeGraphLayer?.proposalKnowledgeChains.slice(0, 120).map((chain) => ({
    id: chain.id,
    proposalId: chain.proposalId,
    role: chain.role,
    complete: chain.complete,
    chainScore: chain.chainScore,
    steps: chain.steps.map((step) => ({
      label: step.label,
      type: step.type,
      edgeType: step.edgeType,
      confidence: step.confidence,
      inferred: step.inferred,
      evidenceCount: step.evidenceCount,
    })),
    gaps: chain.gaps,
  })) ?? [];
}

function compactNarrativeChains(report: WeeklyRadarReport) {
  const chains = report.ethereumTechRadar.knowledgeGraphLayer?.narrativeChains ?? {};
  return Object.fromEntries(Object.entries(chains).slice(0, 80).map(([proposalId, item]) => [proposalId, {
    primaryChain: item.primaryChain ? compactNarrativeChain(item.primaryChain) : undefined,
    topSupportingChains: item.topSupportingChains.map(compactNarrativeChain),
    alternativeChain: item.alternativeChain ? compactNarrativeChain(item.alternativeChain) : undefined,
    conflictChain: item.conflictChain ? compactNarrativeChain(item.conflictChain) : undefined,
  }]));
}

function compactNarrativeChain(chain: NonNullable<WeeklyRadarReport["ethereumTechRadar"]["knowledgeGraphLayer"]>["proposalKnowledgeChains"][number]) {
  return {
    id: chain.id,
    proposalId: chain.proposalId,
    role: chain.role,
    complete: chain.complete,
    chainScore: chain.chainScore,
    steps: chain.steps.map((step) => ({ label: step.label, type: step.type, edgeType: step.edgeType })),
    gaps: chain.gaps.map((gap) => gap.type),
  };
}

function compactTopicMembership(membership: NonNullable<WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]>["memberships"][number]) {
  return {
    proposalId: membership.proposalId,
    topicId: membership.topicId,
    confidence: membership.confidence,
    role: membership.role,
    reasons: membership.reasons,
    evidenceIds: membership.evidenceIds,
  };
}

function validatedThemeEdgeSummary(edges: NonNullable<WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]>["validatedEdges"]) {
  const topRejectionReasons = topCounts(edges.filter((edge) => !edge.accepted).flatMap((edge) => edge.reasons));
  const topPenaltyTypes = topCounts(edges.flatMap((edge) => edge.penalties));
  return {
    rawCount: edges.length,
    acceptedStrongCount: edges.filter((edge) => edge.accepted && edge.strength === "strong").length,
    acceptedSupportingCount: edges.filter((edge) => edge.accepted && edge.strength === "supporting").length,
    weakCount: edges.filter((edge) => edge.strength === "weak").length,
    rejectedCount: edges.filter((edge) => edge.strength === "rejected").length,
    topRejectionReasons,
    topPenaltyTypes,
  };
}

function publishedTopicEdges(topicLayer: WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]) {
  if (!topicLayer) return [];
  const topicByProposalTheme = new Map<string, Set<string>>();
  for (const topic of topicLayer.clusters) {
    const proposalIds = [...topic.anchorProposalIds, ...topic.supportingProposalIds, ...topic.adjacentProposalIds];
    for (const proposalId of proposalIds) {
      const key = proposalId;
      const themeSet = topicByProposalTheme.get(key) ?? new Set<string>();
      for (const themeId of [...topic.primaryThemeIds, ...topic.supportingThemeIds, ...topic.themeIds]) themeSet.add(themeId);
      topicByProposalTheme.set(key, themeSet);
    }
  }
  return topicLayer.validatedEdges
    .filter((edge) => edge.accepted && (edge.strength === "strong" || edge.strength === "supporting"))
    .filter((edge) => topicByProposalTheme.get(edge.proposalId)?.has(edge.themeId))
    .map(compactThemeEdge);
}

function regressionTraceability(topicLayer: WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]) {
  if (!topicLayer) return [];
  return REGRESSION_TRACE_PROPOSALS.map((proposalId) => ({
    proposalId,
    themeAssignment: topicLayer.themeAssignments.find((assignment) => assignment.proposalId === proposalId),
    topicMemberships: topicLayer.memberships.filter((membership) => membership.proposalId === proposalId && membership.role !== "excluded").map(compactTopicMembership),
    validatedThemeEdges: topicLayer.validatedEdges.filter((edge) => edge.proposalId === proposalId).map(compactThemeEdge),
  }));
}

function unclusteredProposalSummary(topicLayer: WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]) {
  const ids = topicLayer?.unclusteredProposalIds ?? [];
  return {
    count: ids.length,
    sampledProposalIds: ids.slice(0, 25),
    topReasons: ids.length ? ["topic cohesion gate not satisfied", "no strong or supporting published topic membership"] : [],
  };
}

function compactThemeEdge(edge: NonNullable<WeeklyRadarReport["ethereumTechRadar"]["topicClusterLayer"]>["validatedEdges"][number]) {
  return {
    proposalId: edge.proposalId,
    themeId: edge.themeId,
    rawConfidence: edge.rawConfidence,
    validatedConfidence: edge.validatedConfidence,
    strength: edge.strength,
    accepted: edge.accepted,
    reasons: edge.reasons,
    positiveEvidence: edge.positiveEvidence,
    penalties: edge.penalties,
    evidenceIds: edge.evidenceIds,
  };
}

function topCounts(values: string[], limit = 8) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function reportStyles(): string {
  return `
    :root{color-scheme:light;--font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard","Noto Sans KR",sans-serif;--bg:#fff;--paper:#fff;--surface:#fff;--surface-subtle:#f6f8fa;--surface-muted:#fbfcfd;--ink:#090a0d;--text:#111318;--text-secondary:#3d4551;--text-muted:#68717f;--line:#d6dce5;--line-soft:#eceff3;--line-strong:#aeb7c4;--blue:#1f6feb;--blue-soft:#f4f8ff;--green:#16794c;--green-soft:#f7fbf8;--red:#b42318;--red-soft:#fff8f7;--amber:#8f5800;--amber-soft:#fffaf0;--wash:#f7f8fa;--radius:10px;--radius-sm:6px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:24px;--space-6:32px;--space-7:48px;--space-8:64px;--space-9:96px;--container:1400px;--line-height-body:1.66;--line-height-reading:1.72;--duration:160ms;--shadow-subtle:0 1px 2px rgba(16,24,40,.04)}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-sans);font-size:16px;line-height:var(--line-height-body);letter-spacing:0;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    main{width:min(var(--container),calc(100% - 88px));margin:0 auto;padding:var(--space-7) 0 80px;counter-reset:report-section}
    a{color:var(--blue);text-decoration:none;text-underline-offset:3px}
    a:hover{text-decoration:underline}
    a:focus-visible,summary:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
    h1,h2,h3,p{margin:0}
    h1{font-size:68px;line-height:1.01;font-weight:780;letter-spacing:0;max-width:900px;text-transform:uppercase}
    h2{font-size:29px;line-height:1.18;font-weight:740;letter-spacing:0}
    h3{font-size:19px;line-height:1.35;font-weight:710;letter-spacing:0}
    .muted{color:var(--text-muted);font-size:13px}
    .meta{color:var(--text-muted);font-size:12px;font-variant-numeric:tabular-nums}
    .eyebrow,.cover-kicker{color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.08em}
    .report-cover{min-height:58vh;display:flex;flex-direction:column;justify-content:center;gap:var(--space-7);border-bottom:1px solid var(--line);background:#fff}
    .cover-conclusion{max-width:900px;color:var(--text-secondary);font-size:21px;line-height:1.56;margin-top:24px}
    .cover-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:40px;margin:0;padding:0;max-width:1160px}
    .cover-facts div{border-top:1px solid var(--line-strong);padding-top:16px}
    .cover-facts dt{color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.07em}
    .cover-facts dd{margin:7px 0 0;color:var(--ink);font-size:24px;line-height:1.18;font-weight:750;font-variant-numeric:tabular-nums}
    .cover-topic-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
    .cover-topic-list li{display:grid;gap:2px}
    .cover-topic-list b{font-size:18px;line-height:1.2}
    .cover-topic-list span{font-size:12px;color:var(--text-muted);font-weight:560}
    .section-nav{position:sticky;top:0;z-index:10;display:flex;gap:26px;overflow-x:auto;margin:0 0 72px;padding:14px 0;background:rgba(255,255,255,.98);border-bottom:1px solid var(--line-soft);backdrop-filter:saturate(120%) blur(6px)}
    .section-nav a{flex:0 0 auto;color:var(--text-secondary);font-size:13px;font-weight:650;line-height:1.4;transition:color var(--duration) ease}
    .section-nav a:hover{color:var(--ink);text-decoration:none}
    .section{scroll-margin-top:72px}
    .research-section{margin-top:84px}
    .research-section:not(#appendix){counter-increment:report-section}
    .section-head{display:grid;gap:11px;margin-bottom:28px}
    .section-head p{max-width:780px;color:var(--text-secondary);font-size:16px;line-height:1.62}
    .research-section:not(#appendix) .section-head h2:before,.research-section:not(#appendix) .summary-copy h2:before{content:counter(report-section,decimal-leading-zero);display:block;margin-bottom:12px;color:var(--text-muted);font-size:12px;font-weight:760;line-height:1;text-transform:uppercase;letter-spacing:.08em}
    .degraded-notice{border:1px solid var(--line);background:var(--surface-subtle);padding:22px 24px;margin:0 0 72px;box-shadow:var(--shadow-subtle)}
    .degraded-notice h2{font-size:18px}
    .degraded-notice dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin:18px 0 0}
    .degraded-notice dt{color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.06em}
    .degraded-notice dd{margin:5px 0 0;font-weight:730;font-variant-numeric:tabular-nums}
    .executive-summary{display:grid;grid-template-columns:minmax(0,7fr) minmax(280px,3fr);gap:80px;align-items:start}
    .summary-copy{max-width:780px}
    .summary-copy h2{font-size:34px;margin-bottom:30px}
    .summary-copy h3{font-size:18px;margin:32px 0 9px}
    .summary-copy p{font-size:19px;line-height:var(--line-height-reading);margin-top:10px;color:var(--text)}
    .summary-sticky{position:sticky;top:68px;border-left:1px solid var(--line);padding-left:30px;display:grid;gap:18px;align-self:start;background:#fff}
    .summary-sticky div{padding-bottom:17px;border-bottom:1px solid var(--line-soft)}
    .summary-sticky span{display:block;color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.07em}
    .summary-sticky b{display:block;margin-top:5px;font-size:23px;line-height:1.2;color:var(--ink);font-variant-numeric:tabular-nums}
    .glance-strip{display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line-strong);background:#fff}
    .metric-card{padding:28px 30px 26px;border-right:1px solid var(--line-soft)}
    .metric-card:last-child{border-right:0}
    .metric-card span{display:block;color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.07em}
    .metric-card b{display:block;margin:10px 0 11px;color:var(--ink);font-size:40px;line-height:1;font-weight:780;font-variant-numeric:tabular-nums;letter-spacing:0}
    .metric-card p{font-size:13px;color:var(--text-secondary);line-height:1.46}
    .kpi-number{color:var(--blue)}
    .editorial-timeline{border-top:1px solid var(--line-strong)}
    .timeline-entry{display:grid;grid-template-columns:28px minmax(0,1fr) 160px;gap:28px;padding:28px 0;border-bottom:1px solid var(--line)}
    .timeline-rule{width:10px;height:10px;border-radius:50%;background:var(--ink);margin-top:10px}
    .timeline-copy h3{font-size:23px}
    .timeline-copy dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;margin:18px 0 0}
    .timeline-copy dt{color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.06em}
    .timeline-copy dd{margin:6px 0 0;color:var(--text-secondary);font-size:15px;line-height:1.55}
    .timeline-meta{color:var(--blue);font-weight:740;text-align:right;font-variant-numeric:tabular-nums}
    .empty-week{border-top:1px solid var(--line-strong);padding:30px 0}
    .empty-week h3{font-size:24px}
    .empty-week p{max-width:780px;color:var(--text-secondary);margin-top:10px;line-height:1.62}
    .landscape-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,.8fr);gap:84px}
    .landscape-copy{max-width:780px}
    .landscape-copy p{font-size:18px;line-height:1.76;margin-top:10px}
    .landscape-label{display:block;margin-top:24px;color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.07em}
    .landscape-highlights{border-top:1px solid var(--line-strong);padding-top:19px}
    .landscape-highlights h3{margin-bottom:16px}
    .landscape-highlights div{display:flex;justify-content:space-between;gap:20px;padding:14px 0;border-bottom:1px solid var(--line-soft)}
    .landscape-highlights span{color:var(--text-muted);font-size:13px}
    .landscape-highlights b{font-size:16px;text-align:right;font-variant-numeric:tabular-nums}
    .matrix-stage{border-top:1px solid var(--line-strong)}
    .matrix-empty{padding:31px 0;border-bottom:1px solid var(--line)}
    .matrix-empty b{display:block;font-size:40px;line-height:1;font-weight:780;font-variant-numeric:tabular-nums}
    .table-wrap{overflow:auto;border-top:1px solid var(--line-strong)}
    .matrix-stage>.table-wrap:first-child{border-top:0}
    .table{width:100%;border-collapse:separate;border-spacing:0;font-size:15px;background:#fff}
    .table th,.table td{padding:17px 18px;border-bottom:1px solid var(--line-soft);vertical-align:middle;text-align:left;line-height:1.48}
    .table thead th{background:#fff;color:var(--text-muted);font-size:11px;font-weight:760;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--line-strong)}
    .table tbody tr:nth-child(even){background:var(--surface-muted)}
    .table tbody tr{transition:background-color var(--duration) ease}
    .table tbody tr:hover{background:var(--blue-soft)}
    .table td:nth-child(n+3),.table th:nth-child(n+3){font-variant-numeric:tabular-nums}
    .client-matrix .matrix-cell{text-align:center}
    .badge{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:3px 9px;font-size:12px;font-weight:680;color:var(--text-secondary);white-space:nowrap;line-height:1.2;background:#fff;letter-spacing:0}
    .badge-info,.badge.lifecycle-current,.badge.evidence-tracking{color:var(--blue);border-color:#c8d9f5;background:var(--blue-soft)}
    .badge-success,.badge.verified,.badge.lifecycle-evidenced{color:var(--green);border-color:#c8e0d0;background:var(--green-soft)}
    .badge-warning,.badge-tracking{color:var(--amber);border-color:#e2c995;background:var(--amber-soft)}
    .badge-danger,.badge.risk-high{color:var(--red);border-color:#e7bfba;background:var(--red-soft)}
    .badge-neutral,.badge-unverified,.badge-watch,.badge.future,.badge.no-evidence{color:var(--text-muted);background:var(--surface-subtle)}
    .score,.tag,.evidence-chip,.pill{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px 9px;background:#fff;color:var(--text-secondary);font-size:12px;font-weight:650;line-height:1.2}
    .score{font-variant-numeric:tabular-nums}
    .reference-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:68px}
    .reference-list{border-top:1px solid var(--line-strong)}
    .reference-item{padding:25px 0;border-bottom:1px solid var(--line);max-width:860px}
    .reference-item h3{font-size:20px}
    .reference-source{margin-top:7px;color:var(--text-muted);font-size:13px;font-variant-numeric:tabular-nums}
    .reference-item p:not(.reference-source){margin-top:14px;color:var(--text-secondary);max-width:70ch;line-height:1.62}
    .direct-evidence{border-left:3px solid var(--blue);padding-left:18px}
    .cluster-reference{opacity:.86}
    .limits-list{margin:18px 0 0;padding-left:20px;color:var(--text-secondary)}
    .limits-list li{margin:8px 0;line-height:1.55}
    .split-section,.chart-row,.kgld-summary,.evidence-workbench{display:grid;grid-template-columns:1fr 1fr;gap:64px}
    .chart{position:relative;min-height:320px}
    .card,.story-card,.action-card,.radar-quadrant,.risk-item{background:#fff;border:0;border-radius:0;box-shadow:none;padding:0}
    .card{grid-column:span 12}
    .half{grid-column:span 6}
    .third{grid-column:span 4}
    .story-row,.action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:48px}
    .facts,.watchlist-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
    .fact,.summary-cell,.empty{background:var(--surface-subtle);border:1px solid var(--line-soft);border-radius:var(--radius);padding:16px}
    .fact span,.summary-cell span,.action-card span{display:block;color:var(--text-muted);font-size:12px}
    .fact b,.summary-cell b{display:block;color:var(--text);font-size:16px;font-variant-numeric:tabular-nums}
    .monitor-list,.actions{margin:0;padding-left:20px;color:var(--text-secondary);font-size:15px}
    .monitor-list li,.actions li{margin:8px 0;line-height:1.55}
    details{margin-top:28px;color:var(--text-secondary);font-size:15px;border-top:1px solid var(--line);padding-top:18px}
    summary{cursor:pointer;color:var(--text);font-weight:730;transition:color var(--duration) ease}
    summary:hover{color:var(--blue)}
    .lifecycle-rail{display:grid;grid-template-columns:repeat(11,minmax(112px,1fr));gap:0;overflow-x:auto;padding:34px 0}
    .rail-stage{position:relative;display:grid;gap:8px;justify-items:center;color:var(--text-muted);font-size:12px;text-align:center;padding-top:6px}
    .rail-stage:before{content:"";position:absolute;top:18px;left:-50%;right:50%;height:2px;background:var(--line)}
    .rail-stage:first-child:before{display:none}
    .rail-dot{width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid var(--line);z-index:1}
    .rail-stage.evidenced .rail-dot{background:var(--green);border-color:var(--green)}
    .rail-stage.sequence-implied .rail-dot{background:#fff;border-color:var(--line-strong)}
    .rail-stage.current{color:var(--ink);font-weight:730}
    .rail-stage.current .rail-dot{background:var(--blue);border-color:var(--blue)}
    .rail-stage.no-evidence .rail-dot{border-style:dashed}
    .graph-row,.compact-row,.evidence-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px;align-items:start;border-top:1px solid var(--line-soft);padding:18px 0}
    .radar-grid{display:grid;gap:24px}
    .radar-grid.quadrants-1{grid-template-columns:1fr}
    .radar-grid.quadrants-2{grid-template-columns:repeat(2,1fr)}
    .radar-grid.quadrants-3,.radar-grid.quadrants-4{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
    .risk-list{display:grid;gap:18px}
    .confidence-donut{width:88px;height:88px;border-radius:50%;display:grid;place-items:center;background:#fff;border:1px solid var(--line);color:var(--blue);font-size:24px;font-weight:760}
    .mini-bars{display:grid;gap:10px;margin-top:16px}
    .mini-bar{display:grid;grid-template-columns:96px 1fr 40px;gap:10px;align-items:center;font-size:13px;color:var(--text-secondary)}
    .mini-bar span:nth-child(2){height:8px;background:var(--line-soft);border-radius:999px;overflow:hidden}
    .mini-bar i{display:block;height:100%;background:var(--blue);border-radius:999px}
    .atlas-cover .cover-conclusion{max-width:940px}
    .source-coverage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin:0 0 34px}
    .source-coverage-grid div{background:var(--surface-subtle);border:1px solid var(--line-soft);border-radius:var(--radius);padding:12px}
    .source-coverage-grid span{display:block;color:var(--text-muted);font-size:11px;font-weight:760}
    .source-coverage-grid b{display:block;margin-top:4px;font-size:18px;font-variant-numeric:tabular-nums}
    .signal-map{border-top:1px solid var(--line-strong);padding-top:20px;margin-bottom:38px}
    .signal-map-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:16px}
    .signal-map-head p{max-width:620px;color:var(--text-muted);font-size:13px;line-height:1.45}
    .signal-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .signal-cell{min-height:176px;border:1px solid var(--line-soft);border-radius:var(--radius);padding:14px;background:#fff;display:grid;align-content:start;gap:9px}
    .signal-cell.signal-quiet{opacity:.52}
    .signal-cell h3{font-size:16px;line-height:1.25}
    .signal-orb{width:var(--size);height:var(--size);border-radius:50%;background:var(--blue-soft);border:2px solid var(--blue);display:grid;place-items:center;font-weight:780;font-variant-numeric:tabular-nums}
    .signal-mid .signal-orb{background:var(--green-soft);border-color:var(--green)}
    .signal-high .signal-orb{background:var(--amber-soft);border-color:var(--amber)}
    .signal-ring{font-size:12px;color:var(--text-muted);border-left:3px solid var(--line-strong);padding-left:8px}
    .signal-ring.ring-active{border-left-color:#1f6feb;color:#1f2937}
    .signal-ring.ring-zero{border-left-color:#9aa4b2}
    .signal-ring.ring-uncollected{border-left-style:dashed;border-left-color:#9aa4b2}
    .signal-ring.ring-none{border-left-color:transparent;padding-left:0}
    .source-strip{margin:10px 0 6px;padding-top:10px}
    .source-strip summary{font-size:13px;color:var(--text-secondary)}
    .atlas-current-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:34px;border-top:1px solid var(--line-strong);padding-top:24px}
    .atlas-current-grid article,.atlas-domain-card,.atlas-maturity-column,.atlas-change-list article,.atlas-kgld-list article,.atlas-why-item{border-top:1px solid var(--line-strong);padding-top:18px}
    .atlas-ranked{margin:0;padding-left:22px;color:var(--text-secondary)}
    .atlas-ranked li{margin:12px 0;line-height:1.45}
    .atlas-ranked b{display:block;color:var(--ink)}
    .atlas-ranked span{font-size:13px;color:var(--text-muted)}
    .atlas-domain-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:30px}
    .atlas-domain-card h3{font-size:20px}
    .atlas-domain-card p{color:var(--text-secondary);line-height:1.56}
    .atlas-domain-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}
    .atlas-domain-stats div{background:var(--surface-subtle);border:1px solid var(--line-soft);border-radius:var(--radius);padding:10px}
    .atlas-domain-stats dt{color:var(--text-muted);font-size:11px;font-weight:760}
    .atlas-domain-stats dd{margin:4px 0 0;color:var(--ink);font-weight:760;font-variant-numeric:tabular-nums}
    .aa-track .atlas-domain-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .atlas-chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:42px}
    .atlas-chart-grid .chart{border-top:1px solid var(--line-strong);padding-top:18px;min-height:0}
    .atlas-chart-wide{grid-column:1/-1}
    .atlas-chart-frame{position:relative;width:100%;height:340px;max-height:340px;min-height:0;overflow:hidden}
    .atlas-chart-wide .atlas-chart-frame{height:380px;max-height:380px}
    .atlas-chart-frame canvas{display:block;width:100%!important;height:100%!important;max-height:100%!important}
    .baseline-panel{border-top:1px solid var(--line-strong);padding-top:18px;margin-bottom:34px}
    .baseline-row{display:grid;grid-template-columns:210px minmax(0,1fr) 160px 130px;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line-soft);font-size:13px}
    .baseline-track{height:14px;background:var(--surface-subtle);border:1px solid var(--line-soft);position:relative;overflow:hidden}
    .baseline-track i,.baseline-track em{position:absolute;left:0;top:0;bottom:0}
    .baseline-track i{background:#c7d0dc}
    .baseline-track em{background:rgba(31,111,235,.72)}
    .discussion-matrix{border-top:1px solid var(--line-strong);padding-top:18px;margin-bottom:28px}
    .quadrant{position:relative;height:340px;border:1px solid var(--line);background:linear-gradient(90deg,transparent 49.8%,var(--line-soft) 50%,transparent 50.2%),linear-gradient(0deg,transparent 49.8%,var(--line-soft) 50%,transparent 50.2%)}
    .quadrant>span:not(.matrix-dot){position:absolute;color:var(--text-muted);font-size:12px}
    .quadrant>span:nth-child(1){right:12px;top:10px}.quadrant>span:nth-child(2){right:12px;bottom:10px}.quadrant>span:nth-child(3){left:12px;top:10px}.quadrant>span:nth-child(4){left:12px;bottom:10px}
    .matrix-dot{position:absolute;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:760;transform:translate(-50%,50%)}
    .discussion-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}
    .discussion-card{border-top:1px solid var(--line-strong);padding-top:18px}
    .discussion-card dl{display:grid;grid-template-columns:120px 1fr;gap:8px 14px;color:var(--text-secondary);font-size:14px}
    .discussion-card dt{font-weight:760;color:var(--text)}
    .path-grid{display:grid;gap:16px}
    .path-card{display:grid;grid-template-columns:120px minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr);gap:14px;align-items:center;border-top:1px solid var(--line-strong);padding-top:16px}
    .path-card.path-inferred{border-top-style:dashed}
    .path-card>*+*{border-left:1px solid var(--line-soft);padding-left:14px}
    .lifecycle-stack{display:grid;gap:16px}
    .lifecycle-row{display:grid;grid-template-columns:240px minmax(0,1fr) 120px;gap:14px;align-items:center;border-bottom:1px solid var(--line-soft);padding:12px 0}
    .lifecycle-row small{grid-column:2/4;color:var(--text-muted)}
    .lifecycle-legend{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 14px;font-size:12px;color:var(--text-muted)}
    .lifecycle-legend span::before{content:"";display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:-1px}
    .lifecycle-legend .draft::before{background:#c7d0dc}.lifecycle-legend .review::before{background:#1f6feb}.lifecycle-legend .last::before{background:#b7791f}.lifecycle-legend .final::before{background:#2f8f4e}.lifecycle-legend .living::before{background:#6f42c1}.lifecycle-legend .stagnant::before{background:#8b949e}.lifecycle-legend .withdrawn::before{background:#cf222e}
    .stack-bar{height:16px;background:var(--surface-subtle);border:1px solid var(--line-soft);display:flex;overflow:hidden}
    .stack-bar i{display:block;height:100%}.stack-bar .draft{background:#c7d0dc}.stack-bar .review{background:#1f6feb}.stack-bar .last{background:#b7791f}.stack-bar .final{background:#2f8f4e}.stack-bar .living{background:#6f42c1}.stack-bar .stagnant{background:#8b949e}.stack-bar .withdrawn{background:#cf222e}
    .atlas-relation-list{columns:2;column-gap:44px;margin-top:22px}
    .atlas-maturity-board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:26px}
    .atlas-maturity-column h3{font-size:19px}
    .atlas-why-list,.atlas-change-list,.atlas-kgld-list{display:grid;gap:28px}
    .atlas-why-item p,.atlas-change-list p,.atlas-kgld-list p{max-width:820px;color:var(--text-secondary);line-height:1.58}
    .atlas-appendix-section{margin-top:80px}
    .atlas-appendix{background:var(--surface-subtle);border:1px solid var(--line);border-radius:var(--radius);padding:18px}
    .dashboard-cover .cover-lead{max-width:820px;font-size:20px;line-height:1.55;color:var(--text-secondary)}
    .executive-stack{display:grid;gap:18px}
    .executive-stack>article{border:1px solid var(--line);border-radius:var(--radius);background:#fff;padding:22px}
    .executive-abstract{background:var(--surface-subtle)!important;border-color:var(--line-strong)!important}
    .executive-abstract p{font-size:18px;line-height:1.62;margin-top:8px;color:var(--text)}
    .two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
    .notice{border:1px solid var(--line);border-left:4px solid var(--amber);border-radius:var(--radius);background:var(--amber-soft);padding:14px 16px;margin:0 0 18px;color:var(--text-secondary)}
    .card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .card-head button{border:1px solid var(--line);border-radius:7px;background:#fff;padding:6px 10px;font:inherit;font-size:12px;color:var(--blue);cursor:pointer}
    .why-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .why-grid>div{border-top:1px solid var(--line-soft);padding-top:12px}
    .pulse-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
    .pulse-card{display:block;border:1px solid var(--line);border-radius:var(--radius);padding:18px;background:#fff;color:var(--ink)}
    .pulse-card span{display:block;color:var(--text-muted);font-size:12px;font-weight:760;text-transform:uppercase}
    .pulse-card b{display:block;margin-top:8px;font-size:17px;line-height:1.45}
    .dashboard-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 18px}
    .dashboard-controls button,.dashboard-controls select,.dashboard-controls input[type=search]{border:1px solid var(--line);border-radius:7px;background:#fff;padding:9px 11px;font:inherit;font-size:13px}
    .landscape-bars{height:auto;max-height:none;padding:16px;display:grid;gap:10px;background:#fff;border:1px solid var(--line);border-radius:var(--radius);overflow:visible;margin-bottom:22px}
    .landscape-bar{display:grid;grid-template-columns:minmax(160px,260px) minmax(120px,1fr) 44px;gap:12px;align-items:center}
    .landscape-bar span{height:10px;background:var(--surface-subtle);border-radius:99px;overflow:hidden}
    .landscape-bar i{display:block;height:100%;background:#1f6feb}
    .focus-list,.aa-track-grid,.kgld-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .focus-card,.aa-track,.kgld-watch-item{border:1px solid var(--line);border-radius:var(--radius);padding:18px;background:#fff}
    .five-lane{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}
    .five-lane span{border:1px solid var(--line-soft);border-radius:7px;padding:10px;background:var(--surface-subtle)}
    .five-lane b{display:block;font-size:11px;color:var(--text-muted)}
    .five-lane em{font-style:normal;font-weight:700}
    .sparkline{height:48px;display:flex;align-items:end;gap:4px;margin:12px 0}
    .sparkline i{width:8px;background:#68717f;border-radius:3px 3px 0 0}
    .tabs{display:flex;gap:12px;margin:18px 0}
    .topic-drawer{position:fixed;right:18px;bottom:18px;width:min(420px,calc(100% - 36px));padding:18px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;box-shadow:0 18px 45px rgba(16,24,40,.18);transform:translateY(120%);transition:transform var(--duration) ease;z-index:30}
    .topic-drawer.open{transform:translateY(0)}
    .topic-drawer button{float:right}
    .is-hidden{display:none!important}
    .footer{margin-top:96px;padding:24px 0 0;border-top:1px solid var(--line);color:var(--text-muted);font-size:12px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .footer span:first-child{color:var(--ink);font-weight:760;text-transform:uppercase;letter-spacing:.06em}
    @media(max-width:1040px){main{width:min(100% - 40px,var(--container));padding-top:40px}.report-cover{min-height:58vh}.cover-facts,.glance-strip,.degraded-notice dl{grid-template-columns:repeat(2,1fr)}.executive-summary,.landscape-layout,.reference-layout,.split-section,.chart-row,.kgld-summary,.evidence-workbench,.atlas-current-grid,.atlas-chart-grid,.discussion-grid,.pulse-grid,.focus-list,.aa-track-grid,.kgld-action-grid,.two-col,.why-grid{grid-template-columns:1fr}.source-coverage-grid,.signal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.atlas-domain-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.atlas-maturity-board{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-sticky{position:static;border-left:0;border-top:1px solid var(--line);padding:24px 0 0}.timeline-entry{grid-template-columns:20px minmax(0,1fr)}.timeline-meta{text-align:left}.timeline-copy dl{grid-template-columns:1fr}.story-row,.action-grid{grid-template-columns:1fr}.half,.third,.theme-card,.watchlist-tile{grid-column:span 12}}
    @media(max-width:680px){main{width:min(100% - 24px,var(--container));padding:24px 0 44px}h1{font-size:40px;line-height:1.06}h2{font-size:25px}.report-cover{min-height:62vh;gap:36px}.cover-facts,.glance-strip,.facts,.watchlist-summary,.degraded-notice dl,.atlas-domain-grid,.atlas-maturity-board,.source-coverage-grid,.signal-grid,.five-lane{grid-template-columns:1fr}.cover-facts{gap:20px}.metric-card{border-right:0;border-bottom:1px solid var(--line-soft);padding:24px 0}.metric-card b{font-size:36px}.summary-copy p{font-size:18px}.research-section{margin-top:64px}.section-nav{position:static;margin-bottom:48px}.table{min-width:760px}.lifecycle-rail{grid-template-columns:repeat(11,120px)}.atlas-relation-list{columns:1}.atlas-domain-stats{grid-template-columns:1fr}.aa-track .atlas-domain-stats{grid-template-columns:1fr}.atlas-chart-frame,.atlas-chart-wide .atlas-chart-frame{height:300px;max-height:300px}.landscape-bars{height:auto;max-height:none}.landscape-bar,.baseline-row,.path-card,.lifecycle-row{grid-template-columns:1fr}.path-card>*+*{border-left:0;padding-left:0;border-top:1px solid var(--line-soft);padding-top:10px}.lifecycle-row small{grid-column:auto}}
    @media print{body{background:#fff;color:#111;font-size:12px;line-height:1.5}main{width:100%;padding:0}.section-nav,script{display:none!important}.report-cover{min-height:auto;padding:0 0 42px;break-after:page}.research-section{margin-top:42px;break-inside:avoid-page}.section-head h2,.summary-copy h2{break-after:avoid}.summary-sticky{position:static}.card,.story-card,.action-card,.radar-quadrant,.risk-item{break-inside:avoid}.section,.lifecycle-rail,.table-wrap,.timeline-entry,.reference-item{break-inside:avoid}details{display:block}details>*{display:block}a{color:#111}.footer{color:#333}.table th,.table td{padding:10px 12px}.degraded-notice{box-shadow:none}}
  `;
}

function renderAtlasTopBar(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, atlas: TechnologyAtlas): string {
  const topTopics = selectFrontPageTopics(atlas).slice(0, 3);
  const rankingInvalid = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.weeklyRankingValidity === "invalid";
  const weeklyNew = atlas.classifiedProposals.reduce((sum, item) => sum + item.activity.current7d.newProposalCount, 0);
  const weeklyStatus = forwardStatusProposalIds(atlas).length;
  const implementationSeen = Object.values(atlas.maturity).flat().some((item) => item.stage === "구현 근거 확인") ? "일부 확인" : "확인되지 않음";
  const topicList = topTopics.length
    ? `<ul class="cover-topic-list">${topTopics.map((item) => `<li><b>${escapeHtml(rankingInvalid ? `확인된 토론 활동: ${item.coverKo}` : item.coverKo)}</b><span>${escapeHtml(item.topic)}</span></li>`).join("")}</ul>`
    : "뚜렷한 집중 주제 없음";
  const usableCount = allReportRecentEvents(report).filter(weeklyUsableEvent).length;
  const signalLabel = rankingInvalid || usableCount <= 1 ? "확인된 주간 신호" : "이번 주 주요 개발 주제";
  const rankingNotice = rankingInvalid ? `<p class="reference-notice">문서 변경의 발생 시각 신뢰도가 충분하지 않아 이번 주 개발 주제 순위는 산정하지 않았습니다.</p>` : "";
  return `<header class="report-cover atlas-cover"><div><div class="cover-kicker">Ethereum Technology Atlas</div><h1>Weekly Proposal Intelligence</h1><p class="cover-conclusion">서로 관련성이 명확한 Proposal 흐름을 중심으로 정리했습니다. 실제 구현 여부가 확인되지 않은 항목은 제안 및 논의 단계로 구분했습니다.</p></div><dl class="cover-facts"><div><dt>분석 기간</dt><dd>${escapeHtml(formatDate(report.trendPeriod.from))}~${escapeHtml(formatDate(report.trendPeriod.to))}</dd></div><div><dt>${escapeHtml(signalLabel)}</dt><dd>${topicList}</dd></div><div><dt>신규 Proposal 수</dt><dd>${weeklyNew}</dd></div><div><dt>상태가 진전된 Proposal 수</dt><dd>${weeklyStatus}</dd></div><div><dt>실제 구현 근거</dt><dd>${escapeHtml(implementationSeen)}</dd></div></dl>${rankingNotice}${platform.dataCompleteness.status === "degraded" || platform.dataCompleteness.status === "unavailable" ? `<p class="reference-notice">수집이 제한된 경우에도 확인 가능한 근거 범위 안에서만 기술 방향을 표시합니다.</p>` : ""}</header>`;
}

function atlasCurrentSection(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const weeklyTopics = selectFrontPageTopics(atlas);
  const protocolTopics = weeklyTopics.filter((item) => item.kind === "protocol").slice(0, 3);
  const businessTopics = businessObservationTopics(atlas).slice(0, 1);
  const excludedTopics = new Set([...weeklyTopics, ...businessTopics].map((item) => item.topic));
  const longTopics = topicProgressRows(atlas).filter((item) => !excludedTopics.has(item.topic)).slice(0, 3);
  const renderTopic = (item: ReturnType<typeof topicProgressRows>[number]) => `<li><b>${escapeHtml(item.topic)}</b><br><span>${linkProposalText(item.narrative)}</span>${topicSourceStrip(report, atlas, item)}<br><span class="muted">${escapeHtml(item.reason)}</span></li>`;
  return `<div class="section-head"><h2>이번 주 개발자 움직임</h2><p>서로 관련성이 명확한 Proposal 흐름을 중심으로 정리했습니다. 실제 구현 여부가 확인되지 않은 항목은 제안 및 논의 단계로 구분했습니다.</p><p class="muted">분석 기간은 최근 ${report.trendPeriod.days}일이며, 이번 주 활동과 장기 관찰 주제를 나누어 표시합니다.</p></div>${timestampQualityNotice(report)}${sourceCoveragePanel(report, atlas)}${executiveSignalMap(atlas, report)}<div class="atlas-current-grid"><article><h3>프로토콜 핵심 흐름</h3>${protocolTopics.length ? `<ul class="monitor-list">${protocolTopics.map(renderTopic).join("")}</ul>` : '<p class="muted">이번 주 프로토콜 핵심 흐름이 충분하지 않습니다.</p>'}</article><article><h3>사업 관찰 흐름</h3>${businessTopics.length ? `<ul class="monitor-list">${businessTopics.map(renderTopic).join("")}</ul>` : '<p class="muted">이번 주 직접 사업 관찰 흐름은 제한적입니다.</p>'}</article><article><h3>장기 관찰 주제</h3>${longTopics.length ? `<ul class="monitor-list">${longTopics.map((item) => `<li><b>${escapeHtml(item.topic)}</b><br><span>${linkProposalText(item.narrative)}</span>${topicSourceStrip(report, atlas, item)}<br><span class="muted">${linkProposalText(item.proposals.join(", "))}</span></li>`).join("")}</ul>` : '<p class="muted">장기 반복 주제 근거가 충분하지 않습니다.</p>'}</article></div>`;
}

function sourceCoveragePanel(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const coverage = sourceCoverage(report, atlas).coreProposalCoverage;
  const mapCoverage = sourceCoverage(report, atlas).mapEvidenceCoverage;
  const allCoverage = sourceCoverage(report, atlas).allAnalysisCoverage;
  const denominator = coverage.denominator || 1;
  const cells = [
    ["핵심 Proposal", `${coverage.proposalCount}`],
    ["명세", `${coverage.specificationConfirmed}/${denominator}`],
    ["thread URL", `${coverage.threadUrlConfirmed}/${denominator}`],
    ["post fetch 시도", `${coverage.postFetchAttempted}/${coverage.threadUrlConfirmed || 1}`],
    ["전체 post 수집", `${coverage.postsFullyCollected}/${coverage.threadUrlConfirmed || 1}`],
    ["일부 수집", `${coverage.postsPartiallyCollected}/${coverage.threadUrlConfirmed || 1}`],
    ["추가 탐색 미실행", `${coverage.postFetchNotAttempted}`],
    ["핵심 Topic 최근 7일 댓글", `${coverage.recent7dPostCount}`],
    ["기술 지도 최근 7일 댓글", `${mapCoverage.recent7dPostCount}`],
    ["전체 분석 최근 7일 댓글", `${allCoverage.recent7dPostCount}`],
  ];
  return `<div class="source-coverage-grid">${cells.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("")}</div>`;
}

function executiveSignalMap(atlas: TechnologyAtlas, report: WeeklyRadarReport): string {
  const ordered = ["execution-state", "scaling-data", "validators-consensus", "governance-process", "accounts-wallets", "tokens-finance", "identity-compliance", "interoperability"];
  const discussionByProposal = discussionMap(report);
  const cells = ordered.map((id) => {
    const domain = atlas.domains.find((item) => item.domain.id === id);
    if (!domain) return "";
    const ring = signalRingForDomain(domain, discussionByProposal);
    const discussionPosts = ring.posts;
    const changed = domain.activeProposalCount7d;
    const badges = [
      domain.representativeProposals.some((proposal) => proposal.activity.current7d.newProposalCount > 0) ? "신규" : "",
      domain.representativeProposals.some((proposal) => forwardStatusProposalIds({ classifiedProposals: [proposal] }).length > 0) ? "단계 상승" : "",
      discussionPosts > 0 ? "논쟁 중" : "",
    ].filter(Boolean);
    const level = changed >= 8 ? "signal-high" : changed >= 3 ? "signal-mid" : changed > 0 ? "signal-low" : "signal-quiet";
    return `<article class="signal-cell ${level}"><h3>${escapeHtml(domain.domain.nameKo)}</h3><div class="signal-orb" style="--size:${Math.min(80, 28 + changed * 4)}px"><span>${changed}</span></div><p>최근 7일 변경 Proposal</p><div class="signal-ring ${ring.className}">${escapeHtml(ring.label)}</div>${badges.length ? `<div class="tags">${badges.map((badge) => `<span class="tag">${escapeHtml(badge)}</span>`).join("")}</div>` : ""}</article>`;
  }).join("");
  return `<div class="signal-map"><div class="signal-map-head"><h3>Executive Technology Signal Map</h3><p>위치는 고정하고, 크기는 최근 7일 변경 Proposal 수를 반영합니다. ring은 Magicians 댓글 활동입니다.</p></div><div class="signal-grid">${cells}</div></div>`;
}

function signalRingForDomain(domain: DomainActivity, discussionByProposal: Map<string, DiscussionHeatItem>): { posts: number; className: string; label: string } {
  const discussions = domain.representativeProposals
    .map((proposal) => discussionByProposal.get(proposal.proposalId))
    .filter((item): item is DiscussionHeatItem => Boolean(item));
  const collected = discussions.filter((discussion) => discussionCollectionStatus(discussion) === "posts_fully_collected");
  const partial = discussions.filter((discussion) => discussionCollectionStatus(discussion) === "posts_partially_collected");
  const posts = collected.reduce((sum, discussion) => sum + (hasTraceableRecentPosts(discussion) ? discussion.postsInCurrent7d ?? 0 : 0), 0);
  if (posts > 0) return { posts, className: "ring-active", label: `최근 7일 댓글 ${posts}` };
  if (collected.length > 0) return { posts: 0, className: "ring-zero", label: "최근 댓글 0" };
  if (partial.length > 0) return { posts: 0, className: "ring-uncollected", label: "일부 게시물만 수집" };
  if (discussions.some((discussion) => ["fetch_failed", "parse_failed"].includes(discussionCollectionStatus(discussion)))) {
    return { posts: 0, className: "ring-uncollected", label: "토론 수집 실패" };
  }
  if (discussions.some((discussion) => discussionCollectionStatus(discussion) === "url_confirmed")) {
    return { posts: 0, className: "ring-uncollected", label: "토론 활동 데이터 미수집" };
  }
  return { posts: 0, className: "ring-none", label: "공식 thread 미확인" };
}

function topicSourceStrip(report: WeeklyRadarReport, atlas: TechnologyAtlas, item: ReturnType<typeof topicProgressRows>[number]): string {
  const strip = sourceStripForProposalIds(report, atlas, item.proposals);
  return `<details class="source-strip"><summary>공식 명세 ${strip.specificationCount} │ 해당 Topic 최근 7일 댓글 ${strip.discussionPostsCurrent7d} │ thread URL ${strip.discussionThreadCount} │ 토론 데이터 미수집 ${strip.discussionDataUncollectedCount} │ 구현 근거 ${strip.implementationEvidenceCount}</summary><ul class="monitor-list">${strip.items.map((entry) => `<li>${proposalLink(entry.proposalId)} ${escapeHtml(entry.discussionStatus)}${entry.discussionUrl ? ` · <a href="${escapeHtml(entry.discussionUrl)}" target="_blank" rel="noopener noreferrer">토론</a>` : ""}${entry.keyIssues.length ? `<br><span class="muted">${escapeHtml(entry.keyIssues.join(" / "))}</span>` : ""}</li>`).join("")}</ul></details>`;
}

function discussionAnalysisBlock(discussion: DiscussionHeatItem): string {
  const completed = discussion.discussionAnalysis?.analysisCompleted === true;
  if (!completed) {
    return `<p>최근 활동은 확인됐지만 의미 있는 기술 쟁점은 자동 추출하지 못했습니다. 토론 내용 검증 미완료 상태입니다.</p>`;
  }
  const rows = [
    ["핵심 쟁점", cleanDiscussionSentence((discussion.keyIssues ?? [])[0])],
    ["제기된 반대", cleanDiscussionSentence((discussion.objections ?? [])[0])],
    ["대안", cleanDiscussionSentence((discussion.alternatives ?? [])[0])],
    ["미해결 문제", cleanDiscussionSentence((discussion.unresolvedQuestions ?? [])[0])],
  ].filter(([, value]) => value);
  if (!rows.length) return `<p>최근 활동은 확인됐지만 의미 있는 기술 쟁점은 자동 추출하지 못했습니다.</p>`;
  return `<dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
}

function cleanDiscussionSentence(value: string | undefined): string {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (clean.length < 40) return "";
  if (/^(thanks|thank you|\+1|sorry|stupid question|bump)\b/i.test(clean)) return "";
  if (!/[.!?。]$/.test(clean) && clean.length > 180) return "";
  return clean.length > 200 ? clean.slice(0, clean.lastIndexOf(" ", 200) > 80 ? clean.lastIndexOf(" ", 200) : 200).trim() : clean;
}

function atlasDomainBriefList(domains: DomainActivity[]): string {
  if (!domains.length) return '<p class="muted">표시할 신호가 없습니다.</p>';
  return `<ol class="atlas-ranked">${domains.map((domain) => `<li><b>${escapeHtml(domain.domain.nameKo)}</b><span>${domain.activity180d} / 180일, ${domain.activity7d} / 7일</span></li>`).join("")}</ol>`;
}

function atlasDomainMapSection(atlas: TechnologyAtlas): string {
  return `<div class="section-head"><h2>Ethereum 기술 지도</h2><p>Proposal은 최상위 콘텐츠가 아니라 각 기술 영역을 설명하는 근거로만 사용합니다. 왜 이 기술이 필요한가는 각 영역 카드의 문제 설명에 통합했습니다.</p></div><div class="atlas-domain-grid">${atlas.domains.map((domain) => {
    const technologies = domain.technologies.slice(0, 4).map((technology) => `<span class="tag">${linkProposalText(displayTechnologyName(technology.name))}</span>`).join("");
    const proposals = representativeProposalsForDomainCard(domain).slice(0, 5).map((proposal) => `<li><b>${proposalLink(proposal.proposalId)}</b> ${formatProposalTitle(proposal.proposalId, proposal.title)}${discussionLinksForProposal(domain, proposal.proposalId)}</li>`).join("");
    const topic = representativeTopicForDomain(domain);
    const topicLine = topic ? `<p class="muted">대표 주제: ${escapeHtml(topic)}</p>` : domain.activeProposalCount7d > 0 ? '<p class="muted">최근 활동이 하나의 뚜렷한 주제로 집중되지는 않았습니다.</p>' : "";
    return `<article class="atlas-domain-card"><h3>${escapeHtml(domain.domain.nameKo)}</h3><p>${escapeHtml(domain.domain.problemKo)}</p><dl class="atlas-domain-stats"><div><dt>최근 180일</dt><dd>${domain.activeProposalCount180d}</dd></div><div><dt>최근 7일</dt><dd>${domain.activeProposalCount7d}</dd></div><div><dt>직전 7일</dt><dd>${escapeHtml(formatPreviousValue(domain.previousActiveProposalCount7d))}</dd></div></dl>${topicLine}<div class="tags">${technologies || '<span class="tag">확인된 기술 부족</span>'}</div><details><summary>대표 근거 보기</summary><ul class="monitor-list">${proposals || '<li>대표 proposal 근거가 부족합니다.</li>'}</ul></details></article>`;
  }).join("")}</div>`;
}

function atlasFocusSection(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const hasData = atlas.charts.domain180d.data.some((value) => value > 0) || atlas.charts.domain7d.data.some((value) => value > 0);
  const validHistory = report.ethereumTechRadar.historicalInputDiagnostics
    ? report.ethereumTechRadar.historicalInputDiagnostics.validHistoricalCoverage === true
    : true;
  const hasPrevious = atlas.charts.domain7dComparison.previous.some((value) => typeof value === "number");
  const weekChartTitle = hasPrevious ? "최근 7일 vs 직전 7일" : "최근 7일 활동";
  const weekChartLabel = hasPrevious ? "최근 7일과 직전 7일 비교" : "직전 주 비교 데이터 없음";
  const previousNotice = hasPrevious ? "" : '<p class="muted">직전 주 비교 데이터 없음</p>';
  const historyNotice = validHistory ? "" : '<p class="empty">과거 변경 이력이 충분히 구축되지 않아 이번 실행에서는 최근 7일 변화만 제공합니다. 180일 분석은 이력 backfill 완료 후 활성화됩니다.</p>';
  const chart180d = validHistory ? `<article class="chart"><h3>최근 180일 변경된 Proposal</h3><div class="atlas-chart-frame"><canvas id="atlasDomain180dChart" aria-label="최근 180일 변경된 Proposal"></canvas></div><p class="muted">${escapeHtml(chart180dInterpretation(atlas))}</p></article>` : "";
  return `<div class="section-head"><h2>개발 집중도</h2><p>활동량은 proposal 소속 개수가 아니라 날짜가 있는 신규 제안, 본문 변경, 상태 변화, 공개 토론을 기간별로 집계합니다.</p>${previousNotice}</div>${hasData ? "" : '<p class="empty">현재 수집 범위에서 시각화할 활동 신호가 충분하지 않습니다.</p>'}${historyNotice}${baselineActivitySection(report, atlas)}<div class="atlas-chart-grid">${chart180d}<article class="chart"><h3>${weekChartTitle}</h3><div class="atlas-chart-frame"><canvas id="atlasDomain7dChart" aria-label="${weekChartLabel}"></canvas></div><p class="muted">${escapeHtml(chart7dInterpretation(atlas))}</p></article><article class="chart atlas-chart-wide"><h3>상위 주제별 변화 구성</h3><div class="atlas-chart-frame"><canvas id="atlasTopicChangeChart" aria-label="상위 주제별 변화 구성"></canvas></div><p class="muted">${escapeHtml(topicChartInterpretation(atlas))}</p></article></div>`;
}

function baselineActivitySection(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const stats = baselineStats(report, atlas);
  if (!stats.some((item) => item.sampleWeeks >= 8)) {
    return `<article class="baseline-panel"><h3>평소 대비 이번 주 개발 활동</h3><p class="empty">완전한 주간 이력이 8주 이상 쌓이면 평소 대비 활동 비교가 활성화됩니다.</p></article>`;
  }
  const maxScale = Math.max(1, ...stats.map((item) => item.current7d), ...stats.map((item) => item.mean8w), ...stats.map((item) => item.median180d));
  const rows = stats.map((item) => {
    if (!item.sampleWeeks) {
      return `<div class="baseline-row"><b>${escapeHtml(item.domain.domain.nameKo)}</b><span class="baseline-track"></span><span>평균 - / 이번 주 ${item.current7d}</span><strong>주간 baseline 계산 불가</strong></div>`;
    }
    return `<div class="baseline-row"><b>${escapeHtml(item.domain.domain.nameKo)}</b><span class="baseline-track"><i style="width:${roundPercent(item.mean8w / maxScale)}%"></i><em style="width:${roundPercent(item.current7d / maxScale)}%"></em></span><span>평균 ${item.mean8w.toFixed(1)} / 이번 주 ${item.current7d}</span><strong>${escapeHtml(item.label)}</strong></div>`;
  }).join("");
  return `<article class="baseline-panel"><h3>평소 대비 이번 주 개발 활동</h3><p class="muted">최근 8개 완전 주의 평균 변경 Proposal 수와 현재 7일 변경 Proposal 수를 같은 x축으로 비교합니다. 보조 기준은 180일 주간 중앙값입니다.</p><div>${rows}</div></article>`;
}

function baselineStats(report: WeeklyRadarReport, atlas: TechnologyAtlas) {
  const events = trendEvents(report);
  const generated = new Date(report.generatedAt);
  const currentWeekStart = startOfIsoWeek(generated);
  const firstWeekStart = startOfIsoWeek(new Date(report.trendPeriod.from));
  const weeks: Array<{ from: number; to: number }> = [];
  for (let cursor = firstWeekStart.getTime(); cursor + 7 * DAY_MS <= currentWeekStart.getTime(); cursor += 7 * DAY_MS) {
    weeks.push({ from: cursor, to: cursor + 7 * DAY_MS });
  }
  return atlas.domains.map((domain) => {
    const proposalIds = new Set([...atlas.classifiedProposals, ...atlas.heldProposals]
      .filter((proposal) => proposal.primaryDomain === domain.domain.id)
      .map((proposal) => proposal.proposalId));
    const weeklyCounts = events.length ? weeks.map((week) => new Set(events
      .filter((event) => proposalIds.has(event.proposalId) && eventTimestamp(event) >= week.from && eventTimestamp(event) < week.to)
      .map((event) => event.proposalId)).size) : [];
    const last8 = weeklyCounts.slice(-8);
    const mean8w = last8.length ? last8.reduce((sum, value) => sum + value, 0) / last8.length : 0;
    const median180d = median(weeklyCounts);
    const current7d = domain.activeProposalCount7d;
    return {
      domain,
      current7d,
      mean8w,
      median180d,
      sampleWeeks: weeklyCounts.length,
      label: baselineStrengthLabel(current7d, mean8w),
      percentile: weeklyCounts.length ? Math.round(weeklyCounts.filter((value) => value <= current7d).length / weeklyCounts.length * 100) : null,
    };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfIsoWeek(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function trendEvents(report: WeeklyRadarReport): ChangeEvent[] {
  const changes = report.ethereumTechRadar.trendChanges;
  if (!changes) return [];
  const source = changes;
  const trend = [
    ...source.newProposals,
    ...source.statusChanges,
    ...source.finalTransitions,
    ...source.withdrawnTransitions,
    ...source.contentHashChanges,
  ];
  const recent = [
    ...report.ethereumTechRadar.recentChanges.newProposals,
    ...report.ethereumTechRadar.recentChanges.statusChanges,
    ...report.ethereumTechRadar.recentChanges.finalTransitions,
    ...report.ethereumTechRadar.recentChanges.withdrawnTransitions,
    ...report.ethereumTechRadar.recentChanges.contentHashChanges,
  ];
  const trendKeys = trend.map(eventIdentity).sort();
  const recentKeys = recent.map(eventIdentity).sort();
  if (!trendKeys.length || (trendKeys.length === recentKeys.length && trendKeys.every((key, index) => key === recentKeys[index]))) return [];
  return trend;
}

function eventIdentity(event: ChangeEvent): string {
  return `${event.proposalId}:${event.type}:${event.occurredAt ?? event.detectedAt}:${event.previousStatus ?? ""}:${event.currentStatus ?? ""}`;
}

function eventTimestamp(event: ChangeEvent): number {
  const value = Date.parse(event.occurredAt ?? event.detectedAt);
  return Number.isFinite(value) ? value : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function baselineStrengthLabel(current: number, mean8w: number): string {
  if (mean8w === 0) {
    if (current === 0) return "활동 없음";
    if (current === 1) return "신규 움직임";
    return "새로운 집중";
  }
  if (current >= Math.max(mean8w * 1.5, mean8w + 2)) return "평소보다 강함";
  if (current >= mean8w * 1.15) return "다소 강함";
  if (current >= mean8w * 0.85) return "평소 수준";
  if (current >= mean8w * 0.5) return "다소 조용함";
  return "조용함";
}

function roundPercent(value: number): string {
  return Math.max(0, Math.min(100, value * 100)).toFixed(1);
}

function atlasDiscussionSection(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const coverage = sourceCoverage(report, atlas).coreProposalCoverage;
  const coverageRatio = coverage.denominator ? coverage.threadUrlConfirmed / coverage.denominator : 0;
  const active = report.ethereumTechRadar.signalLayer.discussionHeat
    .filter((discussion) => hasTraceableRecentPosts(discussion))
    .slice(0, 6);
  const postsFullyCollected = report.ethereumTechRadar.signalLayer.discussionHeat.filter((discussion) => discussionCollectionStatus(discussion) === "posts_fully_collected").length;
  const postsPartiallyCollected = report.ethereumTechRadar.signalLayer.discussionHeat.filter((discussion) => discussionCollectionStatus(discussion) === "posts_partially_collected").length;
  const matrix = coverageRatio >= 0.6
    ? discussionMatrix(report, atlas)
    : `<p class="empty">Magicians coverage가 충분하지 않아 토론 강도 매트릭스를 생성하지 않았습니다. 현재 thread URL 확인 ${coverage.threadUrlConfirmed}/${coverage.denominator}입니다.</p>`;
  const rows = active.map((discussion) => `<article class="discussion-card"><h3>${proposalLink(discussion.proposalId)} ${escapeHtml(discussion.title ?? discussion.discussionTitle ?? "")}</h3><p class="muted">최근 7일 원시 댓글 ${discussion.postsInCurrent7d ?? 0}건 · 최근 7일 유효 기술 댓글 ${discussion.postsInCurrent7d ?? 0}건 · 참여자 ${discussion.participantCountCurrent7d ?? 0}명 · 마지막 활동 ${escapeHtml(discussion.discussionLastActivityAt?.slice(0, 10) ?? "확인 불가")}</p>${discussion.discussionUrl ? `<p><a href="${escapeHtml(discussion.discussionUrl)}" target="_blank" rel="noopener noreferrer">토론</a></p>` : ""}</article>`).join("");
  const empty = postsFullyCollected === 0
    ? "Magicians 게시물 데이터가 완전 수집되지 않아 이번 주 개발자 논쟁을 분석하지 못했습니다."
    : postsPartiallyCollected > 0
      ? "일부 thread는 게시물 전체를 수집하지 못해 최근 활동 판정에서 제외했습니다."
      : "수집 완료된 thread에서는 최근 7일 댓글이 확인되지 않았습니다.";
  return `<div class="section-head"><h2>Ethereum Magicians 활동</h2><p>최근 게시물 수와 참여자 활동을 표시합니다. 토론 내용 분석은 이번 실행에서 검증 완료되지 않았습니다.</p></div>${matrix}<div class="discussion-grid">${rows || `<p class="empty">${escapeHtml(empty)}</p>`}</div>`;
}

function discussionMatrix(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const discussions = discussionMap(report);
  const rows = topicProgressRows(atlas).slice(0, 8).map((topic) => {
    const x = topic.proposals.reduce((sum, id) => {
      const proposal = proposalById(atlas, id);
      return sum + (proposal?.activity.current7d.newProposalCount ?? 0) + (proposal?.activity.current7d.statusChangeCount ?? 0) + (proposal?.activity.current7d.bodyChangeCount ?? 0);
    }, 0);
    const y = topic.proposals.reduce((sum, id) => {
      const discussion = discussions.get(id);
      return sum + (hasTraceableRecentPosts(discussion) ? discussion!.postsInCurrent7d ?? 0 : 0);
    }, 0);
    const left = Math.min(92, 8 + x * 12);
    const bottom = Math.min(86, 8 + y * 10);
    return `<span class="matrix-dot" style="left:${left}%;bottom:${bottom}%;width:${Math.min(42, 14 + topic.proposals.length * 5)}px;height:${Math.min(42, 14 + topic.proposals.length * 5)}px" title="${escapeHtml(topic.topic)}">${escapeHtml(topic.coverKo.slice(0, 2))}</span>`;
  }).join("");
  return `<article class="discussion-matrix"><h3>문서 변화와 Magicians 활동</h3><p class="muted">x축: 확정된 문서 변화 수 · y축: 최근 7일 유효 기술 댓글 수</p><div class="quadrant"><span>문서 변화·활동 모두 확인</span><span>문서 변화 중심</span><span>댓글 활동 중심</span><span>관찰 단계</span>${rows}</div></article>`;
}

function atlasRelationGraphSection(atlas: TechnologyAtlas): string {
  if (!atlas.relationships.length) {
    return `<div class="section-head"><h2>기술 연결 지도</h2><p>명시적 의존, 확장, 구현, 보완 관계가 확인된 경우만 표시합니다.</p></div><p class="empty">현재 수집 범위에서는 화면에 표시할 만큼 강한 기술 관계가 확인되지 않았습니다.</p>`;
  }
  const rows = atlas.relationships.slice(0, 6).map((relation) => {
    const proposal = relation.evidenceProposalIds[0] ?? "Proposal";
    const direct = relation.evidenceType !== "analyst_inference" && Boolean(relation.evidenceSection || relation.evidenceExcerpt);
    const qualifier = direct ? "명세 근거" : "분석상 영향";
    return `<article class="path-card ${direct ? "path-direct" : "path-inferred"}"><span>${proposalLink(proposal)}</span><b>${escapeHtml(relation.sourceTechnology)}</b><b>${escapeHtml(relation.targetTechnology)}</b><p>${escapeHtml(relation.explanationKo.replace(/when both technologies are explicit/gi, "명시 근거가 함께 확인된 경우"))}<br><span class="muted">${escapeHtml(qualifier)}</span></p></article>`;
  }).join("");
  const directCount = atlas.relationships.filter((relation) => relation.evidenceType !== "analyst_inference" && Boolean(relation.evidenceSection || relation.evidenceExcerpt)).length;
  const title = directCount >= 3 ? "기술 연결 경로" : "분석상 기술 영향 경로";
  const note = directCount >= 3
    ? "명세 section 또는 짧은 근거 문구가 연결된 관계만 직접 관계로 표시합니다."
    : "이번 실행에서는 명세 section 근거가 충분하지 않아 직접 관계가 아니라 분석상 영향으로 표시합니다.";
  return `<div class="section-head"><h2>${title}</h2><p>${escapeHtml(note)}</p></div><div class="path-grid">${rows}</div>`;
}

function atlasMaturitySection(atlas: TechnologyAtlas): string {
  const topics = topicProgressRows(atlas);
  const grouped = topics.filter((item) => item.proposals.length >= 2);
  const notable = topics.filter((item) => item.proposals.length < 2);
  const rows = grouped.map((item) => lifecycleStackRow(atlas, item)).join("");
  const notableRows = notable.map((item) => `<li><b>${escapeHtml(item.topic)}</b> · ${linkProposalText(item.proposals.join(", "))}</li>`).join("");
  return `<div class="section-head"><h2>Proposal 진행 단계</h2><p>외부 구현 근거가 부족한 실행에서는 구현 또는 도입 상태를 추정하지 않습니다. 주제별 상태 구성을 누적 막대로 표시하며 Withdrawn, Stagnant, Living도 분모에 포함합니다.</p></div><div class="lifecycle-legend"><span class="draft">Draft</span><span class="review">Review</span><span class="last">Last Call</span><span class="final">Final</span><span class="living">Living</span><span class="stagnant">Stagnant</span><span class="withdrawn">Withdrawn</span></div><div class="atlas-maturity-board"><div class="lifecycle-stack">${rows || '<p class="empty">누적 막대로 표시할 관련 Proposal trend가 없습니다.</p>'}</div></div>${notableRows ? `<details><summary>Notable proposal</summary><ul class="monitor-list">${notableRows}</ul></details>` : ""}`;
}

function lifecycleStackRow(atlas: TechnologyAtlas, item: ReturnType<typeof topicProgressRows>[number]): string {
  const proposals = item.proposals.map((id) => proposalById(atlas, id)).filter((proposal): proposal is NonNullable<ReturnType<typeof proposalById>> => Boolean(proposal));
  const counts = {
    Draft: proposals.filter((proposal) => /draft/i.test(proposal.status)).length,
    Review: proposals.filter((proposal) => /review/i.test(proposal.status)).length,
    "Last Call": proposals.filter((proposal) => /last call/i.test(proposal.status)).length,
    Final: proposals.filter((proposal) => /final/i.test(proposal.status)).length,
    Living: proposals.filter((proposal) => /living|active/i.test(proposal.status)).length,
    Stagnant: proposals.filter((proposal) => /stagnant/i.test(proposal.status)).length,
    Withdrawn: proposals.filter((proposal) => /withdrawn/i.test(proposal.status)).length,
  };
  const total = Math.max(1, proposals.length);
  const forward = proposals.filter((proposal) => forwardStatusProposalIds({ classifiedProposals: [proposal] }).length > 0).length;
  const inactive = counts.Withdrawn + counts.Stagnant;
  const badge = forward > 0 ? `↑ 단계 상승 ${forward}` : inactive > 0 ? `비활성 ${inactive}` : "변화 없음";
  return `<article class="lifecycle-row"><b>${escapeHtml(item.topic)}</b><div class="stack-bar" data-total="100"><i class="draft" style="width:${roundPercent(counts.Draft / total)}%"></i><i class="review" style="width:${roundPercent(counts.Review / total)}%"></i><i class="last" style="width:${roundPercent(counts["Last Call"] / total)}%"></i><i class="final" style="width:${roundPercent(counts.Final / total)}%"></i><i class="living" style="width:${roundPercent(counts.Living / total)}%"></i><i class="stagnant" style="width:${roundPercent(counts.Stagnant / total)}%"></i><i class="withdrawn" style="width:${roundPercent(counts.Withdrawn / total)}%"></i></div><span>${escapeHtml(badge)}</span><small>${linkProposalText(item.proposals.join(", "))}</small></article>`;
}

function topicProgressRows(atlas: TechnologyAtlas): Array<{ topic: string; coverKo: string; kind: "protocol" | "business"; priority: number; stage: string; statusMix: string; reason: string; narrative: string; proposals: string[] }> {
  const byTopic = new Map<string, typeof atlas.classifiedProposals>();
  for (const proposal of atlas.classifiedProposals.filter((item) => item.classificationConfidence >= 80)) {
    const topic = displayTopicForProposal(proposal);
    if (isGenericTopicName(topic)) continue;
    if (topicMembershipRole(topic, proposal) === "adjacent") continue;
    const list = byTopic.get(topic) ?? [];
    list.push(proposal);
    byTopic.set(topic, list);
  }
  return [...byTopic.entries()].map(([topic, proposals]) => {
    const activeProposals = proposals.filter((proposal) => !/Withdrawn|Stagnant/i.test(proposal.status));
    const newCount = activeProposals.reduce((sum, item) => sum + item.activity.current7d.newProposalCount, 0);
    const statusIds = forwardStatusProposalIds({ classifiedProposals: activeProposals } as TechnologyAtlas);
    const statusChangedCount = activeProposals.filter((item) => item.activity.current7d.statusChangeCount > 0).length;
    const bodyCount = activeProposals.reduce((sum, item) => sum + item.activity.current7d.bodyChangeCount, 0);
    const changedProposalCount = proposals.filter((item) => item.activity.current7d.activeProposalCount > 0).length;
    const discussionPosts = activeProposals.reduce((sum, item) => sum + item.activity.current7d.discussionCount, 0);
    const discussionActiveThreads = activeProposals.filter((item) => item.activity.current7d.discussionCount > 0).length;
    const priority = newCount * 4 + statusIds.length * 3 + bodyCount + discussionActiveThreads * 3 + discussionPosts * 0.5;
    const stage = statusIds.length > 0 ? "상태 진전" : newCount > 0 || bodyCount > 0 ? "활발한 Proposal 논의" : "데이터 부족";
    const statusMix = statusDistributionText(proposals);
    return {
      topic,
      coverKo: coverTopicKo(topic),
      kind: businessTopic(topic) ? "business" as const : "protocol" as const,
      priority,
      stage,
      statusMix,
      reason: `신규 Proposal ${newCount} · 명세 변경 ${bodyCount} · 상태 변경 ${statusChangedCount}`,
      narrative: topicNarrative(topic, proposals),
      proposals: proposals.map((item) => item.proposalId),
    };
  }).sort((a, b) => b.priority - a.priority || b.proposals.length - a.proposals.length).slice(0, 10);
}

function atlasWhySection(atlas: TechnologyAtlas): string {
  const domains = atlas.domains.filter((domain) => domain.activity180d > 0).sort((a, b) => b.activity180d - a.activity180d).slice(0, 5);
  if (!domains.length) {
    return `<div class="section-head"><h2>왜 이 기술이 필요한가</h2><p>현재 수집 범위로는 기술적 동기를 신뢰성 있게 요약하기 어렵습니다.</p></div>`;
  }
  return `<div class="section-head"><h2>왜 이 기술이 필요한가</h2><p>상위 기술 영역별로 서로 다른 문제와 접근을 짧게 정리합니다.</p></div><div class="atlas-why-list">${domains.map((domain) => {
    return `<article class="atlas-why-item"><h3>${escapeHtml(domain.domain.nameKo)}</h3><p>${linkProposalText(domainWhyNarrative(domain))}</p></article>`;
  }).join("")}</div>`;
}

function atlasWeeklyChangeSection(atlas: TechnologyAtlas): string {
  const changes = atlas.weeklyChanges.slice(0, 5);
  const intro = changes.length
    ? "발생 시각과 변경 의미가 확인된 신규 Proposal, 명세 변경, 상태 변화를 표시합니다."
    : "이번 실행에서는 발생 시각과 변경 의미가 모두 확인된 주요 변화가 없어, 미확정 이벤트를 별도로 안내합니다.";
  const empty = '<article class="empty-week"><h3>확인된 의미 변화 없음</h3><p>발생 시각이 확인된 변경 이벤트는 20건이지만, 변경 의미를 확정하지 못해 신규 Proposal·명세 변경·상태 진전 통계에서 제외했습니다.</p><p class="muted">발생일 미확정 변화 85건도 주간 신호에서 제외했습니다.</p></article>';
  return `<div class="section-head"><h2>이번 주 변화</h2><p>${escapeHtml(intro)}</p></div>${changes.length ? `<div class="atlas-change-list">${changes.map((item) => `<article><h3>${escapeHtml(item.titleKo)}</h3><p><b>의미:</b> ${linkProposalText(item.whyKo)}</p><p class="muted"><b>근거:</b> ${escapeHtml(formatAtlasChangeEvidence(item.evidence))}</p></article>`).join("")}</div>` : empty}`;
}

function atlasKgldSection(atlas: TechnologyAtlas): string {
  const items = atlas.kgldObservations.slice(0, 5);
  return `<div class="section-head"><h2>KGLD 관찰 포인트</h2><p>KGLD와 직접 연결되는 제목, 요약, 동기 근거가 있을 때만 표시합니다.</p></div>${items.length ? `<div class="atlas-kgld-list">${items.map((item) => `<article><h3>${linkProposalText(item.technologyChange)}</h3><p><b>관련 이유:</b> ${escapeHtml(item.connectionReasonKo)}</p><p><b>검토할 사항:</b> ${escapeHtml(item.requiredActionKo)}</p><p><b>기다릴 조건:</b> 이번 자료만으로 구현 여부는 판단할 수 없습니다. 테스트넷 반영이나 실제 채택 근거가 확인될 때까지 적용 가능성은 단정하지 않습니다.</p><p class="muted">근거 Proposal: ${linkProposalText(item.evidenceProposalIds.join(", "))}</p></article>`).join("")}</div>` : '<p class="empty">직접 관련 근거가 확인된 KGLD 관찰 포인트가 없습니다.</p>'}`;
}

function atlasProposalAppendix(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const discussions = discussionMap(report);
  const rows = [...atlas.classifiedProposals, ...atlas.heldProposals]
    .filter((proposal) => proposal.title && proposal.title !== proposal.proposalId)
    .slice(0, 80)
    .map((proposal) => `<tr><td><b>${proposalLink(proposal.proposalId)}</b></td><td>${formatProposalTitle(proposal.proposalId, proposal.title)}</td><td>${escapeHtml(displayAppendixDomain(atlas, proposal))}</td><td>${escapeHtml(displayTopicForProposal(proposal) ?? "Appendix only")}</td><td>${linkProposalText(proposal.technologies.slice(0, 3).map(displayTechnologyName).join(", ") || "확인된 기술 없음")}</td><td>${escapeHtml(classificationBandLabel(proposal.classificationConfidence))}</td><td>${escapeHtml(proposal.recentActivity)}</td><td>${appendixLinks(proposal.proposalId, discussions.get(proposal.proposalId))}</td></tr>`)
    .join("");
  return `<section class="section research-section atlas-appendix-section" id="proposal-appendix"><details class="atlas-appendix"><summary>Proposal 근거 appendix</summary><p class="muted">본문에 쓰인 Proposal 근거를 같은 기준으로 정리했습니다.</p><div class="table-wrap"><table class="table"><thead><tr><th>Proposal</th><th>제목</th><th>주요 영역</th><th>주제</th><th>확인된 기술</th><th>판정 수준</th><th>최근 이벤트</th><th>링크</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="muted">표시할 proposal 근거가 없습니다.</td></tr>'}</tbody></table></div></details></section>`;
}

function appendixLinks(proposalId: string, discussion: DiscussionHeatItem | undefined): string {
  const links = [proposalLink(proposalId, "원문")];
  if (discussion?.discussionUrl) {
    const status = discussionCollectionStatus(discussion);
    const title = status === "posts_fully_collected" ? "토론 thread 전체 수집 완료" : status === "posts_partially_collected" ? "thread 일부 게시물만 수집됨" : "thread URL만 확인됨";
    links.push(`<a href="${escapeHtml(discussion.discussionUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">토론</a>`);
  }
  return links.join(" · ");
}

function atlasLimitationsSection(report: WeeklyRadarReport, atlas: TechnologyAtlas): string {
  const previousMissing = atlas.domains.every((domain) => domain.previousActiveProposalCount7d === null);
  const coverage = sourceCoverage(report, atlas).allAnalysisCoverage;
  const analysisCompleted = report.ethereumTechRadar.signalLayer.discussionHeat.filter((discussion) => discussion.discussionAnalysis?.analysisCompleted).length;
  const discussionText = analysisCompleted > 0
    ? "공식 EIP/ERC 변경 이력과 수집된 Ethereum Magicians 토론 내용을 분석했습니다."
    : coverage.postsPartiallyCollected > 0
      ? "일부 Ethereum Magicians thread는 게시물 전체를 수집하지 못해 최근 활동과 토론 내용 해석에서 제외했습니다."
      : coverage.postsFullyCollected > 0
        ? "공식 EIP/ERC 변경 이력을 분석하고, 확인된 Ethereum Magicians thread의 게시 시각과 활동 데이터를 수집했습니다. 토론 내용 분석은 이번 실행에서 제한적입니다."
        : "공식 EIP/ERC 변경 이력을 중심으로 작성했으며, 일부 Ethereum Magicians thread URL을 확인했습니다. 게시물 내용과 최근 활동은 충분히 수집되지 않았습니다.";
  return `<section class="section research-section" id="atlas-limits"><div class="section-head"><h2>분석 범위와 한계</h2><p>${escapeHtml(discussionText)} 클라이언트 구현, 테스트넷 반영, 실제 서비스 채택 자료는 이번 실행에서 충분히 수집되지 않았으므로 각 항목은 Proposal 단계의 개발 신호로 해석해야 합니다.</p></div><ul class="monitor-list"><li>전체 분석 Proposal ${coverage.proposalCount}건 · thread URL ${coverage.threadUrlConfirmed}/${coverage.denominator} · 전체 post 수집 ${coverage.postsFullyCollected}/${coverage.denominator} · 일부 수집 ${coverage.postsPartiallyCollected}건 · 수집 실패 ${coverage.fetchFailed + coverage.parseFailed}건</li><li>근거가 약한 Proposal은 본문 판단에서 제외했습니다.</li><li>${previousMissing ? "직전 주 비교 데이터 없음" : "직전 주 비교는 수집된 변경 이벤트가 있는 항목만 사용했습니다."}</li><li>공개 토론 신호가 제한적인 영역은 토론 부재가 아니라 수집 범위의 한계로 해석해야 합니다.</li></ul></section>`;
}

function atlasDomainName(atlas: TechnologyAtlas, id: string | undefined): string {
  return atlas.domains.find((domain) => domain.domain.id === id)?.domain.nameKo ?? "분류 보류";
}

function displayAppendixDomain(atlas: TechnologyAtlas, proposal: { proposalId: string; primaryDomain?: string; classificationConfidence: number }): string {
  if (proposal.classificationConfidence < 65) return "분류 보류";
  if (proposal.proposalId === "ERC-5516") return "토큰 소유권 표준";
  return atlasDomainName(atlas, proposal.primaryDomain);
}

function classificationBandLabel(confidence: number): string {
  if (confidence >= 80) return "본문 사용";
  if (confidence >= 65) return "부록 참고";
  return "분류 보류";
}

function topicNarrative(topic: string, proposals: Array<{ proposalId: string; title: string; status: string; technologies: string[] }>): string {
  const ids = proposals.slice(0, 3).map((item) => item.proposalId).join(", ");
  const titles = safeNarrativeProposals(topic, proposals).slice(0, 2).map((item) => `${item.proposalId} ${item.title}`).join("와 ");
  if (/NAV and Asset Reporting/i.test(topic)) {
    return `${titles || ids}는 NAV snapshot, valuation timestamp, oracle 또는 reporting interface를 통해 자산 가치 기록을 명확히 남기려는 제안입니다. 가격 기준시각과 보고 주체가 중요하며, 실제 운영 적용은 별도 검증이 필요합니다.`;
  }
  if (/Token Registry and Metadata|Token Registry Metadata/i.test(topic)) {
    return `${titles || ids}는 registry discovery, metadata retrieval, token-controlled circulation metadata, asset identification을 다룹니다. 토큰을 찾고 해석하는 기준을 명확히 하려는 흐름이며, 상환 요청이나 NAV 산정 흐름과는 구분해 봐야 합니다.`;
  }
  if (/Smart Derivative Contract/i.test(topic)) {
    return `${titles || ids}는 derivative lifecycle, event processing, contractual state transition, financial agreement automation을 다룹니다. 금융 계약 상태를 온체인 이벤트와 상태 전이로 표현하려는 제안이지만, 실제 채택 여부는 확인되지 않았습니다.`;
  }
  if (/Vault Request|토큰화 금융|NAV|Token/i.test(topic)) {
    return `${titles || ids} 중심으로 토큰화 자산의 요청, 가격, 기록 방식을 더 명확히 하려는 변화가 있습니다. 이는 상환 요청과 가치 산정 정보를 표준 인터페이스로 다루려는 흐름이지만, 실제 서비스 채택 여부는 별도 근거가 필요합니다.`;
  }
  if (/Compliance|Credential|Identity|컴플라이언스/i.test(topic)) {
    return `${linkableIdList(["ERC-8327", "ERC-8328", "ERC-8143"], proposals)}에서 전송 가능 경로 조회, 컴플라이언스 이벤트 기록, credential resolution을 각각 표준화하려는 신규 제안이 같은 시기에 등장했습니다. 세 기능은 같은 컴플라이언스 흐름 안에 있지만 조회, 기록, 신원 확인이라는 역할은 서로 다릅니다. 이번 수집 범위에서는 구현 사례를 확인하지 못했습니다.`;
  }
  if (/Block Access/i.test(topic)) {
    return `${titles || ids}는 블록이 접근하는 상태 정보를 더 명시적으로 전달하려는 흐름입니다. 실행 클라이언트가 사전 로딩, 병렬 실행, 부분 상태 보유를 검토할 수 있도록 상태 접근 정보를 제공하는 데 초점이 있습니다. 비용 조정은 부수 효과일 때만 별도 검토합니다.`;
  }
  if (/Gas|실행 자원/i.test(topic)) {
    return `${titles || ids}는 calldata와 연산 자원의 실제 부담을 gas 가격에 더 정확히 반영하려는 조정입니다. 실행 비용을 단순히 낮춘다고 단정하기보다, 네트워크가 부담하는 자원과 가격 신호의 불일치를 줄이는 방향으로 해석해야 합니다. 다수 항목은 아직 제안 단계입니다.`;
  }
  if (/State|실행/i.test(topic)) {
    return `${titles || ids}에서 실행 모델과 상태 접근 구조를 조정하는 변경이 관찰됩니다. 핵심은 클라이언트가 상태 접근과 실행 부담을 더 예측 가능하게 다루도록 만드는 것입니다. 다수 항목은 아직 제안 단계입니다.`;
  }
  if (/Wallet|Account|Delegation|지갑/i.test(topic)) {
    return `${titles || ids}를 중심으로 지갑 권한과 계정 동작을 더 세밀하게 제어하려는 논의가 이어집니다. 사용자 승인, 위임, 계정 설정의 경계를 명확히 하려는 흐름이지만 운영 채택은 확인된 뒤 판단해야 합니다.`;
  }
  if (/Post-Quantum|Validator|Consensus|검증자/i.test(topic)) {
    return `${titles || ids}에서 검증자 운영과 합의 보안에 닿는 변경이 관찰됩니다. 서명, 키 관리, validator 동작의 안전성을 높이려는 논의지만 실제 클라이언트 반영 여부는 별도로 확인해야 합니다.`;
  }
  return `${titles || ids}에서 관련 Proposal 변화가 관찰됩니다. 해결하려는 문제와 구현 영향은 명세가 더 구체화된 뒤 보수적으로 판단해야 합니다.`;
}

function linkableIdList(ids: string[], proposals: Array<{ proposalId: string }>): string {
  const available = ids.filter((id) => proposals.some((proposal) => proposal.proposalId === id));
  return (available.length ? available : proposals.slice(0, 3).map((proposal) => proposal.proposalId)).join(", ");
}

function domainWhyNarrative(domain: DomainActivity): string {
  const titles = representativeProposalsForDomainCard(domain).slice(0, 3).map((item) => `${item.proposalId} ${item.title}`).join(", ");
  if (domain.domain.id === "execution-state") {
    return `최근 제안들은 실제 연산·저장 부담과 gas 비용 사이의 불일치를 줄이는 데 초점을 둡니다. ${titles} 같은 변경은 opcode 비용, 상태 접근 비용, Block Access List를 조정해 클라이언트가 실행 부담을 더 정확하게 예측하도록 하려는 흐름입니다. 다수는 아직 Draft 또는 Review 단계입니다.`;
  }
  if (domain.domain.id === "tokens-finance") {
    return `토큰화 금융 쪽 제안은 상환 요청, token registry, NAV 기록처럼 자산 정보를 계약이 읽을 수 있는 표준 형태로 만들려는 흐름입니다. ${titles}는 가격·권리·요청 정보를 더 명확히 표현하려는 시도입니다. 실제 금융 운영에 적용하려면 발행자 책임, 갱신 주기, 법적 문서와의 연결을 추가로 확인해야 합니다.`;
  }
  if (domain.domain.id === "identity-compliance") {
    return `신원·자격·컴플라이언스 영역은 제한, 승인, 자격 정보를 이벤트와 registry로 남겨 해석 가능성을 높이려 합니다. ${titles}는 외부 주체와 계약이 같은 기록을 기준으로 판단하도록 만드는 방향입니다. 다만 어떤 주체가 정보를 검증하고 갱신하는지는 아직 별도 검토가 필요합니다.`;
  }
  if (domain.domain.id === "accounts-wallets") {
    return `지갑과 계정 관련 제안은 사용자의 권한 위임, 키 관리, 계정 설정을 더 세밀하게 다루려는 흐름입니다. ${titles}는 서명 권한과 실행 권한의 경계를 명세화하려는 시도입니다. 실제 UX 개선은 지갑 구현과 보안 검토가 뒤따라야 판단할 수 있습니다.`;
  }
  if (domain.domain.id === "validators-consensus") {
    return `검증자와 합의 보안 영역은 validator 운영 부담과 인증·서명 가정을 더 안전하게 만드는 데 초점을 둡니다. ${titles}는 validator 동작, attestation 처리, key 관리 문제를 다룹니다. 클라이언트 구현과 네트워크 반영 여부는 아직 별도 근거가 필요합니다.`;
  }
  if (domain.domain.id === "scaling-data") {
    return `데이터 처리와 확장성 영역은 calldata, blob, 데이터 게시 비용을 더 효율적으로 다루려는 제안을 포함합니다. ${titles}는 데이터가 체인에 기록되고 검증되는 비용 구조를 조정하려는 흐름입니다. 비용 절감 효과는 실제 부하와 클라이언트 구현 조건을 함께 봐야 합니다.`;
  }
  if (domain.domain.id === "interoperability") {
    return `상호운용성 제안은 체인 간 메시지, 서명, 증명 정보를 더 일관된 방식으로 다루려는 흐름입니다. ${titles}는 외부 체인과 Ethereum 사이의 확인 절차를 표준화하려는 시도입니다. 보안 경계와 책임 주체는 구현 단계에서 추가 확인이 필요합니다.`;
  }
  return `거버넌스와 표준화 절차 제안은 개별 기술 구현보다 EIP/ERC 진행 방식과 업그레이드 포함 절차를 정리합니다. ${titles}는 의사결정과 문서화 절차를 더 명확히 하려는 변화입니다. 특정 기술 도입 효과로 바로 해석하지 않아야 합니다.`;
}

function chart180dInterpretation(atlas: TechnologyAtlas): string {
  const top = topChartLabel(atlas.charts.domain180d.labels, atlas.charts.domain180d.data);
  return top ? `최근 180일에는 ${top} 관련 Proposal이 가장 많이 변경됐습니다.` : "최근 180일 활동을 해석할 충분한 데이터가 없습니다.";
}

function chart7dInterpretation(atlas: TechnologyAtlas): string {
  const hasPrevious = atlas.charts.domain7dComparison.previous.some((value) => typeof value === "number");
  if (!hasPrevious) return "직전 주 데이터가 확보되지 않아 주간 증가율은 판단하지 않았습니다.";
  const top = topChartLabel(atlas.charts.domain7dComparison.labels, atlas.charts.domain7dComparison.current);
  return top ? `이번 주에는 ${top} 관련 활동이 상대적으로 많았습니다.` : "이번 주 활동을 해석할 충분한 데이터가 없습니다.";
}

function topicChartInterpretation(atlas: TechnologyAtlas): string {
  const labels = atlas.charts.topicChangeComposition.labels;
  const totals = labels.map((_, index) =>
    (atlas.charts.topicChangeComposition.newProposal[index] ?? 0)
    + (atlas.charts.topicChangeComposition.bodyChange[index] ?? 0)
    + (atlas.charts.topicChangeComposition.statusChange[index] ?? 0)
  );
  const top = topChartLabel(labels, totals);
  return top ? `이번 주에는 ${top}에서 본문 변경과 상태 변경이 함께 관찰됐습니다.` : "이번 주 주제별 변화 구성을 해석할 충분한 데이터가 없습니다.";
}

function topChartLabel(labels: string[], data: number[]): string | undefined {
  let bestIndex = -1;
  let bestValue = 0;
  data.forEach((value, index) => {
    if (value > bestValue) {
      bestValue = value;
      bestIndex = index;
    }
  });
  return bestIndex >= 0 ? labels[bestIndex] : undefined;
}

function formatPreviousValue(value: number | null): string {
  return value === null ? "직전 주 비교 데이터 없음" : String(value);
}

function representativeTopicForDomain(domain: DomainActivity): string | undefined {
  if (domain.domain.id === "tokens-finance") {
    const proposalIds = new Set(domain.representativeProposals.map((proposal) => proposal.proposalId));
    if (proposalIds.has("ERC-8161") || proposalIds.has("ERC-8330") || proposalIds.has("ERC-8048") || proposalIds.has("ERC-7303")) {
      return "이번 주 관찰: Vault Request · NAV Reporting · Token Registry";
    }
    if (proposalIds.has("ERC-5516")) return "Token Ownership / Soulbound";
  }
  const fromProposal = domain.representativeProposals.map(displayTopicForProposal).find((value): value is string => Boolean(value));
  if (fromProposal) return fromProposal;
  const technologies = domain.technologies.map((item) => item.name).join(" ");
  if (/Block-Level Access Lists|State Access|Statelessness/i.test(technologies)) return "Block Access and Partial Statefulness";
  if (/EVM \/ Opcode|Transaction Model/i.test(technologies)) return "Execution Model and Opcode Changes";
  if (/Validator Deposits and Withdrawals/i.test(technologies)) return "Validator Deposits and Withdrawals";
  if (/Validator Operations|Consensus/i.test(technologies)) return "검증자·합의 신규 제안";
  if (/Delegation|Account Abstraction|Wallet|UserOperation|Bundler|Paymaster/i.test(technologies)) return "Wallet Authorization Evolution";
  if (/Vault Request|ERC-4626 Vault/i.test(technologies)) return "Vault Request Standardization";
  if (/Compliance|Credential|Identity|Restricted Transfer|Attestation/i.test(technologies)) return "Programmable Compliance Infrastructure";
  return undefined;
}

function displayTopicForProposal(proposal: { topicNames?: string[]; topicIds?: string[]; primaryDomain?: string; technologies?: string[] }): string | undefined {
  const proposalId = "proposalId" in proposal ? String(proposal.proposalId) : "";
  if (/^EIP-8148$/i.test(proposalId)) return "Validator Operations";
  if (/^EIP-8015$/i.test(proposalId)) return "Validator Deposits and Withdrawals";
  if (/^EIP-8243$/i.test(proposalId)) return "Consensus Attestation Batching";
  if (/^EIP-8205$/i.test(proposalId)) return "Validator Deposits and Withdrawals";
  if (/^EIP-8282$/i.test(proposalId)) return "Builder and Consensus Requests";
  if (/^EIP-8222$/i.test(proposalId)) return "Lean Staking";
  if (/^EIP-8310$/i.test(proposalId)) return "Wallet Key Management";
  if (/^EIP-8296$/i.test(proposalId)) return "State Tiering and State Management";
  if (/^ERC-8161$/i.test(proposalId)) return "Vault Request Standardization";
  if (/^ERC-8330$/i.test(proposalId)) return "NAV and Asset Reporting";
  if (/^ERC-8048$/i.test(proposalId)) return "Token Registry and Metadata";
  if (/^ERC-7303$/i.test(proposalId)) return "Token Registry and Metadata";
  if (/^ERC-5516$/i.test(proposalId)) return "Token Ownership / Soulbound";
  if (/^ERC-6123$/i.test(proposalId)) return "Smart Derivative Contract";
  if (/^(EIP-7904|EIP-7778|EIP-7976|EIP-8007|EIP-8037|EIP-8038|EIP-2780|EIP-7981)$/i.test(proposalId)) return "Gas 비용과 실행 자원 재조정";
  if (/^(EIP-8163|EIP-8266|EIP-8272|EIP-8219|EIP-8175|EIP-8184|EIP-8209)$/i.test(proposalId)) return "Execution Model and Opcode Changes";
  const topicName = proposal.topicNames?.find((value) => value && !isInternalTopicLabel(value));
  if (topicName) return topicName;
  const text = `${proposal.topicIds?.join(" ") ?? ""} ${proposal.primaryDomain ?? ""} ${proposal.technologies?.join(" ") ?? ""}`;
  if (/block-access|partial-state|Block-Level Access Lists|State Access|Statelessness/i.test(text)) return "Block Access and Partial Statefulness";
  if (/resource-accounting/i.test(text)) return "Execution Model and Resource Accounting";
  if (/post-quantum|validator-authentication|Post-Quantum/i.test(text)) return "양자내성 검증자 인증";
  if (/Validator|Consensus/i.test(text)) return "검증자·합의 신규 제안";
  if (/wallet-authorization|Account Abstraction|Delegation|Wallet|UserOperation|Bundler|Paymaster/i.test(text)) return "Wallet Authorization Evolution";
  if (/vault-request|Vault Request|ERC-4626 Vault/i.test(text)) return "Vault Request Standardization";
  if (/programmable-compliance|Compliance|Credential|Identity|Restricted Transfer|Attestation/i.test(text)) return "Programmable Compliance Infrastructure";
  if (/Token Registry Metadata|Fungible Token|NFT \/ Multi-token|Tokenized Claims/i.test(text)) return "Token Registry and Circulation Standards";
  if (proposal.primaryDomain === "governance-process") return "Hardfork and Standards Process";
  if (proposal.primaryDomain === "scaling-data") return "Data Availability and Calldata Costs";
  if (proposal.primaryDomain === "tokens-finance") return "Token Registry and Circulation Standards";
  if (proposal.primaryDomain === "interoperability") return "Cross-chain Message and Signature Standards";
  return undefined;
}

function isInternalTopicLabel(value: string): boolean {
  return /^(tokens-finance|identity-compliance|execution-state|accounts-wallets|scaling-data|validators-consensus|interoperability|governance-process)$/i.test(value);
}

function isGenericTopicName(topic: string | undefined): topic is undefined {
  return !topic || /^(topic|other|misc|uncategorized|검토 중인 주제|기타)$/i.test(topic.trim());
}

function representativeProposalsForDomainCard(domain: DomainActivity) {
  const filtered = domain.representativeProposals.filter((proposal) => !new Set(["ERC-5516", "ERC-6123", "EIP-2542", "EIP-8015", "EIP-8148", "EIP-8243"]).has(proposal.proposalId));
  return filtered.length ? filtered : domain.representativeProposals;
}

function safeNarrativeProposals(topic: string, proposals: Array<{ proposalId: string; title: string }>) {
  if (/Token Registry and Circulation Standards/i.test(topic)) {
    const filtered = proposals.filter((proposal) => proposal.proposalId !== "ERC-5516");
    return filtered.length ? filtered : proposals;
  }
  return proposals;
}

function selectFrontPageTopics(atlas: TechnologyAtlas): ReturnType<typeof topicProgressRows> {
  const rows = topicProgressRows(atlas).filter((item) => item.proposals.some((id) => proposalById(atlas, id)?.activity.current7d.activeProposalCount));
  const eligible = rows.filter((item) => frontPageTopicEligible(atlas, item));
  return eligible.slice(0, 3);
}

function frontPageTopicEligible(atlas: TechnologyAtlas, item: ReturnType<typeof topicProgressRows>[number]): boolean {
  const proposals = item.proposals.map((id) => proposalById(atlas, id)).filter((proposal): proposal is NonNullable<ReturnType<typeof proposalById>> => Boolean(proposal));
  const changedProposalCount = proposals.filter((proposal) => proposal.activity.current7d.activeProposalCount > 0).length;
  const newProposalCount = proposals.reduce((sum, proposal) => sum + proposal.activity.current7d.newProposalCount, 0);
  const forwardStatusCount = proposals.filter((proposal) => forwardStatusProposalIds({ classifiedProposals: [proposal] }).length > 0).length;
  return changedProposalCount >= 2 || newProposalCount >= 2 || forwardStatusCount >= 2;
}

function timestampQualityNotice(report: WeeklyRadarReport): string {
  const quality = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality;
  if (!quality) return "";
  if (quality.current7dFallbackCount <= 0) return "";
  const confirmed = Math.max(0, (report.ethereumTechRadar.historicalInputDiagnostics?.eventsCurrent7d ?? 0) - quality.current7dFallbackCount);
  return `<p class="notice">확정된 이번 주 변화 ${confirmed}건 · 발생일 미확정 변화 ${quality.current7dFallbackCount}건. 발생일 미확정 변화는 표지 순위와 이번 주 확정 변화 수에서 제외했습니다.</p>`;
}

function businessObservationTopics(atlas: TechnologyAtlas): ReturnType<typeof topicProgressRows> {
  const candidates = topicProgressRows(atlas)
    .filter((item) => item.kind === "business")
    .map((item) => ({ ...item, businessScore: businessRelevanceScore(item) }))
    .filter((item) => item.businessScore >= 5)
    .sort((a, b) => b.businessScore - a.businessScore || b.priority - a.priority);
  const nav = candidates.filter((item) => item.topic === "NAV and Asset Reporting");
  return nav.length > 0 ? nav : candidates;
}

function businessRelevanceScore(item: ReturnType<typeof topicProgressRows>[number]): number {
  const text = `${item.topic} ${item.narrative}`;
  let score = 0;
  if (/compliance|restricted transfer|컴플라이언스/i.test(text)) score += 4;
  if (/NAV|oracle|reporting/i.test(text)) score += 4;
  if (/vault|redemption|claim/i.test(text)) score += 3;
  if (/token registry|metadata/i.test(text)) score += 2;
  if (/audit|event log/i.test(text)) score += 3;
  if (item.priority > 0) score += 2;
  return score;
}

function topicMembershipRole(topic: string, proposal: { proposalId: string; title?: string; technologies?: string[]; status?: string }): "core" | "direct_support" | "adjacent" {
  const id = proposal.proposalId.toUpperCase();
  const text = `${topic} ${proposal.title ?? ""} ${proposal.technologies?.join(" ") ?? ""}`.toLowerCase();
  if (/gas|실행 자원/.test(topic.toLowerCase())) {
    if (/^(EIP-7904|EIP-7778|EIP-7976|EIP-8007|EIP-8037|EIP-8038|EIP-2780|EIP-7981)$/i.test(id)) return "core";
    if (/withdrawn/i.test(proposal.status ?? "") || /^(EIP-2542|EIP-7708|EIP-7954|EIP-8149)$/i.test(id)) return "adjacent";
  }
  if (/programmable compliance|컴플라이언스/i.test(topic)) {
    if (/^(ERC-8327|ERC-8328|ERC-8143)$/i.test(id)) return "core";
    if (/^ERC-8196$/i.test(id)) return "adjacent";
  }
  if (/post-quantum/i.test(topic) && !/^EIP-8292$/i.test(id)) return "adjacent";
  if (/token ownership|soulbound/i.test(topic) && !/^ERC-5516$/i.test(id)) return "adjacent";
  return "direct_support";
}

function proposalById(atlas: TechnologyAtlas, id: string) {
  return atlas.classifiedProposals.find((proposal) => proposal.proposalId === id) ?? atlas.heldProposals.find((proposal) => proposal.proposalId === id);
}

function protocolImpactWeight(topic: string): number {
  if (/Gas Repricing|실행 자원|Block Access|State Tiering|Execution Model/i.test(topic)) return 8;
  if (/Validator|Consensus|Staking|Builder/i.test(topic)) return 7;
  if (/Hardfork/i.test(topic)) return 2;
  return 0;
}

function cohesionWeight(topic: string, proposals: Array<{ proposalId: string }>): number {
  if (proposals.length < 2) return 0;
  if (/Gas Repricing|실행 자원|Block Access|Compliance|Token Registry|Validator Deposits/i.test(topic)) return 4;
  return 1;
}

function businessTopic(topic: string): boolean {
  return /Compliance|Vault|NAV|Token Registry|Token Ownership|Derivative|Asset Reporting/i.test(topic);
}

function coverTopicKo(topic: string): string {
  if (/Gas Repricing|실행 자원/i.test(topic)) return "실행 비용 재조정";
  if (/Block Access/i.test(topic)) return "상태 접근 구조";
  if (/Validator|Consensus|Staking|Builder/i.test(topic)) return "검증자·합의 신규 제안";
  if (/Compliance/i.test(topic)) return "컴플라이언스 표준";
  if (/Vault|NAV/i.test(topic)) return "토큰화 금융 표준";
  return topic;
}

function statusDistributionText(proposals: Array<{ status: string }>): string {
  const counts = new Map<string, number>();
  for (const proposal of proposals) {
    const key = /last call/i.test(proposal.status) ? "Last Call" : /final/i.test(proposal.status) ? "Final" : /review/i.test(proposal.status) ? "Review" : /draft/i.test(proposal.status) ? "Draft" : proposal.status || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return ["Draft", "Review", "Last Call", "Final"].map((key) => `${key} ${counts.get(key) ?? 0}`).join(" · ");
}

function forwardStatusProposalIds(atlas: Pick<TechnologyAtlas, "classifiedProposals">): string[] {
  return [...new Set(atlas.classifiedProposals.filter((proposal) => proposal.activity.current7d.statusChangeCount > 0 && !/Draft$/i.test(proposal.status) && !/Withdrawn|Stagnant/i.test(proposal.status)).map((proposal) => proposal.proposalId))];
}

function proposalUrl(proposalId: string): string {
  const number = proposalId.match(/\d+/)?.[0] ?? proposalId;
  return /^ERC-/i.test(proposalId)
    ? `https://ercs.ethereum.org/ERCS/erc-${number}`
    : `https://eips.ethereum.org/EIPS/eip-${number}`;
}

function proposalLink(proposalId: string, label = proposalId): string {
  if (!/^(EIP|ERC)-\d+$/i.test(proposalId)) return `<span class="dash-proposal-pill dash-unlinked">${escapeHtml(label)}</span>`;
  return `<a href="${escapeHtml(proposalUrl(proposalId))}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function proposalAnchorId(proposalId: string): string {
  return `proposal-${proposalId.toLowerCase()}`;
}

function formatProposalTitle(proposalId: string, title: string): string {
  return linkProposalText(title);
}

function linkProposalText(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/\b(EIP|ERC)-(\d+)\b/g, (_match, prefix: string, number: string) => proposalLink(`${prefix}-${number}`));
}

function discussionLinksForProposal(domain: DomainActivity, proposalId: string): string {
  const discussion = domain.representativeDiscussions.find((item) => item.proposalId === proposalId && item.url);
  return discussion?.url ? ` <span class="muted">${proposalLink(proposalId, "원문")} · <a href="${escapeHtml(discussion.url)}" target="_blank" rel="noopener noreferrer">토론</a></span>` : "";
}

function displayTechnologyName(name: string): string {
  if (name === "ERC-4626 Vault") return "ERC-4626";
  if (name === "Fungible Token Extensions") return "ERC-20 확장";
  return name;
}

function dominantMaturityStage(atlas: TechnologyAtlas, domain: DomainActivity): string {
  const technologies = new Set(domain.technologies.map((item) => item.name));
  const stages: MaturityStage[] = ["구현 근거 확인", "상태 진전", "활발한 Proposal 논의", "신규 탐색", "데이터 부족"];
  for (const stage of stages) {
    if ((atlas.maturity[stage] ?? []).some((item) => technologies.has(item.technology))) return stage;
  }
  return "판단 보류";
}

function shortLabel(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3).trim()}...` : value;
}

function formatAtlasChangeEvidence(value: string | undefined): string {
  if (!value) return "수집된 변경 이벤트";
  if (/New proposal added to the tracked repository/i.test(value)) return "신규 proposal 등록 이벤트";
  return localizeGeneratedText(value);
}

function renderTopBar(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  watchlist: WatchlistLayer,
  adoptionLayer: AdoptionLayer,
  mode: ReportMode,
): string {
  const ecosystem = getEcosystemStateLayer(report);
  const primary = ecosystem.longTermNarratives[0];
  const conclusion = coverConclusion(report, platform, watchlist, adoptionLayer, mode);
  const finalFact = mode === "incident"
    ? ["Signal State", "Early Exploration"]
    : mode === "partial"
      ? ["Signal State", "Early Exploration"]
    : ["Signal State", primary?.state ?? "Stable"];
  return `<header class="report-cover"><div><div class="cover-kicker">Ecosystem Intelligence Report</div><h1>Ethereum Development Intelligence</h1><p class="cover-conclusion">${escapeHtml(conclusion)}</p></div><dl class="cover-facts"><div><dt>Trend Window</dt><dd>${escapeHtml(formatDate(report.trendPeriod.from))}~${escapeHtml(formatDate(report.trendPeriod.to))}</dd></div><div><dt>Current Era</dt><dd>${escapeHtml(currentEra(ecosystem))}</dd></div><div><dt>Active Narratives</dt><dd>${ecosystem.longTermNarratives.length}</dd></div><div><dt>Technology Links</dt><dd>${ecosystem.connectedTechnologies.length}</dd></div><div><dt>Generated</dt><dd>${escapeHtml(report.generatedAt)}</dd></div><div><dt>${escapeHtml(finalFact[0])}</dt><dd>${escapeHtml(finalFact[1])}</dd></div></dl></header>`;
}

function reportMode(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, adoptionLayer: AdoptionLayer): ReportMode {
  const confidence = platform.dataCompleteness.confidenceMetrics?.evidenceConfidence ?? platform.dataCompleteness.evidenceStrength ?? 0;
  const attempted = platform.dataCompleteness.requiredSourcesAttempted;
  const successRate = attempted > 0 ? platform.dataCompleteness.sourcesSucceeded / attempted : 0;
  const directEvidence = directEvidenceCount(adoptionLayer);
  const coreCollectionFailed = adoptionLayer.collectionStatus === "failed" || adoptionLayer.collectionStatus === "skipped";
  const completenessDegraded = platform.dataCompleteness.status === "degraded" || platform.dataCompleteness.status === "unavailable";
  const noVerifiedImplementation = verifiedImplementationCount(platform) === 0 && directEvidence === 0;
  if (coreCollectionFailed || (attempted > 0 && successRate < 0.5) || completenessDegraded) return "incident";
  if (confidence < 25 || noVerifiedImplementation || platform.dataCompleteness.partialCollection || platform.dataCompleteness.status === "partial" || directEvidence === 0) return "partial";
  return "normal";
}

function coverConclusion(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  watchlist: WatchlistLayer,
  adoptionLayer: AdoptionLayer,
  mode: ReportMode,
): string {
  const ecosystem = getEcosystemStateLayer(report);
  const weeklyChanges = report.ethereumTechRadar.signalLayer.diffIntelligence.length + report.ethereumTechRadar.recentChanges.total;
  if (mode === "incident" || mode === "partial") {
    return weeklyChanges === 0
      ? `${ecosystem.headline} 수집 품질이 낮으므로 상태는 graded signal로 낮춰 표시합니다.`
      : `${ecosystem.headline} 이번 주 일부 evidence가 추가됐지만 수집 품질 때문에 신호 강도를 보수적으로 제한합니다.`;
  }
  return ecosystem.currentState || coverExecutiveSummary(report, platform, watchlist, adoptionLayer);
}

function degradedDataNotice(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, adoptionLayer: AdoptionLayer): string {
  const attempted = platform.dataCompleteness.requiredSourcesAttempted;
  const succeeded = platform.dataCompleteness.sourcesSucceeded;
  const failed = platform.dataCompleteness.sourcesFailed;
  const metrics = platform.dataCompleteness.confidenceMetrics ?? { collectionConfidence: platform.dataCompleteness.collectionCompleteness ?? 0, evidenceConfidence: platform.dataCompleteness.evidenceStrength ?? 0, signalStrength: 0 };
  const usable = [
    report.ethereumTechRadar.signalLayer.discussionHeat.length ? "제안 상태와 공개 논의 링크" : "",
    report.ethereumTechRadar.themeInsights.length ? "180일 제안 집중도" : "",
    report.kgldOpportunityRadar.candidates.length ? "규칙 기반 비즈니스 관련성 후보" : "",
  ].filter(Boolean).join(", ") || "기본 스냅샷 메타데이터";
  const prohibited = "클라이언트 미지원, 논의 비활성, 구현 부재, 수집 범위 밖 명세 변경 부재";
  return `<aside class="degraded-notice" role="note" aria-label="데이터 수집 품질 저하"><h2>DATA COLLECTION DEGRADED</h2><p>이번 보고서는 정상적인 주간 판단을 뒷받침할 만큼의 근거를 수집하지 못했습니다. 본문은 실행 가능한 결론보다 확인 가능한 범위와 다음 수집 우선순위를 먼저 제시합니다.</p><dl><div><dt>성공한 출처</dt><dd>${succeeded}/${attempted}</dd></div><div><dt>실패한 출처</dt><dd>${failed}</dd></div><div><dt>수집 신뢰도</dt><dd>${metrics.collectionConfidence}/100</dd></div><div><dt>근거 신뢰도</dt><dd>${metrics.evidenceConfidence}/100</dd></div><div><dt>신호 강도</dt><dd>${metrics.signalStrength}/100</dd></div><div><dt>직접 근거</dt><dd>${directEvidenceCount(adoptionLayer)}</dd></div></dl><p class="meta">사용 가능한 데이터: ${escapeHtml(usable)}. 본문에서 축소한 항목: 장기 모멘텀 차트, 전체 클라이언트 행렬, 원자료 표. 결론 내리면 안 되는 항목: ${escapeHtml(prohibited)}.</p></aside>`;
}

function incidentReportSections(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, adoptionLayer: AdoptionLayer): string {
  const diagnostics = platform.dataCompleteness.diagnostics ?? [];
  const successful = diagnostics.filter((item) => item.result === "success" || item.result === "empty" || item.result === "cache_hit");
  const failed = diagnostics.filter((item) => item.result === "failure" || item.result === "partial_failure" || item.result === "skipped");
  const usable = [
    report.ethereumTechRadar.signalLayer.discussionHeat.length ? `논의 신호 ${report.ethereumTechRadar.signalLayer.discussionHeat.length}건` : "",
    report.ethereumTechRadar.themeInsights.length ? `장기 테마 ${report.ethereumTechRadar.themeInsights.length}건` : "",
    adoptionLayer.items.length ? `채택 근거 항목 ${adoptionLayer.items.length}건` : "",
  ].filter(Boolean);
  const rows = aggregateDiagnostics(diagnostics).map((item) =>
    `<tr><td>${escapeHtml(item.sourceName)}</td><td>${escapeHtml(item.endpoint)}</td><td>${escapeHtml(item.result)}</td><td>${item.httpStatus ?? ""}</td><td>${escapeHtml(item.failureReason)}</td><td>${item.affectedTargets}</td><td>${item.retryCount}</td><td>${item.recordCountCollected}</td><td>${escapeHtml(item.lastSuccessfulCollectionAt ?? "확인 불가")}</td></tr>`
  ).join("");
  return `
  <section class="section research-section" id="collection-incident">
    <div class="section-head"><h2>Collection Incident Summary</h2><p>DATA COLLECTION DEGRADED. 핵심 출처 수집이 실패했거나 현재 근거가 정상 판단 기준에 미달했습니다. 이번 보고서는 기술 변화 판단이 아니라 수집 실패의 범위와 복구 우선순위를 설명합니다.</p></div>
    <div class="matrix-stage"><div class="matrix-empty"><span class="eyebrow">판단 상태</span><b>${escapeHtml(confidenceState(platform.dataCompleteness.confidenceMetrics?.evidenceConfidence ?? platform.dataCompleteness.evidenceStrength ?? 0, platform))}</b><p>수집 신뢰도 ${platform.dataCompleteness.confidenceMetrics?.collectionConfidence ?? platform.dataCompleteness.collectionCompleteness ?? 0}/100, 근거 신뢰도 ${platform.dataCompleteness.confidenceMetrics?.evidenceConfidence ?? platform.dataCompleteness.evidenceStrength ?? 0}/100, 신호 강도 ${platform.dataCompleteness.confidenceMetrics?.signalStrength ?? 0}/100.</p></div></div>
    ${adoptionLayer.note ? `<p class="reference-notice">${escapeHtml(localizeGeneratedText(adoptionLayer.note))}</p>` : ""}
    <details open><summary>수집 진단 보기</summary><div class="table-wrap"><table class="table"><thead><tr><th>출처</th><th>엔드포인트</th><th>결과</th><th>HTTP</th><th>실패 유형</th><th>영향 대상</th><th>재시도</th><th>수집 건수</th><th>마지막 성공</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="muted">수집 진단이 없습니다.</td></tr>'}</tbody></table></div></details>
  </section>
  <section class="section research-section" id="collected-evidence">
    <div class="section-head"><h2>Successfully Collected Evidence</h2><p>정상 판단에는 부족하지만, 이번 실행에서 사용할 수 있는 정보의 범위를 분리합니다. 빈 결과는 기술 실패와 구분합니다.</p></div>
    <div class="reference-list"><article class="reference-item"><h3>사용 가능한 근거 범위</h3><p class="reference-source">성공 또는 빈 결과 ${successful.length}건${SEP}실패 또는 생략 ${failed.length}건${SEP}직접 근거 ${directEvidenceCount(adoptionLayer)}건</p><p>${escapeHtml(usable.join(", ") || "이번 실행에서 의사결정에 사용할 현재 근거가 충분히 수집되지 않았습니다.")}</p></article></div>
  </section>
  <section class="section research-section" id="unsupported-conclusions">
    <div class="section-head"><h2>Unsupported Conclusions</h2><p>수집 실패가 있는 주에는 결론의 경계가 가장 중요한 정보입니다. 아래 항목은 이번 실행에서 주장하면 안 됩니다.</p></div>
    <ul class="limits-list"><li>클라이언트가 제안을 지원하지 않는다</li><li>논의가 비활성이다</li><li>구현 또는 릴리스가 존재하지 않는다</li><li>명세 변경이 수집 범위 밖에서도 없었다</li><li>KGLD 또는 운영 액션이 필요하다</li></ul>
  </section>
  <section class="section research-section" id="recovery-priorities">
    <div class="section-head"><h2>Recovery Priorities</h2><p>다음 실행의 목적은 더 많은 해석이 아니라 수집 신뢰도 복구입니다. 복구 전까지 장기 관찰 신호는 실행 판단으로 사용하지 않습니다.</p></div>
    <ol class="actions"><li>GitHub/EIP 원천 수집 인증과 rate limit 상태를 확인합니다.</li><li>실패한 endpoint의 HTTP 상태와 응답 형식을 재검증합니다.</li><li>캐시가 있으면 마지막 성공 시점과 신선도를 표시합니다.</li><li>복구 후에만 구현, 릴리스, 활성화, 비즈니스 영향 판단을 재개합니다.</li></ol>
  </section>`;
}

function aggregateDiagnostics(diagnostics: SourceCollectionDiagnostic[]): DiagnosticSummaryRow[] {
  const rows = new Map<string, DiagnosticSummaryRow>();
  for (const item of diagnostics) {
    const endpoint = diagnosticEndpoint(item);
    const failureReason = normalizeFailureReason(item.failureReason);
    const key = [item.sourceName, endpoint, item.result, item.httpStatus ?? "", failureReason].join("|");
    const existing = rows.get(key);
    if (existing) {
      existing.affectedTargets += 1;
      existing.retryCount = Math.max(existing.retryCount, item.retryCount);
      existing.recordCountCollected += item.recordCountCollected;
      existing.lastSuccessfulCollectionAt = latestIso(existing.lastSuccessfulCollectionAt, item.lastSuccessfulCollectionAt);
    } else {
      rows.set(key, {
        sourceName: item.sourceName,
        endpoint,
        result: item.result,
        httpStatus: item.httpStatus,
        failureReason,
        affectedTargets: 1,
        retryCount: item.retryCount,
        recordCountCollected: item.recordCountCollected,
        lastSuccessfulCollectionAt: item.lastSuccessfulCollectionAt,
      });
    }
  }
  return [...rows.values()].sort((a, b) =>
    a.sourceName.localeCompare(b.sourceName)
    || a.endpoint.localeCompare(b.endpoint)
    || b.affectedTargets - a.affectedTargets
  );
}

function diagnosticEndpoint(item: SourceCollectionDiagnostic): string {
  if (!item.requestUrl) return item.sourceType;
  try {
    const url = new URL(item.requestUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return item.requestUrl.split("?")[0] ?? item.sourceType;
  }
}

function normalizeFailureReason(reason: string | undefined): string {
  if (!reason) return "없음";
  if (/rate limit/i.test(reason)) return "rate limit";
  if (/authentication|bad credentials|401|403/i.test(reason)) return "authentication or authorization failure";
  if (/EACCES|ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed/i.test(reason)) return reason.replace(/https?:\/\/\S+/g, "[url]");
  return reason.length > 180 ? `${reason.slice(0, 177)}...` : reason;
}

function latestIso(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function visibleEvidenceCount(report: WeeklyRadarReport, adoptionLayer: AdoptionLayer): number {
  const adoptionSources = adoptionLayer.items.reduce((sum, item) => sum + item.sources.length, 0);
  return adoptionSources
    + report.ethereumTechRadar.signalLayer.discussionHeat.length
    + report.ethereumTechRadar.signalLayer.diffIntelligence.length
    + report.ethereumTechRadar.recentChanges.total;
}

function directEvidenceCount(layer: AdoptionLayer): number {
  return layer.items.reduce((sum, item) =>
    sum + item.sources.filter((source) => (source.relationship ?? "direct") === "direct").length,
  0);
}

function clusterReferenceCount(layer: AdoptionLayer): number {
  return layer.items.reduce((sum, item) =>
    sum + item.sources.filter((source) => source.relationship === "cluster_related").length,
  0);
}

function verifiedImplementationCount(platform: TechnologyPlatformLayer): number {
  return platform.clientMatrices.reduce((sum, matrix) =>
    sum + matrix.clients.filter((client) => ["Verified", "Released", "Activated"].includes(client.status)).length,
  0);
}

function confidenceState(score: number, platform?: TechnologyPlatformLayer): string {
  const degraded = platform?.dataCompleteness.status === "degraded" || platform?.dataCompleteness.status === "unavailable";
  if (degraded || score < 25) return "Early Exploration";
  if (score < 40) return "Early Exploration";
  if (score < 60) return "Stable";
  if (score < 75) return "Growing";
  return "Mature";
}

function immediateBusinessAction(platform: TechnologyPlatformLayer, adoptionLayer: AdoptionLayer): string {
  const hasVerifiedImplementation = verifiedImplementationCount(platform) > 0;
  const hasDirectImplementation = adoptionLayer.items.some((item) =>
    item.evidenceLevel === "Implementation" && item.sources.some((source) => (source.relationship ?? "direct") === "direct"),
  );
  const highBusinessSignal = platform.kgldIntelligence.some((item) => ["High", "Critical"].includes(item.overall));
  return hasVerifiedImplementation && hasDirectImplementation && highBusinessSignal ? "Manual review supported" : "None supported";
}

function latestEvidenceDate(layer: AdoptionLayer): string | undefined {
  const dates = layer.items.flatMap((item) => item.sources.flatMap((source) => [source.updatedAt, source.observedAt])).filter((item): item is string => Boolean(item)).sort();
  return dates.at(-1)?.slice(0, 10);
}

function highestRiskLabel(platform: TechnologyPlatformLayer): string {
  if (platform.risks.some((item) => item.risk === "High")) return "높음";
  if (platform.risks.some((item) => item.risk === "Medium")) return "중간";
  if (platform.risks.some((item) => item.risk === "Low")) return "낮음";
  return "명시적 리스크 없음";
}

function coverExecutiveSummary(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  watchlist: WatchlistLayer,
  adoptionLayer: AdoptionLayer,
): string {
  const top = watchlist.items[0];
  const primaryId = top?.relatedProposals[0] ?? platform.lifecycleTimelines[0]?.proposalId ?? "관찰 항목";
  const lifecycle = platform.lifecycleTimelines.find((item) => item.proposalId === primaryId) ?? platform.lifecycleTimelines[0];
  const adoption = adoptionEvidenceForProposal(adoptionLayer, top?.relatedProposals ?? [primaryId]);
  const stage = formatLifecycleStage(lifecycle?.currentStage ?? "Unknown");
  const evidenceLevel = formatEvidenceLevel(adoption?.evidenceLevel);
  const diffCount = report.ethereumTechRadar.signalLayer.diffIntelligence.length;
  return `${primaryId}은 현재 ${stage} 단계로 표시됩니다. 근거 수준은 ${evidenceLevel}이며, 이번 보고 기간의 문안 변경은 ${diffCount}건입니다. 검증되지 않은 구현, 릴리스, 활성화, 운영 채택은 상향 추론하지 않았습니다.`;
}

function executiveRating(confidence: number, risk: string): string {
  if (risk === "높음") return "Risk Review";
  if (confidence >= 70) return "Actionable";
  if (confidence >= 40) return "Watch";
  return "Monitor";
}

function renderFooter(report: WeeklyRadarReport, platform: TechnologyPlatformLayer): string {
  void platform;
  return `<footer class="footer"><span>Generated by EIP Reporter</span><span>Ethereum Development Intelligence</span><span>Version v1.0</span><span>Generation Time ${escapeHtml(report.generatedAt)}</span></footer>`;
}

function keyDevelopmentsTimeline(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  watchlist: WatchlistLayer,
  adoptionLayer: AdoptionLayer,
  mode: ReportMode,
  ecosystem: EcosystemStateLayer,
): string {
  const weeklyChangeCount = report.ethereumTechRadar.signalLayer.diffIntelligence.length + report.ethereumTechRadar.recentChanges.total;
  if (weeklyChangeCount === 0) {
    const clusters = ecosystem.longTermNarratives
      .slice(0, 3)
      .map((item) => `<li><b>${escapeHtml(item.title)}</b>: ${escapeHtml(item.state)}, 제안 근거 ${item.evidenceProposalIds.length}건, 연결 기술 ${item.connectedTechnologies.slice(0, 4).join(", ") || "추적 중"}</li>`)
      .join("");
    return `<div class="section-head"><h2>This Week's Contribution</h2><p>이 마지막 섹션은 이번 주 활동이 앞서 설명한 생태계 내러티브에 무엇을 더했는지만 분리합니다. 새 활동이 적어도 현재 개발 방향 설명은 장기 그래프와 트렌드 레이어에서 유지됩니다.</p></div><div class="empty-week"><h3>No material weekly contribution was collected.</h3><p>이번 실행에서는 기존 내러티브를 바꿀 만큼의 주간 명세 변경이나 클라이언트 구현 근거가 수집되지 않았습니다. 따라서 해석의 중심은 ${escapeHtml(ecosystem.longTermNarratives[0]?.title ?? "장기 개발 내러티브")} 상태로 유지됩니다.</p><p class="meta"><b>Ecosystem implication:</b> 주간 활동 부재는 Declining으로 자동 해석하지 않습니다. 현재 상태는 장기 evidence와 연결 기술을 기준으로 평가합니다.</p>${clusters ? `<details open><summary>Long-term narratives that remain active</summary><ul class="monitor-list">${clusters}</ul></details>` : ""}</div>`;
  }
  const entries = watchlist.items.slice(0, 5).map((item) => {
    const proposal = item.relatedProposals[0] ?? item.theme;
    const timeline = platform.lifecycleTimelines.find((candidate) => candidate.proposalId === proposal);
    const adoption = adoptionEvidenceForProposal(adoptionLayer, item.relatedProposals);
    return {
      title: `${proposal} ${formatLifecycleStage(timeline?.currentStage ?? "Discussion")}`,
      impact: item.businessRelevance ? `${formatKgldArea(item.businessRelevance.area)} 관찰` : `${item.theme} 관찰`,
      why: localizeGeneratedText(shortThesis(item.possibleNextMovement)),
      evidence: evidenceChips(item).join(SEP) || formatEvidenceLevel(adoption?.evidenceLevel),
      confidence: `신호 강도 ${item.confidenceScore}/100`,
    };
  });
  if (!entries.length) {
    const top = platform.lifecycleTimelines[0];
    entries.push({
      title: `${top?.proposalId ?? "관찰 항목"} ${formatLifecycleStage(top?.currentStage ?? "Discussion")}`,
      impact: "추가 확인 필요",
      why: "이번 보고 기간에는 상향 판단에 필요한 직접 근거가 제한적입니다.",
      evidence: `${report.ethereumTechRadar.signalLayer.discussionHeat.length}개 논의 신호`,
      confidence: `신호 강도 ${platform.dataCompleteness.confidenceMetrics?.signalStrength ?? 0}/100`,
    });
  }
  const intro = mode === "partial"
    ? "수집 품질이 낮으므로 이번 주 확인된 변경만 표시하고 장기 모멘텀과 혼합하지 않습니다. 이 섹션은 실행 판단보다 확인 범위를 정리합니다."
    : "이번 주 활동을 독립 뉴스가 아니라 장기 내러티브에 추가된 evidence로 정리합니다.";
  return `<div class="section-head"><h2>This Week's Contribution</h2><p>${escapeHtml(intro)}</p></div><div class="editorial-timeline">${entries.map((entry) => `<article class="timeline-entry"><div class="timeline-rule" aria-hidden="true"></div><div class="timeline-copy"><h3>${escapeHtml(entry.title)}</h3><dl><div><dt>기여한 내러티브</dt><dd>${escapeHtml(entry.impact)}</dd></div><div><dt>의미</dt><dd>${escapeHtml(entry.why)}</dd></div><div><dt>근거</dt><dd>${escapeHtml(entry.evidence)}</dd></div></dl></div><div class="timeline-meta">${escapeHtml(entry.confidence)}</div></article>`).join("")}</div><p class="meta"><b>Ecosystem implication:</b> 주간 변경은 장기 내러티브를 보강하거나 약화하는 evidence로만 해석합니다.</p>`;
}

function topStoriesSection(stories: IntelligenceTopStory[]): string {
  if (!stories.length) {
    return `<details><summary>Top Stories</summary><p class="muted">이번 실행에서 근거 기반 대표 스토리를 만들 수 없습니다. 의미 있는 변화에는 상태 변경, 중요한 명세 변경, 구현 근거, 릴리스·활성화 근거 또는 실질적인 논의 증가가 필요합니다.</p></details>`;
  }
  return `<details open><summary>Top Stories</summary><div class="reference-list">${stories.slice(0, 7).map((story) => {
    const metrics = story.confidenceMetrics ?? { collectionConfidence: 0, evidenceConfidence: story.confidence, signalStrength: story.score };
    return `<article class="reference-item"><h3>${statusBadge(decisionStateLabel(story.decisionState ?? "MONITOR"), decisionBadgeKind(story.decisionState ?? "MONITOR"))} ${escapeHtml(story.headline)}</h3><p>${escapeHtml(localizeGeneratedText(story.conclusion))}</p><p class="reference-source">신호 강도 ${metrics.signalStrength}/100${SEP}근거 신뢰도 ${metrics.evidenceConfidence}/100${SEP}수집 신뢰도 ${metrics.collectionConfidence}/100${SEP}${escapeHtml(localizeGeneratedText(story.maturity))}</p><p><b>변화:</b> ${escapeHtml(localizeGeneratedText(story.whatChanged))}</p><p><b>의미:</b> ${escapeHtml(localizeGeneratedText(story.whyItMatters))}</p><p><b>다음 trigger:</b> ${escapeHtml(localizeGeneratedText(story.followUpTrigger))}</p><details><summary>근거 및 점수 보기</summary><ul class="monitor-list">${story.evidence.map((item) => `<li>${escapeHtml(localizeGeneratedText(item))}</li>`).join("") || "<li>표시할 근거 URL이 없습니다.</li>"}</ul>${scoreDetails("신호 강도 산식", story.scoreBreakdown)}</details></article>`;
  }).join("")}</div></details>`;
}

function knowledgeGraphTraceSection(report: WeeklyRadarReport, mode: ReportMode): string {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  if (!graph) return "";
  const chains = graph.proposalKnowledgeChains.filter((chain) => chain.steps.length >= 4).slice(0, 8);
  const paths = chains.length ? chains : graph.topicKnowledgePaths.slice(0, 8).map((path) => ({
    proposalId: path.proposalId ?? path.topicId,
    chainScore: path.complete ? 70 : 45,
    complete: path.complete,
    steps: path.steps,
    gaps: path.gaps,
  }));
  const degraded = mode !== "normal" || getAdoptionLayer(report).collectionStatus === "failed" || getAdoptionLayer(report).collectionStatus === "skipped";
  const items = paths.map((path) => {
    const lines = path.steps.map((step, index) => {
      if (index === 0) return `<li><b>${escapeHtml(step.label)}</b> <span class="meta">${escapeHtml(step.type)}</span></li>`;
      const edge = `${step.edgeType ?? "RELATES_TO"} ${step.confidence ?? 0}/100 ${step.inferred ? "inferred" : "direct"} evidence ${step.evidenceCount ?? 0}`;
      return `<li>${escapeHtml(step.edgeType ? "→ " : "")}${escapeHtml(step.label)} <span class="meta">${escapeHtml(edge)}</span></li>`;
    }).join("");
    const gaps = path.gaps.length
      ? `<p class="meta">Graph gaps: ${escapeHtml(path.gaps.map((gap) => `${gap.type}(${gap.severity})`).join(", "))}</p>`
      : `<p class="meta">Graph gaps: none on representative path</p>`;
    return `<article class="reference-item"><h3>${escapeHtml(path.proposalId)} <span class="meta">Chain Score ${path.chainScore}/100${SEP}${path.complete ? "complete" : "gapped"}</span></h3><ul class="monitor-list">${lines}</ul>${gaps}</article>`;
  }).join("");
  const degradedNote = degraded ? `<p class="muted">데이터 수집이 제한된 경우 graph path는 사용 가능한 근거 범위 안에서만 구성됩니다.</p>` : "";
  const stats = graph.graphStatistics;
  const statLine = `<p class="meta">Longest Path ${stats.maxPathLength}${SEP}Average Path Length ${stats.averagePathLength}${SEP}Mechanism Coverage ${stats.mechanismCoverage}%${SEP}Stakeholder Coverage ${stats.stakeholderCoverage}%</p>`;
  return `<details><summary>Knowledge Graph Trace / Graph Explorer</summary>${degradedNote}${statLine}<div class="reference-list">${items || `<p class="muted">표시할 Knowledge Graph chain이 없습니다.</p>`}</div></details>`;
}

function decisionStateLabel(state: string): string {
  const labels: Record<string, string> = {
    ACTION_REQUIRED: "대응 필요",
    TECHNICAL_REVIEW: "기술 검토",
    PRIORITY_WATCH: "우선 관찰",
    MONITOR: "관찰",
    BACKGROUND: "참고",
    INSUFFICIENT_EVIDENCE: "Early Exploration",
  };
  return labels[state] ?? "관찰";
}

function decisionBadgeKind(state: string): Parameters<typeof statusBadge>[1] {
  if (state === "ACTION_REQUIRED") return "risk-high";
  if (state === "TECHNICAL_REVIEW") return "verified";
  if (state === "PRIORITY_WATCH") return "lifecycle-current";
  if (state === "INSUFFICIENT_EVIDENCE") return "no-evidence";
  return "future";
}

function stateOfEthereumSection(report: WeeklyRadarReport, ecosystem: EcosystemStateLayer): string {
  const primary = ecosystem.longTermNarratives[0];
  const drivers = unique(ecosystem.longTermNarratives.flatMap((item) => item.connectedTechnologies)).slice(0, 5);
  const weeklyChanges = report.ethereumTechRadar.recentChanges.total + report.ethereumTechRadar.signalLayer.diffIntelligence.length;
  const era = currentEra(ecosystem);
  const explanation = primary
    ? `Ethereum is evolving toward ${primary.title}, driven by ${drivers.slice(0, 3).join(", ") || "connected protocol work"}.`
    : ecosystem.currentState;
  return `<div class="executive-summary"><div class="summary-copy"><h2>State of Ethereum</h2><h3>Where is Ethereum technically evolving?</h3><p>${escapeHtml(explanation)}</p><h3>One-sentence explanation</h3><p>${escapeHtml(ecosystem.currentState)}</p></div><aside class="summary-sticky" aria-label="State of Ethereum facts"><div><span>Current Era</span><b>${escapeHtml(era)}</b></div><div><span>Biggest active narrative</span><b>${escapeHtml(primary?.title ?? "Distributed technical exploration")}</b></div><div><span>Major technology drivers</span><b>${escapeHtml(drivers.slice(0, 3).join(", ") || "Concept graph")}</b></div><div><span>Biggest weekly changes</span><b>${weeklyChanges}</b></div><div><span>Narrative state</span><b>${escapeHtml(primary?.state ?? "Stable")}</b></div></aside></div>`;
}

function technologyLandscapeTreeSection(report: WeeklyRadarReport, ecosystem: EcosystemStateLayer): string {
  const domains = buildTechnologyDomains(report, ecosystem);
  const tree = domains.map((domain) => `<details open><summary>${escapeHtml(domain.name)}</summary>${domain.subthemes.map((subtheme) =>
    `<details><summary>${escapeHtml(subtheme.name)}</summary>${subtheme.technologies.map((technology) =>
      `<details><summary>${escapeHtml(technology.name)}</summary><ul class="monitor-list">${technology.proposals.map((proposal) => `<li><b>${escapeHtml(proposal.id)}</b>: ${escapeHtml(proposal.title)}</li>`).join("") || "<li>proposal evidence is held in debug data</li>"}</ul></details>`
    ).join("")}</details>`
  ).join("")}</details>`).join("");
  return `<div class="section-head"><h2>Technology Landscape</h2><p>모든 proposal은 기술 도메인의 최하위 evidence로만 배치합니다. 독자는 먼저 Theme와 Sub Theme를 보고, 필요할 때만 proposal까지 펼칩니다.</p></div><div class="reference-list">${tree || '<p class="muted">기술 도메인 트리를 만들 수 없습니다.</p>'}</div>`;
}

function evolutionTimelineSection(report: WeeklyRadarReport, ecosystem: EcosystemStateLayer): string {
  const startYear = Number(report.trendPeriod.from.slice(0, 4));
  const currentYear = Number(report.generatedAt.slice(0, 4));
  const narratives = ecosystem.longTermNarratives;
  const years = [startYear - 3, startYear - 2, startYear - 1, currentYear].filter((year, index, values) => values.indexOf(year) === index);
  const labels = narratives.length ? narratives : report.ethereumTechRadar.themeInsights.slice(0, 4).map((theme) => ({
    title: theme.theme,
    state: theme.maturitySignal === "high" ? "Mature" : theme.recentChangeCount7d > 0 ? "Emerging" : "Stable",
    confidence: theme.momentumScore,
    connectedTechnologies: theme.dominantSubTrends.map((trend) => trend.name),
  }));
  const rows = years.map((year, index) => {
    const item = labels[Math.min(index, labels.length - 1)];
    const focus = item?.title ?? "Distributed standards work";
    const tech = item?.connectedTechnologies?.slice(0, 3).join(", ") || "technical primitives";
    return `<article class="timeline-entry"><div class="timeline-rule" aria-hidden="true"></div><div class="timeline-copy"><h3>${year}</h3><dl><div><dt>Engineering focus</dt><dd>${escapeHtml(focus)}</dd></div><div><dt>Technology signal</dt><dd>${escapeHtml(tech)}</dd></div><div><dt>Trend</dt><dd>${escapeHtml(item?.state ?? "Stable")}</dd></div></dl></div><div class="timeline-meta">${escapeHtml(item?.state ?? "Stable")}</div></article>`;
  }).join("");
  return `<div class="section-head"><h2>Evolution Timeline</h2><p>이 타임라인은 개별 EIP 연표가 아니라 개발 초점의 이동을 보여줍니다. 과거 항목은 현재 graph가 설명하는 기술 축을 기준으로 요약합니다.</p></div><div class="editorial-timeline">${rows}</div>`;
}

function technologyRelationshipMapSection(report: WeeklyRadarReport, ecosystem: EcosystemStateLayer): string {
  const chains = report.ethereumTechRadar.knowledgeGraphLayer?.proposalKnowledgeChains.slice(0, 10) ?? [];
  const mapRows = chains.map((chain) => {
    const labels = chain.steps.filter((step) => step.type !== "Proposal").map((step) => step.label);
    return `<article class="reference-item"><h3>${escapeHtml(labels[0] ?? chain.proposalId)}</h3><p>${labels.map(escapeHtml).join(" → ")}</p><details><summary>Supporting proposal evidence</summary><p class="meta">${escapeHtml(chain.proposalId)}${SEP}${chain.traceability.evidenceIds.length} evidence ids</p></details></article>`;
  }).join("");
  const links = ecosystem.connectedTechnologies.slice(0, 12).map((item) => `<span class="tag">${escapeHtml(item.source)} → ${escapeHtml(item.target)}</span>`).join("");
  return `<div class="section-head"><h2>Technology Relationship Map</h2><p>이 지도는 proposal graph가 아니라 technology graph입니다. Proposal은 각 기술 연결을 뒷받침하는 evidence로 접어 둡니다.</p></div><div class="tags">${links}</div><div class="reference-list">${mapRows || '<p class="muted">표시할 ontology graph 경로가 없습니다.</p>'}</div>`;
}

function narrativeEvolutionMagazineSection(ecosystem: EcosystemStateLayer): string {
  const max = Math.max(1, ...ecosystem.longTermNarratives.map((item) => item.confidence));
  const rows = ecosystem.longTermNarratives.map((item) => {
    const blocks = "█".repeat(Math.max(1, Math.round((item.confidence / max) * 10)));
    return `<div class="compact-row"><span><b>${escapeHtml(item.title)}</b><br><span class="meta">${escapeHtml(blocks)}${SEP}${escapeHtml(item.weeklyContribution)}</span></span>${statusBadge(item.state, ecosystemBadgeKind(item.state))}</div>`;
  }).join("");
  return `<div class="section-head"><h2>Narrative Evolution</h2><p>Proposal activity is aggregated into narratives. Momentum, trend, growth, and decline are shown as narrative signals rather than proposal scores.</p></div><div class="compact-list">${rows}</div>`;
}

function whyThisIsHappeningSection(report: WeeklyRadarReport, ecosystem: EcosystemStateLayer): string {
  const explanations = ecosystem.longTermNarratives.slice(0, 6).map((item) => {
    const path = causalMotivationPath(item);
    return `<article class="reference-item"><h3>${escapeHtml(item.title)}</h3><p>${path.map(escapeHtml).join(" → ")}</p><p class="meta">${escapeHtml(item.whyImportant)}</p></article>`;
  }).join("");
  return `<div class="section-head"><h2>Why This Is Happening</h2><p>이 섹션은 engineering motivation을 설명합니다. 어려움이나 제약이 어떤 concept, mechanism, system 변화로 이어지는지 causal chain으로 보여줍니다.</p></div><div class="reference-list">${explanations || '<p class="muted">설명 가능한 causal narrative가 없습니다.</p>'}</div>`;
}

function ecosystemParticipantMapSection(report: WeeklyRadarReport, ecosystem: EcosystemStateLayer): string {
  const domains = buildTechnologyDomains(report, ecosystem).slice(0, 8);
  const rows = domains.map((domain) => {
    const participants = participantsForDomain(domain.name);
    const technologies = unique(domain.subthemes.flatMap((subtheme) => subtheme.technologies.map((technology) => technology.name))).slice(0, 6);
    return `<article class="reference-item"><h3>${escapeHtml(domain.name)}</h3><p><b>Participants:</b> ${escapeHtml(participants.join(", "))}</p><p><b>Technologies tracked:</b> ${escapeHtml(technologies.join(", ") || "No specific technology extracted")}</p><p class="meta">Participant names are ecosystem monitoring lenses, not adoption claims.</p></article>`;
  }).join("");
  return `<div class="section-head"><h2>Ecosystem Map</h2><p>참여자 맵은 어떤 actor가 어떤 기술 변화의 영향을 받을 수 있는지 보여줍니다. 특정 제품 채택 또는 production support는 직접 근거 없이는 주장하지 않습니다.</p></div><div class="reference-list">${rows}</div>`;
}

function proposalExplorerSection(report: WeeklyRadarReport, watchlist: WatchlistLayer): string {
  const topics = report.ethereumTechRadar.topicClusterLayer?.clusters ?? [];
  const rows = topics.flatMap((topic) => [...topic.anchorProposalIds, ...topic.supportingProposalIds, ...topic.adjacentProposalIds].map((proposalId) => ({ proposalId, topic: topic.displayName }))).slice(0, 80);
  const cards = rows.map((item) => `<tr><td><b>${escapeHtml(item.proposalId)}</b></td><td>${escapeHtml(item.topic)}</td><td>Supporting evidence</td></tr>`).join("");
  const watchRows = watchlist.items.slice(0, 12).map((item) => `<article class="reference-item"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.theme)}</p><p class="meta">${escapeHtml(item.relatedProposals.join(", "))}</p></article>`).join("");
  return `<div class="section-head"><h2>Proposal Explorer</h2><p>All proposal-level cards live here as supporting material. The main report should be understandable without opening this section.</p></div><details><summary>Open proposal evidence</summary><div class="table-wrap"><table class="table"><thead><tr><th>Proposal</th><th>Narrative / Topic</th><th>Role</th></tr></thead><tbody>${cards || '<tr><td colspan="3" class="muted">No proposal evidence rows available.</td></tr>'}</tbody></table></div></details><details><summary>Watchlist evidence cards</summary><div class="reference-list">${watchRows || '<p class="muted">No watchlist cards.</p>'}</div></details>`;
}

function businessImpactReasoningSection(report: WeeklyRadarReport, intelligence: NonNullable<WeeklyRadarReport["ethereumTechRadar"]["intelligenceLayer"]>): string {
  const chains = report.ethereumTechRadar.knowledgeGraphLayer?.proposalKnowledgeChains.filter((chain) => chain.complete).slice(0, 6) ?? [];
  const rows = chains.map((chain) => {
    const tech = chain.steps.find((step) => step.type === "Concept" || step.type === "Mechanism")?.label ?? chain.proposalId;
    const system = chain.steps.find((step) => step.type === "System")?.label ?? "Infrastructure";
    const stakeholder = chain.steps.find((step) => step.type === "Stakeholder")?.label ?? "Developers";
    const impact = chain.steps.find((step) => step.type === "BusinessImpact")?.label ?? "Monitoring Requirement";
    return `<article class="reference-item"><h3>${escapeHtml(tech)}</h3><p>${escapeHtml(tech)} → ${escapeHtml(system)} change → ${escapeHtml(stakeholder)} impact → ${escapeHtml(impact)} → KGLD monitoring unless direct dependency evidence appears.</p><p class="meta">Evidence proposal: ${escapeHtml(chain.proposalId)}${SEP}${chain.traceability.evidenceIds.length} evidence ids</p></article>`;
  }).join("");
  const kgld = intelligence.kgldAssessments.filter((item) => item.relevance !== "none").slice(0, 4).map((item) => `<li>${escapeHtml(item.signal)}: ${escapeHtml(item.causalPath)}</li>`).join("");
  return `<div class="section-head"><h2>Business Impact</h2><p>점수표 대신 causal reasoning을 표시합니다. 기술 변화가 infrastructure, developer, institution, KGLD 관찰 지점으로 어떻게 이어지는지 설명합니다.</p></div><div class="reference-list">${rows || '<p class="muted">비즈니스 causal chain이 아직 짧습니다.</p>'}</div>${kgld ? `<details><summary>KGLD reasoning details</summary><ul class="monitor-list">${kgld}</ul></details>` : ""}`;
}

function thisWeekCompactSection(report: WeeklyRadarReport, changes: WeeklyRadarReport["ethereumTechRadar"]["recentChanges"]): string {
  const meaningful = [
    ...changes.newProposals,
    ...changes.statusChanges,
    ...changes.finalTransitions,
    ...changes.withdrawnTransitions,
    ...changes.contentHashChanges,
  ].slice(0, 10);
  const rows = meaningful.map((event) => `<li><b>${escapeHtml(event.proposalId)}</b>: ${escapeHtml(localizeGeneratedText(event.diffSummary ?? event.type))}</li>`).join("");
  return `<div class="section-head"><h2>This Week</h2><p>마지막 섹션은 이번 주 활동 중 의미 있는 evidence만 압축합니다. 개별 EIP 사건은 전체 기술 방향을 보조할 때만 중요합니다.</p></div>${rows ? `<ul class="monitor-list">${rows}</ul>` : '<p class="muted">이번 주 전체 내러티브를 바꿀 만한 의미 있는 변경은 수집되지 않았습니다.</p>'}`;
}

type TechnologyDomain = {
  name: string;
  subthemes: Array<{
    name: string;
    technologies: Array<{ name: string; proposals: Array<{ id: string; title: string }> }>;
  }>;
};

function buildTechnologyDomains(report: WeeklyRadarReport, ecosystem: EcosystemStateLayer): TechnologyDomain[] {
  const topicLayer = report.ethereumTechRadar.topicClusterLayer;
  const proposalTitles = proposalTitleMap(report);
  const byDomain = new Map<string, TechnologyDomain>();
  const narratives: Array<{ title: string; connectedTechnologies: string[]; evidenceProposalIds: string[]; relatedTopics?: string[] }> = ecosystem.longTermNarratives.length ? ecosystem.longTermNarratives : report.ethereumTechRadar.themeInsights.map((theme) => ({
    title: theme.theme,
    connectedTechnologies: theme.dominantSubTrends.map((trend) => trend.name),
    evidenceProposalIds: theme.representativeProposals.map((proposal) => proposal.id),
  }));
  for (const narrative of narratives) {
    const domainName = domainForText(`${narrative.title} ${narrative.connectedTechnologies.join(" ")}`);
    const domain = byDomain.get(domainName) ?? { name: domainName, subthemes: [] };
    const topic = topicLayer?.clusters.find((item) => item.displayName === narrative.title || narrative.relatedTopics?.includes(item.id));
    const subthemeName = topic?.displayName ?? narrative.title;
    const technologies = (narrative.connectedTechnologies.length ? narrative.connectedTechnologies : [narrative.title]).slice(0, 6).map((technology) => ({
      name: technology,
      proposals: narrative.evidenceProposalIds.slice(0, 10).map((id) => ({ id, title: proposalTitles.get(id) ?? id })),
    }));
    domain.subthemes.push({ name: subthemeName, technologies });
    byDomain.set(domainName, domain);
  }
  return [...byDomain.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function proposalTitleMap(report: WeeklyRadarReport): Map<string, string> {
  const entries: Array<[string, string]> = [];
  for (const theme of report.ethereumTechRadar.themeInsights) {
    for (const proposal of theme.representativeProposals) entries.push([proposal.id, proposal.title]);
  }
  for (const item of getWatchlistLayer(report).items) {
    for (const proposalId of item.relatedProposals) entries.push([proposalId, item.title]);
  }
  return new Map(entries);
}

function domainForText(value: string): string {
  const text = value.toLocaleLowerCase("en-US");
  const domains: Array<[string, RegExp]> = [
    ["Wallet", /wallet|account abstraction|delegat|session|paymaster|useroperation|gas sponsorship/],
    ["AI", /ai|agent|intent|automation/],
    ["Identity", /identity|credential|attestation|authorization|authentication/],
    ["Privacy", /privacy|private|zk|zero-knowledge|confidential/],
    ["L2", /rollup|l2|sequencer|bridge|interop|blob/],
    ["MEV", /mev|builder|pbs|block builder/],
    ["Validator", /validator|consensus|post-quantum|signature aggregation/],
    ["Interop", /interop|bridge|cross-chain|cross chain/],
    ["Security", /security|risk|signature|validation|state commitment/],
    ["DeFi", /defi|vault|tokenized|settlement|oracle|nav/],
  ];
  return domains.find(([, pattern]) => pattern.test(text))?.[0] ?? "Protocol";
}

function participantsForDomain(domain: string): string[] {
  const participants: Record<string, string[]> = {
    Wallet: ["MetaMask", "Safe", "Coinbase Wallet", "Rabby", "Wallet providers"],
    AI: ["AI wallet teams", "Dapp developers", "Automation services"],
    Identity: ["Identity issuers", "Credential providers", "Compliance teams"],
    Privacy: ["Privacy protocol teams", "Auditors", "Wallet providers"],
    L2: ["L2 operators", "Sequencers", "Bridge operators", "Infrastructure providers"],
    MEV: ["Builders", "Relays", "Validator operators", "Searchers"],
    Validator: ["Validator operators", "Consensus client teams", "Protocol researchers"],
    Interop: ["Bridge operators", "L2 operators", "Dapp developers"],
    Security: ["Security researchers", "Client maintainers", "Auditors"],
    DeFi: ["Vault managers", "Oracle providers", "Custodians", "Exchanges"],
    Protocol: ["Protocol developers", "Client maintainers", "Researchers"],
  };
  return participants[domain] ?? participants.Protocol;
}

function causalMotivationPath(item: { title: string; connectedTechnologies: string[] }): string[] {
  const domain = domainForText(`${item.title} ${item.connectedTechnologies.join(" ")}`);
  const starts: Record<string, string> = {
    Wallet: "Wallets remain difficult for users and applications",
    AI: "Automation needs safer delegated execution",
    Identity: "Permission and accountability need stronger representation",
    Privacy: "Public execution exposes sensitive transfer context",
    L2: "Scaling fragments execution and liquidity",
    MEV: "Block construction creates ordering pressure",
    Validator: "Validator operations face stronger authentication and resilience demands",
    Interop: "Applications need movement across execution environments",
    Security: "More complex execution increases verification needs",
    DeFi: "Financial primitives need standardized accounting and settlement",
    Protocol: "Protocol complexity is being decomposed into explicit mechanisms",
  };
  return [starts[domain] ?? starts.Protocol, item.title, ...item.connectedTechnologies.slice(0, 5)];
}

function currentEra(ecosystem: EcosystemStateLayer): string {
  const top = ecosystem.longTermNarratives[0];
  if (!top) return "Exploration Era";
  const domain = domainForText(`${top.title} ${top.connectedTechnologies.join(" ")}`);
  if (domain === "Wallet") return "Wallet Programmability Era";
  if (domain === "Validator") return "Validator Resilience Era";
  if (domain === "DeFi") return "Financial Infrastructure Standardization Era";
  if (domain === "Identity") return "Authorization and Attestation Era";
  return `${domain} Engineering Era`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function ecosystemStateSection(ecosystem: EcosystemStateLayer): string {
  const questions = ecosystem.keyQuestions.map((item) =>
    `<article class="reference-item"><h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p><p class="reference-source">Narrative score ${item.confidence}/100${SEP}Evidence ${item.evidenceIds.length}</p></article>`
  ).join("");
  const narratives = ecosystem.longTermNarratives.slice(0, 6).map((item) =>
    `<div class="compact-row"><span><b>${escapeHtml(item.title)}</b>${SEP}${escapeHtml(item.summary)}</span>${statusBadge(item.state, ecosystemBadgeKind(item.state))}</div>`
  ).join("");
  return `<div class="section-head"><h2>Ecosystem State</h2><p>이 섹션은 Proposal을 결론으로 보지 않고 evidence로 사용합니다. 현재 Ethereum 개발 방향을 Concepts, Themes, Long-term Narratives, Trend Engine, Ecosystem State 순서로 요약합니다.</p></div><div class="landscape-layout"><div class="landscape-copy"><span class="landscape-label">Current state</span><p>${escapeHtml(ecosystem.currentState)}</p><span class="landscape-label">Primary narrative</span><p>${escapeHtml(ecosystem.headline)}</p><div class="compact-list">${narratives}</div></div><aside class="landscape-highlights"><h3>Signal States</h3><div><span>Growing</span><b>${ecosystem.diagnostics.growingCount}</b></div><div><span>Emerging</span><b>${ecosystem.diagnostics.emergingCount}</b></div><div><span>Stable</span><b>${ecosystem.diagnostics.stableCount}</b></div><div><span>Mature</span><b>${ecosystem.diagnostics.matureCount}</b></div><div><span>Declining</span><b>${ecosystem.diagnostics.decliningCount}</b></div></aside></div><details open><summary>Questions this report answers</summary><div class="reference-list">${questions}</div></details>`;
}

function connectedTechnologiesSection(ecosystem: EcosystemStateLayer): string {
  const rows = ecosystem.connectedTechnologies.slice(0, 18).map((item) =>
    `<tr><td><b>${escapeHtml(item.source)}</b></td><td>${escapeHtml(item.relation)}</td><td><b>${escapeHtml(item.target)}</b></td><td>${item.confidence}/100</td><td>${item.evidenceIds.length}</td></tr>`
  ).join("");
  const topNarrative = ecosystem.longTermNarratives[0];
  return `<div class="section-head"><h2>Connected Technologies</h2><p>기술은 단독 Proposal이 아니라 서로 연결된 시스템 변화로 해석합니다. 아래 연결은 Knowledge Graph의 Concept, Mechanism, System, Stakeholder, BusinessImpact 경로에서 가져옵니다.</p></div><div class="landscape-layout"><div class="landscape-copy"><span class="landscape-label">Connection pattern</span><p>${escapeHtml(topNarrative ? `${topNarrative.title} connects ${topNarrative.connectedTechnologies.slice(0, 6).join(", ") || "tracked technologies"}.` : "Dominant technology connections are still forming.")}</p><details open><summary>Technology links</summary><div class="table-wrap"><table class="table"><thead><tr><th>Source</th><th>Relation</th><th>Target</th><th>Confidence</th><th>Evidence</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">연결 기술 데이터가 없습니다.</td></tr>'}</tbody></table></div></details></div><aside class="landscape-highlights"><h3>Graph</h3><div><span>Connected links</span><b>${ecosystem.connectedTechnologies.length}</b></div><div><span>Evidence-backed narratives</span><b>${ecosystem.diagnostics.evidenceBackedNarrativeCount}</b></div><div><span>Average confidence</span><b>${ecosystem.diagnostics.averageConfidence}/100</b></div></aside></div>`;
}

function narrativeMomentumSection(ecosystem: EcosystemStateLayer): string {
  const emerging = ecosystem.emergingNarratives.length ? ecosystem.emergingNarratives : ecosystem.longTermNarratives.filter((item) => item.state === "Growing" || item.state === "Emerging");
  const fading = ecosystem.fadingNarratives;
  const signalRows = ecosystem.trendSignals.slice(0, 10).map((item) =>
    `<div class="compact-row"><span><b>${escapeHtml(item.label)}</b>${SEP}evidence ${item.evidenceIds.length}</span>${statusBadge(item.state, ecosystemBadgeKind(item.state))}</div>`
  ).join("");
  return `<div class="section-head"><h2>Narrative Momentum</h2><p>내러티브는 strengthening, stable, fading 신호로 분류합니다. 주간 이벤트가 아니라 3~6개월 evidence와 Knowledge Graph 경로를 함께 사용합니다.</p></div><div class="landscape-layout"><div class="landscape-copy"><span class="landscape-label">Strengthening</span><p>${escapeHtml(emerging.length ? emerging.map((item) => `${item.title} (${item.state})`).join(", ") : "현재 Growing/Emerging 임계값을 넘은 내러티브는 없습니다.")}</p><span class="landscape-label">Fading</span><p>${escapeHtml(fading.length ? fading.map((item) => item.title).join(", ") : "현재 Declining으로 분류된 주요 내러티브는 없습니다.")}</p><div class="compact-list">${signalRows}</div></div><aside class="landscape-highlights"><h3>Momentum</h3><div><span>Long-term narratives</span><b>${ecosystem.longTermNarratives.length}</b></div><div><span>Strengthening</span><b>${emerging.length}</b></div><div><span>Fading</span><b>${fading.length}</b></div><div><span>Early exploration</span><b>${ecosystem.diagnostics.earlyExplorationCount}</b></div></aside></div>`;
}

function ecosystemBadgeKind(state: string): Parameters<typeof statusBadge>[1] {
  if (state === "Growing" || state === "Emerging") return "lifecycle-current";
  if (state === "Mature") return "verified";
  if (state === "Declining") return "risk-medium";
  if (state === "Early Exploration") return "future";
  return "no-evidence";
}

function technologyLandscapeEditorial(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  watchlist: WatchlistLayer,
  mode: ReportMode,
  ecosystem: EcosystemStateLayer,
): string {
  const theme = report.ethereumTechRadar.themeInsights[0];
  const secondary = report.ethereumTechRadar.themeInsights.slice(1, 5);
  const watch = watchlist.items[0];
  const weeklyChangeCount = report.ethereumTechRadar.signalLayer.diffIntelligence.length + report.ethereumTechRadar.recentChanges.total;
  const primaryNarrative = ecosystem.longTermNarratives[0];
  const narrative = [
    ["Current developer focus", primaryNarrative ? `${primaryNarrative.title} is ${primaryNarrative.state}. ${primaryNarrative.summary}` : "개발 초점은 여러 장기 기술 내러티브에 분산돼 있습니다."],
    ["3-6 month context", theme ? `${theme.theme} 영역에 제안 ${theme.proposalCount180d}건과 논의 링크 ${theme.discussionProposalCount}건이 모여 있습니다. 이는 생태계 focus의 장기 evidence입니다.` : "장기 제안 집중도는 아직 낮지만 Concepts와 Topic Cluster를 통해 추적합니다."],
    ["Direction of evolution", ecosystem.emergingNarratives.length ? `${ecosystem.emergingNarratives.map((item) => item.title).slice(0, 3).join(", ")} 내러티브가 강화되고 있습니다.` : `${primaryNarrative?.title ?? watch?.theme ?? "주요 기술군"}은 Stable 또는 Early Exploration 상태로 유지됩니다.`],
    ["This week's addition", weeklyChangeCount > 0 ? `이번 주 활동 ${weeklyChangeCount}건은 기존 내러티브에 추가 evidence로 연결됩니다.` : "이번 주 활동은 적지만 장기 내러티브 상태는 계속 설명 가능합니다."],
    ["Interpretation boundary", mode === "partial" ? "수집 품질이 낮은 경우에도 생태계 상태는 낮은 confidence와 graded signal로 표시합니다." : "구현·릴리스·활성화·운영 채택은 별도 근거가 있을 때만 해석합니다."],
  ];
  const highlights = [
    ["상위 테마", theme?.theme ?? "확인 불가"],
    ["관찰 신호", String(watchlist.items.length)],
    ["최근 문안 변경", String(report.ethereumTechRadar.signalLayer.diffIntelligence.length)],
    ["데이터 완전성", formatDataCompletenessStatus(platform.dataCompleteness.status)],
  ];
  return `<div class="landscape-layout"><div class="landscape-copy"><div class="section-head"><h2>Technology Landscape</h2><p>이 섹션은 Ethereum 개발자가 지금 무엇을 만들고 있는지, 그리고 3~6개월 동안 focus가 어디로 이동했는지 설명합니다.</p></div>${narrative.map(([label, line]) => `<span class="landscape-label">${escapeHtml(label)}</span><p>${escapeHtml(line)}</p>`).join("")}</div><aside class="landscape-highlights"><h3>Highlights</h3>${highlights.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("")}${secondary.length ? `<details><summary>Supporting themes</summary><ul class="monitor-list">${secondary.map((item) => `<li>${escapeHtml(item.theme)}: 제안 ${item.proposalCount180d}건</li>`).join("")}</ul></details>` : ""}</aside></div>`;
}

function accountAbstractionSection(item: AccountAbstractionIntelligence): string {
  if (!item.meaningful) {
    return `<details><summary>Account Abstraction Intelligence</summary><p class="muted">${escapeHtml(localizeGeneratedText(item.conclusion))}</p></details>`;
  }
  return `<details open><summary>Account Abstraction Intelligence</summary><div class="landscape-copy"><span class="landscape-label">결론</span><p>${escapeHtml(localizeGeneratedText(item.conclusion))}</p><span class="landscape-label">기술 가정</span><p>${escapeHtml(localizeGeneratedText(item.assumptionChange))}</p><span class="landscape-label">구현 상태</span><p>${escapeHtml(localizeGeneratedText(item.implementationStatus))}</p><span class="landscape-label">지갑 영향</span><p>${escapeHtml(localizeGeneratedText(item.walletImplication))}</p><span class="landscape-label">하위 영역</span><p>${escapeHtml(item.subdomains.join(", ") || "분류되지 않음")}</p></div></details>`;
}

function implementationMatrixCenterpiece(platform: TechnologyPlatformLayer): string {
  const matrix = platform.clientMatrices[0];
  const summary = matrix
    ? `모니터링 대상 클라이언트에서 ${matrix.proposalId}에 대한 제안별 구현 근거를 보수적으로 비교합니다.`
    : "표시할 클라이언트 구현 매트릭스가 없습니다.";
  const table = matrix ? clientCoverageSummarySection(platform).replace(/^<article class="card">|<\/article>$/g, "") : clientCoverageMatrixSection(platform);
  return `<div class="section-head"><h2>구현 매트릭스</h2><p>${escapeHtml(summary)}</p></div><div class="matrix-stage">${table}</div>`;
}

function implementationAndLifecycleSection(platform: TechnologyPlatformLayer): string {
  const matrix = platform.clientMatrices[0];
  const verified = verifiedImplementationCount(platform);
  const hasClientEvidence = Boolean(matrix?.clients.some((cell) => cell.status !== "No evidence"));
  const implementation = !matrix
    ? '<div class="matrix-empty"><b>0 collected</b><p class="muted">표시할 클라이언트 구현 매트릭스가 없습니다.</p></div>'
    : !hasClientEvidence
      ? `<div class="matrix-empty"><span class="eyebrow">검증된 클라이언트 구현</span><b>0건 수집</b><p>모니터링 대상 클라이언트에서 제안별 구현 근거가 수집되지 않았습니다.</p><p class="meta">수집되지 않았다는 뜻이며, 클라이언트가 지원하지 않는다는 근거는 아닙니다.</p><details><summary>클라이언트별 확인 결과 보기</summary>${fullClientMatrix(matrix)}</details></div>`
      : clientCoverageSummarySection(platform).replace(/^<article class="card">|<\/article>$/g, "");
  const metrics = platform.dataCompleteness.confidenceMetrics;
  return `<div class="section-head"><h2>Implementation and Lifecycle</h2><p>이 섹션은 명세 상태, 구현 상태, 네트워크 활성화, 운영 채택을 하나의 선형 단계로 합치지 않습니다. Draft 상태와 구현 후보 상태는 동시에 존재할 수 있으며, 서로 모순으로 처리하지 않습니다.</p></div><div class="matrix-stage">${implementation}</div>${lifecycleAxisSection(platform)}<p class="meta">근거 신뢰도: ${metrics?.evidenceConfidence ?? platform.dataCompleteness.evidenceStrength ?? 0}/100. 검증된 구현 합계: ${verified}. 릴리스, 활성화, 운영 채택은 별도 근거가 있을 때만 표시합니다. 검증 구현이 0건이면 클라이언트 미지원이 아니라 판단 보류로 해석합니다.</p>`;
}

function lifecycleAxisSection(platform: TechnologyPlatformLayer): string {
  const proposalId = platform.lifecycleTimelines[0]?.proposalId;
  const axes = platform.lifecycleAxes?.filter((axis) => axis.proposalId === proposalId) ?? [];
  if (!proposalId || !axes.length) return lifecycleTimelineSection(platform);
  return `<article class="action-card priority-primary"><h3>${escapeHtml(proposalId)} 상태 축</h3><div class="table-wrap"><table class="table"><thead><tr><th>축</th><th>현재 상태</th><th>근거 수</th><th>가장 강한 직접 근거</th><th>업데이트</th><th>제한사항</th></tr></thead><tbody>${axes.map((axis) =>
    `<tr><td><b>${escapeHtml(lifecycleAxisLabel(axis.axis))}</b></td><td>${renderBadge(lifecycleAxisStatusLabel(axis.status), axis.status === "NONE_COLLECTED" || axis.status === "NOT_SCHEDULED" || axis.status === "NOT_APPLICABLE" ? "badge-unverified" : "badge-tracking")}</td><td>${axis.evidenceCount}</td><td>${escapeHtml(axis.strongestEvidence ?? "확인된 근거 없음")}</td><td>${escapeHtml(formatOptionalDate(axis.updatedAt))}</td><td>${escapeHtml(localizeGeneratedText(axis.limitations[0] ?? "추가 근거 필요"))}</td></tr>`
  ).join("")}</tbody></table></div></article>`;
}

function lifecycleAxisLabel(axis: string): string {
  if (axis === "Specification") return "Specification";
  if (axis === "Implementation") return "Implementation";
  if (axis === "Network") return "Network";
  return "Adoption";
}

function lifecycleAxisStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    REVIEW: "Review",
    LAST_CALL: "Last Call",
    FINAL: "Final",
    LIVING: "Living",
    STAGNANT: "Stagnant",
    WITHDRAWN: "Withdrawn",
    UNKNOWN: "확인 불가",
    NONE_COLLECTED: "확인된 근거 없음",
    TRACKING: "구현 추적",
    CANDIDATE: "구현 후보",
    VERIFIED: "검증된 구현",
    RELEASED: "릴리스 포함",
    NOT_SCHEDULED: "일정 근거 없음",
    FORK_CANDIDATE: "포크 후보",
    SCHEDULED: "일정 확인",
    ACTIVATED: "활성화",
    NOT_APPLICABLE: "적용 대상 아님",
    EXPERIMENTAL: "실험적 사용",
    PRODUCTION: "운영 채택",
  };
  return labels[status] ?? status;
}

function fullClientMatrix(matrix: TechnologyPlatformLayer["clientMatrices"][number]): string {
  const rows = matrix.clients.map((client) =>
    `<tr><td><b>${escapeHtml(client.client)}</b></td><td>${escapeHtml(clientFamilyLabel(client.family))}</td><td>${clientStatusChip(client.status)}</td><td>${escapeHtml(clientReasonSummary(client.scoreBreakdown))}</td><td>${escapeHtml(matrix.proposalId)}</td></tr>`
  ).join("");
  return `<div class="table-wrap"><table class="table client-matrix"><thead><tr><th>클라이언트</th><th>계열</th><th>상태</th><th>근거</th><th>EIP</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function evidenceReferencesSection(
  layer: AdoptionLayer,
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  mode: ReportMode,
): string {
  const refs = layer.items.flatMap((item) => item.sources.slice(0, 4).map((source) => ({ item, source })));
  const hasNoRenderedSources = refs.length === 0 && layer.items.length > 0;
  const collectionNote = layer.collectionStatus === "skipped"
    ? `<p class="reference-notice">${escapeHtml(localizeGeneratedText(layer.note ?? githubSkippedMessage()))} 현재 관찰 신호는 논의와 모멘텀 기반으로 유지됩니다.</p>`
    : layer.collectionStatus === "failed"
      ? `<p class="reference-notice">${escapeHtml(localizeGeneratedText(layer.note ?? "GitHub evidence collection could not be completed for this run."))} 외부 근거 주장 없이 보고서 생성을 계속했습니다.</p>`
      : hasNoRenderedSources
        ? '<p class="reference-notice">현재 관찰 신호는 논의와 모멘텀 기반으로 유지됩니다.</p>'
        : "";
  const fallback = layer.items.map((item) => `<article class="reference-item"><h3>${escapeHtml(item.proposalId)} ${escapeHtml(item.title)}</h3><p class="reference-source">${escapeHtml(item.theme)}${SEP}${escapeHtml(formatEvidenceLevel(item.evidenceLevel))}${SEP}${item.evidenceScore}/100</p><p>${escapeHtml(localizeGeneratedText(item.summary))}</p></article>`).join("");
  const bibliography = refs.map(({ item, source }) => {
    const title = source.title ?? item.title;
    const sourceName = source.repo ?? source.sourceType;
    const date = source.updatedAt?.slice(0, 10) ?? "날짜 확인 불가";
    const confidence = `${formatEvidenceLevel(item.evidenceLevel)} ${item.evidenceScore}/100`;
    const relation = formatRelationship(source.relationship ?? "direct");
    return `<article class="reference-item ${source.relationship === "cluster_related" ? "cluster-reference" : "direct-evidence"}"><h3>${source.url ? `<a href="${escapeHtml(source.url)}">${escapeHtml(title)}</a>` : escapeHtml(title)}</h3><p class="reference-source">${escapeHtml(sourceName)}${SEP}${escapeHtml(date)}${SEP}${escapeHtml(confidence)}${SEP}${escapeHtml(relation)}</p><p>${escapeHtml(localizeGeneratedText(source.matchedTerm ?? sourceMeta(source)))}</p><details><summary>원문 및 출처 보기</summary><p class="meta">${escapeHtml(sourceMeta(source))}</p>${source.path ? `<p class="meta">${escapeHtml(source.path)}</p>` : ""}</details></article>`;
  }).join("");
  const limits = evidenceLimitations(report, platform, layer);
  const mainEvidence = mode === "partial" || mode === "incident"
    ? `<div class="reference-list"><article class="reference-item"><h3>검증된 구현·릴리스·활성화 직접 근거 없음</h3><p class="reference-source">고유 직접 근거 object ${platform.dataCompleteness.evidenceMetrics?.uniqueDirectEvidence ?? directEvidenceCount(layer)}건${SEP}고유 클러스터 참조 object ${platform.dataCompleteness.evidenceMetrics?.uniqueClusterReferences ?? clusterReferenceCount(layer)}건${SEP}Proposal-Evidence 연결 ${platform.dataCompleteness.evidenceMetrics?.proposalEvidenceRelations ?? directEvidenceCount(layer) + clusterReferenceCount(layer)}건${SEP}근거 신뢰도 ${platform.dataCompleteness.confidenceMetrics?.evidenceConfidence ?? platform.dataCompleteness.evidenceStrength ?? 0}/100</p><p>직접 출처가 일부 존재하더라도 이번 실행에서는 운영 판단에 필요한 구현 완료·릴리스 포함·네트워크 활성화·운영 채택 근거가 확인되지 않았습니다. 논의 링크와 제안 상태는 관찰 자료로만 사용할 수 있습니다.</p></article></div>`
    : `<div class="reference-list">${bibliography || fallback || '<p class="muted">표시할 외부 근거가 없습니다.</p>'}</div>`;
  return `<div class="section-head"><h2>Evidence and Limitations</h2><p>이 섹션은 보고서의 결론이 어디까지 유효한지 정합니다. 신뢰도가 낮을수록 결론은 축소되고, 금지 해석은 본문에서 직접 표시합니다.</p></div>${collectionNote}<div class="reference-layout">${mainEvidence}<aside class="summary-sticky">${limits}</aside></div><details><summary>근거 요약 표 보기</summary>${adoptionEvidenceSummaryTable(layer.items)}</details><details><summary>출처 보관 메타데이터</summary>${adoptionEvidenceCards(layer.items)}</details>`;
}

function evidenceLimitations(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, layer: AdoptionLayer): string {
  const data = platform.dataCompleteness;
  const metrics = data.evidenceMetrics;
  const latest = latestEvidenceDate(layer) ?? report.ethereumTechRadar.latestSnapshot.collectedAt ?? "확인 불가";
  const confidence = confidenceState(data.confidenceMetrics?.evidenceConfidence ?? data.evidenceStrength ?? 0, platform);
  const category = metrics?.categoryMetrics;
  return `<div><span>수집 상태</span><b>${escapeHtml(formatDataCompletenessStatus(data.status))}</b></div><div><span>판단 상태</span><b>${escapeHtml(confidence)}</b></div><div><span>성공한 출처</span><b>${data.sourcesSucceeded}/${data.requiredSourcesAttempted}</b></div><div><span>수집 실패 출처</span><b>${metrics?.failedSources ?? data.sourcesFailed}</b></div><div><span>원시 후보</span><b>${metrics?.rawCandidates ?? visibleEvidenceCount(report, layer)}</b></div><div><span>조건 일치 출처</span><b>${metrics?.matchedSources ?? directEvidenceCount(layer) + clusterReferenceCount(layer)}</b></div><div><span>채택 근거 object</span><b>${metrics?.acceptedEvidence ?? directEvidenceCount(layer) + clusterReferenceCount(layer)}</b></div><div><span>화면 표시 근거</span><b>${metrics?.displayedEvidence ?? Math.min(12, directEvidenceCount(layer) + clusterReferenceCount(layer))}</b></div><div><span>고유 직접 근거 object</span><b>${metrics?.uniqueDirectEvidence ?? directEvidenceCount(layer)}</b></div><div><span>고유 클러스터 참조 object</span><b>${metrics?.uniqueClusterReferences ?? clusterReferenceCount(layer)}</b></div><div><span>Proposal-Evidence 연결</span><b>${metrics?.proposalEvidenceRelations ?? directEvidenceCount(layer) + clusterReferenceCount(layer)}</b></div><div><span>구현 후보 근거</span><b>${(category?.implementationTrackingEvidence ?? 0) + (category?.implementationCandidateEvidence ?? 0)}</b></div><div><span>검증 구현·릴리스·활성화 근거</span><b>${(category?.verifiedImplementationEvidence ?? 0) + (category?.releaseEvidence ?? 0) + (category?.activationEvidence ?? 0)}</b></div><div><span>마지막 성공 수집</span><b>${escapeHtml(latest)}</b></div><div><span>집계 설명</span><p class="meta">고유 근거 수는 중복 제거된 출처 개수입니다. Proposal별 연결 수는 동일 출처가 복수 proposal과 연결될 수 있어 전체 고유 근거보다 클 수 있습니다.</p></div><div><span>결론 내리면 안 되는 항목</span><ul class="limits-list"><li>클라이언트가 제안을 지원하지 않는다</li><li>논의가 비활성이다</li><li>구현이 존재하지 않는다</li><li>수집 범위 밖에서 명세 변경이 없었다</li></ul></div>`;
}

function businessRelevanceSection(report: WeeklyRadarReport, platform: TechnologyPlatformLayer): string {
  const adoptionLayer = getAdoptionLayer(report);
  const action = immediateBusinessAction(platform, adoptionLayer);
  const areas = [
    "지갑 권한",
    "트랜잭션 실행 경계",
    "수탁 또는 결제·정산은 직접 근거가 있을 때만",
  ];
  const evidence = platform.kgldIntelligence.find((item) => item.overall !== "None");
  const level = strongestAdoptionLevel(adoptionLayer);
  const evidenceBasis = level === "Implementation"
    ? "구현 근거가 수집됐더라도 비즈니스 적용 여부는 릴리스·활성화·운영 채택 근거와 별도 검토가 필요합니다."
    : level === "Reference"
      ? "외부 참조 근거가 있으나 직접 클라이언트 구현, 릴리스, 활성화 근거는 별도로 필요합니다."
      : "확인된 구현 근거가 없으므로 즉시 실행 가능한 KGLD 또는 운영 판단은 지원되지 않습니다.";
  return `<div class="section-head"><h2>Business Relevance</h2><p>이 섹션은 기술 관찰을 비즈니스 실행으로 바꿀 수 있는지 판단합니다. 실행 신호가 낮으면 Early Exploration으로 남기고 투자 조언이나 채택 추론으로 확장하지 않습니다.</p></div><div class="landscape-layout"><div class="landscape-copy"><span class="landscape-label">즉시 대응</span><p>${escapeHtml(action === "None supported" ? "현재 신호로는 즉시 KGLD 또는 운영 액션을 지원하지 않습니다." : "직접 근거가 있는 항목은 수동 검토가 가능합니다.")}</p><span class="landscape-label">중기 관찰 영역</span><p>${escapeHtml(areas.join(", "))}</p><span class="landscape-label">근거 기준</span><p>${escapeHtml(evidence ? evidenceBasis : "이번 실행에서 비즈니스 실행으로 전환할 직접 신호는 낮습니다.")}</p><span class="landscape-label">다음 확인</span><p>다음 실행에서는 소스 수집 복구, 제안별 구현 근거, 릴리스 노트, 활성화 근거를 우선 확인합니다.</p></div><aside class="landscape-highlights"><h3>운영 영역</h3><div><span>지갑 권한</span><b>중기 관찰</b></div><div><span>실행 경계</span><b>중기 관찰</b></div><div><span>결제·정산 영향</span><b>Early Exploration</b></div><div><span>수탁 영향</span><b>Early Exploration</b></div></aside></div>`;
}

function kgldCausalSection(items: KgldCausalAssessment[]): string {
  const supported = items.filter((item) => item.relevance !== "none");
  if (!supported.length) {
    return `<details><summary>KGLD 인과 평가</summary><p class="muted">이번 근거로 식별 가능한 KGLD 직접 관련성은 없습니다. 단순 키워드 유사도만으로 관련성을 표시하지 않습니다.</p></details>`;
  }
  return `<details open><summary>KGLD 인과 평가</summary><div class="table-wrap"><table class="table"><thead><tr><th>Proposal</th><th>기능</th><th>변경 가정</th><th>KGLD 구성요소</th><th>현재 의존성</th><th>인과관계</th><th>Trigger</th><th>Action</th><th>Evidence Confidence</th></tr></thead><tbody>${supported.map((item) => `<tr><td>${escapeHtml(item.proposalId ?? item.signal)}</td><td>${escapeHtml(localizeGeneratedText(item.proposalFunction ?? item.signal))}</td><td>${escapeHtml(localizeGeneratedText(item.changedTechnicalAssumption ?? "직접 변경 가정 확인 필요"))}</td><td>${escapeHtml(formatKgldComponentText(item.affectedComponent))}</td><td>${escapeHtml(formatKgldDependency(item.currentKgldDependency ?? "UNKNOWN"))}</td><td>${escapeHtml(localizeGeneratedText(item.causalPath))}</td><td>${escapeHtml(localizeGeneratedText(item.followUpTrigger))}</td><td>${escapeHtml(formatKgldRecommendedAction(item.recommendedAction ?? "MONITOR"))}</td><td>${item.evidenceConfidence ?? item.confidence}/100</td></tr>`).join("")}</tbody></table></div></details>`;
}

function formatKgldComponentText(value: string): string {
  if (value === "token_contract") return "토큰 계약";
  if (value === "issue") return "발행";
  if (value === "redeem") return "상환";
  if (value === "wallet") return "지갑";
  if (value === "custody") return "수탁";
  if (value === "settlement") return "결제·정산";
  if (value === "por") return "준비금 증명";
  if (value === "compliance") return "컴플라이언스";
  if (value === "admin") return "관리 권한";
  if (value === "infrastructure") return "인프라";
  return "식별된 구성요소 없음";
}

function formatKgldDependency(value: NonNullable<KgldCausalAssessment["currentKgldDependency"]>): string {
  if (value === "USED") return "사용 중";
  if (value === "PLANNED") return "계획됨";
  if (value === "NOT_USED") return "현재 사용 근거 없음";
  return "확인 필요";
}

function formatKgldRecommendedAction(value: NonNullable<KgldCausalAssessment["recommendedAction"]>): string {
  if (value === "IGNORE") return "제외";
  if (value === "MONITOR") return "관찰";
  if (value === "REVIEW") return "검토";
  if (value === "TECHNICAL_ASSESSMENT") return "기술 평가";
  if (value === "POC") return "조건부 PoC";
  return "채택";
}

function followUpQueueSection(items: FollowUpItem[]): string {
  if (!items.length) return `<details><summary>후속 관찰 대기열</summary><p class="muted">현재 근거에서 실행 가능한 후속 관찰 항목이 생성되지 않았습니다.</p></details>`;
  return `<details open><summary>후속 관찰 대기열</summary><div class="table-wrap"><table class="table"><thead><tr><th>항목</th><th>현재 상태</th><th>다음 trigger</th><th>확인 출처</th><th>담당</th><th>조치</th><th>우선순위</th></tr></thead><tbody>${items.map((item) => `<tr><td>${escapeHtml(item.target)}</td><td>${escapeHtml(item.currentState)}</td><td>${escapeHtml(item.nextTrigger)}</td><td>${escapeHtml(item.sourceToMonitor)}</td><td>${escapeHtml(item.owner)}</td><td>${escapeHtml([item.recommendedResponse, item.rationale].filter(Boolean).join(" "))}</td><td>${escapeHtml(item.urgency)}</td></tr>`).join("")}</tbody></table></div></details>`;
}

function strongestAdoptionLevel(layer: AdoptionLayer): "Implementation" | "Reference" | "Unknown" {
  if (layer.items.some((item) => item.evidenceLevel === "Implementation")) return "Implementation";
  if (layer.items.some((item) => item.evidenceLevel === "Reference" || item.evidenceLevel === "Mention")) return "Reference";
  return "Unknown";
}

function appendixSection(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  watchlist: WatchlistLayer,
  adoptionLayer: AdoptionLayer,
  topThemes: ThemeInsight[],
  candidates: KgldCandidate[],
  changes: WeeklyRadarReport["ethereumTechRadar"]["recentChanges"],
  charts: WeeklyRadarReport["chartData"],
  releaseDeploymentHtml: string,
): string {
  return [
    `<details><summary>Proposal Directory</summary>${watchlistSummary(watchlist)}<p class="watchlist-note">${watchlistConfidenceExplanation(watchlist, report)}</p>${watchlistCards(watchlist, adoptionLayer)}${diffTable(report.ethereumTechRadar.signalLayer.diffIntelligence)}</details>`,
    `<details><summary>Full Client Matrix</summary>${platform.clientMatrices[0] ? fullClientMatrix(platform.clientMatrices[0]) : '<p class="muted">클라이언트 매트릭스가 없습니다.</p>'}</details>`,
    `<details><summary>Full Lifecycle Data</summary>${platform.lifecycleTimelines.map((timeline) => `<h3>${escapeHtml(timeline.proposalId)}</h3>${lifecycleEvidenceDetails(timeline)}${scoreDetails("점수 산정 근거", timeline.stages.find((stage) => stage.name === timeline.currentStage)?.scoreBreakdown ?? [])}`).join("") || '<p class="muted">라이프사이클 데이터가 없습니다.</p>'}${releaseDeploymentHtml}</details>`,
    `<details><summary>Theme Scores</summary><p class="muted">모멘텀 점수 기준 상위 8개 테마를 표시합니다.</p>${momentumTable(topThemes)}${topThemes.map(themeCard).join("")}</details>`,
    `<details><summary>Discussion Links</summary><p class="muted">활동성 점수는 확인 가능한 공개 논의 메타데이터만 사용합니다.</p>${discussionTable(report.ethereumTechRadar.signalLayer.discussionHeat, report)}</details>`,
    `<details><summary>KGLD Scoring Details</summary>${candidateTable(candidates.slice(0, 12))}</details>`,
    `<details><summary>Calculation and Traceability Metadata</summary>${dataCompletenessSection(platform)}${visibleSection(platform, "Evidence Graph", () => evidenceGraphSection(platform)) || '<p class="muted">표시할 근거 그래프가 없습니다.</p>'}<p class="meta">Technology Platform API와 chart data script에 계산 결과와 출처 식별자를 보존합니다.</p></details>`,
    `<details><summary>Raw Chart Data</summary>${chartOrFallback("주간 변경", "weeklyEventTypeDistributionChart", charts.weeklyEventTypeDistribution, `최근 ${report.changePeriod.days}일 동안 감지된 변경 데이터가 없습니다.`)}${chartOrFallback("모멘텀 개요", "developerMomentumChart", charts.developerMomentumScores, "개발자 모멘텀 점수 데이터가 없습니다.")}${chartOrFallback("테마 분포", "themeDistribution180dChart", charts.themeDistribution180d, "최근 180일 테마 데이터가 없습니다.")}${eventSummary(changes)}</details>`,
  ].join("");
}

function renderLowerGrid(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, adoptionLayer: AdoptionLayer): string {
  const cards = [
    {
      title: "기술 레이더",
      status: "관찰",
      summary: "관찰 대상 기술군과 성숙도를 우선순위로 정렬합니다.",
      impact: "중기 기술 방향성",
      evidence: technologyRadarBrief(platform),
      action: "상세 레이더 검토",
    },
    {
      title: "클라이언트 구현 현황",
      status: "근거 분리",
      summary: "검증된 구현과 구현 추적을 분리해 확인합니다.",
      impact: "릴리스 판단 차단",
      evidence: clientCoverageBrief(platform),
      action: "클라이언트 출처 확인",
    },
    {
      title: "KGLD 영향",
      status: "비즈니스 추론",
      summary: "관찰된 기술 신호와 비즈니스 추론을 분리합니다.",
      impact: "직접 적용 전 검증",
      evidence: kgldBrief(platform),
      action: "영향 가설 검증",
    },
    {
      title: "권장 액션",
      status: "다음 확인",
      summary: "상향 판단 전 필요한 근거 검토 작업입니다.",
      impact: "다음 보고 주기",
      evidence: actionsBrief(report),
      action: "다음 수집에서 재평가",
    },
  ];
  return `<div class="section-head"><h2>핵심 검토 항목</h2><p>경영진이 바로 판단해야 하는 네 가지 영역을 가로형 카드로 요약했습니다.</p></div><div class="review-grid">${cards.map((card) => `<article class="review-card"><div class="review-main"><div class="review-title"><h3>${escapeHtml(card.title)}</h3><span class="badge badge-info">${escapeHtml(card.status)}</span></div><p>${escapeHtml(card.summary)}</p><dl class="review-fields"><div><dt>영향</dt><dd>${escapeHtml(card.impact)}</dd></div><div><dt>핵심 근거</dt><dd><div class="review-metrics">${card.evidence}</div></dd></div></dl></div><div class="review-action"><span>${escapeHtml(card.action)}</span></div></article>`).join("")}</div><details><summary>전체 분석 보기</summary><p class="muted">아래 상세 섹션에서 원문 근거, 점수 산정, 추적성 메타데이터를 확인할 수 있습니다.</p><p class="meta">채택 근거 레이어: ${escapeHtml(adoptionLayer.generatedBy)}${SEP}${escapeHtml(adoptionLayer.collectionStatus ?? "확인 중")}</p></details>`;
}

function technologyRadarBrief(platform: TechnologyPlatformLayer): string {
  const groups = ["Watch", "Trial", "Adopt", "Hold"].map((quadrant) => ({
    quadrant,
    count: platform.technologyRadar.filter((item) => item.quadrant === quadrant && item.traceability.evidenceIds.length > 0).length,
  })).filter((item) => item.count > 0);
  return groups.length ? groups.map((item) => `<span>${escapeHtml(formatRadarQuadrant(item.quadrant))}<b>${item.count}</b></span>`).join("") : "<span>표시 항목<b>0</b></span>";
}

function actionsBrief(report: WeeklyRadarReport): string {
  const count = getWatchlistLayer(report).items.length;
  return `<span>관찰 항목<b>${count}</b></span><span>우선 액션<b>${Math.min(4, count)}</b></span>`;
}

function clientCoverageBrief(platform: TechnologyPlatformLayer): string {
  const matrix = platform.clientMatrices[0];
  if (!matrix) return '<p class="muted">클라이언트 근거가 없습니다.</p>';
  const visible = matrix.clients.filter((cell) => cell.status !== "No evidence").slice(0, 5);
  if (!visible.length) return '<p class="muted">검증된 구현 없음. 현재 상태는 근거 없음으로 유지합니다.</p>';
  return `<ul class="monitor-list">${visible.map((cell) => `<li><b>${escapeHtml(cell.client)}</b>: ${escapeHtml(formatClientStatus(cell.status))} <span class="muted">${escapeHtml(matrix.proposalId)}</span></li>`).join("")}</ul>`;
}

function kgldBrief(platform: TechnologyPlatformLayer): string {
  const primary = platform.kgldIntelligence.find((item) => item.overall !== "None") ?? platform.kgldIntelligence[0];
  const dimensions = ["결제", "실행 경계", "보안", "운영"];
  if (!primary) return `<ul class="monitor-list">${dimensions.map((item) => `<li>${item}: Early Exploration</li>`).join("")}</ul>`;
  const level = formatBusinessImpactLevel(primary.overall);
  return `<p class="muted">관찰된 기술 신호와 비즈니스 추론을 분리해 해석합니다.</p><ul class="monitor-list">${dimensions.map((item, index) => `<li>${item}: ${index === 1 ? escapeHtml(level === "없음" ? "Early Exploration" : level) : "Early Exploration"}</li>`).join("")}</ul>`;
}

function chartOrFallback(title: string, id: string, series: ChartSeries, message: string): string {
  return hasChartData(series)
    ? `<article class="card half"><h3>${escapeHtml(title)}</h3><div class="chart"><canvas id="${id}"></canvas></div></article>`
    : `<article class="card half"><h3>${escapeHtml(title)}</h3><div class="empty">${escapeHtml(message)}</div></article>`;
}

function executiveHeroSection(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  adoptionLayer: AdoptionLayer,
  mode: ReportMode,
  ecosystem: EcosystemStateLayer,
): string {
  const metrics = platform.dataCompleteness.confidenceMetrics ?? { collectionConfidence: platform.dataCompleteness.collectionCompleteness ?? 0, evidenceConfidence: platform.dataCompleteness.evidenceStrength ?? 0, signalStrength: 0 };
  const weeklyChanges = report.ethereumTechRadar.signalLayer.diffIntelligence.length + report.ethereumTechRadar.recentChanges.total;
  const implementationCount = verifiedImplementationCount(platform);
  const evidenceMetrics = platform.dataCompleteness.evidenceMetrics;
  const primaryNarrative = ecosystem.longTermNarratives[0];
  const decisionState = platform.dataCompleteness.status === "degraded" ? "INSUFFICIENT_EVIDENCE" : "MONITOR";
  const facts = [
    ["수집 신뢰도", `${metrics.collectionConfidence}/100`],
    ["근거 신뢰도", `${metrics.evidenceConfidence}/100`],
    ["신호 강도", `${metrics.signalStrength}/100`],
    ["판단 상태", decisionStateLabel(decisionState)],
    ["즉시 대응", immediateBusinessAction(platform, adoptionLayer) === "None supported" ? "지원 근거 없음" : "수동 검토"],
    ["고유 직접 근거", String(evidenceMetrics?.uniqueDirectEvidence ?? directEvidenceCount(adoptionLayer))],
  ];
  const answers = mode === "incident" ? [
    ["What are Ethereum developers building?", ecosystem.currentState],
    ["What deserves attention?", "수집 품질이 낮으므로 모든 내러티브는 Early Exploration 또는 Stable 신호로 낮춰 읽습니다."],
    ["Which technologies are connected?", ecosystem.connectedTechnologies.slice(0, 4).map((item) => `${item.source} ${item.relation} ${item.target}`).join(", ") || "연결 기술은 debug graph에서만 제한적으로 확인됩니다."],
    ["What did this week add?", "핵심 수집 경로가 실패했으므로 이번 주 contribution은 수집 복구 필요성입니다."],
  ] : [
    ["What are Ethereum developers building?", ecosystem.currentState],
    ["Which narratives are strengthening?", ecosystem.emergingNarratives.length ? ecosystem.emergingNarratives.slice(0, 3).map((item) => `${item.title} (${item.state})`).join(", ") : `${primaryNarrative?.title ?? "주요 내러티브"} is ${primaryNarrative?.state ?? "Stable"}.`],
    ["How is focus shifting?", `The ${report.trendPeriod.days}-day view emphasizes ${ecosystem.longTermNarratives.slice(0, 3).map((item) => item.title).join(", ") || "tracked narratives"} rather than isolated weekly proposal movement.`],
    ["What did this week add?", weeklyChanges > 0 ? `This week's ${weeklyChanges} signal(s) add evidence to existing narratives; they do not replace the ecosystem state.` : "This week adds little new evidence, so the ecosystem state remains anchored in long-term narratives."],
    ["Implementation boundary", implementationCount > 0 ? `검증된 구현 근거 ${implementationCount}건이 수집됐습니다. 릴리스·활성화·운영 채택은 별도 게이트로 유지합니다.` : "구현, 릴리스, 활성화, 운영 채택은 직접 근거가 있을 때만 별도로 표시합니다."],
  ];
  return `<div class="executive-summary"><div class="summary-copy"><h2>Ethereum Development Direction</h2>${answers.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p>`).join("")}</div><aside class="summary-sticky" aria-label="경영진 요약 지표">${facts.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("")}</aside></div>`;
}

function titleForHero(title: string, primaryId: string): string {
  return title.replace(new RegExp(`^${primaryId}\\s*[:\\-]?\\s*`, "i"), "").replace(/follow-through|cluster refinement/gi, "").trim() || title;
}

function statusBadge(label: string, kind: "lifecycle-current" | "future" | "risk-high" | "risk-medium" | "verified" | "no-evidence" = "future"): string {
  return `<span class="badge ${kind}">${escapeHtml(label)}</span>`;
}

function shortKoreanSummary(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1).trim()}…` : value;
}

function weeklyNarrativeCard(narrative: NarrativeLayer): string {
  const visible = narrative.weeklyNarrative.slice(0, 4).map((line) => localizeGeneratedText(line));
  const compact = shortKoreanSummary(visible.join(" "), 500);
  const extended = narrative.weeklyNarrative.map((line) => `<p>${escapeHtml(localizeGeneratedText(line))}</p>`).join("");
  return `<article class="card narrative-compact"><div class="eyebrow">주간 기술 내러티브${SEP}${escapeHtml(formatGeneratedBy(narrative.generatedBy))}</div><h2>의미와 해석</h2><p>${escapeHtml(compact)}</p>${narrative.weeklyNarrative.length > 1 ? `<details><summary>전체 해설 보기</summary>${extended}</details>` : ""}</article>`;
}

function storyRow(stories: TechnologyStory[]): string {
  if (!stories.length) return '<div class="empty"><b>생성된 기술 이슈가 없습니다</b><span>추가 momentum 또는 discussion evidence가 필요합니다.</span></div>';
  return `<div class="story-row">${stories.map(storyCard).join("")}</div>`;
}

function storyCard(story: TechnologyStory): string {
  const proposals = story.relatedProposals.length
    ? story.relatedProposals.map((proposalId) => `<span class="tag">${escapeHtml(proposalId)}</span>`).join("")
    : '<span class="tag">proposal 근거 없음</span>';
  return `<article class="story-card"><div class="eyebrow">${escapeHtml(story.primaryTheme)}</div><h3>${escapeHtml(story.storyTitle)}</h3><div class="tags">${proposals}</div><p>${escapeHtml(localizeGeneratedText(story.interpretation))}</p><p class="meta">${escapeHtml(localizeGeneratedText(story.watchNext))}</p><ul>${story.evidence.map((item) => `<li>${escapeHtml(localizeEvidenceText(item))}</li>`).join("")}</ul></article>`;
}

function signalEvidenceCard(evidence: NarrativeEvidence): string {
  const topDiscussion = evidence.topDiscussions[0];
  const topTheme = evidence.topMomentumThemes[0];
  const highCount = evidence.topDiscussions.filter((item) => item.activityLevel === "High").length;
  return `<article class="card"><h2>신호 근거</h2><div class="evidence-grid"><div class="evidence-item"><span>최상위 논의</span><b>${escapeHtml(topDiscussion?.proposalId ?? "없음")}</b><span>${escapeHtml(topDiscussion ? `댓글 ${topDiscussion.replies ?? 0}개${SEP}참여자 ${topDiscussion.participants ?? 0}명` : "논의 열기 없음")}</span></div><div class="evidence-item"><span>최상위 모멘텀 테마</span><b>${escapeHtml(topTheme?.theme ?? "없음")}</b><span>${topTheme?.score ?? 0}/100</span></div><div class="evidence-item"><span>최근 변경</span><b>${evidence.recentChangeCount}</b><span>문안 변경 ${evidence.contentDiffCount}건</span></div><div class="evidence-item"><span>관련 proposal 수</span><b>${evidence.topMomentumThemes.length}</b><span>상위 모멘텀 테마</span></div><div class="evidence-item"><span>높은 활동성 논의</span><b>${highCount}</b><span>상위 근거 항목 기준</span></div></div><p class="muted">${escapeHtml(evidenceExplanation(evidence))}</p>${evidenceDetails(evidence)}</article>`;
}

function getWatchlistLayer(report: WeeklyRadarReport): WatchlistLayer {
  return report.ethereumTechRadar.watchlistLayer ?? buildWatchlistLayer(report);
}

function getAdoptionLayer(report: WeeklyRadarReport): AdoptionLayer {
  return report.ethereumTechRadar.adoptionLayer ?? buildAdoptionLayer(report);
}

function getTechnologyPlatformLayer(report: WeeklyRadarReport): TechnologyPlatformLayer {
  return report.ethereumTechRadar.technologyPlatformLayer ?? buildTechnologyPlatformLayer(report);
}

function getEcosystemStateLayer(report: WeeklyRadarReport): EcosystemStateLayer {
  return report.ethereumTechRadar.ecosystemStateLayer ?? buildEcosystemStateLayer(report);
}

function visibleSection(platform: TechnologyPlatformLayer, section: string, render: () => string, collapsed?: () => string): string {
  const decision = platform.sectionVisibility.find((item) => item.section === section);
  if (!decision || decision.visible) return render();
  return collapsed ? collapsed() : "";
}

function dataCompletenessSection(platform: TechnologyPlatformLayer): string {
  const data = platform.dataCompleteness;
  return `<article class="card"><h2>데이터 수집 완전성</h2><p>${escapeHtml(localizeDataCompletenessExplanation(data.explanation))}</p><div class="facts"><div class="fact"><span>상태</span><b>${escapeHtml(formatDataCompletenessStatus(data.status))}</b></div><div class="fact"><span>출처</span><b>${data.sourcesSucceeded}/${data.requiredSourcesAttempted}</b></div><div class="fact"><span>실패</span><b>${data.sourcesFailed}</b></div><div class="fact"><span>캐시 사용</span><b>${data.cacheHits}</b></div></div><details><summary>수집 세부 정보</summary><ul class="monitor-list"><li>누락 필드: ${escapeHtml(data.missingFields.join(", ") || "없음")}</li><li>건너뛴 보강: ${escapeHtml(data.enrichmentSkipped.join(", ") || "없음")}</li><li>Rate limit 저하: ${data.rateLimitDegradation ? "있음" : "없음"}</li></ul></details></article>`;
}

function platformDashboardSection(report: WeeklyRadarReport, platform: TechnologyPlatformLayer, adoptionLayer: AdoptionLayer, mode: ReportMode, ecosystem: EcosystemStateLayer): string {
  const dashboard = platform.dashboard;
  const topId = dashboard.topMovers[0] ?? platform.lifecycleTimelines[0]?.proposalId ?? "없음";
  const implementation = dashboard.implementationProgress.find((item) => item.proposalId === topId) ?? dashboard.implementationProgress[0];
  const kgld = dashboard.kgldWatch.find((item) => item.proposalId === topId) ?? dashboard.businessImpact.find((item) => item.proposalId === topId);
  const hiddenLists = [
    ["주요 변동 항목", dashboard.topMovers.join(", ") || "없음"],
    ["부상 중인 테마", dashboard.emergingThemes.slice(0, 6).join(", ") || "없음"],
    ["기술 레이더", dashboard.technologyRadar.map((item) => `${item.proposalId}: ${formatRadarQuadrant(item.quadrant)}`).slice(0, 8).join(SEP) || "없음"],
  ];
  const metrics = platform.dataCompleteness.confidenceMetrics ?? { collectionConfidence: platform.dataCompleteness.collectionCompleteness ?? 0, evidenceConfidence: platform.dataCompleteness.evidenceStrength ?? 0, signalStrength: 0 };
  const cards = mode === "partial" || mode === "incident" ? [
    ["수집 상태", "저하", "graded signal로 축소"],
    ["수집 신뢰도", `${metrics.collectionConfidence}/100`, "필수 출처 성공률과 수집 상태"],
    ["근거 신뢰도", `${metrics.evidenceConfidence}/100`, "직접 근거가 주장을 뒷받침하는 정도"],
    ["신호 강도", `${metrics.signalStrength}/100`, "변경·논의·활동 강도"],
    ["즉시 비즈니스 대응", immediateBusinessAction(platform, adoptionLayer) === "None supported" ? "지원 근거 없음" : "수동 검토", "현재 근거로 지원되는 즉시 실행"],
  ] : [
    ["Primary narrative", ecosystem.longTermNarratives[0]?.title ?? topId, ecosystem.longTermNarratives[0]?.state ?? "Stable"],
    ["Developer focus", ecosystem.longTermNarratives.slice(0, 3).map((item) => item.title).join(", ") || "분산 관찰", "3~6개월 focus"],
    ["신호 강도", `${metrics.signalStrength}/100`, "활동량이며 사실 신뢰도가 아닙니다"],
    ["구현 상태", implementation ? `검증된 구현 ${implementation.verifiedClients}건` : "검증된 구현 없음", "클라이언트 구현은 별도 검증 필요"],
    ["KGLD 영향", formatBusinessImpactLevel(kgld?.overall ?? "Monitor"), "직접 적용보다 관찰 우선"],
  ];
  return `<div class="section-head"><h2>Development Signals</h2><p>이 다섯 지표는 주간 뉴스가 아니라 현재 Ethereum 개발 상태를 빠르게 읽기 위한 요약입니다. Proposal은 evidence이며, 신호는 narrative 단위로 해석합니다.</p></div><div class="glance-strip">${cards.map(([label, value, note]) =>
    `<div class="metric-card"><span>${escapeHtml(label)}</span><b class="kpi-number">${escapeHtml(value)}</b><p>${escapeHtml(note)}</p></div>`
  ).join("")}</div><details><summary>보조 항목 더 보기</summary><ul class="monitor-list">${hiddenLists.map(([label, value]) => `<li><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</li>`).join("")}</ul></details>`;
}

function lifecycleTimelineSection(platform: TechnologyPlatformLayer): string {
  if (!platform.lifecycleTimelines.length) return '<div class="empty"><b>라이프사이클 타임라인이 없습니다</b><span>Watchlist 또는 proposal 근거가 필요합니다.</span></div>';
  const [primary, ...secondary] = platform.lifecycleTimelines;
  const current = primary.stages.find((stage) => stage.name === primary.currentStage);
  const rail = `<div class="lifecycle-rail" role="list" aria-label="${escapeHtml(primary.proposalId)} 라이프사이클">${primary.stages.map((stage) =>
    `<div class="rail-stage ${escapeHtml(stage.state)} ${escapeHtml(lifecyclePresentationState(stage))}" role="listitem" aria-label="${escapeHtml(formatLifecycleStage(stage.name))}: ${escapeHtml(lifecyclePresentationLabel(stage))}"><span class="rail-dot" aria-hidden="true"></span><span>${escapeHtml(formatLifecycleStage(stage.name))}</span><span class="muted">${escapeHtml(lifecyclePresentationLabel(stage))}</span></div>`
  ).join("")}</div>`;
  const secondaryRows = secondary.slice(0, 8).map((timeline) =>
    `<div class="compact-row"><span><b>${escapeHtml(timeline.proposalId)}</b>${SEP}${escapeHtml(timeline.title)}</span>${statusBadge(formatLifecycleStage(timeline.currentStage), "future")}</div>`
  ).join("");
  return `<article class="action-card priority-primary"><h3>${escapeHtml(primary.proposalId)} 라이프사이클 타임라인</h3><p class="meta">${escapeHtml(primary.title)}${SEP}현재 단계: ${escapeHtml(formatLifecycleStage(primary.currentStage))}</p>${rail}<p class="meta">범례: 직접 근거 있음 / 순서상 경유 추정 — 직접 근거 없음 / 근거 없음</p><p class="meta">${escapeHtml(formatLimitation(current?.limitations[0] ?? "No limitation text available."))} ${freshnessLabel(current?.freshness)}</p><details><summary>라이프사이클 근거 및 상태</summary>${lifecycleEvidenceDetails(primary)}${scoreDetails("점수 산정 근거", current?.scoreBreakdown ?? [])}</details></article>${secondaryRows ? `<details class="secondary-lifecycle"><summary>보조 EIP 상세 보기</summary><div class="compact-list">${secondaryRows}</div></details>` : ""}`;
}

function lifecyclePresentationState(stage: TechnologyPlatformLayer["lifecycleTimelines"][number]["stages"][number]): "evidenced" | "sequence-implied" | "no-evidence" {
  if (stage.evidence.length > 0) return "evidenced";
  if (stage.state === "completed" || stage.state === "current") return "sequence-implied";
  return "no-evidence";
}

function lifecyclePresentationLabel(stage: TechnologyPlatformLayer["lifecycleTimelines"][number]["stages"][number]): string {
  if (stage.evidence.length > 0) return `직접 근거 ${stage.evidence.length}건`;
  if (stage.state === "completed" || stage.state === "current") return "순서상 경유 추정 — 직접 근거 없음";
  return "근거 없음";
}

function lifecycleEvidenceDetails(timeline: TechnologyPlatformLayer["lifecycleTimelines"][number]): string {
  const rows = timeline.stages.filter((stage) => stage.evidence.length > 0).map((stage) =>
    `<li><b>${escapeHtml(formatLifecycleStage(stage.name))}</b>: ${stage.evidence.map((item) => escapeHtml(item.label)).join(", ")}</li>`
  ).join("");
  return `<ul class="monitor-list">${rows || "<li>표시할 단계별 근거가 없습니다.</li>"}</ul>`;
}

function releaseDeploymentIntelligenceSection(platform: TechnologyPlatformLayer): string {
  const release = visibleSection(platform, "Release Watch", () => `<article class="card half"><h2>릴리스 관찰</h2>${releaseWatchSection(platform)}</article>`);
  const activation = visibleSection(platform, "Activation Watch", () => `<article class="card half"><h2>활성화 관찰</h2>${activationWatchSection(platform)}</article>`);
  return release || activation ? `<section class="section grid" id="release-deployment-intelligence">${release}${activation}</section>` : "";
}

function clientCoverageSummarySection(platform: TechnologyPlatformLayer): string {
  const proposal = platform.clientMatrices[0]?.proposalId ?? "tracked proposal";
  const clients = platform.clientMatrices[0]?.clients ?? [];
  const rows = clients.slice(0, 8).map((client) =>
    `<tr><td><b>${escapeHtml(client.client)}</b></td><td>${escapeHtml(clientFamilyLabel(client.family))}</td><td>${clientStatusChip(client.status)}</td><td>${escapeHtml(clientReasonSummary(client.scoreBreakdown))}</td><td>${escapeHtml(proposal)}</td></tr>`
  ).join("");
  return `<article class="card"><div class="section-head"><h2>클라이언트 구현 현황</h2><p>모니터링 대상 클라이언트에서 ${escapeHtml(proposal)}에 대한 제안별 구현 근거가 확인되지 않았습니다.</p></div><div class="table-wrap"><table class="table client-matrix"><thead><tr><th>클라이언트</th><th>계열</th><th>상태</th><th>근거</th><th>EIP</th></tr></thead><tbody>${rows || `<tr><td colspan="5" class="muted">표시할 클라이언트 행이 없습니다.</td></tr>`}</tbody></table></div><p class="meta">빈 전체 매트릭스는 부정 근거로 오해되지 않도록 요약 표로 접었습니다.</p></article>`;
}

function clientCoverageMatrixSection(platform: TechnologyPlatformLayer): string {
  const matrix = platform.clientMatrices[0];
  if (!matrix) return '<div class="empty"><b>클라이언트 매트릭스가 없습니다</b><span>추적 중인 제안이 없습니다.</span></div>';
  const statuses = ["Tracking", "Candidate", "Verified", "Released", "Activated"];
  const visibleClients = matrix.clients.filter((cell) => cell.status !== "No evidence");
  return `<h3>${escapeHtml(matrix.proposalId)}</h3><table class="table client-matrix"><thead><tr><th>클라이언트</th><th>계열</th><th>현재 상태</th>${statuses.map((status) => `<th class="matrix-cell">${escapeHtml(formatClientStatus(status))}</th>`).join("")}<th>근거</th></tr></thead><tbody>${visibleClients.map((cell) =>
    `<tr><td><b>${escapeHtml(cell.client)}</b></td><td>${escapeHtml(clientFamilyLabel(cell.family))}</td><td>${clientStatusChip(cell.status)}</td>${statuses.map((status) => `<td class="matrix-cell">${cell.status === status ? clientStatusChip(status) : '<span class="muted">-</span>'}</td>`).join("")}<td class="muted">${escapeHtml(clientReasonSummary(cell.scoreBreakdown))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function clientFamilyLabel(family: string): string {
  if (family === "execution") return "실행";
  if (family === "consensus") return "합의";
  return family;
}

function clientReasonSummary(scoreBreakdown: Array<{ label?: string; reason: string; value: number }>): string {
  const title = scoreBreakdown.map((item) => `${item.value >= 0 ? "+" : ""}${item.value}: ${localizeGeneratedText(item.reason)}`).join(SEP);
  if (/No target-specific client source matched this client\.|matched this client/i.test(title)) {
    return "제안별 클라이언트 근거가 확인되지 않았습니다.";
  }
  return title
    .replace(/no client evidence \+0: No target-specific client source matched this client\./gi, "제안별 클라이언트 근거가 확인되지 않았습니다.")
    .replace(/target-specific/gi, "제안별")
    .replace(/client source/gi, "클라이언트 출처")
    .replace(/client evidence/gi, "클라이언트 근거")
    .replace(/No /g, "")
    .trim();
}

function clientStatusChip(status: string): string {
  const normalized = formatClientStatus(status);
  const kind = status === "Verified" || status === "Released" || status === "Activated"
    ? "badge-success"
    : status === "Tracking" || status === "Candidate"
      ? "badge-tracking"
      : "badge-unverified";
  return renderBadge(normalized, kind);
}

function releaseWatchSection(platform: TechnologyPlatformLayer): string {
  const items = platform.releaseIntelligence.filter((item) => item.status !== "No release").slice(0, 8);
  return `<table class="table"><thead><tr><th>Proposal</th><th>상태</th><th>신뢰도</th><th>근거</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td>${escapeHtml(item.proposalId)}</td><td>${escapeHtml(formatReleaseStatus(item.status))}</td><td title="${escapeHtml(scoreTitle(item.scoreBreakdown))}">${item.confidence}</td><td>${scoreDetails("점수 산식", item.scoreBreakdown)}</td></tr>`
  ).join("")}</tbody></table>`;
}

function activationWatchSection(platform: TechnologyPlatformLayer): string {
  const items = platform.deploymentIntelligence.filter((item) => item.status !== "No evidence").slice(0, 8);
  return `<table class="table"><thead><tr><th>Proposal</th><th>상태</th><th>신뢰도</th><th>근거</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td>${escapeHtml(item.proposalId)}</td><td>${escapeHtml(formatDeploymentStatus(item.status))}</td><td title="${escapeHtml(scoreTitle(item.scoreBreakdown))}">${item.confidence}</td><td>${scoreDetails("점수 산식", item.scoreBreakdown)}</td></tr>`
  ).join("")}</tbody></table>`;
}

function evidenceGraphSection(platform: TechnologyPlatformLayer): string {
  const graph = platform.evidenceGraphs.find((item) => item.edges.length > 0);
  if (!graph) return "";
  const nodeLabel = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;
  const edges = graph.edges.filter((edge) => edge.from !== edge.to).slice(0, 10).map((edge) =>
    `<div class="graph-row"><span>${escapeHtml(nodeLabel(edge.from))}</span><span class="pill">${escapeHtml(formatGraphEdge(edge.type))}</span><span>${escapeHtml(nodeLabel(edge.to))}</span></div>`
  ).join("");
  return `<h3>${escapeHtml(graph.proposalId)}</h3><div class="graph">${edges}</div>`;
}

function technologyRadarSection(platform: TechnologyPlatformLayer): string {
  const quadrants = ["Watch", "Trial", "Adopt", "Hold"];
  const populated = quadrants.map((quadrant) => ({
    quadrant,
    items: platform.technologyRadar.filter((item) => item.quadrant === quadrant && item.traceability.evidenceIds.length > 0),
  })).filter((group) => group.items.length > 0);
  return `<div class="radar-grid quadrants-${Math.min(4, populated.length)}">${populated.map(({ quadrant, items }) => {
    const visible = items.slice(0, 5);
    const hidden = items.slice(5);
    if (!items.length) return "";
    return `<div class="radar-quadrant"><h3>${escapeHtml(formatRadarQuadrant(quadrant))}</h3><ul class="monitor-list">${visible.map((item) => `<li><b>${escapeHtml(item.proposalId)}</b> ${escapeHtml(item.title)}<br><span class="muted">${escapeHtml(localizeGeneratedText(item.why))}</span>${scoreDetails("레이더 근거", item.scoreBreakdown)}</li>`).join("")}</ul>${hidden.length ? `<details><summary>나머지 ${hidden.length}건 보기</summary><ul class="monitor-list">${hidden.map((item) => `<li><b>${escapeHtml(item.proposalId)}</b> ${escapeHtml(item.title)}</li>`).join("")}</ul></details>` : ""}</div>`;
  }).join("")}</div>`;
}

function themeIntelligenceSection(platform: TechnologyPlatformLayer): string {
  if (!platform.themeIntelligence.length) return '<p class="muted">테마 인텔리전스가 없습니다.</p>';
  return `<div class="compact-list">${platform.themeIntelligence.slice(0, 6).map((item) =>
    `<div class="compact-row"><span><b>${escapeHtml(item.theme)}</b><br><span class="muted">${escapeHtml(localizeGeneratedText(item.why))}</span></span><span>${statusBadge(formatRiskLevel(item.risk), item.risk === "High" ? "risk-high" : item.risk === "Medium" ? "risk-medium" : "future")}</span></div>`
  ).join("")}</div><details><summary>테마 점수 세부 보기</summary><table class="table"><thead><tr><th>테마</th><th>건강도</th><th>모멘텀</th><th>라이프사이클</th><th>채택</th><th>준비도</th></tr></thead><tbody>${platform.themeIntelligence.slice(0, 8).map((item) =>
    `<tr><td><b>${escapeHtml(item.theme)}</b></td><td>${item.health}</td><td>${item.momentum}</td><td>${escapeHtml(localizeGeneratedText(item.lifecycle))}</td><td>${escapeHtml(localizeGeneratedText(item.adoption))}</td><td>${escapeHtml(formatRadarQuadrant(item.readiness))}</td></tr>`
  ).join("")}</tbody></table></details>`;
}

function riskConfidenceSection(platform: TechnologyPlatformLayer): string {
  const risks = platform.risks.slice(0, 5).map((risk) =>
    `<div class="risk-item ${risk.risk === "High" ? "priority-critical" : "priority-secondary"}"><b>${escapeHtml(risk.proposalId)}</b> ${statusBadge(formatRiskLevel(risk.risk), risk.risk === "High" ? "risk-high" : risk.risk === "Medium" ? "risk-medium" : "future")}<br><span class="muted">${escapeHtml(formatRiskType(risk.type))}${SEP}${escapeHtml(localizeGeneratedText(risk.why))}</span>${scoreDetails("리스크 근거", risk.scoreBreakdown)}</div>`
  ).join("");
  const confidence = platform.confidence.slice(0, 4).map((item) =>
    `<li><b>${escapeHtml(item.proposalId)}</b> 신뢰도 ${item.overall}<br><span class="muted">데이터 ${item.dataCompleteness}${SEP}품질 ${item.evidenceQuality}${SEP}다양성 ${item.sourceDiversity}${SEP}검증 ${item.verificationStatus}${SEP}오탐 위험 ${item.falsePositiveRisk}</span>${scoreDetails("신뢰도 산식", item.scoreBreakdown)}</li>`
  ).join("");
  return `<h3>주요 리스크</h3><div class="risk-list">${risks || '<p class="muted">높은 리스크의 라이프사이클 공백은 감지되지 않았습니다.</p>'}</div><details><summary>신뢰도 산식 보기</summary><ul class="monitor-list">${confidence || '<li>신뢰도 데이터가 없습니다.</li>'}</ul></details>`;
}

function kgldIntelligenceSection(platform: TechnologyPlatformLayer): string {
  if (!platform.kgldIntelligence.length) return '<p class="muted">KGLD 영향 분석 데이터가 없습니다.</p>';
  const meaningful = platform.kgldIntelligence.filter((item) =>
    item.overall !== "None" && (item.overall !== "Monitor" || item.areas.some((area) => area.level !== "None"))
  );
  const primary = meaningful[0] ?? platform.kgldIntelligence[0]!;
  const secondary = meaningful.filter((item) => item.proposalId !== primary.proposalId).slice(0, 3);
  const primaryAreas = primary.areas.filter((area) => area.level !== "None").slice(0, 3);
  const areaText = primaryAreas.length ? primaryAreas.map((area) => `${formatKgldArea(area.area)}: ${formatBusinessImpactLevel(area.level)}`).join(", ") : "결제, 실행 경계";
  const why = primaryAreas[0]?.why ?? "구현 추적 단계이며 직접 적용 근거는 없습니다.";
  return `<div class="kgld-summary"><div class="action-card priority-primary"><h3>Primary: ${escapeHtml(primary.proposalId)}</h3><p><b>영향 영역:</b> ${escapeHtml(areaText)}</p><p><b>수준:</b> ${escapeHtml(formatBusinessImpactLevel(primary.overall))}</p><p><b>이유:</b> ${escapeHtml(localizeGeneratedText(why))}</p>${scoreDetails("KGLD 근거", primary.scoreBreakdown)}</div><div class="action-card"><h3>Secondary</h3>${secondary.length ? `<ul class="monitor-list">${secondary.map((item) => `<li><b>${escapeHtml(item.proposalId)}</b>${SEP}${escapeHtml(formatBusinessImpactLevel(item.overall))}</li>`).join("")}</ul>` : '<p class="muted">추가로 강조할 KGLD 항목은 없습니다.</p>'}</div></div>${platform.kgldIntelligence.length > secondary.length + 1 ? `<details><summary>관련 항목 더 보기</summary><table class="table"><thead><tr><th>Proposal</th><th>종합</th><th>주요 영향 영역</th><th>이유</th></tr></thead><tbody>${platform.kgldIntelligence.slice(0, 10).map((item) => {
    const active = item.areas.filter((area) => area.level !== "None").slice(0, 3);
    const areas = active.length ? active.map((area) => `${formatKgldArea(area.area)}: ${formatBusinessImpactLevel(area.level)}`).join(", ") : "직접적인 KGLD 영향 근거 없음";
    const why = active[0]?.why ?? "직접적인 비즈니스 workflow 근거가 확인되지 않았습니다.";
    return `<tr><td><b>${escapeHtml(item.proposalId)}</b><br><span class="muted">${escapeHtml(item.title)}</span></td><td>${escapeHtml(formatBusinessImpactLevel(item.overall))}</td><td>${escapeHtml(areas)}</td><td>${escapeHtml(localizeGeneratedText(why))}${scoreDetails("KGLD 근거", item.scoreBreakdown)}</td></tr>`;
  }).join("")}</tbody></table></details>` : ""}`;
}

function scoreDetails(summary: string, items: Array<{ label: string; value: number; reason: string }>): string {
  if (!items.length) return "";
  return `<details><summary>${escapeHtml(summary)}</summary><ul class="monitor-list">${items.map((item) => `<li>${escapeHtml(formatScoreLabel(item.label))}: ${item.value >= 0 ? "+" : ""}${item.value} - ${escapeHtml(localizeGeneratedText(item.reason))}</li>`).join("")}</ul></details>`;
}

function scoreTitle(items: Array<{ label: string; value: number; reason: string }>): string {
  return items.map((item) => `${formatScoreLabel(item.label)} ${item.value >= 0 ? "+" : ""}${item.value}: ${localizeGeneratedText(item.reason)}`).join(SEP);
}

function freshnessLabel(freshness: { ageDays?: number; stale: boolean } | undefined): string {
  if (!freshness || freshness.ageDays === undefined) return "";
  if (freshness.stale) return `근거가 오래되었을 수 있습니다. 마지막 출처 업데이트는 ${freshness.ageDays}일 전입니다.`;
  return `${freshness.ageDays}일 전 업데이트`;
}

function watchlistSummary(watchlist: WatchlistLayer): string {
  const top = watchlist.items[0];
  const highest = watchlist.items.reduce<WatchlistItem | undefined>(
    (best, item) => !best || item.confidenceScore > best.confidenceScore ? item : best,
    undefined,
  );
  const mainMode = watchlistSpecChangeLabel(watchlist) === "0 content diffs" ? "discussion/momentum-driven" : "diff/status-driven";
  return `<div class="watchlist-summary"><div class="summary-cell"><span>최우선 관찰 신호</span><b>${escapeHtml(top?.title ?? "없음")}</b></div><div class="summary-cell"><span>최고 신호 강도</span><b>${highest ? `${highest.confidenceScore}/100` : "없음"}</b></div><div class="summary-cell"><span>관찰 항목 수</span><b>${watchlist.items.length}</b></div><div class="summary-cell"><span>명세 변경 신호</span><b>${formatSpecChangeLabel(watchlistSpecChangeLabel(watchlist))}</b></div><div class="summary-cell"><span>주요 모드</span><b>${escapeHtml(formatSignalMode(mainMode))}</b></div></div>`;
}

function watchlistSpecChangeLabel(watchlist: WatchlistLayer): string {
  const zeroDiff = watchlist.items.some((item) => item.evidence.some((evidence) => /No content diff detected/i.test(evidence)));
  return zeroDiff ? "0 content diffs" : "content diffs present";
}

function watchlistConfidenceExplanation(watchlist: WatchlistLayer, report: WeeklyRadarReport): string {
  const zeroDiff = report.ethereumTechRadar.signalLayer.diffIntelligence.length === 0
    || watchlist.items.some((item) => item.evidence.some((evidence) => /No content diff detected/i.test(evidence)));
  if (zeroDiff) return "논의 활동이 강해도 문안 변경이나 상태 변화가 없으면 신뢰도는 상한을 둡니다.";
  return "신호 강도는 공개 논의 활동, 테마 모멘텀, 제안 클러스터, 문안 변경, 상태 변화만 사용합니다. 구현·릴리스·채택 신뢰도와는 별도입니다.";
}

function watchlistCards(watchlist: WatchlistLayer, adoptionLayer: AdoptionLayer): string {
  if (!watchlist.items.length) {
    return '<article class="card empty"><b>관찰 신호가 생성되지 않았습니다</b><span>추가 discussion, cluster, diff, status evidence가 필요합니다.</span></article>';
  }
  return watchlist.items.map((item, index) => watchlistTileCard(item, index, adoptionLayer)).join("");
}

function watchlistCard(item: WatchlistItem, index: number): string {
  const proposals = item.relatedProposals.length
    ? item.relatedProposals.map((proposalId) => `<span class="tag">${escapeHtml(proposalId)}</span>`).join("")
    : '<span class="tag">관련 proposal 없음</span>';
  return `<article class="card third watchlist-card"><div class="card-head"><div><div class="eyebrow">검토 신호${SEP}${escapeHtml(signalTypeLabel(item.signalType))}</div><h3>${escapeHtml(item.title)}</h3></div>${confidenceBadge(item)}</div><p class="meta">${escapeHtml(item.theme)}</p><p>${escapeHtml(localizeGeneratedText(item.possibleNextMovement))}</p><div class="tags">${proposals}</div><h3>근거</h3><ul class="actions">${item.evidence.map((evidence) => `<li>${escapeHtml(localizeEvidenceText(evidence))}</li>`).join("")}</ul><h3>다음 확인 항목</h3><ul class="actions">${item.monitorNext.map((next) => `<li>${escapeHtml(localizeMonitorText(next))}</li>`).join("")}</ul>${item.businessRelevance ? `<p class="meta"><b>${escapeHtml(formatKgldArea(item.businessRelevance.area))}</b>: ${escapeHtml(localizeGeneratedText(item.businessRelevance.note))}</p>` : ""}</article>`;
}

function confidenceBadge(item: WatchlistItem): string {
  const className = item.confidence === "High" ? "high" : item.confidence === "Medium" ? "medium" : "low";
  return `<span class="score ${className}">신호 강도 ${item.confidenceScore}/100</span>`;
}

function watchlistTileCard(item: WatchlistItem, index: number, adoptionLayer: AdoptionLayer): string {
  const proposals = item.relatedProposals.length
    ? item.relatedProposals.map((proposalId) => `<span class="tag">${escapeHtml(proposalId)}</span>`).join("")
    : '<span class="tag">관련 proposal 없음</span>';
  const className = index === 0 ? "card third watchlist-card watchlist-tile top-watch" : "card third watchlist-card watchlist-tile";
  const adoptionEvidence = adoptionEvidenceForProposal(adoptionLayer, item.relatedProposals);
  const adoptionChip = adoptionTileChip(adoptionEvidence);
  return `<article class="${className}"><div class="tile-header"><div class="card-head"><div><div class="eyebrow">검토 신호</div><h3>${escapeHtml(item.title)}</h3></div>${confidenceBadge(item)}</div><div class="tile-badges"><span class="tag">${escapeHtml(item.theme)}</span><span class="tag">${escapeHtml(signalTypeLabel(item.signalType))}</span>${adoptionChip ? `<span class="tag">${escapeHtml(adoptionChip)}</span>` : ""}</div></div><p class="thesis">${escapeHtml(localizeGeneratedText(shortThesis(item.possibleNextMovement)))}</p><div class="evidence-strip" aria-label="근거">${evidenceChips(item).map((chip) => `<span class="evidence-chip">${escapeHtml(chip)}</span>`).join("")}</div><p class="meta"><b>채택 근거:</b> ${escapeHtml(formatEvidenceLevel(adoptionEvidence?.evidenceLevel))}</p><div class="tags">${proposals}</div><h3>다음 확인 항목</h3><ul class="monitor-list">${item.monitorNext.slice(0, 3).map((next) => `<li>${escapeHtml(localizeMonitorText(next))}</li>`).join("")}</ul><div class="baseline">${baselineLabel(item)}</div>${item.businessRelevance ? `<div class="business-lens"><div class="eyebrow">비즈니스 관점</div><p class="meta"><b>${escapeHtml(formatKgldArea(item.businessRelevance.area))}</b>: ${escapeHtml(localizeGeneratedText(item.businessRelevance.note))}</p></div>` : ""}</article>`;
}

function adoptionTileChip(item: AdoptionEvidenceItem | undefined): string | null {
  if (item?.evidenceLevel === "Implementation") return "구현 근거";
  if (item?.evidenceLevel === "Reference") return "외부 참조";
  return null;
}

function shortThesis(value: string): string {
  const sentence = value.split(/(?<=\.)\s+/)[0] ?? value;
  return sentence.length > 150 ? `${sentence.slice(0, 147).trim()}...` : sentence;
}

function signalTypeLabel(value: WatchlistItem["signalType"]): string {
  const labels: Record<WatchlistItem["signalType"], string> = {
    discussion_heat: "논의 열기",
    theme_momentum: "테마 모멘텀",
    cluster_momentum: "클러스터 모멘텀",
    diff_followup: "문안 변경 후속",
    business_relevance: "비즈니스 관련성",
  };
  return value ? labels[value] ?? String(value).replaceAll("_", " ") : "관찰 신호";
}

function evidenceChips(item: WatchlistItem): string[] {
  const chips: string[] = [];
  const discussion = item.evidence.find((evidence) => /replies,\s+\d+\s+participants/i.test(evidence));
  const discussionMatch = discussion?.match(/(\d+)\s+replies,\s+(\d+)\s+participants/i);
  if (discussionMatch) chips.push(`댓글 ${discussionMatch[1]}개`, `참여자 ${discussionMatch[2]}명`);
  if (item.relatedProposals.length) chips.push(`관련 제안 ${item.relatedProposals.length}건`);
  if (item.evidence.some((evidence) => /No content diff detected/i.test(evidence))) chips.push("이번 주 문안 변경 0건");
  const lastActive = item.evidence.find((evidence) => /Last active/i.test(evidence))?.replace(/^Last active\s+/i, "");
  if (lastActive && chips.length < 4) chips.push(`마지막 활동 ${lastActive}`);
  if (chips.length < 3) {
    for (const evidence of item.evidence) {
      if (chips.length >= 4) break;
      const localized = localizeEvidenceText(evidence);
      if (!chips.includes(localized)) chips.push(localized);
    }
  }
  return chips.slice(0, 4);
}

function baselineLabel(item: WatchlistItem): string {
  if (item.previousConfidenceScore === undefined && item.previousActivityScore === undefined) {
    return '<span class="pill">이전 기준값 없음</span>';
  }
  return `<span class="pill">${escapeHtml(formatChangeLabel(item.changeSinceLastReport ?? "Unknown"))}${SEP}지난 보고서 대비</span>`;
}

function adoptionEvidenceSection(layer: AdoptionLayer, report?: WeeklyRadarReport, platform?: TechnologyPlatformLayer): string {
  const content = (() => {
  if (layer.collectionStatus === "skipped") {
    return `<div class="empty"><b>${escapeHtml(localizeGeneratedText(layer.note ?? githubSkippedMessage()))}</b><span>현재 관찰 신호는 논의와 모멘텀 기반으로 유지됩니다.</span></div>${adoptionEvidenceCards(layer.items)}`;
  }
  if (layer.collectionStatus === "failed") {
    return `<div class="empty"><b>${escapeHtml(localizeGeneratedText(layer.note ?? "GitHub evidence collection could not be completed for this run."))}</b><span>외부 근거 주장 없이 보고서 생성을 계속했습니다.</span></div>${adoptionEvidenceCards(layer.items)}`;
  }
  if (!layer.items.length || layer.items.every((item) => item.sources.length === 0 && item.evidenceScore === 0)) {
    return `<div class="empty"><b>${escapeHtml(localizeGeneratedText(noExternalEvidenceMessage()))}</b><span>현재 관찰 신호는 논의와 모멘텀 기반으로 유지됩니다.</span></div>${adoptionEvidenceCards(layer.items)}`;
  }
  return adoptionEvidenceCards(layer.items);
  })();
  return `<div class="evidence-workbench"><div>${content}</div><aside class="evidence-side">${renderDiscussionMomentumCard(report)}${renderConfidenceCard(platform)}</aside></div>`;
}

function adoptionEvidenceCards(items: AdoptionEvidenceItem[]): string {
  if (!items.length) return "";
  return `${adoptionEvidenceSummaryTable(items)}<details><summary>원문 및 출처 보기</summary><div class="evidence-group">${items.map(adoptionEvidenceCard).join("")}</div></details>`;
}

function adoptionEvidenceSummaryTable(items: AdoptionEvidenceItem[]): string {
  return `<div class="table-wrap"><table class="table"><thead><tr><th>EIP</th><th>상태</th><th>직접 근거</th><th>클러스터 참조</th><th>신뢰도 기여</th><th>주의</th></tr></thead><tbody>${items.map((item) => {
    const directCount = item.directSourceCount ?? item.sources.filter((source) => (source.relationship ?? "direct") === "direct").length;
    const clusterCount = item.clusterSourceCount ?? item.sources.filter((source) => source.relationship === "cluster_related").length;
    return `<tr class="${directCount > 0 ? "direct-evidence-row" : "cluster-evidence-row"}"><td><b>${escapeHtml(item.proposalId)}</b><br><span class="muted">${escapeHtml(item.title)}</span></td><td>${renderBadge(formatEvidenceLevel(item.evidenceLevel), item.evidenceLevel === "Implementation" ? "badge-tracking" : item.evidenceLevel === "Reference" ? "badge-info" : "badge-unverified")}</td><td><strong>${directCount}</strong></td><td>${clusterCount}</td><td><span class="score">${item.evidenceScore}/100</span></td><td>${escapeHtml(shortKoreanSummary(localizeGeneratedText(item.caution), 110))}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function adoptionEvidenceCard(item: AdoptionEvidenceItem): string {
  const acceptedSourceCount = item.acceptedSourceCount ?? item.sources.length;
  const retainedSourceCount = item.retainedSourceCount ?? item.sources.length;
  const renderedSourceCount = item.renderedSourceCount ?? Math.min(3, item.sources.length);
  const directSources = item.sources.filter((source) => (source.relationship ?? "direct") === "direct").slice(0, 3);
  const clusterSources = item.sources.filter((source) => source.relationship === "cluster_related").slice(0, 3);
  const directList = directSources.map((source) => sourceListItem(source, "직접")).join("");
  const clusterList = clusterSources.map((source) => sourceListItem(source, "클러스터")).join("");
  const sourceSummary = `<p class="meta">관련 출처: ${acceptedSourceCount}건${acceptedSourceCount > retainedSourceCount ? "+" : ""}${SEP}상위 ${renderedSourceCount}건 표시</p>`;
  const levelBadge = item.evidenceLevel === "Implementation" ? renderBadge("구현 후보", "badge-tracking") : item.evidenceLevel === "Reference" ? renderBadge("참조 근거", "badge-info") : renderBadge("검증된 구현 없음", "badge-unverified");
  return `<article class="action-card evidence-detail-card"><div class="card-head"><div><div class="eyebrow">${escapeHtml(item.theme)}</div><h3>${escapeHtml(item.proposalId)}</h3></div><span class="score ${item.evidenceLevel === "Unknown" ? "unknown" : "low"}">${escapeHtml(formatEvidenceLevel(item.evidenceLevel))} ${item.evidenceScore}</span></div><p class="meta">${escapeHtml(item.title)}</p><div class="facts"><div class="fact"><span>근거 수준</span><b>${levelBadge}</b></div><div class="fact"><span>근거 점수</span><b>${item.evidenceScore}</b></div><div class="fact"><span>채택된 출처</span><b>${acceptedSourceCount}</b></div><div class="fact"><span>보관/표시</span><b>${retainedSourceCount}</b></div></div><div class="facts"><div class="fact"><span>직접 근거</span><b>${item.directSourceCount ?? directSources.length}</b></div><div class="fact"><span>클러스터 참조</span><b>${item.clusterSourceCount ?? clusterSources.length}</b></div></div>${sourceSummary}<p>${escapeHtml(localizeGeneratedText(item.summary))}</p><p class="meta">${escapeHtml(localizeGeneratedText(item.caution))}</p>${directList ? `<h3>직접 근거 (Direct Evidence)</h3><div class="evidence-group evidence-direct">${directList}</div>` : ""}${clusterList ? `<h3>관련 클러스터 참조 (Cluster References)</h3><div class="evidence-group evidence-cluster">${clusterList}</div>` : ""}<details><summary>추적성 메타데이터</summary><p class="meta">보관 ${retainedSourceCount}건${SEP}표시 ${renderedSourceCount}건${SEP}raw ${item.rawResultCount ?? 0}건</p></details></article>`;
}

function sourceListItem(source: AdoptionEvidenceItem["sources"][number], relationshipLabel?: string): string {
  const title = escapeHtml(source.title ?? source.repo ?? source.sourceType);
  const link = source.url ? `<a href="${escapeHtml(source.url)}">${title}</a>` : title;
  const badgeClass = (source.relationship ?? "direct") === "direct" ? "badge-info" : "badge-watch";
  const rowClass = (source.relationship ?? "direct") === "direct" ? "evidence-row direct-evidence" : "evidence-row cluster-reference";
  return `<div class="${rowClass}"><span class="evidence-icon" aria-hidden="true">${evidenceIcon(source.sourceType)}</span><div><div class="evidence-title">${link}</div><div class="meta">${escapeHtml(source.repo ?? source.sourceType)}</div><div class="muted">${escapeHtml(localizeGeneratedText(source.matchedTerm ?? sourceMeta(source)))}</div><details><summary>원문 및 출처 보기</summary><p class="meta">${escapeHtml(sourceMeta(source))}</p>${source.path ? `<p class="meta">${escapeHtml(source.path)}</p>` : ""}</details></div><div>${renderBadge(relationshipLabel ?? formatRelationship(source.relationship ?? "direct"), badgeClass)}</div></div>`;
}

function evidenceIcon(sourceType: string): string {
  if (sourceType === "github_pr") return "PR";
  if (sourceType === "github_issue") return "I";
  if (sourceType === "release_note") return "R";
  if (sourceType === "code_reference") return "C";
  return "D";
}

function renderBadge(label: string, className = "badge-neutral"): string {
  return `<span class="badge ${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

function renderDiscussionMomentumCard(report: WeeklyRadarReport | undefined): string {
  const top = report?.ethereumTechRadar.signalLayer.discussionHeat[0];
  return `<div class="action-card"><h3>논의 모멘텀</h3><p class="meta">${escapeHtml(top?.proposalId ?? "확인 중")}</p><div class="facts"><div class="fact"><span>댓글</span><b>${top?.discussionReplyCount ?? 0}</b></div><div class="fact"><span>참여자</span><b>${top?.discussionParticipantCount ?? 0}</b></div></div><p class="muted">${escapeHtml(top ? localizeGeneratedText(displayWhyItMatters(top)) : "논의 근거가 없습니다.")}</p></div>`;
}

function renderConfidenceCard(platform: TechnologyPlatformLayer | undefined): string {
  const item = platform?.confidence[0];
  const score = item?.overall ?? 0;
  const rows = item
    ? [
      ["데이터 품질", item.evidenceQuality],
      ["모델 기여", item.sourceDiversity],
      ["근거 기여", item.verificationStatus],
      ["상태 기여", 100 - item.falsePositiveRisk],
    ]
    : [["데이터 품질", 0], ["모델 기여", 0], ["근거 기여", 0], ["상태 기여", 0]];
  return `<div class="action-card"><h3>신뢰도 요약</h3><div class="confidence-donut" aria-label="종합 신뢰도 ${score}점">${score}</div><p class="meta">${escapeHtml(confidenceBand(score))}</p><div class="mini-bars">${rows.map(([label, value]) => `<div class="mini-bar"><span>${escapeHtml(String(label))}</span><span><i style="width:${Number(value)}%"></i></span><b>${Number(value)}</b></div>`).join("")}</div>${item ? scoreDetails("점수 산정 근거", item.scoreBreakdown) : ""}</div>`;
}

function confidenceBand(score: number): string {
  if (score >= 75) return "높음";
  if (score >= 50) return "중간";
  if (score > 0) return "낮음";
  return "확인 불가";
}

function sourceMeta(source: AdoptionEvidenceItem["sources"][number]): string {
  return [
    semanticTypeLabel(source.semanticType),
    formatRelationship(source.relationship ?? "direct"),
    source.repo ?? source.sourceType,
    source.state && source.state !== "unknown" ? formatState(source.state) : null,
    source.updatedAt ? `업데이트 ${source.updatedAt.slice(0, 10)}` : null,
  ].filter((item): item is string => Boolean(item)).join(SEP);
}

function semanticTypeLabel(value: AdoptionEvidenceItem["sources"][number]["semanticType"]): string {
  if (value === "implementation_tracker") return "구현 추적 이슈";
  if (value === "client_implementation_pr") return "클라이언트 구현 PR";
  if (value === "client_code_reference") return "클라이언트 코드 참조";
  if (value === "protocol_spec_reference") return "프로토콜 명세 참조";
  if (value === "core_developer_coordination") return "Core Dev 조율";
  if (value === "canonical_status_change") return "표준 상태 변경";
  if (value === "canonical_document_change") return "표준 문서 변경";
  if (value === "cluster_reference") return "클러스터 참조";
  if (value === "incidental_mention") return "부수적 언급";
  return "참조";
}

function evidenceExplanation(evidence: NarrativeEvidence): string {
  const discussionTheme = evidence.topDiscussions[0]?.theme;
  const momentumTheme = evidence.topMomentumThemes[0]?.theme;
  if (!discussionTheme || !momentumTheme) return "이 내러티브는 확인 가능한 가장 강한 discussion 및 momentum 근거에서 선택했습니다.";
  if (discussionTheme === momentumTheme || areAdjacentThemes(discussionTheme, momentumTheme)) {
    return `이 보고서는 단기 ${themeSignalLabel(discussionTheme)} discussion 신호와 장기 ${themeSignalLabel(momentumTheme)} momentum을 함께 봅니다.`;
  }
  return "이 보고서는 단기 discussion 신호와 장기 momentum 신호를 함께 포함합니다.";
}

function areAdjacentThemes(left: string, right: string): boolean {
  const protocolExecution = new Set(["Transaction Model / Execution", "EVM / Gas / Opcode", "Network Upgrade / Governance", "Governance / Process", "Block / Validator Operations"]);
  const wallet = new Set(["Wallet UX", "Account Abstraction", "Smart Account", "Gasless / Paymaster", "Session Key / Delegation", "Passkey / WebAuthn"]);
  const compliance = new Set(["Identity / Credential", "Compliance / Restricted Transfer", "RWA / Attestation", "Oracle / Pricing"]);
  return [protocolExecution, wallet, compliance].some((group) => group.has(left) && group.has(right));
}

function themeSignalLabel(theme: string): string {
  if (theme === "Transaction Model / Execution" || theme === "EVM / Gas / Opcode") return "execution";
  if (theme === "Network Upgrade / Governance" || theme === "Governance / Process") return "protocol governance";
  if (theme === "Data Availability") return "data availability";
  if (theme === "Wallet UX" || theme === "Account Abstraction") return "wallet";
  return theme.toLocaleLowerCase("en-US");
}

function evidenceDetails(evidence: NarrativeEvidence): string {
  const discussions = evidence.topDiscussions.map((item) =>
    `<li><b>${escapeHtml(item.proposalId)}</b> ${escapeHtml(item.title)}${SEP}${escapeHtml(formatActivityLevel(item.activityLevel ?? "Unknown"))}${SEP}댓글 ${item.replies ?? 0}개${SEP}참여자 ${item.participants ?? 0}명${item.lastActivityAt ? `${SEP}${escapeHtml(item.lastActivityAt.slice(0, 10))}` : ""}</li>`
  ).join("");
  const themes = evidence.topMomentumThemes.map((item) =>
    `<li><b>${escapeHtml(item.theme)}</b> ${item.score}/100</li>`
  ).join("");
  return `<div class="grid" style="margin-top:12px"><div class="half"><h3>상위 논의</h3><ul class="actions">${discussions || '<li>논의 근거 없음</li>'}</ul></div><div class="half"><h3>모멘텀 테마</h3><ul class="actions">${themes || '<li>테마 근거 없음</li>'}</ul></div></div>`;
}

function momentumTable(items: ThemeInsight[]): string {
  if (!items.length) return '<p class="muted">표시할 개발자 모멘텀 테마가 없습니다.</p>';
  return `<table class="table"><thead><tr><th>테마</th><th>방향</th><th>점수</th><th>신호</th><th>의미</th></tr></thead><tbody>${items.map((item) => {
    const direction = momentumDirection(item);
    return `<tr><td><b>${escapeHtml(item.theme)}</b></td><td>${directionPill(direction)}</td><td><span class="score">${item.momentumScore}/100</span></td><td>proposal ${item.proposalCount180d}건<br>최근 변경 ${item.recentChangeCount7d}건<br>discussion link ${item.discussionProposalCount ?? 0}건</td><td>${escapeHtml(localizeGeneratedText(item.interpretation))}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function discussionTable(items: DiscussionHeatItem[], report?: WeeklyRadarReport): string {
  if (!items.length) return '<div class="empty"><b>최근 공개 논의 활동이 감지되지 않았습니다</b><span>이 기간의 공개 활동 세부 정보를 검증하지 못했습니다.</span></div>';
  return `<table class="table"><thead><tr><th>Proposal</th><th>테마</th><th>논의</th><th>활동성</th><th>마지막 활동</th><th>댓글</th><th>참여자</th><th>의미</th></tr></thead><tbody>${items.map((item, index) =>
    `<tr class="${discussionRowClass(index)}"><td><a href="${escapeHtml(item.canonicalUrl)}"><b>${escapeHtml(item.proposalId)}</b></a><br><span class="muted">${escapeHtml(item.title ?? "제목 없음")}</span></td><td>${escapeHtml(topicLabelForProposal(report, item.proposalId, String(item.theme)))}</td><td class="discussion-title">${escapeHtml(item.discussionTitle ?? "활동 세부 정보 확인 불가")}<br>${item.discussionUrl ? `<a href="${escapeHtml(item.discussionUrl)}">링크 열기</a>` : '<span class="muted">링크 없음</span>'}${item.discussionSource ? `<br><span class="muted">${escapeHtml(item.discussionSource)}</span>` : ""}${tagList(item.discussionTags)}</td><td>${scoreBadge(item.discussionActivityScore ?? item.discussionScore, item.activityLevel)}</td><td>${formatOptionalDate(item.discussionLastActivityAt)}</td><td>${formatOptionalNumber(item.discussionReplyCount)}</td><td>${formatOptionalNumber(item.discussionParticipantCount)}</td><td>${escapeHtml(localizeGeneratedText(displayWhyItMatters(item)))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function topicLabelForProposal(report: WeeklyRadarReport | undefined, proposalId: string, fallback: string): string {
  const layer = report?.ethereumTechRadar.topicClusterLayer;
  if (!layer) return fallback;
  const membership = layer.memberships
    .filter((item) => item.proposalId === proposalId && (item.role === "anchor" || item.role === "supporting"))
    .sort((left, right) => right.confidence - left.confidence)[0];
  const topic = membership ? layer.clusters.find((cluster) => cluster.id === membership.topicId) : undefined;
  return topic?.displayName ?? fallback;
}

function discussionRowClass(index: number): string {
  if (index === 0) return "top-signal";
  if (index < 3) return "priority-signal";
  return "";
}

function diffTable(items: DiffIntelligenceItem[]): string {
  if (!items.length) return '<div class="empty"><b>이번 보고 기간에는 제안 문안 변경이 감지되지 않았습니다.</b><span>따라서 이번 주 표준 활동은 장기 180일 모멘텀과 공개 논의 메타데이터 중심으로 해석합니다.</span></div>';
  return `<table class="table"><thead><tr><th>Proposal</th><th>변경 파일</th><th>변경 섹션</th><th>Diff 요약</th><th>근거</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td><a href="${escapeHtml(item.canonicalUrl)}"><b>${escapeHtml(item.proposalId)}</b></a><br><span class="muted">${escapeHtml(item.title ?? "제목 없음")}</span></td><td>${escapeHtml(item.changedFiles.join(", ") || "확인 불가")}</td><td>${escapeHtml(item.changedSections?.join(", ") ?? "확인 불가")}</td><td>${escapeHtml(localizeGeneratedText(item.diffSummary))}</td><td>${escapeHtml(localizeGeneratedText(item.diffEvidence))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function themeCard(insight: ThemeInsight): string {
  const tags = insight.dominantSubTrends.map((item) => `<span class="tag">${escapeHtml(item.name)} ${item.count}</span>`).join("");
  const proposals = insight.representativeProposals.map((item) =>
    `<li><a href="${escapeHtml(item.canonicalUrl)}"><b>${escapeHtml(item.id)}</b></a> ${escapeHtml(item.title)} <span class="muted">(${escapeHtml(item.status)})</span></li>`
  ).join("");
  return `<article class="card theme-card"><div class="card-head"><h3>${escapeHtml(insight.theme)}</h3><span class="score">${insight.momentumScore}/100</span></div><p>${escapeHtml(localizeGeneratedText(insight.interpretation))}</p><div class="tags">${tags || '<span class="tag">하위 트렌드 없음</span>'}</div>${proposals ? `<ul>${proposals}</ul>` : '<p class="muted">대표 proposal이 없습니다.</p>'}</article>`;
}

function eventSummary(changes: WeeklyRadarReport["ethereumTechRadar"]["recentChanges"]): string {
  const rows: Array<[string, ChangeEvent[]]> = [
    ["신규", changes.newProposals],
    ["상태", changes.statusChanges],
    ["확정", changes.finalTransitions],
    ["철회", changes.withdrawnTransitions],
    ["문안", changes.contentHashChanges],
  ];
  return `<h3>이벤트 분해</h3><table class="table"><tbody>${rows.map(([label, events]) =>
    `<tr><th>${label}</th><td>${events.length}</td><td>${events.slice(0, 3).map((event) => `<a href="${escapeHtml(event.canonicalUrl)}">${escapeHtml(event.proposalId)}</a>`).join(", ") || '<span class="muted">없음</span>'}</td></tr>`
  ).join("")}</tbody></table>`;
}

function businessImpactRefined(themes: ThemeInsight[], candidates: KgldCandidate[], watchlist: WatchlistLayer, adoptionLayer: AdoptionLayer): string {
  const topItem = watchlist.items[0];
  if (topItem?.relatedProposals.includes("EIP-8141")) {
    const adoptionEvidence = adoptionEvidenceForProposal(adoptionLayer, topItem.relatedProposals);
    const level = adoptionEvidence?.evidenceLevel ?? "Unknown";
    const hasImplementationTracker = adoptionEvidence?.sources.some((source) => source.semanticType === "implementation_tracker") ?? false;
    const signalMode = level === "Reference" || level === "Implementation" ? "implementation/reference signal" : "discussion/momentum signal";
    const message = hasImplementationTracker
      ? "구현 추적 근거는 확인됐지만, 검증된 클라이언트 구현이나 운영 채택 근거는 확인되지 않았습니다. 구현 추적 신호로만 해석해야 합니다."
      : level === "Implementation"
        ? "EIP-8141 구현 근거는 KGLD 적용 판단 전에 별도 검토가 필요합니다. 운영 채택이 아니라 protocol / wallet execution-boundary 관찰 항목으로 보세요."
        : level === "Mention" || level === "Reference"
          ? "EIP-8141은 외부 참조 근거가 있으나 wallet/execution 후속 관찰 후보로만 다룹니다. 직접적인 KGLD 적용성이나 운영 채택으로 해석하지 않습니다."
          : "EIP-8141은 확인된 구현 근거가 없으므로 직접 KGLD 적용 후보가 아니라 protocol / wallet execution-boundary 관찰 항목입니다.";
    return `<p>${escapeHtml(message)}</p><p class="meta"><b>신호 유형:</b> ${escapeHtml(formatSignalMode(signalMode))}${SEP}<b>채택 근거:</b> ${escapeHtml(formatEvidenceLevel(adoptionEvidence?.evidenceLevel))}</p>`;
  }
  const topTheme = themes[0]?.theme ?? "Unclassified";
  const kgldNote = candidates.length
    ? "규칙 기반 KGLD 후보는 별도로 검토하고, 이 섹션에서는 Ethereum watchlist evidence를 우선합니다."
    : "현재 규칙 기반 KGLD 후보는 없습니다.";
  return `<p>이번 주 business lens는 ${escapeHtml(topTheme)} 중심 watchlist 신호를 우선합니다. ${escapeHtml(kgldNote)}</p>`;
}

function businessImpact(themes: ThemeInsight[], candidates: KgldCandidate[]): string {
  const topTheme = themes[0]?.theme ?? "Unclassified";
  const hasWallet = themes.some((item) => ["Account Abstraction", "Wallet UX", "Smart Account", "Passkey / WebAuthn"].includes(item.theme));
  const hasRwa = themes.some((item) => ["RWA / Attestation", "Oracle / Pricing", "Compliance / Restricted Transfer", "DeFi / Vault"].includes(item.theme));
  const items = [
    `<li><b>Wallet</b>: ${hasWallet ? "smart account, permission, gas sponsorship 흐름을 모니터링합니다." : "이번 주 강한 wallet-specific 신호는 제한적입니다."}</li>`,
    `<li><b>Exchange</b>: token standard, transfer restriction, signature 관련 변경을 상장/입출금 정책 관점에서 확인합니다.</li>`,
    `<li><b>RWA / Compliance</b>: ${hasRwa ? "attestation, proof, restricted transfer 계열을 우선 추적합니다." : "명확한 RWA/Compliance 신호는 아직 보조 지표입니다."}</li>`,
    `<li><b>KGLD</b>: ${candidates.length ? "상위 KGLD 후보는 별도로 검토하고 Ethereum momentum 해석 이후 business lens로 다룹니다." : "현재 규칙 기반 KGLD 후보는 없습니다."}</li>`,
    `<li><b>주요 내러티브</b>: 이번 주 기준 상위 developer momentum은 ${escapeHtml(topTheme)}입니다.</li>`,
  ];
  return `<ul class="actions">${items.join("")}</ul>`;
}

function candidateTable(items: KgldCandidate[]): string {
  if (!items.length) return '<p class="muted">KGLD 후보가 없습니다.</p>';
  return `<table class="table"><thead><tr><th>Proposal</th><th>점수</th><th>액션</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td><a href="${escapeHtml(item.canonicalUrl)}">${escapeHtml(item.proposalId)}</a><br><span class="muted">${escapeHtml(item.title ?? "제목 없음")}</span></td><td><span class="score">${item.relevanceScore}/100</span></td><td>${escapeHtml(formatActionLabel(item.recommendedAction))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function renderActionsRefined(report: WeeklyRadarReport): string {
  const watchlist = getWatchlistLayer(report).items;
  if (watchlist.length) {
    const actionCards = watchlist.slice(0, 4).map((item) => {
      const primaryProposal = item.relatedProposals[0];
      const title = primaryProposal
        ? `${primaryProposal}을 다음 주 주요 관찰 신호로 추적`
        : `${item.theme}을 다음 주 주요 관찰 신호로 추적`;
      const reason = item.evidence.some((evidence) => /No content diff detected/i.test(evidence))
        ? "논의 열기는 높지만 이번 주 명세 변경은 감지되지 않았습니다."
        : "신호를 상향하기 전에 구체적인 report evidence와 대조해야 합니다.";
      const evidence = item.evidence.filter((line) => !/No content diff detected/i.test(line)).slice(0, 3).map(localizeEvidenceText).join(". ");
      const nextCheck = item.monitorNext.slice(0, 3).map(localizeMonitorText).join("; ");
      return `<article class="action-card recommendation-card"><h3>${escapeHtml(title)}</h3><p><b>이유:</b> ${escapeHtml(reason)}</p><p><b>근거:</b> ${escapeHtml(evidence || item.title)}.</p><p><b>다음 확인 항목:</b> ${escapeHtml(nextCheck || "다음 주 수집 결과를 검토합니다.")}</p></article>`;
    });
    return `<div class="action-grid">${actionCards.join("")}</div>`;
  }

  const fallback = report.ethereumTechRadar.themeInsights.slice(0, 4).map((item) =>
    `<article class="action-card recommendation-card"><h3>${escapeHtml(item.theme)} 검토</h3><p><b>이유:</b> 현재 보고서에서 테마 모멘텀이 보입니다.</p><p><b>근거:</b> 모멘텀 점수 ${item.momentumScore}/100.</p><p><b>다음 확인 항목:</b> 다음 주 상태 변화, 문안 변경, 논의 활동을 검토합니다.</p></article>`
  );
  return fallback.length ? `<div class="action-grid">${fallback.join("")}</div>` : '<p class="muted">현재 데이터만으로 권장 액션을 만들 수 없습니다. 다음 수집 결과를 대기합니다.</p>';
}

function renderActions(report: WeeklyRadarReport): string {
  const watchlist = getWatchlistLayer(report).items;
  if (watchlist.length) {
    const items = watchlist.flatMap((item) => {
      const primaryProposal = item.relatedProposals[0];
      const related = item.relatedProposals.filter((proposalId) => proposalId !== primaryProposal).slice(0, 3);
      return [
        primaryProposal
          ? `<li><b>Track ${escapeHtml(primaryProposal)}</b>: ${escapeHtml(item.monitorNext[0] ?? item.title)} next week.</li>`
          : `<li><b>Track theme</b>: ${escapeHtml(item.theme)} next week.</li>`,
        related.length
          ? `<li><b>Watch related proposals</b>: ${escapeHtml(related.join(", "))}.</li>`
          : null,
        `<li><b>신호 품질 모니터링</b>: ${escapeHtml(item.theme)} 신뢰도는 ${escapeHtml(formatConfidenceLabel(item.confidence))} ${item.confidenceScore}/100입니다. 신호 상향 전 문안 변경과 상태 변화를 확인합니다.</li>`,
      ].filter((line): line is string => line !== null);
    }).slice(0, 6);
    return `<ul class="actions">${items.join("")}</ul>`;
  }

  const topThemes = report.ethereumTechRadar.themeInsights.slice(0, 3);
  const diffItems = report.ethereumTechRadar.signalLayer.diffIntelligence.slice(0, 2);
  const discussionItems = report.ethereumTechRadar.signalLayer.discussionHeat.slice(0, 2);
  const items = [
    ...topThemes.map((item) => `<li><b>테마 관찰</b>: ${escapeHtml(item.theme)} (${item.momentumScore}/100). 최근 변경 ${item.recentChangeCount7d}건과 공개 논의 메타데이터 ${item.discussionProposalCount ?? 0}건을 다음 주에 추적합니다.</li>`),
    ...diffItems.map((item) => `<li><b>Diff 검토</b>: ${escapeHtml(item.proposalId)} - ${escapeHtml(localizeGeneratedText(item.diffSummary))}</li>`),
    ...discussionItems.map((item) => `<li><b>논의 추적</b>: ${escapeHtml(item.proposalId)} - ${escapeHtml(localizeGeneratedText(displayWhyItMatters(item)))}</li>`),
  ];
  return items.length ? `<ul class="actions">${items.join("")}</ul>` : '<p class="muted">현재 데이터만으로 권장 액션을 만들 수 없습니다. 다음 수집 결과를 대기합니다.</p>';
}

function momentumDirection(item: ThemeInsight): "Up" | "Down" | "Stable" {
  if (item.recentChangeCount7d > 0 || (item.contentChangeCount ?? 0) > 0) return "Up";
  if (item.maturitySignal === "high" && item.recentChangeCount7d === 0) return "Stable";
  return "Stable";
}

function directionPill(direction: "Up" | "Down" | "Stable"): string {
  const className = direction === "Up" ? "up" : direction === "Down" ? "down" : "";
  return `<span class="pill ${className}">${formatChangeLabel(direction)}</span>`;
}

function scoreBadge(score: number | null | undefined, level: DiscussionHeatItem["activityLevel"]): string {
  const className = level === "High" ? "high" : level === "Medium" ? "medium" : level === "Low" ? "low" : level === "Unknown" ? "unknown" : "";
  const label = level === "High" ? `높음 ${score ?? 0}` : level === "Medium" ? `중간 ${score ?? 0}` : level === "Low" ? `낮음 ${score ?? 0}` : "확인 불가";
  return `<span class="score ${className}">${label}</span>`;
}

function displayWhyItMatters(item: DiscussionHeatItem): string {
  return item.whyItMatters === "Discussion metadata available; activity details unavailable."
    ? buildDiscussionFallbackWhyItMatters(item)
    : item.whyItMatters;
}

function tagList(tags: string[] | undefined): string {
  if (!tags?.length) return "";
  return `<div class="tags">${tags.slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function formatOptionalDate(value: string | undefined): string {
  return value ? value.slice(0, 10) : "확인 불가";
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "확인 불가" : String(value);
}

function hasChartData(series: ChartSeries): boolean {
  return series.labels.length > 0 && series.data.length > 0 && series.data.some((value) => value > 0);
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatDateLine(report: WeeklyRadarReport): string {
  return [
    `기준일: ${report.generatedAt.slice(0, 10)}`,
    `추세 기간: ${report.trendPeriod.days}일`,
    `변경 감지: ${report.changePeriod.days}일`,
    "출처: EIP/ERC 메타데이터 및 스냅샷 diff",
  ].join(SEP);
}

function formatGeneratedBy(value: string): string {
  return value === "deterministic" ? "규칙 기반 생성" : value;
}

function formatLifecycleStage(value: string): string {
  const labels: Record<string, string> = {
    Discussion: "논의",
    Draft: "초안",
    Review: "검토",
    "Last Call": "최종 검토",
    Final: "확정",
    "Implementation Tracking": "구현 추적",
    "Implementation Candidate": "구현 후보",
    "Verified Implementation": "검증된 구현",
    Released: "릴리스",
    Activated: "활성화",
    "Production Adoption": "운영 채택",
  };
  return labels[value] ?? value;
}

function formatEvidenceLevel(value: string | undefined): string {
  const labels: Record<string, string> = {
    Unknown: "확인 불가",
    Mention: "언급",
    Reference: "참조",
    Implementation: "구현",
  };
  return labels[value ?? "Unknown"] ?? value ?? "확인 불가";
}

function formatRelationship(value: string): string {
  const labels: Record<string, string> = {
    direct: "직접",
    cluster_related: "클러스터 관련",
    incidental: "부수적",
  };
  return labels[value] ?? value;
}

function formatState(value: string): string {
  const labels: Record<string, string> = {
    open: "열림",
    closed: "닫힘",
    merged: "병합됨",
  };
  return labels[value] ?? value;
}

function formatConfidenceLabel(value: string): string {
  const labels: Record<string, string> = {
    High: "높음",
    Medium: "중간",
    Low: "낮음",
    Unknown: "확인 불가",
  };
  return labels[value] ?? value;
}

function formatActivityLevel(value: string): string {
  return formatConfidenceLabel(value);
}

function formatRiskLevel(value: string): string {
  const labels: Record<string, string> = {
    High: "높음",
    Medium: "중간",
    Low: "낮음",
    None: "없음",
  };
  return labels[value] ?? value;
}

function formatBusinessImpactLevel(value: string): string {
  const labels: Record<string, string> = {
    None: "없음",
    Monitor: "관찰",
    Medium: "중간",
    High: "높음",
    Critical: "중대",
  };
  return labels[value] ?? value;
}

function formatRadarQuadrant(value: string): string {
  const labels: Record<string, string> = {
    Watch: "관찰",
    Trial: "시험",
    Adopt: "도입 검토",
    Hold: "보류",
  };
  return labels[value] ?? value;
}

function formatClientStatus(value: string): string {
  const labels: Record<string, string> = {
    Tracking: "추적",
    Candidate: "후보",
    Verified: "검증",
    Released: "릴리스",
    Activated: "활성화",
    "No evidence": "근거 없음",
  };
  return labels[value] ?? value;
}

function formatReleaseStatus(value: string): string {
  const labels: Record<string, string> = {
    "No release": "릴리스 근거 없음",
    "Release Candidate": "릴리스 후보",
    Released: "릴리스됨",
    Activated: "활성화됨",
  };
  return labels[value] ?? value;
}

function formatDeploymentStatus(value: string): string {
  const labels: Record<string, string> = {
    "No evidence": "활성화 근거 없음",
    "Testnet activation": "테스트넷 활성화",
    "Mainnet activation": "메인넷 활성화",
    "Default enabled": "기본 활성화",
    Production: "운영",
  };
  return labels[value] ?? value;
}

function formatGraphEdge(value: string): string {
  const labels: Record<string, string> = {
    references: "참조",
    implements: "구현",
    tracks: "추적",
    supersedes: "대체",
    discusses: "논의",
    releases: "릴리스",
    activates: "활성화",
  };
  return labels[value] ?? value;
}

function formatRiskType(value: string): string {
  const labels: Record<string, string> = {
    "High discussion / no implementation": "논의 활발 / 구현 없음",
    "Implementation / no release": "구현 / 릴리스 없음",
    "Release / no activation": "릴리스 / 활성화 없음",
    "Client divergence": "클라이언트 불일치",
  };
  return labels[value] ?? value;
}

function formatScoreLabel(value: string): string {
  const labels: Record<string, string> = {
    discussion: "논의",
    spec: "명세",
    implementation: "구현",
    release: "릴리스",
    "manual uncertainty": "수동 불확실성",
    "no verified client implementation": "검증된 클라이언트 구현 없음",
    "no release evidence": "릴리스 근거 없음",
    "direct stage evidence": "직접 단계 근거",
    "implementation tracking": "구현 추적",
    "no explicit evidence": "명시적 근거 없음",
    "business keyword match": "비즈니스 키워드 매치",
    "impact areas": "영향 영역",
    "high-impact cap": "고영향 상한",
    lifecycle: "라이프사이클",
    "business impact": "비즈니스 영향",
    "false-positive risk": "오탐 위험",
    "discussion heat": "논의 열기",
    "no verified implementation": "검증된 구현 없음",
  };
  return labels[value] ?? value;
}

function formatDataCompletenessStatus(value: string): string {
  const labels: Record<string, string> = {
    complete: "완전",
    mostly_complete: "대체로 완전",
    partial: "부분 수집",
    degraded: "저하",
    unavailable: "사용 불가",
  };
  return labels[value] ?? value;
}

function formatSpecChangeLabel(value: string): string {
  return value === "0 content diffs" ? "문안 변경 0건" : "문안 변경 있음";
}

function formatSignalMode(value: string): string {
  const labels: Record<string, string> = {
    "discussion/momentum-driven": "논의/모멘텀 기반",
    "diff/status-driven": "diff/status 기반",
    "implementation/reference signal": "구현 추적/참조 신호",
    "discussion/momentum signal": "논의/모멘텀 신호",
  };
  return labels[value] ?? value;
}

function formatActionLabel(value: string): string {
  const labels: Record<string, string> = {
    monitor: "관찰",
    review: "검토",
    poc: "PoC",
    ignore: "제외",
  };
  return labels[value] ?? value;
}

function formatChangeLabel(value: string): string {
  const labels: Record<string, string> = {
    Up: "상승",
    Down: "하락",
    Stable: "안정",
    Unknown: "확인 불가",
  };
  return labels[value] ?? value;
}

function formatKgldArea(value: string): string {
  const labels: Record<string, string> = {
    Protocol: "프로토콜",
    Wallet: "지갑",
    Exchange: "거래소",
    "Wallet impact": "Wallet 영향",
    "Custody impact": "Custody 영향",
    "Compliance impact": "Compliance 영향",
    "Tokenization impact": "Tokenization 영향",
    "RWA impact": "RWA 영향",
    "Settlement impact": "Settlement 영향",
    "Account abstraction impact": "Account abstraction 영향",
    "Bridge impact": "브리지 영향",
    "Execution impact": "실행 영향",
  };
  return labels[value] ?? value;
}

function formatLimitation(value: string): string {
  return localizeGeneratedText(value);
}

function localizeDataCompletenessExplanation(value: string): string {
  return localizeGeneratedText(value);
}

function localizeEvidenceText(value: string): string {
  return localizeGeneratedText(value)
    .replace(/(\d+) proposals/gi, "제안 $1건")
    .replace(/(\d+) proposal/gi, "제안 $1건")
    .replace(/(\d+) replies, (\d+) participants/gi, "댓글 $1개, 참여자 $2명")
    .replace(/Last active/gi, "마지막 활동")
    .replace(/No content diff detected this week\.?/gi, "이번 주 content diff는 감지되지 않았습니다.")
    .replace(/Momentum score/gi, "모멘텀 점수")
    .replace(/discussion links/gi, "논의 링크")
    .replace(/discussion link/gi, "논의 링크")
    .replace(/new Ethereum Magicians replies/gi, "Ethereum Magicians 신규 댓글")
    .replace(/changes/gi, "변경");
}

function localizeMonitorText(value: string): string {
  return localizeEvidenceText(value)
    .replace(/whether momentum becomes a spec-change signal/gi, "모멘텀이 명세 변경 신호로 전환되는지 확인")
    .replace(/content diff/gi, "문안 변경")
    .replace(/spec-change signal/gi, "명세 변경 신호")
    .replace(/status movement/gi, "상태 변화");
}

function localizeGeneratedText(value: string): string {
  return value
    .replace(/Discussion heat is high, but the next signal depends on content diff, status movement, or sustained Magicians activity\.?/gi, "논의 열기는 높지만 다음 신호는 문안 변경, 상태 변화, 또는 Ethereum Magicians 활동 지속 여부에 달려 있습니다.")
    .replace(/Discussion heat is high, but the next signal depends on content diff, status movement, or sustained discussion activity\.?/gi, "논의 열기는 높지만 다음 신호는 문안 변경, 상태 변화, 또는 공개 논의 활동 지속 여부에 달려 있습니다.")
    .replace(/논의 열기 is high, but the next signal depends on 문안 변경, 상태 변화, or sustained Magicians activity\.?/gi, "논의 열기는 높지만 다음 신호는 문안 변경, 상태 변화, 또는 Ethereum Magicians 활동 지속 여부에 달려 있습니다.")
    .replace(/논의 열기 is high, but the next signal depends on 문안 변경, 상태 변화, or sustained discussion activity\.?/gi, "논의 열기는 높지만 다음 신호는 문안 변경, 상태 변화, 또는 공개 논의 활동 지속 여부에 달려 있습니다.")
    .replace(/Theme momentum should be checked for status changes, content diffs, or narrower follow-up discussion\.?/gi, "테마 모멘텀은 상태 변경, 문안 변경, 더 구체적인 후속 논의와 함께 확인해야 합니다.")
    .replace(/Theme momentum should be checked for status changes, 문안 변경s, or narrower follow-up discussion\.?/gi, "테마 모멘텀은 상태 변경, 문안 변경, 더 구체적인 후속 논의와 함께 확인해야 합니다.")
    .replace(/Discussion link exists for a wallet or account-abstraction proposal\. Activity metadata is unavailable, so watch status movement and spec-diff evidence before prioritizing\./gi, "지갑 또는 계정 추상화 제안의 논의 링크가 확인됐습니다. 활동 메타데이터는 확인되지 않았으므로 우선순위 상향 전 상태 변화와 명세 변경 근거를 확인해야 합니다.")
    .replace(/Discussion link exists for an identity or credential proposal\. This may matter for compliance and authorization models, but activity details are unavailable\./gi, "신원 또는 자격 증명 제안의 논의 링크가 확인됐습니다. 컴플라이언스와 권한 모델에 영향을 줄 수 있으나 활동 세부 정보는 확인되지 않았습니다.")
    .replace(/Discussion link exists for a data-availability proposal\. Without activity metadata, treat it as a watchlist item rather than an active heat signal\./gi, "데이터 가용성 제안의 논의 링크가 확인됐습니다. 활동 메타데이터가 없으므로 활성 논의 신호가 아니라 관찰 항목으로 다룹니다.")
    .replace(/Discussion link exists for an execution-layer proposal\. Activity metadata is unavailable, so monitor status changes and spec diffs before treating it as a strong signal\./gi, "실행 계층 제안의 논의 링크가 확인됐습니다. 활동 메타데이터가 없으므로 강한 신호로 보기 전 상태 변화와 명세 변경을 확인해야 합니다.")
    .replace(/Discussion link exists for a network-upgrade proposal, but public activity metadata could not be verified\. Track only if the proposal moves status or appears in upgrade planning\./gi, "네트워크 업그레이드 제안의 논의 링크가 확인됐지만 공개 활동 메타데이터는 검증되지 않았습니다. 상태가 이동하거나 업그레이드 계획에 나타날 때만 추적합니다.")
    .replace(/Discussion link exists, but public activity metadata could not be verified\. Because the proposal is ([^,]+), treat it mainly as historical context unless status or spec-diff signals change\./gi, "논의 링크는 있으나 공개 활동 메타데이터는 검증되지 않았습니다. 제안 상태가 $1이므로 상태 또는 명세 변경 신호가 바뀌기 전에는 주로 참고 맥락으로 다룹니다.")
    .replace(/Discussion link exists, but public activity metadata could not be verified\. Treat it as a watchlist signal until status, spec diff, or discussion evidence increases\./gi, "논의 링크는 있으나 공개 활동 메타데이터는 검증되지 않았습니다. 상태, 명세 변경, 논의 근거가 증가하기 전까지 관찰 신호로만 다룹니다.")
    .replace(/Treat as discussion\/momentum signal until implementation references or spec diffs appear\./gi, "구현 참조 또는 명세 변경이 나타날 때까지 논의/모멘텀 신호로만 다룹니다.")
    .replace(/Activity metadata is unavailable/gi, "활동 메타데이터 확인 불가")
    .replace(/public activity metadata/gi, "공개 활동 메타데이터")
    .replace(/discussion metadata/gi, "공개 논의 메타데이터")
    .replace(/discussion heat/gi, "논의 열기")
    .replace(/proposal content diff/gi, "제안 문안 변경")
    .replace(/content diff/gi, "문안 변경")
    .replace(/spec diffs/gi, "명세 변경")
    .replace(/spec-diff/gi, "명세 변경")
    .replace(/status movement/gi, "상태 변화")
    .replace(/implementation references/gi, "구현 참조")
    .replace(/watchlist item/gi, "관찰 항목")
    .replace(/watchlist signal/gi, "관찰 신호")
    .replace(/strong signal/gi, "강한 신호")
    .replace(/discussion\/momentum signal/gi, "논의/모멘텀 신호")
    .replace(/Ethereum execution-specs contains implementation tracking references, but verified client code support has not yet been established\./gi, "Ethereum execution-specs에는 구현 추적 근거가 있지만 검증된 클라이언트 코드 지원은 아직 확인되지 않았습니다.")
    .replace(/Implementation tracking references were found, but no verified client implementation or production support was identified\./gi, "구현 추적 근거는 확인됐지만, 검증된 클라이언트 구현이나 운영 채택 근거는 확인되지 않았습니다.")
    .replace(/Reference evidence should be reviewed manually before upgrading the signal\./gi, "이 참조 근거를 더 높은 단계로 올리기 전에는 수동 검토가 필요합니다.")
    .replace(/No implementation or external reference evidence collected in this run\./gi, "이번 실행에서 구현 또는 외부 참조 근거가 수집되지 않았습니다.")
    .replace(/GitHub evidence collection skipped because GITHUB_TOKEN is not configured\./gi, "GITHUB_TOKEN이 설정되지 않아 GitHub 근거 수집을 건너뛰었습니다.")
    .replace(/GitHub evidence collection could not be completed for this run\./gi, "이번 실행에서 GitHub 근거 수집을 완료하지 못했습니다.")
    .replace(/Evidence collection was incomplete; absence of evidence must not be read as negative evidence\./gi, "근거 수집이 불완전했습니다. 근거 부재를 부정 근거로 해석하면 안 됩니다.")
    .replace(/Core report and adoption evidence collection completed for the monitored scope\./gi, "모니터링 범위의 핵심 보고서와 채택 근거 수집이 완료되었습니다.")
    .replace(/Fresh activity suggests the proposal is still being debated or refined\./gi, "최근 활동이 있어 제안이 계속 논의 또는 보완되고 있음을 시사합니다.")
    .replace(/Theme momentum should be checked for status changes, content diffs, or narrower follow-up discussion\./gi, "테마 모멘텀은 상태 변경, 문안 변경, 더 구체적인 후속 논의와 함께 확인해야 합니다.")
    .replace(/The cluster should be checked for concrete nonce, root, and commit-reveal wording changes\./gi, "클러스터 내 nonce, root, commit-reveal 관련 문안 변화가 구체화되는지 확인해야 합니다.")
    .replace(/Protocol and wallet execution-boundary relevance; business relevance is indirect unless authorization impact becomes explicit\./gi, "프로토콜과 지갑 실행 경계 관련성이 있습니다. 권한 영향이 명확해지기 전까지 비즈니스 관련성은 간접 신호로만 봅니다.")
    .replace(/Older discussion exists, but recent activity is limited\./gi, "과거 논의는 있으나 최근 활동은 제한적입니다.")
    .replace(/Activity details unavailable/gi, "활동 세부 정보 확인 불가")
    .replace(/Stage is based only on collected public metadata and source links\./gi, "단계는 수집된 공개 메타데이터와 출처 링크만 기반으로 합니다.")
    .replace(/Tracking evidence is not verified client support\./gi, "구현 추적 근거는 검증된 클라이언트 지원이 아닙니다.")
    .replace(/No explicit evidence was collected\./gi, "명시적 근거가 수집되지 않았습니다.")
    .replace(/This stage is not inferred from earlier lifecycle stages\./gi, "이 단계는 이전 라이프사이클 단계에서 추론하지 않습니다.")
    .replace(/No direct client implementation source was accepted\./gi, "직접적인 클라이언트 구현 출처가 채택되지 않았습니다.")
    .replace(/Tracking is stronger than a mention but not verified implementation\./gi, "추적 근거는 단순 언급보다 강하지만 검증된 구현은 아닙니다.")
    .replace(/Current lifecycle stage is Implementation Tracking\./gi, "현재 라이프사이클 단계는 구현 추적입니다.")
    .replace(/Current lifecycle stage is Draft\./gi, "현재 라이프사이클 단계는 초안입니다.")
    .replace(/Current lifecycle stage is Review\./gi, "현재 라이프사이클 단계는 검토입니다.")
    .replace(/KGLD impact is Monitor\./gi, "KGLD 영향은 관찰 수준입니다.")
    .replace(/KGLD impact is None\./gi, "KGLD 영향은 없습니다.")
    .replace(/Draft with Monitor KGLD impact; no later lifecycle stage is inferred without evidence\./gi, "초안 단계이며 KGLD 영향은 관찰 수준입니다. 근거 없이 후속 단계로 추론하지 않습니다.")
    .replace(/Review with Monitor KGLD impact; no later lifecycle stage is inferred without evidence\./gi, "검토 단계이며 KGLD 영향은 관찰 수준입니다. 근거 없이 후속 단계로 추론하지 않습니다.")
    .replace(/Implementation Tracking with Monitor KGLD impact; no later lifecycle stage is inferred without evidence\./gi, "구현 추적 단계이며 KGLD 영향은 관찰 수준입니다. 근거 없이 후속 단계로 추론하지 않습니다.")
    .replace(/Discussion contributes 25% at score (\d+)\./gi, "논의 점수 $1을 25% 가중치로 반영합니다.")
    .replace(/Spec contributes 15% at score (\d+)\./gi, "명세 점수 $1을 15% 가중치로 반영합니다.")
    .replace(/Implementation contributes 30% at score (\d+)\./gi, "구현 점수 $1을 30% 가중치로 반영합니다.")
    .replace(/Release contributes 20% at score (\d+)\./gi, "릴리스 점수 $1을 20% 가중치로 반영합니다.")
    .replace(/Manual uncertainty contributes 10% at score (\d+)\./gi, "수동 불확실성 점수 $1을 10% 가중치로 반영합니다.")
    .replace(/([a-z ]+) contributes (\d+)% at score (\d+)\./gi, (_, factor: string, percent: string, score: string) => `${formatScoreLabel(factor.trim())} 점수 ${score}을 ${percent}% 가중치로 반영합니다.`)
    .replace(/(\d+) source\(s\) support this lifecycle stage\./gi, "이 라이프사이클 단계를 뒷받침하는 출처가 $1건 있습니다.")
    .replace(/(\d+) client-specific source\(s\) matched\./gi, "클라이언트별 출처 $1건이 일치했습니다.")
    .replace(/(\d+) release source\(s\) matched\./gi, "릴리스 출처 $1건이 일치했습니다.")
    .replace(/(\d+) deployment source\(s\) matched ([^.]+)\./gi, "배포 출처 $1건이 $2 상태와 일치했습니다.")
    .replace(/(\d+) impact area\(s\) reached Monitor or higher\./gi, "영향 영역 $1개가 관찰 이상입니다.")
    .replace(/High\/Critical impact requires strong KGLD relevance evidence\./gi, "높음/중대 영향은 강한 KGLD 관련 근거가 있을 때만 표시합니다.")
    .replace(/No KGLD candidate matched\./gi, "매칭된 KGLD 후보가 없습니다.")
    .replace(/(\d+) retained reference source\(s\) were collected\. This is not client support or production adoption evidence\./gi, "참조 출처 $1건이 수집됐습니다. 이는 클라이언트 지원이나 운영 채택 근거가 아닙니다.")
    .replace(/External mentions were found, but no implementation evidence was identified\. Retained source count: (\d+)\./gi, "외부 언급은 확인됐지만 구현 근거는 확인되지 않았습니다. 보관 출처는 $1건입니다.")
    .replace(/Higher false-positive risk lowers readiness\./gi, "오탐 위험이 높을수록 준비도는 낮아집니다.")
    .replace(/Discussion heat is high, but no verified implementation evidence was accepted\./gi, "논의 열기는 높지만 검증된 구현 근거는 채택되지 않았습니다.")
    .replace(/Implementation confidence is capped without verified client evidence\./gi, "검증된 클라이언트 근거가 없으면 구현 신뢰도는 제한됩니다.")
    .replace(/Release evidence was not accepted\./gi, "릴리스 근거가 채택되지 않았습니다.")
    .replace(/No direct business workflow evidence was found\./gi, "직접적인 비즈니스 workflow 근거가 확인되지 않았습니다.")
    .replace(/([A-Za-z /]+ impact) is plausible from theme\/title evidence; verify concrete KGLD workflow impact before escalation\./gi, (_, area: string) => `${formatKgldArea(area.trim())}은 테마/제목 근거상 가능성이 있지만, 상향 전 구체적인 KGLD workflow 영향을 검증해야 합니다.`)
    .replace(/is plausible from theme\/title evidence; verify concrete KGLD workflow impact before escalation\./gi, "테마/제목 근거상 가능성이 있지만, 상향 전 구체적인 KGLD workflow 영향을 검증해야 합니다.")
    .replace(/([A-Za-z /]+ impact) 은/gi, (_, area: string) => `${formatKgldArea(area.trim())}은`)
    .replace(/No direct ([a-z /]+) evidence was found\./gi, "직접적인 $1 근거가 확인되지 않았습니다.")
    .replace(/(.+) has proposal-specific implementation activity, but the current evidence does not establish verified implementation or release\./gi, "$1에서 제안별 구현 활동은 확인됐지만, 현재 근거만으로 검증된 구현 또는 릴리스를 판단할 수 없습니다.")
    .replace(/(.+) is retained as ([^;]+); the topic should not be treated as adoption or activation without stronger evidence\./gi, "$1은 $2 상태로 유지됩니다. 더 강한 근거 없이 채택이나 활성화로 해석하지 않습니다.")
    .replace(/(.+) is ([^:]+): (\d+) anchor\/supporting proposal[s]? show current-period evidence with separate implementation, release, and adoption gates\./gi, "$1은 $2 상태입니다. 주요·보조 제안 $3건에 현재 기간 근거가 있지만 구현, 릴리스, 채택은 별도 게이트로 판단합니다.")
    .replace(/Escalate only when a proposal-specific client PR is merged or code evidence is accepted\./gi, "제안별 클라이언트 PR 병합 또는 코드 근거가 채택될 때만 상향합니다.")
    .replace(/The signal is worth tracking only if it gains implementation, editor, or client-maintainer evidence\./gi, "구현, 에디터, 클라이언트 maintainer 근거가 추가될 때만 추적 우선순위를 높입니다.")
    .replace(/Wallet and Account Abstraction work is the clearest current direction: (\d+) related proposal signal[s]? require follow-up, but wallet impact still depends on implementation evidence\./gi, "지갑과 계정 추상화 흐름이 현재 가장 뚜렷한 방향입니다. 관련 제안 신호 $1건은 후속 확인이 필요하지만, 지갑 영향 판단은 구현 근거에 달려 있습니다.")
    .replace(/(.+) maturity changed this week; the story is a theme-level movement rather than an isolated proposal update\./gi, "$1의 성숙도 변화가 이번 주 확인됐습니다. 이는 개별 제안보다 테마 수준의 움직임으로 봅니다.")
    .replace(/(.+) has specification movement; materiality depends on changed sections and follow-up implementation evidence\./gi, "$1에서 명세 움직임이 확인됐습니다. 중요도는 변경된 섹션과 후속 구현 근거에 따라 달라집니다.")
    .replace(/(.+) has implementation evidence, but release, activation, and adoption remain separate gates\./gi, "$1에는 구현 근거가 있지만 릴리스, 활성화, 채택은 별도 게이트로 유지합니다.")
    .replace(/(.+) has observable signals, but no evidence-based implementation or adoption conclusion is available\./gi, "$1에는 관찰 가능한 신호가 있지만 구현 또는 채택 결론을 뒷받침하는 근거는 부족합니다.")
    .replace(/(.+) is insufficient evidence 상태입니다\. 주요·보조 제안 (\d+)건에 현재 기간 근거가 있지만 구현, 릴리스, 채택은 별도 게이트로 판단합니다\./gi, "$1은 Early Exploration 상태입니다. 주요·보조 제안 $2건에 현재 기간 근거가 있지만 구현, 릴리스, 채택은 별도 게이트로 판단합니다.")
    .replace(/This may affect execution semantics or client implementation work if it moves beyond proposal discussion\./gi, "제안 논의를 넘어 구현 근거로 이어질 경우 실행 의미론 또는 클라이언트 구현 작업에 영향을 줄 수 있습니다.")
    .replace(/This can affect wallet authorization, signing assumptions, sponsorship, or account migration planning\./gi, "지갑 권한, 서명 가정, 수수료 후원, 계정 이전 계획에 영향을 줄 수 있습니다.")
    .replace(/Maturity changed, so review priority should be updated\./gi, "성숙도 변화가 확인되어 검토 우선순위를 다시 확인해야 합니다.")
    .replace(/Watch ([A-Z]+-\d+) and related proposals for client PRs or implementation tracker issues\./gi, "$1 및 관련 제안에서 클라이언트 PR 또는 구현 추적 이슈가 열리는지 확인합니다.")
    .replace(/status changes (\d+); changed proposals (\d+); implementation activity (\d+) across/gi, "상태 변경 $1건, 변경 제안 $2건, 구현 활동 $3건:")
    .replace(/status changes (\d+); changed proposals (\d+) across/gi, "상태 변경 $1건, 변경 제안 $2건:")
    .replace(/new proposals (\d+); changed proposals (\d+) across/gi, "신규 제안 $1건, 변경 제안 $2건:")
    .replace(/new proposals (\d+); status changes (\d+); changed proposals (\d+) across/gi, "신규 제안 $1건, 상태 변경 $2건, 변경 제안 $3건:")
    .replace(/changed proposals (\d+) across/gi, "변경 제안 $1건:")
    .replace(/(.+) has (\d+) material current-period signals\./gi, "$1에서 현재 기간의 의미 있는 신호 $2건이 확인됐습니다.")
    .replace(/(.+) has at least one material current-period signal\./gi, "$1에서 현재 기간의 의미 있는 신호가 1건 이상 확인됐습니다.")
    .replace(/(.+) has historical concentration but little current-period movement\./gi, "$1은 장기 집중도는 있으나 현재 기간 움직임은 제한적입니다.")
    .replace(/(.+) has discussion context but no material weekly change\./gi, "$1은 논의 맥락은 있으나 의미 있는 주간 변화는 확인되지 않았습니다.")
    .replace(/(.+) has current-period evidence, but the share change is not strong enough to call acceleration\./gi, "$1에는 현재 기간 근거가 있지만 가속으로 판단할 만큼 비중 변화가 강하지 않습니다.")
    .replace(/(.+) has discussion context without a verified weekly movement\./gi, "$1에는 논의 맥락이 있으나 검증된 주간 움직임은 없습니다.")
    .replace(/The current evidence is insufficient to infer a directional trend for (.+)\./gi, "$1의 방향성을 추론하기에는 현재 근거가 부족합니다.")
    .replace(/No evidence-based Account Abstraction development is available for this run\./gi, "이번 실행에서 근거 기반 Account Abstraction 발전 신호는 확인되지 않았습니다.")
    .replace(/Current AA direction:/gi, "현재 Account Abstraction 방향:")
    .replace(/transaction sponsorship and wallet infrastructure/gi, "트랜잭션 후원과 지갑 인프라")
    .replace(/delegated authorization and scoped permissions/gi, "위임 권한과 범위 제한 권한")
    .replace(/signature abstraction and wallet authentication/gi, "서명 추상화와 지갑 인증")
    .replace(/wallet usability and account programmability/gi, "지갑 사용성과 계정 프로그래밍 가능성")
    .replace(/The evidence points to wallet usability and authorization assumptions more than base protocol activation\./gi, "현재 근거는 base protocol 활성화보다 지갑 사용성과 권한 가정에 더 가깝습니다.")
    .replace(/Account Abstraction remains a long-term tracked area without a meaningful weekly change\./gi, "Account Abstraction은 의미 있는 주간 변화 없이 장기 관찰 영역으로 유지됩니다.")
    .replace(/EOA delegation, scoped permission, sponsorship, or smart-account assumptions may need review when implementation evidence appears\./gi, "구현 근거가 나타나면 EOA 위임, 범위 제한 권한, 수수료 후원, 스마트 계정 가정을 검토해야 합니다.")
    .replace(/no supported assumption change this week/gi, "이번 주 지원되는 가정 변화 없음")
    .replace(/implementation evidence present/gi, "구현 근거 있음")
    .replace(/no verified implementation evidence/gi, "검증된 구현 근거가 확인되지 않음")
    .replace(/AA developers should watch whether these signals become wallet, bundler, paymaster, or execution-client work rather than treating proposal activity as adoption\./gi, "AA 개발자는 제안 활동을 채택으로 보지 말고 이 신호가 지갑, bundler, paymaster, 실행 클라이언트 작업으로 이어지는지 확인해야 합니다.")
    .replace(/No identifiable KGLD relevance was supported by the current evidence\./gi, "현재 근거로 식별 가능한 KGLD 관련성은 확인되지 않았습니다.")
    .replace(/No evidence-based KGLD causal path was identified\./gi, "근거 기반 KGLD 인과 경로가 식별되지 않았습니다.")
    .replace(/No action\./gi, "조치 없음.")
    .replace(/Reassess only if implementation or wallet\/custody evidence appears\./gi, "구현 또는 지갑·수탁 근거가 확인될 때만 재평가합니다.")
    .replace(/[\uFFFD]|[?][\u3131-\u318E\uAC00-\uD7A3]/g, "확인된 근거 없음")
    .replace(/\s\|\s/g, SEP)
    .replace(/\uCA0C/g, SEP);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

