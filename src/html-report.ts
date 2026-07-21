import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { adoptionEvidenceForProposal, adoptionStatusLabel, buildAdoptionLayer, githubSkippedMessage, noExternalEvidenceMessage } from "./adoption.ts";
import { buildDiscussionFallbackWhyItMatters } from "./discussion-activity.ts";
import { buildTechnologyPlatformLayer } from "./platform.ts";
import { buildExecutiveSignal } from "./report.ts";
import type {
  ChangeEvent,
  ChartSeries,
  AdoptionEvidenceItem,
  AdoptionLayer,
  DiffIntelligenceItem,
  DiscussionHeatItem,
  KgldCandidate,
  NarrativeEvidence,
  NarrativeLayer,
  TechnologyStory,
  TechnologyPlatformLayer,
  ThemeInsight,
  WatchlistItem,
  WatchlistLayer,
  WeeklyRadarReport,
} from "./types.ts";
import { buildWatchlistLayer } from "./watchlist.ts";

const DASHBOARD_TITLE = "Ethereum Technology Intelligence Platform";
const SEP = " · ";

export function writeWeeklyHtmlReport(
  report: WeeklyRadarReport,
  outputDirectory = "reports",
): string {
  const directory = resolve(outputDirectory);
  const outputPath = resolve(directory, `weekly-${report.generatedAt.slice(0, 10)}.html`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(outputPath, generateWeeklyHtml(report), { encoding: "utf8" });
  return outputPath;
}

export function generateWeeklyHtml(report: WeeklyRadarReport): string {
  const tech = report.ethereumTechRadar;
  const changes = tech.recentChanges;
  const candidates = report.kgldOpportunityRadar.candidates;
  const topThemes = tech.themeInsights.slice(0, 8);
  const narrative = tech.narrativeLayer;
  const reviewCount = candidates.filter((item) => item.recommendedAction === "review").length;
  const pocCount = candidates.filter((item) => item.recommendedAction === "poc").length;
  const charts = report.chartData;
  const platform = getTechnologyPlatformLayer(report);
  const chartJson = JSON.stringify(charts).replace(/</g, "\\u003c").replace(/--/g, "\\u002d\\u002d");
  const platformApiJson = JSON.stringify(platform.api).replace(/</g, "\\u003c").replace(/--/g, "\\u002d\\u002d");
  const watchlist = getWatchlistLayer(report);
  const adoptionLayer = getAdoptionLayer(report);
  const releaseDeploymentHtml = releaseDeploymentIntelligenceSection(platform);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${DASHBOARD_TITLE} - EIPreporter Weekly ${escapeHtml(report.generatedAt.slice(0, 10))}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    :root{color-scheme:dark;--bg-base:#0d1312;--bg-deep:#07100f;--bg-panel:#151d1c;--bg-panel-2:#101817;--bg-panel-hover:#1a2423;--border-subtle:#30413f;--border-strong:#2dc396;--text-primary:#ffffff;--text-secondary:#d6dfdd;--text-muted:#9ba8a6;--semantic-info:#2f8cff;--semantic-track:#d88917;--semantic-ok:#2dc396;--semantic-risk:#e24b52;--semantic-none:#697674;--mint:#00a39f;--deep-teal:#008485;--fresh-green:#2dc396;--warning:#d88917}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#07100f 0,#101615 320px,#0d1312 100%);color:var(--text-primary);font-family:"Pretendard Variable","Pretendard","Noto Sans KR","Apple SD Gothic Neo","Segoe UI",sans-serif;font-size:15px;line-height:1.7}main{width:min(1180px,calc(100% - 36px));margin:20px auto 56px}a{color:var(--text-primary);text-decoration:none;border-bottom:1px solid rgba(0,163,159,.55)}a:hover{color:#fff;border-color:var(--mint)}a:focus-visible,summary:focus-visible,.button:focus-visible{outline:2px solid var(--fresh-green);outline-offset:3px}h1{margin:4px 0 8px;font-size:32px;font-weight:760;line-height:1.18;letter-spacing:0}h2{margin:0 0 16px;font-size:22px;font-weight:760;letter-spacing:0}h3{margin:0 0 8px;font-size:17px;font-weight:720;letter-spacing:0}p{margin:0 0 10px;max-width:86ch}.muted{color:var(--text-muted);font-size:14px}.meta{color:var(--text-secondary);font-size:14px;font-variant-numeric:tabular-nums}.eyebrow{color:var(--fresh-green);font-size:13px;font-weight:720}.section{margin-top:36px;scroll-margin-top:72px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}.card{grid-column:span 12;background:linear-gradient(180deg,var(--bg-panel),#121b1a);border:1px solid var(--border-subtle);border-radius:12px;padding:22px;box-shadow:0 14px 34px rgba(0,0,0,.18)}.half{grid-column:span 6}.third{grid-column:span 4}.priority-primary{border-color:rgba(216,137,23,.72);background:linear-gradient(180deg,rgba(216,137,23,.13),var(--bg-panel))}.priority-secondary{background:var(--bg-panel)}.priority-muted{background:var(--bg-panel-2);color:var(--text-secondary)}.priority-critical{border-color:rgba(226,75,82,.7);background:linear-gradient(180deg,rgba(226,75,82,.12),var(--bg-panel))}
    .section-nav{position:sticky;top:0;z-index:10;margin:16px 0 0;padding:8px;border:1px solid var(--border-subtle);border-radius:999px;background:rgba(10,18,17,.92);backdrop-filter:blur(12px);display:flex;gap:6px;overflow-x:auto}.section-nav a{flex:0 0 auto;border:0;border-radius:999px;padding:7px 12px;color:var(--text-secondary);font-size:14px}.section-nav a:hover{background:#1f2b29;color:#fff}.hero{padding:24px;background:linear-gradient(135deg,rgba(0,132,133,.36),rgba(21,29,28,.94) 56%,rgba(216,137,23,.10));border-color:rgba(45,195,150,.58)}.hero-layout{display:grid;grid-template-columns:1.25fr .75fr;gap:20px;align-items:end}.hero h2{font-size:34px;line-height:1.18;margin:2px 0 10px}.hero-summary{font-size:16px;line-height:1.72;color:var(--text-secondary);max-width:70ch}.status-strip{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.status-chip{display:inline-flex;align-items:center;gap:7px;border-radius:999px;border:1px solid var(--border-subtle);background:#101b1a;padding:7px 10px;font-size:13px;color:var(--text-secondary)}.status-chip b{color:#fff}.dot{width:8px;height:8px;border-radius:50%;background:var(--semantic-info)}.dot.tracking{background:var(--semantic-track)}.dot.ok{background:var(--semantic-ok)}.dot.none{background:var(--semantic-none)}.dot.risk{background:var(--semantic-risk)}.hero-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.button{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:8px;border:1px solid var(--border-subtle);background:#23312f;color:#fff;padding:8px 14px;font-size:14px;font-weight:720}.button.primary{background:var(--deep-teal);border-color:rgba(45,195,150,.5)}.button:hover{background:#30413f;border-bottom:1px solid var(--border-subtle)}.dashboard-compact{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.metric-card{background:var(--bg-deep);border:1px solid var(--border-subtle);border-radius:10px;padding:14px;min-height:118px}.metric-card span{display:block;color:var(--text-muted);font-size:13px}.metric-card b{display:block;margin:6px 0;color:var(--text-primary);font-size:20px;line-height:1.25}.metric-card p{font-size:13px;color:var(--text-secondary);margin:0}.compact-list{display:grid;gap:8px}.compact-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--border-subtle);border-radius:10px;background:var(--bg-deep);padding:10px 12px}.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--border-subtle);padding:4px 9px;font-size:12px;font-weight:720;color:var(--text-secondary);white-space:nowrap}.badge.lifecycle-current,.badge.evidence-tracking{border-color:rgba(216,137,23,.55);background:rgba(216,137,23,.15);color:#fff}.badge.lifecycle-complete,.badge.verified{border-color:rgba(45,195,150,.55);background:rgba(45,195,150,.14);color:#fff}.badge.future,.badge.no-evidence{color:var(--text-muted);background:#1a2221}.badge.risk-high{border-color:rgba(226,75,82,.7);background:rgba(226,75,82,.14);color:#fff}.badge.risk-medium{border-color:rgba(216,137,23,.6);background:rgba(216,137,23,.12);color:#fff}.score{display:inline-flex;align-items:center;justify-content:center;min-width:64px;padding:5px 9px;border-radius:9999px;background:#1f2b29;color:var(--text-secondary);font-weight:720;font-size:12px;font-variant-numeric:tabular-nums}.score.high{background:rgba(226,75,82,.16);color:#fff;border:1px solid rgba(226,75,82,.5)}.score.medium{background:rgba(216,137,23,.15);color:#fff;border:1px solid rgba(216,137,23,.5)}.score.low,.score.unknown{background:#1f2b29;color:var(--text-muted)}.tags,.tile-badges,.evidence-strip{display:flex;flex-wrap:wrap;gap:6px}.tag,.evidence-chip,.pill{border-radius:9999px;background:#1f2b29;border:1px solid var(--border-subtle);padding:4px 9px;color:var(--text-secondary);font-size:12px}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.fact,.summary-cell,.action-card{background:var(--bg-deep);border:1px solid var(--border-subtle);border-radius:10px;padding:12px}.fact span,.summary-cell span,.action-card span{display:block;color:var(--text-muted);font-size:13px}.fact b,.summary-cell b{display:block;color:var(--text-primary);font-size:14px}.action-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.action-card h3{font-size:16px}.action-card p{font-size:14px;color:var(--text-secondary)}.monitor-list,.actions{margin:0;padding-left:18px;color:var(--text-secondary);font-size:14px}.monitor-list li,.actions li{margin:6px 0}details{margin-top:10px;color:var(--text-secondary);font-size:14px}summary{cursor:pointer;color:var(--fresh-green);font-weight:700}.narrative-compact p{font-size:16px;line-height:1.72}.story-row{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}.story-card{flex:0 0 min(360px,86vw);background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:12px;padding:16px}.chart{position:relative;min-height:290px}.empty{display:grid;gap:6px;place-items:center;min-height:130px;color:var(--text-muted);border:1px dashed var(--border-subtle);border-radius:10px;background:rgba(0,0,0,.18);text-align:center;padding:14px}.table-wrap{overflow:auto;max-height:640px;border-radius:10px}.table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}.table th,.table td{padding:11px 10px;border-top:1px solid var(--border-subtle);vertical-align:top;text-align:left}.table th{position:sticky;top:0;background:#111b1a;color:var(--text-secondary);font-size:13px;font-weight:720;z-index:1}.table tbody tr:nth-child(even){background:rgba(255,255,255,.025)}.table tbody tr:hover{background:rgba(45,195,150,.06)}.table td:nth-child(n+4),.table th:nth-child(n+4){text-align:right}.table td:last-child,.table th:last-child{text-align:left}.table tr.top-signal{background:rgba(216,137,23,.09);box-shadow:inset 3px 0 0 var(--semantic-track)}.table tr.priority-signal{background:rgba(255,255,255,.035)}.discussion-title{max-width:300px}.theme-card{grid-column:span 6}.watchlist-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.watchlist-note{border-left:3px solid var(--mint);padding:12px;background:rgba(0,163,159,.08);border-radius:10px;color:var(--text-secondary);font-size:14px}.watchlist-tile{border-top:3px solid var(--fresh-green)}.watchlist-tile.top-watch{border-top-color:var(--semantic-track)}.thesis{font-size:15px}.business-lens{border:1px solid rgba(45,195,150,.4);background:rgba(0,132,133,.12);border-radius:10px;padding:12px;margin-top:10px}.lifecycle-rail{display:flex;gap:10px;overflow-x:auto;padding:12px 2px 14px;scrollbar-width:thin}.rail-stage{position:relative;flex:0 0 118px;display:grid;gap:7px;justify-items:center;color:var(--text-muted);font-size:13px;text-align:center}.rail-stage:before{content:"";position:absolute;top:10px;left:-50%;right:50%;height:3px;background:#2a3533}.rail-stage:first-child:before{display:none}.rail-dot{width:22px;height:22px;border-radius:50%;background:#303b39;border:3px solid #303b39;z-index:1}.rail-stage.completed{color:#dff8ef}.rail-stage.completed:before,.rail-stage.completed .rail-dot{background:var(--semantic-ok);border-color:var(--semantic-ok)}.rail-stage.current{color:#fff;font-weight:760}.rail-stage.current:before{background:linear-gradient(90deg,var(--semantic-ok),var(--semantic-track))}.rail-stage.current .rail-dot{background:var(--semantic-track);border-color:#ffd28a;box-shadow:0 0 0 5px rgba(216,137,23,.18)}.secondary-lifecycle{margin-top:14px}.graph{display:grid;gap:8px}.graph-row{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;background:#0f1918;border:1px solid var(--border-subtle);border-radius:10px;padding:10px}.radar-grid{display:grid;gap:12px}.radar-grid.quadrants-1{grid-template-columns:1fr}.radar-grid.quadrants-2{grid-template-columns:repeat(2,1fr)}.radar-grid.quadrants-3,.radar-grid.quadrants-4{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.radar-quadrant{background:#0f1918;border:1px solid var(--border-subtle);border-radius:10px;padding:14px}.kgld-summary{display:grid;grid-template-columns:1.1fr .9fr;gap:12px}.risk-list{display:grid;gap:10px}.risk-item{border:1px solid var(--border-subtle);border-radius:10px;background:var(--bg-deep);padding:12px}footer{margin-top:36px;text-align:center;color:var(--text-muted);font-size:13px}
    @media(max-width:760px){main{width:min(100% - 20px,1180px);margin-top:12px}h1{font-size:27px}.hero-layout,.kgld-summary{grid-template-columns:1fr}.hero h2{font-size:28px}.hero-actions{justify-content:flex-start}.dashboard-compact,.facts,.action-grid,.watchlist-summary{grid-template-columns:1fr}.half,.third,.theme-card{grid-column:span 12}.section-nav{border-radius:12px}.table-wrap{max-height:none}.table,.table thead,.table tbody,.table tr,.table th,.table td{display:block}.table thead{display:none}.table tr{border:1px solid var(--border-subtle);border-radius:10px;margin:10px 0;padding:8px;background:#101817}.table td{border:0;text-align:left!important;padding:6px 8px}.graph-row{grid-template-columns:1fr}.radar-grid.quadrants-2,.radar-grid.quadrants-3,.radar-grid.quadrants-4{grid-template-columns:1fr}}
    @media print{body{background:#fff;color:#111}main{width:100%;margin:0}.section-nav,.hero-actions,script{display:none!important}.card,.hero,.action-card,.metric-card,.radar-quadrant{background:#fff!important;color:#111!important;border-color:#bbb;box-shadow:none;break-inside:avoid}a{color:#111}.muted,.meta,.monitor-list,.actions{color:#333}.section{margin-top:22px}details{display:block}details>*{display:block}.table th{background:#fff;color:#111}.rail-stage,.rail-stage.current,.rail-stage.completed{color:#111}}
  </style>
</head>
<body><main>
  <header>
    <div class="eyebrow">EIPreporter Weekly</div>
    <h1>${DASHBOARD_TITLE}</h1>
    <p class="meta">Ethereum Developer Intelligence를 라이프사이클, 클라이언트, 릴리스, 활성화, 근거 그래프, 기술 레이더, KGLD 인텔리전스로 확장한 보고서입니다.</p>
    <p class="meta">${formatDateLine(report)}</p>
  </header>
  <nav class="section-nav" aria-label="보고서 섹션">
    <a href="#summary">요약</a><a href="#lifecycle-intelligence">라이프사이클</a><a href="#discussion-heat">논의</a><a href="#adoption-evidence">구현 근거</a><a href="#theme-intelligence">테마</a><a href="#kgld-intelligence">KGLD</a><a href="#details">상세 데이터</a>
  </nav>

  <section class="section grid" id="summary">
    ${executiveHeroSection(report, platform, watchlist, adoptionLayer)}
  </section>

  <section class="section grid" id="platform-dashboard">
    ${platformDashboardSection(platform)}
  </section>

  <section class="section grid" id="data-completeness">
    ${dataCompletenessSection(platform)}
  </section>

  <section class="section grid" id="weekly-technology-narrative">
    ${weeklyNarrativeCard(narrative)}
  </section>

  <section class="section grid" id="recommended-actions">
    <article class="card priority-primary"><h2>권장 액션</h2>${renderActionsRefined(report)}</article>
  </section>

  <section class="section grid" id="discussion-heat">
    <article class="card"><h2>논의 열기</h2><p class="muted">활동성 점수는 확인 가능한 공개 discussion metadata를 사용합니다. 전체 목록은 상세 데이터로 접었습니다.</p><details open><summary>상위 논의 보기</summary>${discussionTable(tech.signalLayer.discussionHeat)}</details></article>
  </section>

  <section class="section grid" id="adoption-evidence">
    <article class="card"><h2>구현·채택 근거</h2><p class="muted">구현/참조 근거는 논의 열기와 분리합니다. 구현 추적은 검증된 구현이나 운영 채택이 아닙니다.</p>${adoptionEvidenceSection(adoptionLayer)}</article>
  </section>

  <section class="section grid" id="momentum-overview">
    ${chartOrFallback("모멘텀 개요", "developerMomentumChart", charts.developerMomentumScores, "Developer Momentum Score 데이터가 없습니다.")}
    ${chartOrFallback("테마 분포", "themeDistribution180dChart", charts.themeDistribution180d, "최근 180일 테마 데이터가 없습니다.")}
  </section>

  <section class="section grid" id="theme-intelligence">
    <article class="card half"><h2>테마 인텔리전스</h2>${themeIntelligenceSection(platform)}</article>
    <article class="card half"><h2>리스크와 신뢰도</h2>${riskConfidenceSection(platform)}</article>
  </section>

  <section class="section grid" id="kgld-intelligence">
    <article class="card"><h2>KGLD 영향 요약</h2>${kgldIntelligenceSection(platform)}</article>
  </section>

  <div id="details"></div>
  <section class="section grid" id="lifecycle-intelligence">
    <article class="card"><h2>라이프사이클 인텔리전스</h2><p class="muted">각 단계는 독립적으로 판단합니다. 구현 추적은 검증된 구현이 아니며, 릴리스는 활성화가 아니고, 활성화는 운영 채택이 아닙니다.</p>${lifecycleTimelineSection(platform)}</article>
  </section>

  <section class="section grid" id="client-coverage-matrix">
    ${visibleSection(platform, "Client Coverage Matrix", () => `<article class="card"><h2>클라이언트 구현 현황</h2><p class="muted">클라이언트 상태는 수집된 출처에서 보수적으로 산정합니다.</p>${clientCoverageMatrixSection(platform)}</article>`, () => clientCoverageSummarySection(platform))}
  </section>

  ${releaseDeploymentHtml}

  <section class="section grid" id="evidence-graph">
    ${visibleSection(platform, "Evidence Graph", () => `<article class="card"><h2>근거 그래프</h2><p class="muted">출처 목록을 노드와 관계로도 표현합니다.</p>${evidenceGraphSection(platform)}</article>`)}
  </section>

  <section class="section grid" id="technology-radar">
    ${visibleSection(platform, "Technology Radar", () => `<article class="card"><h2>기술 레이더</h2>${technologyRadarSection(platform)}</article>`)}
  </section>

  <section class="section" id="top-technology-stories">
    <h2>주요 기술 이슈</h2>
    ${storyRow(narrative.topStories)}
  </section>

  <section class="section grid" id="signal-evidence">
    ${signalEvidenceCard(narrative.signalEvidence)}
  </section>

  <section class="section grid" id="watchlist-next-signals">
    <article class="card"><h2>관찰 목록 / 다음 신호</h2><p class="muted">다음 주 확인할 신호를 Review Signal 기준으로 정리합니다.</p>${watchlistSummary(watchlist)}<p class="watchlist-note">${watchlistConfidenceExplanation(watchlist, report)}</p></article>
    ${watchlistCards(watchlist, adoptionLayer)}
  </section>

  <section class="section grid" id="developer-momentum-map">
    <article class="card"><h2>개발자 모멘텀 상세</h2><p class="muted">모멘텀 점수 기준 상위 8개 테마를 표시합니다.</p>${momentumTable(topThemes)}</article>
  </section>

  <section class="section grid" id="diff-intelligence">
    <article class="card"><h2>커밋 / 변경사항 인텔리전스</h2>${diffTable(tech.signalLayer.diffIntelligence)}</article>
  </section>

  <section class="section grid" id="theme-deep-dive">
    <article class="card"><h2>테마 심층 분석</h2><p class="muted">상위 테마별로 반복되는 기술 접근과 관련 proposal을 정리합니다.</p></article>
    ${topThemes.map(themeCard).join("") || '<article class="card empty">분석 가능한 기술 테마가 없습니다.</article>'}
  </section>

  <section class="section grid" id="standards-progress">
    <article class="card"><h2>표준 진행 현황</h2><p class="muted">${formatDate(report.changePeriod.from)} ~ ${formatDate(report.changePeriod.to)} 기준 변경 이벤트입니다.</p></article>
    ${chartOrFallback("주간 변경", "weeklyEventTypeDistributionChart", charts.weeklyEventTypeDistribution, `최근 ${report.changePeriod.days}일 동안 감지된 변경 데이터가 없습니다.`)}
    <article class="card half">${eventSummary(changes)}</article>
  </section>

  <section class="section grid" id="business-impact">
    <article class="card"><h2>비즈니스 영향</h2>${businessImpactRefined(topThemes, candidates, watchlist, adoptionLayer)}</article>
    <article class="card half"><h3>KGLD 관점</h3><p class="meta">Review ${reviewCount}${SEP}PoC ${pocCount}</p>${candidateTable(candidates.slice(0, 8))}</article>
  </section>

  <footer>한계: discussion 활동은 확인 가능한 공개 metadata에서 수집하며, 내러티브 주장은 보고서 근거 범위로 제한합니다.</footer>
</main>
<!-- EIPreporter chart data: ${chartJson} -->
<script type="application/json" id="technology-platform-api">${platformApiJson}</script>
<script>
  const reportCharts=${chartJson};
  const palette=["#3182f6","#f5445a","#16a085","#c58bff","#f2b84b","#58c4dc","#8fa3bf","#d6e0ef"];
  const axis={ticks:{color:"rgba(242,242,255,.62)",precision:0},grid:{color:"rgba(214,224,239,.09)"}};
  const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:"rgba(242,242,255,.62)"}}}};
  function drawSeries(id,series,type="bar",horizontal=false,label="count"){
    const canvas=document.getElementById(id);
    if(!canvas||!series||!series.labels?.length||!series.data?.some((value)=>value>0)||typeof Chart==="undefined")return;
    new Chart(canvas,{type,data:{labels:series.labels,datasets:[{label,data:series.data,backgroundColor:palette}]},options:{...base,indexAxis:horizontal?"y":"x",scales:type==="doughnut"?{}:{x:{...axis,beginAtZero:true},y:{...axis,beginAtZero:true}}}});
  }
  ${hasChartData(charts.developerMomentumScores) ? 'drawSeries("developerMomentumChart",reportCharts.developerMomentumScores,"bar",true,"Momentum Score");' : ""}
  ${hasChartData(charts.themeDistribution180d) ? 'drawSeries("themeDistribution180dChart",reportCharts.themeDistribution180d,"bar",true,"Proposal Count");' : ""}
  ${hasChartData(charts.weeklyEventTypeDistribution) ? 'drawSeries("weeklyEventTypeDistributionChart",reportCharts.weeklyEventTypeDistribution,"doughnut",false,"Event Count");' : ""}
</script></body></html>`;
}

function metricCard(label: string, value: number): string {
  return `<article class="card metric"><span class="muted">${escapeHtml(label)}</span><strong>${value}</strong></article>`;
}

function chartOrFallback(title: string, id: string, series: ChartSeries, message: string): string {
  return hasChartData(series)
    ? `<article class="card half"><h3>${escapeHtml(title)}</h3><div class="chart"><canvas id="${id}"></canvas></div></article>`
    : `<article class="card half"><h3>${escapeHtml(title)}</h3><div class="empty">${escapeHtml(message)}</div></article>`;
}

function executiveHeroSection(
  report: WeeklyRadarReport,
  platform: TechnologyPlatformLayer,
  watchlist: WatchlistLayer,
  adoptionLayer: AdoptionLayer,
): string {
  const top = watchlist.items[0];
  const primaryId = top?.relatedProposals[0] ?? platform.lifecycleTimelines[0]?.proposalId ?? "없음";
  const lifecycle = platform.lifecycleTimelines.find((item) => item.proposalId === primaryId) ?? platform.lifecycleTimelines[0];
  const adoption = adoptionEvidenceForProposal(adoptionLayer, top?.relatedProposals ?? [primaryId]);
  const discussion = report.ethereumTechRadar.signalLayer.discussionHeat.find((item) => item.proposalId === primaryId)
    ?? report.ethereumTechRadar.signalLayer.discussionHeat[0];
  const confidence = platform.confidence.find((item) => item.proposalId === primaryId)?.overall ?? top?.confidenceScore ?? 0;
  const kgld = platform.kgldIntelligence.find((item) => item.proposalId === primaryId);
  const risk = platform.risks.find((item) => item.proposalId === primaryId);
  const implementationText = adoption?.sources.some((source) => source.semanticType === "implementation_tracker")
    ? "구현 추적 근거 있음, 검증된 클라이언트 구현 없음"
    : adoption?.evidenceLevel === "Implementation"
      ? "구현 후보 근거 있음"
      : "검증된 클라이언트 구현 없음";
  const summary = [
    top?.possibleNextMovement ? shortKoreanSummary(localizeGeneratedText(top.possibleNextMovement), 170) : `${primaryId}을 이번 주 핵심 신호로 관찰합니다.`,
    "구현 추적은 검증된 구현, 릴리스, 활성화, 운영 채택으로 추론하지 않습니다.",
  ].join(" ");
  const nextSignal = top?.monitorNext[0] ? localizeMonitorText(top.monitorNext[0]) : "문안 diff 또는 client PR";
  return `<article class="card hero priority-primary"><div class="hero-layout"><div><div class="eyebrow">이번 주 핵심 신호</div><h2>${escapeHtml(primaryId)}${top?.title ? `${SEP}${escapeHtml(titleForHero(top.title, primaryId))}` : ""}</h2><p class="hero-summary">${escapeHtml(summary)}</p><div class="status-strip" aria-label="핵심 상태"><span class="status-chip">${dot("tracking")}상태 <b>${escapeHtml(formatLifecycleStage(lifecycle?.currentStage ?? "Unknown"))}</b></span><span class="status-chip">${dot("info")}논의 <b>댓글 ${discussion?.discussionReplyCount ?? 0}개${SEP}참여자 ${discussion?.discussionParticipantCount ?? 0}명</b></span><span class="status-chip">${dot(adoption?.evidenceLevel === "Implementation" ? "ok" : "none")}구현 <b>${escapeHtml(implementationText)}</b></span><span class="status-chip">${dot("info")}KGLD <b>${escapeHtml(formatBusinessImpactLevel(kgld?.overall ?? "Monitor"))}</b></span><span class="status-chip">${dot(risk?.risk === "High" ? "risk" : "info")}신뢰도 <b>${confidence}/100</b></span></div><p class="meta" style="margin-top:12px"><b>다음 신호:</b> ${escapeHtml(nextSignal)}</p></div><div class="hero-actions"><a class="button primary" href="#adoption-evidence">근거 보기</a><a class="button" href="#watchlist-next-signals">다음 관찰 항목</a></div></div></article>`;
}

function titleForHero(title: string, primaryId: string): string {
  return title.replace(new RegExp(`^${primaryId}\\s*[:\\-]?\\s*`, "i"), "").replace(/follow-through|cluster refinement/gi, "").trim() || title;
}

function dot(kind: "tracking" | "ok" | "none" | "risk" | "info"): string {
  return `<span class="dot ${kind === "info" ? "" : kind}" aria-hidden="true"></span>`;
}

function statusBadge(label: string, kind: "lifecycle-current" | "future" | "risk-high" | "risk-medium" | "verified" | "no-evidence" = "future"): string {
  return `<span class="badge ${kind}">${escapeHtml(label)}</span>`;
}

function shortKoreanSummary(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1).trim()}…` : value;
}

function weeklyNarrativeCard(narrative: NarrativeLayer): string {
  const visible = narrative.weeklyNarrative.slice(0, 4).map((line) => localizeGeneratedText(line));
  const compact = shortKoreanSummary(visible.join(" "), 500);
  const extended = narrative.weeklyNarrative.map((line) => `<p>${escapeHtml(localizeGeneratedText(line))}</p>`).join("");
  return `<article class="card narrative-compact"><div class="eyebrow">주간 기술 내러티브${SEP}${escapeHtml(formatGeneratedBy(narrative.generatedBy))}</div><h2>의미와 해석</h2><p>${escapeHtml(compact)}</p>${narrative.weeklyNarrative.length > 1 ? `<details><summary>전체 해설 보기</summary>${extended}</details>` : ""}</article>`;
}

function storyRow(stories: TechnologyStory[]): string {
  if (!stories.length) return '<div class="empty"><b>생성된 기술 이슈가 없습니다</b><span>추가 momentum 또는 discussion evidence가 필요합니다.</span></div>';
  return `<div class="story-row">${stories.map(storyCard).join("")}</div>`;
}

function storyCard(story: TechnologyStory): string {
  const proposals = story.relatedProposals.length
    ? story.relatedProposals.map((proposalId) => `<span class="tag">${escapeHtml(proposalId)}</span>`).join("")
    : '<span class="tag">proposal 근거 없음</span>';
  return `<article class="story-card"><div class="eyebrow">${escapeHtml(story.primaryTheme)}</div><h3>${escapeHtml(story.storyTitle)}</h3><div class="tags">${proposals}</div><p>${escapeHtml(localizeGeneratedText(story.interpretation))}</p><p class="meta">${escapeHtml(localizeGeneratedText(story.watchNext))}</p><ul>${story.evidence.map((item) => `<li>${escapeHtml(localizeEvidenceText(item))}</li>`).join("")}</ul></article>`;
}

function signalEvidenceCard(evidence: NarrativeEvidence): string {
  const topDiscussion = evidence.topDiscussions[0];
  const topTheme = evidence.topMomentumThemes[0];
  const highCount = evidence.topDiscussions.filter((item) => item.activityLevel === "High").length;
  return `<article class="card"><h2>신호 근거</h2><div class="evidence-grid"><div class="evidence-item"><span>최상위 논의</span><b>${escapeHtml(topDiscussion?.proposalId ?? "없음")}</b><span>${escapeHtml(topDiscussion ? `댓글 ${topDiscussion.replies ?? 0}개${SEP}참여자 ${topDiscussion.participants ?? 0}명` : "논의 열기 없음")}</span></div><div class="evidence-item"><span>최상위 모멘텀 테마</span><b>${escapeHtml(topTheme?.theme ?? "없음")}</b><span>${topTheme?.score ?? 0}/100</span></div><div class="evidence-item"><span>최근 변경</span><b>${evidence.recentChangeCount}</b><span>문안 변경 ${evidence.contentDiffCount}건</span></div><div class="evidence-item"><span>관련 proposal 수</span><b>${evidence.topMomentumThemes.length}</b><span>상위 모멘텀 테마</span></div><div class="evidence-item"><span>높은 활동성 논의</span><b>${highCount}</b><span>상위 근거 항목 기준</span></div></div><p class="muted">${escapeHtml(evidenceExplanation(evidence))}</p>${evidenceDetails(evidence)}</article>`;
}

function getWatchlistLayer(report: WeeklyRadarReport): WatchlistLayer {
  return report.ethereumTechRadar.watchlistLayer ?? buildWatchlistLayer(report);
}

function getAdoptionLayer(report: WeeklyRadarReport): AdoptionLayer {
  return report.ethereumTechRadar.adoptionLayer ?? buildAdoptionLayer(report);
}

function getTechnologyPlatformLayer(report: WeeklyRadarReport): TechnologyPlatformLayer {
  return report.ethereumTechRadar.technologyPlatformLayer ?? buildTechnologyPlatformLayer(report);
}

function visibleSection(platform: TechnologyPlatformLayer, section: string, render: () => string, collapsed?: () => string): string {
  const decision = platform.sectionVisibility.find((item) => item.section === section);
  if (!decision || decision.visible) return render();
  return collapsed ? collapsed() : "";
}

function dataCompletenessSection(platform: TechnologyPlatformLayer): string {
  const data = platform.dataCompleteness;
  return `<article class="card"><h2>데이터 수집 완전성</h2><p>${escapeHtml(localizeDataCompletenessExplanation(data.explanation))}</p><div class="facts"><div class="fact"><span>상태</span><b>${escapeHtml(formatDataCompletenessStatus(data.status))}</b></div><div class="fact"><span>출처</span><b>${data.sourcesSucceeded}/${data.requiredSourcesAttempted}</b></div><div class="fact"><span>실패</span><b>${data.sourcesFailed}</b></div><div class="fact"><span>캐시 사용</span><b>${data.cacheHits}</b></div></div><details><summary>수집 세부 정보</summary><ul class="monitor-list"><li>누락 필드: ${escapeHtml(data.missingFields.join(", ") || "없음")}</li><li>건너뛴 보강: ${escapeHtml(data.enrichmentSkipped.join(", ") || "없음")}</li><li>Rate limit 저하: ${data.rateLimitDegradation ? "있음" : "없음"}</li></ul></details></article>`;
}

function platformDashboardSection(platform: TechnologyPlatformLayer): string {
  const dashboard = platform.dashboard;
  const topId = dashboard.topMovers[0] ?? platform.lifecycleTimelines[0]?.proposalId ?? "없음";
  const lifecycle = dashboard.lifecycleProgress.find((item) => item.proposalId === topId) ?? dashboard.lifecycleProgress[0];
  const implementation = dashboard.implementationProgress.find((item) => item.proposalId === topId) ?? dashboard.implementationProgress[0];
  const discussion = platform.confidence.find((item) => item.proposalId === topId);
  const kgld = dashboard.kgldWatch.find((item) => item.proposalId === topId) ?? dashboard.businessImpact.find((item) => item.proposalId === topId);
  const hiddenLists = [
    ["주요 변동 항목", dashboard.topMovers.join(", ") || "없음"],
    ["부상 중인 테마", dashboard.emergingThemes.slice(0, 6).join(", ") || "없음"],
    ["기술 레이더", dashboard.technologyRadar.map((item) => `${item.proposalId}: ${formatRadarQuadrant(item.quadrant)}`).slice(0, 8).join(SEP) || "없음"],
  ];
  const cards = [
    ["최우선 신호", topId, "이번 주 가장 먼저 확인할 항목"],
    ["현재 단계", formatLifecycleStage(lifecycle?.currentStage ?? "Unknown"), lifecycle ? `${lifecycle.proposalId} 기준` : "라이프사이클 근거 없음"],
    ["논의 열기", discussion ? `신뢰도 ${discussion.overall}/100` : "확인 중", "discussion metadata 기반"],
    ["구현 상태", implementation ? `검증된 구현 ${implementation.verifiedClients}건` : "검증된 구현 없음", "클라이언트 구현은 별도 검증 필요"],
    ["KGLD 영향", formatBusinessImpactLevel(kgld?.overall ?? "Monitor"), "직접 적용보다 관찰 우선"],
  ];
  return `<article class="card"><h2>플랫폼 대시보드</h2><div class="dashboard-compact">${cards.map(([label, value, note]) =>
    `<div class="metric-card"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><p>${escapeHtml(note)}</p></div>`
  ).join("")}</div><details><summary>보조 항목 더 보기</summary><ul class="monitor-list">${hiddenLists.map(([label, value]) => `<li><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</li>`).join("")}</ul></details></article>`;
}

function lifecycleTimelineSection(platform: TechnologyPlatformLayer): string {
  if (!platform.lifecycleTimelines.length) return '<div class="empty"><b>라이프사이클 타임라인이 없습니다</b><span>Watchlist 또는 proposal 근거가 필요합니다.</span></div>';
  const [primary, ...secondary] = platform.lifecycleTimelines;
  const current = primary.stages.find((stage) => stage.name === primary.currentStage);
  const rail = `<div class="lifecycle-rail" role="list" aria-label="${escapeHtml(primary.proposalId)} 라이프사이클">${primary.stages.map((stage) =>
    `<div class="rail-stage ${escapeHtml(stage.state)}" role="listitem"><span class="rail-dot" aria-hidden="true"></span><span>${escapeHtml(formatLifecycleStage(stage.name))}</span></div>`
  ).join("")}</div>`;
  const secondaryRows = secondary.slice(0, 8).map((timeline) =>
    `<div class="compact-row"><span><b>${escapeHtml(timeline.proposalId)}</b>${SEP}${escapeHtml(timeline.title)}</span>${statusBadge(formatLifecycleStage(timeline.currentStage), "future")}</div>`
  ).join("");
  return `<article class="action-card priority-primary"><h3>${escapeHtml(primary.proposalId)} 라이프사이클 타임라인</h3><p class="meta">${escapeHtml(primary.title)}${SEP}현재 단계: ${escapeHtml(formatLifecycleStage(primary.currentStage))}</p>${rail}<p class="meta">${escapeHtml(formatLimitation(current?.limitations[0] ?? "No limitation text available."))} ${freshnessLabel(current?.freshness)}</p><details><summary>신뢰도와 근거 보기</summary>${scoreDetails("라이프사이클 신뢰도", current?.scoreBreakdown ?? [])}</details></article>${secondaryRows ? `<details class="secondary-lifecycle"><summary>보조 EIP 라이프사이클 보기</summary><div class="compact-list">${secondaryRows}</div></details>` : ""}`;
}

function releaseDeploymentIntelligenceSection(platform: TechnologyPlatformLayer): string {
  const release = visibleSection(platform, "Release Watch", () => `<article class="card half"><h2>릴리스 관찰</h2>${releaseWatchSection(platform)}</article>`);
  const activation = visibleSection(platform, "Activation Watch", () => `<article class="card half"><h2>활성화 관찰</h2>${activationWatchSection(platform)}</article>`);
  return release || activation ? `<section class="section grid" id="release-deployment-intelligence">${release}${activation}</section>` : "";
}

function clientCoverageSummarySection(platform: TechnologyPlatformLayer): string {
  const proposal = platform.clientMatrices[0]?.proposalId ?? "tracked proposal";
  return `<article class="card"><h2>클라이언트 구현 현황</h2><p>모니터링 대상 클라이언트에서 ${escapeHtml(proposal)}에 대한 target-specific 구현 근거가 확인되지 않았습니다.</p><p class="meta">빈 전체 matrix는 부정 근거로 오해되지 않도록 접었습니다.</p></article>`;
}

function clientCoverageMatrixSection(platform: TechnologyPlatformLayer): string {
  const matrix = platform.clientMatrices[0];
  if (!matrix) return '<div class="empty"><b>클라이언트 matrix가 없습니다</b><span>추적 중인 proposal이 없습니다.</span></div>';
  const statuses = ["Tracking", "Candidate", "Verified", "Released", "Activated"];
  const visibleClients = matrix.clients.filter((cell) => cell.status !== "No evidence");
  return `<h3>${escapeHtml(matrix.proposalId)}</h3><table class="table"><thead><tr><th>클라이언트</th><th>계열</th>${statuses.map((status) => `<th class="matrix-cell">${escapeHtml(formatClientStatus(status))}</th>`).join("")}<th>근거</th></tr></thead><tbody>${visibleClients.map((cell) =>
    `<tr><td><b>${escapeHtml(cell.client)}</b></td><td>${escapeHtml(cell.family)}</td>${statuses.map((status) => `<td class="matrix-cell">${cell.status === status ? "✓" : ""}</td>`).join("")}<td class="muted">${escapeHtml(scoreTitle(cell.scoreBreakdown))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function releaseWatchSection(platform: TechnologyPlatformLayer): string {
  const items = platform.releaseIntelligence.filter((item) => item.status !== "No release").slice(0, 8);
  return `<table class="table"><thead><tr><th>Proposal</th><th>상태</th><th>신뢰도</th><th>근거</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td>${escapeHtml(item.proposalId)}</td><td>${escapeHtml(formatReleaseStatus(item.status))}</td><td title="${escapeHtml(scoreTitle(item.scoreBreakdown))}">${item.confidence}</td><td>${scoreDetails("점수 산식", item.scoreBreakdown)}</td></tr>`
  ).join("")}</tbody></table>`;
}

function activationWatchSection(platform: TechnologyPlatformLayer): string {
  const items = platform.deploymentIntelligence.filter((item) => item.status !== "No evidence").slice(0, 8);
  return `<table class="table"><thead><tr><th>Proposal</th><th>상태</th><th>신뢰도</th><th>근거</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td>${escapeHtml(item.proposalId)}</td><td>${escapeHtml(formatDeploymentStatus(item.status))}</td><td title="${escapeHtml(scoreTitle(item.scoreBreakdown))}">${item.confidence}</td><td>${scoreDetails("점수 산식", item.scoreBreakdown)}</td></tr>`
  ).join("")}</tbody></table>`;
}

function evidenceGraphSection(platform: TechnologyPlatformLayer): string {
  const graph = platform.evidenceGraphs.find((item) => item.edges.length > 0);
  if (!graph) return "";
  const nodeLabel = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;
  const edges = graph.edges.filter((edge) => edge.from !== edge.to).slice(0, 10).map((edge) =>
    `<div class="graph-row"><span>${escapeHtml(nodeLabel(edge.from))}</span><span class="pill">${escapeHtml(formatGraphEdge(edge.type))}</span><span>${escapeHtml(nodeLabel(edge.to))}</span></div>`
  ).join("");
  return `<h3>${escapeHtml(graph.proposalId)}</h3><div class="graph">${edges}</div>`;
}

function technologyRadarSection(platform: TechnologyPlatformLayer): string {
  const quadrants = ["Watch", "Trial", "Adopt", "Hold"];
  const populated = quadrants.map((quadrant) => ({
    quadrant,
    items: platform.technologyRadar.filter((item) => item.quadrant === quadrant && item.traceability.evidenceIds.length > 0),
  })).filter((group) => group.items.length > 0);
  return `<div class="radar-grid quadrants-${Math.min(4, populated.length)}">${populated.map(({ quadrant, items }) => {
    const visible = items.slice(0, 5);
    const hidden = items.slice(5);
    if (!items.length) return "";
    return `<div class="radar-quadrant"><h3>${escapeHtml(formatRadarQuadrant(quadrant))}</h3><ul class="monitor-list">${visible.map((item) => `<li><b>${escapeHtml(item.proposalId)}</b> ${escapeHtml(item.title)}<br><span class="muted">${escapeHtml(localizeGeneratedText(item.why))}</span>${scoreDetails("레이더 근거", item.scoreBreakdown)}</li>`).join("")}</ul>${hidden.length ? `<details><summary>나머지 ${hidden.length}건 보기</summary><ul class="monitor-list">${hidden.map((item) => `<li><b>${escapeHtml(item.proposalId)}</b> ${escapeHtml(item.title)}</li>`).join("")}</ul></details>` : ""}</div>`;
  }).join("")}</div>`;
}

function themeIntelligenceSection(platform: TechnologyPlatformLayer): string {
  if (!platform.themeIntelligence.length) return '<p class="muted">테마 인텔리전스가 없습니다.</p>';
  return `<div class="compact-list">${platform.themeIntelligence.slice(0, 6).map((item) =>
    `<div class="compact-row"><span><b>${escapeHtml(item.theme)}</b><br><span class="muted">${escapeHtml(localizeGeneratedText(item.why))}</span></span><span>${statusBadge(formatRiskLevel(item.risk), item.risk === "High" ? "risk-high" : item.risk === "Medium" ? "risk-medium" : "future")}</span></div>`
  ).join("")}</div><details><summary>테마 점수 세부 보기</summary><table class="table"><thead><tr><th>테마</th><th>건강도</th><th>모멘텀</th><th>라이프사이클</th><th>채택</th><th>준비도</th></tr></thead><tbody>${platform.themeIntelligence.slice(0, 8).map((item) =>
    `<tr><td><b>${escapeHtml(item.theme)}</b></td><td>${item.health}</td><td>${item.momentum}</td><td>${escapeHtml(localizeGeneratedText(item.lifecycle))}</td><td>${escapeHtml(localizeGeneratedText(item.adoption))}</td><td>${escapeHtml(formatRadarQuadrant(item.readiness))}</td></tr>`
  ).join("")}</tbody></table></details>`;
}

function riskConfidenceSection(platform: TechnologyPlatformLayer): string {
  const risks = platform.risks.slice(0, 5).map((risk) =>
    `<div class="risk-item ${risk.risk === "High" ? "priority-critical" : "priority-secondary"}"><b>${escapeHtml(risk.proposalId)}</b> ${statusBadge(formatRiskLevel(risk.risk), risk.risk === "High" ? "risk-high" : risk.risk === "Medium" ? "risk-medium" : "future")}<br><span class="muted">${escapeHtml(formatRiskType(risk.type))}${SEP}${escapeHtml(localizeGeneratedText(risk.why))}</span>${scoreDetails("리스크 근거", risk.scoreBreakdown)}</div>`
  ).join("");
  const confidence = platform.confidence.slice(0, 4).map((item) =>
    `<li><b>${escapeHtml(item.proposalId)}</b> 신뢰도 ${item.overall}<br><span class="muted">데이터 ${item.dataCompleteness}${SEP}품질 ${item.evidenceQuality}${SEP}다양성 ${item.sourceDiversity}${SEP}검증 ${item.verificationStatus}${SEP}오탐 위험 ${item.falsePositiveRisk}</span>${scoreDetails("신뢰도 산식", item.scoreBreakdown)}</li>`
  ).join("");
  return `<h3>주요 리스크</h3><div class="risk-list">${risks || '<p class="muted">높은 리스크의 라이프사이클 공백은 감지되지 않았습니다.</p>'}</div><details><summary>신뢰도 산식 보기</summary><ul class="monitor-list">${confidence || '<li>신뢰도 데이터가 없습니다.</li>'}</ul></details>`;
}

function kgldIntelligenceSection(platform: TechnologyPlatformLayer): string {
  if (!platform.kgldIntelligence.length) return '<p class="muted">KGLD 영향 분석 데이터가 없습니다.</p>';
  const meaningful = platform.kgldIntelligence.filter((item) =>
    item.overall !== "None" && (item.overall !== "Monitor" || item.areas.some((area) => area.level !== "None"))
  );
  const primary = meaningful[0] ?? platform.kgldIntelligence[0]!;
  const secondary = meaningful.filter((item) => item.proposalId !== primary.proposalId).slice(0, 3);
  const primaryAreas = primary.areas.filter((area) => area.level !== "None").slice(0, 3);
  const areaText = primaryAreas.length ? primaryAreas.map((area) => `${formatKgldArea(area.area)}: ${formatBusinessImpactLevel(area.level)}`).join(", ") : "결제, 실행 경계";
  const why = primaryAreas[0]?.why ?? "구현 추적 단계이며 직접 적용 근거는 없습니다.";
  return `<div class="kgld-summary"><div class="action-card priority-primary"><h3>Primary: ${escapeHtml(primary.proposalId)}</h3><p><b>영향 영역:</b> ${escapeHtml(areaText)}</p><p><b>수준:</b> ${escapeHtml(formatBusinessImpactLevel(primary.overall))}</p><p><b>이유:</b> ${escapeHtml(localizeGeneratedText(why))}</p>${scoreDetails("KGLD 근거", primary.scoreBreakdown)}</div><div class="action-card"><h3>Secondary</h3>${secondary.length ? `<ul class="monitor-list">${secondary.map((item) => `<li><b>${escapeHtml(item.proposalId)}</b>${SEP}${escapeHtml(formatBusinessImpactLevel(item.overall))}</li>`).join("")}</ul>` : '<p class="muted">추가로 강조할 KGLD 항목은 없습니다.</p>'}</div></div>${platform.kgldIntelligence.length > secondary.length + 1 ? `<details><summary>관련 항목 더 보기</summary><table class="table"><thead><tr><th>Proposal</th><th>종합</th><th>주요 영향 영역</th><th>이유</th></tr></thead><tbody>${platform.kgldIntelligence.slice(0, 10).map((item) => {
    const active = item.areas.filter((area) => area.level !== "None").slice(0, 3);
    const areas = active.length ? active.map((area) => `${formatKgldArea(area.area)}: ${formatBusinessImpactLevel(area.level)}`).join(", ") : "직접적인 KGLD 영향 근거 없음";
    const why = active[0]?.why ?? "직접적인 비즈니스 workflow 근거가 확인되지 않았습니다.";
    return `<tr><td><b>${escapeHtml(item.proposalId)}</b><br><span class="muted">${escapeHtml(item.title)}</span></td><td>${escapeHtml(formatBusinessImpactLevel(item.overall))}</td><td>${escapeHtml(areas)}</td><td>${escapeHtml(localizeGeneratedText(why))}${scoreDetails("KGLD 근거", item.scoreBreakdown)}</td></tr>`;
  }).join("")}</tbody></table></details>` : ""}`;
}

function scoreDetails(summary: string, items: Array<{ label: string; value: number; reason: string }>): string {
  if (!items.length) return "";
  return `<details><summary>${escapeHtml(summary)}</summary><ul class="monitor-list">${items.map((item) => `<li>${escapeHtml(formatScoreLabel(item.label))}: ${item.value >= 0 ? "+" : ""}${item.value} - ${escapeHtml(localizeGeneratedText(item.reason))}</li>`).join("")}</ul></details>`;
}

function scoreTitle(items: Array<{ label: string; value: number; reason: string }>): string {
  return items.map((item) => `${formatScoreLabel(item.label)} ${item.value >= 0 ? "+" : ""}${item.value}: ${localizeGeneratedText(item.reason)}`).join(SEP);
}

function freshnessLabel(freshness: { ageDays?: number; stale: boolean } | undefined): string {
  if (!freshness || freshness.ageDays === undefined) return "";
  if (freshness.stale) return `근거가 오래되었을 수 있습니다. 마지막 출처 업데이트는 ${freshness.ageDays}일 전입니다.`;
  return `${freshness.ageDays}일 전 업데이트`;
}

function watchlistSummary(watchlist: WatchlistLayer): string {
  const top = watchlist.items[0];
  const highest = watchlist.items.reduce<WatchlistItem | undefined>(
    (best, item) => !best || item.confidenceScore > best.confidenceScore ? item : best,
    undefined,
  );
  const mainMode = watchlistSpecChangeLabel(watchlist) === "0 content diffs" ? "discussion/momentum-driven" : "diff/status-driven";
  return `<div class="watchlist-summary"><div class="summary-cell"><span>최우선 관찰 신호</span><b>${escapeHtml(top?.title ?? "없음")}</b></div><div class="summary-cell"><span>최고 신뢰도</span><b>${highest ? `${escapeHtml(formatConfidenceLabel(highest.confidence))} ${highest.confidenceScore}/100` : "없음"}</b></div><div class="summary-cell"><span>관찰 항목 수</span><b>${watchlist.items.length}</b></div><div class="summary-cell"><span>명세 변경 신호</span><b>${formatSpecChangeLabel(watchlistSpecChangeLabel(watchlist))}</b></div><div class="summary-cell"><span>주요 모드</span><b>${escapeHtml(formatSignalMode(mainMode))}</b></div></div>`;
}

function watchlistSpecChangeLabel(watchlist: WatchlistLayer): string {
  const zeroDiff = watchlist.items.some((item) => item.evidence.some((evidence) => /No content diff detected/i.test(evidence)));
  return zeroDiff ? "0 content diffs" : "content diffs present";
}

function watchlistConfidenceExplanation(watchlist: WatchlistLayer, report: WeeklyRadarReport): string {
  const zeroDiff = report.ethereumTechRadar.signalLayer.diffIntelligence.length === 0
    || watchlist.items.some((item) => item.evidence.some((evidence) => /No content diff detected/i.test(evidence)));
  if (zeroDiff) return "discussion 활동이 강하지만 content diff나 status movement가 없으면 신뢰도는 상한을 둡니다.";
  return "신뢰도는 report evidence인 discussion activity, theme momentum, proposal clustering, content diff, status movement만 사용합니다.";
}

function watchlistCards(watchlist: WatchlistLayer, adoptionLayer: AdoptionLayer): string {
  if (!watchlist.items.length) {
    return '<article class="card empty"><b>관찰 신호가 생성되지 않았습니다</b><span>추가 discussion, cluster, diff, status evidence가 필요합니다.</span></article>';
  }
  return watchlist.items.map((item, index) => watchlistTileCard(item, index, adoptionLayer)).join("");
}

function watchlistCard(item: WatchlistItem, index: number): string {
  const proposals = item.relatedProposals.length
    ? item.relatedProposals.map((proposalId) => `<span class="tag">${escapeHtml(proposalId)}</span>`).join("")
    : '<span class="tag">관련 proposal 없음</span>';
  return `<article class="card third watchlist-card"><div class="card-head"><div><div class="eyebrow">Review Signal${SEP}${escapeHtml(signalTypeLabel(item.signalType))}</div><h3>${escapeHtml(item.title)}</h3></div>${confidenceBadge(item)}</div><p class="meta">${escapeHtml(item.theme)}</p><p>${escapeHtml(localizeGeneratedText(item.possibleNextMovement))}</p><div class="tags">${proposals}</div><h3>근거</h3><ul class="actions">${item.evidence.map((evidence) => `<li>${escapeHtml(localizeEvidenceText(evidence))}</li>`).join("")}</ul><h3>다음 확인 항목</h3><ul class="actions">${item.monitorNext.map((next) => `<li>${escapeHtml(localizeMonitorText(next))}</li>`).join("")}</ul>${item.businessRelevance ? `<p class="meta"><b>${escapeHtml(item.businessRelevance.area)}</b>: ${escapeHtml(localizeGeneratedText(item.businessRelevance.note))}</p>` : ""}</article>`;
}

function confidenceBadge(item: WatchlistItem): string {
  const className = item.confidence === "High" ? "high" : item.confidence === "Medium" ? "medium" : "low";
  return `<span class="score ${className}">신뢰도 ${escapeHtml(formatConfidenceLabel(item.confidence))} ${item.confidenceScore}/100</span>`;
}

function watchlistTileCard(item: WatchlistItem, index: number, adoptionLayer: AdoptionLayer): string {
  const proposals = item.relatedProposals.length
    ? item.relatedProposals.map((proposalId) => `<span class="tag">${escapeHtml(proposalId)}</span>`).join("")
    : '<span class="tag">관련 proposal 없음</span>';
  const className = index === 0 ? "card third watchlist-card watchlist-tile top-watch" : "card third watchlist-card watchlist-tile";
  const adoptionEvidence = adoptionEvidenceForProposal(adoptionLayer, item.relatedProposals);
  const adoptionChip = adoptionTileChip(adoptionEvidence);
  return `<article class="${className}"><div class="tile-header"><div class="card-head"><div><div class="eyebrow">Review Signal</div><h3>${escapeHtml(item.title)}</h3></div>${confidenceBadge(item)}</div><div class="tile-badges"><span class="tag">${escapeHtml(item.theme)}</span><span class="tag">${escapeHtml(signalTypeLabel(item.signalType))}</span>${adoptionChip ? `<span class="tag">${escapeHtml(adoptionChip)}</span>` : ""}</div></div><p class="thesis">${escapeHtml(localizeGeneratedText(shortThesis(item.possibleNextMovement)))}</p><div class="evidence-strip" aria-label="근거">${evidenceChips(item).map((chip) => `<span class="evidence-chip">${escapeHtml(chip)}</span>`).join("")}</div><p class="meta"><b>채택 근거:</b> ${escapeHtml(formatEvidenceLevel(adoptionEvidence?.evidenceLevel))}</p><div class="tags">${proposals}</div><h3>다음 확인 항목</h3><ul class="monitor-list">${item.monitorNext.slice(0, 3).map((next) => `<li>${escapeHtml(localizeMonitorText(next))}</li>`).join("")}</ul><div class="baseline">${baselineLabel(item)}</div>${item.businessRelevance ? `<div class="business-lens"><div class="eyebrow">비즈니스 관점</div><p class="meta"><b>${escapeHtml(item.businessRelevance.area)}</b>: ${escapeHtml(localizeGeneratedText(item.businessRelevance.note))}</p></div>` : ""}</article>`;
}

function adoptionTileChip(item: AdoptionEvidenceItem | undefined): string | null {
  if (item?.evidenceLevel === "Implementation") return "구현 근거";
  if (item?.evidenceLevel === "Reference") return "외부 참조";
  return null;
}

function shortThesis(value: string): string {
  const sentence = value.split(/(?<=\.)\s+/)[0] ?? value;
  return sentence.length > 150 ? `${sentence.slice(0, 147).trim()}...` : sentence;
}

function signalTypeLabel(value: WatchlistItem["signalType"]): string {
  return value.replaceAll("_", " ");
}

function evidenceChips(item: WatchlistItem): string[] {
  const chips: string[] = [];
  const discussion = item.evidence.find((evidence) => /replies,\s+\d+\s+participants/i.test(evidence));
  const discussionMatch = discussion?.match(/(\d+)\s+replies,\s+(\d+)\s+participants/i);
  if (discussionMatch) chips.push(`댓글 ${discussionMatch[1]}개`, `참여자 ${discussionMatch[2]}명`);
  if (item.relatedProposals.length) chips.push(`관련 proposal ${item.relatedProposals.length}건`);
  if (item.evidence.some((evidence) => /No content diff detected/i.test(evidence))) chips.push("이번 주 diff 0건");
  const lastActive = item.evidence.find((evidence) => /Last active/i.test(evidence))?.replace(/^Last active\s+/i, "");
  if (lastActive && chips.length < 4) chips.push(`마지막 활동 ${lastActive}`);
  if (chips.length < 3) {
    for (const evidence of item.evidence) {
      if (chips.length >= 4) break;
      const localized = localizeEvidenceText(evidence);
      if (!chips.includes(localized)) chips.push(localized);
    }
  }
  return chips.slice(0, 4);
}

function baselineLabel(item: WatchlistItem): string {
  if (item.previousConfidenceScore === undefined && item.previousActivityScore === undefined) {
    return '<span class="pill">이전 기준값 없음</span>';
  }
  return `<span class="pill">${escapeHtml(formatChangeLabel(item.changeSinceLastReport ?? "Unknown"))}${SEP}지난 보고서 대비</span>`;
}

function adoptionEvidenceSection(layer: AdoptionLayer): string {
  if (layer.collectionStatus === "skipped") {
    return `<div class="empty"><b>${escapeHtml(localizeGeneratedText(layer.note ?? githubSkippedMessage()))}</b><span>현재 watchlist 신호는 discussion/momentum 기반으로 유지됩니다.</span></div>${adoptionEvidenceCards(layer.items)}`;
  }
  if (layer.collectionStatus === "failed") {
    return `<div class="empty"><b>${escapeHtml(localizeGeneratedText(layer.note ?? "GitHub evidence collection could not be completed for this run."))}</b><span>외부 근거 주장 없이 보고서 생성을 계속했습니다.</span></div>${adoptionEvidenceCards(layer.items)}`;
  }
  if (!layer.items.length || layer.items.every((item) => item.sources.length === 0 && item.evidenceScore === 0)) {
    return `<div class="empty"><b>${escapeHtml(localizeGeneratedText(noExternalEvidenceMessage()))}</b><span>현재 watchlist 신호는 discussion/momentum 기반으로 유지됩니다.</span></div>${adoptionEvidenceCards(layer.items)}`;
  }
  return adoptionEvidenceCards(layer.items);
}

function adoptionEvidenceCards(items: AdoptionEvidenceItem[]): string {
  if (!items.length) return "";
  return `<div class="action-grid" style="margin-top:12px">${items.map(adoptionEvidenceCard).join("")}</div>`;
}

function adoptionEvidenceCard(item: AdoptionEvidenceItem): string {
  const acceptedSourceCount = item.acceptedSourceCount ?? item.sources.length;
  const retainedSourceCount = item.retainedSourceCount ?? item.sources.length;
  const renderedSourceCount = item.renderedSourceCount ?? Math.min(3, item.sources.length);
  const directSources = item.sources.filter((source) => (source.relationship ?? "direct") === "direct").slice(0, 3);
  const clusterSources = item.sources.filter((source) => source.relationship === "cluster_related").slice(0, 3);
  const directList = directSources.map(sourceListItem).join("");
  const clusterList = clusterSources.map(sourceListItem).join("");
  const sourceSummary = `<p class="meta">관련 출처: ${acceptedSourceCount}건${acceptedSourceCount > retainedSourceCount ? "+" : ""}${SEP}상위 ${renderedSourceCount}건 표시</p>`;
  return `<article class="action-card"><div class="card-head"><div><div class="eyebrow">${escapeHtml(item.theme)}</div><h3>${escapeHtml(item.proposalId)}</h3></div><span class="score ${item.evidenceLevel === "Unknown" ? "unknown" : "low"}">${escapeHtml(formatEvidenceLevel(item.evidenceLevel))} ${item.evidenceScore}</span></div><p class="meta">${escapeHtml(item.title)}</p><div class="facts"><div class="fact"><span>근거 수준</span><b>${escapeHtml(formatEvidenceLevel(item.evidenceLevel))}</b></div><div class="fact"><span>근거 점수</span><b>${item.evidenceScore}</b></div><div class="fact"><span>채택된 출처</span><b>${acceptedSourceCount}</b></div><div class="fact"><span>보관/표시</span><b>${retainedSourceCount}</b></div></div>${sourceSummary}<p>${escapeHtml(localizeGeneratedText(item.summary))}</p><p class="meta">${escapeHtml(localizeGeneratedText(item.caution))}</p>${directList ? `<h3>직접 근거</h3><ul class="monitor-list">${directList}</ul>` : ""}${clusterList ? `<h3>관련 클러스터 참조</h3><ul class="monitor-list">${clusterList}</ul>` : ""}</article>`;
}

function sourceListItem(source: AdoptionEvidenceItem["sources"][number]): string {
  const title = escapeHtml(source.title ?? source.repo ?? source.sourceType);
  const link = source.url ? `<a href="${escapeHtml(source.url)}">${title}</a>` : title;
  return `<li>${link} <span class="muted">${escapeHtml(sourceMeta(source))}</span></li>`;
}

function sourceMeta(source: AdoptionEvidenceItem["sources"][number]): string {
  return [
    semanticTypeLabel(source.semanticType),
    formatRelationship(source.relationship ?? "direct"),
    source.repo ?? source.sourceType,
    source.state && source.state !== "unknown" ? formatState(source.state) : null,
    source.updatedAt ? `업데이트 ${source.updatedAt.slice(0, 10)}` : null,
  ].filter((item): item is string => Boolean(item)).join(SEP);
}

function semanticTypeLabel(value: AdoptionEvidenceItem["sources"][number]["semanticType"]): string {
  if (value === "implementation_tracker") return "구현 추적 이슈";
  if (value === "client_implementation_pr") return "클라이언트 구현 PR";
  if (value === "client_code_reference") return "클라이언트 코드 참조";
  if (value === "protocol_spec_reference") return "프로토콜 명세 참조";
  if (value === "core_developer_coordination") return "Core Dev 조율";
  if (value === "canonical_status_change") return "표준 상태 변경";
  if (value === "canonical_document_change") return "표준 문서 변경";
  if (value === "cluster_reference") return "클러스터 참조";
  if (value === "incidental_mention") return "부수적 언급";
  return "참조";
}

function evidenceExplanation(evidence: NarrativeEvidence): string {
  const discussionTheme = evidence.topDiscussions[0]?.theme;
  const momentumTheme = evidence.topMomentumThemes[0]?.theme;
  if (!discussionTheme || !momentumTheme) return "이 내러티브는 확인 가능한 가장 강한 discussion 및 momentum 근거에서 선택했습니다.";
  if (discussionTheme === momentumTheme || areAdjacentThemes(discussionTheme, momentumTheme)) {
    return `이 보고서는 단기 ${themeSignalLabel(discussionTheme)} discussion 신호와 장기 ${themeSignalLabel(momentumTheme)} momentum을 함께 봅니다.`;
  }
  return "이 보고서는 단기 discussion 신호와 장기 momentum 신호를 함께 포함합니다.";
}

function areAdjacentThemes(left: string, right: string): boolean {
  const protocolExecution = new Set(["Transaction Model / Execution", "EVM / Gas / Opcode", "Network Upgrade / Governance", "Governance / Process", "Block / Validator Operations"]);
  const wallet = new Set(["Wallet UX", "Account Abstraction", "Smart Account", "Gasless / Paymaster", "Session Key / Delegation", "Passkey / WebAuthn"]);
  const compliance = new Set(["Identity / Credential", "Compliance / Restricted Transfer", "RWA / Attestation", "Oracle / Pricing"]);
  return [protocolExecution, wallet, compliance].some((group) => group.has(left) && group.has(right));
}

function themeSignalLabel(theme: string): string {
  if (theme === "Transaction Model / Execution" || theme === "EVM / Gas / Opcode") return "execution";
  if (theme === "Network Upgrade / Governance" || theme === "Governance / Process") return "protocol governance";
  if (theme === "Data Availability") return "data availability";
  if (theme === "Wallet UX" || theme === "Account Abstraction") return "wallet";
  return theme.toLocaleLowerCase("en-US");
}

function evidenceDetails(evidence: NarrativeEvidence): string {
  const discussions = evidence.topDiscussions.map((item) =>
    `<li><b>${escapeHtml(item.proposalId)}</b> ${escapeHtml(item.title)}${SEP}${escapeHtml(formatActivityLevel(item.activityLevel ?? "Unknown"))}${SEP}댓글 ${item.replies ?? 0}개${SEP}참여자 ${item.participants ?? 0}명${item.lastActivityAt ? `${SEP}${escapeHtml(item.lastActivityAt.slice(0, 10))}` : ""}</li>`
  ).join("");
  const themes = evidence.topMomentumThemes.map((item) =>
    `<li><b>${escapeHtml(item.theme)}</b> ${item.score}/100</li>`
  ).join("");
  return `<div class="grid" style="margin-top:12px"><div class="half"><h3>상위 논의</h3><ul class="actions">${discussions || '<li>논의 근거 없음</li>'}</ul></div><div class="half"><h3>모멘텀 테마</h3><ul class="actions">${themes || '<li>테마 근거 없음</li>'}</ul></div></div>`;
}

function momentumTable(items: ThemeInsight[]): string {
  if (!items.length) return '<p class="muted">표시할 개발자 모멘텀 테마가 없습니다.</p>';
  return `<table class="table"><thead><tr><th>테마</th><th>방향</th><th>점수</th><th>신호</th><th>의미</th></tr></thead><tbody>${items.map((item) => {
    const direction = momentumDirection(item);
    return `<tr><td><b>${escapeHtml(item.theme)}</b></td><td>${directionPill(direction)}</td><td><span class="score">${item.momentumScore}/100</span></td><td>proposal ${item.proposalCount180d}건<br>최근 변경 ${item.recentChangeCount7d}건<br>discussion link ${item.discussionProposalCount ?? 0}건</td><td>${escapeHtml(localizeGeneratedText(item.interpretation))}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function discussionTable(items: DiscussionHeatItem[]): string {
  if (!items.length) return '<div class="empty"><b>최근 공개 논의 활동이 감지되지 않았습니다</b><span>이 기간의 공개 활동 세부 정보를 검증하지 못했습니다.</span></div>';
  return `<table class="table"><thead><tr><th>Proposal</th><th>테마</th><th>논의</th><th>활동성</th><th>마지막 활동</th><th>댓글</th><th>참여자</th><th>의미</th></tr></thead><tbody>${items.map((item, index) =>
    `<tr class="${discussionRowClass(index)}"><td><a href="${escapeHtml(item.canonicalUrl)}"><b>${escapeHtml(item.proposalId)}</b></a><br><span class="muted">${escapeHtml(item.title ?? "제목 없음")}</span></td><td>${escapeHtml(item.theme)}</td><td class="discussion-title">${escapeHtml(item.discussionTitle ?? "활동 세부 정보 확인 불가")}<br>${item.discussionUrl ? `<a href="${escapeHtml(item.discussionUrl)}">링크 열기</a>` : '<span class="muted">링크 없음</span>'}${item.discussionSource ? `<br><span class="muted">${escapeHtml(item.discussionSource)}</span>` : ""}${tagList(item.discussionTags)}</td><td>${scoreBadge(item.discussionActivityScore ?? item.discussionScore, item.activityLevel)}</td><td>${formatOptionalDate(item.discussionLastActivityAt)}</td><td>${formatOptionalNumber(item.discussionReplyCount)}</td><td>${formatOptionalNumber(item.discussionParticipantCount)}</td><td>${escapeHtml(localizeGeneratedText(displayWhyItMatters(item)))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function discussionRowClass(index: number): string {
  if (index === 0) return "top-signal";
  if (index < 3) return "priority-signal";
  return "";
}

function diffTable(items: DiffIntelligenceItem[]): string {
  if (!items.length) return '<div class="empty"><b>이번 보고 기간에는 proposal 문안 변경이 감지되지 않았습니다.</b><span>따라서 이번 주 표준 활동은 장기 180일 momentum과 discussion metadata 중심으로 해석합니다.</span></div>';
  return `<table class="table"><thead><tr><th>Proposal</th><th>변경 파일</th><th>변경 섹션</th><th>Diff 요약</th><th>근거</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td><a href="${escapeHtml(item.canonicalUrl)}"><b>${escapeHtml(item.proposalId)}</b></a><br><span class="muted">${escapeHtml(item.title ?? "제목 없음")}</span></td><td>${escapeHtml(item.changedFiles.join(", ") || "확인 불가")}</td><td>${escapeHtml(item.changedSections?.join(", ") ?? "확인 불가")}</td><td>${escapeHtml(localizeGeneratedText(item.diffSummary))}</td><td>${escapeHtml(localizeGeneratedText(item.diffEvidence))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function themeCard(insight: ThemeInsight): string {
  const tags = insight.dominantSubTrends.map((item) => `<span class="tag">${escapeHtml(item.name)} ${item.count}</span>`).join("");
  const proposals = insight.representativeProposals.map((item) =>
    `<li><a href="${escapeHtml(item.canonicalUrl)}"><b>${escapeHtml(item.id)}</b></a> ${escapeHtml(item.title)} <span class="muted">(${escapeHtml(item.status)})</span></li>`
  ).join("");
  return `<article class="card theme-card"><div class="card-head"><h3>${escapeHtml(insight.theme)}</h3><span class="score">${insight.momentumScore}/100</span></div><p>${escapeHtml(localizeGeneratedText(insight.interpretation))}</p><div class="tags">${tags || '<span class="tag">하위 트렌드 없음</span>'}</div>${proposals ? `<ul>${proposals}</ul>` : '<p class="muted">대표 proposal이 없습니다.</p>'}</article>`;
}

function eventSummary(changes: WeeklyRadarReport["ethereumTechRadar"]["recentChanges"]): string {
  const rows: Array<[string, ChangeEvent[]]> = [
    ["신규", changes.newProposals],
    ["상태", changes.statusChanges],
    ["확정", changes.finalTransitions],
    ["철회", changes.withdrawnTransitions],
    ["문안", changes.contentHashChanges],
  ];
  return `<h3>이벤트 분해</h3><table class="table"><tbody>${rows.map(([label, events]) =>
    `<tr><th>${label}</th><td>${events.length}</td><td>${events.slice(0, 3).map((event) => `<a href="${escapeHtml(event.canonicalUrl)}">${escapeHtml(event.proposalId)}</a>`).join(", ") || '<span class="muted">없음</span>'}</td></tr>`
  ).join("")}</tbody></table>`;
}

function businessImpactRefined(themes: ThemeInsight[], candidates: KgldCandidate[], watchlist: WatchlistLayer, adoptionLayer: AdoptionLayer): string {
  const topItem = watchlist.items[0];
  if (topItem?.relatedProposals.includes("EIP-8141")) {
    const adoptionEvidence = adoptionEvidenceForProposal(adoptionLayer, topItem.relatedProposals);
    const level = adoptionEvidence?.evidenceLevel ?? "Unknown";
    const hasImplementationTracker = adoptionEvidence?.sources.some((source) => source.semanticType === "implementation_tracker") ?? false;
    const signalMode = level === "Reference" || level === "Implementation" ? "implementation/reference signal" : "discussion/momentum signal";
    const message = hasImplementationTracker
      ? "구현 추적 근거는 확인됐지만, 검증된 클라이언트 구현이나 운영 채택 근거는 확인되지 않았습니다. 구현 추적 신호로만 해석해야 합니다."
      : level === "Implementation"
        ? "EIP-8141 구현 근거는 KGLD 적용 판단 전에 별도 검토가 필요합니다. 운영 채택이 아니라 protocol / wallet execution-boundary 관찰 항목으로 보세요."
        : level === "Mention" || level === "Reference"
          ? "EIP-8141은 외부 참조 근거가 있으나 wallet/execution 후속 관찰 후보로만 다룹니다. 직접적인 KGLD 적용성이나 운영 채택으로 해석하지 않습니다."
          : "EIP-8141은 확인된 구현 근거가 없으므로 직접 KGLD 적용 후보가 아니라 protocol / wallet execution-boundary 관찰 항목입니다.";
    return `<p>${escapeHtml(message)}</p><p class="meta"><b>신호 유형:</b> ${escapeHtml(formatSignalMode(signalMode))}${SEP}<b>채택 근거:</b> ${escapeHtml(formatEvidenceLevel(adoptionEvidence?.evidenceLevel))}</p>`;
  }
  const topTheme = themes[0]?.theme ?? "Unclassified";
  const kgldNote = candidates.length
    ? "규칙 기반 KGLD 후보는 별도로 검토하고, 이 섹션에서는 Ethereum watchlist evidence를 우선합니다."
    : "현재 규칙 기반 KGLD 후보는 없습니다.";
  return `<p>이번 주 business lens는 ${escapeHtml(topTheme)} 중심 watchlist 신호를 우선합니다. ${escapeHtml(kgldNote)}</p>`;
}

function businessImpact(themes: ThemeInsight[], candidates: KgldCandidate[]): string {
  const topTheme = themes[0]?.theme ?? "Unclassified";
  const hasWallet = themes.some((item) => ["Account Abstraction", "Wallet UX", "Smart Account", "Passkey / WebAuthn"].includes(item.theme));
  const hasRwa = themes.some((item) => ["RWA / Attestation", "Oracle / Pricing", "Compliance / Restricted Transfer", "DeFi / Vault"].includes(item.theme));
  const items = [
    `<li><b>Wallet</b>: ${hasWallet ? "smart account, permission, gas sponsorship 흐름을 모니터링합니다." : "이번 주 강한 wallet-specific 신호는 제한적입니다."}</li>`,
    `<li><b>Exchange</b>: token standard, transfer restriction, signature 관련 변경을 상장/입출금 정책 관점에서 확인합니다.</li>`,
    `<li><b>RWA / Compliance</b>: ${hasRwa ? "attestation, proof, restricted transfer 계열을 우선 추적합니다." : "명확한 RWA/Compliance 신호는 아직 보조 지표입니다."}</li>`,
    `<li><b>KGLD</b>: ${candidates.length ? "상위 KGLD 후보는 별도로 검토하고 Ethereum momentum 해석 이후 business lens로 다룹니다." : "현재 규칙 기반 KGLD 후보는 없습니다."}</li>`,
    `<li><b>주요 내러티브</b>: 이번 주 기준 상위 developer momentum은 ${escapeHtml(topTheme)}입니다.</li>`,
  ];
  return `<ul class="actions">${items.join("")}</ul>`;
}

function candidateTable(items: KgldCandidate[]): string {
  if (!items.length) return '<p class="muted">KGLD 후보가 없습니다.</p>';
  return `<table class="table"><thead><tr><th>Proposal</th><th>점수</th><th>액션</th></tr></thead><tbody>${items.map((item) =>
    `<tr><td><a href="${escapeHtml(item.canonicalUrl)}">${escapeHtml(item.proposalId)}</a><br><span class="muted">${escapeHtml(item.title ?? "제목 없음")}</span></td><td><span class="score">${item.relevanceScore}/100</span></td><td>${escapeHtml(formatActionLabel(item.recommendedAction))}</td></tr>`
  ).join("")}</tbody></table>`;
}

function renderActionsRefined(report: WeeklyRadarReport): string {
  const watchlist = getWatchlistLayer(report).items;
  if (watchlist.length) {
    const actionCards = watchlist.slice(0, 4).map((item) => {
      const primaryProposal = item.relatedProposals[0];
      const title = primaryProposal
        ? `${primaryProposal}을 다음 주 주요 관찰 신호로 추적`
        : `${item.theme}을 다음 주 주요 관찰 신호로 추적`;
      const reason = item.evidence.some((evidence) => /No content diff detected/i.test(evidence))
        ? "discussion heat는 높지만 이번 주 spec diff는 감지되지 않았습니다."
        : "신호를 상향하기 전에 구체적인 report evidence와 대조해야 합니다.";
      const evidence = item.evidence.filter((line) => !/No content diff detected/i.test(line)).slice(0, 3).map(localizeEvidenceText).join(". ");
      const nextCheck = item.monitorNext.slice(0, 3).map(localizeMonitorText).join("; ");
      return `<article class="action-card recommendation-card"><h3>${escapeHtml(title)}</h3><p><b>이유:</b> ${escapeHtml(reason)}</p><p><b>근거:</b> ${escapeHtml(evidence || item.title)}.</p><p><b>다음 확인 항목:</b> ${escapeHtml(nextCheck || "다음 주 수집 결과를 검토합니다.")}</p></article>`;
    });
    return `<div class="action-grid">${actionCards.join("")}</div>`;
  }

  const fallback = report.ethereumTechRadar.themeInsights.slice(0, 4).map((item) =>
    `<article class="action-card recommendation-card"><h3>${escapeHtml(item.theme)} 검토</h3><p><b>이유:</b> 현재 보고서에서 theme momentum이 보입니다.</p><p><b>근거:</b> momentum score ${item.momentumScore}/100.</p><p><b>다음 확인 항목:</b> 다음 주 status movement, content diff, discussion activity를 검토합니다.</p></article>`
  );
  return fallback.length ? `<div class="action-grid">${fallback.join("")}</div>` : '<p class="muted">현재 데이터만으로 권장 액션을 만들 수 없습니다. 다음 수집 결과를 대기합니다.</p>';
}

function renderActions(report: WeeklyRadarReport): string {
  const watchlist = getWatchlistLayer(report).items;
  if (watchlist.length) {
    const items = watchlist.flatMap((item) => {
      const primaryProposal = item.relatedProposals[0];
      const related = item.relatedProposals.filter((proposalId) => proposalId !== primaryProposal).slice(0, 3);
      return [
        primaryProposal
          ? `<li><b>Track ${escapeHtml(primaryProposal)}</b>: ${escapeHtml(item.monitorNext[0] ?? item.title)} next week.</li>`
          : `<li><b>Track theme</b>: ${escapeHtml(item.theme)} next week.</li>`,
        related.length
          ? `<li><b>Watch related proposals</b>: ${escapeHtml(related.join(", "))}.</li>`
          : null,
        `<li><b>신호 품질 모니터링</b>: ${escapeHtml(item.theme)} 신뢰도는 ${escapeHtml(formatConfidenceLabel(item.confidence))} ${item.confidenceScore}/100입니다. 신호 상향 전 diff와 status movement를 확인합니다.</li>`,
      ].filter((line): line is string => line !== null);
    }).slice(0, 6);
    return `<ul class="actions">${items.join("")}</ul>`;
  }

  const topThemes = report.ethereumTechRadar.themeInsights.slice(0, 3);
  const diffItems = report.ethereumTechRadar.signalLayer.diffIntelligence.slice(0, 2);
  const discussionItems = report.ethereumTechRadar.signalLayer.discussionHeat.slice(0, 2);
  const items = [
    ...topThemes.map((item) => `<li><b>테마 관찰</b>: ${escapeHtml(item.theme)} (${item.momentumScore}/100). 최근 변경 ${item.recentChangeCount7d}건과 discussion metadata ${item.discussionProposalCount ?? 0}건을 다음 주에 추적합니다.</li>`),
    ...diffItems.map((item) => `<li><b>Diff 검토</b>: ${escapeHtml(item.proposalId)} - ${escapeHtml(localizeGeneratedText(item.diffSummary))}</li>`),
    ...discussionItems.map((item) => `<li><b>논의 추적</b>: ${escapeHtml(item.proposalId)} - ${escapeHtml(localizeGeneratedText(displayWhyItMatters(item)))}</li>`),
  ];
  return items.length ? `<ul class="actions">${items.join("")}</ul>` : '<p class="muted">현재 데이터만으로 권장 액션을 만들 수 없습니다. 다음 수집 결과를 대기합니다.</p>';
}

function momentumDirection(item: ThemeInsight): "Up" | "Down" | "Stable" {
  if (item.recentChangeCount7d > 0 || (item.contentChangeCount ?? 0) > 0) return "Up";
  if (item.maturitySignal === "high" && item.recentChangeCount7d === 0) return "Stable";
  return "Stable";
}

function directionPill(direction: "Up" | "Down" | "Stable"): string {
  const className = direction === "Up" ? "up" : direction === "Down" ? "down" : "";
  return `<span class="pill ${className}">${formatChangeLabel(direction)}</span>`;
}

function scoreBadge(score: number | null | undefined, level: DiscussionHeatItem["activityLevel"]): string {
  const className = level === "High" ? "high" : level === "Medium" ? "medium" : level === "Low" ? "low" : level === "Unknown" ? "unknown" : "";
  const label = level === "High" ? `높음 ${score ?? 0}` : level === "Medium" ? `중간 ${score ?? 0}` : level === "Low" ? `낮음 ${score ?? 0}` : "확인 불가";
  return `<span class="score ${className}">${label}</span>`;
}

function displayWhyItMatters(item: DiscussionHeatItem): string {
  return item.whyItMatters === "Discussion metadata available; activity details unavailable."
    ? buildDiscussionFallbackWhyItMatters(item)
    : item.whyItMatters;
}

function tagList(tags: string[] | undefined): string {
  if (!tags?.length) return "";
  return `<div class="tags">${tags.slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function formatOptionalDate(value: string | undefined): string {
  return value ? escapeHtml(value.slice(0, 10)) : '<span class="muted">확인 불가</span>';
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? '<span class="muted">확인 불가</span>' : String(value);
}

function hasChartData(series: ChartSeries): boolean {
  return series.labels.length > 0 && series.data.length > 0 && series.data.some((value) => value > 0);
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatDateLine(report: WeeklyRadarReport): string {
  return [
    `기준일: ${report.generatedAt.slice(0, 10)}`,
    `추세 기간: ${report.trendPeriod.days}일`,
    `변경 감지: ${report.changePeriod.days}일`,
    "출처: EIP/ERC 메타데이터 및 스냅샷 diff",
  ].join(SEP);
}

function formatGeneratedBy(value: string): string {
  return value === "deterministic" ? "규칙 기반 생성" : value;
}

function formatLifecycleStage(value: string): string {
  const labels: Record<string, string> = {
    Discussion: "논의",
    Draft: "초안",
    Review: "검토",
    "Last Call": "최종 검토",
    Final: "확정",
    "Implementation Tracking": "구현 추적",
    "Implementation Candidate": "구현 후보",
    "Verified Implementation": "검증된 구현",
    Released: "릴리스",
    Activated: "활성화",
    "Production Adoption": "운영 채택",
  };
  return labels[value] ?? value;
}

function formatEvidenceLevel(value: string | undefined): string {
  const labels: Record<string, string> = {
    Unknown: "확인 불가",
    Mention: "언급",
    Reference: "참조",
    Implementation: "구현",
  };
  return labels[value ?? "Unknown"] ?? value ?? "확인 불가";
}

function formatRelationship(value: string): string {
  const labels: Record<string, string> = {
    direct: "직접",
    cluster_related: "클러스터 관련",
    incidental: "부수적",
  };
  return labels[value] ?? value;
}

function formatState(value: string): string {
  const labels: Record<string, string> = {
    open: "열림",
    closed: "닫힘",
    merged: "병합됨",
  };
  return labels[value] ?? value;
}

function formatConfidenceLabel(value: string): string {
  const labels: Record<string, string> = {
    High: "높음",
    Medium: "중간",
    Low: "낮음",
    Unknown: "확인 불가",
  };
  return labels[value] ?? value;
}

function formatActivityLevel(value: string): string {
  return formatConfidenceLabel(value);
}

function formatRiskLevel(value: string): string {
  const labels: Record<string, string> = {
    High: "높음",
    Medium: "중간",
    Low: "낮음",
    None: "없음",
  };
  return labels[value] ?? value;
}

function formatBusinessImpactLevel(value: string): string {
  const labels: Record<string, string> = {
    None: "없음",
    Monitor: "관찰",
    Medium: "중간",
    High: "높음",
    Critical: "중대",
  };
  return labels[value] ?? value;
}

function formatRadarQuadrant(value: string): string {
  const labels: Record<string, string> = {
    Watch: "관찰",
    Trial: "시험",
    Adopt: "도입 검토",
    Hold: "보류",
  };
  return labels[value] ?? value;
}

function formatClientStatus(value: string): string {
  const labels: Record<string, string> = {
    Tracking: "추적",
    Candidate: "후보",
    Verified: "검증",
    Released: "릴리스",
    Activated: "활성화",
    "No evidence": "근거 없음",
  };
  return labels[value] ?? value;
}

function formatReleaseStatus(value: string): string {
  const labels: Record<string, string> = {
    "No release": "릴리스 근거 없음",
    "Release Candidate": "릴리스 후보",
    Released: "릴리스됨",
    Activated: "활성화됨",
  };
  return labels[value] ?? value;
}

function formatDeploymentStatus(value: string): string {
  const labels: Record<string, string> = {
    "No evidence": "활성화 근거 없음",
    "Testnet activation": "테스트넷 활성화",
    "Mainnet activation": "메인넷 활성화",
    "Default enabled": "기본 활성화",
    Production: "운영",
  };
  return labels[value] ?? value;
}

function formatGraphEdge(value: string): string {
  const labels: Record<string, string> = {
    references: "참조",
    implements: "구현",
    tracks: "추적",
    supersedes: "대체",
    discusses: "논의",
    releases: "릴리스",
    activates: "활성화",
  };
  return labels[value] ?? value;
}

function formatRiskType(value: string): string {
  const labels: Record<string, string> = {
    "High discussion / no implementation": "논의 활발 / 구현 없음",
    "Implementation / no release": "구현 / 릴리스 없음",
    "Release / no activation": "릴리스 / 활성화 없음",
    "Client divergence": "클라이언트 불일치",
  };
  return labels[value] ?? value;
}

function formatScoreLabel(value: string): string {
  const labels: Record<string, string> = {
    discussion: "논의",
    spec: "명세",
    implementation: "구현",
    release: "릴리스",
    "manual uncertainty": "수동 불확실성",
    "no verified client implementation": "검증된 클라이언트 구현 없음",
    "no release evidence": "릴리스 근거 없음",
    "direct stage evidence": "직접 단계 근거",
    "implementation tracking": "구현 추적",
    "no explicit evidence": "명시적 근거 없음",
    "business keyword match": "비즈니스 키워드 매치",
    "impact areas": "영향 영역",
    "high-impact cap": "고영향 상한",
    lifecycle: "라이프사이클",
    "business impact": "비즈니스 영향",
    "false-positive risk": "오탐 위험",
    "discussion heat": "논의 열기",
    "no verified implementation": "검증된 구현 없음",
  };
  return labels[value] ?? value;
}

function formatDataCompletenessStatus(value: string): string {
  const labels: Record<string, string> = {
    complete: "완전",
    mostly_complete: "대체로 완전",
    partial: "부분 수집",
    degraded: "저하",
    unavailable: "사용 불가",
  };
  return labels[value] ?? value;
}

function formatSpecChangeLabel(value: string): string {
  return value === "0 content diffs" ? "문안 변경 0건" : "문안 변경 있음";
}

function formatSignalMode(value: string): string {
  const labels: Record<string, string> = {
    "discussion/momentum-driven": "discussion/momentum 기반",
    "diff/status-driven": "diff/status 기반",
    "implementation/reference signal": "구현 추적/참조 신호",
    "discussion/momentum signal": "discussion/momentum 신호",
  };
  return labels[value] ?? value;
}

function formatActionLabel(value: string): string {
  const labels: Record<string, string> = {
    monitor: "관찰",
    review: "검토",
    poc: "PoC",
    ignore: "제외",
  };
  return labels[value] ?? value;
}

function formatChangeLabel(value: string): string {
  const labels: Record<string, string> = {
    Up: "상승",
    Down: "하락",
    Stable: "안정",
    Unknown: "확인 불가",
  };
  return labels[value] ?? value;
}

function formatKgldArea(value: string): string {
  const labels: Record<string, string> = {
    "Wallet impact": "Wallet 영향",
    "Custody impact": "Custody 영향",
    "Compliance impact": "Compliance 영향",
    "Tokenization impact": "Tokenization 영향",
    "RWA impact": "RWA 영향",
    "Settlement impact": "Settlement 영향",
    "Account abstraction impact": "Account abstraction 영향",
    "Bridge impact": "Bridge 영향",
    "Execution impact": "Execution 영향",
  };
  return labels[value] ?? value;
}

function formatLimitation(value: string): string {
  return localizeGeneratedText(value);
}

function localizeDataCompletenessExplanation(value: string): string {
  return localizeGeneratedText(value);
}

function localizeEvidenceText(value: string): string {
  return localizeGeneratedText(value)
    .replace(/(\d+) replies, (\d+) participants/gi, "댓글 $1개, 참여자 $2명")
    .replace(/Last active/gi, "마지막 활동")
    .replace(/No content diff detected this week\.?/gi, "이번 주 content diff는 감지되지 않았습니다.")
    .replace(/Momentum score/gi, "모멘텀 점수")
    .replace(/discussion links/gi, "discussion link")
    .replace(/new Ethereum Magicians replies/gi, "Ethereum Magicians 신규 댓글")
    .replace(/changes/gi, "변경");
}

function localizeMonitorText(value: string): string {
  return localizeEvidenceText(value)
    .replace(/content diff/gi, "content diff")
    .replace(/whether momentum becomes a spec-change signal/gi, "모멘텀이 spec-change 신호로 전환되는지 확인");
}

function localizeGeneratedText(value: string): string {
  return value
    .replace(/Ethereum execution-specs contains implementation tracking references, but verified client code support has not yet been established\./gi, "Ethereum execution-specs에는 구현 추적 근거가 있지만 검증된 클라이언트 코드 지원은 아직 확인되지 않았습니다.")
    .replace(/Implementation tracking references were found, but no verified client implementation or production support was identified\./gi, "구현 추적 근거는 확인됐지만, 검증된 클라이언트 구현이나 운영 채택 근거는 확인되지 않았습니다.")
    .replace(/Reference evidence should be reviewed manually before upgrading the signal\./gi, "이 참조 근거를 더 높은 단계로 올리기 전에는 수동 검토가 필요합니다.")
    .replace(/No implementation or external reference evidence collected in this run\./gi, "이번 실행에서 구현 또는 외부 참조 근거가 수집되지 않았습니다.")
    .replace(/GitHub evidence collection skipped because GITHUB_TOKEN is not configured\./gi, "GITHUB_TOKEN이 설정되지 않아 GitHub 근거 수집을 건너뛰었습니다.")
    .replace(/GitHub evidence collection could not be completed for this run\./gi, "이번 실행에서 GitHub 근거 수집을 완료하지 못했습니다.")
    .replace(/Evidence collection was incomplete; absence of evidence must not be read as negative evidence\./gi, "근거 수집이 불완전했습니다. 근거 부재를 부정 근거로 해석하면 안 됩니다.")
    .replace(/Core report and adoption evidence collection completed for the monitored scope\./gi, "모니터링 범위의 핵심 보고서와 채택 근거 수집이 완료되었습니다.")
    .replace(/Fresh activity suggests the proposal is still being debated or refined\./gi, "최근 활동이 있어 제안이 계속 논의 또는 보완되고 있음을 시사합니다.")
    .replace(/Older discussion exists, but recent activity is limited\./gi, "과거 논의는 있으나 최근 활동은 제한적입니다.")
    .replace(/Activity details unavailable/gi, "활동 세부 정보 확인 불가")
    .replace(/Stage is based only on collected public metadata and source links\./gi, "단계는 수집된 공개 metadata와 source link만 기반으로 합니다.")
    .replace(/Tracking evidence is not verified client support\./gi, "구현 추적 근거는 검증된 클라이언트 지원이 아닙니다.")
    .replace(/No explicit evidence was collected\./gi, "명시적 근거가 수집되지 않았습니다.")
    .replace(/This stage is not inferred from earlier lifecycle stages\./gi, "이 단계는 이전 라이프사이클 단계에서 추론하지 않습니다.")
    .replace(/No direct client implementation source was accepted\./gi, "직접적인 클라이언트 구현 출처가 채택되지 않았습니다.")
    .replace(/Tracking is stronger than a mention but not verified implementation\./gi, "추적 근거는 단순 언급보다 강하지만 검증된 구현은 아닙니다.")
    .replace(/Current lifecycle stage is Implementation Tracking\./gi, "현재 라이프사이클 단계는 구현 추적입니다.")
    .replace(/Current lifecycle stage is Draft\./gi, "현재 라이프사이클 단계는 초안입니다.")
    .replace(/Current lifecycle stage is Review\./gi, "현재 라이프사이클 단계는 검토입니다.")
    .replace(/KGLD impact is Monitor\./gi, "KGLD 영향은 관찰 수준입니다.")
    .replace(/KGLD impact is None\./gi, "KGLD 영향은 없습니다.")
    .replace(/Draft with Monitor KGLD impact; no later lifecycle stage is inferred without evidence\./gi, "초안 단계이며 KGLD 영향은 관찰 수준입니다. 근거 없이 후속 단계로 추론하지 않습니다.")
    .replace(/Review with Monitor KGLD impact; no later lifecycle stage is inferred without evidence\./gi, "검토 단계이며 KGLD 영향은 관찰 수준입니다. 근거 없이 후속 단계로 추론하지 않습니다.")
    .replace(/Implementation Tracking with Monitor KGLD impact; no later lifecycle stage is inferred without evidence\./gi, "구현 추적 단계이며 KGLD 영향은 관찰 수준입니다. 근거 없이 후속 단계로 추론하지 않습니다.")
    .replace(/Discussion contributes 25% at score (\d+)\./gi, "논의 점수 $1을 25% 가중치로 반영합니다.")
    .replace(/Spec contributes 15% at score (\d+)\./gi, "명세 점수 $1을 15% 가중치로 반영합니다.")
    .replace(/Implementation contributes 30% at score (\d+)\./gi, "구현 점수 $1을 30% 가중치로 반영합니다.")
    .replace(/Release contributes 20% at score (\d+)\./gi, "릴리스 점수 $1을 20% 가중치로 반영합니다.")
    .replace(/Manual uncertainty contributes 10% at score (\d+)\./gi, "수동 불확실성 점수 $1을 10% 가중치로 반영합니다.")
    .replace(/([a-z ]+) contributes (\d+)% at score (\d+)\./gi, (_, factor: string, percent: string, score: string) => `${formatScoreLabel(factor.trim())} 점수 ${score}을 ${percent}% 가중치로 반영합니다.`)
    .replace(/(\d+) source\(s\) support this lifecycle stage\./gi, "이 라이프사이클 단계를 뒷받침하는 출처가 $1건 있습니다.")
    .replace(/(\d+) client-specific source\(s\) matched\./gi, "클라이언트별 출처 $1건이 일치했습니다.")
    .replace(/(\d+) release source\(s\) matched\./gi, "릴리스 출처 $1건이 일치했습니다.")
    .replace(/(\d+) deployment source\(s\) matched ([^.]+)\./gi, "배포 출처 $1건이 $2 상태와 일치했습니다.")
    .replace(/(\d+) impact area\(s\) reached Monitor or higher\./gi, "영향 영역 $1개가 관찰 이상입니다.")
    .replace(/High\/Critical impact requires strong KGLD relevance evidence\./gi, "높음/중대 영향은 강한 KGLD 관련 근거가 있을 때만 표시합니다.")
    .replace(/No KGLD candidate matched\./gi, "매칭된 KGLD 후보가 없습니다.")
    .replace(/(\d+) retained reference source\(s\) were collected\. This is not client support or production adoption evidence\./gi, "참조 출처 $1건이 수집됐습니다. 이는 클라이언트 지원이나 운영 채택 근거가 아닙니다.")
    .replace(/External mentions were found, but no implementation evidence was identified\. Retained source count: (\d+)\./gi, "외부 언급은 확인됐지만 구현 근거는 확인되지 않았습니다. 보관 출처는 $1건입니다.")
    .replace(/Higher false-positive risk lowers readiness\./gi, "오탐 위험이 높을수록 준비도는 낮아집니다.")
    .replace(/Discussion heat is high, but no verified implementation evidence was accepted\./gi, "논의 열기는 높지만 검증된 구현 근거는 채택되지 않았습니다.")
    .replace(/Implementation confidence is capped without verified client evidence\./gi, "검증된 클라이언트 근거가 없으면 구현 신뢰도는 제한됩니다.")
    .replace(/Release evidence was not accepted\./gi, "릴리스 근거가 채택되지 않았습니다.")
    .replace(/No direct business workflow evidence was found\./gi, "직접적인 비즈니스 workflow 근거가 확인되지 않았습니다.")
    .replace(/([A-Za-z /]+ impact) is plausible from theme\/title evidence; verify concrete KGLD workflow impact before escalation\./gi, (_, area: string) => `${formatKgldArea(area.trim())}은 테마/제목 근거상 가능성이 있지만, 상향 전 구체적인 KGLD workflow 영향을 검증해야 합니다.`)
    .replace(/is plausible from theme\/title evidence; verify concrete KGLD workflow impact before escalation\./gi, "테마/제목 근거상 가능성이 있지만, 상향 전 구체적인 KGLD workflow 영향을 검증해야 합니다.")
    .replace(/([A-Za-z /]+ impact) 은/gi, (_, area: string) => `${formatKgldArea(area.trim())}은`)
    .replace(/No direct ([a-z /]+) evidence was found\./gi, "직접적인 $1 근거가 확인되지 않았습니다.")
    .replace(/\s\|\s/g, SEP)
    .replace(/\uCA0C/g, SEP);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

