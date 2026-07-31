# Product Acceptance Matrix

| Goal | Required Data | Available Data | Unavailable Data | Fallback Rendering | Acceptance Test |
| --- | --- | --- | --- | --- | --- |
| G1. 관찰 범위 안에서 어떤 Ethereum/EVM 기술이 개발 중인가? | Monitoring universe, domain/topic metrics, official specification evidence | EIP/ERC specification links, classified domains/topics, 180d/30d events | Full Ethereum implementation ecosystem | Use scope subtitle: EIP/ERC and Magicians-centered monitoring | PA-01, PA-02, PA-03 |
| G2. 개발자 커뮤니티에서 어떤 Proposal의 활동이 증가했는가? | Discussion posts, thread IDs, 7d window, participant counts | Magicians thread URLs/posts for monitored set | Validated technical relevance for all posts | Title section as recent Magicians activity, not developer consensus | PA-05, discussion union checks |
| G3. 최근 180일 흐름과 최근 7일 흐름은 어떻게 다른가? | Historical events with occurredAt, semantic type, source URL | 180d history, current7d raw/fallback/unknown diagnostics | Fully usable current7d semantic events | If usable is 0, show no confirmed weekly specification changes | PA-03, PA-04 |
| G4. 주요 기술은 명세·논의·구현·활성화·채택 중 어디까지 왔는가? | Topic progress lanes and evidence IDs | Specification and discussion collection states | Implementation, activation, adoption adapters | Render not_collected, not none | PA-08, ST-12 |
| G5. Account Abstraction의 각 기술 축은 어떤 근거로 진행되고 있는가? | AA track assignments with role/reason/source | 12 AA tracks and proposal assignments | Complete AA implementation evidence | Tracks without source are not_monitored; Draft alone is not advancing | PA-07, ST-10 |
| G6. KGLD 운영자는 무엇을 지금 검토하고 무엇을 기다려야 하는가? | KGLD Watch items with action, owner, next trigger, source | ERC-8328, ERC-8330, ERC-8161 watch items | Direct implementation/adoption evidence | research_now means research, not adoption | PA-09 |

## Product Acceptance

- PA-01: 보고서 범위와 분석 분모가 명확하다.
- PA-02: Ethereum 전체와 관찰 대상을 혼동하지 않는다.
- PA-03: 장기 Proposal 수와 event 수가 구분된다.
- PA-04: 주간 usable 데이터가 모든 화면에서 일치한다.
- PA-05: Developer Activity 상위 Proposal과 Executive가 일치한다.
- PA-06: Proposal 설명은 공식 본문 또는 title-only fallback에 근거한다.
- PA-07: AA direction은 실제 근거 없이는 advancing이 아니다.
- PA-08: Focus selection 이유를 설명할 수 있다.
- PA-09: KGLD Action에 근거와 trigger가 있다.
- PA-10: Executive가 결론·의미·행동·한계를 전달한다.
- PA-11: Compact JSON과 HTML이 동일 snapshot을 사용한다.
- PA-12: Structural, semantic, interaction tests가 통과한다.
