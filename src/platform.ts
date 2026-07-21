import { adoptionEvidenceForProposal } from "./adoption.ts";
import type {
  AdoptionEvidenceItem,
  AdoptionEvidenceSource,
  ClientCoverageCell,
  ClientCoverageMatrix,
  ClientFamily,
  ClientImplementationStatus,
  ClientName,
  ConfidenceBreakdown,
  DataCompletenessStatus,
  DeploymentIntelligence,
  DeploymentStatus,
  EvidenceGraph,
  EvidenceGraphEdgeType,
  EvidenceGraphNodeType,
  KgldImpactArea,
  KgldImpactLevel,
  KgldIntelligenceItem,
  LifecycleStage,
  LifecycleStageName,
  LifecycleTimeline,
  PlatformDashboard,
  ReleaseIntelligence,
  ReleaseStatus,
  RiskFlag,
  ScoreBreakdownItem,
  SectionVisibilityDecision,
  TechnologyPlatformLayer,
  TechnologyRadarItem,
  TechnologyRadarQuadrant,
  ThemeInsight,
  ThemeIntelligence,
} from "./types.ts";

type PlatformProposal = {
  proposalId: string;
  title: string;
  status: string;
  theme: string;
  canonicalUrl?: string;
};

type PlatformReportInput = Omit<import("./types.ts").WeeklyRadarReport, "chartData"> & {
  chartData?: import("./types.ts").WeeklyRadarReport["chartData"];
};

const LIFECYCLE_STAGES: LifecycleStageName[] = [
  "Discussion",
  "Draft",
  "Review",
  "Last Call",
  "Final",
  "Implementation Tracking",
  "Implementation Candidate",
  "Verified Implementation",
  "Released",
  "Activated",
  "Production Adoption",
];

const EXECUTION_CLIENTS: ClientName[] = ["go-ethereum", "Nethermind", "Besu", "Erigon", "EthereumJS"];
const CONSENSUS_CLIENTS: ClientName[] = ["Lighthouse", "Prysm", "Teku", "Nimbus", "Lodestar"];
const CALCULATION_VERSION = "phase12-platform-1";
const RULE_VERSION = "phase12-conservative-1";

export function buildTechnologyPlatformLayer(report: PlatformReportInput): TechnologyPlatformLayer {
  const proposals = platformProposals(report);
  const lifecycleTimelines = proposals.map((proposal) => buildLifecycleTimeline(report, proposal));
  const clientMatrices = proposals.map((proposal) => buildClientCoverageMatrix(report, proposal.proposalId));
  const releaseIntelligence = proposals.map((proposal) => buildReleaseIntelligence(report, proposal.proposalId));
  const deploymentIntelligence = proposals.map((proposal) => buildDeploymentIntelligence(report, proposal.proposalId));
  const evidenceGraphs = proposals.map((proposal) => buildEvidenceGraph(report, proposal));
  const themeIntelligence = report.ethereumTechRadar.themeInsights.map((theme) =>
    buildThemeIntelligence(theme, report.ethereumTechRadar.adoptionLayer?.items ?? [])
  );
  const kgldIntelligence = proposals.map((proposal) => buildKgldIntelligence(report, proposal));
  const confidence = proposals.map((proposal) => buildConfidenceBreakdown(report, proposal));
  const technologyRadar = proposals.map((proposal) =>
    buildTechnologyRadarItem(
      proposal,
      lifecycleTimelines.find((item) => item.proposalId === proposal.proposalId),
      kgldIntelligence.find((item) => item.proposalId === proposal.proposalId),
      confidence.find((item) => item.proposalId === proposal.proposalId),
    )
  );
  const risks = proposals.flatMap((proposal) =>
    buildRiskFlags(
      report,
      proposal,
      lifecycleTimelines.find((item) => item.proposalId === proposal.proposalId),
      clientMatrices.find((item) => item.proposalId === proposal.proposalId),
      releaseIntelligence.find((item) => item.proposalId === proposal.proposalId),
      deploymentIntelligence.find((item) => item.proposalId === proposal.proposalId),
    )
  );
  const dashboard = buildPlatformDashboard(report, lifecycleTimelines, clientMatrices, releaseIntelligence, deploymentIntelligence, kgldIntelligence, themeIntelligence, technologyRadar);
  const dataCompleteness = buildDataCompleteness(report);
  const sectionVisibility = buildSectionVisibility(lifecycleTimelines, clientMatrices, releaseIntelligence, deploymentIntelligence, evidenceGraphs, themeIntelligence, kgldIntelligence, confidence, technologyRadar, risks, dataCompleteness);
  const hiddenCardCount = sectionVisibility.filter((item) => !item.visible).length
    + clientMatrices.reduce((total, matrix) => total + matrix.clients.filter((client) => client.status === "No evidence").length, 0);
  const deduplicatedClaimCount = deduplicatedClaimCountFor(lifecycleTimelines, risks);
  const staleEvidenceCount = countStaleEvidence(lifecycleTimelines);

  const layer: TechnologyPlatformLayer = {
    generatedBy: "deterministic",
    lifecycleTimelines,
    clientMatrices,
    releaseIntelligence,
    deploymentIntelligence,
    evidenceGraphs,
    themeIntelligence,
    kgldIntelligence,
    confidence,
    technologyRadar,
    risks,
    dashboard,
    dataCompleteness,
    sectionVisibility,
    hiddenCardCount,
    deduplicatedClaimCount,
    staleEvidenceCount,
    api: {
      lifecycle: lifecycleTimelines,
      clientMatrix: clientMatrices,
      evidenceGraph: evidenceGraphs,
      themes: themeIntelligence,
      technologyRadar,
      dashboard,
      dataCompleteness,
    },
  };
  printPlatformDebug(layer);
  return layer;
}

