import type { AdoptionLayer, ChangeEvent, DiscussionHeatItem, ProposalRecord, ScoreBreakdownItem } from "./types.ts";
import type { ProposalThemeEdge, ThemeEvidenceMatch, ThemeGraph } from "./theme-graph.ts";

export type ThemeEdgeStrength = "strong" | "supporting" | "weak" | "rejected";
export type TopicMembershipRole = "anchor" | "supporting" | "adjacent" | "excluded";
export type TopicState = "emerging" | "active" | "established" | "dormant" | "insufficient evidence";

export type ValidatedThemeEdge = ProposalThemeEdge & {
  rawConfidence: number;
  validatedConfidence: number;
  adjustedConfidence: number;
  strength: ThemeEdgeStrength;
  accepted: boolean;
  reasons: string[];
  positiveEvidence: string[];
  validationReasons: string[];
  penalties: string[];
  evidenceIds: string[];
};

export type TopicProposalMembership = {
  proposalId: string;
  topicId: string;
  confidence: number;
  role: TopicMembershipRole;
  reasons: string[];
  evidenceIds: string[];
};

export type TopicEvidence = {
  id: string;
  type: "theme" | "term" | "relationship" | "discussion" | "implementation" | "change" | "limitation";
  description: string;
  proposalIds: string[];
  themeIds: string[];
};

export type TopicActivityProfile = {
  proposalCount: number;
  weeklyChangedProposalCount: number;
  statusChangeCount: number;
  newProposalCount: number;
  discussionActivity: number;
  implementationEvidenceCount: number;
  releaseEvidenceCount: number;
  averageMaturity: number;
  latestEvidenceDate?: string;
  staleEvidenceRatio: number;
};

export type TopicMaturityProfile = {
  draft: number;
  review: number;
  lastCall: number;
  final: number;
  implementationTracking: number;
  implementationCandidate: number;
  verifiedImplementation: number;
  released: number;
  activated: number;
  productionAdoption: number;
};

export type TopicGapSignal = {
  type:
    | "proposal_led"
    | "implementation_missing"
    | "release_missing"
    | "discussion_without_spec_change"
    | "low_cohesion"
    | "adoption_not_supported";
  severity: "low" | "medium" | "high";
  explanation: string;
  supportingEvidence: string[];
  missingEvidence: string[];
  confidence: number;
  limitations: string[];
};

export type TopicCluster = {
  id: string;
  displayName: string;
  summary: string;
  proposalIds: string[];
  anchorProposalIds: string[];
  supportingProposalIds: string[];
  adjacentProposalIds: string[];
  themeIds: string[];
  primaryThemeIds: string[];
  supportingThemeIds: string[];
  confidence: number;
  cohesionScore: number;
  evidence: TopicEvidence[];
  sharedSignals: string[];
  maturityProfile: TopicMaturityProfile;
  activityProfile: TopicActivityProfile;
  state: TopicState;
  gaps: TopicGapSignal[];
  limitations: string[];
  traceability: {
    membershipIds: string[];
    evidenceIds: string[];
    scoreBreakdown: ScoreBreakdownItem[];
  };
  calculationVersion: string;
  ruleVersion: string;
};

export type TopicDiagnostics = {
  rawThemeEdgeCount: number;
  acceptedStrongEdgeCount: number;
  acceptedSupportingEdgeCount: number;
  weakEdgeCount: number;
  rejectedEdgeCount: number;
  topicCandidateCount: number;
  publishedTopicCount: number;
  splitMegaClusterCount: number;
  unclusteredProposalCount: number;
  fallbackStoryCount: number;
  oldThemeStoryPathUsageCount: number;
  proposalsWithMoreThan3TopicMemberships: string[];
  topicsWithMoreThan10AnchorSupportingProposals: string[];
  publishedUnclassifiedTopicCount: number;
};

export type TopicClusterLayer = {
  generatedBy: "deterministic_topic_cluster_engine";
  calculationVersion: string;
  ruleVersion: string;
  validatedEdges: ValidatedThemeEdge[];
  themeAssignments: ProposalThemeAssignment[];
  clusters: TopicCluster[];
  memberships: TopicProposalMembership[];
  unclusteredProposalIds: string[];
  topicGapSignals: TopicGapSignal[];
  diagnostics: TopicDiagnostics;
};

export type ProposalThemeAssignment = {
  proposalId: string;
  primaryTheme: string;
  secondaryThemes: string[];
  assignmentEvidence: {
    titleTerms: string[];
    abstractTerms: string[];
    mechanismMatches: string[];
    explicitTags: string[];
  };
  assignmentConfidence: number;
};

type TopicRecipe = {
  id: string;
  displayName: string;
  summary: string;
  primaryThemeIds: string[];
  supportingThemeIds: string[];
  mechanismTerms: string[];
};

export type TopicClusterInput = {
  themeGraph: ThemeGraph;
  changes?: ChangeEvent[];
  discussions?: DiscussionHeatItem[];
  adoptionLayer?: AdoptionLayer;
  collectionCompleteness?: number;
};

const STRONG_THRESHOLD = 0.75;
const SUPPORTING_THRESHOLD = 0.55;
const WEAK_THRESHOLD = 0.35;
const MAX_PUBLISHED_MEMBERSHIPS = 3;
const CALCULATION_VERSION = "phase7b-topic-cluster-2";
const RULE_VERSION = "phase7b-validation-2";

const GENERIC_TERMS = new Set([
  "account",
  "transfer",
  "contract",
  "token",
  "transaction",
  "execution",
  "security",
  "data",
  "registry",
  "state",
  "wallet",
  "interface",
]);

