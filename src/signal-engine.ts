import { adoptionEvidenceForProposal } from "./adoption.ts";
import type { KnowledgeGraphLayer, KnowledgeGraphNode } from "./knowledge-graph.ts";
import type { TopicCluster, TopicClusterLayer, TopicProposalMembership } from "./topic-cluster.ts";
import type {
  AccountAbstractionIntelligence,
  ChangeEvent,
  ConfidenceMetrics,
  DecisionState,
  FollowUpItem,
  IntelligenceEvent,
  IntelligenceEventType,
  IntelligenceLayer,
  IntelligencePriority,
  IntelligenceTopStory,
  KgldCausalAssessment,
  KgldCandidate,
  ScoreBreakdownItem,
  ThemeInsight,
  ThemeIntelligenceSignal,
  WeeklyRadarReport,
} from "./types.ts";

type SignalReport = Omit<WeeklyRadarReport, "chartData"> & Partial<Pick<WeeklyRadarReport, "chartData">>;

type SignalInput = {
  report: SignalReport;
  mode: IntelligenceLayer["mode"];
};

const AA_KEYWORDS = [
  "account abstraction",
  "erc-4337",
  "entrypoint",
  "bundler",
  "paymaster",
  "smart account",
  "delegation",
  "session key",
  "passkey",
  "webauthn",
  "useroperation",
  "wallet authorization",
];

export function buildIntelligenceLayer({ report, mode }: SignalInput): IntelligenceLayer {
  const events = buildIntelligenceEvents(report);
  const meaningful = events.filter((event) => event.meaningful && priorityForScore(event.significance) !== "ARCHIVE");
  const themeSignals = buildThemeSignals(report.ethereumTechRadar.themeInsights, meaningful, report);
  const topStories = buildTopStories(report, meaningful, themeSignals);
  const followUpQueue = buildFollowUpQueue(report, topStories, meaningful);
  const accountAbstraction = buildAccountAbstractionIntelligence(report, topStories, followUpQueue);
  const kgldAssessments = buildKgldAssessments(report, topStories);

  return {
    mode,
    events,
    topStories,
    themeSignals,
    accountAbstraction,
    kgldAssessments,
    followUpQueue,
    meaningfulChangeCount: meaningful.length,
    quietWeek: meaningful.length === 0,
    generatedBy: "deterministic_signal_engine",
  };
}

function buildIntelligenceEvents(report: SignalReport): IntelligenceEvent[] {
  const changeEvents = [
    ...report.ethereumTechRadar.recentChanges.newProposals,
    ...report.ethereumTechRadar.recentChanges.statusChanges,
    ...report.ethereumTechRadar.recentChanges.finalTransitions,
    ...report.ethereumTechRadar.recentChanges.withdrawnTransitions,
    ...report.ethereumTechRadar.recentChanges.contentHashChanges,
  ];
  const fromChanges = dedupeEvents(changeEvents.map((event) => eventFromChange(event, report)));
  const fromDiscussions = report.ethereumTechRadar.signalLayer.discussionHeat
    .filter((item) => (item.discussionActivityScore ?? 0) >= 65 || item.activityLevel === "High")
    .map((item): IntelligenceEvent => {
      const breakdown = [{ label: "discussion acceleration", value: 10, reason: "High public discussion activity was collected." }];
      const aa = isAccountAbstractionText(`${item.title ?? ""} ${item.theme}`);
      if (aa) breakdown.push({ label: "account abstraction relevance", value: 15, reason: "Discussion is in an Account Abstraction-related theme." });
      return {
        entity: item.proposalId,
        eventType: aa ? "ACCOUNT_ABSTRACTION_SIGNAL" : "DISCUSSION_ACCELERATED",
        currentState: item.activityLevel ?? "Unknown",
        eventDate: item.discussionLastActivityAt ?? report.generatedAt,
        source: item.discussionSource ?? "public discussion",
        evidence: item.discussionUrl ?? item.canonicalUrl,
        significance: scoreBreakdownTotal(breakdown),
        confidence: item.error ? 35 : 60,
        affectedThemes: [item.theme],
        possibleFollowUp: "Recheck when an author, editor, or client maintainer posts substantive feedback.",
        meaningful: true,
        scoreBreakdown: breakdown,
      };
    });

  return dedupeEvents([...fromChanges, ...fromDiscussions]).sort((a, b) => b.significance - a.significance || a.entity.localeCompare(b.entity));
}

function eventFromChange(event: ChangeEvent, report: SignalReport): IntelligenceEvent {
  const mapped = mapChangeType(event);
  const text = `${event.title ?? ""} ${event.changedSections?.join(" ") ?? ""} ${event.diffSummary ?? ""}`;
  const material = meaningfulChange(event, text);
  const breakdown = scoreChange(event, mapped, text);
  const significance = material ? scoreBreakdownTotal(breakdown) : Math.max(0, scoreBreakdownTotal(breakdown) - 40);
  const themes = themesForProposal(report, event.proposalId);
  const affectedThemes = themes.length ? themes : inferredThemesFromText(text);
  return {
    entity: event.proposalId,
    eventType: material ? mapped : "NO_MEANINGFUL_CHANGE",
    previousState: event.previousStatus,
    currentState: event.currentStatus,
    eventDate: event.detectedAt,
    source: event.sourceRepo,
    evidence: event.diffEvidence ?? event.canonicalUrl,
    significance,
    confidence: material ? 70 : 35,
    affectedThemes,
    possibleFollowUp: followUpForEvent(mapped, event.proposalId),
    meaningful: material,
    scoreBreakdown: breakdown,
  };
}

function inferredThemesFromText(text: string): string[] {
  if (isAccountAbstractionText(text)) return ["Account Abstraction"];
  if (/execution|transaction|opcode|gas|evm/i.test(text)) return ["Transaction Model / Execution"];
  if (/identity|credential|compliance|attestation|rwa/i.test(text)) return ["Identity / Credential"];
  return [];
}