function platformProposals(report: PlatformReportInput): PlatformProposal[] {
  const byId = new Map<string, PlatformProposal>();
  const add = (proposalId: string, title?: string | null, status?: string | null, theme?: string, canonicalUrl?: string) => {
    if (!proposalId || byId.has(proposalId)) return;
    byId.set(proposalId, {
      proposalId,
      title: title ?? proposalId,
      status: status ?? "Unknown",
      theme: theme ?? "Unclassified",
      canonicalUrl,
    });
  };

  for (const item of report.ethereumTechRadar.watchlistLayer?.items ?? []) {
    for (const proposalId of item.relatedProposals) {
      const found = findRepresentativeProposal(report, proposalId);
      add(proposalId, found?.title, found?.status, item.theme, found?.canonicalUrl);
    }
  }
  for (const item of report.ethereumTechRadar.adoptionLayer?.items ?? []) {
    add(item.proposalId, item.title, undefined, item.theme);
  }
  for (const item of report.ethereumTechRadar.signalLayer.discussionHeat.slice(0, 12)) {
    add(item.proposalId, item.title, item.status, String(item.theme), item.canonicalUrl);
  }
  for (const theme of report.ethereumTechRadar.themeInsights.slice(0, 8)) {
    for (const proposal of theme.representativeProposals.slice(0, 4)) {
      add(proposal.id, proposal.title, proposal.status, theme.theme, proposal.canonicalUrl);
    }
  }
  return [...byId.values()].slice(0, 40);
}

function findRepresentativeProposal(report: PlatformReportInput, proposalId: string) {
  for (const theme of report.ethereumTechRadar.themeInsights) {
    const found = theme.representativeProposals.find((proposal) => proposal.id === proposalId);
    if (found) return found;
  }
  return undefined;
}

function buildLifecycleTimeline(report: PlatformReportInput, proposal: PlatformProposal): LifecycleTimeline {
  const adoption = adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, [proposal.proposalId]);
  const discussion = report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === proposal.proposalId);
  const generatedAt = report.generatedAt;
  const status = proposal.status.toLowerCase();
  const stageEvidence = new Map<LifecycleStageName, LifecycleStage["evidence"]>();
  const stageLinks = new Map<LifecycleStageName, string[]>();
  const stageTimestamps = new Map<LifecycleStageName, string>();

  if (discussion) {
    addStageEvidence(stageEvidence, stageLinks, "Discussion", discussion.discussionTitle ?? "Public discussion", discussion.discussionUrl ?? undefined, `discussion:${proposal.proposalId}`, freshness(generatedAt, discussion.discussionLastActivityAt, 14));
    if (discussion.discussionLastActivityAt) stageTimestamps.set("Discussion", discussion.discussionLastActivityAt);
  }
  if (["draft", "review", "last call", "final"].includes(status)) {
    addStageEvidence(stageEvidence, stageLinks, titleCaseStatus(proposal.status), `${proposal.proposalId} status: ${proposal.status}`, proposal.canonicalUrl, `status:${proposal.proposalId}:${proposal.status}`, freshness(generatedAt, undefined, 30));
  }
  if (adoption) {
    for (const source of adoption.sources) {
      const mapped = stageForAdoptionSource(source);
      if (!mapped) continue;
      const sourceId = evidenceIdForSource(source, proposal.proposalId);
      addStageEvidence(stageEvidence, stageLinks, mapped, source.title ?? source.repo ?? source.sourceType, source.url, sourceId, freshness(generatedAt, source.updatedAt ?? source.observedAt, source.sourceType === "release_note" ? 30 : 14));
      if (source.updatedAt) stageTimestamps.set(mapped, source.updatedAt);
    }
  }

  const currentStage = currentLifecycleStage(proposal.status, adoption, stageEvidence);
  const timelineEvidenceIds = [...new Set([...stageEvidence.values()].flat().map((evidence) => evidence.evidenceId).filter((id): id is string => Boolean(id)))];
  return {
    proposalId: proposal.proposalId,
    title: proposal.title,
    theme: proposal.theme,
    currentStage,
    stages: LIFECYCLE_STAGES.map((name) => {
      const evidence = stageEvidence.get(name) ?? [];
      const completed = isStageCompletedByStatus(name, proposal.status) || evidence.length > 0;
      return {
        name,
        state: name === currentStage ? "current" : completed ? "completed" : "future",
        confidence: stageConfidence(name, evidence, adoption),
        evidence,
        timestamp: stageTimestamps.get(name),
        sourceLinks: stageLinks.get(name) ?? [],
        limitations: stageLimitations(name, evidence),
        scoreBreakdown: lifecycleStageScoreBreakdown(name, evidence, adoption),
        traceability: trace(timelineEvidenceIds, [`proposal:${proposal.proposalId}`, `stage:${name}`]),
        freshness: mergeFreshness(evidence.map((item) => item.freshness).filter((item): item is NonNullable<typeof item> => Boolean(item))),
      };
    }),
    traceability: trace(timelineEvidenceIds, [`proposal:${proposal.proposalId}`, "lifecycle"]),
  };
}

function titleCaseStatus(status: string): LifecycleStageName {
  if (/last call/i.test(status)) return "Last Call";
  if (/final/i.test(status)) return "Final";
  if (/review/i.test(status)) return "Review";
  return "Draft";
}

function addStageEvidence(
  stageEvidence: Map<LifecycleStageName, LifecycleStage["evidence"]>,
  stageLinks: Map<LifecycleStageName, string[]>,
  stage: LifecycleStageName,
  label: string,
  url?: string,
  evidenceId?: string,
  freshnessMetadata?: LifecycleStage["evidence"][number]["freshness"],
): void {
  const evidence = stageEvidence.get(stage) ?? [];
  evidence.push({ label, url, evidenceId, freshness: freshnessMetadata });
  stageEvidence.set(stage, evidence);
  if (url) stageLinks.set(stage, [...(stageLinks.get(stage) ?? []), url]);
}

function stageForAdoptionSource(source: AdoptionEvidenceSource): LifecycleStageName | null {
  if (source.sourceType === "release_note" && /\b(?:rc|beta|candidate)\b/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) return "Released";
  if (source.sourceType === "release_note") return "Released";
  if (source.semanticType === "implementation_tracker") return "Implementation Tracking";
  if (source.semanticType === "client_implementation_pr") return "Implementation Candidate";
  if (source.semanticType === "client_code_reference" && source.evidenceKind === "implementation" && source.relationship === "direct") return "Verified Implementation";
  return null;
}

