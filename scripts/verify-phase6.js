/**
 * Phase 6 정적 분석 검증
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

// [1] FR-04: 투표 실행 핵심 로직
console.log("\n[1] 투표 실행 (FR-04)");
check("handleVote() 함수",                js.includes("async function handleVote("));
check("bindVoteButtons() 구현",           js.includes("function bindVoteButtons()") && !js.includes("Phase 6에서 채워짐"));
check("btn-vote 클래스 버튼 렌더링",      js.includes("btn-vote"));
check("data-idx 속성",                    js.includes("data-idx="));
check("vote(i) 트랜잭션 호출",            js.includes("state.contract.vote(i)"));
check("tx.wait() 호출",                   js.includes("await tx.wait()"));
check("hasVoted = true 갱신",             js.includes("state.hasVoted   = true"));
check("candidates 갱신 후 renderSCR01",   js.includes("state.candidates = [...await state.contract.getCandidates()]"));

// [2] FR-04-2: hasVoted 상태별 UI
console.log("\n[2] hasVoted 상태별 UI (FR-04-2, FR-04-7)");
check("ONGOING 조건 분기",               js.includes("state.votingStatus === 1n"));
check("hasVoted true → vote-done-badge", js.includes("vote-done-badge"));
check("hasVoted false → btn-vote 버튼",  js.includes("btn-vote-${i}"));
check("!state.account → 안내 문구",      js.includes("vote-need-wallet"));

// [3] FR-04-3, FR-04-6: 트랜잭션 진행 중 UI + 에러 처리
console.log("\n[3] 트랜잭션 진행 중 UI + 에러 처리");
check("버튼 disabled 처리",              js.includes("btn.disabled  = true"));
check("처리 중 스피너",                  js.includes("처리 중..."));
check("확인 중 텍스트",                  js.includes("확인 중..."));
check("에러 시 버튼 복원",               js.includes('btn.textContent = "투표하기"'));
check("getDeployErrorMsg 재사용",        js.includes("getDeployErrorMsg(err)"));
check("showToast 성공 메시지",           js.includes("투표가 완료되었습니다"));
check("showToast 실패 메시지",           js.includes("투표 실패:"));

// [4] refreshVoteDisplay 단일화 (중복 제거)
console.log("\n[4] refreshVoteDisplay 단일화");
const rfCount = (js.match(/function refreshVoteDisplay\(\)/g) || []).length;
check("refreshVoteDisplay 단 1개 선언",  rfCount === 1);
check("totalVotes 계산 포함",            js.includes("s + Number(c.voteCount)"));
check("status-banner strong 갱신",       js.includes(".status-banner strong"));

// [5] CSS
console.log("\n[5] Phase 6 CSS");
check(".btn-vote",         css.includes(".btn-vote"));
check(".vote-done-badge",  css.includes(".vote-done-badge"));
check(".vote-need-wallet", css.includes(".vote-need-wallet"));

// [6] Phase 1~5 사이드이펙트 보존
console.log("\n[6] Phase 1~5 보존");
check("handleAddCandidate() 보존",    js.includes("function handleAddCandidate()"));
check("handleStartVoting() 보존",     js.includes("function handleStartVoting()"));
check("handleEndVoting() 보존",       js.includes("function handleEndVoting()"));
check("candidateCardHTML() 보존",     js.includes("function candidateCardHTML("));
check("adminPanelHTML() 보존",        js.includes("function adminPanelHTML()"));
check("escHtml() 보존",               js.includes("function escHtml("));
check("deployContract() 보존",        js.includes("function deployContract()"));

console.log("\n══════════════════════════════════════");
console.log("Phase 6 정적 검증: 통과 " + passed + " / 실패 " + failed);
console.log("══════════════════════════════════════");
if (failed > 0) process.exit(1);
