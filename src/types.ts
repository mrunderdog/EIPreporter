export type SourceRepo = "ethereum/EIPs" | "ethereum/ercs";

export type ProposalKind = "EIP" | "ERC";

export type ProposalRecord = {
  proposalId: string;
  kind: ProposalKind;
  number: number;
  title: string | null;
  status: string | null;
  proposalType: string | null;
  category: string | null;
  created: string | null;
  updated: string | null;
  discussionTo: string | null;
  discussionUrl?: string | null;
  discussionLinks?: string[];
  discussionSignal?: DiscussionSignal;
  description?: string | null;
  bodyExcerpt?: string | null;
  keywords?: string[];
  sourceRepo: SourceRepo;
  sourcePath: string;
  canonicalUrl: string;
  rawContentHash: string;
};

export type DiscussionSignal = {
  hasDiscussion: boolean;
  discussionUrl: string | null;
  discussionLinks: string[];
  discussionScore: number | null;
  discussionSummary: string | null;
  discussionEvidence: string | null;
};

export type DiffIntelligence = {
  changedFiles: string[];
  changedSections: string[] | null;
  diffSummary: string;
  diffEvidence: string;
};

export type SnapshotInfo = {
  id: number;
  collectedAt: string;
  proposalCount: number;
};

export type ChangeType =
  | "new_proposal"
  | "status_change"
  | "final_transition"
  | "withdrawn_transition"
  | "content_hash_change";

export type ProposalChange = {
  type: ChangeType;
  proposalId: string;
  previousStatus: string | null;
  currentStatus: string | null;
  previousHash: string | null;
  currentHash: string | null;
  title: string | null;
  sourceRepo: SourceRepo;
  sourcePath: string;
  canonicalUrl: string;
  changedFiles?: string[];
  changedSections?: string[] | null;
  diffSummary?: string | null;
  diffEvidence?: string | null;
};

export type ChangeEvent = ProposalChange & {
  id: number;
  snapshotId: number;
  previousSnapshotId: number;
  detectedAt: string;
  occurredAt?: string;
  occurredAtSource?: "git_commit" | "proposal_created_metadata" | "magicians_post" | "snapshot_updated" | "fallback_detected_at";
  timestampConfidence?: "high" | "medium" | "low";
  changeSemanticType?:
    | "normative_specification"
    | "rationale_or_motivation"
    | "security_consideration"
    | "interface_or_api"
    | "test_vector"
    | "metadata_status"
    | "metadata_other"
    | "editorial_text"
    | "formatting_only"
    | "link_only"
    | "unknown";
  timestampRecovery?: {
    attempted: boolean;
    recovered: boolean;
    recoveredOccurredAt?: string;
    recoveredSource?: string;
    matchedCommitSha?: string;
    confidence?: "high" | "medium" | "low";
  };
};

export type IntelligenceEventType =
  | "NEW_PROPOSAL"
  | "STATUS_CHANGED"
  | "SPEC_TEXT_CHANGED"
  | "NORMATIVE_CHANGE"
  | "SECURITY_CHANGE"
  | "COMPATIBILITY_CHANGE"
  | "DISCUSSION_STARTED"
  | "DISCUSSION_RESUMED"
  | "DISCUSSION_ACCELERATED"
  | "AUTHOR_RESPONSE"
  | "EDITOR_FEEDBACK"
  | "CLIENT_ISSUE_OPENED"
  | "CLIENT_PR_OPENED"
  | "CLIENT_PR_MERGED"
  | "CLIENT_COMMIT_ADDED"
  | "IMPLEMENTATION_REJECTED"
  | "IMPLEMENTATION_BLOCKED"
  | "RELEASED"
  | "DEVNET_INCLUDED"
  | "TESTNET_INCLUDED"
  | "FORK_CANDIDATE"
  | "FORK_INCLUDED"
  | "ACTIVATION_SCHEDULED"
  | "ACTIVATED"
  | "WALLET_ADOPTION"
  | "INFRASTRUCTURE_ADOPTION"
  | "ACCOUNT_ABSTRACTION_SIGNAL"
  | "KGLD_RELEVANCE_CHANGED"
  | "DEPRIORITIZED"
  | "STALLED"
  | "NO_MEANINGFUL_CHANGE";

export type IntelligencePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "WATCH" | "ARCHIVE";

export type DecisionState =
  | "ACTION_REQUIRED"
  | "TECHNICAL_REVIEW"
  | "PRIORITY_WATCH"
  | "MONITOR"
  | "BACKGROUND"
  | "INSUFFICIENT_EVIDENCE";

export type ConfidenceMetrics = {
  collectionConfidence: number;
  evidenceConfidence: number;
  signalStrength: number;
};

