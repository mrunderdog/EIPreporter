import { GENERIC_TERM_STOPLIST, ONTOLOGY, ONTOLOGY_VERSION, type OntologyEntry } from "./knowledge/ontology.ts";
import type { TopicCluster, TopicClusterLayer, TopicProposalMembership } from "./topic-cluster.ts";
import type { KgldCandidate, ProposalRecord } from "./types.ts";

export type KnowledgeNodeType = "Proposal" | "Topic" | "Concept" | "Mechanism" | "System" | "Stakeholder" | "BusinessImpact";
export type KnowledgeEdgeType =
  | "BELONGS_TO_TOPIC"
  | "DESCRIBES"
  | "INTRODUCES"
  | "USES_MECHANISM"
  | "USES"
  | "IMPLEMENTS"
  | "EXECUTES"
  | "TARGETS"
  | "DEPENDS_ON"
  | "EXTENDS"
  | "SUPERSEDES"
  | "REQUIRES"
  | "CONFLICTS_WITH"
  | "ALTERNATIVE_TO"
  | "ENABLES"
  | "CONSTRAINS"
  | "AFFECTS"
  | "USED_BY"
  | "OPERATED_BY"
  | "RELEVANT_TO"
  | "CREATES_RISK"
  | "MITIGATES"
  | "TRIGGERS"
  | "RELATES_TO";

export type KnowledgeGraphNodeType = KnowledgeNodeType;
export type KnowledgeGraphEdgeType = KnowledgeEdgeType;

export type Traceability = {
  evidenceIds: string[];
  derivedFrom: string[];
  topicIds: string[];
  topicMembershipIds: string[];
  proposalIds: string[];
  source: "proposal_metadata" | "topic_cluster" | "ontology" | "evidence" | "rule_inference";
  reason: string;
  calculationVersion: string;
  ruleVersion: string;
};

export type KnowledgeNode = {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  canonicalKey: string;
  description?: string;
  aliases?: string[];
  proposalIds?: string[];
  topicIds?: string[];
  properties: Record<string, unknown>;
  confidence: number;
  inferred: boolean;
  traceability: Traceability;
};

export type KnowledgeEdge = {
  id: string;
  source: string;
  target: string;
  from: string;
  to: string;
  type: KnowledgeEdgeType;
  confidence: number;
  inferred: boolean;
  evidenceIds: string[];
  derivedFrom: string[];
  reasoning: string;
  limitations: string[];
  properties: Record<string, unknown>;
  traceability: Traceability;
  strength: EdgeStrength;
  accepted: boolean;
};

export type KnowledgeGraphNode = KnowledgeNode;
export type KnowledgeGraphEdge = KnowledgeEdge;

export type EdgeStrength = "strong" | "supporting" | "weak" | "rejected";

export type KnowledgePathStep = {
  nodeId: string;
  label: string;
  type: KnowledgeNodeType;
  edgeType?: KnowledgeEdgeType;
  confidence?: number;
  inferred?: boolean;
  evidenceCount?: number;
};

export type TopicKnowledgePath = {
  topicId: string;
  topicLabel: string;
  proposalId?: string;
  complete: boolean;
  steps: KnowledgePathStep[];
  gaps: KnowledgeGraphGap[];
};

export type CausalChainRole = "primary" | "supporting" | "alternative" | "conflict";

export type KnowledgeCausalChain = {
  id: string;
  proposalId: string;
  role: CausalChainRole;
  complete: boolean;
  chainScore: number;
  coverageScore: number;
  edgeConfidenceScore: number;
  evidenceScore: number;
  ontologyConfidenceScore: number;
  reasoningConfidenceScore: number;
  steps: KnowledgePathStep[];
  edgeIds: string[];
  gaps: KnowledgeGraphGap[];
  traceability: Traceability;
};

export type NarrativeChainPreparation = {
  primaryChain?: KnowledgeCausalChain;
  topSupportingChains: KnowledgeCausalChain[];
  alternativeChain?: KnowledgeCausalChain;
  conflictChain?: KnowledgeCausalChain;
};

export type GraphStatistics = {
  averagePathLength: number;
  maxPathLength: number;
  longestPath?: KnowledgeCausalChain;
  deadEndNodes: string[];
  orphanNodes: string[];
  disconnectedNodes: string[];
  mechanismCoverage: number;
  stakeholderCoverage: number;
  systemCoverage: number;
  conceptCoverage: number;
  averageBranchFactor: number;
};

export type KnowledgeGraphGap = {
  topicId: string;
  proposalId?: string;
  type:
    | "MISSING_CONCEPT"
    | "MISSING_MECHANISM"
    | "MISSING_SYSTEM"
    | "MISSING_STAKEHOLDER"
    | "MISSING_BUSINESS_IMPACT"
    | "LOW_CONFIDENCE_EDGE"
    | "NO_DIRECT_DEPENDENCY_EVIDENCE";
  severity: "low" | "medium" | "high";
  reason: string;
  evidenceIds: string[];
};

export type KnowledgeGraphDiagnostics = {
  totalNodeCount: number;
  totalEdgeCount: number;
  nodeCountByType: Record<KnowledgeNodeType, number>;
  edgeCountByType: Partial<Record<KnowledgeEdgeType, number>>;
  directEdgeCount: number;
  inferredEdgeCount: number;
  strongEdgeCount: number;
  supportingEdgeCount: number;
  weakEdgeCount: number;
  rejectedEdgeCount: number;
  isolatedNodeCount: number;
  proposalWithoutConceptCount: number;
  proposalWithoutMechanismCount: number;
  topicWithoutPathCount: number;
  topicWithCompletePathCount: number;
  duplicateCanonicalNodeCount: number;
  invalidEdgeCount: number;
  genericConceptRejectedCount: number;
  unsupportedDependencyRejectedCount: number;
  relationFallbackCount: number;
  graphCoverageByTopic: Array<{ topicId: string; hasPath: boolean; complete: boolean; gapCount: number; acceptedEdgeCount: number }>;
  graphStatistics: GraphStatistics;
  averageEdgeConfidence: number;
  ontologyVersion: string;
  calculationVersion: string;
  ruleVersion: string;
  topConceptsByProposalCoverage: Array<{ id: string; label: string; proposalCount: number }>;
  topMechanismsByProposalCoverage: Array<{ id: string; label: string; proposalCount: number }>;
  topSystemsByIncomingEdges: Array<{ id: string; label: string; incomingEdgeCount: number }>;
  topicsWithLargestGraphGaps: Array<{ topicId: string; gapCount: number; gaps: string[] }>;
  proposalsProducingMostRejectedEdgeCandidates: Array<{ proposalId: string; rejectedCount: number }>;
  regressionAssertions: Array<{ assertion: string; passed: boolean; details?: string }>;
  nodeCount: number;
  edgeCount: number;
  conceptNodeCount: number;
  mechanismNodeCount: number;
  systemNodeCount: number;
  stakeholderNodeCount: number;
  businessImpactNodeCount: number;
  untracedEdgeCount: number;
};

export type KnowledgeGraphValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type ExtractionCandidate = {
  proposalId?: string;
  topicId?: string;
  type: KnowledgeNodeType;
  label: string;
  canonicalKey: string;
  confidence: number;
  evidenceIds: string[];
  matchedPhrases: string[];
  accepted: boolean;
  rejectedReason?: string;
};

export type EdgeCandidate = KnowledgeEdge & {
  rejectedReason?: string;
};

export type KnowledgeGraph = {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  diagnostics: KnowledgeGraphDiagnostics;
  version: string;
  generatedAt: string;
};

export type KnowledgeGraphLayer = KnowledgeGraph & {
  generatedBy: "deterministic_knowledge_graph";
  knowledgeGraphVersion: string;
  ontologyVersion: string;
  calculationVersion: string;
  ruleVersion: string;
  topicKnowledgePaths: TopicKnowledgePath[];
  knowledgeGraphGaps: KnowledgeGraphGap[];
  weakEdgeCandidates: EdgeCandidate[];
  rejectedEdgeCandidates: EdgeCandidate[];
  extractionCandidates: ExtractionCandidate[];
  aliasResolutionResults: Array<{ input: string; canonicalKey: string; canonicalLabel: string; type: KnowledgeNodeType }>;
  ontologyMatches: ExtractionCandidate[];
  graphValidation: KnowledgeGraphValidation;
  graphStatistics: GraphStatistics;
  proposalKnowledgeChains: KnowledgeCausalChain[];
  narrativeChains: Record<string, NarrativeChainPreparation>;
};

export type KnowledgeGraphInput = {
  topicLayer: TopicClusterLayer;
  proposals?: ProposalRecord[];
  kgldCandidates?: KgldCandidate[];
  generatedAt?: string;
};

const KNOWLEDGE_GRAPH_VERSION = "phase13.1-multihop-knowledge-graph-1";
const CALCULATION_VERSION = "phase13.1-kg-chain-calculation-1";
const RULE_VERSION = "phase13.1-kg-chain-rules-1";
const ACCEPTED_THRESHOLD = 50;
const WEAK_THRESHOLD = 35;
const EXPLICIT_CAP = 95;
const ONTOLOGY_CAP = 80;
const TOPIC_CAP = 65;
const STAKEHOLDER_CAP = 55;
const BUSINESS_CAP = 50;

const NODE_TYPES: KnowledgeNodeType[] = ["Proposal", "Topic", "Concept", "Mechanism", "System", "Stakeholder", "BusinessImpact"];
const EDGE_TYPES: KnowledgeEdgeType[] = ["BELONGS_TO_TOPIC", "DESCRIBES", "INTRODUCES", "USES_MECHANISM", "USES", "IMPLEMENTS", "EXECUTES", "TARGETS", "DEPENDS_ON", "EXTENDS", "SUPERSEDES", "REQUIRES", "CONFLICTS_WITH", "ALTERNATIVE_TO", "ENABLES", "CONSTRAINS", "AFFECTS", "USED_BY", "OPERATED_BY", "RELEVANT_TO", "CREATES_RISK", "MITIGATES", "TRIGGERS", "RELATES_TO"];
const DEPENDENCY_EDGE_TYPES = new Set<KnowledgeEdgeType>(["DEPENDS_ON", "EXTENDS", "SUPERSEDES", "REQUIRES", "CONFLICTS_WITH", "ALTERNATIVE_TO"]);

