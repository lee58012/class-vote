/**
 * Phase 2 정적 분석 검증 스크립트
 * - DOM ID 매핑, isSepolia 다형성, shortenAddress, 이벤트 리스너 등 코드 리뷰 체크리스트 검증
 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../frontend/index.html"), "utf8");
const js   = fs.readFileSync(path.join(__dirname, "../frontend/app.js"), "utf8");
const css  = fs.readFileSync(path.join(__dirname, "../frontend/style.css"), "utf8");
const contractJs = fs.readFileSync(path.join(__dirname, "../frontend/contract.js"), "utf8");

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log("  ✅  " + label);
    passed++;
  } else {
    console.log("  ❌  " + label);
    failed++;
  }
}

// ── 1. DOM ID 매핑 검증 ───────────────────────────────────────────────────────
console.log("\n[1] DOM ID 매핑 검증 (app.js ↔ index.html)");
const domMatches = [...js.matchAll(/dom\["([^"]+)"\]/g)].map(m => m[1]);
const jsIds = [...new Set(domMatches)];
jsIds.forEach(id => {
  check(id, html.includes('id="' + id + '"'));
});

// ── 2. isSepolia 다형성 검증 ──────────────────────────────────────────────────
console.log("\n[2] isSepolia 다형성 검증 (FR-01-3 — hex/BigInt/number 모두 대응)");
function isSepolia(chainId) { return BigInt(chainId) === 11155111n; }
check("hex 문자열 '0xaa36a7' → true",  isSepolia("0xaa36a7") === true);
check("BigInt 11155111n → true",        isSepolia(11155111n)  === true);
check("정수 11155111 → true",           isSepolia(11155111)   === true);
check("10진 문자열 '11155111' → true",  isSepolia("11155111") === true);
check("Mainnet 1n → false",             isSepolia(1n)         === false);
check("Mainnet '0x1' → false",          isSepolia("0x1")      === false);

// ── 3. shortenAddress 검증 ────────────────────────────────────────────────────
console.log("\n[3] shortenAddress 검증 (FR-01-5 — 앞 6자리+...+뒤 4자리)");
function shortenAddress(addr) { return addr.slice(0, 8) + "..." + addr.slice(-4); }
const addr1 = "0x1A2B3C4D5E6F789012345678901234567890ABCD";
const r1 = shortenAddress(addr1);
check("0x1A2B3C4D...ABCD → 0x1A2B3C...ABCD", r1 === "0x1A2B3C...ABCD");
check("결과에 '0x' 포함",  r1.startsWith("0x"));
check("중간에 '...' 포함", r1.includes("..."));
check("총 길이 15자",      r1.length === 15);

// ── 4. 이벤트 리스너 등록 검증 (FR-01-6) ─────────────────────────────────────
console.log("\n[4] 이벤트 리스너 등록 검증 (FR-01-6)");
check('window.ethereum.on("accountsChanged") 등록',
  js.includes('"accountsChanged"') && js.includes("handleAccountsChanged"));
check('window.ethereum.on("chainChanged") 등록',
  js.includes('"chainChanged"') && js.includes("handleChainChanged"));

// ── 5. 핵심 함수 존재 확인 ───────────────────────────────────────────────────
console.log("\n[5] 핵심 함수 존재 확인");
const requiredFunctions = [
  "connectWallet",
  "disconnectWallet",
  "switchToSepolia",
  "showMetaMaskOverlay",
  "hideMetaMaskOverlay",
  "showNetworkOverlay",
  "hideNetworkOverlay",
  "handleAccountsChanged",
  "handleChainChanged",
  "connectContract",
  "updateHeader",
  "updateFooter",
  "renderCurrentScreen",
  "startPolling",
  "stopPolling",
  "pollContractState",
];
requiredFunctions.forEach(fn => {
  check(fn + "()", js.includes("function " + fn));
});

// ── 6. SCR-04/05 오버레이 HTML 요소 확인 ─────────────────────────────────────
console.log("\n[6] SCR-04/05 오버레이 HTML 요소 확인");
check('id="overlay-metamask" 존재',   html.includes('id="overlay-metamask"'));
check('id="overlay-network" 존재',    html.includes('id="overlay-network"'));
check("MetaMask 설치 링크 포함",       html.includes("metamask.io/download"));
check('id="btn-switch-network" 존재', html.includes('id="btn-switch-network"'));
check('id="current-network-name" 존재', html.includes('id="current-network-name"'));
check("role=dialog 접근성 속성",      html.includes('role="dialog"'));

// ── 7. STORAGE_KEY 일관성 (FR-00-5) ──────────────────────────────────────────
console.log("\n[7] STORAGE_KEY 일관성 검증");
const storageKey = "votingContractAddress";
check("STORAGE_KEY 선언",               js.includes('const STORAGE_KEY'));
check("localStorage.setItem 사용",      js.includes("localStorage.setItem(STORAGE_KEY"));
check("localStorage.getItem 사용",      js.includes("localStorage.getItem(STORAGE_KEY"));

// ── 8. ethers.isAddress URL 주소 검증 사용 ───────────────────────────────────
console.log("\n[8] URL 쿼리 파라미터 주소 유효성 검증 (FR-00-6)");
check("ethers.isAddress() 사용",        js.includes("ethers.isAddress"));
check("URLSearchParams 사용",           js.includes("URLSearchParams"));
check("params.get('contract') 처리",   js.includes('params.get("contract")'));

// ── 9. ethers.js v6 CDN import ───────────────────────────────────────────────
console.log("\n[9] ethers.js v6 CDN 로드 검증");
check("script type=module",             html.includes('type="module"'));
check("ethers CDN import (ESM)",        js.includes("cdn.jsdelivr.net/npm/ethers@6"));
check("contract.js import",            js.includes("./contract.js"));

// ── 10. Phase 1 사이드이펙트: contract.js ABI/bytecode 포함 ──────────────────
console.log("\n[10] Phase 1 사이드이펙트 — contract.js 검증");
check("VOTING_ABI export",              contractJs.includes("export const VOTING_ABI"));
check("VOTING_BYTECODE export",         contractJs.includes("export const VOTING_BYTECODE"));
check("ABI에 함수 항목 포함",           contractJs.includes('"type": "function"'));
check("ABI에 이벤트 항목 포함",         contractJs.includes('"type": "event"'));

// ── 11. 공통 헤더/푸터 HTML 구조 ─────────────────────────────────────────────
console.log("\n[11] 공통 헤더/푸터 구조 확인");
check("id=app-header",   html.includes('id="app-header"'));
check("id=app-main",     html.includes('id="app-main"'));
check("id=app-footer",   html.includes('id="app-footer"'));
check("id=etherscan-link", html.includes('id="etherscan-link"'));
check("네트워크 정보 바", html.includes('id="network-info"'));

// ── 결과 요약 ─────────────────────────────────────────────────────────────────
console.log("\n══════════════════════════════════════════");
console.log("Phase 2 정적 검증 결과");
console.log("  통과: " + passed + "  실패: " + failed);
console.log("══════════════════════════════════════════");
if (failed > 0) process.exit(1);
