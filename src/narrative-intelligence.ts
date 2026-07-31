import type { KnowledgeCausalChain, KnowledgeGraphLayer, KnowledgeNode } from "./knowledge-graph.ts";
import type { TopicCluster, TopicClusterLayer } from "./topic-cluster.ts";
import type { WeeklyRadarReport } from "./types.ts";

export type NarrativeParagraph = {
  id: string;
  text: string;
  supportingChainIds: string[];
  supportingEvidenceIds: string[];
  confidence: number;
  generatedFromRules: string[];
  ruleName: string;
};

export type NarrativeDocument = {
  id: string;
  title: string;
  paragraphs: NarrativeParagraph[];
  generatedBy: "deterministic_narrative_intelligence";
};

export type TopicNarrativeDocument = NarrativeDocument & {
  topicId: string;
};

export type CrossTopicNarrativeDocument = NarrativeDocument & {
  topicIds: string[];
  sharedNodeIds: string[];
};

export type BusinessNarrativeDocument = NarrativeDocument & {
  stakeholder: BusinessStakeholderGroup;
};

export type BusinessStakeholderGroup =
  | "Wallet Providers"
  | "Exchanges"
  | "Rollups"
  | "Infrastructure Providers"
  | "Custodians"
  | "Institutions"
  | "Tokenization Projects"
  | "Enterprise Integrators";

export type NarrativeIntelligenceDebug = {
  "executive.json": NarrativeDocument;
  "topics.json": TopicNarrativeDocument[];
  "cross_topics.json": CrossTopicNarrativeDocument[];
  "momentum.json": NarrativeDocument[];
  "contradictions.json": NarrativeDocument[];
  "business.json": BusinessNarrativeDocument[];
};

type NarrativeInput = {
  report: WeeklyRadarReport;
};

const GENERATED_BY = "deterministic_narrative_intelligence" as const;

const BUSINESS_GROUPS: Record<BusinessStakeholderGroup, string[]> = {
  "Wallet Providers": ["Wallet Provider"],
  "Exchanges": ["Exchange"],
  "Rollups": ["L2 Operator", "Sequencer"],
  "Infrastructure Providers": ["Infrastructure Provider", "Client Maintainer", "Oracle Provider"],
  "Custodians": ["Custodian"],
  "Institutions": ["Asset Issuer", "Compliance Team"],
  "Tokenization Projects": ["Asset Issuer", "Dapp Developer"],
  "Enterprise Integrators": ["Dapp Developer", "Compliance Team"],
};

export function buildNarrativeIntelligenceDebug({ report }: NarrativeInput): NarrativeIntelligenceDebug {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  const topicLayer = report.ethereumTechRadar.topicClusterLayer;
  if (!graph) return emptyNarrativeDebug(report);
  return {
    "executive.json": buildExecutiveNarrative(report, graph),
    "topics.json": buildTopicNarratives(graph, topicLayer),
    "cross_topics.json": buildCrossTopicNarratives(graph, topicLayer),
    "momentum.json": buildMomentumNarratives(graph),
    "contradictions.json": buildContradictionNarratives(graph),
    "business.json": buildBusinessNarratives(graph),
  };
}