export function buildKnowledgeGraphLayer(input: KnowledgeGraphInput): KnowledgeGraphLayer {
  const nodes = new Map<string, KnowledgeNode>();
  const allEdgeCandidates = new Map<string, EdgeCandidate>();
  const extractionCandidates: ExtractionCandidate[] = [];
  const aliasResolutionResults: KnowledgeGraphLayer["aliasResolutionResults"] = [];
  const proposalsById = new Map((input.proposals ?? []).map((proposal) => [proposal.proposalId, proposal]));
  const membershipsByTopic = groupMemberships(input.topicLayer.memberships);

  for (const topic of input.topicLayer.clusters) {
    addNode(nodes, topicNode(topic));
    for (const membership of (membershipsByTopic.get(topic.id) ?? []).filter((item) => item.role !== "excluded")) {
      const proposal = proposalsById.get(membership.proposalId);
      addNode(nodes, proposalNode(membership, proposal, topic));
      addCandidate(allEdgeCandidates, edgeCandidate({
        type: "BELONGS_TO_TOPIC",
        source: nodeId("Proposal", membership.proposalId),
        target: nodeId("Topic", topic.id),
        confidence: Math.min(EXPLICIT_CAP, membership.confidence),
        inferred: false,
        evidenceIds: membership.evidenceIds,
        derivedFrom: ["topic_membership", ...membership.reasons],
        reasoning: "Proposal-topic membership copied from Topic Cluster output.",
        limitations: [],
        properties: { role: membership.role, reasons: membership.reasons },
        traceability: trace(topic, [membership], "topic_cluster", "Proposal BELONGS_TO_TOPIC Topic is direct Topic Cluster metadata."),
      }));
    }
  }

  for (const proposal of input.proposals ?? []) {
    const topicMemberships = input.topicLayer.memberships.filter((membership) => membership.proposalId === proposal.proposalId && membership.role !== "excluded");
    addNode(nodes, standaloneProposalNode(proposal, topicMemberships));
  }

  for (const proposal of input.proposals ?? []) {
    const topicMemberships = input.topicLayer.memberships.filter((membership) => membership.proposalId === proposal.proposalId && membership.role !== "excluded");
    const text = proposalText(proposal);
    for (const entry of ONTOLOGY.filter((item) => item.type === "Concept" || item.type === "Mechanism")) {
      const match = ontologyMatch(entry, text);
      if (!match.matchedPhrases.length) continue;
      const topicIds = topicMemberships.map((membership) => membership.topicId);
      const confidence = Math.min(ONTOLOGY_CAP, match.confidence + Math.min(12, topicIds.length * 4));
      const candidate: ExtractionCandidate = {
        proposalId: proposal.proposalId,
        topicId: topicIds[0],
        type: entry.type,
        label: entry.label,
        canonicalKey: canonicalKey(entry.label),
        confidence,
        evidenceIds: match.evidenceIds.map((id) => `${proposal.proposalId}:${id}`),
        matchedPhrases: match.matchedPhrases,
        accepted: confidence >= ACCEPTED_THRESHOLD,
      };
      extractionCandidates.push(candidate);
      aliasResolutionResults.push({ input: match.matchedPhrases[0] ?? entry.label, canonicalKey: candidate.canonicalKey, canonicalLabel: entry.label, type: entry.type });
      if (!candidate.accepted) continue;
      addOntologyNode(nodes, entry, [proposal.proposalId], topicIds, confidence, false, candidate.evidenceIds);
      addCandidate(allEdgeCandidates, edgeCandidate({
        type: entry.type === "Concept" ? "DESCRIBES" : "INTRODUCES",
        source: nodeId("Proposal", proposal.proposalId),
        target: nodeId(entry.type, entry.label),
        confidence,
        inferred: false,
        evidenceIds: candidate.evidenceIds,
        derivedFrom: ["ontology_text_match", ...candidate.matchedPhrases],
        reasoning: `${proposal.proposalId} text explicitly matches ${entry.label}.`,
        limitations: [],
        properties: { matchedPhrases: candidate.matchedPhrases },
        traceability: proposalTrace(proposal, topicIds, candidate.evidenceIds, "ontology", `${entry.type} extracted from proposal title, abstract, body excerpt, keywords, or topic-supported text.`),
      }));
    }
    rejectGenericConcepts(proposal, extractionCandidates);
    for (const dependency of explicitDependencies(proposal)) {
      if (!proposalsById.has(dependency.targetProposalId)) continue;
      addCandidate(allEdgeCandidates, edgeCandidate({
        type: dependency.type,
        source: nodeId("Proposal", proposal.proposalId),
        target: nodeId("Proposal", dependency.targetProposalId),
        confidence: Math.min(EXPLICIT_CAP, dependency.confidence),
        inferred: false,
        evidenceIds: [`${proposal.proposalId}:dependency:${dependency.targetProposalId}`],
        derivedFrom: ["explicit_spec_text"],
        reasoning: dependency.reasoning,
        limitations: [],
        properties: { relationPhrase: dependency.phrase },
        traceability: proposalTrace(proposal, topicMemberships.map((item) => item.topicId), [`${proposal.proposalId}:dependency:${dependency.targetProposalId}`], "proposal_metadata", "Dependency-style edge accepted only from explicit text."),
      }));
    }
  }

  for (const topic of input.topicLayer.clusters) {
    const topicText = normalize([topic.displayName, topic.summary, ...topic.themeIds, ...topic.sharedSignals].join(" "));
    for (const entry of ONTOLOGY.filter((item) => item.type === "Concept" || item.type === "Mechanism")) {
      const match = ontologyMatch(entry, topicText);
      if (!match.matchedPhrases.length) continue;
      const confidence = Math.min(TOPIC_CAP, Math.round(topic.confidence * 0.85));
      const candidate: ExtractionCandidate = {
        topicId: topic.id,
        type: entry.type,
        label: entry.label,
        canonicalKey: canonicalKey(entry.label),
        confidence,
        evidenceIds: topic.traceability.evidenceIds,
        matchedPhrases: match.matchedPhrases,
        accepted: confidence >= ACCEPTED_THRESHOLD,
      };
      extractionCandidates.push(candidate);
      if (candidate.accepted) {
        addOntologyNode(nodes, entry, topic.proposalIds, [topic.id], confidence, true, candidate.evidenceIds);
        addCandidate(allEdgeCandidates, edgeCandidate({
          type: "DESCRIBES",
          source: nodeId("Topic", topic.id),
          target: nodeId(entry.type, entry.label),
          confidence,
          inferred: false,
          evidenceIds: candidate.evidenceIds,
          derivedFrom: ["topic_ontology_match", ...candidate.matchedPhrases],
          reasoning: `${topic.displayName} describes ${entry.label} through topic evidence.`,
          limitations: [],
          properties: { matchedPhrases: candidate.matchedPhrases, ruleFamily: "ontology-supported extraction" },
          traceability: trace(topic, [], "ontology", "Topic DESCRIBES ontology concept or mechanism from Topic Cluster names, summaries, and shared signals."),
        }));
      }
    }
  }

  addOntologyRelationshipEdges(nodes, allEdgeCandidates);
  addKgldBusinessImpacts(nodes, allEdgeCandidates, input);
  ensureOperationalFallbacks(nodes, allEdgeCandidates, input.topicLayer.clusters);

  const acceptedEdges = [...allEdgeCandidates.values()].filter((edge) => edge.accepted && edge.strength !== "weak" && edge.strength !== "rejected").sort(compareEdges);
  const weakEdgeCandidates = [...allEdgeCandidates.values()].filter((edge) => edge.strength === "weak").sort(compareEdges);
  const rejectedEdgeCandidates = [
    ...[...allEdgeCandidates.values()].filter((edge) => edge.strength === "rejected"),
    ...unsupportedDependencyRejections(input.proposals ?? []),
  ].sort(compareEdges);
  const acceptedNodes = pruneNodes([...nodes.values()], acceptedEdges).sort(compareNodes);
  const topicKnowledgePaths = buildTopicPaths(input.topicLayer.clusters, acceptedNodes, acceptedEdges);
  const knowledgeGraphGaps = topicKnowledgePaths.flatMap((path) => path.gaps);
  const proposalKnowledgeChains = buildProposalKnowledgeChains(acceptedNodes, acceptedEdges);
  const graphStatistics = buildGraphStatistics(acceptedNodes, acceptedEdges, proposalKnowledgeChains);
  const narrativeChains = buildNarrativeChainPreparation(proposalKnowledgeChains);
  const graphValidation = validateGraph(acceptedNodes, acceptedEdges, topicKnowledgePaths);
  const diagnostics = graphDiagnostics(acceptedNodes, acceptedEdges, weakEdgeCandidates, rejectedEdgeCandidates, extractionCandidates, topicKnowledgePaths, graphValidation, graphStatistics);

  return {
    generatedBy: "deterministic_knowledge_graph",
    knowledgeGraphVersion: KNOWLEDGE_GRAPH_VERSION,
    ontologyVersion: ONTOLOGY_VERSION,
    calculationVersion: CALCULATION_VERSION,
    ruleVersion: RULE_VERSION,
    version: KNOWLEDGE_GRAPH_VERSION,
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    nodes: acceptedNodes,
    edges: acceptedEdges,
    diagnostics,
    topicKnowledgePaths,
    knowledgeGraphGaps,
    weakEdgeCandidates,
    rejectedEdgeCandidates,
    extractionCandidates,
    aliasResolutionResults,
    ontologyMatches: extractionCandidates.filter((candidate) => candidate.accepted),
    graphValidation,
    graphStatistics,
    proposalKnowledgeChains,
    narrativeChains,
  };
}

export function getKnowledgeNodesByType(layer: KnowledgeGraphLayer, type: KnowledgeNodeType): KnowledgeNode[] {
  return layer.nodes.filter((node) => node.type === type);
}

export function getKnowledgeOutgoingEdges(layer: KnowledgeGraphLayer, nodeIdValue: string): KnowledgeEdge[] {
  return layer.edges.filter((edge) => edge.source === nodeIdValue || edge.from === nodeIdValue);
}

