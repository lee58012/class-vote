/**
 * app.js — 온체인 투표 시스템 프론트엔드
 * Phase 2: 프로젝트 기반 구조 + MetaMask 지갑 연결
 *
 * Phase 3 이후 각 renderSCRxx() 함수 및 관련 로직이 이 파일에 추가됩니다.
 */

import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";
import { VOTING_ABI, VOTING_BYTECODE } from "./contract.js";

// ══════════════════════════════════════════════════════════════════════════════
// 상수
// ══════════════════════════════════════════════════════════════════════════════
const SEPOLIA_CHAIN_ID = 11155111n;          // BigInt — chainId 비교 기준
const SEPOLIA_HEX      = "0xaa36a7";         // wallet_switchEthereumChain 용
const STORAGE_KEY      = "votingContractAddress"; // localStorage 키 (단일 키 원칙)
const POLL_MS          = 10_000;             // 10초 폴링 주기 (NFR-04-2)

// ══════════════════════════════════════════════════════════════════════════════
// 앱 상태 (단일 진실의 원천)
// ══════════════════════════════════════════════════════════════════════════════
const state = {
  account:         null,   // 연결된 지갑 주소 (string | null)
  chainId:         null,   // 현재 네트워크 chainId (BigInt | null)
  provider:        null,   // ethers.BrowserProvider
  signer:          null,   // ethers.JsonRpcSigner
  contract:        null,   // ethers.Contract (read+write)
  contractAddress: null,   // 연결된 컨트랙트 주소 (string | null)
  isOwner:         false,  // 연결 지갑 === owner 여부
  hasVoted:        false,  // 연결 지갑의 투표 완료 여부
  votingStatus:    null,   // 0n=PREPARING 1n=ONGOING 2n=ENDED
  candidates:      [],     // Candidate[] (name, photoUrl, voteCount)
  pollingId:       null,   // setInterval ID
};

// ══════════════════════════════════════════════════════════════════════════════
// DOM 참조 (id → element)
// ══════════════════════════════════════════════════════════════════════════════
const dom = {};
[
  "btn-connect", "btn-disconnect", "wallet-address", "network-info",
  "contract-address-header", "app-main", "app-footer", "etherscan-link",
  "overlay-metamask", "overlay-network", "btn-switch-network",
  "current-network-name", "overlay-btn-connect", "overlay-btn-close",
].forEach(id => { dom[id] = document.getElementById(id); });

// ══════════════════════════════════════════════════════════════════════════════
// 유틸리티
// ══════════════════════════════════════════════════════════════════════════════

/**
 * FR-01-5: 0x1A2B3C4D... → 0x1A2B3C...3C4D
 * (앞 6자리 = 0x 포함 8자, 뒤 4자리)
 */
function shortenAddress(addr) {
  return addr.slice(0, 8) + "..." + addr.slice(-4);
}

/**
 * chainId 비교: hex 문자열 / BigInt / number 모두 대응
 * "0xaa36a7" / 11155111n / 11155111 → true
 */
function isSepolia(chainId) {
  return BigInt(chainId) === SEPOLIA_CHAIN_ID;
}

/** chainId → 사람이 읽기 좋은 네트워크 이름 */
function networkName(chainId) {
  const map = {
    1n:        "Ethereum Mainnet",
    5n:        "Goerli Testnet",
    11155111n: "Sepolia Testnet",
    137n:      "Polygon Mainnet",
    80001n:    "Mumbai Testnet",
    56n:       "BNB Chain Mainnet",
    43114n:    "Avalanche C-Chain",
    42161n:    "Arbitrum One",
    10n:       "Optimism",
  };
  const id = BigInt(chainId);
  return map[id] ?? `알 수 없는 네트워크 (Chain ID: ${id})`;
}

