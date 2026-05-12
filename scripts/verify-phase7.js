/**
 * Phase 7 정적 분석 검증
 */
const fs   = require("fs");
const path = require("path");

const js  = fs.readFileSync(path.join(__dirname, "../frontend/app.js"),    "utf8");
const css = fs.readFileSync(path.join(__dirname, "../frontend/style.css"), "utf8");

let passed = 0, failed = 0;
function check(label, cond) {
  process.stdout.write((cond ? "  ✅  " : "  ❌  ") + label + "\n");
  cond ? passed++ : failed++;
}

// [1] SCR-03 결과 화면 핵심 구현
console.log("\n[1] SCR-03 결과 화면");
check("renderSCR03() 실제 구현",       js.includes("computeResults()"));
check("computeResults() 함수",         js.includes("function computeResults()"));
check("resultCardHTML() 함수",         js.includes("function resultCardHTML("));
check("득표 내림차순 정렬",             js.includes("Number(b.voteCount) - Number(a.voteCount)"));
check("maxVotes 계산",                  js.includes("Number(sorted[0].voteCount)"));
check("동률 감지 (isTie)",              js.includes("isTie"));
check("scr03-wrap 컨테이너",           js.includes("scr03-wrap"));
check("result-header 요소",            js.includes("result-header"));

// [2] 승자/동률 발표
console.log("\n[2] 승자/동률 발표");
check("result-winner 클래스",          js.includes("result-winner"));
check("result-tie 클래스",             js.includes("result-tie"));
check("🏆 아이콘",                      js.includes("🏆"));
check("🤝 동률 아이콘",                  js.includes("🤝"));
check("winner-card 클래스",            js.includes("winner-card"));
check("progress-fill winner 클래스",   js.includes('winner" : ""'));
check("rank-badge 순위 표시",          js.includes("rank-badge"));
check("🥇🥈🥉 메달 아이콘",            js.includes("🥇") && js.includes("🥈") && js.includes("🥉"));
check("동률 winners 이름 목록",         js.includes("winners.map(w => escHtml(w.name))"));

// [3] 관리자 새 투표 기능
console.log("\n[3] 관리자 새 투표 만들기 (owner only)");
check("btn-new-vote 버튼",             js.includes("btn-new-vote"));
check("isOwner 조건부 adminBar",       js.includes("state.isOwner ? `"));
check("localStorage.removeItem(STORAGE_KEY)", js.includes("localStorage.removeItem(STORAGE_KEY)"));
check("state.contractAddress = null", js.includes("state.contractAddress = null"));
check("state.contract = null",        js.includes("state.contract        = null"));
check("stopPolling() 호출",            js.includes("stopPolling()"));
check("renderCurrentScreen() 재호출", js.includes("renderCurrentScreen()"));

// [4] XSS + 안전
console.log("\n[4] XSS 방지 + 안전");
check("escHtml() 재사용",              js.includes("escHtml(c.name)") && js.includes("escHtml(c.photoUrl)"));
check("resultCardHTML에서 escHtml",    js.includes("function resultCardHTML("));
check("후보자 없음 처리",              js.includes("sorted.length === 0"));
check("totalVotes 0 나누기 방지",      js.includes("totalVotes > 0"));

// [5] CSS 스타일
console.log("\n[5] Phase 7 CSS");
check(".scr03-wrap",        css.includes(".scr03-wrap"));
check(".result-header",     css.includes(".result-header"));
check(".result-winner",     css.includes(".result-winner"));
check(".result-tie",        css.includes(".result-tie"));
check(".result-icon",       css.includes(".result-icon"));
check(".result-title",      css.includes(".result-title"));
check(".result-names",      css.includes(".result-names"));
check(".result-card",       css.includes(".result-card"));
check(".rank-badge",        css.includes(".rank-badge"));
check(".result-admin-bar",  css.includes(".result-admin-bar"));
check(".result-vote-count", css.includes(".result-vote-count"));

// [6] Phase 1~6 사이드이펙트 보존
console.log("\n[6] Phase 1~6 보존");
check("renderSCR01() 보존",    js.includes("function renderSCR01()"));
check("renderSCR00() 보존",    js.includes("function renderSCR00()"));
check("handleVote() 보존",     js.includes("async function handleVote("));
check("handleStartVoting() 보존", js.includes("function handleStartVoting()"));
check("deployContract() 보존", js.includes("function deployContract()"));
check("connectContract() 보존", js.includes("function connectContract("));

console.log("\n══════════════════════════════════════");
console.log("Phase 7 정적 검증: 통과 " + passed + " / 실패 " + failed);
console.log("══════════════════════════════════════");
if (failed > 0) process.exit(1);
