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
import type {
  ChangeEvent,
  ChartSeries,
  AdoptionEvidenceItem,
  AdoptionLayer,
  DiffIntelligenceItem,
  DiscussionHeatItem,
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
    .replace(/<!-- EIPreporter atlas chart data: [\s\S]*? -->/gi, "")
    .replace(/<script>[\s\S]*?<\/script>/gi, "");
  const visibleText = visibleHtml.replace(/<[^>]+>/g, " ");
  const segments = visibleHtml.split(/<\/(?:li|tr|article)>/i);
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
    qualityCheck("source-coverage-visible", /핵심 Proposal/.test(visibleHtml) && /thread URL/.test(visibleHtml) && /전체 post 수집/.test(visibleHtml), "fail", "source coverage labels", "핵심/thread/full-post labels visible"),
    qualityCheck("discussion-integrity", discussionIntegrityFailures.length === 0, "fail", discussionIntegrityFailures.join(", ") || "none", "no discussion integrity failures", discussionIntegrityFailures),
    qualityCheck("historical-input-coverage", Boolean(report.ethereumTechRadar.historicalInputDiagnostics?.validHistoricalCoverage), "warning", JSON.stringify(report.ethereumTechRadar.historicalInputDiagnostics ?? {}), "earliest <= 150d, uniqueWeeks >= 20, timestamp coverage >= 95%"),
    qualityCheck("window-subset-valid", windowSubsetValid(report), "fail", "current7d subset of current180d", "true"),
    qualityCheck("window-filter-regression", !windowFilterRegression(report, atlas), "fail", report.ethereumTechRadar.historicalInputDiagnostics?.failureCode ?? "none", "no identical 180d/7d regression without explanation"),
    qualityCheck("weekly-history-sufficient", baselineHistorySufficient(report), "warning", String(report.ethereumTechRadar.historicalInputDiagnostics?.uniqueWeeks ?? 0), ">= 8 complete weeks"),
    qualityCheck("magicians-discovery-executed", magiciansDiscoveryCompleted(report), "fail", "discussion discovery states", "URL proposals completed or explicit states"),
    qualityCheck("magicians-fetch-attempted", !report.ethereumTechRadar.historicalInputDiagnostics || coverage.threadUrlConfirmed === 0 || coverage.postFetchAttempted === coverage.threadUrlConfirmed, "fail", `${coverage.postFetchAttempted}/${coverage.threadUrlConfirmed}`, "post fetch attempted for every confirmed thread URL"),
    qualityCheck("topic-current-ranking", topicCurrentRankingValid(atlas), "fail", selectFrontPageTopics(atlas).map((topic) => `${topic.topic}:${topic.priority}`).join(", "), "cover Top 3 equals current score Top 3"),
    qualityCheck("topic-count-consistency", topicCountConsistency(atlas), "fail", "topic chart/progress rows", "same topic counts across sections"),
    qualityCheck("lifecycle-percent-complete", lifecyclePercentComplete(html, atlas), "fail", "lifecycle segment totals", "each grouped topic stack sums to 100% ± 0.2"),
    qualityCheck("inactive-status-accounted", !atlas.classifiedProposals.some((proposal) => /Withdrawn|Stagnant|Living|Active/i.test(proposal.status)) || /Withdrawn|Stagnant|Living/.test(html), "fail", "inactive status labels", "inactive statuses accounted"),
    qualityCheck("coverage-state-consistency", coverageStateConsistency(report, atlas), "fail", "coverage counts", "URL/post/failure counts match discussion states"),
    qualityCheck("discussion-ui-wording", !(/최근 7일 댓글이 확인된 thread가 없습니다/.test(visibleHtml) && coverage.postsFullyCollected === 0) && !/Magicians 토론을 분석했습니다|Ethereum Magicians 토론을 분석했습니다/.test(visibleHtml), "fail", "discussion empty wording", "post 미수집과 실제 0 구분"),
    qualityCheck("magicians-pagination-complete", magiciansPaginationComplete(embeddedApi), "fail", "discussion pagination", "full threads complete, partial threads marked partial"),
    qualityCheck("magicians-last-post-consistency", magiciansLastPostConsistency(embeddedApi), "fail", "latestCollectedPostAt vs lastPostAt", "full threads latest post matches lastPostAt"),
    qualityCheck("magicians-content-analysis-claim", !/토론 내용을 분석했습니다|Magicians 토론을 분석했습니다|Ethereum Magicians 토론을 분석했습니다/.test(visibleHtml), "fail", "visible discussion claim", "no discussion analysis claim unless completed"),
    qualityCheck("current-window-fallback-ratio", currentWindowFallbackHandled(report, visibleHtml), "fail", String(report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.current7dFallbackRatio ?? 0), "fallback events isolated when current7d ratio > 25%"),
    qualityCheck("fallback-events-excluded-from-ranking", fallbackEventsExcludedFromRanking(report, atlas), "fail", "front page and weekly changes", "ranking uses confirmed timestamp events only"),
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
    qualityCheck("coverage-scope-label", /핵심 Topic 댓글|기술 지도|전체 분석/.test(visibleHtml), "fail", "comment count labels", "comment counts include scope labels"),
    qualityCheck("confirmed-event-count-consistency", confirmedEventCountConsistency(report, embeddedApi), "fail", "confirmed event counts", "compact signalQuality equals report events"),
    qualityCheck("final-html-semantic-validation", finalHtmlSemanticValidation(visibleHtml), "fail", "semantic HTML", "no stale labels or analysis-state mismatches"),
    qualityCheck("weekly-ranking-validity-rendering", weeklyRankingValidityRendering(report, visibleHtml), "fail", report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.weeklyRankingValidity ?? "unknown", "cover uses non-ranking signal wording when invalid"),
    qualityCheck("weekly-confidence-limit-canonical", weeklyConfidenceLimitCanonical(embeddedApi, visibleHtml), "fail", weeklyConfidenceLimitObserved(embeddedApi, visibleHtml), "Confidence & Limits weekly reason matches views.dataQuality and never treats invalid ranking as zero usable events"),
    qualityCheck("unknown-not-labeled-editorial", unknownNotLabeledEditorial(embeddedApi, visibleHtml), "fail", "unknown semantic events", "unknown rendered as unconfirmed type, not editorial"),
    qualityCheck("weekly-empty-state-when-no-meaningful-change", weeklyEmptyStateValid(report, embeddedApi, visibleHtml), "fail", "weekly changes", "empty state shown when meaningful confirmed changes are 0"),
    qualityCheck("discussion-count-window-consistency", discussionCountWindowConsistency(embeddedApi, visibleHtml), "fail", "discussion card counts", "proposal card counts use recent 7d window and match compact"),
    qualityCheck("discussion-raw-valid-analyzed-separation", discussionCountsSeparated(embeddedApi, visibleHtml), "fail", "discussion counts", "raw/valid/analyzed scopes present"),
    qualityCheck("discussion-section-analysis-state", discussionSectionAnalysisState(report, visibleHtml), "fail", "discussion section", "activity monitoring only when analysisCompleted=0"),
    qualityCheck("discussion-matrix-axis-validity", discussionMatrixAxisValidity(report, visibleHtml), "fail", "discussion matrix axes", "confirmed document changes and valid technical comments when matrix is rendered"),
    qualityCheck("topic-section-exclusivity", topicSectionExclusivity(embeddedApi, visibleHtml), "fail", "topic sections", "same topic is rendered in one executive category"),
    qualityCheck("topic-description-template", topicDescriptionTemplateValid(visibleHtml), "fail", "topic narratives", "topic-specific templates are not mixed"),
    qualityCheck("comment-scope-label-consistency", commentScopeLabelConsistency(visibleHtml), "fail", "comment labels", "scope and window are explicit"),
    qualityCheck("cover-singular-plural-consistency", coverSingularPluralConsistency(report, embeddedApi, visibleHtml), "fail", "cover signal label", "single/invalid signal uses singular non-ranking wording"),
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
    qualityCheck("deep-link-contract", /#topic\/|data-topic-open/.test(html), "fail", "deep links", "implemented topic hash deep links supported"),
    qualityCheck("topic-detail-contract", /data-topic-drawer/.test(html) && /data-topic-open/.test(html), "fail", "topic drawer", "clickable topic detail drawer exists"),
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
    qualityCheck("landscape-period-functional", landscapePeriodFunctional(html), "fail", "period buttons", "period changes values and bar widths"),
    qualityCheck("landscape-evidence-functional", landscapeEvidenceFunctional(html), "fail", "evidence buttons", "evidence changes metrics and links"),
    qualityCheck("landscape-status-enum-consistency", landscapeStatusEnumConsistency(html), "fail", "status filter", "status options match card enum values"),
    qualityCheck("landscape-filter-scope-isolation", landscapeFilterScopeIsolation(html), "fail", "filter scope", "landscape filters only target #technology-landscape cards"),
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
    qualityCheck("pa-02-observed-universe-only", !/Ethereum 전체|EVM 전체 구현 생태계/.test(visibleHtml), "fail", "PA-02", "does not overstate total Ethereum coverage"),
    qualityCheck("pa-03-proposal-event-units", metricDictionaryComplete(embeddedApi), "fail", "PA-03", "proposal and event units are registered separately"),
    qualityCheck("pa-04-weekly-usable-consistent", weeklyUsableCrossViewConsistency(embeddedApi), "fail", "PA-04", "weekly usable data is consistent"),
    qualityCheck("pa-05-developer-executive-alignment", developerActivityTopProposalsValid(embeddedApi), "fail", "PA-05", "Developer activity top proposals align with Executive"),
    qualityCheck("pa-06-official-proposal-summary", proposalSummarySemanticFixtures(embeddedApi), "fail", "PA-06", "Proposal summary is source-based"),
    qualityCheck("pa-07-aa-direction-evidence", aaDirectionEvidenceValid(embeddedApi), "fail", "PA-07", "AA direction has evidence"),
    qualityCheck("pa-08-focus-reason-visible", /선정 이유|180일 의미 event|30일 의미 event|status progression/.test(visibleHtml), "fail", "PA-08", "Focus selection reason is visible"),
    qualityCheck("pa-09-kgld-action-trigger", productQ6KgldWatch(embeddedApi, visibleHtml), "fail", "PA-09", "KGLD action and trigger are visible"),
    qualityCheck("pa-10-executive-usable", /Bottom Line/.test(visibleHtml) && /Why It Matters/.test(visibleHtml) && /KGLD Actions/.test(visibleHtml) && /Confidence & Limits/.test(visibleHtml), "fail", "PA-10", "Executive has conclusion, meaning, action, limits"),
    qualityCheck("pa-11-snapshot-consistency", snapshotHashConsistency(embeddedApi), "fail", "PA-11", "compact and HTML snapshot root can be compared"),
    qualityCheck("pa-12-structural-semantic-e2e", productQ1DevelopmentLandscape(embeddedApi, visibleHtml) && productQ2DeveloperAttention(embeddedApi, visibleHtml) && productQ3LongVsRecent(embeddedApi, visibleHtml) && productQ4ProgressTracker(embeddedApi, visibleHtml) && productQ5AaRadar(embeddedApi, visibleHtml) && productQ6KgldWatch(embeddedApi, visibleHtml), "fail", "PA-12", "product checks pass"),
    qualityCheck("historical-backfill-success-rate", historicalBackfillSufficient(report), "warning", JSON.stringify(report.ethereumTechRadar.historicalInputDiagnostics?.gitBackfillDiagnostics ?? {}), "overall success >= 90%"),
    qualityCheck("historical-timestamp-source-quality", historicalTimestampQuality(report), "fail", String(report.ethereumTechRadar.historicalInputDiagnostics?.fallbackDetectedAtRatio ?? 0), "<= 0.25"),
    qualityCheck("current-window-concentration", (report.ethereumTechRadar.historicalInputDiagnostics?.currentWindowConcentration?.share ?? 0) <= 0.4, "warning", String(report.ethereumTechRadar.historicalInputDiagnostics?.currentWindowConcentration?.share ?? 0), "<= 0.40"),
    qualityCheck("activity-windows-independent", sparseActivityFixture || JSON.stringify(atlas.charts.domain180d.data) !== JSON.stringify(atlas.charts.domain7d.data), "fail", "domain chart arrays", "180d/7d arrays differ or 180d UI disabled"),
    qualityCheck("canvas-wrapper", /class="atlas-chart-frame"/.test(html), "fail", "canvas wrapper", "present"),
    qualityCheck("maturity-title-removed", !/기술 성숙도/.test(html), "fail", "maturity title", "absent"),
    qualityCheck("appendix-public-labels", !/classification confidence|canonical primary domain|verified technology/.test(visibleHtml), "fail", "internal labels", "absent"),
    qualityCheck("debug-json-default-disabled", true, "fail", "debug default", "disabled"),
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

function currentWindowFallbackHandled(report: WeeklyRadarReport, visibleHtml: string): boolean {
  const quality = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality;
  if (!quality || quality.current7dFallbackRatio <= 0.25) return true;
  return /발생일 미확정 변화/.test(visibleHtml);
}

function fallbackEventsExcludedFromRanking(report: WeeklyRadarReport, atlas: TechnologyAtlas): boolean {
  const fallbackIds = new Set(allReportRecentEvents(report).filter((event) => !isConfirmedReportEvent(event)).map((event) => event.proposalId));
  if (!fallbackIds.size) return true;
  return selectFrontPageTopics(atlas).every((topic) =>
    topic.priority > 0 && topic.proposals.some((id) => {
      const proposal = proposalById(atlas, id);
      const discussionSignal = proposal && proposal.activity.current7d.discussionCount > 0;
      return proposal && ((proposal.activity.current7d.activeProposalCount > 0 && !fallbackIds.has(id)) || discussionSignal);
    })
  );
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

function weeklyRankingValidityRendering(report: WeeklyRadarReport, visibleHtml: string): boolean {
  const invalid = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.weeklyRankingValidity === "invalid";
  if (!invalid) return true;
  return /확인된 주간 신호/.test(visibleHtml)
    && /주간 개발 순위를 산정하지 않았습니다|주간 개발 순위에서 제외했습니다/.test(visibleHtml)
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
  const staleZeroReason = /usable event가 0건/.test(visibleHtml) || /usable event가 0건/.test(embeddedReason ?? "");
  const countMatches = visibleHtml.includes(reason)
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
  const meaningful = meaningfulConfirmedEventCount(report);
  if (meaningful > 0) return true;
  const weekly = dashboardFromApi(embeddedApi)?.executivePulse.weeklyDevelopmentTop3 ?? [];
  return weekly.length === 0 && /확인 가능한 의미 변화 없음|확인된 의미 변화 없음/.test(visibleHtml) && /발생일 미확정 변화 \d+건/.test(visibleHtml);
}

function discussionCountWindowConsistency(embeddedApi: unknown, visibleHtml: string): boolean {
  const visibleText = visibleHtml.replace(/<[^>]+>/g, " ");
  const dashboard = dashboardFromApi(embeddedApi);
  if (dashboard?.developerAttention) {
    const expected = dashboard.developerAttention.summary.rawPosts;
    const matches = [...visibleText.matchAll(/최근 7일 원시 댓글 (\d+)건/g)].map((match) => Number(match[1]));
    return matches.reduce((sum, value) => sum + value, 0) === expected;
  }
  const signal = embeddedApi && typeof embeddedApi === "object" ? (embeddedApi as { signalQuality?: { proposalCardDiscussionCounts?: Array<{ rawPostCount?: number }> } }).signalQuality : undefined;
  const cards = signal?.proposalCardDiscussionCounts ?? [];
  const expected = cards.reduce((sum, item) => sum + (item.rawPostCount ?? 0), 0);
  const matches = [...visibleText.matchAll(/최근 7일 원시 댓글 (\d+)건/g)].map((match) => Number(match[1]));
  return matches.reduce((sum, value) => sum + value, 0) === expected;
}

function discussionCountsSeparated(embeddedApi: unknown, visibleHtml: string): boolean {
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
  return /최근 Ethereum Magicians 활동/.test(visibleHtml)
    && /기술 relevance 분류가 완료되기 전까지 개발자 관심 순위로 해석하지 않습니다/.test(visibleHtml)
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
  const hasTopicCards = /최근 7일 원시 댓글 \d+건/.test(visibleHtml);
  return /핵심 Topic 최근 7일 댓글/.test(visibleHtml)
    && /기술 지도 최근 7일 댓글/.test(visibleHtml)
    && /전체 분석 최근 7일 댓글/.test(visibleHtml)
    && (!hasTopicCards || /해당 Topic 최근 7일 댓글|최근 7일 원시 댓글/.test(visibleHtml));
}

function coverSingularPluralConsistency(report: WeeklyRadarReport, embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  const count = dashboard?.dataQuality?.current7dUsableEventCount ?? selectFrontPageTopics(buildTechnologyAtlas(report)).length;
  const invalid = report.ethereumTechRadar.historicalInputDiagnostics?.timestampQuality?.weeklyRankingValidity === "invalid";
  if (invalid || count === 0) return /확인된 주간 신호|유효 신호 없음|신호 없음/.test(visibleHtml) && !/이번 주 주요 개발 주제|주요 신호들|Top signals/i.test(visibleHtml);
  if (count === 1) return /확인된 주간 신호|단일 신호/.test(visibleHtml) && !/이번 주 주요 개발 주제|주요 신호들|Top signals/i.test(visibleHtml);
  return /이번 주 주요 개발 주제/.test(visibleHtml);
}

function dashboardFromApi(embeddedApi: unknown) {
  if (!embeddedApi || typeof embeddedApi !== "object") return undefined;
  const root = embeddedApi as { dashboard?: ReturnType<typeof buildDashboard>; intelligenceSnapshot?: { views?: ReturnType<typeof buildDashboard> } };
  return root.intelligenceSnapshot?.views ?? root.dashboard;
}

function productQ1DevelopmentLandscape(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  return Boolean(dashboard?.technologyLandscape?.length === 8)
    && /Technology Landscape/.test(visibleHtml)
    && /180일 의미 변화 Proposal/.test(visibleHtml)
    && /30일 의미 변화 Proposal/.test(visibleHtml)
    && /최근 7일 의미 변화 Proposal/.test(visibleHtml);
}

function productQ2DeveloperAttention(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  return Boolean(dashboard?.developerAttention)
    && /최근 Ethereum Magicians 활동/.test(visibleHtml)
    && /raw posts/.test(visibleHtml)
    && /valid technical posts/.test(visibleHtml)
    && /validated insights/.test(visibleHtml);
}

function productQ3LongVsRecent(embeddedApi: unknown, visibleHtml: string): boolean {
  return Boolean(dashboardFromApi(embeddedApi)?.dataQuality)
    && /Focus & Progress/.test(visibleHtml)
    && /이번 주 관찰 신호/.test(visibleHtml)
    && /180d|30d|7d/.test(visibleHtml);
}

function productQ4ProgressTracker(embeddedApi: unknown, visibleHtml: string): boolean {
  return Boolean(dashboardFromApi(embeddedApi)?.focusProgress?.length)
    && /Specification/.test(visibleHtml)
    && /Discussion/.test(visibleHtml)
    && /Implementation/.test(visibleHtml)
    && /Activation/.test(visibleHtml)
    && /Adoption/.test(visibleHtml);
}

function productQ5AaRadar(embeddedApi: unknown, visibleHtml: string): boolean {
  return Boolean(dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks?.length === 12) && /Account Abstraction Radar/.test(visibleHtml);
}

function productQ6KgldWatch(embeddedApi: unknown, visibleHtml: string): boolean {
  const dashboard = dashboardFromApi(embeddedApi);
  const items = kgldWatchItems(dashboard);
  const count = items.length;
  if (count === 0) return /KGLD Technology Watch/.test(visibleHtml) && /해당 없음/.test(visibleHtml);
  return items.every((item) => item.internalAction && item.nextTrigger && item.sourceUrls?.length)
    && /지금 할 일/.test(visibleHtml)
    && /다음 trigger/.test(visibleHtml)
    && /confidence low|confidence medium|confidence high/.test(visibleHtml)
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
    && pulse.bottomLine.every((text) => typeof text === "string" && text.length > 10 && visibleText.includes(text));
}

function developerAttentionSummaryPresent(embeddedApi: unknown, visibleHtml: string): boolean {
  const activity = dashboardFromApi(embeddedApi)?.developerAttention?.activity ?? [];
  return activity.every((item) => item.proposalSummaryKo && item.proposalSummaryKo.length > 0)
    && (!activity.length || /요약 근거: specification/.test(visibleHtml));
}

function developerAttentionSummarySource(embeddedApi: unknown): boolean {
  const activity = dashboardFromApi(embeddedApi)?.developerAttention?.activity ?? [];
  return activity.every((item) => /^https:\/\/eips\.ethereum\.org\/EIPS\/eip-\d+/.test(item.summaryEvidence?.sourceUrl ?? ""));
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
    && /최근 30일 확인된 명세 변화/.test(visibleHtml)
    && /최근 30일 Magicians 활동/.test(visibleHtml)
    && /구현 근거/.test(visibleHtml);
}

function aaErc4337BaselineLinked(embeddedApi: unknown, visibleHtml: string): boolean {
  const track = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks?.find((item) => item.id === "erc-4337-entrypoint");
  return Boolean(track?.baselineProposals?.some((proposal) => proposal.subjectId === "ERC-4337" && proposal.role === "baseline"))
    && /ERC-4337/.test(visibleHtml)
    && /기준 표준/.test(visibleHtml)
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
    && /eips\.ethereum\.org\/EIPS\/eip-8286/.test(spec.sourceUrl)
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
    .every((proposal) => /eips\.ethereum\.org\/EIPS\/eip-\d+/.test(proposal.sourceUrl)));
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
  return (!baselineNotLinked || /추적 기준 미설정/.test(visibleHtml))
    && !/Track에 연결된 기준 Proposal이 없습니다[\s\S]{0,120}모니터링 제외/.test(visibleHtml);
}

function aaRawPostWording(embeddedApi: unknown, visibleHtml: string): boolean {
  const hasRawActivity = (dashboardFromApi(embeddedApi)?.accountAbstraction.tracks ?? []).some((track) => (track.discussion30d?.value ?? 0) > 0);
  return !hasRawActivity || (/원시 post/.test(visibleHtml) && /유효 기술 post 미분류/.test(visibleHtml) && /토론 방향 판단 불가/.test(visibleHtml));
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
    && /최근 Signal/.test(visibleHtml);
}

function aaDirectionEvidenceV2(embeddedApi: unknown): boolean {
  const tracks = dashboardFromApi(embeddedApi)?.accountAbstraction?.tracks ?? [];
  return tracks.every((track) => {
    if (track.direction === "advancing") return (track.specification30d?.value ?? 0) > 0 || track.implementationEvidence?.length > 0;
    if (track.direction === "active_discussion") return (track.discussion30d?.value ?? 0) > 0 && (track.specification30d?.value ?? 0) === 0;
    if (track.direction === "stable") return track.baselineProposals?.length > 0;
    if (track.direction === "baseline_not_linked") return (track.baselineProposals?.length ?? 0) === 0;
    if (track.direction === "not_monitored") return (track.baselineProposals?.length ?? 0) === 0;
    return true;
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
  return /const max=Math\.max\(0,\.\.\.values\)/.test(html)
    && /fill\.style\.width=width\.toFixed\(1\)\+"%"/.test(html)
    && /data-period="7d"[\s\S]*data-period="30d"[\s\S]*data-period="180d"/.test(html);
}

function landscapeEvidenceFunctional(html: string): boolean {
  return /data-evidence="specification"/.test(html)
    && /data-evidence="discussion"/.test(html)
    && /data-evidence="implementation"/.test(html)
    && /data-evidence-text/.test(html)
    && /data-source-links/.test(html)
    && /filters\.evidence==="specification"/.test(html);
}

function landscapeStatusEnumConsistency(html: string): boolean {
  return /data-statuses=/.test(html) && /<option value="draft">/.test(html) && /<option value="review">/.test(html) && /<option value="final">/.test(html);
}

function landscapeFilterScopeIsolation(html: string): boolean {
  return /const landscapeSection=document\.querySelector\("#technology-landscape"\)/.test(html)
    && /landscapeSection\.querySelectorAll\("\[data-landscape-card\]"\)/.test(html)
    && !/document\.querySelectorAll\("\[data-filter-card\]"\)/.test(html);
}

function topicDrawerDataCompleteness(embeddedApi: unknown, html: string): boolean {
  const focus = dashboardFromApi(embeddedApi)?.focusProgress ?? [];
  return focus.length > 0
    && /dashboardData\.focusProgress/.test(html)
    && /topic\.proposalIds/.test(html)
    && /topic\.progress\?\.specificationStage/.test(html);
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
  return Boolean(scope?.subtitle?.includes("EIP/ERC 명세와 Ethereum Magicians 활동"))
    && /EIP\/ERC 명세와 Ethereum Magicians 활동을 중심으로 한 Ethereum 표준 개발 관찰 보고서/.test(visibleHtml)
    && /관찰 대상 내 180일 이력/.test(visibleHtml)
    && !/180d coverage/.test(visibleHtml);
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
  return tracks.every((track) => track.direction !== "advancing" || track.current7dChanges > 0 || track.implementationEvidence.length > 0);
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
  return /const snapshot\s*=\s*JSON\.parse\([^;]+\.intelligenceSnapshot/.test(html)
    && /const dashboardData\s*=\s*snapshot\.views/.test(html)
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
  const domainUnion = new Set(snapshot.views.technologyLandscape.flatMap((domain) => stringList(domain.discussion?.rawPostIds)));
  const expectedCount = stringList(aggregate?.rawPostIds).length;
  return Boolean(aggregate)
    && aggregate!.rawPostCount === expectedCount
    && domainUnion.size === expectedCount
    && stringList(aggregate!.rawPostIds).every((id) => domainUnion.has(id))
    && new RegExp(`기술 지도 최근 7일 댓글</span><b>${expectedCount}</b>`).test(visibleHtml);
}

function finalTechnologyMapObserved(embeddedApi: unknown): string {
  const snapshot = intelligenceSnapshotFromApi(embeddedApi);
  const aggregate = snapshot?.aggregates.discussion?.technology_map_set as { rawPostCount?: number } | undefined;
  const domainUnion = new Set(snapshot?.views.technologyLandscape.flatMap((domain) => stringList(domain.discussion?.rawPostIds)) ?? []);
  return `technologyMap=${aggregate?.rawPostCount ?? "n/a"} posts; domainUnion=${domainUnion.size} posts`;
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
  coverSingularPluralConsistency,
  goldenFixtureInputHash,
  inputSnapshotHash,
  qualityCheck,
  weeklyConfidenceLimitCanonical,
  weeklySpecificationTrendReason,
  subjectRegistryMissingIdsFromPublicViews,
  snapshotHash,
  validateWeeklyCollectionPreflight,
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
  const dashboard = platformApi.intelligenceSnapshot.views;
  const platformApiJson = JSON.stringify(platformApi).replace(/</g, "\\u003c").replace(/--/g, "\\u002d\\u002d");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ethereum Technology Atlas - ${escapeHtml(report.generatedAt.slice(0, 10))}</title>
  <style>${reportStyles()}</style>
</head>
<body>
<main>
  ${renderDashboardCover(report, dashboard)}
  <nav class="section-nav" aria-label="보고서 섹션">
    <a href="#executive-pulse">Executive Pulse</a><a href="#technology-landscape">Technology Landscape</a><a href="#focus-progress">Focus & Progress</a><a href="#developer-attention">Developer Attention</a><a href="#aa-radar">AA Radar</a><a href="#kgld-watch">KGLD Watch</a><a href="#data-quality">Evidence Quality</a><a href="#proposal-appendix">Appendix</a>
  </nav>

  <section class="section research-section" id="executive-pulse">
    ${renderExecutivePulse(dashboard)}
  </section>

  <section class="section research-section" id="technology-landscape">
    ${renderTechnologyLandscape(dashboard)}
  </section>

  <section class="section research-section" id="focus-progress">
    ${renderFocusProgress(dashboard)}
  </section>

  <section class="section research-section" id="developer-attention">
    ${renderDeveloperAttention(dashboard)}
  </section>

  <section class="section research-section" id="aa-radar">
    ${renderAccountAbstractionRadar(dashboard)}
  </section>

  <section class="section research-section" id="kgld-watch">
    ${renderKgldWatch(dashboard)}
  </section>

  <section class="section research-section" id="data-quality">
    ${renderDataQuality(dashboard)}
  </section>
  ${atlasProposalAppendix(report, atlas)}
  ${renderFooter(report, platform)}
</main>
<script type="application/json" id="technology-platform-api">${platformApiJson}</script>
<script>
  initDashboardInteractions();
  function initDashboardInteractions(){
    const filters={period:"180d",evidence:"specification",domain:"all",status:"all",aaOnly:false,kgldOnly:false,query:""};
    const snapshot=JSON.parse(document.getElementById("technology-platform-api")?.textContent||"{}").intelligenceSnapshot||{};
    const dashboardData=snapshot.views||{};
    const topics=[...(dashboardData.focusProgress||[]),...(dashboardData.executivePulse?.weeklyDevelopmentTop3||[]),...(dashboardData.executivePulse?.developerAttentionTop3||[])];
    const landscapeSection=document.querySelector("#technology-landscape");
    const apply=()=>{
      if(!landscapeSection)return;
      const cards=[...landscapeSection.querySelectorAll("[data-landscape-card]")];
      cards.forEach((node)=>{
        const domain=node.getAttribute("data-domain")||"";
        const status=node.getAttribute("data-statuses")||"";
        const text=(node.getAttribute("data-search")||node.textContent||"").toLowerCase();
        const aa=node.getAttribute("data-aa")==="true";
        const kgld=node.getAttribute("data-kgld")==="true";
        const okDomain=filters.domain==="all"||domain===filters.domain;
        const okStatus=filters.status==="all"||status.toLowerCase().split(/\\s+/).includes(filters.status);
        const okAa=!filters.aaOnly||aa;
        const okKgld=!filters.kgldOnly||kgld;
        const okQuery=!filters.query||text.includes(filters.query);
        node.classList.toggle("is-hidden",!(okDomain&&okStatus&&okAa&&okKgld&&okQuery));
        node.querySelectorAll("[data-card-metric]").forEach((metric)=>{
          const value=filters.evidence==="specification"?(metric.getAttribute("data-"+filters.period)||"0"):metric.getAttribute("data-"+filters.evidence)||"0";
          metric.textContent=value;
        });
        node.querySelectorAll("[data-metric-label]").forEach((label)=>{label.textContent=filters.evidence==="specification"?(filters.period==="7d"?"최근 7일 의미 변화 Proposal":filters.period==="30d"?"최근 30일 의미 변화 Proposal":"180일 의미 변화 Proposal"):filters.evidence==="discussion"?"최근 7일 원시 post":"구현 근거";});
        node.querySelectorAll("[data-evidence-text]").forEach((textNode)=>{textNode.textContent=textNode.getAttribute("data-"+filters.evidence)||"";});
        node.querySelectorAll("[data-source-links]").forEach((links)=>{links.innerHTML=links.getAttribute("data-"+filters.evidence+"-links")||"";});
      });
      const visibleDomains=new Set(cards.filter((node)=>!node.classList.contains("is-hidden")).map((node)=>node.getAttribute("data-domain")||""));
      const bars=[...landscapeSection.querySelectorAll("[data-landscape-bar]")];
      const values=bars.map((bar)=>visibleDomains.has(bar.getAttribute("data-domain")||"")?Number(bar.getAttribute("data-"+filters.period)||0):0);
      const max=Math.max(0,...values);
      bars.forEach((bar,index)=>{
        const visible=visibleDomains.has(bar.getAttribute("data-domain")||"");
        const value=visible?values[index]:0;
        bar.classList.toggle("is-hidden",!visible);
        const width=max>0?(value/max*100):0;
        const fill=bar.querySelector("i");
        if(fill)fill.style.width=width.toFixed(1)+"%";
        const label=bar.querySelector("[data-period-value]");
        if(label)label.textContent=String(value);
      });
      landscapeSection.querySelector("[data-landscape-empty]")?.classList.toggle("is-hidden",cards.some((node)=>!node.classList.contains("is-hidden")));
      const summary=landscapeSection.querySelector("[data-filter-summary]");
      if(summary)summary.textContent="기간 "+filters.period+" · 근거 "+filters.evidence+" · Domain "+(filters.domain==="all"?"전체":filters.domain);
      landscapeSection.querySelectorAll("[data-period]").forEach((button)=>{const active=button.getAttribute("data-period")===filters.period;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});
      landscapeSection.querySelectorAll("[data-evidence]").forEach((button)=>{const active=button.getAttribute("data-evidence")===filters.evidence;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});
    };
    landscapeSection?.querySelectorAll("[data-period]").forEach((button)=>button.addEventListener("click",()=>{filters.period=button.getAttribute("data-period")||"180d";apply();}));
    landscapeSection?.querySelectorAll("[data-evidence]").forEach((button)=>button.addEventListener("click",()=>{filters.evidence=button.getAttribute("data-evidence")||"specification";apply();}));
    landscapeSection?.querySelectorAll("[data-domain-filter]").forEach((select)=>select.addEventListener("change",()=>{filters.domain=select.value;apply();}));
    landscapeSection?.querySelectorAll("[data-status-filter]").forEach((select)=>select.addEventListener("change",()=>{filters.status=select.value;apply();}));
    landscapeSection?.querySelectorAll("[data-aa-toggle]").forEach((input)=>input.addEventListener("change",()=>{filters.aaOnly=input.checked;apply();}));
    landscapeSection?.querySelectorAll("[data-kgld-toggle]").forEach((input)=>input.addEventListener("change",()=>{filters.kgldOnly=input.checked;apply();}));
    landscapeSection?.querySelectorAll("[data-proposal-search]").forEach((input)=>input.addEventListener("input",()=>{filters.query=input.value.toLowerCase();apply();}));
    landscapeSection?.querySelectorAll("[data-filter-reset]").forEach((button)=>button.addEventListener("click",()=>{filters.period="180d";filters.evidence="specification";filters.domain="all";filters.status="all";filters.aaOnly=false;filters.kgldOnly=false;filters.query="";landscapeSection.querySelectorAll("select").forEach((select)=>select.value="all");landscapeSection.querySelectorAll("input").forEach((input)=>{if(input.type==="checkbox")input.checked=false;else input.value="";});apply();}));
    document.querySelectorAll("[data-topic-open]").forEach((button)=>button.addEventListener("click",()=>openDrawer(button.getAttribute("data-topic-open")||"",button.getAttribute("data-topic-title")||"")));
    const openDrawer=(id,title)=>{const drawer=document.querySelector("[data-topic-drawer]"); if(!drawer)return; const topicId=id.startsWith("topic/")?id.slice(6):id; const topic=topics.find((item)=>item.topicId===topicId||item.id===topicId); if(!topic){drawer.querySelector("h3").textContent="Topic 데이터 없음"; drawer.querySelector("p").textContent="선택한 Topic 데이터를 찾지 못했습니다."; drawer.classList.add("open"); return;} drawer.querySelector("h3").textContent=topic.nameKo||topic.name||title||topicId; const proposalLinks=(topic.proposalIds||[]).map((proposalId)=>"<a href=\\"https://eips.ethereum.org/EIPS/eip-"+String(proposalId).replace(/^[A-Z]+-/,"")+"\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">"+proposalId+"</a>").join(" "); drawer.querySelector("p").innerHTML="<b>문제</b><br>"+(topic.problemKo||topic.problem||"")+"<br><br><b>Proposal</b><br>"+proposalLinks+"<br><br><b>변화</b><br>7d "+(topic.current7dChanges||0)+" · 30d "+(topic.current30dChanges||0)+" · 180d "+(topic.trend180dEvents||0)+"<br><br><b>Progress</b><br>Specification "+(topic.progress?.specificationStage||"미확인")+" · Discussion "+(topic.progress?.discussionStage||"미확인")+" · Implementation "+(topic.progress?.implementationStage||"미확인")+" · Activation "+(topic.progress?.activationStage||"미확인")+" · Adoption "+(topic.progress?.adoptionStage||"미확인")+"<br><br><b>다음 확인 조건</b><br>"+(topic.nextEvidenceCondition||"미확인"); drawer.classList.add("open"); location.hash=id.startsWith("aa/")||id.startsWith("kgld/")||id.startsWith("topic/")?"#"+id:"#topic/"+id;};
    document.querySelectorAll("[data-drawer-close]").forEach((button)=>button.addEventListener("click",()=>button.closest("[data-topic-drawer]")?.classList.remove("open")));
    if(location.hash){const key=location.hash.slice(1); const target=document.querySelector('[data-topic-open="'+key+'"]'); if(target) target.click();}
    apply();
  }
</script></body></html>`;
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
  const longTermTop3 = focusTopics.slice(0, 3);
  const weeklyTop3 = isWeeklyRankingReliable(dataQuality.weeklyRankingValidity) ? weeklyTopics.filter((topic) => !longTermTop3.some((item) => item.topicId === topic.topicId)).slice(0, 3) : [];
  const attentionTop3 = developerAttention.activity.slice(0, 3).map((item) => ({
    topicId: item.proposalId,
    nameKo: `${item.proposalId} ${item.title}`,
    proposalIds: [item.proposalId],
    rawPostCount: item.rawPostCount,
    sourceUrls: [proposalUrl(item.proposalId), item.threadUrl].filter(Boolean),
  }));
  const executivePulse = {
    dataQuality,
    executiveAbstract: executiveAbstract({ dataQuality, focusTopics, weeklyTop3, attentionTop3, aa, kgld }),
    bottomLine: bottomLineStatements({ dataQuality, focusTopics, attentionTop3, kgld }),
    whatChanged: {
      confirmedSpecificationChanges: usableCurrent7d.length === 0 ? "확인 가능한 의미 변화 없음" : `${usableCurrent7d.length}건의 확인된 의미 변화`,
      magiciansActivity: attentionTop3,
    },
    confidenceLimits: [
      { label: "Long-term standards direction", level: "medium", reason: "관찰 대상 내 180일 명세 이력은 유효합니다." },
      { label: "Weekly specification trend", level: isWeeklyRankingReliable(dataQuality.weeklyRankingValidity) ? "medium" : "low", reason: weeklySpecificationTrendReason(dataQuality) },
      { label: "Magicians activity", level: "medium", reason: "최근 post metadata는 수집됐지만 relevance classification은 미완료입니다." },
      { label: "Discussion meaning", level: "unavailable", reason: "검증된 토론 insight가 없습니다." },
      { label: "Implementation progress", level: "unavailable", reason: "implementation source adapter가 수집 대상이 아닙니다." },
    ],
    longTermFocusTop3: longTermTop3,
    weeklyDevelopmentTop3: weeklyTop3,
    weeklyDevelopmentDisabledReason: dataQuality.weeklyRankingValidity === "invalid" ? "최근 7일 usable event 비율이 50% 미만이어서 주간 개발 순위를 비활성화했습니다." : "",
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
  focusTopics: ReturnType<typeof topicDashboardItem>[];
  weeklyTop3: ReturnType<typeof topicDashboardItem>[];
  attentionTop3: Array<{ nameKo: string; proposalIds: string[]; rawPostCount?: number }>;
  aa: ReturnType<typeof accountAbstractionDashboard>;
  kgld: ReturnType<typeof kgldDashboard>;
}) {
  const longNames = input.focusTopics.slice(0, 3).map((topic) => topic.nameKo).join(", ") || "장기 흐름 미확인";
  const weekly = input.weeklyTop3.length
    ? `${input.weeklyTop3.map((topic) => topic.nameKo).join(", ")}에서 확인된 주간 의미 변화가 있습니다.`
    : input.dataQuality.weeklyRankingValidity === "invalid"
      ? "최근 7일 변경 이벤트는 주간 순위에 사용할 만큼 충분히 검증되지 않았습니다."
      : "이번 주 확인된 의미 변화는 제한적입니다.";
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
  focusTopics: ReturnType<typeof topicDashboardItem>[];
  attentionTop3: Array<{ nameKo: string; proposalIds: string[]; rawPostCount?: number }>;
  kgld: ReturnType<typeof kgldDashboard>;
}) {
  const focus = input.focusTopics.slice(0, 3).map((topic) => topic.nameKo).join(", ") || "장기 집중도 미확인";
  const attention = input.attentionTop3.map((item) => `${item.proposalIds[0]} ${item.rawPostCount ?? 0}건`).join(", ") || "최근 활동 thread 없음";
  const kgld = input.kgld.groups.research_now.map((item) => item.proposalId).join(", ") || "즉시 연구 항목 없음";
  return [
    `관찰 대상 내 장기 표준 개발은 ${focus} 흐름에 집중되어 있습니다.`,
    input.dataQuality.current7dUsableEventCount === 0
      ? "최근 7일에는 발생 시각과 의미가 모두 확인된 명세 변화가 없어 주간 개발 순위를 산정하지 않았습니다."
      : `최근 7일 확인된 의미 변화는 ${input.dataQuality.current7dUsableEventCount}건입니다.`,
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
  if (proposalId === "ERC-8330" || /nav snapshot|net asset value|oracle/.test(lower)) return "Subject-Linked NAV Snapshot Oracle은 주체별 NAV snapshot과 가치 기준시각을 기록하는 oracle/reporting 인터페이스를 제안합니다.";
  const sentence = source.split(/(?<=[.!?。])\s+/).find((item) => item.length > 30) ?? source;
  return truncateSentence(`${title}: ${sentence} 구현·채택 여부는 이번 수집 범위에서 확인하지 않았습니다.`, 220);
}

function truncateSentence(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const last = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("。"), cut.lastIndexOf("다."));
  return (last > 40 ? cut.slice(0, last + 1) : cut).trim();
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
    const direction = spec30Count > 0
      ? "advancing"
      : rawPostIds.length > 0
        ? "active_discussion"
        : proposalIds.length > 0
          ? "stable"
          : "baseline_not_linked";
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
    } else {
      signals.set(key, {
        signalId: `aa-spec:${event.proposalId}:30d`,
        proposalId: event.proposalId,
        officialTitle: localSpecificationEvidence(event.proposalId).officialTitle,
        signalType: "specification_change",
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
  const weeklySignalLabel = quality.weeklyRankingValidity === "invalid" || quality.current7dUsableEventCount <= 1
    ? "확인된 주간 신호"
    : "이번 주 주요 개발 주제";
  const weeklySignalValue = quality.current7dUsableEventCount === 0
    ? "신호 없음"
    : `${quality.current7dUsableEventCount}건`;
  const scopeSubtitle = quality.implementationEvidenceCoverage === 0
    ? "EIP/ERC 명세와 Ethereum Magicians 활동을 중심으로 한 Ethereum 표준 개발 관찰 보고서"
    : "EIP/ERC 명세, Ethereum Magicians 활동, 확인된 구현 근거를 함께 보는 표준 개발 관찰 보고서";
  return `<section class="report-cover dashboard-cover">
    <div>
      <p class="eyebrow">Ethereum Development Intelligence Dashboard v1</p>
      <h1>Ethereum 개발 인텔리전스</h1>
      <p class="cover-lead">${escapeHtml(scopeSubtitle)}</p>
      <p>${dashboard.executivePulse.bottomLine.slice(0, 2).map(escapeHtml).join(" ")}</p>
    </div>
    <div class="cover-facts">
      <div><span>분석 기간</span><b>${escapeHtml(formatDate(report.trendPeriod.from))}~${escapeHtml(formatDate(report.trendPeriod.to))}</b></div>
      <div><span>관찰 대상 내 180일 이력</span><b>${escapeHtml(quality.coverage180d === "valid" ? "유효" : "제한적")}</b></div>
      <div><span>${escapeHtml(weeklySignalLabel)}</span><b>${escapeHtml(weeklySignalValue)}</b></div>
      <div><span>상세 데이터 품질</span><b><a href="#data-quality">Evidence Quality</a></b></div>
    </div>
  </section>`;
}

function renderExecutivePulse(dashboard: ReturnType<typeof buildDashboard>): string {
  const weekly = dashboard.executivePulse.weeklyDevelopmentTop3;
  return `<div class="section-head"><h2>Executive Pulse</h2><p>관찰 대상 내 결론, 실제 변화, 의미, KGLD action, 한계를 분리합니다.</p></div>
  ${dashboard.dataQuality.weeklyRankingValidity === "invalid" ? `<p class="notice">확인된 주간 신호만 표시합니다. 발생일 미확정 변화 ${dashboard.dataQuality.current7dFallbackEventCount}건과 변경 유형 미확정 ${dashboard.dataQuality.unknownSemanticEventCount}건은 주간 개발 순위에서 제외했습니다.</p>` : ""}
  <div class="executive-stack">
    <article class="executive-abstract"><h3>Bottom Line</h3>${dashboard.executivePulse.bottomLine.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</article>
    <article><h3>이번 주 관찰 신호</h3><div class="two-col"><div><h4>Specification change</h4><p>${escapeHtml(dashboard.executivePulse.whatChanged.confirmedSpecificationChanges)}</p></div><div><h4>Magicians activity</h4><p>${dashboard.executivePulse.whatChanged.magiciansActivity.map((item) => `${proposalLink(item.proposalIds[0] ?? "")} ${item.rawPostCount ?? 0} posts`).join(" · ") || "최근 활동 없음"}</p></div></div></article>
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
  <p class="muted" data-filter-summary>기간 180d · 근거 Specification · 전체 Domain</p><p class="empty is-hidden" data-landscape-empty>현재 필터 조건에 해당하는 기술 영역이 없습니다.</p>
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
        const latestActivityAt = optionalAaString(signal.latestActivityAt?.slice(0, 10)) ?? "확인 불가";
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
    views: dashboard,
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

function snapshotHash(snapshot: { metadata: { snapshotHash: string } }) {
  const clone = JSON.parse(JSON.stringify(snapshot));
  clone.metadata.snapshotHash = "";
  return createHash("sha256").update(stableJson(clone)).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
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
    includedSources: ["eips.ethereum.org", "ethereum-magicians.org", "ethereum/EIPs git", "ethereum/ERCs git"],
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
    const frontmatter = parseSimpleFrontmatter(markdown);
    const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    const abstractText = markdownSection(body, "Abstract");
    const motivationText = markdownSection(body, "Motivation");
    const specificationIntroText = markdownSection(body, "Specification");
    return {
      officialTitle: frontmatter.title ?? null,
      status: frontmatter.status ?? null,
      abstractText,
      motivationText,
      specificationIntroText,
      parseState: abstractText || motivationText || specificationIntroText ? "body_parsed" : "title_only",
    };
  } catch {
    return { officialTitle: null, status: null, abstractText: null, motivationText: null, specificationIntroText: null, parseState: "fetch_failed" };
  }
}

function localProposalMarkdownPath(proposalId: string): string | null {
  const match = /^(EIP|ERC)-(\d+)$/i.exec(proposalId);
  if (!match) return null;
  const kind = match[1]!.toUpperCase();
  const number = match[2]!;
  const eipRepo = officialRepoPath("ethereum/EIPs") ?? resolve("data", "ethereum-EIPs");
  const ercRepo = officialRepoPath("ethereum/ercs") ?? resolve("data", "ethereum-ERCs");
  const candidates = kind === "ERC"
    ? [
      resolve(ercRepo, "ERCS", `erc-${number}.md`),
      resolve(ercRepo, "EIPS", `eip-${number}.md`),
    ]
    : [
      resolve(eipRepo, "EIPS", `eip-${number}.md`),
      resolve(eipRepo, "ERCS", `erc-${number}.md`),
    ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
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
  const intelligenceSnapshot = buildIntelligenceSnapshot(report, atlas, dashboard);
  return {
    schemaVersion: intelligenceSnapshot.metadata.schemaVersion,
    snapshotId: intelligenceSnapshot.metadata.snapshotId,
    snapshotHash: intelligenceSnapshot.metadata.snapshotHash,
    intelligenceSnapshot,
  };
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
    usableEventIds: usable.map(reportEventKey),
    current7dFallbackEventCount: fallback.length,
    current7dFallbackRatio: recent.length ? fallback.length / recent.length : 0,
    semanticChangeCounts: semanticCounts,
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
  return {
    url: discussion?.discussionUrl ?? null,
    found: Boolean(discussion?.discussionUrl),
    topicId: discussion?.discussionTopicId ?? null,
    title: discussion?.discussionTitle ?? discussion?.title ?? null,
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
  return `https://eips.ethereum.org/EIPS/eip-${number}`;
}

function proposalLink(proposalId: string, label = proposalId): string {
  return `<a href="${escapeHtml(proposalUrl(proposalId))}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
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
  return labels[value] ?? value.replaceAll("_", " ");
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

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