function mapChangeType(event: ChangeEvent): IntelligenceEventType {
  if (event.type === "new_proposal") return "NEW_PROPOSAL";
  if (event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition") return "STATUS_CHANGED";
  if (event.type === "content_hash_change") return "SPEC_TEXT_CHANGED";
  return "NO_MEANINGFUL_CHANGE";
}

function meaningfulChange(event: ChangeEvent, text: string): boolean {
  if (event.type === "new_proposal" || event.type === "status_change" || event.type === "final_transition" || event.type === "withdrawn_transition") return true;
  if (/security|compatib|breaking|must|shall|normative|consensus|execution|validation|authorization|signature|opcode|gas|fork/i.test(text)) return true;
  if (/typo|format|formatting|link|metadata|spelling|grammar|editorial|automated/i.test(text)) return false;
  return Boolean(event.changedSections?.some((section) => /specification|motivation|security|rationale|backwards/i.test(section)));
}

function scoreChange(event: ChangeEvent, mapped: IntelligenceEventType, text: string): ScoreBreakdownItem[] {
  const items: ScoreBreakdownItem[] = [];
  if (mapped === "NEW_PROPOSAL") items.push({ label: "new proposal", value: 15, reason: "Proposal was absent from the previous snapshot." });
  if (mapped === "STATUS_CHANGED") {
    const status = event.currentStatus?.toLowerCase() ?? "";
    const value = status === "final" ? 55 : status === "last call" ? 40 : status === "review" ? 20 : 25;
    items.push({ label: "status changed", value, reason: `Status changed from ${event.previousStatus ?? "unknown"} to ${event.currentStatus ?? "unknown"}.` });
  }
  if (mapped === "SPEC_TEXT_CHANGED") items.push({ label: "spec text changed", value: 20, reason: event.diffSummary ?? "Specification text changed." });
  if (/security/i.test(text)) items.push({ label: "security relevance", value: 30, reason: "Changed text mentions security impact." });
  if (/compatib|breaking/i.test(text)) items.push({ label: "compatibility relevance", value: 25, reason: "Changed text indicates compatibility risk." });
  if (/account abstraction|wallet|delegation|session key|paymaster|bundler|erc-4337/i.test(text)) items.push({ label: "account abstraction relevance", value: 15, reason: "Change affects Account Abstraction or wallet authorization context." });
  if (/typo|format|formatting|metadata|automated/i.test(text)) items.push({ label: "low materiality adjustment", value: -30, reason: "Change appears formatting or metadata-only." });
  return items.length ? items : [{ label: "weak signal", value: 5, reason: "Change was collected but no material rule matched." }];
}

function buildTopStories(report: SignalReport, events: IntelligenceEvent[], themeSignals: ThemeIntelligenceSignal[]): IntelligenceTopStory[] {
  const knowledgeGraph = report.ethereumTechRadar.knowledgeGraphLayer;
  if (knowledgeGraph?.nodes.length) return buildTopStoriesFromKnowledgeGraph(report, knowledgeGraph, events);

  const topicLayer = report.ethereumTechRadar.topicClusterLayer;

  const byCluster = new Map<string, IntelligenceEvent[]>();
  for (const event of events) {
    const cluster = clusterForEvent(event);
    if (/unclassified/i.test(cluster)) continue;
    byCluster.set(cluster, [...(byCluster.get(cluster) ?? []), event]);
  }
  return [...byCluster.entries()]
    .map(([cluster, group]) => storyForCluster(report, cluster, group, themeSignals.find((item) => item.theme === cluster)))
    .filter((story) => story.priority !== "ARCHIVE")
    .sort((a, b) => b.score - a.score || a.headline.localeCompare(b.headline))
    .slice(0, 7);
}

function buildTopStoriesFromTopics(report: SignalReport, layer: TopicClusterLayer, events: IntelligenceEvent[]): IntelligenceTopStory[] {
  const stories = layer.clusters
    .filter((topic) => topic.confidence >= 35 && !/unclassified/i.test(topic.displayName))
    .map((topic) => storyForTopic(report, topic, membershipsForTopic(layer, topic.id), events.filter((event) => topic.proposalIds.includes(event.entity))))
    .filter((story) => story.priority !== "ARCHIVE")
    .sort((a, b) => b.score - a.score || a.headline.localeCompare(b.headline))
    .slice(0, 7);
  return stories;
}

function buildTopStoriesFromKnowledgeGraph(report: SignalReport, graph: KnowledgeGraphLayer, events: IntelligenceEvent[]): IntelligenceTopStory[] {
  const topicNodes = graph.nodes
    .filter((node) => node.type === "Topic")
    .filter((node) => getNumberProperty(node, "confidence") >= 35 && !/unclassified/i.test(node.label));
  return topicNodes
    .map((node) => storyForKnowledgeTopic(report, graph, node, events.filter((event) => getStringArrayProperty(node, "proposalIds").includes(event.entity))))
    .filter((story) => story.priority !== "ARCHIVE")
    .sort((a, b) => b.score - a.score || a.headline.localeCompare(b.headline))
    .slice(0, 7);
}

function storyForKnowledgeTopic(report: SignalReport, graph: KnowledgeGraphLayer, topicNode: KnowledgeGraphNode, events: IntelligenceEvent[]): IntelligenceTopStory {
  const topicId = getStringProperty(topicNode, "topicId") || topicNode.id.replace(/^Topic:/, "");
  const anchorProposalIds = getStringArrayProperty(topicNode, "anchorProposalIds");
  const supportingProposalIds = getStringArrayProperty(topicNode, "supportingProposalIds");
  const proposals = [...anchorProposalIds, ...supportingProposalIds].slice(0, 10);
  const primaryThemeIds = getStringArrayProperty(topicNode, "primaryThemeIds");
  const supportingThemeIds = getStringArrayProperty(topicNode, "supportingThemeIds");
  const themeIds = getStringArrayProperty(topicNode, "themeIds");
  const themes = [...new Set([...primaryThemeIds, ...supportingThemeIds, ...themeIds])];
  const activityProfile = getRecordProperty(topicNode, "activityProfile");
  const maturityProfile = getRecordProperty(topicNode, "maturityProfile");
  const gaps = getArrayProperty(topicNode, "gaps");
  const scoreBreakdown = getArrayProperty(topicNode, "scoreBreakdown") as ScoreBreakdownItem[];
  const confidence = getNumberProperty(topicNode, "confidence");
  const cohesionScore = getNumberProperty(topicNode, "cohesionScore");
  const signalStrength = Math.min(100, Math.round(confidence * 0.65 + cohesionScore * 0.25 + graphTopicActivityScore(activityProfile)));
  const confidenceMetrics = confidenceMetricsForKnowledgeTopic(report, maturityProfile, activityProfile, gaps, signalStrength);
  const decisionState = decisionStateForKnowledgeTopic(report, confidenceMetrics, maturityProfile, gaps, cohesionScore, proposals);
  return {
    priority: priorityForDecision(decisionState),
    decisionState,
    headline: topicNode.label,
    conclusion: graphTopicConclusion(topicNode, activityProfile, maturityProfile),
    whatChanged: graphTopicChangeSummary(topicNode, events, proposals),
    whyItMatters: whyStoryMatters([topicNode.label, ...themes], events),
    evidence: graphTopicEvidence(report, graph, topicNode, proposals),
    maturity: graphTopicMaturitySummary(maturityProfile),
    affectedSystems: graphAffectedSystems(graph, topicNode.id, themes),
    followUpTrigger: graphTopicFollowUpTrigger(topicNode, maturityProfile, activityProfile, proposals[0] ?? topicId),
    confidence: confidenceMetrics.evidenceConfidence,
    confidenceMetrics,
    relatedProposals: proposals,
    score: signalStrength,
    scoreBreakdown,
  };
}

function confidenceMetricsForKnowledgeTopic(
  report: SignalReport,
  maturity: Record<string, unknown>,
  activity: Record<string, unknown>,
  gaps: unknown[],
  signalStrength: number,
): ConfidenceMetrics {
  const data = report.ethereumTechRadar.technologyPlatformLayer?.dataCompleteness;
  const collectionConfidence = data?.confidenceMetrics?.collectionConfidence ?? data?.collectionCompleteness ?? 100;
  let evidenceConfidence = Math.min(100,
    numberFromRecord(maturity, "released") * 50
    + numberFromRecord(maturity, "verifiedImplementation") * 40
    + numberFromRecord(maturity, "implementationCandidate") * 25
    + numberFromRecord(maturity, "implementationTracking") * 20
    + Math.min(25, specificationEvidenceCount(maturity) > 0 ? 25 : 0)
    + Math.min(10, numberFromRecord(activity, "weeklyChangedProposalCount") * 5),
  );
  if (numberFromRecord(maturity, "released") === 0 && numberFromRecord(maturity, "activated") === 0 && numberFromRecord(maturity, "productionAdoption") === 0) evidenceConfidence = Math.min(evidenceConfidence, 69);
  if (numberFromRecord(maturity, "verifiedImplementation") === 0 && numberFromRecord(maturity, "implementationCandidate") === 0) evidenceConfidence = Math.min(evidenceConfidence, 49);
  if (gaps.some((gap) => typeof gap === "object" && gap !== null && "type" in gap && gap.type === "low_cohesion")) evidenceConfidence = Math.min(evidenceConfidence, 39);
  return { collectionConfidence, evidenceConfidence, signalStrength };
}

function decisionStateForKnowledgeTopic(
  report: SignalReport,
  metrics: ConfidenceMetrics,
  maturity: Record<string, unknown>,
  gaps: unknown[],
  cohesionScore: number,
  proposalIds: string[],
): DecisionState {
  if (report.ethereumTechRadar.technologyPlatformLayer?.dataCompleteness.status === "degraded" || metrics.collectionConfidence < 25) return "INSUFFICIENT_EVIDENCE";
  if (cohesionScore < 45 || gaps.some((gap) => typeof gap === "object" && gap !== null && "type" in gap && gap.type === "low_cohesion")) return "INSUFFICIENT_EVIDENCE";
  const hasReleaseOrActivation = numberFromRecord(maturity, "released") > 0 || numberFromRecord(maturity, "activated") > 0 || numberFromRecord(maturity, "productionAdoption") > 0;
  const hasVerified = numberFromRecord(maturity, "verifiedImplementation") > 0;
  const hasCandidate = numberFromRecord(maturity, "implementationCandidate") > 0;
  const hasTracking = numberFromRecord(maturity, "implementationTracking") > 0;
  const kgldDirect = report.kgldOpportunityRadar.candidates.some((candidate) => proposalIds.includes(candidate.proposalId) && candidate.relevanceScore >= 70 && hasVerified);
  if ((hasReleaseOrActivation || hasVerified) && kgldDirect && metrics.evidenceConfidence >= 70) return "ACTION_REQUIRED";
  if (hasCandidate || (hasTracking && metrics.evidenceConfidence >= 35)) return "PRIORITY_WATCH";
  if (metrics.signalStrength >= 60 && metrics.evidenceConfidence >= 25) return "PRIORITY_WATCH";
  if (metrics.signalStrength >= 20) return "MONITOR";
  return "BACKGROUND";
}

function graphTopicActivityScore(activity: Record<string, unknown>): number {
  return Math.min(20,
    numberFromRecord(activity, "statusChangeCount") * 6
    + numberFromRecord(activity, "newProposalCount") * 4
    + numberFromRecord(activity, "weeklyChangedProposalCount") * 3
    + numberFromRecord(activity, "implementationEvidenceCount") * 5
    + numberFromRecord(activity, "releaseEvidenceCount") * 8,
  );
}

function graphTopicConclusion(topicNode: KnowledgeGraphNode, activity: Record<string, unknown>, maturity: Record<string, unknown>): string {
  if (numberFromRecord(activity, "implementationEvidenceCount") > 0 && numberFromRecord(maturity, "verifiedImplementation") === 0) {
    return `${topicNode.label}에서 구현 추적 활동은 확인됐지만, 현재 근거만으로 검증된 구현이나 릴리스 포함을 판단하지 않습니다.`;
  }
  if (numberFromRecord(activity, "weeklyChangedProposalCount") > 0) {
    return `${topicNode.label}은 이번 기간에 관련 변경 신호가 확인된 관찰 주제입니다. 구현, 릴리스, 운영 채택은 별도 근거로만 판단합니다.`;
  }
  return `${topicNode.label}은 지식 그래프에서 관찰 대상으로 유지되지만, 강한 실행 근거 없이 채택이나 활성화로 해석하지 않습니다.`;
}

function graphTopicChangeSummary(topicNode: KnowledgeGraphNode, events: IntelligenceEvent[], proposals: string[]): string {
  if (events.length) {
    const eventTypes = [...new Set(events.map((event) => event.eventType))].slice(0, 3).join(", ");
    return `${topicNode.label} 관련 이벤트 ${events.length}건이 수집됐습니다. 이벤트 유형: ${eventTypes}. 관련 제안: ${proposals.join(", ")}`;
  }
  return `${topicNode.label}에서 이번 기간의 의미 있는 변경은 제한적입니다. 관련 제안: ${proposals.join(", ")}`;
}

function graphTopicEvidence(report: SignalReport, graph: KnowledgeGraphLayer, topicNode: KnowledgeGraphNode, proposals: string[]): string[] {
  const proposalLabels = proposals.map((proposalId) => {
    const title = titleForProposal(report, proposalId);
    const status = statusForProposal(report, proposalId);
    return `${proposalId}${title && title !== proposalId ? ` ${title}` : ""}${status ? ` (${status})` : ""}`;
  });
  const edgeEvidence = graph.edges
    .filter((edge) => edge.from === topicNode.id || edge.to === topicNode.id)
    .slice(0, 5)
    .map((edge) => `${edge.type}: ${edge.traceability.reason}`);
  return [...proposalLabels, ...edgeEvidence].slice(0, 8);
}

function graphTopicMaturitySummary(maturity: Record<string, unknown>): string {
  const states = [
    numberFromRecord(maturity, "draft") ? `Draft ${numberFromRecord(maturity, "draft")}` : "",
    numberFromRecord(maturity, "review") ? `Review ${numberFromRecord(maturity, "review")}` : "",
    numberFromRecord(maturity, "lastCall") ? `Last Call ${numberFromRecord(maturity, "lastCall")}` : "",
    numberFromRecord(maturity, "final") ? `Final ${numberFromRecord(maturity, "final")}` : "",
    numberFromRecord(maturity, "implementationTracking") ? `Implementation Tracking ${numberFromRecord(maturity, "implementationTracking")}` : "",
    numberFromRecord(maturity, "implementationCandidate") ? `Implementation Candidate ${numberFromRecord(maturity, "implementationCandidate")}` : "",
    numberFromRecord(maturity, "verifiedImplementation") ? `Verified Implementation ${numberFromRecord(maturity, "verifiedImplementation")}` : "",
    numberFromRecord(maturity, "released") ? `Released ${numberFromRecord(maturity, "released")}` : "",
    numberFromRecord(maturity, "activated") ? `Activated ${numberFromRecord(maturity, "activated")}` : "",
  ].filter(Boolean);
  return states.length ? states.join("; ") : "성숙도 확인 불가";
}

function graphTopicFollowUpTrigger(topicNode: KnowledgeGraphNode, maturity: Record<string, unknown>, activity: Record<string, unknown>, fallbackProposal: string): string {
  if (numberFromRecord(activity, "implementationEvidenceCount") === 0) return `${fallbackProposal}의 클라이언트 PR 또는 구현 tracker 생성 여부를 확인합니다.`;
  if (numberFromRecord(maturity, "verifiedImplementation") === 0) return `${topicNode.label} 관련 클라이언트 PR 병합 또는 코드 근거가 채택되는지 확인합니다.`;
  if (numberFromRecord(activity, "releaseEvidenceCount") === 0) return `${topicNode.label}이 안정 버전 릴리스 노트에 포함되는지 확인합니다.`;
  return `${topicNode.label}의 활성화 계획, 테스트넷 포함, 운영 채택 근거가 추가되는지 확인합니다.`;
}

function graphAffectedSystems(graph: KnowledgeGraphLayer, topicNodeId: string, themes: string[]): string[] {
  const systems = graph.edges
    .filter((edge) => edge.from === topicNodeId && edge.type === "AFFECTS" && (edge.to.startsWith("System:") || edge.to.startsWith("system:")))
    .map((edge) => graph.nodes.find((node) => node.id === edge.to)?.label)
    .filter((label): label is string => Boolean(label));
  return systems.length ? systems : affectedSystemsForThemes(themes);
}

function specificationEvidenceCount(maturity: Record<string, unknown>): number {
  return numberFromRecord(maturity, "draft") + numberFromRecord(maturity, "review") + numberFromRecord(maturity, "lastCall") + numberFromRecord(maturity, "final");
}

function getStringProperty(node: KnowledgeGraphNode, key: string): string {
  const value = node.properties[key];
  return typeof value === "string" ? value : "";
}

function getNumberProperty(node: KnowledgeGraphNode, key: string): number {
  const value = node.properties[key];
  return typeof value === "number" ? value : 0;
}

function getStringArrayProperty(node: KnowledgeGraphNode, key: string): string[] {
  const value = node.properties[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getRecordProperty(node: KnowledgeGraphNode, key: string): Record<string, unknown> {
  const value = node.properties[key];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getArrayProperty(node: KnowledgeGraphNode, key: string): unknown[] {
  const value = node.properties[key];
  return Array.isArray(value) ? value : [];
}

function numberFromRecord(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" ? value : 0;
}

function storyForTopic(
  report: SignalReport,
  topic: TopicCluster,
  memberships: TopicProposalMembership[],
  events: IntelligenceEvent[],
): IntelligenceTopStory {
  const narrativeMemberships = memberships.filter((membership) => membership.role === "anchor" || membership.role === "supporting").sort(compareTopicMemberships);
  const proposals = narrativeMemberships.map((membership) => membership.proposalId).slice(0, 10);
  const score = Math.min(100, Math.round(topic.confidence * 0.65 + topic.cohesionScore * 0.25 + topicActivityScore(topic)));
  const confidenceMetrics = confidenceMetricsForTopic(report, topic, score);
  const decisionState = decisionStateForTopic(report, topic, confidenceMetrics);
  const themes = [...new Set([...topic.primaryThemeIds, ...topic.supportingThemeIds, ...topic.themeIds])];
  return {
    priority: priorityForDecision(decisionState),
    decisionState,
    headline: topic.displayName.startsWith("Needs Classification") ? topic.displayName : topic.displayName,
    conclusion: topicConclusion(topic),
    whatChanged: topicChangeSummary(topic, events, proposals),
    whyItMatters: whyStoryMatters([topic.displayName, ...themes], events),
    evidence: topicStoryEvidence(report, topic, proposals),
    maturity: topicMaturitySummary(topic),
    affectedSystems: affectedSystemsForThemes([topic.displayName, ...themes]),
    followUpTrigger: topicFollowUpTrigger(topic, proposals[0] ?? topic.id),
    confidence: confidenceMetrics.evidenceConfidence,
    confidenceMetrics,
    relatedProposals: proposals,
    score,
    scoreBreakdown: topic.traceability.scoreBreakdown,
  };
}

function confidenceMetricsForTopic(report: SignalReport, topic: TopicCluster, signalStrength: number): ConfidenceMetrics {
  const data = report.ethereumTechRadar.technologyPlatformLayer?.dataCompleteness;
  const collectionConfidence = data?.confidenceMetrics?.collectionConfidence ?? data?.collectionCompleteness ?? 100;
  let evidenceConfidence = Math.min(100,
    topic.maturityProfile.released * 50
    + topic.maturityProfile.verifiedImplementation * 40
    + topic.maturityProfile.implementationCandidate * 25
    + topic.maturityProfile.implementationTracking * 20
    + Math.min(25, topic.maturityProfile.draft + topic.maturityProfile.review + topic.maturityProfile.lastCall + topic.maturityProfile.final > 0 ? 25 : 0)
    + Math.min(10, topic.evidence.filter((item) => item.type === "change").length * 5)
    + Math.min(5, topic.evidence.filter((item) => item.type === "discussion").length * 5),
  );
  if (topic.maturityProfile.released === 0 && topic.maturityProfile.activated === 0 && topic.maturityProfile.productionAdoption === 0) evidenceConfidence = Math.min(evidenceConfidence, 69);
  if (topic.maturityProfile.verifiedImplementation === 0 && topic.maturityProfile.implementationCandidate === 0) evidenceConfidence = Math.min(evidenceConfidence, 49);
  return {
    collectionConfidence,
    evidenceConfidence,
    signalStrength,
  };
}

function decisionStateForTopic(report: SignalReport, topic: TopicCluster, metrics: ConfidenceMetrics): DecisionState {
  if (report.ethereumTechRadar.technologyPlatformLayer?.dataCompleteness.status === "degraded" || metrics.collectionConfidence < 25) return "INSUFFICIENT_EVIDENCE";
  if (topic.gaps.some((gap) => gap.type === "low_cohesion" && gap.severity !== "low") || topic.cohesionScore < 45) return "INSUFFICIENT_EVIDENCE";
  const hasReleaseOrActivation = topic.maturityProfile.released > 0 || topic.maturityProfile.activated > 0 || topic.maturityProfile.productionAdoption > 0;
  const hasVerified = topic.maturityProfile.verifiedImplementation > 0;
  const hasCandidate = topic.maturityProfile.implementationCandidate > 0;
  const hasTracking = topic.maturityProfile.implementationTracking > 0;
  const kgldDirect = report.kgldOpportunityRadar.candidates.some((candidate) => topic.proposalIds.includes(candidate.proposalId) && candidate.relevanceScore >= 70 && hasVerified);
  if ((hasReleaseOrActivation || hasVerified) && kgldDirect && metrics.evidenceConfidence >= 70) return "ACTION_REQUIRED";
  if (hasCandidate || (hasTracking && metrics.evidenceConfidence >= 35)) return "PRIORITY_WATCH";
  if (metrics.signalStrength >= 60 && metrics.evidenceConfidence >= 25) return "PRIORITY_WATCH";
  if (metrics.signalStrength >= 20) return "MONITOR";
  return "BACKGROUND";
}

function priorityForDecision(decision: DecisionState): IntelligencePriority {
  if (decision === "ACTION_REQUIRED") return "HIGH";
  if (decision === "TECHNICAL_REVIEW") return "MEDIUM";
  if (decision === "PRIORITY_WATCH") return "WATCH";
  if (decision === "MONITOR") return "WATCH";
  if (decision === "BACKGROUND") return "WATCH";
  return "ARCHIVE";
}

function membershipsForTopic(layer: TopicClusterLayer, topicId: string): TopicProposalMembership[] {
  return layer.memberships.filter((membership) => membership.topicId === topicId);
}

function compareTopicMemberships(left: TopicProposalMembership, right: TopicProposalMembership): number {
  const rank = (role: TopicProposalMembership["role"]) => role === "anchor" ? 0 : role === "supporting" ? 1 : role === "adjacent" ? 2 : 3;
  return rank(left.role) - rank(right.role) || right.confidence - left.confidence || left.proposalId.localeCompare(right.proposalId, undefined, { numeric: true });
}

function topicActivityScore(topic: TopicCluster): number {
  const activity = topic.activityProfile;
  return Math.min(20, activity.statusChangeCount * 6 + activity.newProposalCount * 4 + activity.weeklyChangedProposalCount * 3 + activity.implementationEvidenceCount * 5 + activity.releaseEvidenceCount * 8);
}

function topicStateLabel(state: TopicCluster["state"]): string {
  if (state === "emerging") return "부상";
  if (state === "active") return "관찰";
  if (state === "established") return "정착";
  if (state === "dormant") return "정체";
  return "판단 근거 부족";
}

function topicConclusion(topic: TopicCluster): string {
  const proposalCount = topic.proposalIds.length;
  const state = topicStateLabel(topic.state);
  if (topic.activityProfile.implementationEvidenceCount > 0 && topic.maturityProfile.verifiedImplementation === 0) {
    return `${topic.displayName}에서는 제안별 구현 추적 활동이 확인됐지만, 현재 근거만으로 검증된 구현이나 릴리스 포함을 판단할 수 없습니다.`;
  }
  if (topic.activityProfile.weeklyChangedProposalCount > 0) {
    return `${topic.displayName}은 ${state} 상태입니다. 주요·보조 제안 ${proposalCount}건에서 이번 기간 근거가 확인됐지만, 구현·릴리스·운영 채택은 별도 gate로 판단합니다.`;
  }
  return `${topic.displayName}은 ${state} 관찰 항목입니다. 더 강한 직접 근거 없이는 채택이나 활성화로 해석하지 않습니다.`;
}

function topicChangeSummary(topic: TopicCluster, events: IntelligenceEvent[], proposals: string[]): string {
  const activity = topic.activityProfile;
  const parts = [
    activity.newProposalCount ? `신규 제안 ${activity.newProposalCount}건` : "",
    activity.statusChangeCount ? `상태 변경 ${activity.statusChangeCount}건` : "",
    activity.weeklyChangedProposalCount ? `변경 제안 ${activity.weeklyChangedProposalCount}건` : "",
    activity.implementationEvidenceCount ? `구현 추적 근거 ${activity.implementationEvidenceCount}건` : "",
    activity.releaseEvidenceCount ? `릴리스 근거 ${activity.releaseEvidenceCount}건` : "",
  ].filter(Boolean);
  const summary = parts.length ? parts.join("; ") : "이번 기간 의미 있는 변경 없음";
  return `${summary}. 대상 제안: ${proposals.join(", ")}`;
}

function topicStoryEvidence(report: SignalReport, topic: TopicCluster, proposals: string[]): string[] {
  const proposalLabels = proposals.map((proposalId) => {
    const title = titleForProposal(report, proposalId);
    const status = statusForProposal(report, proposalId);
    return `${proposalId}${title && title !== proposalId ? ` ${title}` : ""}${status ? ` (${status})` : ""}`;
  });
  const evidence = topic.evidence.map((item) => item.description);
  const gaps = topic.gaps.map((gap) => gap.explanation);
  return [...proposalLabels, ...evidence, ...gaps].slice(0, 8);
}

function topicMaturitySummary(topic: TopicCluster): string {
  const maturity = topic.maturityProfile;
  const states = [
    maturity.draft ? `Draft ${maturity.draft}` : "",
    maturity.review ? `Review ${maturity.review}` : "",
    maturity.lastCall ? `Last Call ${maturity.lastCall}` : "",
    maturity.final ? `Final ${maturity.final}` : "",
    maturity.implementationTracking ? `Implementation Tracking ${maturity.implementationTracking}` : "",
    maturity.implementationCandidate ? `Implementation Candidate ${maturity.implementationCandidate}` : "",
    maturity.verifiedImplementation ? `Verified Implementation ${maturity.verifiedImplementation}` : "",
    maturity.released ? `Released ${maturity.released}` : "",
    maturity.activated ? `Activated ${maturity.activated}` : "",
  ].filter(Boolean);
  return states.length ? states.join("; ") : "성숙도 확인 불가";
}

function topicFollowUpTrigger(topic: TopicCluster, fallbackProposal: string): string {
  if (topic.activityProfile.implementationEvidenceCount === 0) return `${fallbackProposal}의 클라이언트 PR 또는 구현 tracker 생성 여부를 확인합니다.`;
  if (topic.maturityProfile.verifiedImplementation === 0) return `제안별 클라이언트 PR 병합 또는 코드 근거가 채택될 때 기술 검토로 올립니다.`;
  if (topic.activityProfile.releaseEvidenceCount === 0) return `안정 버전 릴리스 노트에 해당 변경이 포함되는지 재확인합니다.`;
  return `활성화 계획, 테스트넷 포함, 운영 채택 근거가 나타나는지 재평가합니다.`;
}

function storyForCluster(
  report: SignalReport,
  cluster: string,
  events: IntelligenceEvent[],
  themeSignal: ThemeIntelligenceSignal | undefined,
): IntelligenceTopStory {
  const proposals = [...new Set(events.map((event) => event.entity))].slice(0, 8);
  const score = Math.min(
    100,
    events.reduce((max, event) => Math.max(max, event.significance), 0)
      + Math.min(25, (proposals.length - 1) * 5)
      + (themeSignal?.direction === "accelerating" ? 15 : themeSignal?.direction === "emerging" ? 8 : 0),
  );
  const confidenceMetrics = confidenceMetricsForEvents(report, events, score);
  const themes = [...new Set(events.flatMap((event) => event.affectedThemes))];
  const adoption = adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, proposals);
  const decisionState = decisionStateForEvents(report, events, adoption?.evidenceLevel, confidenceMetrics);
  const primaryProposal = proposals[0] ?? cluster;
  const maturity = adoption?.evidenceLevel === "Implementation"
    ? "implementation evidence collected; release and activation still require separate evidence"
    : maturitySummary(report, proposals);
  return {
    priority: priorityForDecision(decisionState),
    decisionState,
    headline: storyHeadline(cluster, proposals),
    conclusion: conclusionForCluster(cluster, events, themeSignal, adoption?.evidenceLevel),
    whatChanged: clusteredChangeSummary(events, proposals),
    whyItMatters: whyStoryMatters([cluster, ...themes], events),
    evidence: clusteredEvidence(report, events, proposals),
    maturity,
    affectedSystems: affectedSystemsForThemes(themes),
    followUpTrigger: followUpForCluster(cluster, events, primaryProposal),
    confidence: confidenceMetrics.evidenceConfidence,
    confidenceMetrics,
    relatedProposals: proposals,
    score,
    scoreBreakdown: events.flatMap((event) => event.scoreBreakdown).slice(0, 8),
  };
}

function confidenceMetricsForEvents(report: SignalReport, events: IntelligenceEvent[], signalStrength: number): ConfidenceMetrics {
  const data = report.ethereumTechRadar.technologyPlatformLayer?.dataCompleteness;
  return {
    collectionConfidence: data?.confidenceMetrics?.collectionConfidence ?? data?.collectionCompleteness ?? 100,
    evidenceConfidence: Math.min(55, events.filter((event) => event.meaningful).length * 15 + events.filter((event) => /CLIENT_|RELEASED|ACTIVATED/.test(event.eventType)).length * 25),
    signalStrength,
  };
}

function decisionStateForEvents(report: SignalReport, events: IntelligenceEvent[], evidenceLevel: string | undefined, metrics: ConfidenceMetrics): DecisionState {
  if (report.ethereumTechRadar.technologyPlatformLayer?.dataCompleteness.status === "degraded" || metrics.collectionConfidence < 25) return "INSUFFICIENT_EVIDENCE";
  if (evidenceLevel === "Implementation" && events.some((event) => /CLIENT_PR_MERGED|RELEASED|ACTIVATED/.test(event.eventType))) return "TECHNICAL_REVIEW";
  if (metrics.signalStrength >= 60 && metrics.evidenceConfidence < 45) return "PRIORITY_WATCH";
  if (metrics.signalStrength >= 20) return "MONITOR";
  return "BACKGROUND";
}

function conclusionForCluster(
  cluster: string,
  events: IntelligenceEvent[],
  themeSignal: ThemeIntelligenceSignal | undefined,
  evidenceLevel: string | undefined,
): string {
  const proposalCount = new Set(events.map((event) => event.entity)).size;
  if (cluster === "Account Abstraction" || /Wallet|Smart Account|Session|Passkey|Paymaster/i.test(cluster)) {
    return `Wallet and Account Abstraction work is the clearest current direction: ${proposalCount} related proposal signal${proposalCount === 1 ? "" : "s"} require follow-up, but wallet impact still depends on implementation evidence.`;
  }
  if (events.some((event) => event.eventType === "STATUS_CHANGED")) return `${cluster} maturity changed this week; the story is a theme-level movement rather than an isolated proposal update.`;
  if (themeSignal?.direction === "accelerating") return `${cluster} shows a higher current-period share than its baseline and should be watched as an emerging developer focus.`;
  if (events.some((event) => event.eventType === "SPEC_TEXT_CHANGED")) return `${cluster} has specification movement; materiality depends on changed sections and follow-up implementation evidence.`;
  if (evidenceLevel === "Implementation") return `${cluster} has implementation evidence, but release, activation, and adoption remain separate gates.`;
  return `${cluster} has observable signals, but no evidence-based implementation or adoption conclusion is available.`;
}

function whyStoryMatters(themes: string[], events: IntelligenceEvent[]): string {
  if (themes.some((theme) => /Account Abstraction|Wallet|Session|Passkey|Smart Account/i.test(theme))) {
    return "This can affect wallet authorization, signing assumptions, sponsorship, or account migration planning.";
  }
  if (themes.some((theme) => /Transaction Model|Execution|EVM|Gas|Opcode/i.test(theme))) {
    return "This may affect execution semantics or client implementation work if it moves beyond proposal discussion.";
  }
  if (events.some((event) => event.eventType === "STATUS_CHANGED")) return "Maturity changed, so review priority should be updated.";
  return "The signal is worth tracking only if it gains implementation, editor, or client-maintainer evidence.";
}

function buildThemeSignals(themes: ThemeInsight[], events: IntelligenceEvent[], report: SignalReport): ThemeIntelligenceSignal[] {
  return themes.slice(0, 8).map((theme) => {
    const themeEvents = events.filter((event) => event.affectedThemes.includes(theme.theme));
    const implementationActivity = themeEvents.filter((event) => /CLIENT_|RELEASED|ACTIVATED/.test(event.eventType)).length;
    const materialChanges = themeEvents.filter((event) => event.meaningful).length;
    const totalRecentChanges = Math.max(1, report.ethereumTechRadar.recentChanges.total);
    const baselineTotal = Math.max(1, report.ethereumTechRadar.themeInsights.reduce((sum, item) => sum + Math.max(0, item.proposalCount180d - item.recentChangeCount7d), 0));
    const recentShare = theme.recentChangeCount7d / totalRecentChanges;
    const baselineShare = Math.max(0, theme.proposalCount180d - theme.recentChangeCount7d) / baselineTotal;
    const direction: ThemeIntelligenceSignal["direction"] = (materialChanges >= 3 && recentShare > baselineShare * 1.5) || (materialChanges >= 2 && recentShare >= 0.5 && baselineShare < 0.25) ? "accelerating"
      : materialChanges > 0 ? "emerging"
      : baselineShare > 0.08 && recentShare === 0 ? "slowing"
      : theme.recentChangeCount7d === 0 && theme.discussionProposalCount > 0 ? "stable"
      : "insufficient evidence";
    return {
      theme: theme.theme,
      direction,
      reason: directionReason(direction, theme, materialChanges),
      reasoning: themeReasoning(direction, theme, recentShare, baselineShare, materialChanges),
      newProposals: theme.recentChangeCount7d,
      materialChanges,
      implementationActivity,
      discussionActivity: theme.discussionProposalCount,
      recentShare,
      baselineShare,
      maturityChange: theme.maturitySignal === "high" ? 2 : theme.maturitySignal === "medium" ? 1 : 0,
      independentActors: Math.max(1, theme.representativeProposals.length),
      confidence: materialChanges ? Math.min(80, 55 + Math.round(Math.abs(recentShare - baselineShare) * 100)) : 35,
      topEvidence: theme.representativeProposals.slice(0, 3).map((item) => `${item.id} ${item.status}`),
    };
  });
}

function buildAccountAbstractionIntelligence(
  report: SignalReport,
  stories: IntelligenceTopStory[],
  followUps: FollowUpItem[],
): AccountAbstractionIntelligence {
  const aaStories = stories.filter((story) => story.affectedSystems.some((system) => /wallet|account|authorization|paymaster|bundler/i.test(system)));
  const radar = report.ethereumTechRadar.accountAbstractionRadar;
  if (!aaStories.length && radar.proposalCount === 0) {
    return {
      meaningful: false,
      conclusion: "No evidence-based Account Abstraction development is available for this run.",
      subdomains: [],
      assumptionChange: "none supported",
      implementationStatus: "not assessed",
      walletImplication: "no current preparation required",
      followUp: [],
      evidence: [],
    };
  }
  const subdomains = [...new Set([
    ...Object.keys(radar.subTrendDistribution ?? {}),
    ...aaStories.flatMap((story) => story.affectedSystems),
  ])].slice(0, 8);
  return {
    meaningful: aaStories.length > 0,
    conclusion: aaStories.length
      ? `Current AA direction: ${aaDirection(subdomains)}. The evidence points to wallet usability and authorization assumptions more than base protocol activation.`
      : "Account Abstraction remains a long-term tracked area without a meaningful weekly change.",
    subdomains,
    assumptionChange: aaStories.length ? "EOA delegation, scoped permission, sponsorship, or smart-account assumptions may need review when implementation evidence appears." : "no supported assumption change this week",
    implementationStatus: aaStories.some((story) => /implementation/i.test(story.maturity)) ? "implementation evidence present" : "no verified implementation evidence",
    walletImplication: "AA developers should watch whether these signals become wallet, bundler, paymaster, or execution-client work rather than treating proposal activity as adoption.",
    followUp: followUps.filter((item) => /wallet|custody|protocol/.test(item.owner)).slice(0, 3),
    evidence: aaStories.flatMap((story) => story.evidence).slice(0, 5),
  };
}

function buildKgldAssessments(report: SignalReport, stories: IntelligenceTopStory[]): KgldCausalAssessment[] {
  const candidates = report.kgldOpportunityRadar.candidates;
  const storyByProposal = new Map<string, IntelligenceTopStory>();
  for (const story of stories) {
    for (const proposalId of story.relatedProposals) {
      if (!storyByProposal.has(proposalId)) storyByProposal.set(proposalId, story);
    }
  }
  return candidates.map((candidate) => kgldAssessmentForCandidateV2(candidate, storyByProposal.get(candidate.proposalId)))
    .filter((item) => item.relevance !== "none" || item.confidence >= 20)
    .slice(0, 8);
}

function kgldAssessmentForStory(story: IntelligenceTopStory, candidate: KgldCandidate | undefined): KgldCausalAssessment {
  if (!candidate) {
    return {
      proposalId: story.relatedProposals[0],
      signal: story.headline,
      relevance: "none",
      proposalFunction: "확인된 KGLD 관련 기능 없음",
      changedTechnicalAssumption: "이번 수집에서 KGLD 기술 가정을 바꾸는 직접 근거가 확인되지 않았습니다.",
      affectedComponent: "No identifiable relevance",
      currentKgldDependency: "UNKNOWN",
      causalPath: "No evidence-based KGLD causal path was identified.",
      currentMaturity: story.maturity,
      timeHorizon: "irrelevant",
      requiredResponse: "No action.",
      recommendedAction: "IGNORE",
      followUpTrigger: "Reassess only if implementation or wallet/custody evidence appears.",
      evidenceIds: [],
      evidenceConfidence: story.confidenceMetrics?.evidenceConfidence ?? story.confidence,
      evidence: story.evidence,
      confidence: 30,
    };
  }
  const wallet = candidate.potentialUseCases.includes("KGLD Wallet UX") || /wallet|authorization|account/i.test(story.whyItMatters);
  const lifecycle = candidate.potentialUseCases.includes("KGLD Token / Issue / Redeem");
  const compliance = candidate.potentialUseCases.includes("Compliance / Security") || /identity|credential|compliance/i.test(story.headline);
  const affectedComponent = wallet ? "wallet" : lifecycle ? "settlement" : compliance ? "compliance" : "none";
  const evidenceConfidence = story.confidenceMetrics?.evidenceConfidence ?? story.confidence;
  const implementationReady = /Verified Implementation|Released|Activated|Production/.test(story.maturity);
  const directDependency = false;
  const recommendedAction = kgldRecommendedAction(candidate, affectedComponent, evidenceConfidence, implementationReady, directDependency);
  return {
    proposalId: candidate.proposalId,
    signal: story.headline,
    relevance: recommendedAction === "IGNORE" ? "none" : recommendedAction === "MONITOR" ? "speculative" : directDependency ? "direct" : "indirect",
    proposalFunction: candidate.oneLineSummary,
    changedTechnicalAssumption: technicalAssumptionForKgld(story, candidate),
    affectedComponent,
    currentKgldDependency: directDependency ? "USED" : "UNKNOWN",
    causalPath: wallet
      ? "제안 기능이 지갑 권한, 서명, 후원, 스마트 계정 가정과 연결됩니다. 다만 현재 KGLD가 해당 기능을 직접 사용한다는 근거는 확인되지 않았습니다."
      : lifecycle
        ? "제안 기능이 토큰 생애주기, 수탁, 가격 산정, 이전, 정산 가정과 개념적으로 연결됩니다. KGLD 적용 여부는 구체 인터페이스와 구현 근거가 필요합니다."
        : compliance
          ? "제안 기능이 신원, 증명, 제한 이전 의미론과 연결됩니다. 운영 컴플라이언스 영향은 실제 채택 또는 인프라 지원 근거가 있어야 판단할 수 있습니다."
          : "키워드 중복 외에 KGLD 운영 구성요소로 이어지는 인과관계는 확인되지 않았습니다.",
    potentialBenefit: recommendedAction === "IGNORE" ? undefined : "중기 검토 가능성은 있으나 현재 실행 가설로 확정하지 않습니다.",
    potentialRisk: "근거 없이 PoC 또는 채택으로 올리면 구현·법무·운영 준비도를 과대평가할 수 있습니다.",
    currentMaturity: story.maturity,
    timeHorizon: recommendedAction === "REVIEW" || recommendedAction === "TECHNICAL_ASSESSMENT" ? "medium-term" : recommendedAction === "IGNORE" ? "irrelevant" : "speculative",
    requiredResponse: kgldRequiredResponse(recommendedAction, affectedComponent),
    recommendedAction,
    followUpTrigger: story.followUpTrigger,
    evidenceIds: story.scoreBreakdown.flatMap((item) => item.evidenceIds ?? []),
    evidenceConfidence,
    evidence: story.evidence,
    confidence: evidenceConfidence,
  };
}

function kgldRecommendedAction(
  candidate: KgldCandidate,
  affectedComponent: string,
  evidenceConfidence: number,
  implementationReady: boolean,
  directDependency: boolean,
): KgldCausalAssessment["recommendedAction"] {
  if (affectedComponent === "none" || candidate.relevanceScore < 35) return "IGNORE";
  if (!directDependency && !implementationReady) return candidate.relevanceScore >= 65 ? "REVIEW" : "MONITOR";
  if (directDependency && implementationReady && evidenceConfidence >= 70) return "TECHNICAL_ASSESSMENT";
  return "REVIEW";
}

function technicalAssumptionForKgld(story: IntelligenceTopStory, candidate: KgldCandidate): string {
  if (candidate.potentialUseCases.includes("KGLD Wallet UX")) return "지갑 승인, 서명 정책, 계정 권한 위임 가정이 바뀔 수 있습니다.";
  if (candidate.potentialUseCases.includes("KGLD Token / Issue / Redeem")) return "발행, 상환, 정산 또는 수탁 흐름의 인터페이스 가정이 바뀔 수 있습니다.";
  if (candidate.potentialUseCases.includes("Compliance / Security")) return "컴플라이언스 검증, 증명, 제한 이전 정책 가정이 바뀔 수 있습니다.";
  return `${story.headline} 관련 직접 가정 변화는 이번 수집에서 확인되지 않았습니다.`;
}

function kgldRequiredResponse(action: KgldCausalAssessment["recommendedAction"], component: string): string {
  if (action === "IGNORE") return "현재 대응 없음.";
  if (action === "MONITOR") return "관찰만 수행합니다. 구현 또는 채택 trigger가 확인되기 전에는 PoC를 시작하지 않습니다.";
  if (action === "REVIEW") return `${component} 관점의 명세 검토 후보입니다. 구현체나 실제 사용 근거가 확인되면 기술 평가로 올립니다.`;
  if (action === "TECHNICAL_ASSESSMENT") return `${component} 관점의 기술 평가가 필요합니다.`;
  if (action === "POC") return "명확한 use case, 구현체, 성공 기준이 확인된 경우에만 PoC를 시작합니다.";
  return "채택은 PoC, 보안, 법무, 운영 검토 이후에만 가능합니다.";
}

function kgldAssessmentForCandidateV2(candidate: KgldCandidate, story: IntelligenceTopStory | undefined): KgldCausalAssessment {
  const text = `${candidate.proposalId} ${candidate.title ?? ""} ${candidate.oneLineSummary ?? ""} ${candidate.matchedKeywords.join(" ")}`.toLowerCase();
  const affectedComponent = kgldAffectedComponentV2(candidate, text);
  const currentKgldDependency: KgldCausalAssessment["currentKgldDependency"] = affectedComponent === "none" ? "NOT_USED" : "UNKNOWN";
  const evidenceConfidence = story?.confidenceMetrics?.evidenceConfidence ?? Math.min(45, Math.round(candidate.relevanceScore * 0.45));
  const implementationReady = story ? /Verified Implementation|Released|Activated|Production/.test(story.maturity) : false;
  const recommendedAction = evaluateKgldActionGateV2(candidate, affectedComponent, currentKgldDependency, evidenceConfidence, implementationReady);
  return {
    proposalId: candidate.proposalId,
    signal: candidate.title ?? candidate.proposalId,
    relevance: recommendedAction === "IGNORE" ? "none" : "speculative",
    proposalFunction: proposalFunctionForKgldV2(candidate),
    changedTechnicalAssumption: technicalAssumptionForKgldV2(candidate, text),
    affectedComponent,
    currentKgldDependency,
    causalPath: causalPathForKgldV2(affectedComponent, currentKgldDependency),
    potentialBenefit: recommendedAction === "IGNORE" ? undefined : "중기 검토 가능성은 있으나 현재 실행 가설로 확정하지 않습니다.",
    potentialRisk: "근거 없이 PoC 또는 채택으로 올리면 구현·법무·운영 준비도를 과대평가할 수 있습니다.",
    currentMaturity: story?.maturity ?? candidate.status ?? "상태 확인 필요",
    timeHorizon: recommendedAction === "REVIEW" || recommendedAction === "TECHNICAL_ASSESSMENT" ? "medium-term" : recommendedAction === "IGNORE" ? "irrelevant" : "speculative",
    requiredResponse: kgldRequiredResponseV2(recommendedAction, affectedComponent),
    recommendedAction,
    followUpTrigger: kgldTriggerForCandidateV2(candidate, affectedComponent),
    evidenceIds: story?.scoreBreakdown.flatMap((item) => item.evidenceIds ?? []) ?? candidate.reasonCodes,
    evidenceConfidence,
    evidence: story?.evidence ?? candidate.reasonCodes,
    confidence: evidenceConfidence,
  };
}

function proposalFunctionForKgldV2(candidate: KgldCandidate): string {
  const title = candidate.title ?? candidate.proposalId;
  const summary = candidate.oneLineSummary && candidate.oneLineSummary !== title ? ` ${candidate.oneLineSummary}` : "";
  return `${candidate.proposalId} ${title}${summary}`.trim();
}

function technicalAssumptionForKgldV2(candidate: KgldCandidate, proposalText: string): string {
  if (/wallet|account abstraction|delegat|session key|paymaster|passkey|authenticat/.test(proposalText)) return "지갑 권한, 서명 정책, 계정 권한 위임 또는 수수료 후원 가정이 바뀔 수 있습니다.";
  if (/vault|redemption|settlement|tokenized|mint|burn/.test(proposalText)) return "발행, 상환, 수탁, 결제·정산 또는 토큰화 흐름의 인터페이스 가정이 바뀔 수 있습니다.";
  if (/oracle|nav|proof of reserve|attestation|compliance|restricted transfer/.test(proposalText)) return "준비금 증명, 가치 산정, 컴플라이언스 기록 또는 제한 전송 가정이 바뀔 수 있습니다.";
  if (/hardfork|fork|upgrade|meta/.test(proposalText)) return "네트워크 업그레이드 범위와 일정 관리 가정이 바뀔 수 있습니다.";
  return `${candidate.proposalId}가 KGLD 기술 가정을 직접 바꾼다는 근거는 이번 수집에서 확인되지 않았습니다.`;
}

function kgldAffectedComponentV2(candidate: KgldCandidate, proposalText: string): string {
  if (/repository split|eip repository|erc repository|meta eip|meta erc/.test(proposalText)) return "none";
  if (/wallet|account abstraction|delegat|session key|paymaster|passkey|authenticat/.test(proposalText)) return "wallet";
  if (/vault|redemption|settlement|tokenized/.test(proposalText)) return "settlement";
  if (/oracle|nav|proof of reserve|attestation/.test(proposalText)) return "por";
  if (/compliance|restricted transfer|allowlist|kyc/.test(proposalText)) return "compliance";
  if (candidate.relevanceScore < 55) return "none";
  return "infrastructure";
}

function causalPathForKgldV2(component: string, dependency: NonNullable<KgldCausalAssessment["currentKgldDependency"]>): string {
  if (component === "none") return "KGLD 운영 구성요소로 이어지는 구체적 인과관계는 확인되지 않았습니다.";
  if (component === "wallet") return "제안 기능이 지갑 권한, 서명 또는 계정 추상화 가정과 연결될 수 있습니다. 다만 현재 KGLD가 해당 기능에 의존한다는 근거는 확인되지 않았습니다.";
  if (component === "settlement") return "제안 기능이 토큰화된 vault, 상환 또는 결제·정산 인터페이스와 개념적으로 연결될 수 있습니다. 실제 적용 여부는 KGLD 의존성과 구현 근거가 필요합니다.";
  if (component === "por") return "제안 기능이 준비금 증명, NAV, 자산 attestation 같은 검증 기록과 연결될 수 있습니다. KGLD 요구사항과 인터페이스 일치 여부는 별도 확인이 필요합니다.";
  if (component === "compliance") return "제안 기능이 제한 전송이나 컴플라이언스 기록과 연결될 수 있습니다. 현재 의존성이 확인되지 않았으므로 실행 판단은 보류합니다.";
  return dependency === "UNKNOWN" ? "인프라 관련 가능성은 있으나 현재 KGLD 의존성은 확인되지 않았습니다." : "KGLD 구성요소와의 연결 가능성이 있어 추가 근거를 확인합니다.";
}

function kgldTriggerForCandidateV2(candidate: KgldCandidate, component: string): string {
  if (component === "wallet") return `${candidate.proposalId}의 실제 wallet SDK 구현, production wallet integration, 또는 KGLD 지갑 use case가 확인될 때 재검토합니다.`;
  if (component === "settlement") return `${candidate.proposalId}의 Final 전환, 복수 구현, 또는 KGLD 발행·상환·정산 인터페이스와의 직접 일치가 확인될 때 재검토합니다.`;
  if (component === "por") return `${candidate.proposalId}의 신뢰 가능한 인프라 제공자 지원, production integration, 또는 KGLD PoR 요구와의 인터페이스 일치가 확인될 때 재검토합니다.`;
  if (component === "compliance") return `${candidate.proposalId}의 RWA compliance 구현, Final 전환, 또는 KGLD 규제 이벤트 기록 요구와의 직접 일치가 확인될 때 재검토합니다.`;
  return `${candidate.proposalId}에서 KGLD 구성요소와 직접 연결되는 구현·채택 근거가 나타나는지 확인합니다.`;
}

function evaluateKgldActionGateV2(
  candidate: KgldCandidate,
  affectedComponent: string,
  currentKgldDependency: NonNullable<KgldCausalAssessment["currentKgldDependency"]>,
  evidenceConfidence: number,
  implementationReady: boolean,
): KgldCausalAssessment["recommendedAction"] {
  if (affectedComponent === "none" || candidate.relevanceScore < 35) return "IGNORE";
  if (currentKgldDependency === "UNKNOWN" || currentKgldDependency === "NOT_USED") return "MONITOR";
  if (!implementationReady) return "REVIEW";
  if (implementationReady && evidenceConfidence >= 70) return "TECHNICAL_ASSESSMENT";
  return "REVIEW";
}

function kgldRequiredResponseV2(action: KgldCausalAssessment["recommendedAction"], component: string): string {
  if (action === "IGNORE") return "현재 대응하지 않습니다.";
  if (action === "MONITOR") return "관찰만 수행합니다. 구현 또는 채택 trigger가 확인되기 전에는 PoC를 시작하지 않습니다.";
  if (action === "REVIEW") return `${component} 관점의 명세 검토만 수행합니다. 구현체나 실제 사용 근거가 확인되면 기술 평가로 올립니다.`;
  if (action === "TECHNICAL_ASSESSMENT") return `${component} 관점의 기술 평가가 필요합니다.`;
  if (action === "POC") return "명확한 use case, 구현체, 성공 기준이 확인된 경우에만 PoC를 시작합니다.";
  return "채택은 PoC, 보안, 법무, 운영 검토 이후에만 가능합니다.";
}

function buildFollowUpQueue(report: SignalReport, stories: IntelligenceTopStory[], events: IntelligenceEvent[]): FollowUpItem[] {
  const items = stories.map((story): FollowUpItem => ({
    target: story.relatedProposals[0] ?? story.headline,
    currentState: story.maturity,
    nextTrigger: story.followUpTrigger,
    rationale: followUpRationaleV2(story),
    sourceToMonitor: sourceToMonitor(story),
    owner: ownerForStory(story),
    recommendedResponse: responseForDecisionV2(story.decisionState ?? "MONITOR"),
    urgency: story.priority,
    expectedReviewHorizon: story.decisionState === "ACTION_REQUIRED" || story.decisionState === "TECHNICAL_REVIEW" ? "다음 주간 보고 전" : "향후 2~4회 주간 보고",
  }));
  if (!items.length && events.length === 0) {
    const quiet = report.ethereumTechRadar.watchlistLayer?.items[0];
    if (quiet) {
      items.push({
        target: quiet.relatedProposals[0] ?? quiet.title,
        currentState: "관찰",
        nextTrigger: "상태 변경, 클라이언트 PR 생성, 또는 editor의 실질적 피드백이 확인될 때 재검토합니다.",
        rationale: "의미 있는 주간 변화가 확인되지 않았으므로 상태 변경, 구현 근거, 또는 실질적인 논의 근거가 생길 때까지 기다립니다.",
        sourceToMonitor: quiet.evidence[0] ?? "canonical proposal 및 discussion thread",
        owner: "protocol research",
        recommendedResponse: "즉시 조치 없음. 관찰 trigger만 유지합니다.",
        urgency: "WATCH",
        expectedReviewHorizon: "다음 주간 보고",
      });
    }
  }
  return items.slice(0, 10);
}

function clusterForEvent(event: IntelligenceEvent): string {
  const themes = event.affectedThemes.length ? event.affectedThemes : ["Unclassified"];
  if (themes.some((theme) => /Account Abstraction|Wallet UX|Smart Account|Session Key|Passkey|Gasless|Paymaster/i.test(theme))) return "Account Abstraction";
  if (themes.some((theme) => /Transaction Model|Execution|EVM|Gas|Opcode/i.test(theme))) return "Execution and Transaction Model";
  if (themes.some((theme) => /Identity|Credential|Compliance|RWA|Attestation/i.test(theme))) return "Identity, Compliance, and RWA";
  if (themes.some((theme) => /Data Availability|Rollup|L2|Cross-chain|Bridge/i.test(theme))) return "Scaling and Interoperability";
  if (themes.some((theme) => /Network Upgrade|Governance|Validator|Block/i.test(theme))) return "Network Upgrade and Validator Operations";
  if (themes.some((theme) => /Developer Tooling|Process/i.test(theme))) return "Developer Tooling";
  return themes[0] ?? "Unclassified";
}

function storyHeadline(cluster: string, proposals: string[]): string {
  const suffix = proposals.length > 1 ? `${proposals.length} proposals` : proposals[0] ?? "tracked proposals";
  if (cluster === "Account Abstraction") return `Wallet and Account Abstraction signals cluster across ${suffix}`;
  if (cluster === "Execution and Transaction Model") return `Execution semantics and transaction design remain the main protocol watch`;
  if (cluster === "Identity, Compliance, and RWA") return `Identity and compliance proposals create medium-term operational watchpoints`;
  if (cluster === "Scaling and Interoperability") return `Scaling and interoperability work remains proposal-led`;
  return `${cluster} clusters across ${suffix}`;
}

function clusteredChangeSummary(events: IntelligenceEvent[], proposals: string[]): string {
  const typeCounts = countBy(events, (event) => event.eventType);
  const parts = Object.entries(typeCounts).map(([type, count]) => `${type} ${count}`);
  return `${parts.join("; ")} across ${proposals.join(", ")}`;
}

function clusteredEvidence(report: SignalReport, events: IntelligenceEvent[], proposals: string[]): string[] {
  const evidence = events.map((event) => event.evidence).filter(Boolean);
  const proposalLabels = proposals.map((proposalId) => {
    const title = titleForProposal(report, proposalId);
    const status = statusForProposal(report, proposalId);
    return `${proposalId}${title && title !== proposalId ? ` ${title}` : ""}${status ? ` (${status})` : ""}`;
  });
  return [...proposalLabels, ...evidence].slice(0, 7);
}

function maturitySummary(report: SignalReport, proposals: string[]): string {
  const statuses = proposals.map((proposalId) => statusForProposal(report, proposalId)).filter((status): status is string => Boolean(status));
  const unique = [...new Set(statuses)];
  if (!unique.length) return "maturity unavailable";
  return unique.length === 1 ? unique[0] : `mixed maturity: ${unique.join(", ")}`;
}

function followUpForCluster(cluster: string, events: IntelligenceEvent[], fallbackProposal: string): string {
  if (cluster === "Account Abstraction") return "Watch for wallet, bundler, paymaster, or client implementation evidence; escalate when one major implementation appears.";
  if (cluster === "Execution and Transaction Model") return "Watch for execution-client PRs, specification test updates, or fork-candidate inclusion.";
  if (cluster === "Identity, Compliance, and RWA") return "Watch for implementation references or wallet/custody integration before business review.";
  const strongest = events[0]?.eventType ?? "NO_MEANINGFUL_CHANGE";
  return followUpForEvent(strongest, fallbackProposal);
}

function followUpRationale(story: IntelligenceTopStory): string {
  const blockers = [
    /no verified implementation|maturity unavailable|구현 근거 없음/i.test(story.maturity) ? "검증된 구현 근거가 아직 없음" : "",
    story.evidence.some((item) => /discussion|reply|participant|논의|댓글|참여자/i.test(item)) ? "논의 신호의 실질 내용 확인 필요" : "",
    !/released|activated|production|Released|Activated|Production/i.test(story.maturity) ? "릴리스 또는 활성화 근거 없음" : "",
    story.relatedProposals.length > 1 ? "관련 제안이 같은 속도로 진행된다는 근거 없음" : "",
  ].filter(Boolean);
  return blockers.length ? `관찰 이유: ${blockers.join(", ")}.` : "다음 trigger가 검토 우선순위를 바꿀 수 있어 관찰합니다.";
}

function followUpRationaleV2(story: IntelligenceTopStory): string {
  const blockers = [
    /no verified implementation|maturity unavailable|성숙도 확인 불가|구현 근거 없음/i.test(story.maturity) ? "검증된 구현 근거가 아직 없음" : "",
    story.evidence.some((item) => /discussion|reply|participant|논의|댓글|참여자/i.test(item)) ? "논의 신호는 실제 구현 근거와 분리해 확인 필요" : "",
    !/released|activated|production|Released|Activated|Production/i.test(story.maturity) ? "릴리스 또는 활성화 근거 없음" : "",
    story.relatedProposals.length > 1 ? "관련 제안이 같은 속도로 진행된다는 근거 없음" : "",
  ].filter(Boolean);
  return blockers.length ? `관찰 이유: ${blockers.join(", ")}.` : "다음 trigger가 검토 우선순위를 바꿀 수 있어 관찰합니다.";
}

function aaDirection(subdomains: string[]): string {
  if (subdomains.some((item) => /paymaster|gas/i.test(item))) return "transaction sponsorship and wallet infrastructure";
  if (subdomains.some((item) => /session|delegation|permission/i.test(item))) return "delegated authorization and scoped permissions";
  if (subdomains.some((item) => /passkey|signature/i.test(item))) return "signature abstraction and wallet authentication";
  return "wallet usability and account programmability";
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyOf(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function priorityForScore(score: number): IntelligencePriority {
  if (score >= 85) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 35) return "MEDIUM";
  if (score >= 10) return "WATCH";
  return "ARCHIVE";
}

function followUpForEvent(type: IntelligenceEventType, proposalId: string): string {
  if (type === "STATUS_CHANGED") return `Recheck ${proposalId} when editor feedback or implementation references appear.`;
  if (type === "SPEC_TEXT_CHANGED" || type === "NORMATIVE_CHANGE") return `Escalate ${proposalId} if the changed specification section affects security, compatibility, or client behavior.`;
  if (type === "ACCOUNT_ABSTRACTION_SIGNAL") return `Begin wallet impact review when a major wallet, bundler, paymaster, or execution client implements ${proposalId}.`;
  if (type === "CLIENT_PR_OPENED") return `Escalate ${proposalId} when a second independent client starts implementation.`;
  return `Monitor ${proposalId} for status change, client PR, release note, or activation planning.`;
}

function sourceToMonitor(story: IntelligenceTopStory): string {
  if (story.evidence[0]?.startsWith("http")) return story.evidence[0];
  if (story.affectedSystems.some((item) => /wallet|account/i.test(item))) return "Account Abstraction repositories and wallet implementation sources";
  return "canonical proposal, discussion thread, and client repositories";
}

function ownerForStory(story: IntelligenceTopStory): FollowUpItem["owner"] {
  if (story.affectedSystems.some((item) => /wallet|custody|authorization|account/i.test(item))) return "wallet or custody";
  if (story.affectedSystems.some((item) => /security/i.test(item))) return "security";
  if (story.affectedSystems.some((item) => /execution|client/i.test(item))) return "protocol research";
  return story.priority === "WATCH" ? "protocol research" : "product";
}

function responseForDecision(decision: DecisionState): string {
  if (decision === "ACTION_REQUIRED") return "직접 근거가 확인된 대응 항목입니다.";
  if (decision === "TECHNICAL_REVIEW") return "기술 검토를 준비하고 다음 근거 trigger를 확인합니다.";
  if (decision === "PRIORITY_WATCH") return "우선 관찰합니다. 구현, 릴리스, 활성화 근거가 확인되기 전에는 실행하지 않습니다.";
  if (decision === "MONITOR") return "관찰만 수행합니다.";
  if (decision === "BACKGROUND") return "참고 배경으로 유지합니다.";
  return "근거 부족으로 판단을 보류합니다.";
}

function responseForDecisionV2(decision: DecisionState): string {
  if (decision === "ACTION_REQUIRED") return "직접 근거가 확인된 대응 항목입니다.";
  if (decision === "TECHNICAL_REVIEW") return "기술 검토를 준비하고 다음 근거 trigger를 확인합니다.";
  if (decision === "PRIORITY_WATCH") return "우선 관찰합니다. 구현, 릴리스, 활성화 근거가 확인되기 전에는 실행하지 않습니다.";
  if (decision === "MONITOR") return "관찰만 수행합니다.";
  if (decision === "BACKGROUND") return "참고 배경으로 유지합니다.";
  return "근거 부족으로 판단을 보류합니다.";
}

function themesForProposal(report: SignalReport, proposalId: string): string[] {
  return report.ethereumTechRadar.themeInsights
    .filter((theme) => theme.representativeProposals.some((proposal) => proposal.id === proposalId))
    .map((theme) => theme.theme);
}

function titleForProposal(report: SignalReport, proposalId: string): string {
  for (const theme of report.ethereumTechRadar.themeInsights) {
    const proposal = theme.representativeProposals.find((item) => item.id === proposalId);
    if (proposal?.title) return proposal.title;
  }
  const discussion = report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === proposalId);
  return discussion?.title ?? proposalId;
}

function statusForProposal(report: SignalReport, proposalId: string): string | undefined {
  for (const theme of report.ethereumTechRadar.themeInsights) {
    const proposal = theme.representativeProposals.find((item) => item.id === proposalId);
    if (proposal?.status) return proposal.status;
  }
  return report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === proposalId)?.status ?? undefined;
}

function affectedSystemsForThemes(themes: string[]): string[] {
  const systems = new Set<string>();
  for (const theme of themes) {
    if (/Account Abstraction|Smart Account|Wallet|Session|Passkey|Paymaster/i.test(theme)) systems.add("wallet authorization");
    if (/Transaction Model|Execution|EVM|Gas|Opcode/i.test(theme)) systems.add("execution clients");
    if (/Token|RWA|Vault|Oracle|Compliance|Cross-chain/i.test(theme)) systems.add("tokenized commodity operations");
    if (/Security|Signature/i.test(theme)) systems.add("security review");
  }
  return systems.size ? [...systems] : ["protocol research"];
}

function directionReason(direction: ThemeIntelligenceSignal["direction"], theme: ThemeInsight, materialChanges: number): string {
  if (direction === "accelerating") return `${theme.theme} has ${materialChanges} material current-period signals.`;
  if (direction === "emerging") return `${theme.theme} has at least one material current-period signal.`;
  if (direction === "slowing") return `${theme.theme} has historical concentration but little current-period movement.`;
  if (direction === "stable") return `${theme.theme} has discussion context but no material weekly change.`;
  return `Insufficient current-period evidence for ${theme.theme}.`;
}

function themeReasoning(
  direction: ThemeIntelligenceSignal["direction"],
  theme: ThemeInsight,
  recentShare: number,
  baselineShare: number,
  materialChanges: number,
): string {
  const recentPct = Math.round(recentShare * 100);
  const baselinePct = Math.round(baselineShare * 100);
  if (direction === "accelerating") return `${theme.theme} accounts for ${recentPct}% of current changes versus ${baselinePct}% of the 180-day baseline, with ${materialChanges} material signal(s).`;
  if (direction === "emerging") return `${theme.theme} has current-period evidence, but the share change is not strong enough to call acceleration.`;
  if (direction === "slowing") return `${theme.theme} remains visible in the 180-day baseline but did not produce enough current-period evidence.`;
  if (direction === "stable") return `${theme.theme} has discussion context without a verified weekly movement.`;
  return `The current evidence is insufficient to infer a directional trend for ${theme.theme}.`;
}

function scoreBreakdownTotal(items: ScoreBreakdownItem[]): number {
  return Math.max(0, Math.min(100, items.reduce((sum, item) => sum + item.value, 0)));
}

function dedupeEvents(events: IntelligenceEvent[]): IntelligenceEvent[] {
  const byKey = new Map<string, IntelligenceEvent>();
  for (const event of events) {
    const key = `${event.entity}:${event.eventType}:${event.evidence}`;
    const existing = byKey.get(key);
    if (!existing || event.significance > existing.significance) byKey.set(key, event);
  }
  return [...byKey.values()];
}

function isAccountAbstractionText(value: string): boolean {
  const lower = value.toLocaleLowerCase("en-US");
  return AA_KEYWORDS.some((keyword) => lower.includes(keyword));
}