/** 화면 하단 토스트 메시지 */
function showToast(msg, ms = 3500) {
  const prev = document.querySelector(".toast");
  if (prev) prev.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ══════════════════════════════════════════════════════════════════════════════
// 오버레이 관리 (SCR-04, SCR-05)
// ══════════════════════════════════════════════════════════════════════════════
function showOverlay(el) { el.classList.remove("hidden"); }
function hideOverlay(el) { el.classList.add("hidden"); }

/** SCR-04: MetaMask 미설치/미연결 안내 (FR-01-2) */
function showMetaMaskOverlay() { showOverlay(dom["overlay-metamask"]); }
function hideMetaMaskOverlay() { hideOverlay(dom["overlay-metamask"]); }

/** SCR-05: 잘못된 네트워크 안내 (FR-01-3) */
function showNetworkOverlay(chainId) {
  dom["current-network-name"].textContent = networkName(chainId);
  showOverlay(dom["overlay-network"]);
}
function hideNetworkOverlay() { hideOverlay(dom["overlay-network"]); }

// ══════════════════════════════════════════════════════════════════════════════
// 헤더 업데이트 (FR-01-5)
// ══════════════════════════════════════════════════════════════════════════════
function updateHeader() {
  if (state.account) {
    dom["wallet-address"].textContent = shortenAddress(state.account);
    dom["wallet-address"].classList.remove("hidden");
    dom["btn-connect"].classList.add("hidden");
    dom["btn-disconnect"].classList.remove("hidden");

    // 컨트랙트 연결 + Sepolia 일 때 네트워크 정보 바 표시
    const showNetBar = !!state.contractAddress && isSepolia(state.chainId);
    dom["network-info"].classList.toggle("hidden", !showNetBar);
    if (showNetBar) {
      dom["contract-address-header"].textContent =
        `컨트랙트: ${shortenAddress(state.contractAddress)} 🔗`;
    }
  } else {
    dom["wallet-address"].classList.add("hidden");
    dom["btn-connect"].classList.remove("hidden");
    dom["btn-disconnect"].classList.add("hidden");
    dom["network-info"].classList.add("hidden");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 푸터 업데이트 (FR-05-5, NFR-02-2)
// ══════════════════════════════════════════════════════════════════════════════
function updateFooter() {
  if (state.contractAddress) {
    const href = `https://sepolia.etherscan.io/address/${state.contractAddress}`;
    dom["etherscan-link"].href = href;
    dom["etherscan-link"].textContent =
      `🔗 Etherscan에서 컨트랙트 확인 — ${state.contractAddress}`;
    dom["app-footer"].classList.remove("hidden");
  } else {
    dom["app-footer"].classList.add("hidden");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 컨트랙트 연결 (Phase 3+ 에서 배포/입력 후 호출)
// ══════════════════════════════════════════════════════════════════════════════
async function connectContract(address) {
  if (!ethers.isAddress(address)) {
    showToast("유효하지 않은 컨트랙트 주소입니다.");
    return false;
  }

  state.contractAddress = address;
  localStorage.setItem(STORAGE_KEY, address);

  // provider 또는 signer 로 Contract 인스턴스 생성
  const runner = state.signer ?? state.provider;
  if (!runner) {
    // provider 미연결 상태 — 주소만 저장 후 종료
    updateFooter();
    return true;
  }

  state.contract = new ethers.Contract(address, VOTING_ABI, runner);

  // 온체인 초기 상태 읽기
  try {
    state.votingStatus = await state.contract.getVotingStatus();
    state.candidates   = [...await state.contract.getCandidates()];

    if (state.account) {
      const ownerAddr  = await state.contract.owner();
      state.isOwner    = ownerAddr.toLowerCase() === state.account.toLowerCase();
      state.hasVoted   = await state.contract.hasVoted(state.account);
    }
  } catch (err) {
    console.error("컨트랙트 데이터 읽기 오류:", err);
  }

  updateFooter();
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// Sepolia 네트워크 전환 (SCR-05 전환 버튼)
// ══════════════════════════════════════════════════════════════════════════════
async function switchToSepolia() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX }],
    });
  } catch (err) {
    if (err.code === 4902) {
      // MetaMask에 Sepolia가 등록되지 않은 경우 직접 추가
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId:            SEPOLIA_HEX,
          chainName:          "Sepolia Testnet",
          nativeCurrency:     { name: "Sepolia ETH", symbol: "SEP", decimals: 18 },
          rpcUrls:            ["https://rpc.sepolia.org"],
          blockExplorerUrls:  ["https://sepolia.etherscan.io"],
        }],
      });
    } else if (err.code !== 4001) {
      showToast("네트워크 전환 중 오류가 발생했습니다.");
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 지갑 연결 (FR-01-1)
// ══════════════════════════════════════════════════════════════════════════════
async function connectWallet() {
  // FR-01-2: MetaMask 미설치 감지
  if (!window.ethereum) {
    showMetaMaskOverlay();
    return;
  }

  dom["btn-connect"].disabled = true;
  dom["btn-connect"].innerHTML =
    `<span class="spinner"></span> 연결 중...`;

  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    if (!accounts.length) return;

    state.provider = new ethers.BrowserProvider(window.ethereum);
    state.signer   = await state.provider.getSigner();
    state.account  = accounts[0];

    const network  = await state.provider.getNetwork();
    state.chainId  = network.chainId;

    // FR-01-3: Sepolia 네트워크 검증
    if (!isSepolia(state.chainId)) {
      showNetworkOverlay(state.chainId);
    } else {
      hideNetworkOverlay();
      hideMetaMaskOverlay();
      if (state.contractAddress) {
        await connectContract(state.contractAddress);
      }
    }

    updateHeader();
    renderCurrentScreen();
  } catch (err) {
    if (err.code === 4001) {
      showToast("서명이 취소되었습니다. 다시 시도해주세요.");
    } else {
      showToast("지갑 연결 중 오류가 발생했습니다. 다시 시도해주세요.");
    }
  } finally {
    dom["btn-connect"].disabled = false;
    dom["btn-connect"].textContent = "지갑 연결하기";
  }
}

/**
 * 연결 해제 — 로컬 상태만 초기화
 * (MetaMask 권한 취소는 MetaMask 설정에서 직접 수행)
 */
function disconnectWallet() {
  state.account  = null;
  state.signer   = null;
  state.isOwner  = false;
  state.hasVoted = false;

  // Contract 인스턴스를 read-only(provider)로 재연결
  if (state.contract && state.provider) {
    state.contract = new ethers.Contract(
      state.contractAddress, VOTING_ABI, state.provider
    );
  }

  updateHeader();
  renderCurrentScreen();
}