export type EvidenceClaimType =
  | "ACTIVITY"
  | "SPECIFICATION_STATUS"
  | "IMPLEMENTATION"
  | "RELEASE"
  | "NETWORK_ACTIVATION"
  | "PRODUCTION_ADOPTION"
  | "KGLD_RELEVANCE";

export type IntelligenceEvent = {
  entity: string;
  eventType: IntelligenceEventType;
  previousState?: string | null;
  currentState?: string | null;
  eventDate: string;
  source: string;
  evidence: string;
  significance: number;
  confidence: number;
  affectedThemes: string[];
  possibleFollowUp: string;
  meaningful: boolean;
  scoreBreakdown: ScoreBreakdownItem[];
};

export type IntelligenceTopStory = {
  priority: IntelligencePriority;
  decisionState?: DecisionState;
  headline: string;
  conclusion: string;
  whatChanged: string;
  whyItMatters: string;
  evidence: string[];
  maturity: string;
  affectedSystems: string[];
  followUpTrigger: string;
  confidence: number;
  confidenceMetrics?: ConfidenceMetrics;
  relatedProposals: string[];
  score: number;
  scoreBreakdown: ScoreBreakdownItem[];
};

export type ThemeDirection = "accelerating" | "emerging" | "stable" | "slowing" | "stalled" | "insufficient evidence";

export type ThemeIntelligenceSignal = {
  theme: string;
  direction: ThemeDirection;
  reason: string;
  reasoning?: string;
  newProposals: number;
  materialChanges: number;
  implementationActivity: number;
  discussionActivity: number;
  recentShare?: number;
  baselineShare?: number;
  maturityChange: number;
  independentActors: number;
  confidence: number;
  topEvidence: string[];
};

export type AccountAbstractionIntelligence = {
  meaningful: boolean;
  conclusion: string;
  subdomains: string[];
  assumptionChange: string;
  implementationStatus: string;
  walletImplication: string;
  followUp: FollowUpItem[];
  evidence: string[];
};

export type KgldCausalAssessment = {
  proposalId?: string;
  signal: string;
  relevance: "direct" | "indirect" | "speculative" | "none";
  proposalFunction?: string;
  changedTechnicalAssumption?: string;
  affectedComponent: string;
  currentKgldDependency?: "USED" | "PLANNED" | "NOT_USED" | "UNKNOWN";
  potentialBenefit?: string;
  potentialRisk?: string;
  causalPath: string;
  currentMaturity: string;
  timeHorizon: "immediate" | "medium-term" | "speculative" | "irrelevant";
  requiredResponse: string;
  recommendedAction?: "IGNORE" | "MONITOR" | "REVIEW" | "TECHNICAL_ASSESSMENT" | "POC" | "ADOPT";
  followUpTrigger: string;
  evidenceIds?: string[];
  evidenceConfidence?: number;
  evidence: string[];
  confidence: number;
};

export type FollowUpOwner =
  | "protocol research"
  | "smart-contract development"
  | "wallet or custody"
  | "security"
  | "operations"
  | "product"
  | "compliance"
  | "no owner yet";

export type FollowUpItem = {
  target: string;
  currentState: string;
  nextTrigger: string;
  rationale?: string;
  sourceToMonitor: string;
  owner: FollowUpOwner;
  recommendedResponse: string;
  urgency: IntelligencePriority;
  expectedReviewHorizon: string;
};

export type IntelligenceLayer = {
  mode: "normal" | "partial" | "incident";
  events: IntelligenceEvent[];
  topStories: IntelligenceTopStory[];
  themeSignals: ThemeIntelligenceSignal[];
  accountAbstraction: AccountAbstractionIntelligence;
  kgldAssessments: KgldCausalAssessment[];
  followUpQueue: FollowUpItem[];
  meaningfulChangeCount: number;
  quietWeek: boolean;
  generatedBy: "deterministic_signal_engine";
};

export type ChangeSummary = Record<ChangeType, number>;

export type CountByLabel = Record<string, number>;

export type KgldRecommendedAction = "ignore" | "monitor" | "review" | "poc";

export type KgldCandidate = {
  proposalId: string;
  title: string | null;
  status: string | null;
  sourceRepo: SourceRepo;
  canonicalUrl: string;
  matchedKeywords: string[];
  matchedThemes: string[];
  relevanceScore: number;
  oneLineSummary: string;
  whyRelevantToKGLD: string;
  potentialUseCases: KgldPotentialUseCase[];
  businessImpact: number;
  implementationEffort: number;
  urgency: number;
  recommendedAction: KgldRecommendedAction;
  reasonCodes: string[];
};