const SPECIFIC_TERMS = [
  "account abstraction",
  "session key",
  "delegated authorization",
  "smart account",
  "paymaster",
  "user operation",
  "webauthn",
  "passkey",
  "restricted transfer",
  "compliance event",
  "asset anchor",
  "vault request",
  "block access list",
  "partial statefulness",
  "post-quantum",
  "proof of reserve",
  "entrypoint",
  "bundler",
  "erc-4337",
  "erc-4626",
  "repository split",
  "eip repository",
  "erc repository",
  "asset registry",
  "nav snapshot",
  "unified binary tree",
  "binary tree",
  "state tree",
];

const TOPIC_RECIPES: TopicRecipe[] = [
  recipe("wallet-authorization-evolution", "Wallet Authorization Evolution", "Wallet authorization, delegation, session permission, and smart-account control are moving as a connected research topic.", ["wallet", "delegation", "account-abstraction"], ["smart-account", "session-key", "passkey", "security", "intent"], ["delegated authorization", "session key", "smart account", "set eoa account code", "webauthn", "passkey", "permission"]),
  recipe("transaction-cost-abstraction", "Transaction Cost Abstraction", "Paymasters, gas sponsorship, and account abstraction infrastructure reduce the visibility of transaction cost handling for end users.", ["account-abstraction", "gas", "payments"], ["infrastructure", "wallet", "tooling"], ["paymaster", "gas sponsorship", "sponsored transaction", "user operation", "fee sponsor"]),
  recipe("programmable-compliance-infrastructure", "Programmable Compliance Infrastructure", "Identity, attestation, restricted transfer, and compliance records form infrastructure for programmable regulated workflows.", ["identity", "compliance", "rwa"], ["asset-attestation", "tokenization", "institutional", "security"], ["compliance event", "restricted transfer", "subject-linked", "credential", "attestation", "kyc"]),
  recipe("asset-attestation-registry-standards", "Asset Attestation and Registry Standards", "Asset anchors, registries, attestations, and valuation snapshots describe how off-chain asset facts can be represented on-chain.", ["rwa", "asset-attestation", "oracle"], ["nav", "tokenization", "compliance", "institutional", "settlement"], ["asset anchor", "asset registry", "proof of reserve", "nav snapshot", "valuation", "attestation"]),
  recipe("block-access-partial-statefulness", "Block Access and Partial Statefulness", "Block access lists and partial statefulness proposals change how execution clients reason about accessed state.", ["execution-layer", "evm", "storage", "statelessness"], ["client", "testing", "performance"], ["block access list", "partial statefulness", "state access", "bal", "access list", "state tree", "binary tree", "unified binary tree"]),
  recipe("gas-repricing-resource-accounting", "Gas Repricing and Resource Accounting", "Gas accounting, resource pricing, and opcode cost changes form a distinct execution economics topic.", ["gas", "evm", "execution-layer"], ["performance", "testing"], ["gas repricing", "resource accounting", "intrinsic gas", "gas cost", "gas floor"]),
  recipe("post-quantum-validator-authentication", "Post-Quantum Validator Authentication", "Post-quantum signing and validator authentication proposals affect consensus and staking security assumptions.", ["cryptography", "consensus", "staking"], ["security", "client"], ["post-quantum", "validator", "attestation aggregator", "keystore", "signature"]),
  recipe("vault-request-standardization", "Vault Request Standardization", "Vault request, redemption, and tokenized claim standards describe repeatable lifecycle flows for vault-based assets.", ["vault", "tokenization", "settlement"], ["rwa", "payments", "institutional"], ["vault request", "erc-4626", "redemption", "redeem", "tokenized vault"]),
  recipe("cross-chain-asset-movement", "Cross-Chain Asset Movement", "Bridge, interoperability, and canonical asset proposals shape cross-chain asset movement and verification.", ["bridge", "interoperability"], ["l2", "rollup", "tokenization"], ["cross-chain", "bridge", "canonical asset", "message passing", "interoperable token"]),
];

export function buildTopicClusterLayer(input: TopicClusterInput): TopicClusterLayer {
  const validatedEdges = validateThemeGraphEdges(input.themeGraph);
  const themeAssignments = assignProposalThemes(input.themeGraph.proposals, validatedEdges);
  const memberships = buildMemberships(input.themeGraph.proposals, validatedEdges);
  const clusters = buildClusters(input, validatedEdges, memberships);
  const clustered = new Set(memberships.filter((membership) => membership.role === "anchor" || membership.role === "supporting").map((membership) => membership.proposalId));
  const unclusteredProposalIds = input.themeGraph.proposals.map((proposal) => proposal.proposalId).filter((proposalId) => !clustered.has(proposalId)).sort(compareIds);
  const topicGapSignals = clusters.flatMap((cluster) => cluster.gaps);
  return {
    generatedBy: "deterministic_topic_cluster_engine",
    calculationVersion: CALCULATION_VERSION,
    ruleVersion: RULE_VERSION,
    validatedEdges,
    themeAssignments,
    clusters,
    memberships,
    unclusteredProposalIds,
    topicGapSignals,
    diagnostics: buildDiagnostics(input.themeGraph.edges.length, validatedEdges, clusters, memberships, unclusteredProposalIds),
  };
}

export function validateThemeGraphEdges(graph: ThemeGraph): ValidatedThemeEdge[] {
  return graph.edges.map((edge) => validateEdge(edge, graph.proposals.find((proposal) => proposal.proposalId === edge.proposalId)));
}

export function getTopicClusters(layer: TopicClusterLayer): TopicCluster[] {
  return layer.clusters;
}

export function getTopicForProposal(layer: TopicClusterLayer, proposalId: string): TopicCluster | undefined {
  const membership = layer.memberships
    .filter((item) => item.proposalId === proposalId && (item.role === "anchor" || item.role === "supporting"))
    .sort(compareMemberships)[0];
  return membership ? layer.clusters.find((cluster) => cluster.id === membership.topicId) : undefined;
}