// ══════════════════════════════════════════════════════════════════════════════
// 폴링 관리 (NFR-04-2: 10초 주기)
// ══════════════════════════════════════════════════════════════════════════════
function startPolling() {
  stopPolling();
  state.pollingId = setInterval(pollContractState, POLL_MS);
}

function stopPolling() {
  if (state.pollingId !== null) {
    clearInterval(state.pollingId);
    state.pollingId = null;
  }
}

async function pollContractState() {
  if (!state.contract) return;
  try {
    const prevStatus = state.votingStatus;
    state.votingStatus = await state.contract.getVotingStatus();
    state.candidates   = [...await state.contract.getCandidates()];

    if (state.account) {
      state.hasVoted = await state.contract.hasVoted(state.account);
    }

    // 상태 변경 감지 시 화면 전환
    if (prevStatus !== state.votingStatus) {
      renderCurrentScreen();
    } else {
      refreshVoteDisplay();
    }
  } catch (err) {
    // 일시적 네트워크 오류 — 무한 에러 루프 없이 다음 인터벌에 재시도
    console.warn("폴링 오류 (다음 주기에 재시도):", err.message);
  }
}

/** 투표 중 득표수/프로그레스 바만 갱신 (화면 전체 재렌더 없이) — Phase 6에서 구현 */
function refreshVoteDisplay() {
  // Phase 6에서 채워짐
}

// ══════════════════════════════════════════════════════════════════════════════
// 화면 라우팅
// ══════════════════════════════════════════════════════════════════════════════
function renderCurrentScreen() {
  stopPolling();

  if (!state.contractAddress) {
    renderSCR00();
    return;
  }
  if (state.votingStatus === 2n) {
    renderSCR03();
    return;
  }
  renderSCR01();
  // 컨트랙트 연결 후 폴링 시작
  if (state.contract) startPolling();
}

// ══════════════════════════════════════════════════════════════════════════════
// SCR-00: 컨트랙트 배포 / 투표 연결 (Phase 3)
// ══════════════════════════════════════════════════════════════════════════════

// 배포 진행 중 플래그 — renderSCR00가 배포 UI를 덮어쓰는 것을 방지
let deployInProgress = false;

/** FR-00-8: 에러 타입별 한국어 안내 메시지 */
function getDeployErrorMsg(err) {
  const msg = err?.message?.toLowerCase() ?? "";
  if (
    err?.code === 4001 ||
    err?.code === "ACTION_REJECTED" ||
    err?.info?.error?.code === 4001 ||
    msg.includes("user rejected") ||
    msg.includes("user denied")
  ) return "서명이 취소되었습니다. 다시 시도해주세요.";

  if (
    err?.code === "INSUFFICIENT_FUNDS" ||
    msg.includes("insufficient funds")
  ) return "Sepolia ETH가 부족합니다. Faucet에서 테스트 ETH를 받아주세요.";

  return "네트워크 연결을 확인하고 다시 시도해주세요.";
}