function currentLifecycleStage(
  status: string,
  adoption: AdoptionEvidenceItem | undefined,
  evidence: Map<LifecycleStageName, LifecycleStage["evidence"]>,
): LifecycleStageName {
  if (evidence.get("Production Adoption")?.length) return "Production Adoption";
  if (evidence.get("Activated")?.length) return "Activated";
  if (evidence.get("Released")?.length) return "Released";
  if (adoption?.evidenceLevel === "Implementation" || evidence.get("Verified Implementation")?.length) return "Verified Implementation";
  if (evidence.get("Implementation Candidate")?.length) return "Implementation Candidate";
  if (evidence.get("Implementation Tracking")?.length) return "Implementation Tracking";
  if (/final/i.test(status)) return "Final";
  if (/last call/i.test(status)) return "Last Call";
  if (/review/i.test(status)) return "Review";
  if (/draft/i.test(status)) return "Draft";
  if (evidence.get("Discussion")?.length) return "Discussion";
  return "Discussion";
}

function isStageCompletedByStatus(stage: LifecycleStageName, status: string): boolean {
  const normalized = status.toLowerCase();
  const order = ["Discussion", "Draft", "Review", "Last Call", "Final"] as const;
  const current = /final/.test(normalized) ? "Final"
    : /last call/.test(normalized) ? "Last Call"
      : /review/.test(normalized) ? "Review"
        : /draft/.test(normalized) ? "Draft"
          : "Discussion";
  return order.includes(stage as typeof order[number])
    && order.indexOf(stage as typeof order[number]) <= order.indexOf(current);
}

function stageConfidence(stage: LifecycleStageName, evidence: LifecycleStage["evidence"], adoption: AdoptionEvidenceItem | undefined): number {
  if (!evidence.length && !["Discussion", "Draft"].includes(stage)) return 0;
  if (stage === "Verified Implementation") return adoption?.evidenceLevel === "Implementation" ? 70 : 0;
  if (stage === "Implementation Tracking") return Math.min(80, 35 + evidence.length * 10);
  if (stage === "Released" || stage === "Activated" || stage === "Production Adoption") return evidence.length ? 50 : 0;
  return Math.min(85, 40 + evidence.length * 10);
}

function stageLimitations(stage: LifecycleStageName, evidence: LifecycleStage["evidence"]): string[] {
  if (!evidence.length) return [`No explicit ${stage.toLowerCase()} evidence was collected.`];
  if (stage === "Implementation Tracking") return ["Tracking evidence is not verified client support."];
  if (stage === "Verified Implementation") return ["Implementation evidence is not release, activation, or production adoption evidence."];
  if (stage === "Released") return ["Release evidence does not imply network activation."];
  if (stage === "Activated") return ["Activation evidence does not imply production ecosystem adoption."];
  return ["Stage is based only on collected public metadata and source links."];
}

function buildClientCoverageMatrix(report: PlatformReportInput, proposalId: string): ClientCoverageMatrix {
  const adoption = adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, [proposalId]);
  const cells = [...EXECUTION_CLIENTS.map((client) => clientCell(client, "execution", adoption)), ...CONSENSUS_CLIENTS.map((client) => clientCell(client, "consensus", adoption))];
  return { proposalId, clients: cells };
}

function clientCell(client: ClientName, family: ClientFamily, adoption: AdoptionEvidenceItem | undefined): ClientCoverageCell {
  const sources = (adoption?.sources ?? []).filter((source) => clientMatchesSource(client, source));
  const status = clientStatusFromSources(sources);
  const evidence = sources.map((source) => ({
    label: source.title ?? source.repo ?? source.sourceType,
    url: source.url,
    sourceType: source.semanticType,
    evidenceId: evidenceIdForSource(source, adoption?.proposalId ?? client),
  }));
  const score = status === "No evidence" ? 0 : Math.min(85, Math.max(...sources.map((source) => source.confidence === "High" ? 80 : source.confidence === "Medium" ? 60 : 35)));
  return {
    client,
    family,
    status,
    confidence: score,
    evidence,
    limitations: status === "No evidence" ? ["No client-specific source was accepted."] : ["Client state is source-derived and does not imply release or activation."],
    scoreBreakdown: clientScoreBreakdown(status, sources),
    traceability: trace(evidence.map((item) => item.evidenceId).filter((id): id is string => Boolean(id)), [`client:${client}`]),
  };
}

function clientMatchesSource(client: ClientName, source: AdoptionEvidenceSource): boolean {
  const haystack = `${source.repo ?? ""} ${source.title ?? ""} ${source.path ?? ""}`.toLowerCase();
  if (client === "go-ethereum") return /go-ethereum|geth/.test(haystack);
  return haystack.includes(client.toLowerCase());
}

function clientStatusFromSources(sources: AdoptionEvidenceSource[]): ClientImplementationStatus {
  if (!sources.length) return "No evidence";
  if (sources.some((source) => source.sourceType === "release_note" && /activate|mainnet/i.test(`${source.title ?? ""} ${source.path ?? ""}`))) return "Activated";
  if (sources.some((source) => source.sourceType === "release_note")) return "Released";
  if (sources.some((source) => source.semanticType === "client_code_reference" && source.relationship === "direct")) return "Verified";
  if (sources.some((source) => source.semanticType === "client_implementation_pr")) return "Candidate";
  return "Tracking";
}

function buildReleaseIntelligence(report: PlatformReportInput, proposalId: string): ReleaseIntelligence {
  const sources = adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, [proposalId])?.sources ?? [];
  const releaseSources = sources.filter((source) => source.sourceType === "release_note" || /\b(?:release|released|tag|version|changelog|mainnet|beta|rc)\b/i.test(`${source.title ?? ""} ${source.path ?? ""}`));
  const status: ReleaseStatus = releaseSources.some((source) => /activate|mainnet/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) ? "Activated"
    : releaseSources.some((source) => /\b(?:release|released|tag|version|changelog)\b/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) ? "Released"
      : releaseSources.some((source) => /\b(?:beta|rc|candidate)\b/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) ? "Release Candidate"
        : "No release";
  return {
    proposalId,
    status,
    confidence: releaseSources.length ? 55 : 0,
    evidence: releaseSources.map((source) => ({ label: source.title ?? source.path ?? "Release evidence", url: source.url, sourceType: source.sourceType, evidenceId: evidenceIdForSource(source, proposalId) })),
    limitations: status === "No release" ? ["No release notes, tags, changelog, or official release evidence were accepted."] : ["Release evidence is separate from activation and production adoption."],
    scoreBreakdown: releaseScoreBreakdown(status, releaseSources),
    traceability: trace(releaseSources.map((source) => evidenceIdForSource(source, proposalId)), [`release:${proposalId}`]),
  };
}

