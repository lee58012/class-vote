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

/* SCR-00: Phase 3에서 구현 */
function renderSCR00() {
  dom["app-main"].innerHTML = `
    <div class="placeholder-screen">
      <p style="font-size:2.5rem">🗳️</p>
      <h2>온체인 투표 시스템</h2>
      <p class="text-muted mt-4">
        투표를 시작하려면 컨트랙트를 배포하거나<br>참여할 투표 주소를 입력하세요.
      </p>
      <p class="mt-6" style="font-size:0.8rem; color:var(--color-text-light)">
        📌 SCR-00 — Phase 3에서 구현됩니다
      </p>
    </div>`;
}

/* SCR-01: Phase 6에서 구현 */
function renderSCR01() {
  const status = state.votingStatus === 1n ? "🟢 진행 중"
               : state.votingStatus === 0n ? "🟡 준비 중"
               : "⏳ 확인 중...";
  dom["app-main"].innerHTML = `
    <div class="placeholder-screen">
      <p style="font-size:1.5rem">${status}</p>
      <h2>메인 투표 화면</h2>
      <p class="text-muted mt-4">컨트랙트: <code>${state.contractAddress}</code></p>
      <p class="mt-4" style="font-size:0.8rem; color:var(--color-text-light)">
        📌 SCR-01/02 — Phase 4~6에서 구현됩니다
      </p>
    </div>`;
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