export function getKnowledgeBusinessImpacts(layer: KnowledgeGraphLayer): KnowledgeNode[] {
  return getKnowledgeNodesByType(layer, "BusinessImpact");
}

export function getKnowledgeConceptNeighborhood(layer: KnowledgeGraphLayer, conceptId: string): { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } {
  const requested = canonicalKey(conceptId);
  const concept = layer.nodes.find((node) => node.type === "Concept" && node.canonicalKey === requested)
    ?? layer.nodes.find((node) => node.type === "Concept" && (node.canonicalKey.includes(requested) || requested.includes(node.canonicalKey)));
  const id = concept?.id ?? nodeId("Concept", conceptId);
  const edges = layer.edges.filter((edge) => edge.source === id || edge.target === id);
  const nodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return { nodes: layer.nodes.filter((node) => nodeIds.has(node.id)), edges };
}

function topicNode(topic: TopicCluster): KnowledgeNode {
  return {
    id: nodeId("Topic", topic.id),
    type: "Topic",
    label: topic.displayName,
    canonicalKey: canonicalKey(topic.id),
    description: topic.summary,
    proposalIds: topic.proposalIds,
    topicIds: [topic.id],
    properties: {
      topicId: topic.id,
      summary: topic.summary,
      confidence: topic.confidence,
      cohesionScore: topic.cohesionScore,
      state: topic.state,
      proposalIds: topic.proposalIds,
      anchorProposalIds: topic.anchorProposalIds,
      supportingProposalIds: topic.supportingProposalIds,
      adjacentProposalIds: topic.adjacentProposalIds,
      primaryThemeIds: topic.primaryThemeIds,
      supportingThemeIds: topic.supportingThemeIds,
      themeIds: topic.themeIds,
      sharedSignals: topic.sharedSignals,
      activityProfile: topic.activityProfile,
      maturityProfile: topic.maturityProfile,
      limitations: topic.limitations,
      evidence: topic.evidence,
      gaps: topic.gaps,
      scoreBreakdown: topic.traceability.scoreBreakdown,
    },
    confidence: topic.confidence,
    inferred: false,
    traceability: trace(topic, [], "topic_cluster", "Topic node derived from published Topic Cluster."),
  };
}

function proposalNode(membership: TopicProposalMembership, proposal: ProposalRecord | undefined, topic: TopicCluster): KnowledgeNode {
  return {
    id: nodeId("Proposal", membership.proposalId),
    type: "Proposal",
    label: membership.proposalId,
    canonicalKey: membership.proposalId,
    description: proposal?.description ?? undefined,
    proposalIds: [membership.proposalId],
    topicIds: [membership.topicId],
    properties: {
      proposalId: membership.proposalId,
      number: proposal?.number,
      title: proposal?.title,
      status: proposal?.status,
      kind: proposal?.kind,
      proposalType: proposal?.proposalType,
      category: proposal?.category,
      abstract: proposal?.description,
      authors: proposal ? extractAuthors(proposal) : [],
      discussions: proposal ? [...(proposal.discussionLinks ?? []), proposal.discussionUrl ?? proposal.discussionTo ?? ""].filter(Boolean) : [],
      sourceRepo: proposal?.sourceRepo,
      sourcePath: proposal?.sourcePath,
      canonicalUrl: proposal?.canonicalUrl,
      rawContentHash: proposal?.rawContentHash,
      lifecycleState: proposal?.status,
      topicMemberships: [{ topicId: topic.id, role: membership.role, confidence: membership.confidence }],
    },
    confidence: Math.min(EXPLICIT_CAP, membership.confidence),
    inferred: false,
    traceability: trace(topic, [membership], "topic_cluster", "Proposal node included through topic membership."),
  };
}

function standaloneProposalNode(proposal: ProposalRecord, memberships: TopicProposalMembership[]): KnowledgeNode {
  return {
    id: nodeId("Proposal", proposal.proposalId),
    type: "Proposal",
    label: proposal.proposalId,
    canonicalKey: proposal.proposalId,
    description: proposal.description ?? undefined,
    proposalIds: [proposal.proposalId],
    topicIds: unique(memberships.map((membership) => membership.topicId)),
    properties: {
      proposalId: proposal.proposalId,
      number: proposal.number,
      title: proposal.title,
      status: proposal.status,
      kind: proposal.kind,
      proposalType: proposal.proposalType,
      category: proposal.category,
      abstract: proposal.description,
      authors: extractAuthors(proposal),
      discussions: [...(proposal.discussionLinks ?? []), proposal.discussionUrl ?? proposal.discussionTo ?? ""].filter(Boolean),
      sourceRepo: proposal.sourceRepo,
      sourcePath: proposal.sourcePath,
      canonicalUrl: proposal.canonicalUrl,
      rawContentHash: proposal.rawContentHash,
      lifecycleState: proposal.status,
      topicMemberships: memberships.map((membership) => ({ topicId: membership.topicId, role: membership.role, confidence: membership.confidence })),
    },
    confidence: EXPLICIT_CAP,
    inferred: false,
    traceability: proposalTrace(proposal, unique(memberships.map((membership) => membership.topicId)), memberships.flatMap((membership) => membership.evidenceIds), "proposal_metadata", "Proposal node derived from canonical proposal metadata."),
  };
}

function addOntologyNode(map: Map<string, KnowledgeNode>, entry: OntologyEntry, proposalIds: string[], topicIds: string[], confidence: number, inferred: boolean, evidenceIds: string[]): void {
  const id = nodeId(entry.type, entry.label);
  const existing = map.get(id);
  const mergedProposalIds = unique([...(existing?.proposalIds ?? []), ...proposalIds]);
  const mergedTopicIds = unique([...(existing?.topicIds ?? []), ...topicIds]);
  const node: KnowledgeNode = {
    id,
    type: entry.type,
    label: entry.label,
    canonicalKey: canonicalKey(entry.label),
    description: entry.description,
    aliases: entry.aliases,
    proposalIds: mergedProposalIds,
    topicIds: mergedTopicIds,
    properties: { ontologyVersion: ONTOLOGY_VERSION, extractionPhrases: entry.extractionPhrases },
    confidence: Math.max(existing?.confidence ?? 0, confidence),
    inferred: inferred && !(existing && !existing.inferred),
    traceability: {
      evidenceIds: unique([...(existing?.traceability.evidenceIds ?? []), ...evidenceIds]),
      derivedFrom: unique([...(existing?.traceability.derivedFrom ?? []), "ontology_registry"]),
      topicIds: mergedTopicIds,
      topicMembershipIds: existing?.traceability.topicMembershipIds ?? [],
      proposalIds: mergedProposalIds,
      source: inferred ? "rule_inference" : "ontology",
      reason: `${entry.type} node resolved through ontology registry.`,
      calculationVersion: CALCULATION_VERSION,
      ruleVersion: RULE_VERSION,
    },
  };
  map.set(id, node);
}