function buildExecutiveNarrative(report: WeeklyRadarReport, graph: KnowledgeGraphLayer): NarrativeDocument {
  const primaryChains = topCompleteChains(graph, 5);
  const topConcept = graph.diagnostics.topConceptsByProposalCoverage[0];
  const topMechanism = graph.diagnostics.topMechanismsByProposalCoverage[0];
  const topSystem = graph.diagnostics.topSystemsByIncomingEdges[0];
  const recent = report.ethereumTechRadar.recentChanges.total;
  const watchChains = gappedChains(graph, 5);
  const nextWeekChains = watchChains.length ? watchChains : primaryChains;
  return {
    id: "narrative:executive",
    title: "Executive Narrative",
    generatedBy: GENERATED_BY,
    paragraphs: [
      paragraph("executive", 1, `Current ecosystem status is centered on ${topConcept?.label ?? "tracked Ethereum standards"} with ${graph.graphStatistics.maxPathLength}-hop causal chains available for analysis.`, primaryChains, "rule-executive-current-status", graph.graphStatistics.averagePathLength >= 4 ? 78 : 62),
      paragraph("executive", 2, `Major changes this period are bounded to ${recent} collected proposal event(s), so narrative claims remain tied to graph evidence rather than adoption assumptions.`, primaryChains, "rule-executive-major-changes", 70),
      paragraph("executive", 3, `The strongest root-cause pattern connects ${topConcept?.label ?? "dominant concepts"} through ${topMechanism?.label ?? "registered mechanisms"} into ${topSystem?.label ?? "mapped systems"}.`, primaryChains, "rule-executive-root-cause", scoreFromChains(primaryChains)),
      paragraph("executive", 4, `The emerging direction is longer mechanism-mediated reasoning: average chain length is ${graph.graphStatistics.averagePathLength} and branch factor is ${graph.graphStatistics.averageBranchFactor}.`, primaryChains, "rule-executive-emerging-direction", 76),
      paragraph("executive", 5, `Next week watch items should prioritize proposals whose chains stop before Stakeholder or BusinessImpact because those gaps limit operational interpretation.`, nextWeekChains, "rule-executive-watch-next", 66),
    ],
  };
}

function buildTopicNarratives(graph: KnowledgeGraphLayer, topicLayer: TopicClusterLayer | undefined): TopicNarrativeDocument[] {
  const topics = topicLayer?.clusters ?? graph.nodes.filter((node) => node.type === "Topic").map(topicFromNode);
  return topics.map((topic) => {
    const chains = chainsForTopic(graph, topic.id).slice(0, 4);
    const complete = chains.filter((chain) => chain.complete).length;
    const top = chains[0];
    return {
      id: `narrative:topic:${topic.id}`,
      topicId: topic.id,
      title: topic.displayName,
      generatedBy: GENERATED_BY,
      paragraphs: [
        paragraph(topic.id, 1, `${topic.displayName} changed through ${topic.activityProfile?.weeklyChangedProposalCount ?? 0} current-period proposal signal(s) and ${chains.length} traceable causal chain(s).`, chains, "rule-topic-what-changed", confidenceForTopic(topic.confidence, chains)),
        paragraph(topic.id, 2, `It matters because the strongest chain reaches ${top?.steps.at(-1)?.label ?? "an explicit graph gap"} through ${top?.steps.length ?? 0} node layer(s).`, chains.slice(0, 1), "rule-topic-why-it-matters", top?.chainScore ?? 45),
        paragraph(topic.id, 3, `The direction of evolution is ${complete > 0 ? "operationally mappable" : "evidence-limited"} because ${complete} chain(s) currently reach BusinessImpact.`, chains, "rule-topic-direction", complete > 0 ? 72 : 52),
        paragraph(topic.id, 4, `Confidence is ${confidenceForTopic(topic.confidence, chains)}/100 after combining topic confidence with causal-chain scores.`, chains, "rule-topic-confidence", confidenceForTopic(topic.confidence, chains)),
      ],
    };
  });
}

