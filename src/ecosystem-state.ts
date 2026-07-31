import type { KnowledgeCausalChain, KnowledgeGraphLayer } from "./knowledge-graph.ts";
import type { TopicCluster } from "./topic-cluster.ts";
import type { ThemeInsight, ThemeIntelligenceSignal, WeeklyRadarReport } from "./types.ts";

export type EcosystemSignalState = "Growing" | "Stable" | "Declining" | "Emerging" | "Early Exploration" | "Mature";

export type EcosystemNarrative = {
  id: string;
  title: string;
  state: EcosystemSignalState;
  confidence: number;
  summary: string;
  whyImportant: string;
  weeklyContribution: string;
  evidenceProposalIds: string[];
  evidenceIds: string[];
  connectedTechnologies: string[];
  relatedTopics: string[];
  supportingChainIds: string[];
};

export type EcosystemStateLayer = {
  generatedBy: "deterministic_ecosystem_state_engine";
  ecosystemStateVersion: "phase-reboot-ecosystem-state-1";
  generatedAt: string;
  headline: string;
  currentState: string;
  keyQuestions: Array<{ question: string; answer: string; evidenceIds: string[]; confidence: number }>;
  longTermNarratives: EcosystemNarrative[];
  emergingNarratives: EcosystemNarrative[];
  fadingNarratives: EcosystemNarrative[];
  connectedTechnologies: Array<{ source: string; target: string; relation: string; evidenceIds: string[]; confidence: number }>;
  trendSignals: Array<{ label: string; state: EcosystemSignalState; score: number; evidenceIds: string[] }>;
  weeklyContribution: Array<{ narrativeId: string; contribution: string; evidenceIds: string[]; proposalIds: string[] }>;
  diagnostics: {
    narrativeCount: number;
    growingCount: number;
    stableCount: number;
    decliningCount: number;
    emergingCount: number;
    earlyExplorationCount: number;
    matureCount: number;
    averageConfidence: number;
    evidenceBackedNarrativeCount: number;
    connectedTechnologyCount: number;
  };
};

const VERSION = "phase-reboot-ecosystem-state-1" as const;

type EcosystemReportInput = Omit<WeeklyRadarReport, "chartData"> & Partial<Pick<WeeklyRadarReport, "chartData">>;

export function buildEcosystemStateLayer(report: EcosystemReportInput): EcosystemStateLayer {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  const topics = report.ethereumTechRadar.topicClusterLayer?.clusters ?? [];
  const intelligence = report.ethereumTechRadar.intelligenceLayer;
  const narratives = buildNarratives(report, graph, topics, intelligence?.themeSignals ?? []);
  const longTermNarratives = narratives.sort(compareNarratives).slice(0, 8);
  const emergingNarratives = longTermNarratives.filter((item) => item.state === "Emerging" || item.state === "Growing").slice(0, 5);
  const fadingNarratives = longTermNarratives.filter((item) => item.state === "Declining").slice(0, 5);
  const primary = longTermNarratives[0];
  const weeklyContribution = longTermNarratives.map((item) => ({
    narrativeId: item.id,
    contribution: item.weeklyContribution,
    evidenceIds: item.evidenceIds.slice(0, 12),
    proposalIds: item.evidenceProposalIds.slice(0, 8),
  }));
  return {
    generatedBy: "deterministic_ecosystem_state_engine",
    ecosystemStateVersion: VERSION,
    generatedAt: report.generatedAt,
    headline: primary ? `${primary.title} is the clearest current Ethereum development narrative.` : "Ethereum development is best read through long-term technical narratives.",
    currentState: primary
      ? `Ethereum developer focus is currently organized around ${primary.title}, with ${primary.connectedTechnologies.slice(0, 3).join(", ") || "proposal-backed technical links"} forming the strongest visible connection pattern.`
      : "The current dataset supports ecosystem monitoring, but no single narrative dominates the graph.",
    keyQuestions: buildKeyQuestions(report, longTermNarratives, graph),
    longTermNarratives,
    emergingNarratives,
    fadingNarratives,
    connectedTechnologies: buildConnectedTechnologies(graph),
    trendSignals: longTermNarratives.map((item) => ({ label: item.title, state: item.state, score: item.confidence, evidenceIds: item.evidenceIds.slice(0, 8) })),
    weeklyContribution,
    diagnostics: diagnostics(longTermNarratives, graph),
  };
}