/** 배포 카드 내부 상태 전환 (FR-00-3, FR-00-4, FR-00-7, FR-00-8) */
function setDeployCardState(status, address, errorMsg) {
  const btn      = document.getElementById("btn-deploy");
  const statusEl = document.getElementById("deploy-status");
  if (!btn || !statusEl) return;

  statusEl.className = "deploy-status";

  switch (status) {
    case "awaiting-signature":
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> MetaMask 서명 대기 중...`;
      statusEl.classList.add("deploy-status-info");
      statusEl.textContent = "⏳ MetaMask 서명 대기 중...";
      break;

    case "confirming":
      btn.innerHTML = `<span class="spinner"></span> 배포 중...`;
      statusEl.classList.add("deploy-status-info");
      statusEl.textContent =
        "⏳ 배포 트랜잭션 확인 중... (세폴리아 기준 약 12~15초 소요)";
      break;

    case "success": {
      // FR-00-7: 공유 링크 자동 생성
      const shareLink =
        `${window.location.origin}${window.location.pathname}?contract=${address}`;
      document.getElementById("card-deploy").innerHTML = `
        <div class="deploy-success">
          <div class="deploy-success-icon">✅</div>
          <h3>컨트랙트 배포 완료!</h3>

          <div class="form-group mt-4">
            <div class="form-label">컨트랙트 주소:</div>
            <div class="address-box">
              <code>${address}</code>
              <button class="btn btn-outline btn-sm"
                onclick="copyText('${address}', this, '주소 복사됨!')">
                📋 복사
              </button>
              <a href="https://sepolia.etherscan.io/address/${address}"
                 target="_blank" rel="noopener noreferrer"
                 class="btn btn-outline btn-sm">Etherscan 🔗</a>
            </div>
          </div>

          <div class="form-group">
            <div class="form-label">참여자에게 공유할 링크:</div>
            <div class="address-box">
              <code style="word-break:break-all">${shareLink}</code>
              <button class="btn btn-outline btn-sm"
                onclick="copyText('${shareLink}', this, '링크 복사됨!')">
                📋 복사
              </button>
            </div>
          </div>

          <button id="btn-goto-voting" class="btn btn-primary btn-block mt-4">
            ▶ 투표 관리 시작하기
          </button>
        </div>`;

      document.getElementById("btn-goto-voting").addEventListener("click", () => {
        deployInProgress = false;
        renderCurrentScreen();
      });
      break;
    }

    case "error":
      btn.disabled = false;
      btn.innerHTML = "🚀 새 투표 컨트랙트 배포하기";
      statusEl.classList.add("deploy-status-error");
      statusEl.textContent = "❌ " + errorMsg;
      deployInProgress = false;
      break;
  }
}

/** FR-00-1 ~ FR-00-4: 새 컨트랙트 배포 */
async function deployContract() {
  if (!state.signer) { showMetaMaskOverlay(); return; }

  deployInProgress = true;
  setDeployCardState("awaiting-signature");

  try {
    const factory  = new ethers.ContractFactory(VOTING_ABI, VOTING_BYTECODE, state.signer);
    const contract = await factory.deploy();           // MetaMask 팝업

    setDeployCardState("confirming");

    await contract.deploymentTransaction().wait();     // 블록 확인

    const address = await contract.getAddress();

    // FR-00-4: localStorage 저장
    state.contractAddress = address;
    localStorage.setItem(STORAGE_KEY, address);

    await connectContract(address);

    setDeployCardState("success", address);
    updateHeader();
    updateFooter();

  } catch (err) {
    setDeployCardState("error", null, getDeployErrorMsg(err));
  }
}

/** FR-00-6: 기존 컨트랙트 주소 직접 입력 후 연결 */
async function connectExisting() {
  const input   = document.getElementById("input-contract-addr");
  const errorEl = document.getElementById("connect-error");
  const btn     = document.getElementById("btn-connect-existing");
  const address = input?.value.trim() ?? "";

  errorEl.textContent = "";
  errorEl.classList.add("hidden");

  if (!address) {
    errorEl.textContent = "컨트랙트 주소를 입력해주세요.";
    errorEl.classList.remove("hidden");
    return;
  }
  if (!ethers.isAddress(address)) {
    errorEl.textContent =
      "유효하지 않은 이더리움 주소입니다. 0x로 시작하는 42자리 주소를 입력하세요.";
    errorEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner spinner-dark"></span> 연결 중...`;

  try {
    const ok = await connectContract(address);
    if (ok) renderCurrentScreen();
  } catch {
    errorEl.textContent = "컨트랙트 연결 중 오류가 발생했습니다. 주소를 확인해주세요.";
    errorEl.classList.remove("hidden");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "연결하기"; }
  }
}

/** 클립보드 복사 헬퍼 (onclick 속성에서 전역 접근) */
window.copyText = async function copyText(text, btn, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.innerHTML;
    btn.textContent = "✅ " + successMsg;
    btn.disabled = true;
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
  } catch {
    showToast("클립보드 복사에 실패했습니다.");
  }
};

/* SCR-00: 컨트랙트 배포 / 투표 연결 화면 (FR-00-1 ~ FR-00-8) */
function renderSCR00() {
  if (deployInProgress) return; // 배포 중 UI 보호

  dom["app-main"].innerHTML = `
    <div class="scr00-wrap">
      <p class="text-center text-muted mb-4">
        투표를 시작하려면 컨트랙트를 배포하거나, 참여할 투표 주소를 입력하세요.
      </p>

      <!-- 새 투표 만들기 (FR-00-1) -->
      <div class="card" id="card-deploy">
        <div class="card-title">🚀 새 투표 만들기 (새 컨트랙트 배포)</div>
        <p class="text-muted mb-4">
          MetaMask로 연결된 지갑이 이 투표의 관리자가 됩니다.<br>
          배포 시 Sepolia 테스트넷 가스비가 발생합니다.
        </p>
        <div id="deploy-status" class="deploy-status hidden"></div>
        <button id="btn-deploy" class="btn btn-primary btn-block"
          ${!state.account ? "disabled" : ""}>
          🚀 새 투표 컨트랙트 배포하기
        </button>
        <p class="text-muted mt-2" style="font-size:0.8rem">
          ※ 지갑이 연결되지 않은 경우 버튼이 비활성화됩니다.
        </p>
      </div>

      <div class="divider"></div>

      <!-- 기존 투표에 참여하기 (FR-00-6) -->
      <div class="card">
        <div class="card-title">🔗 기존 투표에 참여하기 (컨트랙트 주소 직접 입력)</div>
        <div class="form-group">
          <label class="form-label" for="input-contract-addr">컨트랙트 주소:</label>
          <input type="text" id="input-contract-addr" class="form-input"
            placeholder="0x..." autocomplete="off" spellcheck="false">
          <div id="connect-error" class="form-error hidden"></div>
        </div>
        <button id="btn-connect-existing" class="btn btn-primary">연결하기</button>
      </div>
    </div>`;

  document.getElementById("btn-deploy")
    .addEventListener("click", deployContract);
  document.getElementById("btn-connect-existing")
    .addEventListener("click", connectExisting);
  document.getElementById("input-contract-addr")
    .addEventListener("keydown", e => { if (e.key === "Enter") connectExisting(); });
}