function addOntologyRelationshipEdges(nodes: Map<string, KnowledgeNode>, edges: Map<string, EdgeCandidate>): void {
  const nodeList = [...nodes.values()];
  for (const mechanismNode of nodeList.filter((node) => node.type === "Mechanism")) {
    const entry = ontologyEntry("Mechanism", mechanismNode.label);
    for (const concept of entry?.implementsConcepts ?? []) {
      if (!nodes.has(nodeId("Concept", concept))) continue;
      const conceptNode = nodes.get(nodeId("Concept", concept));
      addCandidate(edges, edgeCandidate({
        type: "IMPLEMENTS",
        source: mechanismNode.id,
        target: nodeId("Concept", concept),
        confidence: ONTOLOGY_CAP,
        inferred: false,
        evidenceIds: mechanismNode.traceability.evidenceIds,
        derivedFrom: ["ontology_relationship", `${mechanismNode.label}->${concept}`],
        reasoning: `${mechanismNode.label} is registered as an implementation mechanism for ${concept}.`,
        limitations: [],
        properties: { ruleFamily: "ontology-supported extraction" },
        traceability: nodeTrace(mechanismNode, "ontology", "Mechanism IMPLEMENTS Concept from ontology registry."),
      }));
      if (conceptNode) {
        addCandidate(edges, edgeCandidate({
          type: "USES_MECHANISM",
          source: conceptNode.id,
          target: mechanismNode.id,
          confidence: ONTOLOGY_CAP,
          inferred: false,
          evidenceIds: unique([...conceptNode.traceability.evidenceIds, ...mechanismNode.traceability.evidenceIds]),
          derivedFrom: ["ontology_relationship", `${concept}->${mechanismNode.label}`],
          reasoning: `${concept} uses ${mechanismNode.label} as a concrete mechanism.`,
          limitations: [],
          properties: { ruleFamily: "ontology-supported extraction" },
          traceability: {
            ...nodeTrace(conceptNode, "ontology", "Concept USES_MECHANISM Mechanism from ontology registry."),
            evidenceIds: unique([...conceptNode.traceability.evidenceIds, ...mechanismNode.traceability.evidenceIds]),
            proposalIds: unique([...(conceptNode.proposalIds ?? []), ...(mechanismNode.proposalIds ?? [])]),
            topicIds: unique([...(conceptNode.topicIds ?? []), ...(mechanismNode.topicIds ?? [])]),
          },
        }));
      }
    }
    for (const system of entry?.usedBySystems ?? []) {
      addOntologyNode(nodes, ontologyEntry("System", system)!, mechanismNode.proposalIds ?? [], mechanismNode.topicIds ?? [], STAKEHOLDER_CAP, true, mechanismNode.traceability.evidenceIds);
      addCandidate(edges, edgeCandidate({
        type: "USED_BY",
        source: mechanismNode.id,
        target: nodeId("System", system),
        confidence: Math.min(ONTOLOGY_CAP, 72),
        inferred: false,
        evidenceIds: mechanismNode.traceability.evidenceIds,
        derivedFrom: ["ontology_relationship", `${mechanismNode.label}->${system}`],
        reasoning: `${mechanismNode.label} is used by ${system} in the ontology registry.`,
        limitations: [],
        properties: { ruleFamily: "ontology-supported extraction" },
        traceability: nodeTrace(mechanismNode, "ontology", "Mechanism USED_BY System from ontology registry."),
      }));
      addCandidate(edges, edgeCandidate({
        type: "EXECUTES",
        source: mechanismNode.id,
        target: nodeId("System", system),
        confidence: Math.min(ONTOLOGY_CAP, 72),
        inferred: false,
        evidenceIds: mechanismNode.traceability.evidenceIds,
        derivedFrom: ["ontology_relationship", `${mechanismNode.label}->${system}`],
        reasoning: `${system} executes or operationalizes ${mechanismNode.label}.`,
        limitations: [],
        properties: { ruleFamily: "ontology-supported extraction" },
        traceability: nodeTrace(mechanismNode, "ontology", "Mechanism EXECUTES System from ontology registry."),
      }));
    }
  }
  for (const conceptNode of [...nodes.values()].filter((node) => node.type === "Concept")) {
    const entry = ontologyEntry("Concept", conceptNode.label);
    const implementingMechanisms = ONTOLOGY.filter((item) => item.type === "Mechanism" && (item.implementsConcepts ?? []).includes(conceptNode.label));
    for (const mechanism of implementingMechanisms) {
      addOntologyNode(nodes, mechanism, conceptNode.proposalIds ?? [], conceptNode.topicIds ?? [], STAKEHOLDER_CAP, true, conceptNode.traceability.evidenceIds);
      addCandidate(edges, edgeCandidate({
        type: "USES_MECHANISM",
        source: conceptNode.id,
        target: nodeId("Mechanism", mechanism.label),
        confidence: STAKEHOLDER_CAP,
        inferred: true,
        evidenceIds: conceptNode.traceability.evidenceIds,
        derivedFrom: ["concept_mechanism_taxonomy", `${conceptNode.label}->${mechanism.label}`],
        reasoning: `${conceptNode.label} can be represented through mechanism ${mechanism.label}.`,
        limitations: ["Mechanism is inferred from ontology because proposal text supports the concept but may not name this mechanism directly."],
        properties: { inferenceRule: "kg-rule-concept-mechanism-backfill", ruleFamily: "conservative operational inference" },
        traceability: nodeTrace(conceptNode, "rule_inference", "Concept USES_MECHANISM inferred from ontology mechanism taxonomy."),
      }));
      for (const system of mechanism.usedBySystems ?? []) {
        addOntologyNode(nodes, ontologyEntry("System", system)!, conceptNode.proposalIds ?? [], conceptNode.topicIds ?? [], STAKEHOLDER_CAP, true, conceptNode.traceability.evidenceIds);
        addCandidate(edges, edgeCandidate({
          type: "EXECUTES",
          source: nodeId("Mechanism", mechanism.label),
          target: nodeId("System", system),
          confidence: STAKEHOLDER_CAP,
          inferred: true,
          evidenceIds: conceptNode.traceability.evidenceIds,
          derivedFrom: ["mechanism_system_taxonomy", `${mechanism.label}->${system}`],
          reasoning: `${system} operationalizes ${mechanism.label} under the ontology taxonomy.`,
          limitations: ["System execution is inferred from ontology and does not establish implementation or deployment."],
          properties: { inferenceRule: "kg-rule-mechanism-system-backfill", ruleFamily: "conservative operational inference" },
          traceability: nodeTrace(conceptNode, "rule_inference", "Mechanism EXECUTES System inferred from ontology system taxonomy."),
        }));
      }
    }
    for (const system of entry?.affectsSystems ?? []) {
      addOntologyNode(nodes, ontologyEntry("System", system)!, conceptNode.proposalIds ?? [], conceptNode.topicIds ?? [], STAKEHOLDER_CAP, true, conceptNode.traceability.evidenceIds);
      addCandidate(edges, edgeCandidate({
        type: "AFFECTS",
        source: conceptNode.id,
        target: nodeId("System", system),
        confidence: TOPIC_CAP,
        inferred: true,
        evidenceIds: conceptNode.traceability.evidenceIds,
        derivedFrom: ["concept_system_mapping", `${conceptNode.label}->${system}`],
        reasoning: `${conceptNode.label} affects ${system} under ontology mapping.`,
        limitations: ["System effect is ontology-supported; deployment or ecosystem uptake is not inferred."],
        properties: { inferenceRule: "kg-rule-concept-affects-system", ruleFamily: "conservative operational inference" },
        traceability: nodeTrace(conceptNode, "rule_inference", "Concept AFFECTS System inferred from ontology system mapping."),
      }));
    }
    const impacts = unique([...(entry?.enablesImpacts ?? []), "Monitoring Requirement"]);
    for (const impact of impacts) {
      addOntologyNode(nodes, ontologyEntry("BusinessImpact", impact)!, conceptNode.proposalIds ?? [], conceptNode.topicIds ?? [], BUSINESS_CAP, true, conceptNode.traceability.evidenceIds);
      addCandidate(edges, edgeCandidate({
        type: impact === "Increased Technical Complexity" || impact === "Security Model Change" ? "CREATES_RISK" : "ENABLES",
        source: conceptNode.id,
        target: nodeId("BusinessImpact", impact),
        confidence: BUSINESS_CAP,
        inferred: true,
        evidenceIds: conceptNode.traceability.evidenceIds,
        derivedFrom: ["concept_business_impact_mapping", `${conceptNode.label}->${impact}`],
        reasoning: `${conceptNode.label} maps to bounded operational impact ${impact}.`,
        limitations: ["Business impact is conservative and does not imply deployment readiness, legal compliance, financial return, or KGLD dependency."],
        properties: { inferenceRule: "kg-rule-concept-business-impact", ruleFamily: "conservative operational inference" },
        traceability: nodeTrace(conceptNode, "rule_inference", "Concept to BusinessImpact inferred with conservative confidence cap."),
      }));
    }
  }
  for (const systemNode of [...nodes.values()].filter((node) => node.type === "System")) {
    const entry = ontologyEntry("System", systemNode.label);
    for (const stakeholder of entry?.stakeholders ?? []) {
      addOntologyNode(nodes, ontologyEntry("Stakeholder", stakeholder)!, systemNode.proposalIds ?? [], systemNode.topicIds ?? [], STAKEHOLDER_CAP, true, systemNode.traceability.evidenceIds);
      addCandidate(edges, edgeCandidate({
        type: "RELEVANT_TO",
        source: systemNode.id,
        target: nodeId("Stakeholder", stakeholder),
        confidence: STAKEHOLDER_CAP,
        inferred: true,
        evidenceIds: systemNode.traceability.evidenceIds,
        derivedFrom: ["system_stakeholder_taxonomy", `${systemNode.label}->${stakeholder}`],
        reasoning: `${systemNode.label} is operationally relevant to ${stakeholder}.`,
        limitations: ["Stakeholder relevance is an operational inference; responsibility or ecosystem uptake is not inferred."],
        properties: { inferenceRule: "kg-rule-system-stakeholder", ruleFamily: "conservative operational inference" },
        traceability: nodeTrace(systemNode, "rule_inference", "System RELEVANT_TO Stakeholder inferred from system taxonomy."),
      }));
    }
  }
  for (const stakeholderNode of [...nodes.values()].filter((node) => node.type === "Stakeholder")) {
    const impacts = impactsForStakeholder(stakeholderNode.label);
    for (const impact of impacts) {
      addOntologyNode(nodes, ontologyEntry("BusinessImpact", impact)!, stakeholderNode.proposalIds ?? [], stakeholderNode.topicIds ?? [], BUSINESS_CAP, true, stakeholderNode.traceability.evidenceIds);
      addCandidate(edges, edgeCandidate({
        type: "AFFECTS",
        source: stakeholderNode.id,
        target: nodeId("BusinessImpact", impact),
        confidence: BUSINESS_CAP,
        inferred: true,
        evidenceIds: stakeholderNode.traceability.evidenceIds,
        derivedFrom: ["stakeholder_business_impact_mapping", `${stakeholderNode.label}->${impact}`],
        reasoning: `${stakeholderNode.label} is mapped to bounded operational impact ${impact}.`,
        limitations: ["Stakeholder-to-impact relation is a conservative operational inference for narrative preparation only."],
        properties: { inferenceRule: "kg-rule-stakeholder-business-impact", ruleFamily: "conservative operational inference" },
        traceability: nodeTrace(stakeholderNode, "rule_inference", "Stakeholder AFFECTS BusinessImpact inferred from stakeholder taxonomy."),
      }));
    }
  }
}

function addKgldBusinessImpacts(nodes: Map<string, KnowledgeNode>, edges: Map<string, EdgeCandidate>, input: KnowledgeGraphInput): void {
  const candidatesByProposal = new Map((input.kgldCandidates ?? []).map((candidate) => [candidate.proposalId, candidate]));
  for (const proposalNodeItem of [...nodes.values()].filter((node) => node.type === "Proposal")) {
    const proposalId = proposalNodeItem.proposalIds?.[0];
    if (!proposalId) continue;
    const candidate = candidatesByProposal.get(proposalId);
    const direct = candidate && candidate.relevanceScore >= 70 && candidate.reasonCodes.some((code) => /direct|wallet|vault|rwa|compliance|settlement/i.test(code));
    const impact = direct ? "Monitoring Requirement" : "No Current Direct Dependency";
    addOntologyNode(nodes, ontologyEntry("BusinessImpact", impact)!, [proposalId], proposalNodeItem.topicIds ?? [], BUSINESS_CAP, true, proposalNodeItem.traceability.evidenceIds);
    addCandidate(edges, edgeCandidate({
      type: "RELEVANT_TO",
      source: proposalNodeItem.id,
      target: nodeId("BusinessImpact", impact),
      confidence: BUSINESS_CAP,
      inferred: true,
      evidenceIds: proposalNodeItem.traceability.evidenceIds,
      derivedFrom: direct ? ["kgld_candidate_rule"] : ["kgld_safeguard_no_direct_dependency"],
      reasoning: direct ? "KGLD candidate exists, but Phase 13 keeps impact at monitoring unless direct dependency evidence is present." : "No direct KGLD dependency evidence was found.",
      limitations: ["Does not infer deployment, operational readiness, legal compliance, financial return, market effect, or required migration."],
      properties: { inferenceRule: "kg-rule-kgld-business-impact-safeguard" },
      traceability: nodeTrace(proposalNodeItem, "rule_inference", "BusinessImpact generated under KGLD safeguards."),
    }));
  }
}