function buildDeploymentIntelligence(report: PlatformReportInput, proposalId: string): DeploymentIntelligence {
  const sources = adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, [proposalId])?.sources ?? [];
  const activationSources = sources.filter((source) => {
    if (source.relationship !== "direct") return false;
    if (source.semanticType === "canonical_status_change" || source.semanticType === "canonical_document_change" || source.semanticType === "cluster_reference") return false;
    return /activate|activation|mainnet|testnet|default enable/i.test(`${source.title ?? ""} ${source.path ?? ""}`);
  });
  const status: DeploymentStatus = activationSources.some((source) => /production/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) ? "Production"
    : activationSources.some((source) => /default enable/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) ? "Default enabled"
      : activationSources.some((source) => /mainnet/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) ? "Mainnet activation"
        : activationSources.some((source) => /testnet/i.test(`${source.title ?? ""} ${source.path ?? ""}`)) ? "Testnet activation"
          : "No evidence";
  return {
    proposalId,
    status,
    confidence: status === "No evidence" ? 0 : 45,
    evidence: activationSources.map((source) => ({ label: source.title ?? source.path ?? "Activation evidence", url: source.url, sourceType: source.semanticType, evidenceId: evidenceIdForSource(source, proposalId) })),
    limitations: status === "No evidence" ? ["No fork activation, network upgrade, mainnet, testnet, or default enablement evidence was accepted."] : ["Deployment evidence is not ecosystem production adoption by itself."],
    scoreBreakdown: deploymentScoreBreakdown(status, activationSources),
    traceability: trace(activationSources.map((source) => evidenceIdForSource(source, proposalId)), [`deployment:${proposalId}`]),
  };
}

function buildEvidenceGraph(report: PlatformReportInput, proposal: PlatformProposal): EvidenceGraph {
  const nodes = [{ id: proposal.proposalId, type: "EIP" as EvidenceGraphNodeType, label: `${proposal.proposalId} ${proposal.title}`, url: proposal.canonicalUrl }];
  const edges: EvidenceGraph["edges"] = [];
  const addNode = (id: string, type: EvidenceGraphNodeType, label: string, url?: string) => {
    if (!nodes.some((node) => node.id === id)) nodes.push({ id, type, label, url });
  };
  const addEdge = (from: string, to: string, type: EvidenceGraphEdgeType) => edges.push({ from, to, type });
  const discussion = report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === proposal.proposalId);
  if (discussion?.discussionUrl) {
    const id = `discussion:${proposal.proposalId}`;
    addNode(id, "Discussion", discussion.discussionTitle ?? "Discussion", discussion.discussionUrl);
    addEdge(id, proposal.proposalId, "discusses");
  }
  for (const source of adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, [proposal.proposalId])?.sources ?? []) {
    const id = source.url ?? `${proposal.proposalId}:${source.sourceType}:${source.title ?? source.path ?? source.repo ?? "source"}`;
    addNode(id, graphNodeType(source), source.title ?? source.path ?? source.repo ?? source.sourceType, source.url);
    addEdge(id, proposal.proposalId, graphEdgeType(source));
    const client = sourceClient(source);
    if (client) {
      addNode(`client:${client}`, "Client", client);
      addEdge(id, `client:${client}`, source.semanticType === "client_code_reference" ? "implements" : "references");
    }
  }
  return { proposalId: proposal.proposalId, nodes, edges, traceability: trace(edges.map((edge) => edge.from).filter((id) => !id.startsWith("client:")), [`graph:${proposal.proposalId}`]) };
}

function graphNodeType(source: AdoptionEvidenceSource): EvidenceGraphNodeType {
  if (source.sourceType === "github_issue") return source.semanticType === "core_developer_coordination" ? "Meeting" : "Issue";
  if (source.sourceType === "github_pr") return "PR";
  if (source.sourceType === "release_note") return "Release";
  if (source.sourceType === "code_reference") return "Commit";
  if (source.sourceType === "documentation") return "Spec";
  return "Spec";
}

function graphEdgeType(source: AdoptionEvidenceSource): EvidenceGraphEdgeType {
  if (source.semanticType === "implementation_tracker") return "tracks";
  if (source.semanticType === "client_implementation_pr" || source.semanticType === "client_code_reference") return "implements";
  if (source.sourceType === "release_note") return "releases";
  return "references";
}

function sourceClient(source: AdoptionEvidenceSource): ClientName | undefined {
  return [...EXECUTION_CLIENTS, ...CONSENSUS_CLIENTS].find((client) => clientMatchesSource(client, source));
}

function buildThemeIntelligence(theme: ThemeInsight, adoptionItems: AdoptionEvidenceItem[]): ThemeIntelligence {
  const themeAdoption = adoptionItems.filter((item) => item.theme === theme.theme);
  const hasImplementation = themeAdoption.some((item) => item.evidenceLevel === "Implementation");
  const hasReference = themeAdoption.some((item) => item.evidenceLevel === "Reference");
  const adoption = hasImplementation ? "implementation" : hasReference ? "reference" : themeAdoption.length ? "mixed" : "none";
  const risk = theme.momentumScore >= 60 && adoption === "none" ? "High" : theme.momentumScore >= 40 && adoption !== "implementation" ? "Medium" : "Low";
  const lifecycle = theme.maturitySignal === "high" ? "mature" : theme.maturitySignal === "medium" ? "standardizing" : "early";
  const readiness = hasImplementation ? "Trial" : theme.maturitySignal === "high" && adoption === "reference" ? "Watch" : risk === "High" ? "Hold" : "Watch";
  return {
    theme: theme.theme,
    health: Math.min(100, Math.round((theme.momentumScore + theme.proposalCount180d * 3 + theme.discussionProposalCount * 4) / 2)),
    momentum: theme.momentumScore,
    lifecycle,
    adoption,
    risk,
    readiness,
    why: `${theme.proposalCount180d} proposals, ${theme.discussionProposalCount} discussion links, ${theme.recentChangeCount7d} recent changes.`,
    scoreBreakdown: [
      { label: "momentum score", value: theme.momentumScore, reason: "Theme momentum from existing momentum engine." },
      { label: "proposal density", value: theme.proposalCount180d * 3, reason: "Recent proposal count contribution." },
      { label: "discussion coverage", value: theme.discussionProposalCount * 4, reason: "Discussion-linked proposal contribution." },
    ],
    traceability: trace(theme.representativeProposals.map((proposal) => `proposal:${proposal.id}`), [`theme:${theme.theme}`]),
  };
}