// ══════════════════════════════════════════════════════════════════════════════
// SCR-01 + SCR-02: 메인 투표 화면 + 관리자 패널 (Phase 4~6)
// ══════════════════════════════════════════════════════════════════════════════

/** 투표 상태에 따른 뱃지·레이블 반환 */
function getStatusInfo() {
  switch (state.votingStatus) {
    case 0n: return { key: "preparing", label: "🟡 준비 중",  cls: "badge-preparing" };
    case 1n: return { key: "ongoing",   label: "🟢 진행 중",  cls: "badge-ongoing"   };
    case 2n: return { key: "ended",     label: "🔴 종료",     cls: "badge-ended"     };
    default: return { key: "preparing", label: "⏳ 확인 중...", cls: "badge-preparing" };
  }
}

/** 후보자 카드 HTML (득표 프로그레스 바 포함) — Phase 6에서 투표 버튼 추가 */
function candidateCardHTML(c, i, totalVotes) {
  const pct = totalVotes > 0 ? Math.round(Number(c.voteCount) / totalVotes * 100) : 0;
  return `
    <div class="candidate-card" id="cand-card-${i}">
      <img src="${escHtml(c.photoUrl)}" alt="${escHtml(c.name)}"
        class="candidate-photo"
        onerror="this.style.display='none';document.getElementById('cph-${i}').style.display='flex'">
      <div class="candidate-photo-placeholder" id="cph-${i}" style="display:none">👤</div>
      <div class="candidate-name">${escHtml(c.name)}</div>
      <div class="progress-bar">
        <div class="progress-fill" id="pf-${i}" style="width:${pct}%"></div>
      </div>
      <div class="vote-count" id="vc-${i}">${pct}% · ${c.voteCount}표</div>
      <div id="vote-btn-${i}" class="mt-2"><!-- Phase 6: 투표 버튼 --></div>
    </div>`;
}

/** 관리자 패널 후보자 목록의 각 아이템 HTML */
function adminCandidateItemHTML(c, i, canEdit) {
  return `
    <div class="candidate-admin-item" id="admin-cand-${i}">
      <span class="cand-num">${i + 1}.</span>
      <img src="${escHtml(c.photoUrl)}" alt=""
        class="cand-thumb"
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>'">
      <span class="cand-admin-name">${escHtml(c.name)}</span>
      <button class="btn btn-sm btn-danger"
        id="btn-remove-${i}"
        ${canEdit ? "" : "disabled"}
        onclick="handleRemoveCandidate(${i})">✕</button>
    </div>`;
}

