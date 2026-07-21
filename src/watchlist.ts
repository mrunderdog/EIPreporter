import type {
  DiscussionHeatItem,
  ThemeInsight,
  WatchlistItem,
  WatchlistLayer,
  WeeklyRadarReport,
} from "./types.ts";

type WatchlistReportInput = {
  ethereumTechRadar: Omit<WeeklyRadarReport["ethereumTechRadar"], "watchlistLayer"> & {
    watchlistLayer?: WeeklyRadarReport["ethereumTechRadar"]["watchlistLayer"];
  };
};

const PROHIBITED_CLAIM_PATTERN = /\b(adopted|adoption|implemented|implementation|client support|production use|mainnet usage|ecosystem support|price impact|token price|market impact)\b/i;
const FRAME_TRANSACTION_PROPOSALS = ["EIP-8141", "EIP-8250", "EIP-8266", "EIP-8272", "EIP-8209"];

export function buildWatchlistLayer(report: WatchlistReportInput): WatchlistLayer {
  const candidates = [
    ...buildDiscussionWatchlistItems(report),
    ...buildClusterWatchlistItems(report),
  ].filter(validateWatchlistItem);

  return {
    items: dedupeWatchlist(candidates)
      .sort(compareWatchlistItems)
      .slice(0, 3),
    generatedBy: "deterministic",
  };
}

export function validateWatchlistItem(item: WatchlistItem): boolean {
  const text = [
    item.title,
    item.theme,
    item.possibleNextMovement,
    ...item.relatedProposals,
    ...item.evidence,
    ...item.monitorNext,
    item.businessRelevance?.note ?? "",
  ].join("\n");
  return !PROHIBITED_CLAIM_PATTERN.test(text);
}

function buildDiscussionWatchlistItems(report: WatchlistReportInput): WatchlistItem[] {
  const tech = report.ethereumTechRadar;
  return tech.signalLayer.discussionHeat
    .filter((item) =>
      item.activityLevel === "High"
      && (item.discussionReplyCount ?? 0) >= 20
      && (item.discussionParticipantCount ?? 0) >= 10
    )
    .map((discussion) => {
      const theme = findTheme(tech.themeInsights, discussion.theme);
      const relatedProposals = relatedProposalsForDiscussion(discussion, theme);
      const score = confidenceScore({
        discussion,
        theme,
        relatedProposals,
        report,
      });
      const isFrameCluster = discussion.theme === "Transaction Model / Execution"
        && relatedProposals.some((id) => FRAME_TRANSACTION_PROPOSALS.includes(id));

      return {
        title: isFrameCluster ? "Frame Transaction follow-through" : `${discussion.proposalId} discussion follow-through`,
        theme: discussion.theme,
        relatedProposals,
        signalType: isFrameCluster ? "cluster_momentum" : "discussion_heat",
        possibleNextMovement: isFrameCluster
          ? "Discussion heat is high, but the next signal depends on content diff, status movement, or sustained Magicians activity."
          : "Discussion heat is high, but the next signal depends on content diff, status movement, or sustained discussion activity.",
        confidence: confidenceLabel(score),
        confidenceScore: score,
        changeSinceLastReport: "Unknown",
        evidence: evidenceForDiscussion(discussion, theme, relatedProposals, report),
        monitorNext: monitorNextForDiscussion(discussion, relatedProposals, report),
        businessRelevance: businessRelevanceForTheme(discussion.theme),
      } satisfies WatchlistItem;
    });
}

function buildClusterWatchlistItems(report: WatchlistReportInput): WatchlistItem[] {
  const tech = report.ethereumTechRadar;
  return tech.themeInsights
    .filter((theme) =>
      theme.proposalCount180d >= 3
      && theme.discussionProposalCount >= 3
      && theme.momentumScore >= 35
    )
    .map((theme) => {
      const relatedProposals = unique(theme.representativeProposals.map((proposal) => proposal.id));
      const score = confidenceScore({ theme, relatedProposals, report });
      return {
        title: theme.theme === "Transaction Model / Execution"
          ? "Frame Transaction cluster refinement"
          : `${theme.theme} follow-through`,
        theme: theme.theme,
        relatedProposals,
        signalType: "cluster_momentum",
        possibleNextMovement: theme.theme === "Transaction Model / Execution"
          ? "The cluster should be checked for concrete nonce, root, and commit-reveal wording changes."
          : "Theme momentum should be checked for status changes, content diffs, or narrower follow-up discussion.",
        confidence: confidenceLabel(score),
        confidenceScore: score,
        changeSinceLastReport: "Unknown",
        evidence: evidenceForTheme(theme, report),
        monitorNext: monitorNextForTheme(theme, report),
        businessRelevance: businessRelevanceForTheme(theme.theme),
      } satisfies WatchlistItem;
    });
}

function confidenceScore(input: {
  discussion?: DiscussionHeatItem;
  theme?: ThemeInsight;
  relatedProposals: string[];
  report: WatchlistReportInput;
}): number {
  let score = 0;
  const hasRecentDiff = input.report.ethereumTechRadar.signalLayer.diffIntelligence.length > 0;
  const hasStatusMovement = input.report.ethereumTechRadar.recentChanges.statusChanges.length > 0;

  if (input.discussion?.activityLevel === "High") score += 30;
  else if (input.discussion?.activityLevel === "Medium") score += 15;

  if ((input.theme?.momentumScore ?? 0) >= 40) score += 20;
  else if ((input.theme?.momentumScore ?? 0) >= 30) score += 10;

  if (input.relatedProposals.length >= 3) score += 20;
  if (hasRecentDiff) score += 20;
  if (hasStatusMovement) score += 20;
  if (!hasRecentDiff) score -= 10;

  score = Math.max(0, Math.min(100, score));
  if (!hasRecentDiff && !hasStatusMovement && score >= 70) return 69;
  return score;
}

