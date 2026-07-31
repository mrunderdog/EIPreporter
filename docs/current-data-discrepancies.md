# Current Data Discrepancies

Generated: 2026-07-30

## Known Fixture Values

| Metric | Value |
| --- | ---: |
| current7d raw events | 98 |
| current7d fallback events | 85 |
| current7d unknown semantic events | 13 |
| current7d usable events | 0 |
| Developer activity ERC-8183 | 23 raw posts |
| Developer activity EIP-8037 | 5 raw posts |
| Developer activity EIP-8151 | 4 raw posts |
| AA unique active threads | 2 |
| AA unique recent posts | 3 |
| AA track assignment count | 16 |
| Implementation source count | 0 |

## Discrepancies Audited

| Discrepancy | Cause | Release Handling |
| --- | --- | --- |
| Technology Landscape values such as `21/12/16/8/9/3/1/0` and `20/4/6/7/6/3/1/3` conflict | Domain proposal counts and event counts were displayed without a shared metric dictionary | Register public numbers in `MetricDefinition`; remove unlabeled duplicate chart paths |
| Dashboard summary raw posts `9` vs Developer activity card union `40` | Different scopes were shown under similar labels | Use explicit scopes: `developer_activity_set`, `technology_map_set`, `all_monitored_threads` |
| AA discussion `16` could be read as unique posts | Track assignment sum was mixed with unique thread/post union | Display unique thread/post separately; label assignment count separately |
| Weekly usable event is `0` while Focus or weekly scores can be nonzero | Some views used raw/fallback/unknown events | Enforce `weeklyUsable` as the only weekly development source |
| Proposal descriptions can come from classification summary | Classification narrative is not official specification evidence | Build `ProposalSummary` from official title/abstract/motivation/spec fallback only |
| Domain cards can copy map discussion aggregate | Shared aggregate reused across domains | Build per-domain post union from domain proposal IDs |
| Cover suggests full Ethereum coverage | Data source is EIP/ERC and Magicians-centered | Use `MonitoringScope.subtitle` and “관찰 대상 내 180일 이력” wording |
| HTML still embeds atlas chart data and draw code | Legacy chart path remained after dashboard rendering | Remove public chart recalculation path when no canvas is rendered |

## Release Decision

No discrepancy is fatal. Each can be resolved through canonical ownership, metric dictionary registration, and final HTML/compact JSON equality checks.