function buildKgldIntelligence(report: PlatformReportInput, proposal: PlatformProposal): KgldIntelligenceItem {
  const candidate = report.kgldOpportunityRadar.candidates.find((item) => item.proposalId === proposal.proposalId);
  const areas: KgldIntelligenceItem["areas"] = [
    impactArea("Wallet impact", proposal, candidate),
    impactArea("Custody impact", proposal, candidate),
    impactArea("Compliance impact", proposal, candidate),
    impactArea("Tokenization impact", proposal, candidate),
    impactArea("RWA impact", proposal, candidate),
    impactArea("Settlement impact", proposal, candidate),
    impactArea("Account abstraction impact", proposal, candidate),
    impactArea("Bridge impact", proposal, candidate),
    impactArea("Execution impact", proposal, candidate),
  ];
  return {
    proposalId: proposal.proposalId,
    title: proposal.title,
    overall: strongestImpact(areas.map((item) => item.level)),
    areas,
    scoreBreakdown: kgldScoreBreakdown(proposal, candidate, areas),
    traceability: trace([`proposal:${proposal.proposalId}`, ...(candidate ? [`kgld:${candidate.proposalId}`] : [])], [`kgld:${proposal.proposalId}`]),
  };
}

function impactArea(area: KgldImpactArea, proposal: PlatformProposal, candidate: PlatformReportInput["kgldOpportunityRadar"]["candidates"][number] | undefined) {
  const text = `${proposal.title} ${proposal.theme} ${candidate?.matchedKeywords.join(" ") ?? ""}`.toLowerCase();
  const matches =
    area === "Wallet impact" ? /wallet|account|signature|passkey|delegat/.test(text)
      : area === "Custody impact" ? /custody|validator|withdrawal|key|signature/.test(text)
        : area === "Compliance impact" ? /compliance|restricted|credential|identity|attestation/.test(text)
          : area === "Tokenization impact" ? /token|erc|asset|issue|redeem/.test(text)
            : area === "RWA impact" ? /rwa|real world|attestation|oracle|pricing/.test(text)
              : area === "Settlement impact" ? /settlement|transaction|execution|frame|nonce/.test(text)
                : area === "Account abstraction impact" ? /account abstraction|smart account|paymaster|session/.test(text)
                  : area === "Bridge impact" ? /bridge|cross-chain|interop/.test(text)
                    : /execution|evm|opcode|transaction|hardfork|block/.test(text);
  const base = candidate ? candidate.relevanceScore : 0;
  const level = !matches ? "None" : base >= 80 ? "High" : base >= 55 ? "Medium" : "Monitor";
  return {
    area,
    level: level as KgldImpactLevel,
    why: matches
      ? `${area} is plausible from theme/title evidence; verify concrete KGLD workflow impact before escalation.`
      : `No direct ${area.toLowerCase()} evidence was found.`,
  };
}

function strongestImpact(levels: KgldImpactLevel[]): KgldImpactLevel {
  const order: KgldImpactLevel[] = ["None", "Monitor", "Medium", "High", "Critical"];
  return levels.reduce((best, level) => order.indexOf(level) > order.indexOf(best) ? level : best, "None");
}

function buildConfidenceBreakdown(report: PlatformReportInput, proposal: PlatformProposal): ConfidenceBreakdown {
  const adoption = adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, [proposal.proposalId]);
  const discussion = report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === proposal.proposalId);
  const specScore = ["Draft", "Review", "Last Call", "Final"].includes(proposal.status) ? 70 : 25;
  const discussionScore = discussion?.discussionActivityScore ?? discussion?.discussionScore ?? 0;
  const implementationScore = adoption?.evidenceLevel === "Implementation" ? 80 : adoption?.evidenceLevel === "Reference" ? 45 : 0;
  const releaseScore = 0;
  const uncertaintyScore = adoption?.sources.some((source) => source.relationship === "incidental") ? 30 : 75;
  const weights = [
    { factor: "Discussion", percent: 25, score: discussionScore },
    { factor: "Spec", percent: 15, score: specScore },
    { factor: "Implementation", percent: 30, score: implementationScore },
    { factor: "Release", percent: 20, score: releaseScore },
    { factor: "Manual uncertainty", percent: 10, score: uncertaintyScore },
  ];
  const scoreBreakdown = confidenceScoreBreakdown(weights, adoption);
  const overall = Math.max(0, Math.min(100, scoreBreakdown.reduce((total, item) => total + item.value, 0)));
  return {
    proposalId: proposal.proposalId,
    overall,
    dataCompleteness: Math.min(100, (discussion ? 25 : 0) + (adoption ? 25 : 0) + 25),
    evidenceQuality: adoption?.evidenceLevel === "Implementation" ? 75 : adoption?.evidenceLevel === "Reference" ? 55 : 35,
    sourceDiversity: Math.min(100, new Set((adoption?.sources ?? []).map((source) => source.repo ?? source.sourceType)).size * 20),
    verificationStatus: implementationScore,
    falsePositiveRisk: adoption?.sources.some((source) => source.relationship === "cluster_related") ? 35 : 15,
    weights,
    scoreBreakdown,
    explanation: "Confidence is weighted from discussion, spec status, implementation evidence, release evidence, and remaining manual uncertainty.",
    traceability: trace([`proposal:${proposal.proposalId}`, ...(adoption?.sources.map((source) => evidenceIdForSource(source, proposal.proposalId)) ?? [])], [`confidence:${proposal.proposalId}`]),
  };
}