function confidenceLabel(score: number): WatchlistItem["confidence"] {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function evidenceForDiscussion(
  discussion: DiscussionHeatItem,
  theme: ThemeInsight | undefined,
  relatedProposals: string[],
  report: WatchlistReportInput,
): string[] {
  const evidence = [
    `${discussion.proposalId}: ${discussion.discussionReplyCount ?? 0} replies, ${discussion.discussionParticipantCount ?? 0} participants`,
  ];
  if (discussion.discussionLastActivityAt) evidence.push(`Last active ${discussion.discussionLastActivityAt.slice(0, 10)}`);
  evidence.push(`Theme ${discussion.theme}`);
  if (relatedProposals.length >= 3) evidence.push(`${relatedProposals.length} related ${themeSignalLabel(discussion.theme)} proposals`);
  if (theme) evidence.push(`Theme momentum ${theme.momentumScore}/100`);
  if (report.ethereumTechRadar.signalLayer.diffIntelligence.length === 0) {
    evidence.push("No content diff detected this week; signal is discussion/momentum-driven, not spec-change-driven");
  }
  return evidence;
}

function evidenceForTheme(theme: ThemeInsight, report: WatchlistReportInput): string[] {
  const evidence = [
    `${theme.theme}: ${theme.proposalCount180d} proposals`,
    `${theme.discussionProposalCount} discussion links`,
    `Momentum score ${theme.momentumScore}/100`,
  ];
  if (report.ethereumTechRadar.signalLayer.diffIntelligence.length === 0) {
    evidence.push("No content diff detected this week; signal is discussion/momentum-driven, not spec-change-driven");
  }
  return evidence;
}

function monitorNextForDiscussion(
  discussion: DiscussionHeatItem,
  relatedProposals: string[],
  report: WatchlistReportInput,
): string[] {
  const monitor = [
    `${discussion.proposalId} content diff`,
    "new Ethereum Magicians replies",
    "status movement",
  ];
  const related = relatedProposals.filter((proposalId) => proposalId !== discussion.proposalId).slice(0, 3);
  if (related.length) monitor.splice(1, 0, `${related.join(" / ")} changes`);
  if (report.ethereumTechRadar.signalLayer.diffIntelligence.length === 0) {
    monitor.push("discussion activity after next weekly run");
  }
  return monitor;
}

function monitorNextForTheme(theme: ThemeInsight, report: WatchlistReportInput): string[] {
  const proposals = theme.representativeProposals.slice(0, 3).map((proposal) => proposal.id);
  return [
    `${theme.theme} status changes`,
    proposals.length ? `${proposals.join(" / ")} content diff` : `${theme.theme} content diff`,
    report.ethereumTechRadar.signalLayer.diffIntelligence.length === 0
      ? "whether momentum becomes a spec-change signal"
      : "whether recent diffs continue next week",
  ];
}

function relatedProposalsForDiscussion(
  discussion: DiscussionHeatItem,
  theme: ThemeInsight | undefined,
): string[] {
  const themeProposals = theme?.representativeProposals.map((proposal) => proposal.id) ?? [];
  const frameProposals = discussion.theme === "Transaction Model / Execution"
    ? FRAME_TRANSACTION_PROPOSALS.filter((proposalId) =>
      proposalId === discussion.proposalId || themeProposals.includes(proposalId)
    )
    : [];
  return unique([discussion.proposalId, ...frameProposals, ...themeProposals]);
}

function businessRelevanceForTheme(theme: string): WatchlistItem["businessRelevance"] | undefined {
  if (theme === "Transaction Model / Execution") {
    return {
      area: "Protocol",
      note: "Protocol and wallet execution-boundary relevance; business relevance is indirect unless authorization impact becomes explicit.",
    };
  }
  if (theme === "Wallet UX" || theme === "Account Abstraction") {
    return { area: "Wallet", note: "Wallet flow relevance is plausible and should be checked against explicit proposal scope." };
  }
  if (theme === "Identity / Credential") {
    return { area: "RWA / Compliance", note: "Identity and credential mechanics may be relevant to compliance review." };
  }
  if (theme === "Token Standard") {
    return { area: "Exchange", note: "Token interface changes may be relevant to listing, custody, or transfer review." };
  }
  return undefined;
}

function findTheme(themes: ThemeInsight[], theme: string): ThemeInsight | undefined {
  return themes.find((item) => item.theme === theme);
}

function dedupeWatchlist(items: WatchlistItem[]): WatchlistItem[] {
  const byKey = new Map<string, WatchlistItem>();
  for (const item of items) {
    const key = item.theme === "Transaction Model / Execution" ? item.theme : item.title;
    const existing = byKey.get(key);
    if (!existing || compareWatchlistItems(item, existing) < 0) byKey.set(key, item);
  }
  return [...byKey.values()];
}

function compareWatchlistItems(left: WatchlistItem, right: WatchlistItem): number {
  return right.confidenceScore - left.confidenceScore
    || signalRank(right.signalType) - signalRank(left.signalType)
    || left.title.localeCompare(right.title, undefined, { numeric: true });
}

function signalRank(signalType: WatchlistItem["signalType"]): number {
  if (signalType === "discussion_heat") return 5;
  if (signalType === "cluster_momentum") return 4;
  if (signalType === "theme_momentum") return 3;
  if (signalType === "diff_followup") return 2;
  return 1;
}

function themeSignalLabel(theme: string): string {
  if (theme === "Transaction Model / Execution") return "transaction framing";
  return theme;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
