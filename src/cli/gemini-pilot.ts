import { enrichEmergingLayerWithGemini } from "../emerging-research.ts";
import type { EmergingIssue, EmergingLayer, EmergingRawSignal } from "../types.ts";

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is absent in GitHub Actions; Gemini live verification cannot run.");
  process.exitCode = 2;
} else {
  const now = new Date();
  const emptyMetrics = { replyCount: 0, viewCount: 0, participantCount: 0, velocity: [] };
  const sourcePr = (proposal: string, number: number): EmergingRawSignal => ({
    source: "github_pr",
    sourceId: "ethereum/ercs#" + number,
    sourceRepo: "ethereum/ercs",
    facts: {},
    url: "https://github.com/ethereum/ERCs/pull/" + number,
    title: proposal + " PR discussion",
    primaryProposalId: proposal,
    relatedProposalIds: [],
    extractedEipIds: [proposal],
    collectedAt: now.toISOString(),
  });
  const sourceMagicians = (proposal: string, id: number, slug: string): EmergingRawSignal => ({
    source: "ethereum_magicians",
    sourceId: String(id),
    facts: {},
    url: "https://ethereum-magicians.org/t/" + slug + "/" + id,
    title: proposal + " discussion",
    primaryProposalId: proposal,
    relatedProposalIds: [],
    extractedEipIds: [proposal],
    collectedAt: now.toISOString(),
  });
  const samples: Array<{ id: string; title: string; signals: EmergingRawSignal[] }> = [
    { id: "ERC-8259", title: "ERC-8259: AI Agent Identity & Threat Registry", signals: [sourcePr("ERC-8259",2142)] },
    { id: "ERC-8481", title: "ERC-8481: Agent Pre-Sign Risk Report", signals: [sourcePr("ERC-8481",2134)] },
    { id: "EIP-8037", title: "EIP-8037: State Creation Gas Cost Increase", signals: [] },
    { id: "EIP-8363", title: "EIP-8363: Tapered Issuance Burn", signals: [
      sourceMagicians("EIP-8363",29263,"eip-8363-tapered-issuance-burn"),
    ] },
    { id: "ERC-7943", title: "ERC-7943: Universal RWA Interface", signals: [
      sourcePr("ERC-7943",2122), sourceMagicians("ERC-7943",23972,"erc-universal-rwa-interface"),
    ] },
    { id: "ERC-8482", title: "ERC-8482: Autonomous Self-Refunding Merchant Settlement", signals: [
      sourcePr("ERC-8482",2136), sourceMagicians("ERC-8482",30162,"erc-8482-autonomous-self-refunding-merchant-settlement"),
    ] },
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
    limit: 6,
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
      debate: research?.debate.text ?? null,
      significance: research?.significance.text ?? null,
      watchNext: research?.watchNext.text ?? null,
      citations: research?.evidence.map(e => ({id:e.id,type:e.type,url:e.url,at:e.occurredAt})),
    }, null, 2));
  }
  console.log("Gemini pilot stats:", JSON.stringify(stats));
  if (stats.generated + stats.cacheHits !== issues.length) {
    console.error("Gemini 6-signal pilot did not cover all proposals; not ready for production.");
    process.exitCode = 1;
  }
}
