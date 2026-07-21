import assert from "node:assert/strict";
import test from "node:test";
import { scoreKgldOpportunity } from "../src/scoring.ts";
import type { ProposalRecord } from "../src/types.ts";

test("scores high-value ERC proposals with status and repository weights", () => {
  const candidate = scoreKgldOpportunity(
    makeRecord("ERC-7579", "Last Call", "Smart account session key and paymaster"),
  );

  assert.ok(candidate);
  assert.equal(candidate.relevanceScore, 90);
  assert.equal(candidate.businessImpact, 5);
  assert.equal(candidate.implementationEffort, 4);
  assert.equal(candidate.urgency, 5);
  assert.equal(candidate.recommendedAction, "poc");
  assert.ok(candidate.matchedThemes.includes("Account Abstraction"));
  assert.ok(candidate.whyRelevantToKGLD.includes("지갑 경험"));
  assert.ok(candidate.potentialUseCases.includes("KGLD Wallet UX"));
  assert.ok(candidate.reasonCodes.includes("STATUS_LAST_CALL"));
});

test("assigns lower scores to low-relevance themes and ignores withdrawn proposals", () => {
  const low = scoreKgldOpportunity(makeRecord("ERC-9000", "Draft", "Metaverse game item NFT"));
  assert.ok(low);
  assert.equal(low.businessImpact, 1);
  assert.equal(low.recommendedAction, "monitor");
  assert.ok(low.relevanceScore >= 0 && low.relevanceScore <= 100);

  const withdrawn = scoreKgldOpportunity(
    makeRecord("EIP-9001", "Withdrawn", "Proof of reserve oracle", "EIP"),
  );
  assert.equal(withdrawn?.recommendedAction, "ignore");
  assert.equal(withdrawn?.urgency, 1);
});

function makeRecord(
  proposalId: string,
  status: string,
  title: string,
  kind: ProposalRecord["kind"] = "ERC",
): ProposalRecord {
  const number = Number(proposalId.split("-")[1]);
  return {
    proposalId,
    kind,
    number,
    title,
    status,
    proposalType: "Standards Track",
    category: kind === "ERC" ? "ERC" : "Core",
    created: "2026-01-01",
    updated: null,
    discussionTo: null,
    sourceRepo: kind === "ERC" ? "ethereum/ercs" : "ethereum/EIPs",
    sourcePath: `${kind.toLowerCase()}-${number}.md`,
    canonicalUrl: `https://example.test/${proposalId}`,
    rawContentHash: "hash",
  };
}