function buildTechnologyRadarItem(
  proposal: PlatformProposal,
  timeline: LifecycleTimeline | undefined,
  kgld: KgldIntelligenceItem | undefined,
  confidence: ConfidenceBreakdown | undefined,
): TechnologyRadarItem {
  const stage = timeline?.currentStage ?? "Discussion";
  const impact = kgld?.overall ?? "None";
  const quadrant: TechnologyRadarQuadrant = stage === "Production Adoption" || (stage === "Activated" && impact !== "None") ? "Adopt"
    : stage === "Verified Implementation" || stage === "Implementation Candidate" ? "Trial"
      : confidence && confidence.falsePositiveRisk > 50 ? "Hold"
        : "Watch";
  return {
    proposalId: proposal.proposalId,
    title: proposal.title,
    theme: proposal.theme,
    quadrant,
    why: `${stage} with ${impact} KGLD impact; no later lifecycle stage is inferred without evidence.`,
    scoreBreakdown: [
      { label: "lifecycle", value: stage === "Verified Implementation" ? 40 : stage === "Implementation Tracking" ? 20 : 10, reason: `Current lifecycle stage is ${stage}.` },
      { label: "business impact", value: impact === "High" ? 30 : impact === "Medium" ? 20 : impact === "Monitor" ? 10 : 0, reason: `KGLD impact is ${impact}.` },
      { label: "false-positive risk", value: confidence ? -confidence.falsePositiveRisk : 0, reason: "Higher false-positive risk lowers readiness." },
    ],
    traceability: trace([`proposal:${proposal.proposalId}`, ...(timeline?.traceability.evidenceIds ?? []), ...(kgld?.traceability.evidenceIds ?? [])], [`radar:${proposal.proposalId}`]),
  };
}

function buildRiskFlags(
  report: PlatformReportInput,
  proposal: PlatformProposal,
  timeline: LifecycleTimeline | undefined,
  matrix: ClientCoverageMatrix | undefined,
  release: ReleaseIntelligence | undefined,
  deployment: DeploymentIntelligence | undefined,
): RiskFlag[] {
  const risks: RiskFlag[] = [];
  const discussion = report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === proposal.proposalId);
  const current = timeline?.currentStage;
  if ((discussion?.discussionActivityScore ?? 0) >= 60 && !["Implementation Candidate", "Verified Implementation", "Released", "Activated", "Production Adoption"].includes(current ?? "")) {
    risks.push({ proposalId: proposal.proposalId, risk: "High", type: "High discussion / no implementation", why: "Discussion heat is high, but no verified implementation evidence was accepted.", scoreBreakdown: riskScoreBreakdown("High", ["discussion heat", "no verified implementation"]), traceability: trace([`discussion:${proposal.proposalId}`, ...(timeline?.traceability.evidenceIds ?? [])], [`risk:${proposal.proposalId}:discussion-no-implementation`]) });
  }
  if (current === "Verified Implementation" && release?.status === "No release") {
    risks.push({ proposalId: proposal.proposalId, risk: "Medium", type: "Implementation / no release", why: "Implementation evidence exists, but no release evidence was collected.", scoreBreakdown: riskScoreBreakdown("Medium", ["verified implementation", "no release evidence"]), traceability: trace([...(timeline?.traceability.evidenceIds ?? [])], [`risk:${proposal.proposalId}:implementation-no-release`]) });
  }
  if (release?.status === "Released" && deployment?.status === "No evidence") {
    risks.push({ proposalId: proposal.proposalId, risk: "Medium", type: "Release / no activation", why: "Release evidence exists, but activation evidence was not collected.", scoreBreakdown: riskScoreBreakdown("Medium", ["release evidence", "no activation evidence"]), traceability: trace(release.traceability.evidenceIds, [`risk:${proposal.proposalId}:release-no-activation`]) });
  }
  const statuses = new Set((matrix?.clients ?? []).filter((client) => client.status !== "No evidence").map((client) => client.status));
  if (statuses.size > 1) risks.push({ proposalId: proposal.proposalId, risk: "Medium", type: "Client divergence", why: "Accepted client evidence points to different implementation states.", scoreBreakdown: riskScoreBreakdown("Medium", ["mixed client states"]), traceability: trace(matrix?.clients.flatMap((client) => client.traceability.evidenceIds) ?? [], [`risk:${proposal.proposalId}:client-divergence`]) });
  return risks;
}

function buildPlatformDashboard(
  report: PlatformReportInput,
  lifecycle: LifecycleTimeline[],
  matrices: ClientCoverageMatrix[],
  releases: ReleaseIntelligence[],
  deployments: DeploymentIntelligence[],
  kgld: KgldIntelligenceItem[],
  themes: ThemeIntelligence[],
  radar: TechnologyRadarItem[],
): PlatformDashboard {
  return {
    topMovers: report.ethereumTechRadar.signalLayer.discussionHeat.slice(0, 5).map((item) => item.proposalId),
    emergingThemes: report.ethereumTechRadar.themeInsights.slice(0, 5).map((item) => item.theme),
    lifecycleProgress: lifecycle.slice(0, 8).map((item) => ({ proposalId: item.proposalId, currentStage: item.currentStage, confidence: item.stages.find((stage) => stage.name === item.currentStage)?.confidence ?? 0 })),
    implementationProgress: matrices.slice(0, 8).map((item) => ({
      proposalId: item.proposalId,
      verifiedClients: item.clients.filter((client) => ["Verified", "Released", "Activated"].includes(client.status)).length,
      trackingClients: item.clients.filter((client) => client.status === "Tracking").length,
    })),
    releaseWatch: releases.filter((item) => item.status !== "No release").slice(0, 8).map((item) => ({ proposalId: item.proposalId, status: item.status })),
    activationWatch: deployments.filter((item) => item.status !== "No evidence").slice(0, 8).map((item) => ({ proposalId: item.proposalId, status: item.status })),
    businessImpact: kgld.filter((item) => item.overall !== "None").slice(0, 8),
    kgldWatch: kgld.filter((item) => ["Monitor", "Medium", "High", "Critical"].includes(item.overall)).slice(0, 8),
    developerActivity: report.ethereumTechRadar.themeInsights.slice(0, 8).map((item) => ({ theme: item.theme, score: item.momentumScore })),
    themeHeatmap: themes.slice(0, 8).map((item) => ({ theme: item.theme, health: item.health, momentum: item.momentum, risk: item.risk })),
    technologyRadar: radar.slice(0, 12),
  };
}

