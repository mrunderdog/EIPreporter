import { adoptionEvidenceForProposal, topWatchlistAdoptionLevel } from "./adoption.ts";
import type { KnowledgeGraphLayer, KnowledgeGraphNode } from "./knowledge-graph.ts";
import type {
  DiscussionHeatItem,
  NarrativeEvidence,
  NarrativeLayer,
  TechnologyStory,
  ThemeInsight,
  WeeklyRadarReport,
} from "./types.ts";

type NarrativeReportInput = {
  generatedAt: string;
  ethereumTechRadar: Omit<WeeklyRadarReport["ethereumTechRadar"], "narrativeLayer"> & {
    narrativeLayer?: WeeklyRadarReport["ethereumTechRadar"]["narrativeLayer"];
  };
};

const KGLD_RELEVANT_THEMES = new Set([
  "Identity / Credential",
  "Account Abstraction",
  "Wallet UX",
  "Token Standard",
  "Compliance / Restricted Transfer",
  "RWA / Attestation",
]);

const ADOPTION_CLAIM_PATTERN = /\b(adopted|adoption across|implemented by|production use|mainnet usage|ecosystem support|client support)\b/i;

export function buildNarrativeLayer(
  report: NarrativeReportInput,
): NarrativeLayer {
  const graph = report.ethereumTechRadar.knowledgeGraphLayer;
  return {
    weeklyNarrative: graph ? buildKnowledgeGraphWeeklyNarrative(graph) : buildWeeklyNarrative(report),
    topStories: graph ? buildKnowledgeGraphTechnologyStories(graph) : buildTechnologyStories(report),
    signalEvidence: buildNarrativeEvidence(report),
    generatedBy: "deterministic",
  };
}

function buildKnowledgeGraphWeeklyNarrative(graph: KnowledgeGraphLayer): string[] {
  const topics = graph.nodes
    .filter((node) => node.type === "Topic")
    .sort((left, right) => graphNodeNumber(right, "confidence") - graphNodeNumber(left, "confidence") || left.label.localeCompare(right.label))
    .slice(0, 3);
  if (!topics.length) return ["이번 주 지식 그래프에서 의사결정에 사용할 수 있는 기술 주제가 충분히 구성되지 않았습니다."];
  const systems = graph.nodes.filter((node) => node.type === "System").map((node) => node.label).slice(0, 4);
  const inferredEdges = graph.edges.filter((edge) => edge.inferred).length;
  return [
    `이번 주 해석은 Topic Cluster를 직접 나열하지 않고 Knowledge Graph의 개념, 메커니즘, 시스템 연결을 기준으로 구성했습니다. 중심 주제는 ${topics.map((topic) => topic.label).join(", ")}입니다.`,
    systems.length ? `영향을 받을 수 있는 시스템 축은 ${systems.join(", ")}입니다. 이 연결은 graph edge로 보존되며, 추론 edge ${inferredEdges}건은 inferred=true로 구분됩니다.` : "시스템 영향은 아직 제한적으로만 식별됐습니다.",
    "구현, 릴리스, 활성화, 운영 채택은 Knowledge Graph의 evidence traceability가 있는 경우에만 상향 해석합니다.",
  ];
}

function buildKnowledgeGraphTechnologyStories(graph: KnowledgeGraphLayer): TechnologyStory[] {
  return graph.nodes
    .filter((node) => node.type === "Topic")
    .sort((left, right) => graphNodeNumber(right, "confidence") - graphNodeNumber(left, "confidence") || left.label.localeCompare(right.label))
    .slice(0, 3)
    .map((topic) => {
      const proposals = graphNodeStrings(topic, "proposalIds").slice(0, 4);
      const concepts = graph.edges
        .filter((edge) => edge.from === topic.id && edge.type === "RELATES_TO" && edge.to.startsWith("Concept:"))
        .map((edge) => graph.nodes.find((node) => node.id === edge.to)?.label)
        .filter((label): label is string => Boolean(label))
        .slice(0, 4);
      const systems = graph.edges
        .filter((edge) => edge.from === topic.id && edge.type === "AFFECTS" && edge.to.startsWith("System:"))
        .map((edge) => graph.nodes.find((node) => node.id === edge.to)?.label)
        .filter((label): label is string => Boolean(label))
        .slice(0, 3);
      return {
        storyTitle: topic.label,
        primaryTheme: concepts[0] ?? "Knowledge Graph",
        relatedProposals: proposals,
        evidence: [
          `graph node: ${topic.id}`,
          `trace topics: ${topic.traceability.topicIds.join(", ")}`,
          `evidence ids: ${topic.traceability.evidenceIds.slice(0, 3).join(", ") || "topic cluster trace"}`,
        ],
        interpretation: systems.length
          ? `${topic.label}은 ${systems.join(", ")}와 연결되는 graph topic입니다. inferred edge는 추론으로 표시되어 직접 근거와 구분됩니다.`
          : `${topic.label}은 Knowledge Graph에서 관찰되는 topic입니다. 시스템 영향은 추가 근거가 필요합니다.`,
        watchNext: `${topic.label}의 Proposal, Mechanism, System edge에 새 evidence가 연결되는지 확인합니다.`,
      };
    });
}