export function getTopicsForTheme(layer: TopicClusterLayer, themeId: string): TopicCluster[] {
  return layer.clusters.filter((cluster) => cluster.themeIds.includes(themeId));
}

export function getDominantTopics(layer: TopicClusterLayer, limit = 5): TopicCluster[] {
  return [...layer.clusters]
    .sort((left, right) => right.confidence - left.confidence || right.cohesionScore - left.cohesionScore || left.displayName.localeCompare(right.displayName))
    .slice(0, limit);
}

export function getEmergingTopics(layer: TopicClusterLayer): TopicCluster[] {
  return layer.clusters.filter((cluster) => cluster.state === "emerging" || cluster.state === "active");
}

export function getTopicEvidence(layer: TopicClusterLayer, topicId: string): TopicEvidence[] {
  return layer.clusters.find((cluster) => cluster.id === topicId)?.evidence ?? [];
}

export function getTopicCohesion(layer: TopicClusterLayer, topicId: string): number {
  return layer.clusters.find((cluster) => cluster.id === topicId)?.cohesionScore ?? 0;
}

export function getUnclusteredProposals(layer: TopicClusterLayer): string[] {
  return layer.unclusteredProposalIds;
}

export function getProposalThemeAssignments(layer: TopicClusterLayer): ProposalThemeAssignment[] {
  return layer.themeAssignments;
}

function assignProposalThemes(proposals: ProposalRecord[], edges: ValidatedThemeEdge[]): ProposalThemeAssignment[] {
  return proposals.map((proposal) => {
    const proposalEdges = edges
      .filter((edge) => edge.proposalId === proposal.proposalId && (edge.strength === "strong" || edge.strength === "supporting"))
      .sort((left, right) => themeAssignmentScore(proposal, right) - themeAssignmentScore(proposal, left) || right.validatedConfidence - left.validatedConfidence || left.themeId.localeCompare(right.themeId));
    const primary = proposalEdges[0];
    const secondary = proposalEdges.slice(1, 7).map((edge) => edge.themeId);
    const evidence = primary?.matchedEvidence ?? [];
    return {
      proposalId: proposal.proposalId,
      primaryTheme: primary?.themeId ?? "unclassified",
      secondaryThemes: secondary,
      assignmentEvidence: {
        titleTerms: evidence.filter((match) => match.field === "title").map((match) => match.term),
        abstractTerms: evidence.filter((match) => match.field === "description").map((match) => match.term),
        mechanismMatches: evidence.filter((match) => match.field === "bodyExcerpt" || match.field === "keywords").map((match) => match.term),
        explicitTags: evidence.filter((match) => match.field === "category" || match.field === "proposalType").map((match) => match.term),
      },
      assignmentConfidence: Math.round((primary?.validatedConfidence ?? 0) * 100),
    };
  }).sort((left, right) => compareIds(left.proposalId, right.proposalId));
}

function themeAssignmentScore(proposal: ProposalRecord, edge: ValidatedThemeEdge): number {
  let score = edge.validatedConfidence;
  const text = proposalText(proposal);
  const specificCount = edge.matchedEvidence.filter((match) => isSpecificTerm(match.term)).length;
  score += specificCount * 0.08;
  if (edge.matchedEvidence.some((match) => match.field === "title")) score += 0.08;
  if (edge.matchedEvidence.some((match) => match.field === "description")) score += 0.06;
  if (isRepositoryProcessProposal(proposal) && edge.themeId === "repository-governance") score += 0.5;
  if (/rta-controlled security token|restricted transfer/.test(text) && (edge.themeId === "compliance" || edge.themeId === "tokenization")) score += 0.35;
  if (/vault request|tokenized vault/.test(text) && edge.themeId === "vault") score += 0.4;
  if (/ai agent authenticated wallet|agent wallet/.test(text) && edge.themeId === "account-abstraction") score += 0.55;
  if (/ai agent authenticated wallet|agent wallet/.test(text) && edge.themeId === "wallet") score += 0.35;
  if (/ai agent authenticated wallet|agent wallet/.test(text) && edge.themeId === "ai-agent") score += 0.12;
  if (/asset anchor|asset registry/.test(text) && edge.themeId === "asset-attestation") score += 0.4;
  if (/unified binary tree|state tree/.test(text) && (edge.themeId === "storage" || edge.themeId === "statelessness")) score += 0.35;
  if (/compute gas cost|gas cost/.test(text) && edge.themeId === "gas") score += 0.4;
  if (/nav snapshot|net asset value/.test(text) && (edge.themeId === "nav" || edge.themeId === "oracle")) score += 0.35;
  if (unrelatedCategoryPenalty(proposal, edge.themeId)) score -= 0.6;
  if (edge.penalties.includes("generic keyword-only match")) score -= 0.35;
  return score;
}

