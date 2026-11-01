# 🏛️ ClubTreasury Pro — Trustworthy Decentralized Club Accounting & Treasury

> **VIBECHAIN – The Ultimate Blockchain Challenge | MERAZ 7.0 (DSC × BIB) @ IIT Bhilai**  
> *Track: Trustworthy Club Treasury*

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Solidity](https://img.shields.io/badge/solidity-^0.8.20-brightgreen.svg)
![Hardhat](https://img.shields.io/badge/framework-Hardhat-yellow.svg)
![Frontend](https://img.shields.io/badge/frontend-React%20%7C%20TailwindCSS%20%7C%20Vite-blueviolet.svg)
![Network](https://img.shields.io/badge/network-Ethereum%20Sepolia-orange.svg)

---

## 1. Project Overview & The Problem

Student clubs, collegiate organizations, and hackathon committees collect and disburse millions of rupees annually for equipment, catering, venue rentals, and prize pools. In practice:
- **Centralized Custody Risk:** Funds sit in personal bank accounts or UPI handles (Google Pay, PhonePe) controlled by one or two individuals.
- **Opacity & Lost Receipts:** Expense requests occur in informal WhatsApp chats. Months later, receipts vanish, and members cannot verify who authorized expenditures or whether vendors were actually paid.
- **Trust-Based Governance:** If an admin misappropriates funds or overspends, there is zero programmatic prevention.

### The Solution: ClubTreasury Pro
**ClubTreasury Pro** replaces opaque human trust with immutable mathematical guarantees on the Ethereum blockchain. It acts as an **on-chain corporate balance sheet and spend governor**:
1. **Zero Backdoors:** The deployer has no privileged withdrawal functions. Funds can **only** leave the vault via democratic member consensus.
2. **Transparent Balance Sheet:** Every inbound contribution and outbound expense is categorized (`[Prizes]`, `[Logistics]`, `[Catering]`, `[Tech & Infra]`, `[Operations]`) and permanently auditable.
3. **Formal Decision Lifecycle:** Any club member can draft a proposal with invoice justification. Decisions require quorum and a majority vote before the contract itself disburses funds directly to the vendor.

---

## 2. System Architecture & Workflows

```
                                ┌──────────────────────────────────────────────┐
                                │             Web3 User / Student              │
                                └───────────────────────┬──────────────────────┘
                                                        │ (MetaMask / EIP-1193)
                                                        ▼
       ┌────────────────────────────────────────────────────────────────────────────────────────┐
       │                       Frontend dApp (React + Vite + Tailwind CSS)                      │
       ├────────────────────────────────┬───────────────────────────────┬───────────────────────┤
       │ 📊 Live Balance Sheet          │ 🗳️ Democratic Governance     │ 📜 Audit Ledger       │
       │  • Liquid Vault Assets (ETH)   │  • Proposal Drafting & Tags   │  • Inflow / Outflow   │
       │  • Categorized Spend Breakdown │  • Quorum Tracking Progress   │    Event Log          │
       │  • Historical Outflows         │  • Dynamic Voting (YES / NO)  │  • Etherscan Explorer │
       └────────────────────────────────┴───────────────┬───────────────┴───────────────────────┘
                                                        │ JSON-RPC (ethers.js v6)
                                                        ▼
       ┌────────────────────────────────────────────────────────────────────────────────────────┐
       │                       Solidity Smart Contract (ClubTreasury.sol)                       │
       ├────────────────────────────────────────────────────────────────────────────────────────┤
       │ 1. Treasury Vault: Holds ETH; open receive() / deposit() for sponsors & contributors.  │
       │ 2. Role Governance: Dynamic member whitelist (one person = one vote).                  │
       │ 3. Spend Governor: Category-tagged proposals, voting deadlines, strict quorum rules.  │
       │ 4. Safety Guard: Checks-Effects-Interactions (CEI) & ReentrancyGuard. Zero Backdoors.  │
       └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Mandatory Safety Invariants (Formally Verified)

The contract enforces all three mandatory invariants required by the specification:

| Invariant | Problem Prevented | Technical Implementation |
| :--- | :--- | :--- |
| **1. The contract can never pay out more than it holds** | Treasury insolvency or negative balance | Explicit check `if (address(this).balance < p.amount) revert InsufficientTreasuryBalance()` prior to any state transition or transfer. |
| **2. No authorization can move funds more than granted for** | Double-spending / Replay attacks | Proposal state flag `p.executed = true` is committed **before** calling recipient, preventing re-execution and reentrancy. |
| **3. Rejected, expired or unauthorized actions cannot move funds** | Rogue spending & stale proposals | Proposals must satisfy `totalVotes >= activeMembers * quorum` and `yesVotes > noVotes`. Expired or defeated proposals revert on execution. |
| **4. Zero Deployer Backdoors** | Malicious admin rugpulls | No `withdraw()`, `emergencyDrain()`, or owner-only transfer functions exist in the contract. Deployer has the exact same rights as any club member. |

---

## 4. Design Justifications

1. **Why Direct ETH over Custom Tokens?**
   Student clubs deal with native currency for vendor payments and prizes. Using native ETH eliminates artificial token volatility, DEX liquidity needs, and complex token approvals.
2. **Why Category-Based Accounting?**
   Rather than simple transfers, tagging each expense (`Logistics`, `Prizes`, `Catering`, `Tech`) produces an automated on-chain balance sheet, making financial audits instantaneous for university bodies.
3. **Why Custom Errors over `require(..., "string")`?**
   Custom errors (`revert InsufficientTreasuryBalance()`) save significant deployment and execution gas while providing precise debugging context to the UI.
4. **Why Checks-Effects-Interactions (CEI) + Reentrancy Guard?**
   To defend against reentrancy attacks where a malicious recipient contract attempts to re-enter `executeProposal()` before the balance is decremented.

---

## 5. Setup & Local Development

### Prerequisites
- Node.js (v18+ or v20+)
- MetaMask browser extension

### Step 1: Install Dependencies
```bash
# Install root Hardhat dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Step 2: Run Smart Contract Tests
Execute the automated test suite verifying all invariants and access controls:
```bash
npx hardhat test
```

### Step 3: Local Deployment
```bash
# Terminal 1: Spin up local Ethereum node
npx hardhat node

# Terminal 2: Deploy contract to local node
npx hardhat run scripts/deploy.js --network localhost
```

### Step 4: Run Frontend dApp
```bash
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 6. Deployment & Live Links

- **Smart Contract Address (Sepolia Testnet):** `0xDB77224606141E039358DF80CbB3AFd5c4200B21`
- **Block Explorer (Sepolia Etherscan):** [View Contract on Sepolia Etherscan](https://sepolia.etherscan.io/address/0xDB77224606141E039358DF80CbB3AFd5c4200B21)
- **Live dApp URL (Vercel):** `[VERCEL_APP_URL_HERE]`

---

## 7. Round 2: Vulnerability Audit Guide (For Auditors)

We welcome security auditors to inspect our smart contract (`contracts/ClubTreasury.sol`).  
Key security properties to verify:
- [x] **No Backdoors:** Grep for any owner withdrawal functions. None exist.
- [x] **Reentrancy Protection:** Mutex lock on `executeProposal()` prevents cross-function and same-function reentrancy.
- [x] **Voting Integrity:** `hasVoted` mapping prevents double-voting. Member count dynamically updates with member changes.
- [x] **Strict CEI Pattern:** State mutations occur before the low-level `call{value: amount}("")`.
- [x] **Idempotency:** Re-executing an already executed proposal reverts with `ProposalAlreadyExecuted()`.

---

## Team & Credits
- **Event:** VIBECHAIN – MERAZ 7.0 (DSC × BIB)
- **Venue:** L-101, LHC, IIT Bhilai