export type KgldPotentialUseCase =
  | "KGLD Wallet UX"
  | "KGLD Token / Issue / Redeem"
  | "DeFi"
  | "Compliance / Security";

export type ThemeName =
  | "Account Abstraction"
  | "Wallet UX"
  | "Smart Account"
  | "Gasless / Paymaster"
  | "Session Key / Delegation"
  | "Passkey / WebAuthn"
  | "Token Standard"
  | "DeFi / Vault"
  | "Oracle / Pricing"
  | "RWA / Attestation"
  | "Identity / Credential"
  | "Compliance / Restricted Transfer"
  | "Cross-chain / Bridge"
  | "Signature / Security"
  | "Transaction Model / Execution"
  | "EVM / Gas / Opcode"
  | "Rollup / L2"
  | "Data Availability"
  | "NFT / Gaming"
  | "Governance / Process"
  | "Network Upgrade / Governance"
  | "Block / Validator Operations";

export type ProposalThemeAnalysis = {
  proposal: ProposalRecord;
  themes: ThemeName[];
  subTrendsByTheme: Partial<Record<ThemeName, string[]>>;
  oneLineSummary: string;
};

export type DominantSubTrend = {
  name: string;
  count: number;
  description: string;
};

export type RepresentativeProposal = {
  id: string;
  title: string;
  status: string;
  oneLineSummary: string;
  canonicalUrl: string;
};

export type ThemeInsight = {
  theme: ThemeName;
  proposalCount: number;
  proposalCount180d: number;
  recentChangeCount: number;
  recentChangeCount7d: number;
  discussionProposalCount: number;
  contentChangeCount: number;
  maturitySignal: "low" | "medium" | "high";
  momentumScore: number;
  dominantSubTrends: DominantSubTrend[];
  representativeProposals: RepresentativeProposal[];
  trendInterpretation: string;
  interpretation: string;
};

export type AccountAbstractionRadar = {
  proposalCount: number;
  subTrendDistribution: CountByLabel;
  representativeProposals: RepresentativeProposal[];
  trendInterpretation: string;
  kgldWalletUxInterpretation: string;
};

export type ChartSeries = {
  labels: string[];
  data: number[];
};

export type OpportunityMatrixPoint = {
  x: number;
  y: number;
  r: number;
  proposalId: string;
  score: number;
  action: KgldRecommendedAction;
};

export type TopOpportunityChartItem = {
  proposalId: string;
  title: string | null;
  score: number;
  recommendedAction: KgldRecommendedAction;
};

export type WeeklyChartData = {
  statusDistribution: ChartSeries;
  developerMomentumScores: ChartSeries;
  weeklyEventTypeDistribution: ChartSeries;
  themeDistribution180d: ChartSeries;
  subTrendDistributionByTheme: Record<string, ChartSeries>;
  accountAbstractionSubTrendDistribution: ChartSeries;
  kgldOpportunityMatrix: OpportunityMatrixPoint[];
  kgldRecommendedActionDistribution: ChartSeries;
  topOpportunities: TopOpportunityChartItem[];
};

export type WeeklyRadarReport = {
  generatedAt: string;
  vitalikBlog?: import("./sources/vitalik-blog.ts").VitalikBlogSourceResult | import("./sources/vitalik-blog.ts").VitalikBlogView;
  trendPeriod: {
    from: string;
    to: string;
    days: number;
  };
  changePeriod: {
    from: string;
    to: string;
    days: number;
  };
  ethereumTechRadar: {
    latestSnapshot: SnapshotInfo;
    totalProposals: number;
    proposalsByRepo: CountByLabel;
    proposalsByStatus: CountByLabel;
    proposalsByType: CountByLabel;
    proposalsByCategory: CountByLabel;
    trendProposalCount: number;
    themeInsights: ThemeInsight[];
    accountAbstractionRadar: AccountAbstractionRadar;
    recentChanges: {
      total: number;
      byEventType: ChangeSummary;
      finalTransitions: ChangeEvent[];
      withdrawnTransitions: ChangeEvent[];
      statusChanges: ChangeEvent[];
      newProposals: ChangeEvent[];
      contentHashChanges: ChangeEvent[];
    };
    trendChanges?: {
      total: number;
      byEventType: ChangeSummary;
      finalTransitions: ChangeEvent[];
      withdrawnTransitions: ChangeEvent[];
      statusChanges: ChangeEvent[];
      newProposals: ChangeEvent[];
      contentHashChanges: ChangeEvent[];
    };
    historicalInputDiagnostics?: HistoricalInputDiagnostics;
    previousChanges?: {
      total: number;
      byEventType: ChangeSummary;
      finalTransitions: ChangeEvent[];
      withdrawnTransitions: ChangeEvent[];
      statusChanges: ChangeEvent[];
      newProposals: ChangeEvent[];
      contentHashChanges: ChangeEvent[];
    };
    signalLayer: {
      discussionHeat: DiscussionHeatItem[];
      diffIntelligence: DiffIntelligenceItem[];
    };
    narrativeLayer: NarrativeLayer;
    watchlistLayer?: WatchlistLayer;
    adoptionLayer?: AdoptionLayer;
    intelligenceLayer?: IntelligenceLayer;
    topicClusterLayer?: import("./topic-cluster.ts").TopicClusterLayer;
    knowledgeGraphLayer?: import("./knowledge-graph.ts").KnowledgeGraphLayer;
    ecosystemStateLayer?: import("./ecosystem-state.ts").EcosystemStateLayer;
    technologyPlatformLayer?: TechnologyPlatformLayer;
  };
  kgldOpportunityRadar: {
    method: "rule-based-scoring";
    candidates: KgldCandidate[];
  };
  chartData: WeeklyChartData;
};