function buildDataCompleteness(report: PlatformReportInput) {
  const adoption = report.ethereumTechRadar.adoptionLayer;
  const attempted = Math.max(1, (report.ethereumTechRadar.watchlistLayer?.items.length ?? 0) * 3);
  const succeeded = adoption?.collectionStatus === "collected" ? attempted : adoption?.collectionStatus === "failed" || adoption?.collectionStatus === "skipped" ? 0 : Math.max(0, attempted - 1);
  const failed = Math.max(0, attempted - succeeded);
  const partialCollection = adoption?.collectionStatus === "failed" || adoption?.collectionStatus === "skipped" || failed > 0;
  const missingFields = missingFieldsFor(report);
  const status: DataCompletenessStatus = adoption?.collectionStatus === "failed" ? "degraded"
    : adoption?.collectionStatus === "skipped" ? "unavailable"
      : failed > 0 ? "partial"
        : missingFields.length > 0 ? "mostly_complete"
          : "complete";
  return {
    status,
    requiredSourcesAttempted: attempted,
    sourcesSucceeded: succeeded,
    sourcesFailed: failed,
    cacheHits: process.env.EIPREPORTER_BYPASS_ADOPTION_CACHE === "1" ? 0 : 1,
    staleCacheUse: 0,
    partialCollection,
    missingFields,
    enrichmentSkipped: adoption?.collectionStatus === "skipped" ? ["github_adoption"] : [],
    rateLimitDegradation: adoption?.note ? /rate limited/i.test(adoption.note) : false,
    explanation: partialCollection
      ? "Evidence collection was incomplete; absence of evidence must not be read as negative evidence."
      : "Core report and adoption evidence collection completed for the monitored scope.",
  };
}

function missingFieldsFor(report: PlatformReportInput): string[] {
  const missing: string[] = [];
  if (!report.ethereumTechRadar.signalLayer.discussionHeat.length) missing.push("discussionHeat");
  if (!report.ethereumTechRadar.adoptionLayer?.items.length) missing.push("adoptionEvidence");
  if (!report.ethereumTechRadar.watchlistLayer?.items.length) missing.push("watchlist");
  return missing;
}

function buildSectionVisibility(
  lifecycle: LifecycleTimeline[],
  matrices: ClientCoverageMatrix[],
  releases: ReleaseIntelligence[],
  deployments: DeploymentIntelligence[],
  graphs: EvidenceGraph[],
  themes: ThemeIntelligence[],
  kgld: KgldIntelligenceItem[],
  confidence: ConfidenceBreakdown[],
  radar: TechnologyRadarItem[],
  risks: RiskFlag[],
  dataCompleteness: ReturnType<typeof buildDataCompleteness>,
): SectionVisibilityDecision[] {
  return [
    decision("Platform Dashboard", lifecycle.length > 0 || risks.length > 0, "actionable", "Top-level operational summary."),
    decision("Lifecycle Intelligence", lifecycle.length > 0, "actionable", "Lifecycle remains visible for tracked watchlist proposals."),
    decision("Client Coverage Matrix", matrices.some(hasClientEvidence), "empty", "Collapsed when no monitored client has target-specific implementation evidence."),
    decision("Release Watch", releases.some((item) => item.status !== "No release"), "empty", "Hidden unless release candidate or release evidence exists."),
    decision("Activation Watch", deployments.some((item) => item.status !== "No evidence"), "actionable", "Hidden unless testnet, mainnet, fork, or activation evidence exists."),
    decision("Evidence Graph", graphs.some((item) => meaningfulGraphEdges(item).length > 0), "informative", "Rendered only when meaningful edges exist."),
    decision("Technology Radar", radar.some((item) => item.traceability.evidenceIds.length > 0), "informative", "Rendered only for proposals with traceable evidence."),
    decision("Theme Intelligence", themes.length > 0, "informative", "Theme health and readiness summary."),
    decision("Risk and Confidence", risks.length > 0 || confidence.length > 0, risks.length > 0 ? "actionable" : "informative", "Risk and score explanations."),
    decision("KGLD Intelligence", kgld.some((item) => item.overall !== "None"), "informative", "Business impact is shown only when there is a monitor signal or stronger."),
    decision("Data Completeness", true, dataCompleteness.partialCollection ? "actionable" : "informative", dataCompleteness.explanation),
  ];
}

function decision(section: string, visible: boolean, classification: SectionVisibilityDecision["classification"], reason: string): SectionVisibilityDecision {
  return { section, visible, classification: visible ? classification : "empty", reason };
}

function hasClientEvidence(matrix: ClientCoverageMatrix): boolean {
  return matrix.clients.some((client) => client.status !== "No evidence");
}

function meaningfulGraphEdges(graph: EvidenceGraph): EvidenceGraph["edges"] {
  return graph.edges.filter((edge) => edge.from !== edge.to && !edge.from.startsWith("status:"));
}

function evidenceIdForSource(source: AdoptionEvidenceSource, fallback: string): string {
  if (source.evidenceId) return source.evidenceId;
  if (source.url) return `src:${source.url}`;
  return `src:${fallback}:${source.sourceType}:${source.repo ?? source.path ?? source.title ?? "unknown"}`;
}

function trace(evidenceIds: string[], derivedFrom: string[]) {
  return {
    evidenceIds: [...new Set(evidenceIds)],
    derivedFrom: [...new Set(derivedFrom)],
    calculationVersion: CALCULATION_VERSION,
    ruleVersion: RULE_VERSION,
  };
}

function freshness(collectedAt: string, sourceUpdatedAt: string | undefined, staleAfterDays: number) {
  const ageDays = sourceUpdatedAt ? Math.max(0, Math.floor((Date.parse(collectedAt) - Date.parse(sourceUpdatedAt)) / (24 * 60 * 60 * 1000))) : undefined;
  return {
    collectedAt,
    sourceUpdatedAt,
    ageDays,
    stale: ageDays !== undefined ? ageDays > staleAfterDays : false,
  };
}

function mergeFreshness(items: NonNullable<LifecycleStage["freshness"]>[]) {
  if (!items.length) return undefined;
  return items.reduce((oldest, item) => (item.ageDays ?? -1) > (oldest.ageDays ?? -1) ? item : oldest, items[0]!);
}