function buildNarratives(
  report: EcosystemReportInput,
  graph: KnowledgeGraphLayer | undefined,
  topics: TopicCluster[],
  themeSignals: ThemeIntelligenceSignal[],
): EcosystemNarrative[] {
  const themeByName = new Map<string, ThemeInsight>(report.ethereumTechRadar.themeInsights.map((theme) => [theme.theme, theme]));
  const signalByTheme = new Map(themeSignals.map((signal) => [signal.theme, signal]));
  const narratives: EcosystemNarrative[] = [];
  for (const topic of topics) {
    const chains = graph ? chainsForTopic(graph, topic.id) : [];
    const theme = topic.primaryThemeIds.map((id) => themeByName.get(id)).find(Boolean) ?? matchTheme(topic, [...themeByName.values()]);
    const signal = theme ? signalByTheme.get(theme.theme) : undefined;
    narratives.push(narrativeFromTopic(report, topic, chains, theme, signal));
  }
  if (!narratives.length) {
    for (const theme of report.ethereumTechRadar.themeInsights.slice(0, 8)) {
      narratives.push(narrativeFromTheme(report, theme, signalByTheme.get(theme.theme)));
    }
  }
  return narratives;
}

function narrativeFromTopic(
  report: EcosystemReportInput,
  topic: TopicCluster,
  chains: KnowledgeCausalChain[],
  theme: ThemeInsight | undefined,
  signal: ThemeIntelligenceSignal | undefined,
): EcosystemNarrative {
  const chainEvidence = unique(chains.flatMap((chain) => chain.traceability.evidenceIds));
  const proposalIds = unique([...topic.anchorProposalIds, ...topic.supportingProposalIds, ...chains.map((chain) => chain.proposalId)]);
  const technologies = unique(chains.flatMap((chain) => chain.steps.filter((step) => step.type !== "Proposal" && step.type !== "Topic").map((step) => step.label))).slice(0, 10);
  const state = signalState({
    proposalCount: topic.proposalIds.length,
    weeklyCount: topic.activityProfile.weeklyChangedProposalCount,
    momentum: theme?.momentumScore ?? topic.cohesionScore,
    confidence: topic.confidence,
    maturity: topic.activityProfile.averageMaturity,
    direction: signal?.direction,
  });
  const confidence = clamp(Math.round((topic.confidence * 0.45) + ((theme?.momentumScore ?? 45) * 0.25) + (average(chains.map((chain) => chain.chainScore)) * 0.3)));
  const weeklyCount = topic.activityProfile.weeklyChangedProposalCount + topic.activityProfile.statusChangeCount + topic.activityProfile.newProposalCount;
  return {
    id: `ecosystem:narrative:${topic.id}`,
    title: topic.displayName,
    state,
    confidence,
    summary: `${topic.displayName} describes current Ethereum work around ${technologies.slice(0, 4).join(", ") || topic.sharedSignals.slice(0, 4).join(", ") || "related standards evidence"}.`,
    whyImportant: `This narrative matters because it links ${proposalIds.length} proposal(s) into ${chains.length} causal chain(s), turning proposal activity into an ecosystem-level development direction.`,
    weeklyContribution: weeklyCount > 0
      ? `This week's activity added ${weeklyCount} signal(s) to the narrative, mainly as evidence for ${topic.displayName}.`
      : `This week did not materially change the narrative; it remains a ${state} long-term development signal.`,
    evidenceProposalIds: proposalIds,
    evidenceIds: unique([...chainEvidence, ...topic.traceability.evidenceIds]).slice(0, 80),
    connectedTechnologies: technologies,
    relatedTopics: [topic.id],
    supportingChainIds: chains.slice(0, 8).map((chain) => chain.id),
  };
}