/** 관리자 패널 HTML (Phase 4: 후보자 등록, Phase 5: 투표 제어) */
function adminPanelHTML() {
  const isPreparing = state.votingStatus === 0n;
  const isOngoing   = state.votingStatus === 1n;
  const candCount   = state.candidates.length;

  return `
    <div class="admin-panel">
      <div class="admin-panel-title">⚙️ 관리자 패널</div>

      <!-- ── 후보자 등록 폼 (PREPARING만) ── -->
      <div class="card admin-section">
        <div class="card-title">후보자 등록
          ${!isPreparing ? '<span class="badge badge-ended" style="font-size:0.7rem">투표 시작 후 잠금</span>' : ""}
        </div>
        ${isPreparing ? `
          <div class="form-group">
            <label class="form-label" for="input-cand-name">이름 (1~50자)</label>
            <input type="text" id="input-cand-name" class="form-input"
              maxlength="50" placeholder="후보자 이름">
            <div id="cand-name-err" class="form-error hidden"></div>
          </div>
          <div class="form-group">
            <label class="form-label" for="input-cand-url">사진 URL (https://...)</label>
            <input type="text" id="input-cand-url" class="form-input"
              placeholder="https://example.com/photo.jpg"
              autocomplete="off">
            <div id="cand-url-err" class="form-error hidden"></div>
            <div id="img-preview-wrap" class="img-preview-wrap hidden">
              <img id="img-preview" class="img-preview" alt="미리보기">
              <p id="img-preview-err" class="form-error hidden">
                이미지를 불러올 수 없습니다. 직접 임베드 가능한 URL을 사용하세요.<br>
                (imgur, GitHub raw 파일 권장 — Google Drive 링크 불가)
              </p>
            </div>
          </div>
          <button id="btn-add-cand" class="btn btn-primary">+ 후보자 등록</button>
        ` : `<p class="text-muted">투표가 시작된 후에는 후보자를 등록할 수 없습니다.</p>`}
      </div>

      <!-- ── 등록된 후보자 목록 ── -->
      <div class="card admin-section">
        <div class="card-title">등록된 후보자 목록
          <span class="text-muted" style="font-size:0.85rem">현재 ${candCount}명</span>
        </div>
        <div id="admin-cand-list">
          ${candCount === 0
            ? '<p class="text-muted">등록된 후보자가 없습니다.</p>'
            : state.candidates.map((c, i) => adminCandidateItemHTML(c, i, isPreparing)).join("")}
        </div>
        ${!isPreparing ? '<p class="text-muted mt-2" style="font-size:0.8rem">투표 시작 후 삭제 불가</p>' : ""}
      </div>

      <!-- ── 투표 제어 ── -->
      <div class="card admin-section">
        <div class="card-title">투표 제어</div>
        <div class="flex-between mb-4">
          <span>현재 상태:</span>
          <span class="badge ${getStatusInfo().cls}">${getStatusInfo().label}</span>
        </div>
        <div class="flex gap-2">
          <button id="btn-start-voting" class="btn btn-success"
            ${isPreparing && candCount >= 2 ? "" : "disabled"}>
            ▶ 투표 시작
          </button>
          <button id="btn-end-voting" class="btn btn-danger"
            ${isOngoing ? "" : "disabled"}>
            ■ 투표 종료
          </button>
        </div>
        ${isPreparing && candCount < 2
          ? '<p class="text-muted mt-2" style="font-size:0.8rem">후보자 2명 이상 등록 시 시작 가능</p>'
          : ""}
        <div id="voting-ctrl-status" class="deploy-status hidden mt-2"></div>
      </div>
    </div>`;
}

/** XSS 방지용 HTML 이스케이프 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* SCR-01: 메인 투표 화면 (SCR-02 관리자 패널 포함) */
function renderSCR01() {
  const si         = getStatusInfo();
  const totalVotes = state.candidates.reduce((s, c) => s + Number(c.voteCount), 0);

  dom["app-main"].innerHTML = `
    <div class="scr01-wrap">

      <!-- 상태 배너 -->
      <div class="status-banner status-banner-${si.key}">
        <span class="badge ${si.cls}">${si.label}</span>
        <span class="text-muted">총 투표수: <strong>${totalVotes}</strong>표</span>
      </div>

      <!-- 후보자 카드 -->
      <div class="candidate-grid" id="candidate-grid">
        ${state.candidates.length === 0
          ? '<p class="text-muted text-center" style="grid-column:1/-1;padding:40px 0">등록된 후보자가 없습니다.</p>'
          : state.candidates.map((c, i) => candidateCardHTML(c, i, totalVotes)).join("")}
      </div>

      <!-- 관리자 패널 (owner만) -->
      ${state.isOwner ? adminPanelHTML() : ""}

    </div>`;

  bindSCR01Events();
}

/** SCR-01 이벤트 바인딩 (innerHTML 교체 후 매번 재등록) */
function bindSCR01Events() {
  // 후보자 등록 (Phase 4)
  const btnAdd = document.getElementById("btn-add-cand");
  if (btnAdd) {
    btnAdd.addEventListener("click", handleAddCandidate);

    // 사진 URL 실시간 미리보기 (FR-02-4)
    const urlInput = document.getElementById("input-cand-url");
    let previewTimer = null;
    urlInput?.addEventListener("input", () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => updateImagePreview(urlInput.value.trim()), 400);
    });
  }

  // 투표 시작/종료 (Phase 5)
  document.getElementById("btn-start-voting")?.addEventListener("click", handleStartVoting);
  document.getElementById("btn-end-voting")?.addEventListener("click", handleEndVoting);

  // Phase 6: 투표 버튼 바인딩
  bindVoteButtons();
}

// ── Phase 4: 후보자 등록 ─────────────────────────────────────────────────────

/** FR-02-4: 사진 URL 실시간 미리보기 */
function updateImagePreview(url) {
  const wrap  = document.getElementById("img-preview-wrap");
  const img   = document.getElementById("img-preview");
  const errEl = document.getElementById("img-preview-err");
  if (!wrap || !img) return;

  if (!url || !url.startsWith("http")) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  errEl.classList.add("hidden");
  img.style.display = "block";
  img.src = url;
  img.onerror = () => {
    img.style.display = "none";
    errEl.classList.remove("hidden");
  };
  img.onload = () => {
    img.style.display = "block";
    errEl.classList.add("hidden");
  };
}