function validateEdge(edge: ProposalThemeEdge, proposal: ProposalRecord | undefined): ValidatedThemeEdge {
  const terms = edge.matchedEvidence.map((match) => normalize(match.term));
  const specificMatches = terms.filter((term) => isSpecificTerm(term));
  const genericMatches = terms.filter((term) => GENERIC_TERMS.has(term));
  const titleOrDescription = edge.matchedEvidence.some((match) => match.field === "title" || match.field === "description");
  const categoryCompatible = proposal ? categoryCompatibleWithTheme(proposal, edge.themeId) : false;
  const explicitReference = terms.some((term) => /^e(rc|ip)[ -]?\d+$/i.test(term) || /erc-\d+|eip-\d+/.test(term));
  const repositoryProcessOnly = proposal ? isRepositoryProcessProposal(proposal) : false;
  const unrelatedCategory = proposal ? unrelatedCategoryPenalty(proposal, edge.themeId) : false;
  const reasons: string[] = [];
  const penalties: string[] = [];
  let adjusted = edge.confidence;

  if (specificMatches.length >= 2) {
    adjusted += 0.12;
    reasons.push("multiple specific technical phrase matches");
  } else if (specificMatches.length === 1) {
    adjusted += 0.05;
    reasons.push("specific technical phrase match");
  }
  if (titleOrDescription) {
    adjusted += 0.04;
    reasons.push("title or abstract agreement");
  }
  if (categoryCompatible) {
    adjusted += 0.04;
    reasons.push("proposal category is compatible with theme");
  }
  if (explicitReference) {
    adjusted += 0.06;
    reasons.push("explicit EIP/ERC terminology matched");
  }
  if (!specificMatches.length && genericMatches.length > 0) {
    adjusted = Math.min(adjusted, 0.34);
    penalties.push("generic keyword-only match");
  }
  if (genericMatches.length >= 2 && specificMatches.length === 0) {
    adjusted -= 0.12;
    penalties.push("multiple generic terms without specific mechanism");
  }
  if (!titleOrDescription && specificMatches.length === 0) {
    adjusted -= 0.1;
    penalties.push("no title or abstract support");
  }
  if (repositoryProcessOnly && !["governance", "repository-governance", "developer-experience"].includes(edge.themeId)) {
    adjusted = Math.min(adjusted, 0.24);
    penalties.push("repository/process proposal without explicit technical mechanism");
  }
  if (unrelatedCategory) {
    adjusted = Math.min(adjusted, 0.32);
    penalties.push("proposal category is unrelated to theme");
  }

  adjusted = clamp(adjusted);
  const strength: ThemeEdgeStrength = adjusted >= STRONG_THRESHOLD ? "strong"
    : adjusted >= SUPPORTING_THRESHOLD ? "supporting"
    : adjusted >= WEAK_THRESHOLD ? "weak"
    : "rejected";
  if (!reasons.length) reasons.push("theme graph evidence accepted with limited support");
  const evidenceIds = edge.matchedEvidence.map((match) => evidenceId(edge.proposalId, edge.themeId, match));
  return {
    ...edge,
    rawConfidence: edge.confidence,
    validatedConfidence: adjusted,
    adjustedConfidence: adjusted,
    strength,
    accepted: strength !== "rejected",
    reasons,
    positiveEvidence: edge.matchedEvidence.map((match) => `${match.field}:${match.term}`),
    validationReasons: reasons,
    penalties,
    evidenceIds,
  };
}

function buildMemberships(proposals: ProposalRecord[], edges: ValidatedThemeEdge[]): TopicProposalMembership[] {
  const memberships: TopicProposalMembership[] = [];
  for (const proposal of proposals) {
    const proposalEdges = edges.filter((edge) => edge.proposalId === proposal.proposalId);
    const candidates = TOPIC_RECIPES.map((topic) => membershipForProposal(proposal, proposalEdges, topic))
      .filter((membership) => membership.role !== "excluded")
      .sort(compareMemberships);
    const published = candidates.filter((membership) => membership.role === "anchor" || membership.role === "supporting").slice(0, MAX_PUBLISHED_MEMBERSHIPS);
    const adjacent = candidates.filter((membership) => membership.role === "adjacent").slice(0, 1);
    memberships.push(...published, ...adjacent);
  }
  return memberships.sort(compareMemberships);
}

function membershipForProposal(proposal: ProposalRecord, edges: ValidatedThemeEdge[], topic: TopicRecipe): TopicProposalMembership {
  const usableEdges = edges.filter((edge) => edge.strength === "strong" || edge.strength === "supporting");
  const strongThemeHits = usableEdges.filter((edge) => topic.primaryThemeIds.includes(edge.themeId) && edge.strength === "strong");
  const supportingThemeHits = usableEdges.filter((edge) => topic.supportingThemeIds.includes(edge.themeId) || topic.primaryThemeIds.includes(edge.themeId));
  const mechanismHits = topic.mechanismTerms.filter((term) => proposalText(proposal).includes(normalize(term)));
  const reasons: string[] = [];
  let confidence = 0;

  if (strongThemeHits.length) {
    confidence += Math.min(0.5, strongThemeHits.length * 0.22);
    reasons.push(`strong theme match: ${strongThemeHits.map((edge) => edge.displayName).join(", ")}`);
  }
  if (supportingThemeHits.length) {
    confidence += Math.min(0.28, supportingThemeHits.length * 0.07);
    reasons.push(`supporting theme overlap: ${supportingThemeHits.map((edge) => edge.displayName).join(", ")}`);
  }
  if (mechanismHits.length) {
    confidence += Math.min(0.42, mechanismHits.length * 0.16);
    reasons.push(`shared technical mechanism: ${mechanismHits.join(", ")}`);
  }
  if (proposalReferencesTopic(proposal, topic)) {
    confidence += 0.08;
    reasons.push("proposal text contains direct related EIP/ERC reference");
  }
  if (!mechanismHits.length && strongThemeHits.length <= 1) {
    confidence -= 0.18;
    reasons.push("limited to broad theme overlap");
  }

  confidence = clamp(confidence);
  const role: TopicMembershipRole = confidence >= 0.75 ? "anchor"
    : confidence >= 0.55 ? "supporting"
    : confidence >= 0.35 ? "adjacent"
    : "excluded";
  return {
    proposalId: proposal.proposalId,
    topicId: topic.id,
    confidence,
    role,
    reasons,
    evidenceIds: supportingThemeHits.flatMap((edge) => edge.matchedEvidence.map((match) => evidenceId(edge.proposalId, edge.themeId, match))),
  };
}

