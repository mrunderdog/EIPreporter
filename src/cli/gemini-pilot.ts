import { enrichEmergingLayerWithGemini } from "../emerging-research.ts";
import type { EmergingIssue, EmergingLayer, EmergingRawSignal } from "../types.ts";

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is absent in GitHub Actions; Gemini live verification cannot run.");
  process.exitCode = 2;
} else {
  const now = new Date();
  const emptyMetrics = { replyCount: 0, viewCount: 0, participantCount: 0, velocity: [] };
  const samples: Array<{ id: string; title: string; signals: EmergingRawSignal[] }> = [
    {
      id: "ERC-7943",
      title: "ERC-7943: Universal RWA Interface",
      signals: [
        {
          source: "github_pr", sourceId: "ethereum/ercs#2122",
          sourceRepo: "ethereum/ercs", facts: {},
          url: "https://github.com/ethereum/ERCs/pull/2122",
          title: "ERC-7943 reference implementation discussion",
          primaryProposalId: "ERC-7943", relatedProposalIds: [], extractedEipIds: ["ERC-7943"],
          collectedAt: now.toISOString(),
        },
        {
          source: "ethereum_magicians", sourceId: "23972", facts: {},
          url: "https://ethereum-magicians.org/t/erc-universal-rwa-interface/23972",
          title: "ERC-7943 Universal RWA Interface",
          primaryProposalId: "ERC-7943", relatedProposalIds: [], extractedEipIds: ["ERC-7943"],
          collectedAt: now.toISOString(),
        },
      ],
    },
    {
      id: "EIP-8037",
      title: "EIP-8037: State Creation Gas Cost Increase",
      signals: [],
    },
  ];
  const issues = samples.map((entry): EmergingIssue => ({
    issueId: "proposal:" + entry.id,
    primaryProposalId: entry.id,
    eipIds: [entry.id],
    title: entry.title,
    status: "EARLY_SIGNAL",
    stage: "STANDARDIZING",
    heatScore: 50,
    confidenceScore: 77,
    sources: [...new Set(entry.signals.map((signal) => signal.source))],
    metrics: { ...emptyMetrics },
    scoreBreakdown: [],
    sourceSignals: entry.signals,
    summaries: { whatIsHappening: "", whyMoving: "", whyItMatters: "", watchNext: "" },
    facts: {},
  }));
  const layer: EmergingLayer = {
    generatedAt: now.toISOString(),
    sourceStatus: [],
    rawSignals: samples.flatMap((sample) => sample.signals),
    issues,
    whatsHappeningNow: [],
    emergingSignals: issues,
    decisionWatch: [],
    generatedBy: "deterministic_emerging_signal_engine",
  };
  const stats = await enrichEmergingLayerWithGemini(layer, {
    apiKey: key,
    githubToken: process.env.GITHUB_TOKEN,
    now,
    limit: 2,
    cachePath: "data/emerging-gemini-pilot-cache.json",
  });
  for (const issue of issues) {
    const research = issue.research;
    console.log(JSON.stringify({
      proposalId: issue.primaryProposalId,
      enriched: Boolean(research),
      model: research?.model ?? null,
      sourceCount: research?.evidence.length ?? 0,
      overview: research?.overview.text ?? null,
      weeklyChange: research?.weeklyChange.text ?? null,
      finalTransitionAt: research?.finalTransitionAt ?? null,
    }, null, 2));
  }
  console.log("Gemini pilot stats:", JSON.stringify(stats));
  if (stats.generated + stats.cacheHits !== issues.length) {
    console.error("Gemini live pilot failed to enrich all samples; not ready for production.");
    process.exitCode = 1;
  }
}
