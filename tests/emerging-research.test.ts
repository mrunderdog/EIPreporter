import test from "node:test";
import assert from "node:assert/strict";
import {
  selectResearchCandidates,
  validateResearchPayload,
} from "../src/emerging-research.ts";
import type { EmergingIssue, EmergingLayer, EmergingResearchEvidence } from "../src/types.ts";

const now = new Date("2026-11-09T09:00:00Z");
const evidence: EmergingResearchEvidence[] = [
  {
    id: "S1",
    type: "specification",
    url: "https://eips.ethereum.org/EIPS/eip-7943",
    label: "Official specification",
    text: "status: Final",
  },
  {
    id: "S2",
    type: "recent_change",
    url: "https://github.com/ethereum/ERCs/commit/abcdef",
    label: "Recent change",
    text: "Fixed a test",
    occurredAt: "2026-11-07T12:00:00Z",
  },
  {
    id: "S3",
    type: "status_history",
    url: "https://github.com/ethereum/ERCs/commit/123456",
    label: "Final transition date",
    text: "Final status",
    occurredAt: "2026-05-05T16:30:48Z",
  },
];

function payload(ids: string[]) {
  const claim = (text: string, evidenceIds: string[]) => ({ text, evidenceIds });
  return {
    overview: claim("RWA 표준입니다.", ["S1"]),
    weeklyChange: claim("이번 주 수정이 확인됐습니다.", ids),
    debate: claim("쟁점을 검토합니다.", ["S2"]),
    significance: claim("상태 관리가 중요합니다.", ["S1"]),
    watchNext: claim("패치 적용을 확인합니다.", ["S2"]),
    kgldRelevance: claim("적용 여부를 검토합니다.", ["S1"]),
  };
}

test("research preserves confirmed historical Final date while only current-window evidence supports weekly changes", () => {
  const result = validateResearchPayload(payload(["S2"]), evidence, "gemini-2.5-flash", now);
  assert.ok(result);
  assert.equal(result.finalTransitionAt, "2026-05-05T16:30:48Z");
  assert.deepEqual(result.weeklyChange.evidenceIds, ["S2"]);
  assert.equal(result.weeklyChange.text, "이번 주 수정이 확인됐습니다.");
});

test("historical evidence cannot support a this-week claim", () => {
  const result = validateResearchPayload(payload(["S3"]), evidence, "gemini-2.5-flash", now);
  assert.ok(result);
  assert.equal(result.weeklyChange.text, "최근 7일 내 확인된 실질적 변경 없음.");
  assert.deepEqual(result.weeklyChange.evidenceIds, []);
});

test("unknown source IDs are discarded and unsupported fields are suppressed", () => {
  const bad = payload(["S404"]);
  bad.debate = { text: "근거가 없는 주장", evidenceIds: ["S404"] };
  const result = validateResearchPayload(bad, evidence, "gemini-2.5-flash", now);
  assert.ok(result);
  assert.equal(result.debate.text, "");
  assert.deepEqual(result.weeklyChange.evidenceIds, []);
});

test("empty or ungrounded overview prevents publishing research", () => {
  const bad = payload(["S2"]);
  bad.overview = { text: "검증되지 않음", evidenceIds: ["S404"] };
  assert.equal(validateResearchPayload(bad, evidence, "gemini-2.5-flash", now), null);
});

test("candidate selection deduplicates issues across sections and respects the cap", () => {
  const issue = (id: number) => ({
    issueId: "proposal:EIP-" + id,
    title: "EIP " + id,
    summaries: { whatIsHappening: "", whyMoving: "", whyItMatters: "", watchNext: "" },
  } as EmergingIssue);
  const first = issue(1);
  const second = issue(2);
  const layer = {
    whatsHappeningNow: [first],
    emergingSignals: [first, second],
    decisionWatch: [second],
  } as EmergingLayer;
  assert.deepEqual(selectResearchCandidates(layer, 10).map((x) => x.issueId), [
    first.issueId, second.issueId,
  ]);
});