function buildClusters(input: TopicClusterInput, edges: ValidatedThemeEdge[], memberships: TopicProposalMembership[]): TopicCluster[] {
  return TOPIC_RECIPES.map((topic) => clusterForTopic(input, topic, edges, memberships.filter((membership) => membership.topicId === topic.id)))
    .filter((cluster): cluster is TopicCluster => cluster !== null)
    .sort((left, right) => right.confidence - left.confidence || right.cohesionScore - left.cohesionScore || left.displayName.localeCompare(right.displayName));
}

function clusterForTopic(
  input: TopicClusterInput,
  topic: TopicRecipe,
  edges: ValidatedThemeEdge[],
  memberships: TopicProposalMembership[],
): TopicCluster | null {
  const narrativeMemberships = memberships.filter((membership) => membership.role === "anchor" || membership.role === "supporting").sort(compareMemberships).slice(0, 8);
  if (!narrativeMemberships.length) return null;
  if (narrativeMemberships.length === 1 && narrativeMemberships[0]!.confidence < 0.78) return null;

  const proposalIds = narrativeMemberships.map((membership) => membership.proposalId).sort(compareIds);
  const anchorProposalIds = narrativeMemberships.filter((membership) => membership.role === "anchor").map((membership) => membership.proposalId).sort(compareIds);
  const supportingProposalIds = narrativeMemberships.filter((membership) => membership.role === "supporting").map((membership) => membership.proposalId).sort(compareIds);
  const adjacentProposalIds = memberships.filter((membership) => membership.role === "adjacent").map((membership) => membership.proposalId).sort(compareIds);
  const proposalSet = new Set(proposalIds);
  const topicEdges = edges.filter((edge) => proposalSet.has(edge.proposalId) && (topic.primaryThemeIds.includes(edge.themeId) || topic.supportingThemeIds.includes(edge.themeId)));
  const themeIds = [...new Set(topicEdges.filter((edge) => edge.strength !== "rejected").map((edge) => edge.themeId))].sort();
  const evidence = topicEvidence(topic, proposalIds, topicEdges, input);
  const hasStrongClusterGate = evidence.some((item) => item.type === "term" && item.description.split(",").length >= 2)
    || evidence.some((item) => item.type === "implementation")
    || topicEdges.some((edge) => edge.reasons.some((reason) => /explicit|specific technical phrase|category is compatible/i.test(reason)) && edge.matchedEvidence.filter((match) => isSpecificTerm(match.term)).length >= 2);
  if (!hasStrongClusterGate) return null;
  const cohesion = topicCohesion(topic, narrativeMemberships, topicEdges, evidence);
  if (cohesion.score < 35) return null;
  const maturityProfile = buildMaturityProfile(input, proposalIds);
  const activityProfile = buildActivityProfile(input, proposalIds);
  const gaps = buildGapSignals(activityProfile, maturityProfile, cohesion.score, evidence, input.collectionCompleteness);
  const confidence = Math.round((average(narrativeMemberships.map((membership) => membership.confidence)) * 60) + (cohesion.score * 0.4));
  const limitations = topicLimitations(activityProfile, cohesion.score, input.collectionCompleteness);
  return {
    id: topic.id,
    displayName: topic.displayName,
    summary: topic.summary,
    proposalIds,
    anchorProposalIds,
    supportingProposalIds,
    adjacentProposalIds,
    themeIds,
    primaryThemeIds: topic.primaryThemeIds.filter((themeId) => themeIds.includes(themeId)),
    supportingThemeIds: topic.supportingThemeIds.filter((themeId) => themeIds.includes(themeId)),
    confidence,
    cohesionScore: cohesion.score,
    evidence,
    sharedSignals: sharedSignals(topicEdges, input, proposalIds),
    maturityProfile,
    activityProfile,
    state: topicState(activityProfile, maturityProfile, cohesion.score, input.collectionCompleteness),
    gaps,
    limitations,
    traceability: {
      membershipIds: narrativeMemberships.map((membership) => membershipId(membership)),
      evidenceIds: evidence.map((item) => item.id),
      scoreBreakdown: cohesion.breakdown,
    },
    calculationVersion: CALCULATION_VERSION,
    ruleVersion: RULE_VERSION,
  };
}

function topicEvidence(topic: TopicRecipe, proposalIds: string[], edges: ValidatedThemeEdge[], input: TopicClusterInput): TopicEvidence[] {
  const evidence: TopicEvidence[] = [];
  const sharedThemes = topic.primaryThemeIds.filter((themeId) => proposalIds.filter((proposalId) => edges.some((edge) => edge.proposalId === proposalId && edge.themeId === themeId && edge.strength !== "rejected")).length >= 2);
  if (sharedThemes.length) {
    evidence.push({
      id: `${topic.id}:shared-themes`,
      type: "theme",
      description: `Shared themes: ${sharedThemes.join(", ")}`,
      proposalIds,
      themeIds: sharedThemes,
    });
  }
  const matchedTerms = topic.mechanismTerms.filter((term) => input.themeGraph.proposals.some((proposal) => proposalIds.includes(proposal.proposalId) && proposalText(proposal).includes(normalize(term))));
  if (matchedTerms.length) {
    evidence.push({
      id: `${topic.id}:mechanisms`,
      type: "term",
      description: `Shared technical mechanisms: ${matchedTerms.join(", ")}`,
      proposalIds,
      themeIds: [],
    });
  }
  const changed = (input.changes ?? []).filter((change) => proposalIds.includes(change.proposalId));
  if (changed.length) {
    evidence.push({ id: `${topic.id}:weekly-change`, type: "change", description: `${changed.length} current-period change event(s) collected.`, proposalIds: [...new Set(changed.map((change) => change.proposalId))], themeIds: [] });
  }
  const implementation = implementationEvidence(input, proposalIds);
  if (implementation.length) {
    evidence.push({ id: `${topic.id}:implementation`, type: "implementation", description: `${implementation.length} implementation evidence item(s) collected.`, proposalIds: implementation, themeIds: [] });
  }
  return evidence;
}