function narrativeFromTheme(report: EcosystemReportInput, theme: ThemeInsight, signal: ThemeIntelligenceSignal | undefined): EcosystemNarrative {
  const state = signalState({
    proposalCount: theme.proposalCount180d,
    weeklyCount: theme.recentChangeCount7d,
    momentum: theme.momentumScore,
    confidence: theme.momentumScore,
    maturity: theme.maturitySignal === "high" ? 80 : theme.maturitySignal === "medium" ? 55 : 30,
    direction: signal?.direction,
  });
  return {
    id: `ecosystem:narrative:${slug(theme.theme)}`,
    title: theme.theme,
    state,
    confidence: clamp(theme.momentumScore),
    summary: `${theme.theme} remains visible across ${theme.proposalCount180d} proposal(s) in the ${report.trendPeriod.days}-day trend window.`,
    whyImportant: theme.interpretation || theme.trendInterpretation,
    weeklyContribution: theme.recentChangeCount7d > 0
      ? `This week's activity contributed ${theme.recentChangeCount7d} change signal(s) to this longer-term narrative.`
      : `This week did not materially change the narrative; its importance comes from longer-term concentration.`,
    evidenceProposalIds: theme.representativeProposals.map((proposal) => proposal.id),
    evidenceIds: theme.representativeProposals.map((proposal) => `proposal:${proposal.id}`),
    connectedTechnologies: theme.dominantSubTrends.map((trend) => trend.name).slice(0, 8),
    relatedTopics: [],
    supportingChainIds: [],
  };
}

function buildKeyQuestions(report: EcosystemReportInput, narratives: EcosystemNarrative[], graph: KnowledgeGraphLayer | undefined): EcosystemStateLayer["keyQuestions"] {
  const top = narratives[0];
  const growing = narratives.filter((item) => item.state === "Growing" || item.state === "Emerging");
  const fading = narratives.filter((item) => item.state === "Declining");
  const technologies = unique(narratives.flatMap((item) => item.connectedTechnologies)).slice(0, 6);
  const weekly = report.ethereumTechRadar.recentChanges.total + report.ethereumTechRadar.signalLayer.diffIntelligence.length;
  const evidence = top?.evidenceIds.slice(0, 12) ?? [];
  return [
    { question: "What are Ethereum developers building?", answer: top ? `They are primarily building around ${top.title}: ${top.summary}` : "Current work is distributed across several tracked standards narratives.", evidenceIds: evidence, confidence: top?.confidence ?? 45 },
    { question: "What topics are receiving increasing attention?", answer: growing.length ? growing.map((item) => `${item.title} (${item.state})`).join(", ") : "The strongest narratives are stable rather than newly accelerating.", evidenceIds: unique(growing.flatMap((item) => item.evidenceIds)).slice(0, 12), confidence: average(growing.map((item) => item.confidence)) || 55 },
    { question: "How has developer focus shifted over the last 3-6 months?", answer: `The ${report.trendPeriod.days}-day view emphasizes ${narratives.slice(0, 3).map((item) => item.title).join(", ") || "tracked technical themes"} over isolated weekly events.`, evidenceIds: evidence, confidence: top?.confidence ?? 50 },
    { question: "Which technologies are connected together?", answer: technologies.length ? technologies.join(", ") : "The Knowledge Graph has not exposed a dominant connected-technology set yet.", evidenceIds: graph?.edges.slice(0, 12).flatMap((edge) => edge.evidenceIds) ?? [], confidence: graph ? 70 : 40 },
    { question: "Which narratives are emerging?", answer: growing.length ? growing.slice(0, 3).map((item) => item.title).join(", ") : "No narrative crossed the Growing or Emerging threshold in this run.", evidenceIds: unique(growing.flatMap((item) => item.evidenceIds)).slice(0, 12), confidence: average(growing.map((item) => item.confidence)) || 50 },
    { question: "Which narratives are fading?", answer: fading.length ? fading.map((item) => item.title).join(", ") : "No major narrative is classified as Declining; lower-activity areas are treated as Stable or Early Exploration.", evidenceIds: unique(fading.flatMap((item) => item.evidenceIds)).slice(0, 12), confidence: average(fading.map((item) => item.confidence)) || 50 },
    { question: "What does this week's activity add?", answer: weekly > 0 ? `This week's activity adds ${weekly} evidence signal(s) to existing narratives rather than replacing the ecosystem view.` : "This week adds little new evidence, so the report keeps the ecosystem state anchored in longer-term narratives.", evidenceIds: evidence, confidence: top?.confidence ?? 50 },
  ];
}