function ensureOperationalFallbacks(nodes: Map<string, KnowledgeNode>, edges: Map<string, EdgeCandidate>, topics: TopicCluster[]): void {
  for (const topic of topics) {
    const topicProposalIds = new Set(topic.proposalIds);
    const hasAcceptedConcept = [...nodes.values()].some((node) => node.type === "Concept" && (node.proposalIds ?? []).some((proposalId) => topicProposalIds.has(proposalId)));
    if (!hasAcceptedConcept) {
      const fallback = ontologyEntry("BusinessImpact", "Monitoring Requirement")!;
      addOntologyNode(nodes, fallback, topic.proposalIds, [topic.id], BUSINESS_CAP, true, topic.traceability.evidenceIds);
      addCandidate(edges, edgeCandidate({
        type: "RELATES_TO",
        source: nodeId("Topic", topic.id),
        target: nodeId("BusinessImpact", fallback.label),
        confidence: 55,
        inferred: true,
        evidenceIds: topic.traceability.evidenceIds,
        derivedFrom: ["fallback_relation"],
        reasoning: "Fallback relation used because no more specific concept/mechanism relation passed the publication threshold.",
        limitations: ["RELATES_TO is a fallback only and should be replaced when stronger extraction evidence is available."],
        properties: { inferenceRule: "kg-rule-relation-fallback" },
        traceability: trace(topic, [], "rule_inference", "Fallback relation emitted to expose graph gap without fabricating missing path segments."),
      }));
    }
  }
}

function edgeCandidate(input: Omit<EdgeCandidate, "id" | "from" | "to" | "strength" | "accepted">): EdgeCandidate {
  const confidence = clampConfidence(input.confidence);
  const strength = edgeStrength(confidence);
  const rejected = strength === "rejected";
  return {
    ...input,
    source: input.source,
    target: input.target,
    from: input.source,
    to: input.target,
    id: `kg-edge:${input.source}:${input.type}:${input.target}`,
    confidence,
    evidenceIds: unique(input.evidenceIds),
    derivedFrom: unique(input.derivedFrom),
    limitations: input.inferred ? unique([...input.limitations, ...(input.properties.inferenceRule ? [] : ["Missing named inference rule."])]) : input.limitations,
    strength,
    accepted: !rejected && confidence >= ACCEPTED_THRESHOLD,
    rejectedReason: rejected ? "confidence below weak threshold" : undefined,
  };
}

function ontologyMatch(entry: OntologyEntry, text: string): { matchedPhrases: string[]; evidenceIds: string[]; confidence: number } {
  const phrases = unique([entry.label, ...entry.aliases, ...entry.extractionPhrases]).filter((phrase) => !isGenericStandalone(phrase));
  const matchedPhrases = phrases.filter((phrase) => includesTerm(text, phrase));
  const confidence = matchedPhrases.length
    ? Math.min(80, 58 + Math.min(22, matchedPhrases.length * 8) + (matchedPhrases.some((phrase) => phrase.split(/\s+/).length >= 2) ? 8 : 0))
    : 0;
  return { matchedPhrases, evidenceIds: matchedPhrases.map((phrase) => `ontology-match:${canonicalKey(phrase)}`), confidence };
}

function rejectGenericConcepts(proposal: ProposalRecord, candidates: ExtractionCandidate[]): void {
  const words = normalize([proposal.title, proposal.description, proposal.bodyExcerpt].filter(Boolean).join(" ")).split(/\s+/);
  for (const term of GENERIC_TERM_STOPLIST) {
    if (!words.includes(term)) continue;
    candidates.push({
      proposalId: proposal.proposalId,
      type: "Concept",
      label: term,
      canonicalKey: canonicalKey(term),
      confidence: 15,
      evidenceIds: [`${proposal.proposalId}:generic:${term}`],
      matchedPhrases: [term],
      accepted: false,
      rejectedReason: "generic standalone term rejected",
    });
  }
}

function explicitDependencies(proposal: ProposalRecord): Array<{ targetProposalId: string; type: KnowledgeEdgeType; phrase: string; confidence: number; reasoning: string }> {
  const text = [proposal.title, proposal.description, proposal.bodyExcerpt].filter(Boolean).join("\n");
  const result: Array<{ targetProposalId: string; type: KnowledgeEdgeType; phrase: string; confidence: number; reasoning: string }> = [];
  const patterns: Array<[RegExp, KnowledgeEdgeType, string]> = [
    [/\b(?:requires|required by|requirement for)\s+(EIP|ERC)-?(\d+)/gi, "REQUIRES", "requires"],
    [/\b(?:depends on|dependency on)\s+(EIP|ERC)-?(\d+)/gi, "DEPENDS_ON", "depends on"],
    [/\b(?:extends|extension of)\s+(EIP|ERC)-?(\d+)/gi, "EXTENDS", "extends"],
    [/\b(?:supersedes|replaces)\s+(EIP|ERC)-?(\d+)/gi, "SUPERSEDES", "supersedes"],
    [/\b(?:conflicts with|incompatible with)\s+(EIP|ERC)-?(\d+)/gi, "CONFLICTS_WITH", "conflicts with"],
    [/\b(?:alternative to)\s+(EIP|ERC)-?(\d+)/gi, "ALTERNATIVE_TO", "alternative to"],
  ];
  for (const [pattern, type, phrase] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const targetProposalId = `${match[1]?.toUpperCase()}-${match[2]}`;
      if (targetProposalId === proposal.proposalId) continue;
      result.push({ targetProposalId, type, phrase, confidence: 90, reasoning: `${proposal.proposalId} text explicitly says "${phrase} ${targetProposalId}".` });
    }
  }
  return result;
}

function unsupportedDependencyRejections(proposals: ProposalRecord[]): EdgeCandidate[] {
  const byTextMatch = new Map<string, number>();
  for (const proposal of proposals) {
    const text = normalize(proposalText(proposal));
    for (const other of proposals) {
      if (proposal.proposalId === other.proposalId) continue;
      const shared = sharedImportantWords(text, normalize(proposalText(other)));
      if (shared >= 4) byTextMatch.set(proposal.proposalId, (byTextMatch.get(proposal.proposalId) ?? 0) + 1);
    }
  }
  return [...byTextMatch.entries()].map(([proposalId, count]) => edgeCandidate({
    type: "DEPENDS_ON",
    source: nodeId("Proposal", proposalId),
    target: nodeId("Proposal", "semantic-similarity-only"),
    confidence: 10,
    inferred: true,
    evidenceIds: [],
    derivedFrom: ["semantic_similarity_only"],
    reasoning: "Semantic similarity was detected but rejected for dependency-style relation.",
    limitations: ["Dependency-style edges require explicit metadata or specification text; semantic similarity alone is insufficient."],
    properties: { inferenceRule: "kg-rule-reject-semantic-dependency", similarProposalCount: count },
    traceability: {
      evidenceIds: [],
      derivedFrom: ["semantic_similarity_only"],
      topicIds: [],
      topicMembershipIds: [],
      proposalIds: [proposalId],
      source: "rule_inference",
      reason: "Rejected unsupported dependency candidate.",
      calculationVersion: CALCULATION_VERSION,
      ruleVersion: RULE_VERSION,
    },
  }));
}

function buildTopicPaths(topics: TopicCluster[], nodes: KnowledgeNode[], edges: KnowledgeEdge[]): TopicKnowledgePath[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = groupEdges(edges, (edge) => edge.source);
  const incoming = groupEdges(edges, (edge) => edge.target);
  return topics.map((topic) => {
    const topicId = nodeId("Topic", topic.id);
    const proposalEdge = (incoming.get(topicId) ?? []).find((edge) => edge.type === "BELONGS_TO_TOPIC");
    const proposal = proposalEdge ? nodeById.get(proposalEdge.source) : undefined;
    const steps: KnowledgePathStep[] = [{ nodeId: topicId, label: topic.displayName, type: "Topic" }];
    const gaps: KnowledgeGraphGap[] = [];
    if (!proposal || !proposalEdge) {
      gaps.push(gap(topic.id, undefined, "MISSING_CONCEPT", "No proposal-topic edge is available.", topic.traceability.evidenceIds, "high"));
      return { topicId: topic.id, topicLabel: topic.displayName, complete: false, steps, gaps };
    }
    steps.push(pathStep(proposal, proposalEdge));
    const conceptOrMechanismEdge = (outgoing.get(proposal.id) ?? []).find((edge) => edge.type === "DESCRIBES" || edge.type === "INTRODUCES");
    const conceptOrMechanism = conceptOrMechanismEdge ? nodeById.get(conceptOrMechanismEdge.target) : undefined;
    if (!conceptOrMechanism || !conceptOrMechanismEdge) {
      gaps.push(gap(topic.id, proposal.label, "MISSING_CONCEPT", "No accepted concept or mechanism extraction for representative proposal.", topic.traceability.evidenceIds, "medium"));
      return { topicId: topic.id, topicLabel: topic.displayName, proposalId: proposal.label, complete: false, steps, gaps };
    }
    steps.push(pathStep(conceptOrMechanism, conceptOrMechanismEdge));
    let cursor = conceptOrMechanism;
    if (cursor.type === "Mechanism") {
      const implemented = (outgoing.get(cursor.id) ?? []).find((edge) => edge.type === "IMPLEMENTS");
      const concept = implemented ? nodeById.get(implemented.target) : undefined;
      if (concept && implemented) {
        steps.push(pathStep(concept, implemented));
        cursor = concept;
      } else {
        gaps.push(gap(topic.id, proposal.label, "MISSING_CONCEPT", "Mechanism has no accepted IMPLEMENTS concept edge.", topic.traceability.evidenceIds, "medium"));
      }
    }
    const systemEdge = (outgoing.get(cursor.id) ?? []).find((edge) => edge.type === "AFFECTS" || edge.type === "USED_BY") ?? (outgoing.get(conceptOrMechanism.id) ?? []).find((edge) => edge.type === "USED_BY");
    const system = systemEdge ? nodeById.get(systemEdge.target) : undefined;
    if (!system || system.type !== "System" || !systemEdge) {
      gaps.push(gap(topic.id, proposal.label, "MISSING_SYSTEM", "No accepted system mapping for representative path.", topic.traceability.evidenceIds, "medium"));
      return { topicId: topic.id, topicLabel: topic.displayName, proposalId: proposal.label, complete: false, steps, gaps };
    }
    steps.push(pathStep(system, systemEdge));
    const stakeholderEdge = (outgoing.get(system.id) ?? []).find((edge) => edge.type === "RELEVANT_TO");
    const stakeholder = stakeholderEdge ? nodeById.get(stakeholderEdge.target) : undefined;
    if (stakeholder && stakeholderEdge) steps.push(pathStep(stakeholder, stakeholderEdge));
    else gaps.push(gap(topic.id, proposal.label, "MISSING_STAKEHOLDER", "No accepted stakeholder inference for mapped system.", topic.traceability.evidenceIds, "low"));
    const impactEdge = (outgoing.get(cursor.id) ?? []).find((edge) => edge.target.startsWith("impact:")) ?? (outgoing.get(proposal.id) ?? []).find((edge) => edge.target.startsWith("impact:"));
    const impact = impactEdge ? nodeById.get(impactEdge.target) : undefined;
    if (impact && impactEdge) steps.push(pathStep(impact, impactEdge));
    else gaps.push(gap(topic.id, proposal.label, "MISSING_BUSINESS_IMPACT", "No bounded business impact passed publication threshold.", topic.traceability.evidenceIds, "low"));
    return { topicId: topic.id, topicLabel: topic.displayName, proposalId: proposal.label, complete: gaps.length === 0, steps, gaps };
  });
}