function topicCohesion(topic: TopicRecipe, memberships: TopicProposalMembership[], edges: ValidatedThemeEdge[], evidence: TopicEvidence[]): { score: number; breakdown: ScoreBreakdownItem[] } {
  const breakdown: ScoreBreakdownItem[] = [];
  const primaryOverlap = topic.primaryThemeIds.filter((themeId) => memberships.filter((membership) => edges.some((edge) => edge.proposalId === membership.proposalId && edge.themeId === themeId && edge.strength === "strong")).length >= 2).length;
  const mechanismEvidence = evidence.find((item) => item.type === "term")?.description.split(",").length ?? 0;
  const genericPenalty = edges.filter((edge) => edge.penalties.includes("generic keyword-only match")).length;
  const sizePenalty = memberships.length > 8 ? (memberships.length - 8) * 4 : 0;

  addScore(breakdown, "semantic similarity", Math.min(30, average(memberships.map((membership) => membership.confidence)) * 30), "Average topic membership confidence.");
  addScore(breakdown, "strong theme overlap", Math.min(25, primaryOverlap * 10), "Multiple proposals share primary strong themes.");
  addScore(breakdown, "shared technical mechanism", Math.min(25, mechanismEvidence * 6), "Topic-specific mechanism terms are present.");
  addScore(breakdown, "relationship evidence", evidence.some((item) => item.type === "implementation" || item.type === "change") ? 8 : 0, "Change or implementation evidence supports the topic.");
  addScore(breakdown, "generic keyword penalty", -Math.min(20, genericPenalty * 4), "Generic-only theme edges reduce cohesion.");
  addScore(breakdown, "excessive cluster size penalty", -sizePenalty, "Large clusters are penalized unless strongly related.");

  return { score: Math.max(0, Math.min(100, Math.round(breakdown.reduce((sum, item) => sum + item.value, 0)))), breakdown };
}

function buildActivityProfile(input: TopicClusterInput, proposalIds: string[]): TopicActivityProfile {
  const changes = (input.changes ?? []).filter((change) => proposalIds.includes(change.proposalId));
  const discussions = (input.discussions ?? []).filter((discussion) => proposalIds.includes(discussion.proposalId));
  const implementation = implementationEvidence(input, proposalIds);
  const releaseEvidenceCount = (input.adoptionLayer?.items ?? []).filter((item) => proposalIds.includes(item.proposalId) && item.sources.some((source) => source.sourceType === "release_note")).length;
  const dates = [
    ...changes.map((change) => change.detectedAt),
    ...discussions.map((discussion) => discussion.discussionLastActivityAt).filter((date): date is string => Boolean(date)),
    ...(input.adoptionLayer?.items ?? []).flatMap((item) => item.sources.map((source) => source.updatedAt).filter((date): date is string => Boolean(date))),
  ].sort();
  const staleEvidence = (input.adoptionLayer?.items ?? []).flatMap((item) => item.sources).filter((source) => source.freshness?.stale).length;
  const totalEvidence = Math.max(1, (input.adoptionLayer?.items ?? []).flatMap((item) => item.sources).length);
  return {
    proposalCount: proposalIds.length,
    weeklyChangedProposalCount: new Set(changes.map((change) => change.proposalId)).size,
    statusChangeCount: changes.filter((change) => change.type === "status_change" || change.type === "final_transition" || change.type === "withdrawn_transition").length,
    newProposalCount: changes.filter((change) => change.type === "new_proposal").length,
    discussionActivity: discussions.reduce((sum, discussion) => sum + (discussion.discussionActivityScore ?? discussion.discussionScore ?? 0), 0),
    implementationEvidenceCount: implementation.length,
    releaseEvidenceCount,
    averageMaturity: average(proposalIds.map((proposalId) => maturityRank(input.themeGraph.proposals.find((proposal) => proposal.proposalId === proposalId)?.status ?? null))),
    latestEvidenceDate: dates.at(-1),
    staleEvidenceRatio: Math.round((staleEvidence / totalEvidence) * 100) / 100,
  };
}

function buildMaturityProfile(input: TopicClusterInput, proposalIds: string[]): TopicMaturityProfile {
  const profile: TopicMaturityProfile = { draft: 0, review: 0, lastCall: 0, final: 0, implementationTracking: 0, implementationCandidate: 0, verifiedImplementation: 0, released: 0, activated: 0, productionAdoption: 0 };
  for (const proposalId of proposalIds) {
    const status = normalize(input.themeGraph.proposals.find((proposal) => proposal.proposalId === proposalId)?.status ?? "");
    if (status === "draft") profile.draft += 1;
    else if (status === "review") profile.review += 1;
    else if (status === "last call") profile.lastCall += 1;
    else if (status === "final") profile.final += 1;
  }
  for (const item of input.adoptionLayer?.items ?? []) {
    if (!proposalIds.includes(item.proposalId)) continue;
    if (item.sources.some((source) => source.semanticType === "implementation_tracker")) profile.implementationTracking += 1;
    if (item.sources.some((source) => source.semanticType === "client_implementation_pr")) profile.implementationCandidate += 1;
    if (item.sources.some((source) =>
      (source.semanticType === "client_implementation_pr" && source.state === "merged")
      || source.semanticType === "client_code_reference"
    )) profile.verifiedImplementation += 1;
    if (item.sources.some((source) => source.sourceType === "release_note")) profile.released += 1;
  }
  return profile;
}