export type HistoricalInputDiagnostics = {
  inputEventCount: number;
  earliestEventAt: string | null;
  latestEventAt: string | null;
  eventsWithTimestamp: number;
  eventsWithoutTimestamp: number;
  eventsCurrent7d: number;
  eventsCurrent180d: number;
  uniqueEventDates: number;
  uniqueWeeks: number;
  sourceTablesOrFiles: string[];
  timestampFieldUsed: string;
  trendAndCurrentUseSameEvents: boolean;
  validHistoricalCoverage: boolean;
  failureCode?: "INSUFFICIENT_HISTORICAL_WINDOW" | "WINDOW_FILTER_REGRESSION";
  gitBackfillAttempted?: boolean;
  gitBackfillEventCount?: number;
  gitBackfillFetchFailures?: number;
  gitBackfillParseFailures?: number;
  historicalBackfillSource?: string;
  eventsByOccurredAtSource?: Record<string, number>;
  fallbackDetectedAtCount?: number;
  fallbackDetectedAtRatio?: number;
  medianDetectionLagHours?: number;
  maxDetectionLagHours?: number;
  eventsDetectedThisWeekButOccurredEarlier?: number;
  affectedProposalIds?: string[];
  gitBackfillDiagnostics?: {
    sourceMode?: "local_git" | "github_api";
    localHistoryRequested?: number;
    localHistorySucceeded?: number;
    localHistoryFailed?: number;
    apiHistoryRequested?: number;
    apiHistorySucceeded?: number;
    apiHistoryFailed?: number;
    pathCaseFailures?: number;
    shallowRepositoryDetected?: number;
    requestedTargets: number;
    successfulTargets: number;
    failedTargets: number;
    successRate: number;
    failedProposalIds: string[];
    failureCodes: string[];
    retryCount: number;
    rateLimitedCount: number;
    notFoundCount: number;
  };
  currentWindowConcentration?: {
    share: number;
    warning?: "CURRENT_WINDOW_CONCENTRATION_HIGH";
    current7dEventsBySource: Record<string, number>;
    current7dEventsByType: Record<string, number>;
    current7dEventsByOccurredAtSource: Record<string, number>;
    uniqueProposalCount: number;
    maxEventsPerProposal: number;
    duplicateCandidateCount: number;
    detectedThisWeekButOccurredEarlier: number;
  };
  timestampQuality?: {
    overallFallbackCount: number;
    overallFallbackRatio: number;
    current7dFallbackCount: number;
    current7dFallbackRatio: number;
    previous7dFallbackCount: number;
    previous7dFallbackRatio: number;
    baseline8wFallbackRatioByWeek: number[];
    weeklyRankingValidity: "reliable" | "acceptable" | "degraded" | "invalid";
  };
  duplicateDiagnostics?: {
    rawEventCount: number;
    deduplicatedEventCount: number;
    duplicateRemovedCount: number;
    duplicateEventIds: string[];
  };
};

export type WatchlistLayer = {
  items: WatchlistItem[];
  generatedBy: "deterministic" | "ai" | "fallback";
};

export type WatchlistItem = {
  title: string;
  theme: string;
  relatedProposals: string[];
  signalType: "discussion_heat" | "theme_momentum" | "cluster_momentum" | "diff_followup" | "business_relevance";
  possibleNextMovement: string;
  confidence: "High" | "Medium" | "Low";
  confidenceScore: number;
  adoptionSignalLevel?: AdoptionEvidenceLevel;
  previousConfidenceScore?: number;
  previousActivityScore?: number;
  changeSinceLastReport?: "Up" | "Down" | "Flat" | "New" | "Unknown";
  evidence: string[];
  monitorNext: string[];
  businessRelevance?: {
    area: "Wallet" | "Exchange" | "RWA / Compliance" | "KGLD" | "Protocol" | "Other";
    note: string;
  };
};