function graphNodeNumber(node: KnowledgeGraphNode, key: string): number {
  const value = node.properties[key];
  return typeof value === "number" ? value : 0;
}

function graphNodeStrings(node: KnowledgeGraphNode, key: string): string[] {
  const value = node.properties[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function validateAiNarrativeLayer(
  candidate: NarrativeLayer,
  evidence: NarrativeEvidence,
): boolean {
  const supportedProposalIds = new Set(evidence.topDiscussions.map((item) => item.proposalId));
  const supportedThemes = new Set([
    ...evidence.topMomentumThemes.map((item) => item.theme),
    ...evidence.topDiscussions.map((item) => item.theme).filter((theme): theme is string => Boolean(theme)),
  ]);
  const text = [
    ...candidate.weeklyNarrative,
    ...candidate.topStories.flatMap((story) => [
      story.storyTitle,
      story.primaryTheme,
      story.interpretation,
      story.watchNext,
      ...story.evidence,
    ]),
  ].join("\n");

  if (ADOPTION_CLAIM_PATTERN.test(text)) return false;
  if (!candidate.topStories.every((story) => supportedThemes.has(story.primaryTheme))) return false;
  return candidate.topStories.every((story) =>
    story.relatedProposals.every((proposalId) => supportedProposalIds.has(proposalId)),
  );
}

export function buildNarrativeEvidence(
  report: NarrativeReportInput,
): NarrativeEvidence {
  const tech = report.ethereumTechRadar;
  return {
    topMomentumThemes: tech.themeInsights.slice(0, 3).map((item) => ({
      theme: item.theme,
      score: item.momentumScore,
    })),
    topDiscussions: sortedDiscussions(tech.signalLayer.discussionHeat).slice(0, 3).map((item) => ({
      proposalId: item.proposalId,
      title: item.title ?? "Untitled",
      activityScore: item.discussionActivityScore ?? item.discussionScore ?? undefined,
      activityLevel: item.activityLevel,
      theme: item.theme,
      replies: item.discussionReplyCount,
      participants: item.discussionParticipantCount,
      lastActivityAt: item.discussionLastActivityAt,
    })),
    recentChangeCount: tech.recentChanges.total,
    contentDiffCount: tech.signalLayer.diffIntelligence.length,
  };
}

function buildWeeklyNarrative(
  report: NarrativeReportInput,
): string[] {
  const tech = report.ethereumTechRadar;
  const topTheme = tech.themeInsights[0];
  const secondTheme = tech.themeInsights[1];
  const highDiscussion = sortedDiscussions(tech.signalLayer.discussionHeat).find((item) => item.activityLevel === "High");
  const topThemeName = topTheme?.theme ?? "Unclassified";
  const paragraphs: string[] = [];

  if (highDiscussion) {
    const discussionTitle = highDiscussion.title ?? "Untitled";
    paragraphs.push(
      `이번 주 핵심 신호는 ${highDiscussion.proposalId} ${discussionTitle} 논의입니다. 최근 활동 기준 ${formatActivity(highDiscussion)}가 확인되어, 단순 등록된 discussion link가 아니라 실제로 개발자 논의가 집중된 항목으로 볼 수 있습니다. 180일 momentum 기준으로는 ${topThemeName}${secondTheme ? `와 ${secondTheme.theme}` : ""}가 상위권입니다.`,
    );
  } else {
    paragraphs.push(
      `이번 주 핵심 흐름은 ${topThemeName}입니다. 180일 momentum 기준으로 ${topThemeName}${secondTheme ? `와 ${secondTheme.theme}` : ""}가 상위권에 있으며, 최근 변경 수보다 누적된 표준화 논의의 밀도를 함께 봐야 하는 주입니다.`,
    );
  }

  paragraphs.push(
    highDiscussion?.theme === "Transaction Model / Execution"
      ? "이 논의는 transaction을 어떤 단위로 구조화하고 실행 경계를 어떻게 정의할 것인가와 연결됩니다. 따라서 단순 UX 제안이라기보다 execution model을 더 명시적으로 다루려는 흐름으로 해석하는 편이 적절합니다."
      : topTheme
        ? `${topThemeName}에서는 ${interpretTheme(topThemeName)} ${topTheme.proposalCount180d}개 제안과 ${topTheme.discussionProposalCount}개 discussion link가 확인되며, 다음 변경 가능성이 어느 세부 주제로 모이는지 보는 것이 중요합니다.`
        : "분류 가능한 상위 기술 테마가 충분하지 않아, 이번 주 narrative는 확인 가능한 discussion과 diff 신호 중심으로 제한합니다.",
  );

  if (tech.recentChanges.total === 0) {
    paragraphs.push(
      "반면 최근 7일 동안 proposal content diff는 감지되지 않았습니다. 이번 주 리포트는 코드나 명세 변경이 많은 주라기보다, 180일 momentum과 discussion heat를 통해 다음 변경 가능성이 있는 영역을 보는 주에 가깝습니다.",
    );
  } else {
    paragraphs.push(
      `최근 7일 변경은 ${tech.recentChanges.total}건이고, 그중 proposal content diff는 ${tech.signalLayer.diffIntelligence.length}건입니다. 이번 주 신호는 단기 변경 목록만으로 판단하기보다, discussion heat와 180일 momentum을 함께 읽어야 합니다.`,
    );
  }

  paragraphs.push(
    "Watchlist 관점에서는 Frame Transaction cluster의 후속 문안 변화와 Network Upgrade / Governance 테마의 상태 변화를 함께 보는 것이 좋습니다.",
  );

  const adoptionItem = topWatchlistAdoptionItem(report);
  const adoptionLevel = adoptionItem?.evidenceLevel ?? topWatchlistAdoptionLevel(report);
  if (adoptionItem?.sources.some((source) => source.semanticType === "implementation_tracker")) {
    paragraphs.push(
      "Ethereum execution-specs contains implementation tracking references, but verified client code support has not yet been established.",
    );
  } else if (adoptionLevel === "Mention") {
    paragraphs.push(
      "외부 mention은 확인되지만 implementation evidence로 보기는 아직 이릅니다.",
    );
  } else if (adoptionLevel === "Reference") {
    paragraphs.push(
      "일부 외부 reference는 확인되지만, client support나 production adoption으로 해석하기에는 이릅니다.",
    );
  } else if (adoptionLevel === "Implementation") {
    paragraphs.push(
      "일부 implementation evidence는 확인되지만, adoption이나 client support로 단정하지는 않습니다.",
    );
  } else {
    paragraphs.push(
      "Adoption evidence는 아직 수집되지 않았거나 확인되지 않았으므로, 이번 주 신호는 implementation signal이 아니라 discussion/momentum signal로 보는 것이 적절합니다.",
    );
  }

  paragraphs.push(
    highDiscussion
      ? `${highDiscussion.proposalId}에서 다음에 확인할 지점은 reply 증가가 실제 문안 diff로 이어지는지, 그리고 관련 테마의 대표 제안들이 같은 문제를 반복해서 다루는지입니다. 현 단계에서는 도입이나 클라이언트 지원을 전제로 보지 않습니다.`
      : "다음에 확인할 지점은 상위 momentum theme의 대표 제안에서 상태 변화, discussion heat, content diff가 같은 방향으로 움직이는지입니다. 현 단계에서는 도입이나 클라이언트 지원을 전제로 보지 않습니다.",
  );

  const kgldParagraph = buildKgldParagraph(tech.themeInsights);
  if (kgldParagraph) paragraphs.push(kgldParagraph);

  return paragraphs.slice(0, 7);
}

function topWatchlistAdoptionItem(report: NarrativeReportInput) {
  const top = report.ethereumTechRadar.watchlistLayer?.items[0];
  return top ? adoptionEvidenceForProposal(report.ethereumTechRadar.adoptionLayer, top.relatedProposals) : undefined;
}

function buildTechnologyStories(
  report: NarrativeReportInput,
): TechnologyStory[] {
  const tech = report.ethereumTechRadar;
  const stories: TechnologyStory[] = [];
  const usedTitles = new Set<string>();
  const discussion = sortedDiscussions(tech.signalLayer.discussionHeat)[0];

  if (discussion) {
    const title = storyTitleForDiscussion(discussion);
    usedTitles.add(title);
    stories.push({
      storyTitle: title,
      primaryTheme: discussion.theme,
      relatedProposals: [discussion.proposalId],
      evidence: [
        `${discussion.proposalId}: ${formatActivity(discussion)}`,
        `Discussion source: ${discussion.discussionSource ?? "public discussion link"}`,
      ],
      interpretation: `${interpretTheme(discussion.theme)} 이 신호가 단기 관심인지 장기 표준화 흐름인지 다음 변경에서 확인할 필요가 있습니다.`,
      watchNext: `${discussion.proposalId} discussion의 reply 증가와 문안 diff 전환 여부를 추적합니다.`,
    });
  }

  for (const theme of tech.themeInsights.slice(0, 4)) {
    if (stories.length >= 3) break;
    const title = storyTitleForTheme(theme.theme);
    if (usedTitles.has(title)) continue;
    usedTitles.add(title);
    stories.push({
      storyTitle: title,
      primaryTheme: theme.theme,
      relatedProposals: theme.representativeProposals.slice(0, 3).map((item) => item.id),
      evidence: [
        `Momentum score ${theme.momentumScore}/100`,
        `${theme.proposalCount180d} proposals in ${theme.theme}`,
        `${theme.recentChangeCount7d} recent changes and ${theme.discussionProposalCount} discussion links`,
      ],
      interpretation: interpretTheme(theme.theme),
      watchNext: `${theme.theme} 대표 제안의 상태 변화, discussion heat, content diff를 함께 확인합니다.`,
    });
  }

  return stories.slice(0, 3);
}

function sortedDiscussions(items: DiscussionHeatItem[]): DiscussionHeatItem[] {
  return [...items].sort((left, right) =>
    activityRank(right) - activityRank(left)
    || (right.discussionActivityScore ?? right.discussionScore ?? 0) - (left.discussionActivityScore ?? left.discussionScore ?? 0)
    || left.proposalId.localeCompare(right.proposalId, undefined, { numeric: true }),
  );
}

function activityRank(item: DiscussionHeatItem): number {
  if (item.activityLevel === "High") return 3;
  if (item.activityLevel === "Medium") return 2;
  if (item.activityLevel === "Low") return 1;
  return 0;
}

function formatActivity(item: DiscussionHeatItem): string {
  const parts = [
    item.activityLevel ? `${item.activityLevel} activity` : "activity metadata",
    item.discussionReplyCount !== undefined ? `${item.discussionReplyCount} replies` : null,
    item.discussionParticipantCount !== undefined ? `${item.discussionParticipantCount} participants` : null,
    item.discussionLastActivityAt ? `last active ${item.discussionLastActivityAt.slice(0, 10)}` : null,
  ].filter((part): part is string => part !== null);
  return parts.join(", ");
}

function interpretTheme(theme: string): string {
  switch (theme) {
    case "Network Upgrade / Governance":
      return "fork coordination, upgrade naming, governance process가 더 명시적인 형태로 정리되는 흐름으로 해석할 수 있습니다.";
    case "Transaction Model / Execution":
      return "transaction 구조와 실행 경계를 더 명확히 정의하려는 execution-layer 흐름으로 볼 수 있습니다.";
    case "EVM / Gas / Opcode":
      return "execution-layer refinement와 gas/opcode 의미 조정이 계속되고 있음을 시사합니다.";
    case "Data Availability":
      return "blob scaling 이후에도 data availability와 데이터 처리 비용을 줄이려는 작업이 이어지고 있습니다.";
    case "Identity / Credential":
      return "authorization, identity binding, compliance-relevant standard 탐색이 진행 중입니다.";
    case "Wallet UX":
    case "Account Abstraction":
      return "사용자에게 노출되는 wallet complexity가 계정 실행 조건 아래로 이동하는 흐름으로 볼 수 있습니다.";
    default:
      return `${theme} 영역에서 반복되는 표준화 쟁점을 discussion과 문안으로 좁혀가는 흐름으로 볼 수 있습니다.`;
  }
}

function storyTitleForDiscussion(discussion: DiscussionHeatItem): string {
  if (discussion.theme === "Transaction Model / Execution") {
    return /frame transaction/i.test(discussion.title ?? "")
      ? "Frame Transactions Point to Execution Flexibility"
      : "Transaction Framing Becomes a Developer Focus";
  }
  if (discussion.theme !== "Unclassified") return storyTitleForTheme(discussion.theme);
  if (discussion.title) return `${discussion.title} Draws Developer Attention`;
  return `${discussion.proposalId} Draws Developer Attention`;
}

function storyTitleForTheme(theme: string): string {
  switch (theme) {
    case "Network Upgrade / Governance":
      return "Network Upgrade Governance Is Becoming More Formalized";
    case "Transaction Model / Execution":
      return "Transaction Framing Becomes a Developer Focus";
    case "EVM / Gas / Opcode":
      return "Execution Semantics and Opcode Design Stay Active";
    case "Data Availability":
      return "Data Availability Work Continues Beyond Blob Scaling";
    case "Wallet UX":
    case "Account Abstraction":
      return "Wallet Complexity Continues Moving Below the Surface";
    case "Identity / Credential":
      return "Identity and Credential Standards Remain Compliance-Relevant";
    default:
      return `${theme} Draws Developer Attention`;
  }
}

function buildKgldParagraph(themes: ThemeInsight[]): string | null {
  if (!themes.some((item) => KGLD_RELEVANT_THEMES.has(item.theme))) return null;
  return "KGLD 관점에서는 이 흐름을 즉시 적용 대상으로 보기보다, 발행·상환 권한, 지갑 UX, compliance flow에 영향을 줄 수 있는 중기 신호로 관찰할 필요가 있습니다.";
}