function topicState(activity: TopicActivityProfile, maturity: TopicMaturityProfile, cohesion: number, collectionCompleteness = 100): TopicState {
  if (collectionCompleteness < 50) return "insufficient evidence";
  if (activity.newProposalCount >= 2 || (activity.newProposalCount >= 1 && cohesion >= 45) || (activity.weeklyChangedProposalCount >= 2 && cohesion >= 55)) return "emerging";
  if (activity.statusChangeCount > 0 || activity.discussionActivity >= 80 || activity.implementationEvidenceCount > 0) return "active";
  if (maturity.final + maturity.lastCall >= Math.max(2, Math.ceil(activity.proposalCount / 2))) return "established";
  if (activity.weeklyChangedProposalCount === 0 && activity.discussionActivity === 0) return "dormant";
  return "insufficient evidence";
}

function buildGapSignals(activity: TopicActivityProfile, maturity: TopicMaturityProfile, cohesion: number, evidence: TopicEvidence[], collectionCompleteness = 100): TopicGapSignal[] {
  const limitations = collectionCompleteness < 50 ? ["Collection completeness is low; absence of evidence must not be interpreted as evidence of absence."] : [];
  const gaps: TopicGapSignal[] = [];
  if (activity.weeklyChangedProposalCount > 0 && activity.implementationEvidenceCount === 0) {
    gaps.push(gap("implementation_missing", "medium", "The topic remains proposal-led; implementation evidence was not collected.", evidence.map((item) => item.id), ["client PR", "implementation branch", "implementation tracker"], 70, limitations));
  }
  if (maturity.final > 0 && activity.releaseEvidenceCount === 0) {
    gaps.push(gap("release_missing", "medium", "Final proposal status does not by itself establish release or adoption; release evidence is still required.", evidence.map((item) => item.id), ["release note", "stable client version"], 65, limitations));
  }
  if (cohesion < 50) {
    gaps.push(gap("low_cohesion", "low", "The topic has related signals but limited cohesion; narrative use should be cautious.", evidence.map((item) => item.id), ["direct proposal reference", "shared implementation repository"], 55, limitations));
  }
  gaps.push(gap("adoption_not_supported", "low", "The current evidence does not support adoption.", evidence.map((item) => item.id), ["production deployment", "ecosystem integration", "operational use"], 75, limitations));
  return gaps;
}

function topicLimitations(activity: TopicActivityProfile, cohesion: number, collectionCompleteness = 100): string[] {
  const limits = ["Activity, maturity, implementation, release, and adoption are separate dimensions."];
  if (collectionCompleteness < 50) limits.push("Collection is degraded; do not infer decline or inactivity.");
  if (activity.implementationEvidenceCount === 0) limits.push("Implementation evidence was not collected; do not conclude that no implementation exists.");
  if (cohesion < 55) limits.push("Topic cohesion is moderate; adjacent proposals should not drive conclusions.");
  return limits;
}

function sharedSignals(edges: ValidatedThemeEdge[], input: TopicClusterInput, proposalIds: string[]): string[] {
  const strongThemes = [...new Set(edges.filter((edge) => edge.strength === "strong").map((edge) => edge.displayName))];
  const changes = (input.changes ?? []).filter((change) => proposalIds.includes(change.proposalId));
  return [
    strongThemes.length ? `Strong shared themes: ${strongThemes.join(", ")}` : "",
    changes.length ? `Current-period changes: ${changes.length}` : "",
    implementationEvidence(input, proposalIds).length ? `Implementation evidence collected: ${implementationEvidence(input, proposalIds).length}` : "",
  ].filter(Boolean);
}

function implementationEvidence(input: TopicClusterInput, proposalIds: string[]): string[] {
  return (input.adoptionLayer?.items ?? [])
    .filter((item) => proposalIds.includes(item.proposalId) && item.evidenceLevel === "Implementation")
    .map((item) => item.proposalId);
}

function categoryCompatibleWithTheme(proposal: ProposalRecord, themeId: string): boolean {
  const text = normalize(`${proposal.proposalType ?? ""} ${proposal.category ?? ""} ${proposal.kind}`);
  if (["repository-governance", "governance"].includes(themeId) && isRepositoryProcessProposal(proposal)) return true;
  if (["vault", "tokenization", "settlement"].includes(themeId) && /erc|token/.test(text)) return true;
  if (["asset-attestation", "rwa", "oracle", "nav"].includes(themeId)) return /erc|token|standards/.test(text);
  if (["storage", "statelessness"].includes(themeId)) return /core|eip|standards/.test(text);
  if (["tokenization", "rwa", "compliance", "stablecoin"].includes(themeId)) return /erc|token/.test(text);
  if (["execution-layer", "evm", "gas", "eof", "consensus", "staking"].includes(themeId)) return /core|eip|standards/.test(text);
  if (["wallet", "account-abstraction", "smart-account", "delegation", "session-key", "passkey"].includes(themeId)) return /erc|interface|standards/.test(text);
  return true;
}

function isRepositoryProcessProposal(proposal: ProposalRecord): boolean {
  const text = proposalText(proposal);
  return /repository split|eip repository|erc repository|repository governance|proposal repository|editorial workflow/.test(text)
    && !/wallet|account abstraction|delegated authorization|smart account|paymaster|session key|passkey/.test(text);
}

