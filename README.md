# EIPreporter

EIPreporter는 단순한 EIP 변경 알림봇이 아니라, 최근 180일간 Ethereum/EVM 개발자들이 추진하는 기술 테마와 세부 접근 방식을 분석하고, 최근 7일 변경사항을 보조 지표로 활용하며, KGLD/DeFi 적용 가능성을 매주 Telegram과 HTML 리포트로 제공하는 기술 인텔리전스 대시보드입니다.

주간 산출물의 이름은 **Ethereum Developer Momentum Dashboard — EIPreporter Weekly**입니다.

## 현재 범위

- `ethereum/EIPs`, `ethereum/ercs` 공식 repository markdown 수집
- frontmatter, metadata, body excerpt 정규화
- SQLite snapshot 저장
- `change_events` 저장 및 최근 7일 변경사항 집계
- 최근 180일 기준 기술 테마와 Sub-trend 분석
- Developer Momentum Score 계산
- Account Abstraction Radar
- KGLD Opportunity Radar 및 rule-based relevance scoring
- 정적 HTML Dashboard 생성
- Telegram 텍스트 요약 및 HTML 파일 첨부 발송
- GitHub Actions 주간 자동 실행

이번 버전은 새로운 외부 데이터 소스를 추가하지 않습니다. Ethereum Magicians, GitHub PR/Issue, AllCoreDevs, Notion, OpenAI API, 웹 서버형 대시보드는 포함하지 않습니다.

## 요구 사항

- Node.js 26 이상
- npm

Windows PowerShell에서 `npm` 실행이 차단되면 `npm.cmd`를 사용하세요.

## 설치

```bash
npm install
```

프로젝트 루트에 `.env`를 설정합니다.

```dotenv
GITHUB_TOKEN=github_pat_or_token_for_higher_rate_limits
TELEGRAM_BOT_TOKEN=telegram_bot_token
TELEGRAM_CHAT_ID=telegram_chat_id
DATABASE_URL=data/eipreporter.sqlite
TIMEZONE=Asia/Seoul
```

## 수집과 변경사항

```bash
npm run collect
npm run diff
npm run diff -- --json
```

다른 SQLite 경로를 사용할 수 있습니다.

```bash
npm run collect -- --db data/custom.sqlite
npm run diff -- --db data/custom.sqlite
```

## Weekly Dashboard

텍스트 또는 JSON 리포트:

```bash
npm run report:weekly
npm run report:weekly -- --json
npm run report:weekly -- --trend-days 180 --change-days 7
```

정적 HTML Dashboard:

```bash
npm run report:html
npm run report:html -- --trend-days 180 --change-days 7
npm run report:html -- --db data/custom.sqlite --output reports/custom
```

기본 출력은 `reports/weekly-YYYY-MM-DD.html`입니다. HTML은 정적 파일이며 별도 웹 서버가 필요하지 않습니다. 차트 렌더링에는 Chart.js CDN을 사용합니다.

## HTML 구성

1. Executive Signal
2. Developer Momentum Details
3. Theme Deep Dive
4. Account Abstraction Radar
5. Standards Progress
6. KGLD Opportunity Radar
7. KGLD Opportunity Matrix
8. Recommended Actions

## Developer Momentum Score

기술 테마별 `momentumScore`는 0~100 범위로 계산됩니다.

- 최근 180일 proposal count: 최대 25점
- 최근 7일 변경사항: 최대 20점
- Review / Last Call / Final 비중: 최대 20점
- Sub-trend diversity: 최대 15점
- KGLD relevance overlap: 최대 10점
- Account Abstraction, Wallet UX, RWA, Oracle, Security 등 전략 테마 bonus: 최대 10점

각 Theme insight에는 `proposalCount180d`, `recentChangeCount7d`, `maturitySignal`, `momentumScore`, `dominantSubTrends`, `interpretation`이 포함됩니다.

## KGLD Opportunity Radar

각 KGLD Opportunity Candidate는 다음 정보를 포함합니다.