export type AdoptionLayer = {
  items: AdoptionEvidenceItem[];
  generatedBy: "deterministic" | "github_search" | "fallback";
  collectionStatus?: "collected" | "skipped" | "failed" | "fallback";
  note?: string;
  sourceDiagnostics?: SourceCollectionDiagnostic[];
  evidenceSummary?: EvidenceTaxonomySummary;
};

export type AdoptionEvidenceLevel = "None" | "Mention" | "Reference" | "Implementation" | "Unknown";

export type AdoptionEvidenceItem = {
  proposalId: string;
  title: string;
  theme: string;
  evidenceLevel: AdoptionEvidenceLevel;
  evidenceScore: number;
  sources: AdoptionEvidenceSource[];
  rawResultCount?: number;
  acceptedSourceCount?: number;
  retainedSourceCount?: number;
  renderedSourceCount?: number;
  directSourceCount?: number;
  clusterSourceCount?: number;
  summary: string;
  caution: string;
};

export type AdoptionSourceRelationship = "direct" | "cluster_related" | "incidental";

export type AdoptionSemanticSourceType =
  | "implementation_tracker"
  | "client_implementation_pr"
  | "client_code_reference"
  | "protocol_spec_reference"
  | "core_developer_coordination"
  | "canonical_status_change"
  | "canonical_document_change"
  | "cluster_reference"
  | "incidental_mention";

export type AdoptionEvidenceSource = {
  sourceType: "github_repo" | "github_issue" | "github_pr" | "documentation" | "release_note" | "code_reference" | "unknown";
  semanticType?: AdoptionSemanticSourceType;
  relationship?: AdoptionSourceRelationship;
  repo?: string;
  title?: string;
  url?: string;
  matchedTerm?: string;
  observedAt?: string;
  updatedAt?: string;
  state?: "open" | "closed" | "merged" | "unknown";
  path?: string;
  evidenceKind?: "mention" | "reference" | "implementation";
  confidence?: "Low" | "Medium" | "High";
  evidenceId?: string;
  freshness?: FreshnessMetadata;
  evidenceType?: EvidenceType;
  sourceAuthority?: "canonical" | "client" | "discussion" | "release" | "business" | "derived";
  directlySupportedClaim?: string;
  confidenceContribution?: number;
};

export type EvidenceType =
  | "specification"
  | "change"
  | "discussion"
  | "implementation"
  | "release"
  | "activation"
  | "adoption"
  | "business"
  | "derived";

export type EvidenceTaxonomySummary = Record<EvidenceType, number>;

export type SourceCollectionDiagnostic = {
  sourceName: string;
  sourceType: "github_search" | "github_api" | "cache" | "local_snapshot" | "derived";
  requestAttempted: boolean;
  requestUrl?: string;
  requestQuery?: string;
  result: "success" | "partial_failure" | "failure" | "skipped" | "empty" | "cache_hit" | "stale_cache";
  httpStatus?: number;
  failureReason?: string;
  retryCount: number;
  cachedDataAvailable: boolean;
  lastSuccessfulCollectionAt?: string;
  recordCountCollected: number;
  freshness?: FreshnessMetadata;
};

export type InformationValueClass = "actionable" | "informative" | "redundant" | "empty" | "low-confidence";

export type ScoreBreakdownItem = {
  label: string;
  value: number;
  reason: string;
  evidenceIds?: string[];
};

export type FreshnessMetadata = {
  collectedAt?: string;
  sourceUpdatedAt?: string;
  ageDays?: number;
  cacheAgeDays?: number;
  stale: boolean;
};

export type TraceabilityMetadata = {
  evidenceIds: string[];
  derivedFrom: string[];
  calculationVersion: string;
  ruleVersion: string;
};

export type DataCompletenessStatus = "complete" | "mostly_complete" | "partial" | "degraded" | "unavailable";

export type DataCompleteness = {
  status: DataCompletenessStatus;
  requiredSourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  cacheHits: number;
  staleCacheUse: number;
  partialCollection: boolean;
  missingFields: string[];
  enrichmentSkipped: string[];
  rateLimitDegradation: boolean;
  explanation: string;
  diagnostics?: SourceCollectionDiagnostic[];
  collectionCompleteness?: number;
  evidenceStrength?: number;
  editorialConfidence?: number;
  confidenceMetrics?: ConfidenceMetrics;
  evidenceMetrics?: EvidenceMetrics;
};