function buildCrossTopicNarratives(graph: KnowledgeGraphLayer, topicLayer: TopicClusterLayer | undefined): CrossTopicNarrativeDocument[] {
  const topics = topicLayer?.clusters ?? [];
  const docs: CrossTopicNarrativeDocument[] = [];
  for (let i = 0; i < topics.length; i += 1) {
    for (let j = i + 1; j < topics.length; j += 1) {
      const left = topics[i]!;
      const right = topics[j]!;
      const shared = sharedOperationalNodes(graph, left.id, right.id);
      if (shared.length < 2) continue;
      const chains = uniqueChains([...chainsForTopic(graph, left.id), ...chainsForTopic(graph, right.id)]).slice(0, 5);
      docs.push({
        id: `narrative:cross-topic:${left.id}:${right.id}`,
        title: `${left.displayName} / ${right.displayName}`,
        topicIds: [left.id, right.id],
        sharedNodeIds: shared.map((node) => node.id),
        generatedBy: GENERATED_BY,
        paragraphs: [
          paragraph(`${left.id}:${right.id}`, 1, `${left.displayName} and ${right.displayName} are connected through ${shared.slice(0, 3).map((node) => node.label).join(", ")}.`, chains, "rule-cross-topic-shared-operational-node", scoreFromChains(chains)),
          paragraph(`${left.id}:${right.id}`, 2, `The combined narrative should treat these topics as related engineering work only where the shared chains expose the same Concept, Mechanism, or System.`, chains, "rule-cross-topic-bounded-combination", 68),
        ],
      });
    }
  }
  return docs.sort((a, b) => b.paragraphs[0]!.confidence - a.paragraphs[0]!.confidence).slice(0, 8);
}

function buildMomentumNarratives(graph: KnowledgeGraphLayer): NarrativeDocument[] {
  return graph.diagnostics.topConceptsByProposalCoverage
    .filter((item) => item.proposalCount >= 2)
    .slice(0, 6)
    .map((concept, index) => {
      const chains = graph.proposalKnowledgeChains.filter((chain) => chain.steps.some((step) => step.nodeId === concept.id)).slice(0, 5);
      return {
        id: `narrative:momentum:${concept.id}`,
        title: `${concept.label} Momentum`,
        generatedBy: GENERATED_BY,
        paragraphs: [
          paragraph(`momentum:${index}`, 1, `${concept.label} appears across ${concept.proposalCount} proposal-backed chain(s), making it a repeated engineering focus in the current graph.`, chains, "rule-momentum-concept-frequency", scoreFromChains(chains)),
          paragraph(`momentum:${index}`, 2, `This momentum statement is limited to proposal and chain coverage, not ecosystem deployment or production usage.`, chains, "rule-momentum-safeguard", 72),
        ],
      };
    });
}

function buildContradictionNarratives(graph: KnowledgeGraphLayer): NarrativeDocument[] {
  const securityChains = chainsEndingAt(graph, /Security Model Change|Compliance Auditability|Asset Verification Capability/);
  const complexityChains = chainsEndingAt(graph, /Increased Technical Complexity|Client Implementation Requirement|Wallet Integration Requirement/);
  const docs: NarrativeDocument[] = [];
  if (securityChains.length && complexityChains.length) {
    const chains = uniqueChains([...securityChains.slice(0, 3), ...complexityChains.slice(0, 3)]);
    docs.push({
      id: "narrative:contradiction:security-complexity",
      title: "Security / Complexity Trade-off",
      generatedBy: GENERATED_BY,
      paragraphs: [
        paragraph("contradiction:security-complexity", 1, "The graph exposes a trade-off where security-oriented chains and complexity-oriented chains advance at the same time.", chains, "rule-contradiction-security-complexity", scoreFromChains(chains)),
        paragraph("contradiction:security-complexity", 2, "This is a trade-off narrative, not a conflict claim, because accepted CONFLICTS_WITH evidence is not required for complexity to rise alongside security requirements.", chains, "rule-contradiction-tradeoff-safeguard", 64),
      ],
    });
  }
  const conflictChains = graph.proposalKnowledgeChains.filter((chain) => chain.edgeIds.some((edgeId) => edgeId.includes(":CONFLICTS_WITH:")));
  if (conflictChains.length) {
    docs.push({
      id: "narrative:contradiction:explicit-conflict",
      title: "Explicit Conflict Chain",
      generatedBy: GENERATED_BY,
      paragraphs: [
        paragraph("contradiction:explicit-conflict", 1, "At least one chain contains explicit conflict evidence and should be reviewed separately from semantic similarity.", conflictChains, "rule-contradiction-explicit-conflict", scoreFromChains(conflictChains)),
      ],
    });
  }
  return docs;
}

