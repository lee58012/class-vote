/**
 * Phase 3 정적 분석 검증
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

// [1] FR-00-1~3: 배포 흐름
console.log("\n[1] 컨트랙트 배포 흐름 (FR-00-1 ~ FR-00-3)");
check("ContractFactory 사용",              js.includes("ContractFactory"));
check("factory.deploy() 호출",             js.includes("factory.deploy()"));
check("deploymentTransaction().wait()",    js.includes("deploymentTransaction().wait()"));
check("awaiting-signature 상태 표시",      js.includes('"awaiting-signature"'));
check("confirming 상태 표시",              js.includes('"confirming"'));
check("MetaMask 서명 대기 중 텍스트",       js.includes("MetaMask 서명 대기 중"));
check("배포 트랜잭션 확인 중 텍스트",       js.includes("배포 트랜잭션 확인 중"));

// [2] FR-00-4: 주소 표시 + localStorage 저장
console.log("\n[2] 배포 완료 처리 (FR-00-4)");
check("getAddress() 호출",                 js.includes("getAddress()"));
check("localStorage.setItem(STORAGE_KEY", js.includes("localStorage.setItem(STORAGE_KEY"));
check("success 상태 카드 렌더링",           js.includes("case \"success\":"));
check("Etherscan 링크 포함",               js.includes("sepolia.etherscan.io/address/"));

// [3] FR-00-7: 공유 링크 생성
console.log("\n[3] 공유 링크 자동 생성 (FR-00-7)");
check("window.location.origin 사용",       js.includes("window.location.origin"));
check("window.location.pathname 사용",     js.includes("window.location.pathname"));
check("?contract= 쿼리 파라미터 포함",     js.includes("?contract="));
check("링크 복사 버튼",                    js.includes("링크 복사됨"));

// [4] FR-00-6: 기존 주소 입력 + 연결
console.log("\n[4] 기존 컨트랙트 연결 (FR-00-6)");
check("connectExisting() 함수",            js.includes("function connectExisting()"));
check("ethers.isAddress() 주소 검증",      js.includes("ethers.isAddress(address)"));
check("input-contract-addr 입력 필드",     js.includes("input-contract-addr"));
check("Enter 키 처리",                     js.includes('e.key === "Enter"'));
check("잘못된 주소 오류 메시지",            js.includes("유효하지 않은 이더리움 주소"));

// [5] FR-00-8: 배포 실패 메시지
console.log("\n[5] 배포 실패 안내 (FR-00-8)");
check("서명 취소 메시지",                  js.includes("서명이 취소되었습니다"));
check("잔액 부족 메시지",                  js.includes("Sepolia ETH가 부족합니다"));
check("Faucet 안내",                       js.includes("Faucet"));
check("네트워크 오류 메시지",              js.includes("네트워크 연결을 확인"));
check("ACTION_REJECTED 처리",              js.includes("ACTION_REJECTED"));
check("insufficient funds 처리",          js.includes("insufficient funds"));

// [6] 배포 UI 보호
console.log("\n[6] 배포 중 UI 보호 (deployInProgress)");
check("deployInProgress 플래그",           js.includes("deployInProgress"));
check("배포 중 renderSCR00 진입 차단",     js.includes("if (deployInProgress) return"));

// [7] SCR-00 HTML 구조
console.log("\n[7] SCR-00 HTML 구조");
check("scr00-wrap 컨테이너",              js.includes("scr00-wrap"));
check("card-deploy 배포 카드",            js.includes("id=\"card-deploy\""));
check("btn-deploy 배포 버튼",             js.includes("id=\"btn-deploy\""));
check("deploy-status 상태 표시",          js.includes("id=\"deploy-status\""));
check("btn-goto-voting 관리 시작 버튼",   js.includes("btn-goto-voting"));
check("지갑 미연결 시 버튼 disabled",     js.includes("!state.account ?"));

// [8] CSS 스타일
console.log("\n[8] SCR-00 CSS 스타일");
check(".scr00-wrap",     css.includes(".scr00-wrap"));
check(".btn-sm",         css.includes(".btn-sm"));
check(".deploy-status",  css.includes(".deploy-status"));
check(".deploy-success", css.includes(".deploy-success"));
check(".address-box",    css.includes(".address-box"));

// [9] Phase 2 사이드이펙트: 기존 함수 보존
console.log("\n[9] Phase 2 사이드이펙트 검증");
check("connectWallet() 보존",   js.includes("function connectWallet()"));
check("updateHeader() 보존",    js.includes("function updateHeader()"));
check("showMetaMaskOverlay 보존",js.includes("function showMetaMaskOverlay()"));
check("handleChainChanged 보존",js.includes("function handleChainChanged("));

console.log("\n══════════════════════════════════════");
console.log("Phase 3 정적 검증: 통과 " + passed + " / 실패 " + failed);
console.log("══════════════════════════════════════");
if (failed > 0) process.exit(1);