/** FR-02-1, FR-02-2, FR-02-3: 후보자 등록 트랜잭션 */
async function handleAddCandidate() {
  const nameEl  = document.getElementById("input-cand-name");
  const urlEl   = document.getElementById("input-cand-url");
  const nameErr = document.getElementById("cand-name-err");
  const urlErr  = document.getElementById("cand-url-err");
  const btn     = document.getElementById("btn-add-cand");

  const name = nameEl?.value.trim() ?? "";
  const url  = urlEl?.value.trim()  ?? "";

  // 프론트엔드 유효성 검증
  let valid = true;
  nameErr.textContent = ""; nameErr.classList.add("hidden");
  urlErr.textContent  = ""; urlErr.classList.add("hidden");

  if (name.length < 1 || name.length > 50) {
    nameErr.textContent = "이름은 1자 이상 50자 이하여야 합니다.";
    nameErr.classList.remove("hidden");
    valid = false;
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    urlErr.textContent = "사진 URL은 http:// 또는 https://로 시작해야 합니다.";
    urlErr.classList.remove("hidden");
    valid = false;
  }
  if (url.toLowerCase().includes("drive.google.com")) {
    urlErr.textContent = "Google Drive 링크는 <img> 직접 임베드 불가합니다. imgur 또는 GitHub raw URL을 사용하세요.";
    urlErr.classList.remove("hidden");
    valid = false;
  }
  if (!valid) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> 등록 중...`;

  try {
    const tx = await state.contract.addCandidate(name, url);
    await tx.wait();
    // 온체인 상태 갱신
    state.candidates = [...await state.contract.getCandidates()];
    renderSCR01();
    showToast(`✅ ${name} 등록 완료`);
  } catch (err) {
    showToast("후보자 등록 실패: " + (err.reason ?? err.message ?? "오류 발생"));
    btn.disabled = false;
    btn.textContent = "+ 후보자 등록";
  }
}

/** FR-02-6: 후보자 삭제 트랜잭션 (전역 — onclick에서 호출) */
window.handleRemoveCandidate = async function(i) {
  if (!window.confirm(`"${state.candidates[i]?.name}" 을(를) 삭제하시겠습니까?`)) return;
  const btn = document.getElementById(`btn-remove-${i}`);
  if (btn) { btn.disabled = true; btn.textContent = "..."; }
  try {
    const tx = await state.contract.removeCandidate(i);
    await tx.wait();
    state.candidates = [...await state.contract.getCandidates()];
    renderSCR01();
    showToast("후보자가 삭제되었습니다.");
  } catch (err) {
    showToast("삭제 실패: " + (err.reason ?? err.message ?? "오류 발생"));
    renderSCR01();
  }
};

// ── Phase 5: 투표 시작/종료 ──────────────────────────────────────────────────

/** FR-03-5: 확인 다이얼로그 → 트랜잭션 */
async function handleStartVoting() {
  if (!window.confirm(
    "투표를 시작하시겠습니까?\n시작 후에는 후보자를 추가하거나 삭제할 수 없습니다."
  )) return;

  const btn      = document.getElementById("btn-start-voting");
  const statusEl = document.getElementById("voting-ctrl-status");
  btn.disabled   = true;
  btn.innerHTML  = `<span class="spinner"></span> 처리 중...`;
  statusEl.className = "deploy-status deploy-status-info";
  statusEl.textContent = "⏳ MetaMask 서명 대기 중...";

  try {
    const tx = await state.contract.startVoting();
    statusEl.textContent = "⏳ 트랜잭션 확인 중...";
    await tx.wait();
    state.votingStatus = await state.contract.getVotingStatus();
    renderCurrentScreen();
    showToast("🟢 투표가 시작되었습니다.");
  } catch (err) {
    statusEl.className = "deploy-status deploy-status-error";
    statusEl.textContent = "❌ " + (err.reason ?? getDeployErrorMsg(err));
    btn.disabled = false;
    btn.innerHTML = "▶ 투표 시작";
  }
}

async function handleEndVoting() {
  if (!window.confirm(
    "투표를 종료하시겠습니까?\n종료 후에는 재시작이 불가능합니다."
  )) return;

  const btn      = document.getElementById("btn-end-voting");
  const statusEl = document.getElementById("voting-ctrl-status");
  btn.disabled   = true;
  btn.innerHTML  = `<span class="spinner"></span> 처리 중...`;
  statusEl.className = "deploy-status deploy-status-info";
  statusEl.textContent = "⏳ MetaMask 서명 대기 중...";

  try {
    const tx = await state.contract.endVoting();
    statusEl.textContent = "⏳ 트랜잭션 확인 중...";
    await tx.wait();
    state.votingStatus = await state.contract.getVotingStatus();
    state.candidates   = [...await state.contract.getCandidates()];
    renderCurrentScreen();
    showToast("🔴 투표가 종료되었습니다.");
  } catch (err) {
    statusEl.className = "deploy-status deploy-status-error";
    statusEl.textContent = "❌ " + (err.reason ?? getDeployErrorMsg(err));
    btn.disabled = false;
    btn.innerHTML = "■ 투표 종료";
  }
}

// ── Phase 5: 폴링 — 득표수 부분 갱신 ────────────────────────────────────────

/** 10초 폴링 시 후보자 카드 득표수·프로그레스 바만 업데이트 (전체 재렌더 없이) */
function refreshVoteDisplay() {
  const totalVotes = state.candidates.reduce((s, c) => s + Number(c.voteCount), 0);

  // 상태 배너 총 투표수
  const bannerCount = document.querySelector(".status-banner strong");
  if (bannerCount) bannerCount.textContent = totalVotes;

  state.candidates.forEach((c, i) => {
    const pct     = totalVotes > 0 ? Math.round(Number(c.voteCount) / totalVotes * 100) : 0;
    const pfEl    = document.getElementById(`pf-${i}`);
    const vcEl    = document.getElementById(`vc-${i}`);
    if (pfEl) pfEl.style.width     = `${pct}%`;
    if (vcEl) vcEl.textContent     = `${pct}% · ${c.voteCount}표`;
  });
}

/** Phase 6에서 구현 — 투표 버튼 바인딩 플레이스홀더 */
function bindVoteButtons() {
  // Phase 6에서 채워짐
}

/* SCR-03: Phase 7에서 구현 */
function renderSCR03() {
  dom["app-main"].innerHTML = `
    <div class="placeholder-screen">
      <p style="font-size:2.5rem">🏆</p>
      <h2>투표 결과 화면</h2>
      <p class="text-muted mt-4">컨트랙트: <code>${state.contractAddress}</code></p>
      <p class="mt-4" style="font-size:0.8rem; color:var(--color-text-light)">
        📌 SCR-03 — Phase 7에서 구현됩니다
      </p>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MetaMask 이벤트 핸들러 (FR-01-6)
// ══════════════════════════════════════════════════════════════════════════════

/** 계정 변경 — 헤더 즉시 갱신 */
async function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    // MetaMask에서 연결 해제
    disconnectWallet();
    return;
  }

  const newAccount = accounts[0];
  if (newAccount.toLowerCase() === state.account?.toLowerCase()) return;

  state.account = newAccount;

  if (state.provider) {
    state.signer = await state.provider.getSigner();
    // 컨트랙트 인스턴스를 새 signer로 재연결
    if (state.contractAddress) {
      await connectContract(state.contractAddress);
    }
  }

  updateHeader();
  renderCurrentScreen();
}