export type EvidenceMetrics = {
  rawCandidates: number;
  matchedSources: number;
  acceptedEvidence: number;
  displayedEvidence: number;
  uniqueDirectEvidence: number;
  uniqueClusterReferences: number;
  proposalEvidenceRelations?: number;
  failedSources: number;
  categoryMetrics?: EvidenceCategoryMetrics;
};

export type EvidenceCategoryMetrics = {
  specificationEvidence: number;
  discussionEvidence: number;
  implementationTrackingEvidence: number;
  implementationCandidateEvidence: number;
  verifiedImplementationEvidence: number;
  releaseEvidence: number;
  activationEvidence: number;
  adoptionEvidence: number;
};

export type SectionVisibilityDecision = {
  section: string;
  classification: InformationValueClass;
  visible: boolean;
  reason: string;
};

export type NarrativeLayer = {
  weeklyNarrative: string[];
  topStories: TechnologyStory[];
  signalEvidence: NarrativeEvidence;
  generatedBy: "deterministic" | "ai" | "fallback";
};

export type TechnologyStory = {
  storyTitle: string;
  primaryTheme: string;
  relatedProposals: string[];
  evidence: string[];
  interpretation: string;
  watchNext: string;
};

export type NarrativeEvidence = {
  topMomentumThemes: Array<{ theme: string; score: number }>;
  topDiscussions: Array<{
    proposalId: string;
    title: string;
    activityScore?: number;
    activityLevel?: string;
    theme?: string;
    replies?: number;
    participants?: number;
    lastActivityAt?: string;
  }>;
  recentChangeCount: number;
  contentDiffCount: number;
};

export type DiscussionHeatItem = {
  proposalId: string;
  title: string | null;
  status?: string | null;
  theme: ThemeName | "Unclassified";
  discussionUrl: string | null;
  discussionLinks: string[];
  discussionScore: number | null;
  discussionTopicId?: number;
  discussionTitle?: string;
  discussionSource?: string;
  discussionCreatedAt?: string;
  discussionLastActivityAt?: string;
  discussionReplyCount?: number;
  discussionParticipantCount?: number;
  discussionViewCount?: number;
  discussionTags?: string[];
  discussionFreshnessDays?: number;
  discussionActivityScore?: number;
  discussionCollectionStatus?: DiscussionCollectionStatus;
  discussionFetchAttempted?: boolean;
  discussionDiscovery?: DiscussionDiscovery;
  postTimestampTrace?: string[];
  postsCollectedCount?: number;
  totalPostIds?: number[];
  fetchedPostIds?: number[];
  missingPostIds?: number[];
  postsExpectedCount?: number;
  paginationComplete?: boolean;
  latestCollectedPostAt?: string;
  postsInCurrent7d?: number;
  postsInPrevious7d?: number;
  participantCountCurrent7d?: number;
  authorParticipatedCurrent7d?: boolean;
  latestPostAuthors?: string[];
  keyIssues?: string[];
  objections?: string[];
  alternatives?: string[];
  unresolvedQuestions?: string[];
  specChangeReferences?: string[];
  discussionAnalysis?: DiscussionAnalysis;
  discussionSummaryFallback?: string;
  activityLevel?: "High" | "Medium" | "Low" | "Unknown";
  error?: string;
  whyItMatters: string;
  canonicalUrl: string;
};

export type DiscussionCollectionStatus =
  | "not_searched"
  | "url_not_found"
  | "url_confirmed"
  | "fetch_failed"
  | "parse_failed"
  | "posts_partially_collected"
  | "posts_fully_collected";

export type DiscussionAnalysis = {
  analysisAttempted: boolean;
  analysisCompleted: boolean;
  analyzedPostCount: number;
  contentAvailable: boolean;
  keyIssues: DiscussionAnalysisItem[];
  objections: DiscussionAnalysisItem[];
  alternatives: DiscussionAnalysisItem[];
  unresolvedQuestions: DiscussionAnalysisItem[];
  proposalAuthorResponses: DiscussionAnalysisItem[];
  specificationReferences: DiscussionAnalysisItem[];
};

export type DiscussionAnalysisItem = {
  text: string;
  sourcePostIds: number[];
  sourceUsernames: string[];
  sourceDates: string[];
  evidenceUrl?: string;
};

export type DiscussionDiscovery = {
  searchAttempted: boolean;
  discoveryCompleted?: boolean;
  methodsTried: Array<
    | "frontmatter_discussions_to"
    | "eips_page_link"
    | "existing_database"
    | "magicians_search"
  >;
  matchedBy?: "frontmatter_discussions_to" | "eips_page_link" | "existing_database" | "magicians_search";
  candidateUrls: string[];
  result: DiscussionCollectionStatus | "discovery_not_run" | "discovery_completed_not_found" | "discovery_ambiguous";
};