function buildProposalKnowledgeChains(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeCausalChain[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = groupEdges(edges, (edge) => edge.source);
  const chains: KnowledgeCausalChain[] = [];
  for (const proposal of nodes.filter((node) => node.type === "Proposal")) {
    const proposalEdges = outgoing.get(proposal.id) ?? [];
    const conceptEdges = proposalEdges.filter((edge) => edge.type === "DESCRIBES" && nodeById.get(edge.target)?.type === "Concept").sort(compareChainEdges).slice(0, 5);
    const directMechanismEdges = proposalEdges.filter((edge) => edge.type === "INTRODUCES" && nodeById.get(edge.target)?.type === "Mechanism").sort(compareChainEdges).slice(0, 3);
    const starts = conceptEdges.length ? conceptEdges : directMechanismEdges;
    if (!starts.length) {
      chains.push(chainFromParts(proposal, [], [], [chainGap(proposal, "MISSING_CONCEPT", "No accepted concept or mechanism starts this proposal chain.")]));
      continue;
    }
    for (const startEdge of starts) {
      const first = nodeById.get(startEdge.target);
      if (!first) continue;
      const partialSteps = [stepForNode(proposal), pathStep(first, startEdge)];
      const partialEdges = [startEdge];
      const concept = first.type === "Concept" ? first : undefined;
      const mechanismEdges = concept
        ? (outgoing.get(concept.id) ?? []).filter((edge) => edge.type === "USES_MECHANISM" && nodeById.get(edge.target)?.type === "Mechanism").sort(compareChainEdges).slice(0, 4)
        : [];
      const mechanismStarts = mechanismEdges.length ? mechanismEdges : first.type === "Mechanism" ? [] : [];
      if (!mechanismEdges.length && first.type !== "Mechanism") {
        chains.push(extendChainToImpact(proposal, first, partialSteps, partialEdges, [chainGap(proposal, "MISSING_MECHANISM", "Concept has no accepted mechanism edge.")], nodeById, outgoing));
        continue;
      }
      const mechanisms = first.type === "Mechanism" ? [{ mechanism: first, edge: undefined as KnowledgeEdge | undefined }] : mechanismStarts.map((edge) => ({ mechanism: nodeById.get(edge.target)!, edge }));
      for (const item of mechanisms) {
        const steps = item.edge ? [...partialSteps, pathStep(item.mechanism, item.edge)] : partialSteps;
        const edgeList = item.edge ? [...partialEdges, item.edge] : partialEdges;
        chains.push(extendChainToImpact(proposal, item.mechanism, steps, edgeList, [], nodeById, outgoing));
      }
    }
  }
  return chains.sort((left, right) => right.chainScore - left.chainScore || right.steps.length - left.steps.length || left.id.localeCompare(right.id));
}

function extendChainToImpact(
  proposal: KnowledgeNode,
  cursor: KnowledgeNode,
  steps: KnowledgePathStep[],
  edgeList: KnowledgeEdge[],
  gaps: KnowledgeGraphGap[],
  nodeById: Map<string, KnowledgeNode>,
  outgoing: Map<string, KnowledgeEdge[]>,
): KnowledgeCausalChain {
  const localSteps = [...steps];
  const localEdges = [...edgeList];
  const localGaps = [...gaps];
  const systemEdge = (outgoing.get(cursor.id) ?? []).find((edge) => ["EXECUTES", "USED_BY", "AFFECTS"].includes(edge.type) && nodeById.get(edge.target)?.type === "System");
  const system = systemEdge ? nodeById.get(systemEdge.target) : undefined;
  if (system && systemEdge) {
    localSteps.push(pathStep(system, systemEdge));
    localEdges.push(systemEdge);
  } else {
    localGaps.push(chainGap(proposal, "MISSING_SYSTEM", "No accepted system edge from concept or mechanism."));
  }
  const stakeholderEdge = system ? (outgoing.get(system.id) ?? []).find((edge) => edge.type === "RELEVANT_TO" && nodeById.get(edge.target)?.type === "Stakeholder") : undefined;
  const stakeholder = stakeholderEdge ? nodeById.get(stakeholderEdge.target) : undefined;
  if (stakeholder && stakeholderEdge) {
    localSteps.push(pathStep(stakeholder, stakeholderEdge));
    localEdges.push(stakeholderEdge);
  } else {
    localGaps.push(chainGap(proposal, "MISSING_STAKEHOLDER", "No accepted stakeholder edge from mapped system."));
  }
  const impactEdge = stakeholder
    ? (outgoing.get(stakeholder.id) ?? []).find((edge) => nodeById.get(edge.target)?.type === "BusinessImpact")
    : (outgoing.get(cursor.id) ?? []).find((edge) => nodeById.get(edge.target)?.type === "BusinessImpact")
      ?? (outgoing.get(proposal.id) ?? []).find((edge) => nodeById.get(edge.target)?.type === "BusinessImpact");
  const impact = impactEdge ? nodeById.get(impactEdge.target) : undefined;
  if (impact && impactEdge) {
    localSteps.push(pathStep(impact, impactEdge));
    localEdges.push(impactEdge);
  } else {
    localGaps.push(chainGap(proposal, "MISSING_BUSINESS_IMPACT", "No accepted BusinessImpact edge from chain end."));
  }
  return chainFromParts(proposal, localSteps, localEdges, localGaps);
}

function chainFromParts(proposal: KnowledgeNode, steps: KnowledgePathStep[], edges: KnowledgeEdge[], gaps: KnowledgeGraphGap[]): KnowledgeCausalChain {
  const complete = ["Concept", "Mechanism", "System", "Stakeholder", "BusinessImpact"].every((type) => steps.some((step) => step.type === type));
  const coverageScore = Math.round((new Set(steps.map((step) => step.type)).size / 6) * 100);
  const edgeConfidenceScore = edges.length ? Math.round(edges.reduce((sum, edge) => sum + edge.confidence, 0) / edges.length) : 0;
  const evidenceScore = Math.min(100, edges.reduce((sum, edge) => sum + Math.min(10, edge.evidenceIds.length * 2), 0));
  const ontologyConfidenceScore = edges.length ? Math.round((edges.filter((edge) => edge.derivedFrom.some((item) => /ontology|mapping|taxonomy/.test(item))).length / edges.length) * 100) : 0;
  const reasoningConfidenceScore = Math.max(0, 100 - gaps.length * 18 - edges.filter((edge) => edge.inferred).length * 4);
  const chainScore = Math.round(coverageScore * 0.32 + edgeConfidenceScore * 0.28 + evidenceScore * 0.14 + ontologyConfidenceScore * 0.12 + reasoningConfidenceScore * 0.14);
  const normalizedSteps = steps.length ? steps : [stepForNode(proposal)];
  return {
    id: `kg-chain:${proposal.id}:${canonicalKey(normalizedSteps.slice(1).map((step) => step.nodeId).join("-") || "no-path")}`,
    proposalId: proposal.label,
    role: "supporting",
    complete,
    chainScore,
    coverageScore,
    edgeConfidenceScore,
    evidenceScore,
    ontologyConfidenceScore,
    reasoningConfidenceScore,
    steps: normalizedSteps,
    edgeIds: edges.map((edge) => edge.id),
    gaps,
    traceability: {
      evidenceIds: unique(edges.flatMap((edge) => edge.evidenceIds)),
      derivedFrom: unique(edges.flatMap((edge) => edge.derivedFrom)),
      topicIds: unique(edges.flatMap((edge) => edge.traceability.topicIds)),
      topicMembershipIds: unique(edges.flatMap((edge) => edge.traceability.topicMembershipIds)),
      proposalIds: [proposal.label],
      source: "rule_inference",
      reason: "Causal chain assembled from accepted Knowledge Graph edges.",
      calculationVersion: CALCULATION_VERSION,
      ruleVersion: RULE_VERSION,
    },
  };
}

function buildGraphStatistics(nodes: KnowledgeNode[], edges: KnowledgeEdge[], chains: KnowledgeCausalChain[]): GraphStatistics {
  const incidentNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const outgoing = groupEdges(edges, (edge) => edge.source);
  const proposalNodes = nodes.filter((node) => node.type === "Proposal");
  const proposalsWith = (type: KnowledgeNodeType) => new Set(chains.filter((chain) => chain.steps.some((step) => step.type === type)).map((chain) => chain.proposalId)).size;
  const conceptBearing = proposalsWith("Concept");
  const mechanismBearing = proposalsWith("Mechanism");
  const systemBearing = proposalsWith("System");
  const branchNodes = nodes.filter((node) => (outgoing.get(node.id) ?? []).length > 0);
  return {
    averagePathLength: chains.length ? round(chains.reduce((sum, chain) => sum + chain.steps.length, 0) / chains.length) : 0,
    maxPathLength: chains.reduce((max, chain) => Math.max(max, chain.steps.length), 0),
    longestPath: chains[0],
    deadEndNodes: nodes.filter((node) => node.type !== "BusinessImpact" && !(outgoing.get(node.id) ?? []).length).map((node) => node.id).sort(),
    orphanNodes: nodes.filter((node) => !incidentNodeIds.has(node.id)).map((node) => node.id).sort(),
    disconnectedNodes: nodes.filter((node) => !incidentNodeIds.has(node.id)).map((node) => node.id).sort(),
    mechanismCoverage: coverage(mechanismBearing, Math.max(1, conceptBearing)),
    stakeholderCoverage: coverage(proposalsWith("Stakeholder"), Math.max(1, systemBearing)),
    systemCoverage: coverage(systemBearing, Math.max(1, mechanismBearing)),
    conceptCoverage: coverage(conceptBearing, proposalNodes.length),
    averageBranchFactor: branchNodes.length ? round(branchNodes.reduce((sum, node) => sum + (outgoing.get(node.id) ?? []).length, 0) / branchNodes.length) : 0,
  };
}

function buildNarrativeChainPreparation(chains: KnowledgeCausalChain[]): Record<string, NarrativeChainPreparation> {
  const byProposal = groupBy(chains, (chain) => chain.proposalId);
  const result: Record<string, NarrativeChainPreparation> = {};
  for (const [proposalId, proposalChains] of byProposal.entries()) {
    const sorted = [...proposalChains].sort((left, right) => right.chainScore - left.chainScore || right.steps.length - left.steps.length);
    const primary = sorted[0] ? { ...sorted[0], role: "primary" as const } : undefined;
    const supporting = sorted.slice(1, 4).map((chain) => ({ ...chain, role: "supporting" as const }));
    const alternative = sorted.find((chain) => chain.steps.map((step) => step.nodeId).join("|") !== primary?.steps.map((step) => step.nodeId).join("|"));
    result[proposalId] = {
      primaryChain: primary,
      topSupportingChains: supporting,
      alternativeChain: alternative ? { ...alternative, role: "alternative" } : undefined,
      conflictChain: sorted.find((chain) => chain.edgeIds.some((id) => id.includes(":CONFLICTS_WITH:"))) ? { ...sorted.find((chain) => chain.edgeIds.some((id) => id.includes(":CONFLICTS_WITH:")))!, role: "conflict" } : undefined,
    };
  }
  return result;
}

function stepForNode(node: KnowledgeNode): KnowledgePathStep {
  return { nodeId: node.id, label: node.label, type: node.type, confidence: node.confidence, inferred: node.inferred, evidenceCount: node.traceability.evidenceIds.length };
}

function chainGap(proposal: KnowledgeNode, type: KnowledgeGraphGap["type"], reason: string): KnowledgeGraphGap {
  return { topicId: proposal.topicIds?.[0] ?? "unclustered", proposalId: proposal.label, type, severity: "medium", reason, evidenceIds: proposal.traceability.evidenceIds };
}

function validateGraph(nodes: KnowledgeNode[], edges: KnowledgeEdge[], paths: TopicKnowledgePath[]): KnowledgeGraphValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) errors.push("node ID collision detected");
  for (const node of nodes) {
    if (!NODE_TYPES.includes(node.type)) errors.push(`invalid node type: ${node.type}`);
    if (Number.isNaN(node.confidence) || node.confidence < 0 || node.confidence > 100) errors.push(`invalid node confidence: ${node.id}`);
  }
  for (const edge of edges) {
    if (!EDGE_TYPES.includes(edge.type)) errors.push(`invalid edge type: ${edge.type}`);
    if (!nodeIds.has(edge.source)) errors.push(`dangling edge source: ${edge.id}`);
    if (!nodeIds.has(edge.target)) errors.push(`dangling edge target: ${edge.id}`);
    if (Number.isNaN(edge.confidence) || edge.confidence < 0 || edge.confidence > 100) errors.push(`invalid edge confidence: ${edge.id}`);
    if (!edge.traceability.evidenceIds.length && !edge.traceability.topicIds.length) errors.push(`accepted edge lacks traceability: ${edge.id}`);
    if (edge.inferred && (!edge.limitations.length || !edge.properties.inferenceRule)) errors.push(`inferred edge lacks limitations or inference rule: ${edge.id}`);
    if (DEPENDENCY_EDGE_TYPES.has(edge.type) && edge.derivedFrom.includes("semantic_similarity_only")) errors.push(`dependency edge accepted from semantic similarity: ${edge.id}`);
  }
  for (const path of paths) {
    if (path.steps.length < 2 && !path.gaps.length) warnings.push(`topic has no path or gap: ${path.topicId}`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

function graphDiagnostics(nodes: KnowledgeNode[], edges: KnowledgeEdge[], weak: EdgeCandidate[], rejected: EdgeCandidate[], extractionCandidates: ExtractionCandidate[], paths: TopicKnowledgePath[], validation: KnowledgeGraphValidation, graphStatistics: GraphStatistics): KnowledgeGraphDiagnostics {
  const nodeCountByType = Object.fromEntries(NODE_TYPES.map((type) => [type, nodes.filter((node) => node.type === type).length])) as Record<KnowledgeNodeType, number>;
  const edgeCountByType = countEdgeTypes(edges);
  const incidentNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const outgoingByProposal = groupEdges(edges, (edge) => edge.source);
  const proposals = nodes.filter((node) => node.type === "Proposal");
  const relationFallbackCount = edges.filter((edge) => edge.type === "RELATES_TO").length;
  const duplicateCanonicalNodeCount = nodes.length - new Set(nodes.map((node) => `${node.type}:${node.canonicalKey}`)).size;
  const diagnostics: KnowledgeGraphDiagnostics = {
    totalNodeCount: nodes.length,
    totalEdgeCount: edges.length,
    nodeCountByType,
    edgeCountByType,
    directEdgeCount: edges.filter((edge) => !edge.inferred).length,
    inferredEdgeCount: edges.filter((edge) => edge.inferred).length,
    strongEdgeCount: edges.filter((edge) => edge.strength === "strong").length,
    supportingEdgeCount: edges.filter((edge) => edge.strength === "supporting").length,
    weakEdgeCount: weak.length,
    rejectedEdgeCount: rejected.length + extractionCandidates.filter((candidate) => !candidate.accepted).length,
    isolatedNodeCount: nodes.filter((node) => !incidentNodeIds.has(node.id)).length,
    proposalWithoutConceptCount: proposals.filter((proposal) => !(outgoingByProposal.get(proposal.id) ?? []).some((edge) => edge.type === "DESCRIBES")).length,
    proposalWithoutMechanismCount: proposals.filter((proposal) => !(outgoingByProposal.get(proposal.id) ?? []).some((edge) => edge.type === "INTRODUCES")).length,
    topicWithoutPathCount: paths.filter((path) => path.steps.length < 3).length,
    topicWithCompletePathCount: paths.filter((path) => path.complete).length,
    duplicateCanonicalNodeCount,
    invalidEdgeCount: validation.errors.filter((error) => /edge/i.test(error)).length,
    genericConceptRejectedCount: extractionCandidates.filter((candidate) => candidate.rejectedReason === "generic standalone term rejected").length,
    unsupportedDependencyRejectedCount: rejected.filter((edge) => edge.derivedFrom.includes("semantic_similarity_only")).length,
    relationFallbackCount,
    graphCoverageByTopic: paths.map((path) => ({ topicId: path.topicId, hasPath: path.steps.length >= 3, complete: path.complete, gapCount: path.gaps.length, acceptedEdgeCount: path.steps.length - 1 })),
    graphStatistics,
    averageEdgeConfidence: edges.length ? Math.round(edges.reduce((sum, edge) => sum + edge.confidence, 0) / edges.length) : 0,
    ontologyVersion: ONTOLOGY_VERSION,
    calculationVersion: CALCULATION_VERSION,
    ruleVersion: RULE_VERSION,
    topConceptsByProposalCoverage: topCoverage(nodes, "Concept"),
    topMechanismsByProposalCoverage: topCoverage(nodes, "Mechanism"),
    topSystemsByIncomingEdges: topIncoming(nodes, edges, "System"),
    topicsWithLargestGraphGaps: paths.map((path) => ({ topicId: path.topicId, gapCount: path.gaps.length, gaps: path.gaps.map((item) => item.type) })).sort((a, b) => b.gapCount - a.gapCount || a.topicId.localeCompare(b.topicId)).slice(0, 8),
    proposalsProducingMostRejectedEdgeCandidates: topRejectedByProposal(rejected, extractionCandidates),
    regressionAssertions: [],
    nodeCount: nodes.length,
    edgeCount: edges.length,
    conceptNodeCount: nodeCountByType.Concept,
    mechanismNodeCount: nodeCountByType.Mechanism,
    systemNodeCount: nodeCountByType.System,
    stakeholderNodeCount: nodeCountByType.Stakeholder,
    businessImpactNodeCount: nodeCountByType.BusinessImpact,
    untracedEdgeCount: edges.filter((edge) => !edge.traceability.evidenceIds.length && !edge.traceability.topicIds.length).length,
  };
  diagnostics.regressionAssertions = regressionAssertions(nodes, edges, paths, diagnostics, validation);
  return diagnostics;
}

function regressionAssertions(nodes: KnowledgeNode[], edges: KnowledgeEdge[], paths: TopicKnowledgePath[], diagnostics: KnowledgeGraphDiagnostics, validation: KnowledgeGraphValidation): KnowledgeGraphDiagnostics["regressionAssertions"] {
  const has = (type: KnowledgeNodeType) => nodes.some((node) => node.type === type);
  return [
    assertion("at least one Concept node exists", has("Concept")),
    assertion("at least one Mechanism node exists", has("Mechanism")),
    assertion("at least one System node exists", has("System")),
    assertion("at least one Stakeholder node exists", has("Stakeholder")),
    assertion("at least one BusinessImpact node exists", has("BusinessImpact")),
    assertion("at least one non-RELATES_TO edge exists", edges.some((edge) => edge.type !== "RELATES_TO")),
    assertion("not all edge arrays are empty", edges.length > 0),
    assertion("every published Topic has path or explicit gap", paths.every((path) => path.steps.length >= 3 || path.gaps.length > 0)),
    assertion("every inferred edge has limitations and inference rule", edges.filter((edge) => edge.inferred).every((edge) => edge.limitations.length > 0 && Boolean(edge.properties.inferenceRule))),
    assertion("every accepted edge has traceability", edges.every((edge) => edge.traceability.evidenceIds.length > 0 || edge.traceability.topicIds.length > 0)),
    assertion("no accepted dependency edge is semantic-only", edges.every((edge) => !DEPENDENCY_EDGE_TYPES.has(edge.type) || !edge.derivedFrom.includes("semantic_similarity_only"))),
    assertion("no node ID collisions", diagnostics.duplicateCanonicalNodeCount === 0 && new Set(nodes.map((node) => node.id)).size === nodes.length),
    assertion("no dangling edge source or target", !validation.errors.some((error) => /dangling/.test(error))),
    assertion("no NaN confidence values", [...nodes.map((node) => node.confidence), ...edges.map((edge) => edge.confidence)].every((value) => !Number.isNaN(value))),
    assertion("no confidence outside 0-100", [...nodes.map((node) => node.confidence), ...edges.map((edge) => edge.confidence)].every((value) => value >= 0 && value <= 100)),
  ];
}

function proposalTrace(proposal: ProposalRecord, topicIds: string[], evidenceIds: string[], source: Traceability["source"], reason: string): Traceability {
  return { evidenceIds: evidenceIds.length ? evidenceIds : [`${proposal.proposalId}:proposal-metadata`], derivedFrom: [proposal.canonicalUrl, proposal.sourcePath], topicIds, topicMembershipIds: [], proposalIds: [proposal.proposalId], source, reason, calculationVersion: CALCULATION_VERSION, ruleVersion: RULE_VERSION };
}

function nodeTrace(node: KnowledgeNode, source: Traceability["source"], reason: string): Traceability {
  return { ...node.traceability, source, reason, calculationVersion: CALCULATION_VERSION, ruleVersion: RULE_VERSION };
}

function trace(topic: TopicCluster, memberships: TopicProposalMembership[], source: Traceability["source"], reason: string): Traceability {
  return {
    evidenceIds: unique([...topic.traceability.evidenceIds, ...topic.evidence.map((item) => item.id), ...memberships.flatMap((item) => item.evidenceIds)]),
    derivedFrom: unique(["topic_cluster", topic.calculationVersion, ...topic.evidence.map((item) => item.description)]),
    topicIds: [topic.id],
    topicMembershipIds: memberships.map((membership) => `${membership.topicId}:${membership.proposalId}:${membership.role}`),
    proposalIds: unique([...topic.proposalIds, ...memberships.map((membership) => membership.proposalId)]),
    source,
    reason,
    calculationVersion: CALCULATION_VERSION,
    ruleVersion: RULE_VERSION,
  };
}

function addNode(map: Map<string, KnowledgeNode>, node: KnowledgeNode): void {
  const existing = map.get(node.id);
  if (!existing) map.set(node.id, node);
  else map.set(node.id, { ...existing, proposalIds: unique([...(existing.proposalIds ?? []), ...(node.proposalIds ?? [])]), topicIds: unique([...(existing.topicIds ?? []), ...(node.topicIds ?? [])]), confidence: Math.max(existing.confidence, node.confidence) });
}

function addCandidate(map: Map<string, EdgeCandidate>, edge: EdgeCandidate): void {
  const existing = map.get(edge.id);
  if (!existing || edge.confidence > existing.confidence) map.set(edge.id, edge);
}

function pruneNodes(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): KnowledgeNode[] {
  const ids = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  return nodes.filter((node) => ids.has(node.id) || node.type === "Topic" || node.type === "Proposal");
}

function groupMemberships(memberships: TopicProposalMembership[]): Map<string, TopicProposalMembership[]> {
  return groupBy(memberships, (membership) => membership.topicId);
}

function groupEdges(edges: KnowledgeEdge[], keyOf: (edge: KnowledgeEdge) => string): Map<string, KnowledgeEdge[]> {
  return groupBy(edges, keyOf);
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(keyOf(item), [...(map.get(keyOf(item)) ?? []), item]);
  return map;
}

function ontologyEntry(type: KnowledgeNodeType, label: string): OntologyEntry | undefined {
  return ONTOLOGY.find((entry) => entry.type === type && canonicalKey(entry.label) === canonicalKey(label));
}

function nodeId(type: KnowledgeNodeType, label: string): string {
  const prefix: Record<KnowledgeNodeType, string> = { Proposal: "proposal", Topic: "topic", Concept: "concept", Mechanism: "mechanism", System: "system", Stakeholder: "stakeholder", BusinessImpact: "impact" };
  return `${prefix[type]}:${canonicalKey(label)}`;
}

function canonicalKey(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function includesTerm(text: string, term: string): boolean {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(normalize(text));
}

function isGenericStandalone(value: string): boolean {
  return GENERIC_TERM_STOPLIST.includes(normalize(value));
}

function proposalText(proposal: ProposalRecord): string {
  return [proposal.proposalId, proposal.title, proposal.description, proposal.bodyExcerpt, proposal.proposalType, proposal.category, ...(proposal.keywords ?? [])].filter(Boolean).join(" ");
}

function extractAuthors(proposal: ProposalRecord): string[] {
  const match = proposal.bodyExcerpt?.match(/^author:\s*(.+)$/im);
  return match?.[1]?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function edgeStrength(confidence: number): EdgeStrength {
  if (confidence >= 75) return "strong";
  if (confidence >= ACCEPTED_THRESHOLD) return "supporting";
  if (confidence >= WEAK_THRESHOLD) return "weak";
  return "rejected";
}

function gap(topicId: string, proposalId: string | undefined, type: KnowledgeGraphGap["type"], reason: string, evidenceIds: string[], severity: KnowledgeGraphGap["severity"]): KnowledgeGraphGap {
  return { topicId, proposalId, type, severity, reason, evidenceIds };
}

function pathStep(node: KnowledgeNode, edge: KnowledgeEdge): KnowledgePathStep {
  return { nodeId: node.id, label: node.label, type: node.type, edgeType: edge.type, confidence: edge.confidence, inferred: edge.inferred, evidenceCount: edge.evidenceIds.length };
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function compareNodes(left: KnowledgeNode, right: KnowledgeNode): number {
  return NODE_TYPES.indexOf(left.type) - NODE_TYPES.indexOf(right.type) || left.id.localeCompare(right.id, undefined, { numeric: true });
}

function compareEdges(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return left.source.localeCompare(right.source, undefined, { numeric: true }) || left.type.localeCompare(right.type) || left.target.localeCompare(right.target, undefined, { numeric: true });
}

function countEdgeTypes(edges: KnowledgeEdge[]): Partial<Record<KnowledgeEdgeType, number>> {
  const counts: Partial<Record<KnowledgeEdgeType, number>> = {};
  for (const edge of edges) counts[edge.type] = (counts[edge.type] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))) as Partial<Record<KnowledgeEdgeType, number>>;
}

function topCoverage(nodes: KnowledgeNode[], type: KnowledgeNodeType): Array<{ id: string; label: string; proposalCount: number }> {
  return nodes.filter((node) => node.type === type)
    .map((node) => ({ id: node.id, label: node.label, proposalCount: new Set(node.proposalIds ?? []).size }))
    .sort((a, b) => b.proposalCount - a.proposalCount || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function topIncoming(nodes: KnowledgeNode[], edges: KnowledgeEdge[], type: KnowledgeNodeType): Array<{ id: string; label: string; incomingEdgeCount: number }> {
  return nodes.filter((node) => node.type === type)
    .map((node) => ({ id: node.id, label: node.label, incomingEdgeCount: edges.filter((edge) => edge.target === node.id).length }))
    .sort((a, b) => b.incomingEdgeCount - a.incomingEdgeCount || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function topRejectedByProposal(rejected: EdgeCandidate[], candidates: ExtractionCandidate[]): Array<{ proposalId: string; rejectedCount: number }> {
  const counts = new Map<string, number>();
  for (const edge of rejected) for (const proposalId of edge.traceability.proposalIds) counts.set(proposalId, (counts.get(proposalId) ?? 0) + 1);
  for (const candidate of candidates.filter((item) => !item.accepted && item.proposalId)) counts.set(candidate.proposalId!, (counts.get(candidate.proposalId!) ?? 0) + 1);
  return [...counts.entries()].map(([proposalId, rejectedCount]) => ({ proposalId, rejectedCount })).sort((a, b) => b.rejectedCount - a.rejectedCount || a.proposalId.localeCompare(b.proposalId, undefined, { numeric: true })).slice(0, 8);
}

function impactsForStakeholder(stakeholder: string): string[] {
  if (/Wallet Provider|Dapp Developer|End User/.test(stakeholder)) return ["Wallet Integration Requirement", "Transaction Friction Reduction"];
  if (/Client Maintainer|Protocol Developer/.test(stakeholder)) return ["Client Implementation Requirement", "Increased Technical Complexity"];
  if (/Validator Operator/.test(stakeholder)) return ["Validator Operational Change", "Security Model Change"];
  if (/Asset Issuer|Custodian|Exchange/.test(stakeholder)) return ["Custody Policy Review", "Settlement Automation", "Monitoring Requirement"];
  if (/Compliance Team/.test(stakeholder)) return ["Compliance Auditability", "Monitoring Requirement"];
  if (/Oracle Provider/.test(stakeholder)) return ["Asset Verification Capability", "Monitoring Requirement"];
  return ["Monitoring Requirement"];
}

function compareChainEdges(left: KnowledgeEdge, right: KnowledgeEdge): number {
  return right.confidence - left.confidence || left.target.localeCompare(right.target);
}

function coverage(part: number, total: number): number {
  return total ? Math.min(100, Math.round((part / total) * 100)) : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sharedImportantWords(left: string, right: string): number {
  const stop = new Set([...GENERIC_TERM_STOPLIST, "the", "and", "for", "with", "from", "this", "that", "eip", "erc"]);
  const leftWords = new Set(left.split(/\s+/).filter((word) => word.length > 5 && !stop.has(word)));
  return right.split(/\s+/).filter((word) => leftWords.has(word)).length;
}

function assertion(assertionText: string, passed: boolean, details?: string): { assertion: string; passed: boolean; details?: string } {
  return { assertion: assertionText, passed, details };
}