function buildConnectedTechnologies(graph: KnowledgeGraphLayer | undefined): EcosystemStateLayer["connectedTechnologies"] {
  if (!graph) return [];
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter((edge) => ["IMPLEMENTS", "USES_MECHANISM", "EXECUTES", "ENABLES", "AFFECTS", "USED_BY", "RELEVANT_TO"].includes(edge.type))
    .map((edge) => ({
      source: nodes.get(edge.source)?.label ?? edge.source,
      target: nodes.get(edge.target)?.label ?? edge.target,
      relation: edge.type,
      evidenceIds: edge.evidenceIds.slice(0, 8),
      confidence: edge.confidence,
    }))
    .sort((left, right) => right.confidence - left.confidence || left.source.localeCompare(right.source))
    .slice(0, 40);
}

function signalState(input: { proposalCount: number; weeklyCount: number; momentum: number; confidence: number; maturity: number; direction?: string }): EcosystemSignalState {
  if (input.direction === "slowing" || input.direction === "stalled") return "Declining";
  if (input.direction === "accelerating") return "Growing";
  if (input.direction === "emerging") return "Emerging";
  if (input.maturity >= 70 && input.proposalCount >= 4) return "Mature";
  if (input.weeklyCount > 0 && input.momentum >= 55) return "Growing";
  if (input.weeklyCount > 0) return "Emerging";
  if (input.proposalCount <= 2 || input.confidence < 45) return "Early Exploration";
  return "Stable";
}

function chainsForTopic(graph: KnowledgeGraphLayer, topicId: string): KnowledgeCausalChain[] {
  return graph.proposalKnowledgeChains
    .filter((chain) => chain.traceability.topicIds.includes(topicId) || chain.gaps.some((gap) => gap.topicId === topicId))
    .sort((left, right) => right.chainScore - left.chainScore || right.steps.length - left.steps.length);
}

function matchTheme(topic: TopicCluster, themes: ThemeInsight[]): ThemeInsight | undefined {
  const text = `${topic.displayName} ${topic.summary}`.toLocaleLowerCase("en-US");
  return themes.find((theme) => text.includes(theme.theme.toLocaleLowerCase("en-US").split(" / ")[0] ?? theme.theme.toLocaleLowerCase("en-US")));
}

function diagnostics(narratives: EcosystemNarrative[], graph: KnowledgeGraphLayer | undefined): EcosystemStateLayer["diagnostics"] {
  return {
    narrativeCount: narratives.length,
    growingCount: narratives.filter((item) => item.state === "Growing").length,
    stableCount: narratives.filter((item) => item.state === "Stable").length,
    decliningCount: narratives.filter((item) => item.state === "Declining").length,
    emergingCount: narratives.filter((item) => item.state === "Emerging").length,
    earlyExplorationCount: narratives.filter((item) => item.state === "Early Exploration").length,
    matureCount: narratives.filter((item) => item.state === "Mature").length,
    averageConfidence: average(narratives.map((item) => item.confidence)),
    evidenceBackedNarrativeCount: narratives.filter((item) => item.evidenceIds.length > 0).length,
    connectedTechnologyCount: graph?.edges.length ?? 0,
  };
}

function compareNarratives(left: EcosystemNarrative, right: EcosystemNarrative): number {
  return stateRank(right.state) - stateRank(left.state)
    || right.confidence - left.confidence
    || right.evidenceProposalIds.length - left.evidenceProposalIds.length
    || left.title.localeCompare(right.title);
}

function stateRank(state: EcosystemSignalState): number {
  const ranks: Record<EcosystemSignalState, number> = {
    Growing: 6,
    Emerging: 5,
    Mature: 4,
    Stable: 3,
    "Early Exploration": 2,
    Declining: 1,
  };
  return ranks[state];
}

function average(values: number[]): number {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.round(finite.reduce((sum, value) => sum + value, 0) / finite.length) : 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function slug(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}