export type DiscussionActivity = {
  proposalId: string;
  proposalTitle: string | null;
  theme?: ThemeName | "Unclassified";
  discussionUrl: string;
  discussionSource?: string;
  discussionTitle?: string;
  createdAt?: string;
  lastActivityAt?: string;
  replyCount?: number;
  participantCount?: number;
  viewCount?: number;
  tags?: string[];
  freshnessDays?: number;
  activityScore: number;
  activityLevel: "High" | "Medium" | "Low" | "Unknown";
  whyItMatters: string;
  error?: string;
};

export type DiffIntelligenceItem = {
  proposalId: string;
  title: string | null;
  changedFiles: string[];
  changedSections: string[] | null;
  diffSummary: string;
  diffEvidence: string;
  canonicalUrl: string;
};

export type LifecycleStageName =
  | "Discussion"
  | "Draft"
  | "Review"
  | "Last Call"
  | "Final"
  | "Implementation Tracking"
  | "Implementation Candidate"
  | "Verified Implementation"
  | "Released"
  | "Activated"
  | "Production Adoption";

export type LifecycleStageState = "completed" | "current" | "future";

export type LifecycleStageEvidence = {
  label: string;
  url?: string;
  sourceType?: string;
  evidenceId?: string;
  freshness?: FreshnessMetadata;
};

export type LifecycleStage = {
  name: LifecycleStageName;
  state: LifecycleStageState;
  confidence: number;
  evidence: LifecycleStageEvidence[];
  timestamp?: string;
  sourceLinks: string[];
  limitations: string[];
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
  freshness?: FreshnessMetadata;
};

export type LifecycleTimeline = {
  proposalId: string;
  title: string;
  theme: string;
  currentStage: LifecycleStageName;
  stages: LifecycleStage[];
  traceability: TraceabilityMetadata;
};

export type SpecificationStatus = "DRAFT" | "REVIEW" | "LAST_CALL" | "FINAL" | "LIVING" | "STAGNANT" | "WITHDRAWN" | "UNKNOWN";
export type ImplementationAxisStatus = "NONE_COLLECTED" | "TRACKING" | "CANDIDATE" | "VERIFIED" | "RELEASED";
export type NetworkStatus = "NOT_SCHEDULED" | "FORK_CANDIDATE" | "SCHEDULED" | "ACTIVATED" | "NOT_APPLICABLE" | "UNKNOWN";
export type AdoptionStatus = "NONE_COLLECTED" | "EXPERIMENTAL" | "PRODUCTION" | "UNKNOWN";

export type LifecycleAxis = {
  proposalId: string;
  axis: "Specification" | "Implementation" | "Network" | "Adoption";
  status: SpecificationStatus | ImplementationAxisStatus | NetworkStatus | AdoptionStatus;
  evidenceCount: number;
  strongestEvidence?: string;
  updatedAt?: string;
  limitations: string[];
};

export type ClientName =
  | "go-ethereum"
  | "Nethermind"
  | "Besu"
  | "Erigon"
  | "EthereumJS"
  | "Lighthouse"
  | "Prysm"
  | "Teku"
  | "Nimbus"
  | "Lodestar";

export type ClientFamily = "execution" | "consensus";
export type ClientImplementationStatus = "No evidence" | "Tracking" | "Candidate" | "Verified" | "Released" | "Activated";

export type ClientCoverageCell = {
  client: ClientName;
  family: ClientFamily;
  status: ClientImplementationStatus;
  confidence: number;
  evidence: LifecycleStageEvidence[];
  limitations: string[];
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
};

export type ClientCoverageMatrix = {
  proposalId: string;
  clients: ClientCoverageCell[];
};

export type ReleaseStatus = "No release" | "Release Candidate" | "Released" | "Activated";

export type ReleaseIntelligence = {
  proposalId: string;
  status: ReleaseStatus;
  confidence: number;
  evidence: LifecycleStageEvidence[];
  limitations: string[];
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
};

export type DeploymentStatus = "No evidence" | "Testnet activation" | "Mainnet activation" | "Default enabled" | "Production";

export type DeploymentIntelligence = {
  proposalId: string;
  status: DeploymentStatus;
  confidence: number;
  evidence: LifecycleStageEvidence[];
  limitations: string[];
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
};

export type EvidenceGraphNodeType = "EIP" | "Issue" | "PR" | "Commit" | "Release" | "Client" | "Spec" | "Discussion" | "Meeting";
export type EvidenceGraphEdgeType = "references" | "implements" | "tracks" | "supersedes" | "discusses" | "releases" | "activates";

