/**
 * Phase 4+5 정적 분석 검증
 */
const fs   = require("fs");
const path = require("path");

const js  = fs.readFileSync(path.join(__dirname, "../frontend/app.js"),    "utf8");
const css = fs.readFileSync(path.join(__dirname, "../frontend/style.css"), "utf8");
const sol = fs.readFileSync(path.join(__dirname, "../contracts/Voting.sol"), "utf8");

let passed = 0, failed = 0;
function check(label, cond) {
  process.stdout.write((cond ? "  ✅  " : "  ❌  ") + label + "\n");
  cond ? passed++ : failed++;
}

// [1] FR-02: 후보자 등록 (Phase 4)
console.log("\n[1] 후보자 등록 (FR-02)");
check("addCandidate Solidity 함수",          sol.includes("function addCandidate("));
check("removeCandidate Solidity 함수",       sol.includes("function removeCandidate("));
check("CandidateAdded 이벤트",               sol.includes("event CandidateAdded("));
check("CandidateRemoved 이벤트",             sol.includes("event CandidateRemoved("));
check("handleAddCandidate() 함수",           js.includes("function handleAddCandidate()"));
check("handleRemoveCandidate 전역 함수",     js.includes("window.handleRemoveCandidate"));
check("input-cand-name 입력 필드",           js.includes("input-cand-name"));
check("input-cand-url 입력 필드",            js.includes("input-cand-url"));
check("btn-add-cand 버튼",                  js.includes("btn-add-cand"));
check("이름 길이 검증 (1~50)",              js.includes("name.length < 1 || name.length > 50"));
check("URL http 검증",                      js.includes('url.startsWith("http'));
check("Google Drive 경고",                  js.includes("drive.google.com"));
check("addCandidate 트랜잭션 호출",         js.includes("state.contract.addCandidate(name"));
check("removeCandidate 트랜잭션 호출",      js.includes("state.contract.removeCandidate(i)"));

// [2] FR-02-4: 사진 미리보기
console.log("\n[2] 사진 URL 미리보기 (FR-02-4)");
check("updateImagePreview() 함수",           js.includes("function updateImagePreview("));
check("img-preview-wrap 요소",              js.includes("img-preview-wrap"));
check("img-preview 이미지 요소",            js.includes("img-preview-err"));
check("400ms debounce 타이머",              js.includes("setTimeout"));

// [3] FR-03: 투표 시작/종료 (Phase 5)
console.log("\n[3] 투표 시작/종료 (FR-03)");
check("startVoting Solidity 함수",          sol.includes("function startVoting()"));
check("endVoting Solidity 함수",            sol.includes("function endVoting()"));
check("VotingStarted 이벤트",               sol.includes("event VotingStarted()"));
check("VotingEnded 이벤트",                 sol.includes("event VotingEnded()"));
check("handleStartVoting() 함수",           js.includes("function handleStartVoting()"));
check("handleEndVoting() 함수",             js.includes("function handleEndVoting()"));
check("btn-start-voting 버튼",             js.includes("btn-start-voting"));
check("btn-end-voting 버튼",               js.includes("btn-end-voting"));
check("startVoting confirm 다이얼로그",     js.includes("투표를 시작하시겠습니까?"));
check("endVoting confirm 다이얼로그",       js.includes("투표를 종료하시겠습니까?"));
check("startVoting 트랜잭션 호출",          js.includes("state.contract.startVoting()"));
check("endVoting 트랜잭션 호출",            js.includes("state.contract.endVoting()"));
check("getVotingStatus() 갱신",             js.includes("state.contract.getVotingStatus()"));

// [4] SCR-01/SCR-02 렌더링
console.log("\n[4] SCR-01/SCR-02 렌더링");
check("renderSCR01() 함수",                 js.includes("function renderSCR01()"));
check("candidateCardHTML() 함수",           js.includes("function candidateCardHTML("));
check("adminPanelHTML() 함수",             js.includes("function adminPanelHTML()"));
check("adminCandidateItemHTML() 함수",     js.includes("function adminCandidateItemHTML("));
check("getStatusInfo() 함수",              js.includes("function getStatusInfo()"));
check("status-banner 요소",               js.includes("status-banner"));
check("candidate-grid 요소",              js.includes("candidate-grid"));
check("admin-panel 요소",                 js.includes("admin-panel"));
check("scr01-wrap 요소",                  js.includes("scr01-wrap"));
check("isOwner 조건부 admin 패널",        js.includes("state.isOwner ? adminPanelHTML()"));
check("후보자 없음 안내 문구",            js.includes("등록된 후보자가 없습니다"));
check("후보자 2명 이상 필요 안내",        js.includes("후보자 2명 이상 등록"));

// [5] XSS 방지
console.log("\n[5] XSS 방지");
check("escHtml() 함수",                    js.includes("function escHtml("));
check("& → &amp; 이스케이프",             js.includes("&amp;"));
check("< → &lt; 이스케이프",              js.includes("&lt;"));
check("> → &gt; 이스케이프",              js.includes("&gt;"));
check("candidateCardHTML에서 escHtml 사용", js.includes("escHtml(c.photoUrl)"));

// [6] 폴링 — 득표수 부분 갱신
console.log("\n[6] 폴링 득표수 갱신 (NFR-04-2)");
check("refreshVoteDisplay() 함수",          js.includes("function refreshVoteDisplay()"));
check("progress-fill id=pf-",              js.includes('"pf-${i}"'));
check("vote-count id=vc-",                 js.includes('"vc-${i}"'));
check("totalVotes 계산",                   js.includes("s + Number(c.voteCount)"));
check("status-banner strong 갱신",         js.includes(".status-banner strong"));

// [7] CSS 스타일
console.log("\n[7] Phase 4+5 CSS 스타일");
check(".scr01-wrap",           css.includes(".scr01-wrap"));
check(".status-banner",        css.includes(".status-banner"));
check(".status-banner-preparing", css.includes(".status-banner-preparing"));
check(".status-banner-ongoing",   css.includes(".status-banner-ongoing"));
check(".status-banner-ended",     css.includes(".status-banner-ended"));
check(".admin-panel",          css.includes(".admin-panel"));
check(".admin-panel-title",    css.includes(".admin-panel-title"));
check(".admin-section",        css.includes(".admin-section"));
check(".candidate-admin-item", css.includes(".candidate-admin-item"));
check(".cand-thumb",           css.includes(".cand-thumb"));
check(".cand-admin-name",      css.includes(".cand-admin-name"));
check(".img-preview-wrap",     css.includes(".img-preview-wrap"));
check(".img-preview",          css.includes(".img-preview"));

// [8] Phase 1~3 사이드이펙트 검증
console.log("\n[8] Phase 1~3 사이드이펙트 보존");
check("connectWallet() 보존",     js.includes("function connectWallet()"));
check("updateHeader() 보존",      js.includes("function updateHeader()"));
check("renderSCR00() 보존",       js.includes("function renderSCR00()"));
check("deployContract() 보존",    js.includes("function deployContract()"));
check("connectExisting() 보존",   js.includes("function connectExisting()"));
check("deployInProgress 보존",    js.includes("deployInProgress"));

console.log("\n══════════════════════════════════════");
console.log("Phase 4+5 정적 검증: 통과 " + passed + " / 실패 " + failed);
console.log("══════════════════════════════════════");
if (failed > 0) process.exit(1);
