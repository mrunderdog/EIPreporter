# Canonical Data Contract v2

## Root

```ts
interface IntelligenceSnapshot {
  metadata: {
    schemaVersion: "intelligence-snapshot/v2";
    snapshotId: string;
    snapshotHash: string;
    generatedAt: string;
    reportDate: string;
  };
  monitoringUniverse: MonitoringUniverse;
  facts: {
    specificationEvidence: SpecificationEvidence[];
    discussionPosts: DiscussionPost[];
    developmentEvents: DevelopmentEvent[];
    topicMembershipFacts: TopicMembershipFact[];
  };
  aggregates: {
    metricDictionary: MetricDefinition[];
    domainActivity: AggregateMetric[];
    discussion: Record<string, DiscussionAggregate>;
    weeklyQuality: AggregateMetric[];
    aa: AggregateMetric[];
    kgld: AggregateMetric[];
  };
  signals: Signal[];
  editorialClaims: EditorialClaim[];
  views: DashboardViewModel;
  quality: {
    passed: boolean;
    checks: QualityCheck[];
  };
}
```

## Monitoring Scope

```ts
interface MonitoringScope {
  title: string;
  subtitle: string;
  universeType: "eip_erc_and_magicians";
  discoveredProposalCount: number;
  monitoredProposalCount: number;
  detailedProposalCount: number;
  discussionThreadCount: number;
  implementationSourceCount: number;
}
```

If `implementationSourceCount === 0`, the subtitle is:

`EIP/ERC 명세와 Ethereum Magicians 활동을 중심으로 한 Ethereum 표준 개발 관찰 보고서`

## Monitoring Universe

```ts
interface MonitoringUniverse {
  discoveredProposalIds: string[];
  monitoredProposalIds: string[];
  detailedAnalysisProposalIds: string[];
  appendixProposalIds: string[];
  heldProposalIds: string[];
  selectionRule: string;
  selectionVersion: string;
  includedSources: string[];
  excludedSources: string[];
}
```

## Facts

```ts
interface SpecificationEvidence {
  proposalId: string;
  officialTitle: string;
  status: string;
  sourceUrl: string;
  abstractText: string | null;
  motivationText: string | null;
  sourceUpdatedAt: string | null;
  fetchedAt: string | null;
  contentHash: string;
  parseState: "parsed" | "title_only" | "missing_body" | "parse_failed";
}

interface DevelopmentEvent {
  eventId: string;
  proposalId: string;
  sourceType: string;
  eventType: string;
  semanticType: string;
  occurredAt: string | null;
  occurredAtSource: string;
  detectedAt: string | null;
  confidence: number;
  sourceUrl: string | null;
}

interface DiscussionPost {
  postId: string;
  threadId: string;
  proposalId: string;
  createdAt: string;
  username: string;
  sourceUrl: string | null;
  deleted: boolean;
  hidden: boolean;
  relevanceState: "not_classified" | "technical" | "non_technical" | "duplicate" | "deleted";
}
```

## Metrics

```ts
interface MetricDefinition {
  metricId: string;
  displayNameKo: string;
  entityType: "domain" | "topic" | "proposal" | "discussion" | "quality" | "aa" | "kgld";
  unit: "proposal" | "event" | "post" | "thread" | "participant" | "evidence" | "ratio";
  aggregation: "unique" | "count" | "sum" | "ratio";
  scope: string;
  window: "current7d" | "previous7d" | "current30d" | "current180d" | "all";
  filterRule: string;
  sourceFactType: string;
}
```

## Weekly Usable Rule

```ts
weeklyUsable =
  occurredAtSource !== "fallback_detected_at" &&
  semanticType !== "unknown" &&
  sourceUrl exists &&
  occurredAt in current7d
```

Fallback or unknown events are audit facts only. They cannot feed weekly ranking, Topic momentum, executive claims, or Signal Map recent development counts.

## Editorial Claims

```ts
interface EditorialClaim {
  claimId: string;
  claimType: "bottom_line" | "why_it_matters" | "this_week" | "kgld_action" | "confidence" | "limitation";
  textKo: string;
  subjectIds: string[];
  signalIds: string[];
  evidenceFactIds: string[];
  confidence: number;
  isInference: boolean;
  limitations: string[];
}
```

Claims without `evidenceFactIds` are not public.

## View Contract

The public dashboard renders only:

`intelligenceSnapshot.views`

Raw evidence remains available for appendix/debug and quality validation. HTML must not recalculate statistics.