export type EvidenceGraphNode = {
  id: string;
  type: EvidenceGraphNodeType;
  label: string;
  url?: string;
};

export type EvidenceGraphEdge = {
  from: string;
  to: string;
  type: EvidenceGraphEdgeType;
};

export type EvidenceGraph = {
  proposalId: string;
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
  traceability: TraceabilityMetadata;
};

export type ThemeIntelligence = {
  theme: string;
  health: number;
  momentum: number;
  lifecycle: "early" | "standardizing" | "mature" | "mixed";
  adoption: "none" | "reference" | "implementation" | "mixed";
  risk: "Low" | "Medium" | "High";
  readiness: "Watch" | "Trial" | "Adopt" | "Hold";
  why: string;
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
};

export type KgldImpactLevel = "None" | "Monitor" | "Medium" | "High" | "Critical";

export type KgldImpactArea =
  | "Wallet impact"
  | "Custody impact"
  | "Compliance impact"
  | "Tokenization impact"
  | "RWA impact"
  | "Settlement impact"
  | "Account abstraction impact"
  | "Bridge impact"
  | "Execution impact";

export type KgldIntelligenceItem = {
  proposalId: string;
  title: string;
  overall: KgldImpactLevel;
  areas: Array<{ area: KgldImpactArea; level: KgldImpactLevel; why: string }>;
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
};

export type ConfidenceBreakdown = {
  proposalId: string;
  overall: number;
  dataCompleteness: number;
  evidenceQuality: number;
  sourceDiversity: number;
  verificationStatus: number;
  falsePositiveRisk: number;
  weights: Array<{ factor: string; percent: number; score: number }>;
  scoreBreakdown: ScoreBreakdownItem[];
  explanation: string;
  traceability: TraceabilityMetadata;
};

export type TechnologyRadarQuadrant = "Watch" | "Trial" | "Adopt" | "Hold";

export type TechnologyRadarItem = {
  proposalId: string;
  title: string;
  theme: string;
  quadrant: TechnologyRadarQuadrant;
  why: string;
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
};

export type RiskFlag = {
  proposalId: string;
  risk: "Low" | "Medium" | "High";
  type:
    | "High discussion / no implementation"
    | "Implementation / no release"
    | "Release / no activation"
    | "Spec divergence"
    | "Client divergence"
    | "Theme fragmentation";
  why: string;
  scoreBreakdown: ScoreBreakdownItem[];
  traceability: TraceabilityMetadata;
};

export type PlatformDashboard = {
  topMovers: string[];
  emergingThemes: string[];
  lifecycleProgress: Array<{ proposalId: string; currentStage: LifecycleStageName; confidence: number }>;
  implementationProgress: Array<{ proposalId: string; verifiedClients: number; trackingClients: number }>;
  releaseWatch: Array<{ proposalId: string; status: ReleaseStatus }>;
  activationWatch: Array<{ proposalId: string; status: DeploymentStatus }>;
  businessImpact: KgldIntelligenceItem[];
  kgldWatch: KgldIntelligenceItem[];
  developerActivity: Array<{ theme: string; score: number }>;
  themeHeatmap: Array<{ theme: string; health: number; momentum: number; risk: string }>;
  technologyRadar: TechnologyRadarItem[];
};

export type TechnologyPlatformLayer = {
  generatedBy: "deterministic";
  lifecycleTimelines: LifecycleTimeline[];
  lifecycleAxes?: LifecycleAxis[];
  clientMatrices: ClientCoverageMatrix[];
  releaseIntelligence: ReleaseIntelligence[];
  deploymentIntelligence: DeploymentIntelligence[];
  evidenceGraphs: EvidenceGraph[];
  themeIntelligence: ThemeIntelligence[];
  kgldIntelligence: KgldIntelligenceItem[];
  confidence: ConfidenceBreakdown[];
  technologyRadar: TechnologyRadarItem[];
  risks: RiskFlag[];
  dashboard: PlatformDashboard;
  dataCompleteness: DataCompleteness;
  sectionVisibility: SectionVisibilityDecision[];
  hiddenCardCount: number;
  deduplicatedClaimCount: number;
  staleEvidenceCount: number;
  api: {
    lifecycle: LifecycleTimeline[];
    lifecycleAxes?: LifecycleAxis[];
    clientMatrix: ClientCoverageMatrix[];
    evidenceGraph: EvidenceGraph[];
    themes: ThemeIntelligence[];
    technologyRadar: TechnologyRadarItem[];
    dashboard: PlatformDashboard;
    dataCompleteness: DataCompleteness;
  };
};