- `proposalId`, `title`, `status`
- `oneLineSummary`
- `whyRelevantToKGLD`
- `matchedThemes`, `matchedKeywords`
- `relevanceScore`
- `potentialUseCases`
- `recommendedAction`
- `businessImpact`, `implementationEffort`, `urgency`

KGLD Opportunity Matrix는 `businessImpact × implementationEffort` 기준으로 Quick Win, Strategic PoC, Monitor, Ignore 영역을 표시합니다. 후보 데이터가 없으면 fallback 메시지를 표시합니다.

## Telegram

연결 테스트:

```bash
npm run send:test
```

Weekly Dashboard 발송:

```bash
npm run send:weekly
```

## Emerging Signal Detection

EIPreporter treats emerging intelligence as a source-first layer inside the weekly intelligence report. Production operation is weekly, not real-time or 6-hour alerting.

Sources:
- Official EIP/ERC repositories: merged proposal and weekly change activity.
- Ethereum Magicians: recent public Discourse topics from `latest.json`, including topics without EIP/ERC numbers.
- GitHub PR/draft activity: open PRs in `ethereum/EIPs` and `ethereum/ercs` before merge.

Candidate resolution:
- Explicit EIP/ERC numbers are the strongest merge key.
- Unnumbered topics remain standalone issues.
- Title normalization is conservative; the system prefers not merging over a false merge.

Scoring:
- Heat Score is 0-100 and represents activity/momentum only.
- Heat uses 7-day velocity, current absolute activity, participation, freshness, cross-source spread, GitHub PR/draft activity, official status, decision proximity, and materiality hints.
- 6h, 24h, and 72h windows may remain in the data model, but weekly production scoring does not depend on them being present.
- Cold start uses current absolute activity, freshness, participation, and cross-source spread so a strong issue can be detected before a previous weekly snapshot exists.
- Confidence Score represents source and metadata completeness.
- Heat is not proposal quality, endorsement, or acceptance probability.

Activity history:
- `emerging_activity_snapshots` stores compact rolling source/topic counters.
- Velocity windows use 7d as the primary production signal where prior snapshots exist.
- Unknown metrics stay unknown; they are not treated as zero.

Alerts:
- `.github/workflows/weekly-report.yml` runs weekly, collects official standards data, runs Emerging Scan with `--no-telegram`, then generates one combined emerging + standards intelligence report.
- `.github/workflows/emerging-scan.yml` has no schedule. It is `workflow_dispatch` only for development, validation, and manual re-collection.
- Operational Telegram is sent once, after the Weekly Report completes.
- Manual Emerging Scan defaults to `--no-telegram`.
- `emerging_alert_state` suppresses duplicate alerts for unchanged HOT issues.

Known limitations:
- P0 does not infer authority from hardcoded developer lists.
- Decision proximity is scored only when explicit public labels/text are present.
- Discussion content is not summarized with an LLM; all text is rule/template based.

Telegram 메시지는 긴 표 대신 다음만 포함합니다.

- 제목: Ethereum Developer Momentum Dashboard
- 이번 주 핵심 흐름 3줄
- Momentum Top 3 themes
- KGLD Review/PoC 후보 수
- HTML 파일 첨부 안내

특정 HTML 파일을 보내려면 다음 옵션을 사용합니다.

```bash
npm run send:weekly -- --report-path reports/weekly-2026-06-12.html
```

## GitHub Actions

Weekly Report:
- Runs automatically once per week.
- Restores the shared `data/eipreporter.sqlite` state/cache.
- Collects official EIP/ERC data.
- Runs Emerging Scan in the same workflow and same DB with `--no-telegram`.
- Generates one combined Ethereum Weekly Intelligence Report covering emerging issues and standards activity.
- Sends Telegram only once after the final weekly report is ready.
- Deploys the validated HTML report to GitHub Pages.

Emerging Scan:
- Has no cron schedule.
- Runs only through `workflow_dispatch`.
- Exists for development, validation, manual re-collection, and incident diagnosis.

## 검증

```bash
npm test
npm run typecheck
npm run report:weekly
npm run report:html
npm run send:weekly
```