function buildBusinessNarratives(graph: KnowledgeGraphLayer): BusinessNarrativeDocument[] {
  return (Object.keys(BUSINESS_GROUPS) as BusinessStakeholderGroup[]).map((group) => {
    const labels = BUSINESS_GROUPS[group];
    const chains = graph.proposalKnowledgeChains
      .filter((chain) => chain.steps.some((step) => step.type === "Stakeholder" && labels.includes(step.label)))
      .slice(0, 6);
    const supportingChains = chains.length ? chains : graph.proposalKnowledgeChains.slice(0, 3);
    const impactLabels = unique(chains.flatMap((chain) => chain.steps.filter((step) => step.type === "BusinessImpact").map((step) => step.label))).slice(0, 4);
    return {
      id: `narrative:business:${slug(group)}`,
      stakeholder: group,
      title: `${group} Narrative`,
      generatedBy: GENERATED_BY,
      paragraphs: [
        paragraph(`business:${group}`, 1, chains.length ? `${group} are connected to ${impactLabels.join(", ") || "bounded monitoring impacts"} through ${chains.length} causal chain(s).` : `${group} have no complete stakeholder-specific causal chain in this graph run.`, supportingChains, "rule-business-stakeholder-chain", chains.length ? scoreFromChains(chains) : 35),
        paragraph(`business:${group}`, 2, "Business interpretation is stakeholder-specific and does not infer ecosystem uptake, legal compliance, financial return, or required migration without direct evidence.", supportingChains, "rule-business-safeguard", chains.length ? 70 : 45),
      ],
    };
  });
}

function emptyNarrativeDebug(report: WeeklyRadarReport): NarrativeIntelligenceDebug {
  const empty = (id: string, title: string): NarrativeDocument => ({
    id,
    title,
    generatedBy: GENERATED_BY,
    paragraphs: [{
      id: `${id}:p1`,
      text: "No Knowledge Graph was available, so Phase 14 narrative generation was skipped.",
      supportingChainIds: [],
      supportingEvidenceIds: [],
      confidence: 0,
      generatedFromRules: ["rule-empty-no-knowledge-graph"],
      ruleName: "rule-empty-no-knowledge-graph",
    }],
  });
  return {
    "executive.json": empty("narrative:executive", "Executive Narrative"),
    "topics.json": (report.ethereumTechRadar.topicClusterLayer?.clusters ?? []).map((topic) => ({ ...empty(`narrative:topic:${topic.id}`, topic.displayName), topicId: topic.id })),
    "cross_topics.json": [],
    "momentum.json": [],
    "contradictions.json": [],
    "business.json": (Object.keys(BUSINESS_GROUPS) as BusinessStakeholderGroup[]).map((group) => ({ ...empty(`narrative:business:${slug(group)}`, `${group} Narrative`), stakeholder: group })),
  };
}

function paragraph(scope: string, index: number, text: string, chains: KnowledgeCausalChain[], ruleName: string, confidence: number): NarrativeParagraph {
  return {
    id: `paragraph:${slug(scope)}:${index}`,
    text,
    supportingChainIds: chains.map((chain) => chain.id),
    supportingEvidenceIds: unique(chains.flatMap((chain) => chain.traceability.evidenceIds)),
    confidence: clampConfidence(confidence),
    generatedFromRules: [ruleName],
    ruleName,
  };
}

function topCompleteChains(graph: KnowledgeGraphLayer, limit: number): KnowledgeCausalChain[] {
  return graph.proposalKnowledgeChains
    .filter((chain) => chain.steps.length >= 4)
    .sort((left, right) => Number(right.complete) - Number(left.complete) || right.chainScore - left.chainScore)
    .slice(0, limit);
}