/** 네트워크 변경 — SCR-05 오버레이 토글 */
async function handleChainChanged(chainIdHex) {
  // chainChanged 파라미터는 항상 hex 문자열 ("0xaa36a7")
  state.chainId = BigInt(chainIdHex);

  if (!isSepolia(state.chainId)) {
    showNetworkOverlay(state.chainId);
    stopPolling();
  } else {
    hideNetworkOverlay();
    // 새 네트워크에 맞춰 provider/signer 재설정
    state.provider = new ethers.BrowserProvider(window.ethereum);
    if (state.account) {
      state.signer = await state.provider.getSigner();
    }
    if (state.contractAddress) {
      await connectContract(state.contractAddress);
    }
    updateHeader();
    renderCurrentScreen();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 앱 초기화
// ══════════════════════════════════════════════════════════════════════════════
async function init() {
  // FR-00-6, FR-00-5: URL 쿼리 파라미터 → localStorage → SCR-00 순서
  const params    = new URLSearchParams(window.location.search);
  const qAddr     = params.get("contract");
  const stored    = localStorage.getItem(STORAGE_KEY);

  // 유효한 이더리움 주소인지 검증 (ethers.isAddress)
  const initAddr  = (qAddr   && ethers.isAddress(qAddr))   ? qAddr
                  : (stored  && ethers.isAddress(stored))  ? stored
                  : null;

  if (initAddr) {
    state.contractAddress = initAddr;
    // URL 파라미터로 진입 시 localStorage 동기화
    if (qAddr && ethers.isAddress(qAddr)) {
      localStorage.setItem(STORAGE_KEY, qAddr);
    }
    updateFooter();
  }

  // FR-01-2: MetaMask 미설치 → 기본 화면만 렌더링
  if (!window.ethereum) {
    updateHeader();
    renderCurrentScreen();
    return;
  }

  // FR-01-6: 이벤트 리스너 등록 (accountsChanged, chainChanged)
  window.ethereum.on("accountsChanged", handleAccountsChanged);
  window.ethereum.on("chainChanged",    handleChainChanged);

  // 이미 연결된 계정 확인 (팝업 없이 — eth_accounts vs eth_requestAccounts)
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });

    if (accounts.length > 0) {
      state.provider = new ethers.BrowserProvider(window.ethereum);
      state.signer   = await state.provider.getSigner();
      state.account  = accounts[0];

      const network  = await state.provider.getNetwork();
      state.chainId  = network.chainId;

      if (!isSepolia(state.chainId)) {
        // FR-01-3: 세폴리아 외 네트워크 — 오버레이 표시
        showNetworkOverlay(state.chainId);
      } else if (initAddr) {
        await connectContract(initAddr);
      }
    }
  } catch {
    // 연결 정보 없음 — 정상적인 미연결 초기 상태
  }

  updateHeader();
  renderCurrentScreen();
}

// ══════════════════════════════════════════════════════════════════════════════
// 이벤트 바인딩
// ══════════════════════════════════════════════════════════════════════════════
dom["btn-connect"].addEventListener("click", connectWallet);
dom["btn-disconnect"].addEventListener("click", disconnectWallet);
dom["btn-switch-network"].addEventListener("click", switchToSepolia);

dom["overlay-btn-connect"].addEventListener("click", () => {
  hideMetaMaskOverlay();
  connectWallet();
});
dom["overlay-btn-close"].addEventListener("click", hideMetaMaskOverlay);

// ══════════════════════════════════════════════════════════════════════════════
// 앱 시작
// ══════════════════════════════════════════════════════════════════════════════
init().catch(err => console.error("초기화 오류:", err));

// ══════════════════════════════════════════════════════════════════════════════
// Phase 3+ 에서 참조하는 내보내기
// ══════════════════════════════════════════════════════════════════════════════
export {
  ethers,
  state,
  dom,
  VOTING_ABI,
  VOTING_BYTECODE,
  STORAGE_KEY,
  POLL_MS,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_HEX,
  shortenAddress,
  isSepolia,
  connectContract,
  updateHeader,
  updateFooter,
  renderCurrentScreen,
  startPolling,
  stopPolling,
  showToast,
  showMetaMaskOverlay,
  hideMetaMaskOverlay,
};
