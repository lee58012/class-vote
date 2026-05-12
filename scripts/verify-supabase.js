/**
 * Supabase 통합 정적 분석 검증
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

// [1] 온체인 최소화 — Solidity
console.log("\n[1] 온체인 최소화 (Solidity)");
check("Candidate 구조체 voteCount만 포함",    sol.includes("uint256  voteCount") || sol.includes("uint256 voteCount"));
check("name 필드 없음 (오프체인)",             !sol.includes("string   name") && !sol.includes("string name"));
check("photoUrl 필드 없음 (오프체인)",         !sol.includes("string   photoUrl") && !sol.includes("string photoUrl"));
check("addCandidate() 인자 없음",             sol.includes("function addCandidate() external"));
check("CandidateAdded(candidateId만)",        sol.includes("event CandidateAdded(uint256 indexed candidateId)"));

// [2] Supabase 클라이언트
console.log("\n[2] Supabase 클라이언트");
check("supabase-js CDN import",              js.includes("esm.sh/@supabase/supabase-js"));
check("SUPABASE_URL 상수",                   js.includes("SUPABASE_URL"));
check("SUPABASE_ANON_KEY 상수",              js.includes("SUPABASE_ANON_KEY"));
check("createClient() 호출",                 js.includes("createClient(SUPABASE_URL"));

// [3] loadCandidates
console.log("\n[3] loadCandidates()");
check("loadCandidates() 함수",               js.includes("async function loadCandidates()"));
check("supabase.from(candidates) SELECT",    js.includes('.from("candidates")'));
check("contract_address 필터",              js.includes(".eq(\"contract_address\""));
check("ORDER BY id ascending",              js.includes("ascending: true"));
check("onChain + meta 병합",                js.includes("supabaseId:"));
check("voteCount 온체인에서",               js.includes("voteCount:  c.voteCount"));
check("name/photoUrl Supabase에서",         js.includes("meta?.[i]?.name"));

// [4] uploadCandidatePhoto
console.log("\n[4] uploadCandidatePhoto()");
check("uploadCandidatePhoto() 함수",         js.includes("async function uploadCandidatePhoto("));
check("supabase.storage.from(candidate-photos)", js.includes('from("candidate-photos")'));
check("upload() 호출",                      js.includes(".upload(filename, file"));
check("getPublicUrl() 호출",                js.includes("getPublicUrl(filename)"));

// [5] handleAddCandidate — 새 흐름
console.log("\n[5] handleAddCandidate 새 흐름");
check("파일 입력 (input-cand-photo)",        js.includes("input-cand-photo"));
check("파일 크기 5MB 제한",                 js.includes("5 * 1024 * 1024"));
check("uploadCandidatePhoto(file) 호출",    js.includes("await uploadCandidatePhoto(file)"));
check("contract.addCandidate() 인자 없음",  js.includes("state.contract.addCandidate()"));
check("CandidateAdded 이벤트 파싱",         js.includes('e?.name === "CandidateAdded"'));
check("event.args.candidateId",             js.includes("event.args.candidateId"));
check("supabase.from(candidates).insert",   js.includes(".insert({"));
check("photo_url 저장",                     js.includes("photo_url:        photoUrl"));
check("loadCandidates() 후 재렌더",         js.includes("await loadCandidates()"));
check("URL 입력 필드 없음",                 !js.includes("input-cand-url"));

// [6] handleRemoveCandidate — Supabase 동기화
console.log("\n[6] handleRemoveCandidate Supabase 동기화");
check("supabaseId 사용",                    js.includes("state.candidates[i]?.supabaseId"));
check("supabase.from.delete() 호출",        js.includes(".delete()"));
check("contract_address 조건 삭제",         js.includes(".eq(\"contract_address\", state.contractAddress"));

// [7] connectContract + pollContractState 통합
console.log("\n[7] connectContract/pollContractState 통합");
check("connectContract에서 loadCandidates", js.includes("await loadCandidates()"));
check("폴링은 voteCount만 갱신",            js.includes("state.candidates[i] = { ...state.candidates[i], voteCount: c.voteCount }"));
check("addCandidate(name, url) 사라짐",    !js.includes("addCandidate(name, url)") && !js.includes("addCandidate(name,url)"));

// [8] CSS
console.log("\n[8] CSS");
check(".form-input-file",                   css.includes(".form-input-file"));

// [9] 기존 기능 보존
console.log("\n[9] 기존 기능 보존");
check("deployContract() 보존",              js.includes("function deployContract()"));
check("connectExisting() 보존",             js.includes("function connectExisting()"));
check("handleVote() 보존",                  js.includes("async function handleVote("));
check("handleStartVoting() 보존",           js.includes("function handleStartVoting()"));
check("renderSCR03() 보존",                 js.includes("function renderSCR03()"));
check("escHtml() 보존",                     js.includes("function escHtml("));

console.log("\n══════════════════════════════════════");
console.log("Supabase 통합 검증: 통과 " + passed + " / 실패 " + failed);
console.log("══════════════════════════════════════");
if (failed > 0) process.exit(1);