function gappedChains(graph: KnowledgeGraphLayer, limit: number): KnowledgeCausalChain[] {
  return graph.proposalKnowledgeChains.filter((chain) => chain.gaps.length > 0).slice(0, limit);
}

function chainsForTopic(graph: KnowledgeGraphLayer, topicId: string): KnowledgeCausalChain[] {
  return graph.proposalKnowledgeChains
    .filter((chain) => chain.traceability.topicIds.includes(topicId) || chain.gaps.some((gap) => gap.topicId === topicId))
    .sort((left, right) => right.chainScore - left.chainScore || right.steps.length - left.steps.length);
}

function sharedOperationalNodes(graph: KnowledgeGraphLayer, leftTopicId: string, rightTopicId: string): KnowledgeNode[] {
  const leftNodeIds = new Set(chainsForTopic(graph, leftTopicId).flatMap((chain) => chain.steps.map((step) => step.nodeId)));
  const rightNodeIds = new Set(chainsForTopic(graph, rightTopicId).flatMap((chain) => chain.steps.map((step) => step.nodeId)));
  return graph.nodes.filter((node) => leftNodeIds.has(node.id) && rightNodeIds.has(node.id) && ["Concept", "Mechanism", "System", "Stakeholder"].includes(node.type));
}

function chainsEndingAt(graph: KnowledgeGraphLayer, pattern: RegExp): KnowledgeCausalChain[] {
  return graph.proposalKnowledgeChains.filter((chain) => chain.steps.some((step) => step.type === "BusinessImpact" && pattern.test(step.label)));
}

function confidenceForTopic(topicConfidence: number, chains: KnowledgeCausalChain[]): number {
  const normalizedTopic = topicConfidence > 0 && topicConfidence <= 1 ? topicConfidence * 100 : topicConfidence;
  return clampConfidence(Math.round(normalizedTopic * 0.4 + scoreFromChains(chains) * 0.6));
}

function scoreFromChains(chains: KnowledgeCausalChain[]): number {
  return chains.length ? clampConfidence(Math.round(chains.reduce((sum, chain) => sum + chain.chainScore, 0) / chains.length)) : 0;
}

function topicFromNode(node: KnowledgeNode): TopicCluster {
  return {
    id: String(node.properties.topicId ?? node.canonicalKey),
    displayName: node.label,
    summary: node.description ?? "",
    proposalIds: node.proposalIds ?? [],
    anchorProposalIds: [],
    supportingProposalIds: [],
    adjacentProposalIds: [],
    themeIds: [],
    primaryThemeIds: [],
    supportingThemeIds: [],
    confidence: node.confidence,
    cohesionScore: 0,
    evidence: [],
    sharedSignals: [],
    maturityProfile: { draft: 0, review: 0, lastCall: 0, final: 0, implementationTracking: 0, implementationCandidate: 0, verifiedImplementation: 0, released: 0, activated: 0, productionAdoption: 0 },
    activityProfile: { proposalCount: 0, weeklyChangedProposalCount: 0, statusChangeCount: 0, newProposalCount: 0, discussionActivity: 0, implementationEvidenceCount: 0, releaseEvidenceCount: 0, averageMaturity: 0, staleEvidenceRatio: 0 },
    state: "insufficient evidence",
    gaps: [],
    limitations: [],
    traceability: { membershipIds: [], evidenceIds: node.traceability.evidenceIds, scoreBreakdown: [] },
    calculationVersion: node.traceability.calculationVersion,
    ruleVersion: node.traceability.ruleVersion,
  };
}

function uniqueChains(chains: KnowledgeCausalChain[]): KnowledgeCausalChain[] {
  const seen = new Set<string>();
  const result: KnowledgeCausalChain[] = [];
  for (const chain of chains) {
    if (seen.has(chain.id)) continue;
    seen.add(chain.id);
    result.push(chain);
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function slug(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