function lifecycleStageScoreBreakdown(stage: LifecycleStageName, evidence: LifecycleStage["evidence"], adoption: AdoptionEvidenceItem | undefined): ScoreBreakdownItem[] {
  const items: ScoreBreakdownItem[] = [];
  if (evidence.length) items.push({ label: "direct stage evidence", value: 40, reason: `${evidence.length} source(s) support this lifecycle stage.`, evidenceIds: evidence.map((item) => item.evidenceId).filter((id): id is string => Boolean(id)) });
  if (stage === "Implementation Tracking" && evidence.length) items.push({ label: "implementation tracking", value: 5 + evidence.length * 10, reason: "Tracking is stronger than a mention but not verified implementation." });
  if (stage === "Verified Implementation" && adoption?.evidenceLevel !== "Implementation") items.push({ label: "no verified client implementation", value: -10, reason: "No direct client implementation source was accepted." });
  if (!evidence.length && !["Discussion", "Draft"].includes(stage)) items.push({ label: "no explicit evidence", value: 0, reason: "This stage is not inferred from earlier lifecycle stages." });
  return items;
}

function clientScoreBreakdown(status: ClientImplementationStatus, sources: AdoptionEvidenceSource[]): ScoreBreakdownItem[] {
  if (status === "No evidence") return [{ label: "no client evidence", value: 0, reason: "No target-specific client source matched this client." }];
  return [
    { label: "client source match", value: 35, reason: `${sources.length} client-specific source(s) matched.` },
    { label: status.toLowerCase(), value: status === "Verified" ? 25 : status === "Candidate" ? 15 : 10, reason: `Classified as ${status}.` },
  ];
}

function releaseScoreBreakdown(status: ReleaseStatus, sources: AdoptionEvidenceSource[]): ScoreBreakdownItem[] {
  if (status === "No release") return [{ label: "no release evidence", value: 0, reason: "No release note, tag, version, changelog, or official release source matched." }];
  return [{ label: "release evidence", value: 55, reason: `${sources.length} release source(s) matched.` }];
}

function deploymentScoreBreakdown(status: DeploymentStatus, sources: AdoptionEvidenceSource[]): ScoreBreakdownItem[] {
  if (status === "No evidence") return [{ label: "no activation evidence", value: 0, reason: "No activation, fork, testnet, mainnet, or default-enable evidence matched." }];
  return [{ label: "deployment evidence", value: 45, reason: `${sources.length} deployment source(s) matched ${status}.` }];
}

function kgldScoreBreakdown(
  proposal: PlatformProposal,
  candidate: PlatformReportInput["kgldOpportunityRadar"]["candidates"][number] | undefined,
  areas: KgldIntelligenceItem["areas"],
): ScoreBreakdownItem[] {
  const matched = areas.filter((area) => area.level !== "None");
  return [
    { label: "business keyword match", value: candidate ? candidate.relevanceScore : 0, reason: candidate ? `Matched ${candidate.matchedKeywords.join(", ") || proposal.theme}.` : "No KGLD candidate matched." },
    { label: "impact areas", value: matched.length * 5, reason: `${matched.length} impact area(s) reached Monitor or higher.` },
    { label: "high-impact cap", value: candidate && candidate.relevanceScore >= 80 ? 0 : -20, reason: "High/Critical impact requires strong KGLD relevance evidence." },
  ];
}

function confidenceScoreBreakdown(weights: ConfidenceBreakdown["weights"], adoption: AdoptionEvidenceItem | undefined): ScoreBreakdownItem[] {
  const items = weights.map((item) => ({
    label: item.factor.toLowerCase(),
    value: Math.round(item.score * item.percent / 100),
    reason: `${item.factor} contributes ${item.percent}% at score ${item.score}.`,
  }));
  if (adoption?.evidenceLevel !== "Implementation") items.push({ label: "no verified client implementation", value: -10, reason: "Implementation confidence is capped without verified client evidence." });
  if (!adoption?.sources.some((source) => source.sourceType === "release_note")) items.push({ label: "no release evidence", value: -5, reason: "Release evidence was not accepted." });
  return items;
}

function riskScoreBreakdown(level: RiskFlag["risk"], factors: string[]): ScoreBreakdownItem[] {
  const base = level === "High" ? 70 : level === "Medium" ? 45 : 20;
  return factors.map((factor, index) => ({ label: factor, value: index === 0 ? base : 10, reason: `Risk factor: ${factor}.` }));
}

function countStaleEvidence(lifecycle: LifecycleTimeline[]): number {
  return lifecycle.flatMap((timeline) => timeline.stages).flatMap((stage) => stage.evidence).filter((evidence) => evidence.freshness?.stale).length;
}

function deduplicatedClaimCountFor(lifecycle: LifecycleTimeline[], risks: RiskFlag[]): number {
  const claims = [...lifecycle.map((item) => `${item.proposalId}:${item.currentStage}`), ...risks.map((item) => `${item.proposalId}:${item.type}`)];
  return claims.length - new Set(claims).size;
}

function printPlatformDebug(layer: TechnologyPlatformLayer): void {
  if (process.env.EIPREPORTER_DEBUG_PLATFORM !== "1") return;
  for (const decision of layer.sectionVisibility) {
    console.error(`platform_debug section="${decision.section}" visible=${decision.visible} classification=${decision.classification} reason="${decision.reason}"`);
  }
  console.error(`platform_debug hidden_card_count=${layer.hiddenCardCount} deduplicated_claim_count=${layer.deduplicatedClaimCount} completeness_status=${layer.dataCompleteness.status} stale_evidence_count=${layer.staleEvidenceCount}`);
  for (const confidence of layer.confidence.slice(0, 5)) {
    console.error(`platform_debug confidence proposal=${confidence.proposalId} score=${confidence.overall} breakdown="${confidence.scoreBreakdown.map((item) => `${item.label}:${item.value}`).join(",")}"`);
  }
  for (const timeline of layer.lifecycleTimelines.slice(0, 5)) {
    console.error(`platform_debug lifecycle proposal=${timeline.proposalId} current_stage="${timeline.currentStage}" evidence_ids=${timeline.traceability.evidenceIds.length}`);
  }
  for (const item of layer.technologyRadar.slice(0, 5)) {
    console.error(`platform_debug radar proposal=${item.proposalId} quadrant=${item.quadrant} reason="${item.why}"`);
  }
}