function unrelatedCategoryPenalty(proposal: ProposalRecord, themeId: string): boolean {
  const text = proposalText(proposal);
  if (["wallet", "account-abstraction", "delegation", "smart-account", "session-key", "passkey"].includes(themeId)) {
    return /vault request|asset anchor|nav snapshot|binary tree|compute gas cost|repository split|repository governance/.test(text)
      && !/wallet|account abstraction|delegated authorization|smart account|paymaster|session key|passkey|webauthn/.test(text);
  }
  if (["vault", "tokenization", "settlement"].includes(themeId)) {
    return /binary tree|state tree|compute gas cost|repository split|post-quantum|validator/.test(text)
      && !/vault|tokenized vault|erc 4626|erc-4626|redemption|settlement|tokenization/.test(text);
  }
  if (["consensus", "staking", "cryptography"].includes(themeId)) {
    return /nav snapshot|asset anchor|vault request|repository split/.test(text)
      && !/validator|post quantum|post-quantum|signature|consensus|staking|cryptography|kzg/.test(text);
  }
  if (["identity"].includes(themeId)) {
    return /vault request|binary tree|compute gas cost/.test(text)
      && !/identity|credential|subject|kyc|authentication/.test(text);
  }
  if (["evm", "execution-layer", "gas"].includes(themeId)) {
    return /vault request|asset anchor|nav snapshot|repository split/.test(text)
      && !/evm|execution|gas|opcode|state transition|transaction|binary tree|state tree|block access list/.test(text);
  }
  return false;
}

function buildDiagnostics(
  rawThemeEdgeCount: number,
  validatedEdges: ValidatedThemeEdge[],
  clusters: TopicCluster[],
  memberships: TopicProposalMembership[],
  unclusteredProposalIds: string[],
): TopicDiagnostics {
  const publishedByProposal = countBy(
    memberships.filter((membership) => membership.role === "anchor" || membership.role === "supporting"),
    (membership) => membership.proposalId,
  );
  return {
    rawThemeEdgeCount,
    acceptedStrongEdgeCount: validatedEdges.filter((edge) => edge.strength === "strong").length,
    acceptedSupportingEdgeCount: validatedEdges.filter((edge) => edge.strength === "supporting").length,
    weakEdgeCount: validatedEdges.filter((edge) => edge.strength === "weak").length,
    rejectedEdgeCount: validatedEdges.filter((edge) => edge.strength === "rejected").length,
    topicCandidateCount: TOPIC_RECIPES.length,
    publishedTopicCount: clusters.length,
    splitMegaClusterCount: 0,
    unclusteredProposalCount: unclusteredProposalIds.length,
    fallbackStoryCount: 0,
    oldThemeStoryPathUsageCount: 0,
    proposalsWithMoreThan3TopicMemberships: Object.entries(publishedByProposal).filter(([, count]) => count > 3).map(([proposalId]) => proposalId).sort(compareIds),
    topicsWithMoreThan10AnchorSupportingProposals: clusters.filter((cluster) => cluster.proposalIds.length > 10).map((cluster) => cluster.id).sort(),
    publishedUnclassifiedTopicCount: clusters.filter((cluster) => /unclassified/i.test(cluster.displayName)).length,
  };
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyOf(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function proposalReferencesTopic(proposal: ProposalRecord, topic: TopicRecipe): boolean {
  const text = proposalText(proposal);
  return topic.mechanismTerms.some((term) => /e(ip|rc)-?\d+/i.test(term) && text.includes(normalize(term)));
}

function proposalText(proposal: ProposalRecord): string {
  return normalize([
    proposal.proposalId,
    proposal.title,
    proposal.description,
    proposal.bodyExcerpt,
    proposal.proposalType,
    proposal.category,
    ...(proposal.keywords ?? []),
  ].filter(Boolean).join(" "));
}

function isSpecificTerm(term: string): boolean {
  return SPECIFIC_TERMS.some((specific) => term.includes(normalize(specific)) || normalize(specific).includes(term) && term.length >= 8);
}

function maturityRank(status: string | null): number {
  const normalized = normalize(status ?? "");
  if (normalized === "final") return 5;
  if (normalized === "last call") return 4;
  if (normalized === "review") return 3;
  if (normalized === "draft") return 2;
  return 1;
}

function addScore(items: ScoreBreakdownItem[], label: string, value: number, reason: string): void {
  if (value !== 0) items.push({ label, value: Math.round(value), reason });
}

function gap(type: TopicGapSignal["type"], severity: TopicGapSignal["severity"], explanation: string, supportingEvidence: string[], missingEvidence: string[], confidence: number, limitations: string[]): TopicGapSignal {
  return { type, severity, explanation, supportingEvidence, missingEvidence, confidence, limitations };
}

function recipe(id: string, displayName: string, summary: string, primaryThemeIds: string[], supportingThemeIds: string[], mechanismTerms: string[]): TopicRecipe {
  return { id, displayName, summary, primaryThemeIds, supportingThemeIds, mechanismTerms };
}

function membershipId(membership: TopicProposalMembership): string {
  return `${membership.topicId}:${membership.proposalId}:${membership.role}`;
}

function evidenceId(proposalId: string, themeId: string, match: ThemeEvidenceMatch): string {
  return `${proposalId}:${themeId}:${match.field}:${normalize(match.term).replace(/\s+/g, "-")}`;
}

function compareMemberships(left: TopicProposalMembership, right: TopicProposalMembership): number {
  return right.confidence - left.confidence || roleRank(left.role) - roleRank(right.role) || left.topicId.localeCompare(right.topicId) || compareIds(left.proposalId, right.proposalId);
}

function roleRank(role: TopicMembershipRole): number {
  if (role === "anchor") return 0;
  if (role === "supporting") return 1;
  if (role === "adjacent") return 2;
  return 3;
}

function compareIds(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true });
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, Math.round(value * 100) / 100));
}
