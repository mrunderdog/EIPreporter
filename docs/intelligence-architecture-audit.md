# Intelligence Architecture Audit

Generated: 2026-07-30

## Audit Scope

This audit freezes the reporting pipeline around a single flow:

`SourceRecord -> EvidenceFact -> AggregateMetric -> Signal -> EditorialClaim -> ViewModel`

The current implementation is mostly concentrated in `src/html-report.ts`, with upstream facts coming from the weekly report object, Technology Atlas, discussion heat, topic clusters, and historical diagnostics.

## Parallel Models Found

| Model | Current Role | Risk | Canonical Owner |
| --- | --- | --- | --- |
| `technologyDomains` | Legacy domain payload in embedded API | Can diverge from Dashboard domain metrics | `intelligenceSnapshot.aggregates.domainActivity` |
| `technologyAtlasSummary` | Atlas metadata summary | Duplicates dashboard quality/context | `intelligenceSnapshot.metadata` and `dataQuality` |
| `topicClusters` / `topicMemberships` | Legacy/debug topic lists | Can preserve stale topic interpretation | `intelligenceSnapshot.facts.topicMembershipFacts` |
| `signalQuality` | Mixed quality, event, discussion diagnostics | Public metrics lack dictionary ownership | `intelligenceSnapshot.aggregates.weeklyQuality` and `dataQuality` |
| `dashboard.technologyLandscape` | View model for domain cards | Should render only canonical metrics | `intelligenceSnapshot.views.technologyLandscape` |
| `dashboard.focusProgress` | View model for topic progress | Must consume signals, not recompute events | `intelligenceSnapshot.views.focusProgress` |
| HTML inline `atlasCharts` / `drawAtlasSeries` | Client-side chart data and drawing path | Recalculates/duplicates rendered bars | Removed for Dashboard v1 RC |

## Data Flow Findings

1. `buildDashboard(report, atlas)` currently builds most visible dashboard values directly.
2. `technologyPlatformApi(report, platform, atlas)` embeds both `dashboard` and legacy atlas fields.
3. Quality checks inspect the embedded JSON and final HTML, but some checks still reference `signalQuality` as a parallel owner.
4. Developer activity cards previously derived summaries from classification fields (`problemStatement`, `proposedChange`) rather than official specification evidence.
5. Domain cards previously attached the shared `mapEvidence` discussion aggregate instead of a domain-specific post union.

## Fatal Blocker Audit

No fatal blocker was found.

- Raw weekly source can be reproduced from the local weekly report generation pipeline.
- Proposal IDs and official EIP/ERC URLs use stable `https://eips.ethereum.org/EIPS/eip-{number}` links.
- Historical event diagnostics and backfilled events are present in the report object.
- Tests and fixtures can be produced from the existing in-memory report tests and generated HTML/JSON artifacts.

## Required Architecture Freeze

The release path must make `intelligenceSnapshot` the canonical root and keep legacy fields either removed from public use or explicitly marked compatibility-only. Public HTML must render from `intelligenceSnapshot.views` through the dashboard view model, and public metrics must have a `MetricDefinition`.
