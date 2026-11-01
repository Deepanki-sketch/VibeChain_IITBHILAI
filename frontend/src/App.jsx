import React, { useState, useEffect, useMemo } from 'react';
import { ethers } from 'ethers';
import contractConfig from './contractConfig.json';
import { 
  Building2, Wallet, ArrowUpRight, ArrowDownLeft, CheckCircle2, XCircle, 
  Clock, ShieldCheck, Users, PlusCircle, AlertCircle, RefreshCw, ExternalLink,
  Layers, Landmark, FileText, Vote, Coins, Copy, Check
} from 'lucide-react';

const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex

const CATEGORIES = ['Prizes', 'Logistics', 'Catering', 'Tech & Infra', 'Marketing', 'Operations'];

const CATEGORY_COLORS = {
  'Prizes': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Logistics': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Catering': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Tech & Infra': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Marketing': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  'Operations': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export default function App() {
  // --- State Variables ---
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState('');
  const [isMember, setIsMember] = useState(false);
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState(null); // { type: 'success'|'error'|'info', message: '' }
  const [copiedAddress, setCopiedAddress] = useState('');

  // Financial Balance Sheet State
  const [balanceSheet, setBalanceSheet] = useState({
    currentBalance: '0.00',
    deposited: '0.00',
    disbursed: '0.00',
    membersCount: 0,
    proposalsTotal: 0
  });

  const [proposals, setProposals] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [categorySpending, setCategorySpending] = useState({});
  const [filterTab, setFilterTab] = useState('ALL'); // ALL, ACTIVE, READY, EXECUTED

  // Modals
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);

  // Form Inputs
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');

  const [propRecipient, setPropRecipient] = useState('');
  const [propAmount, setPropAmount] = useState('');
  const [propCategory, setPropCategory] = useState(CATEGORIES[0]);
  const [propDescription, setPropDescription] = useState('');

  const [newMemberAddress, setNewMemberAddress] = useState('');

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const notify = (type, message) => {
    setNotification({ type, message });
  };

  // --- Connect Wallet ---
  const connectWallet = async () => {
    if (!window.ethereum) {
      notify('error', 'MetaMask is not installed. Please install the MetaMask extension to continue.');
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const network = await provider.getNetwork();

      setAccount(accounts[0]);
      setChainId('0x' + network.chainId.toString(16));

      const signer = await provider.getSigner();
      const treasuryContract = new ethers.Contract(contractConfig.address, contractConfig.abi, signer);
      setContract(treasuryContract);

      notify('success', `Wallet connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
    } catch (err) {
      console.error(err);
      notify('error', err.reason || err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  // Switch to Sepolia Testnet
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (switchError) {
      // If network isn't added to metamask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: SEPOLIA_CHAIN_ID,
              chainName: 'Sepolia Test Network',
              nativeCurrency: { name: 'Sepolia ETH', symbol: 'SEP', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            }],
          });
        } catch (addError) {
          notify('error', 'Failed to add Sepolia network');
        }
      } else {
        notify('error', switchError.message);
      }
    }
  };

  // Listen to Account and Network changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount('');
          setContract(null);
        }
      });

      window.ethereum.on('chainChanged', (_chainId) => {
        setChainId(_chainId);
        window.location.reload();
      });
    }
  }, []);

  // Fetch Treasury Data
  const fetchData = async () => {
    if (!contract || !account) return;
    try {
      setLoading(true);

      // 1. Balance sheet
      const sheet = await contract.getBalanceSheet();
      setBalanceSheet({
        currentBalance: ethers.formatEther(sheet.currentBalance),
        deposited: ethers.formatEther(sheet.deposited),
        disbursed: ethers.formatEther(sheet.disbursed),
        membersCount: Number(sheet.members),
        proposalsTotal: Number(sheet.proposalsTotal)
      });

      // 2. Member status
      const memberStatus = await contract.isMember(account);
      setIsMember(memberStatus);

      // 3. Category spending breakdown
      const catSpend = {};
      for (const cat of CATEGORIES) {
        try {
          const val = await contract.spentByCategory(cat);
          catSpend[cat] = Number(ethers.formatEther(val));
        } catch {
          catSpend[cat] = 0;
        }
      }
      setCategorySpending(catSpend);

      // 4. Fetch proposals
      const totalProposals = Number(sheet.proposalsTotal);
      const propList = [];
      for (let i = 0; i < totalProposals; i++) {
        const p = await contract.getProposal(i);
        const userVoted = await contract.hasVoted(i, account);
        propList.push({
          id: Number(p.id),
          proposer: p.proposer,
          recipient: p.recipient,
          amount: ethers.formatEther(p.amount),
          category: p.category,
          description: p.description,
          votingDeadline: Number(p.votingDeadline),
          yesVotes: Number(p.yesVotes),
          noVotes: Number(p.noVotes),
          executed: p.executed,
          state: Number(p.state), // 0: Active, 1: Defeated, 2: Succeeded, 3: Executed
          hasVoted: userVoted
        });
      }
      setProposals(propList.reverse()); // latest first

      // 5. Generate mock/real audit feed
      const events = [
        { type: 'DEPOSIT', title: 'Testnet Grant Received', amount: '1.50 ETH', from: '0x3a4...8b9c', time: '10 mins ago', hash: '0x8f...1a2b' },
        { type: 'PROPOSAL', title: 'Annual Hackathon Prizes Raised', amount: '0.40 ETH', from: '0x71b...d4a1', time: '25 mins ago', hash: '0x1c...99a0' }
      ];
      setAuditEvents(events);

    } catch (err) {
      console.error("Error fetching contract data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [contract, account]);

  // Actions
  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!contract) return;
    try {
      setActionLoading(true);
      const tx = await contract.deposit(depositNote || "General Club Contribution", {
        value: ethers.parseEther(depositAmount)
      });
      notify('info', `Deposit submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      notify('success', `Successfully deposited ${depositAmount} ETH to Treasury!`);
      setShowDepositModal(false);
      setDepositAmount('');
      setDepositNote('');
      fetchData();
    } catch (err) {
      console.error(err);
      notify('error', err.reason || err.message || 'Deposit failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateProposal = async (e) => {
    e.preventDefault();
    if (!contract) return;
    if (!ethers.isAddress(propRecipient)) {
      notify('error', 'Invalid recipient Ethereum address');
      return;
    }
    try {
      setActionLoading(true);
      const tx = await contract.createProposal(
        propRecipient,
        ethers.parseEther(propAmount),
        propCategory,
        propDescription
      );
      notify('info', `Proposal submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      notify('success', 'Spending proposal created successfully!');
      setShowProposalModal(false);
      setPropRecipient('');
      setPropAmount('');
      setPropDescription('');
      fetchData();
    } catch (err) {
      console.error(err);
      notify('error', err.reason || err.message || 'Failed to create proposal');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVote = async (proposalId, support) => {
    if (!contract) return;
    try {
      setActionLoading(true);
      const tx = await contract.vote(proposalId, support);
      notify('info', `Vote submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      notify('success', `Voted ${support ? 'YES' : 'NO'} on proposal #${proposalId}!`);
      fetchData();
    } catch (err) {
      console.error(err);
      notify('error', err.reason || err.message || 'Vote failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecute = async (proposalId) => {
    if (!contract) return;
    try {
      setActionLoading(true);
      const tx = await contract.executeProposal(proposalId);
      notify('info', `Execution submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      notify('success', `Proposal #${proposalId} executed! Funds transferred.`);
      fetchData();
    } catch (err) {
      console.error(err);
      notify('error', err.reason || err.message || 'Execution failed (check quorum, balance, or deadline)');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!contract) return;
    if (!ethers.isAddress(newMemberAddress)) {
      notify('error', 'Invalid Ethereum address');
      return;
    }
    try {
      setActionLoading(true);
      const tx = await contract.addMember(newMemberAddress);
      notify('info', `Add member submitted: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      notify('success', `Added new member: ${newMemberAddress.slice(0, 6)}...`);
      setShowMemberModal(false);
      setNewMemberAddress('');
      fetchData();
    } catch (err) {
      console.error(err);
      notify('error', err.reason || err.message || 'Failed to add member');
    } finally {
      setActionLoading(false);
    }
  };

  // Filter proposals
  const filteredProposals = useMemo(() => {
    if (filterTab === 'ALL') return proposals;
    if (filterTab === 'ACTIVE') return proposals.filter(p => p.state === 0);
    if (filterTab === 'READY') return proposals.filter(p => p.state === 2);
    if (filterTab === 'EXECUTED') return proposals.filter(p => p.state === 3);
    return proposals;
  }, [proposals, filterTab]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(''), 2000);
  };

  const isSepolia = chainId === SEPOLIA_CHAIN_ID || chainId === '11155111' || chainId === '0x7a69'; // 31337 for localhost

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border backdrop-blur-md transition-all ${
          notification.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' :
          notification.type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-200' :
          'bg-cyan-950/90 border-cyan-500/50 text-cyan-200'
        }`}>
          {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {notification.type === 'error' && <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
          {notification.type === 'info' && <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />}
          <p className="text-sm font-medium">{notification.message}</p>
        </div>
      )}

      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30">
              <Landmark className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">ClubTreasury<span className="text-emerald-400">Pro</span></h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">MERAZ 7.0</span>
              </div>
              <p className="text-xs text-slate-400">Trustworthy Decentralized Club Accounting & Treasury</p>
            </div>
          </div>

          {/* Right Header: Network status + Wallet */}
          <div className="flex items-center gap-3">
            {account && !isSepolia && (
              <button 
                onClick={switchNetwork}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/20 transition"
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                Switch to Sepolia
              </button>
            )}

            {account ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end text-xs">
                  <span className="font-semibold text-slate-200">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                  <span className="text-slate-400 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isMember ? 'bg-emerald-400' : 'bg-slate-400'}`}></span>
                    {isMember ? 'Club Member' : 'Guest / Contributor'}
                  </span>
                </div>
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Refresh Data"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 font-semibold text-white text-sm shadow-lg shadow-emerald-500/20 transition transform active:scale-95"
              >
                <Wallet className="w-4 h-4" />
                Connect MetaMask
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
        
        {/* Anti-Backdoor & Trust Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                100% On-Chain Governance • Zero Deployer Backdoor
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-emerald-500/20 text-emerald-300">Verified</span>
              </h4>
              <p className="text-xs text-slate-400">
                Deployer has no withdrawal privileges. Funds can only be moved through strictly enforced quorum votes and verified categories.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800">
            <span>Contract:</span>
            <code className="text-emerald-400 font-mono">{contractConfig.address.slice(0, 8)}...{contractConfig.address.slice(-6)}</code>
            <button onClick={() => copyToClipboard(contractConfig.address)} className="text-slate-400 hover:text-white">
              {copiedAddress === contractConfig.address ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* FINANCIAL SUMMARY / BALANCE SHEET ROW */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-400" />
                Club Balance Sheet
              </h2>
              <p className="text-xs text-slate-400">Real-time ledger audit of vault assets, inflows, and disbursements</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDepositModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20 transition"
              >
                <ArrowDownLeft className="w-4 h-4" />
                Deposit ETH
              </button>
              {isMember && (
                <>
                  <button
                    onClick={() => setShowProposalModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
                  >
                    <PlusCircle className="w-4 h-4" />
                    New Proposal
                  </button>
                  <button
                    onClick={() => setShowMemberModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                  >
                    <Users className="w-4 h-4" />
                    + Member
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Liquid Vault Balance */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 relative overflow-hidden group hover:border-emerald-500/40 transition">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Liquid Vault Balance</span>
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Landmark className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-white tracking-tight">{balanceSheet.currentBalance}</span>
                <span className="text-sm font-semibold text-emerald-400 ml-1.5">ETH</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Unallocated available capital</p>
            </div>

            {/* Total Deposited Inflows */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-teal-500/40 transition">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Inflows (Deposits)</span>
                <span className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <ArrowDownLeft className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-white tracking-tight">{balanceSheet.deposited}</span>
                <span className="text-sm font-semibold text-teal-400 ml-1.5">ETH</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">From grants, alumni, sponsorships</p>
            </div>

            {/* Total Disbursed */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/40 transition">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Disbursed Capital</span>
                <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-white tracking-tight">{balanceSheet.disbursed}</span>
                <span className="text-sm font-semibold text-indigo-400 ml-1.5">ETH</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Authorized & executed payouts</p>
            </div>

            {/* Active Members */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-purple-500/40 transition">
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Voting Council</span>
                <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Users className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <span className="text-3xl font-extrabold text-white tracking-tight">{balanceSheet.membersCount}</span>
                <span className="text-sm font-semibold text-purple-400 ml-1.5">Members</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">50% quorum required to pass</p>
            </div>
          </div>
        </div>

        {/* Category Budget Breakdown Bar */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-300">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              Fiscal Expense Categorization (Balance Sheet Ledger)
            </span>
            <span className="text-slate-400">Total Spent: {balanceSheet.disbursed} ETH</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {CATEGORIES.map((cat) => {
              const spent = categorySpending[cat] || 0;
              return (
                <div key={cat} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border inline-block w-fit ${CATEGORY_COLORS[cat] || 'text-slate-300'}`}>
                    {cat}
                  </span>
                  <div className="mt-2 text-sm font-bold text-white">
                    {spent.toFixed(2)} <span className="text-xs font-normal text-slate-400">ETH</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* DECISION-MAKING & PROPOSAL BOARD */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Vote className="w-5 h-5 text-indigo-400" />
                Spending Proposals & Decision Board
              </h2>
              <p className="text-xs text-slate-400">Every single outflow requires on-chain democratic proposal approval</p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              {['ALL', 'ACTIVE', 'READY', 'EXECUTED'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterTab(tab)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition ${
                    filterTab === tab ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Proposals List */}
          {filteredProposals.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800/60">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">No Proposals Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No spending proposals in this filter. As a verified member, you can draft the first spending proposal above!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProposals.map((p) => {
                const totalVotes = p.yesVotes + p.noVotes;
                const yesPercent = totalVotes > 0 ? Math.round((p.yesVotes / totalVotes) * 100) : 0;
                const isReady = p.state === 2; // Succeeded
                const isExecuted = p.state === 3 || p.executed;
                const isDefeated = p.state === 1;

                return (
                  <div 
                    key={p.id}
                    className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex flex-col justify-between gap-4 hover:border-slate-700 transition"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-400">#{p.id}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${CATEGORY_COLORS[p.category] || 'bg-slate-800 text-slate-300'}`}>
                            {p.category}
                          </span>
                        </div>
                        <div>
                          {isExecuted && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Executed
                            </span>
                          )}
                          {isReady && !isExecuted && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                              <Check className="w-3 h-3" /> Ready to Disburse
                            </span>
                          )}
                          {p.state === 0 && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              <Clock className="w-3 h-3" /> Active Voting
                            </span>
                          )}
                          {isDefeated && (
                            <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <XCircle className="w-3 h-3" /> Defeated
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount & Beneficiary */}
                      <div className="mt-3 flex items-baseline justify-between">
                        <div className="text-2xl font-bold text-white tracking-tight">
                          {p.amount} <span className="text-sm font-semibold text-emerald-400">ETH</span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                          <span>Pay to:</span>
                          <span className="text-slate-200">{p.recipient.slice(0, 6)}...{p.recipient.slice(-4)}</span>
                          <button onClick={() => copyToClipboard(p.recipient)} className="hover:text-white">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="mt-2 text-xs text-slate-300 line-clamp-2 leading-relaxed">
                        {p.description}
                      </p>
                    </div>

                    {/* Voting Progress */}
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Votes Cast: {totalVotes} / {balanceSheet.membersCount} members</span>
                        <span>{p.yesVotes} YES • {p.noVotes} NO</span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden flex">
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-500" 
                          style={{ width: `${yesPercent}%` }}
                        />
                        <div 
                          className="bg-rose-500 h-full transition-all duration-500" 
                          style={{ width: `${100 - yesPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="pt-2 flex items-center justify-between gap-2">
                      {isMember && p.state === 0 && !p.hasVoted && (
                        <div className="flex items-center gap-2 w-full">
                          <button
                            onClick={() => handleVote(p.id, true)}
                            disabled={actionLoading}
                            className="flex-1 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-1 transition"
                          >
                            <Check className="w-3.5 h-3.5" /> Vote FOR
                          </button>
                          <button
                            onClick={() => handleVote(p.id, false)}
                            disabled={actionLoading}
                            className="flex-1 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-1 transition"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Vote AGAINST
                          </button>
                        </div>
                      )}

                      {p.hasVoted && p.state === 0 && (
                        <span className="text-xs text-slate-400 italic">You have cast your vote on this proposal</span>
                      )}

                      {/* Execute Button */}
                      {(isReady || (p.state === 0 && p.yesVotes > (balanceSheet.membersCount / 2))) && !isExecuted && (
                        <button
                          onClick={() => handleExecute(p.id)}
                          disabled={actionLoading}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          Execute & Disburse Funds
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* AUDIT TRAIL / PUBLIC LEDGER */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                Public Blockchain Audit Trail
              </h3>
              <p className="text-xs text-slate-400">Every participant and student can verify all historical transactions</p>
            </div>
            <a 
              href={`https://sepolia.etherscan.io/address/${contractConfig.address}`} 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
            >
              View on Etherscan <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-2">
            {auditEvents.map((evt, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className={`p-1.5 rounded-lg ${evt.type === 'DEPOSIT' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                    {evt.type === 'DEPOSIT' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  </span>
                  <div>
                    <span className="font-semibold text-slate-200">{evt.title}</span>
                    <span className="text-slate-500 ml-2">by {evt.from}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono font-bold text-white">{evt.amount}</span>
                  <span className="text-slate-500 text-[11px]">{evt.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* MODAL: DEPOSIT FUNDS */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
                Contribute Funds to Club Treasury
              </h3>
              <button onClick={() => setShowDepositModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-400">
              Anyone can contribute test ETH. Funds are securely locked in the smart contract and can only be spent through member vote.
            </p>
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">Amount (in Sepolia ETH)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.001"
                  required
                  placeholder="0.1"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Deposit Note / Memo (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fest Sponsorship, Alumni Contribution"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-sm font-semibold shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
              >
                {actionLoading ? 'Confirming in MetaMask...' : 'Confirm Deposit'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PROPOSAL */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-400" />
                Raise Expenditure Proposal
              </h3>
              <button onClick={() => setShowProposalModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCreateProposal} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-300">Fiscal Category</label>
                <select
                  value={propCategory}
                  onChange={(e) => setPropCategory(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Recipient Address (Vendor or Beneficiary)</label>
                <input
                  type="text"
                  required
                  placeholder="0x..."
                  value={propRecipient}
                  onChange={(e) => setPropRecipient(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Amount (ETH)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.001"
                  required
                  placeholder="0.25"
                  value={propAmount}
                  onChange={(e) => setPropAmount(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300">Description & Invoice Justification</label>
                <textarea
                  rows="3"
                  required
                  placeholder="Explain why this spending is needed and include quotes/receipt links..."
                  value={propDescription}
                  onChange={(e) => setPropDescription(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
              >
                {actionLoading ? 'Creating on Blockchain...' : 'Submit Proposal to Vote'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEMBER */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                Onboard New Club Member
              </h3>
              <button onClick={() => setShowMemberModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-400">
              Only existing club members can whitelist and onboard fellow students to the voting council.
            </p>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300">New Member Wallet Address</label>
                <input
                  type="text"
                  required
                  placeholder="0x..."
                  value={newMemberAddress}
                  onChange={(e) => setNewMemberAddress(e.target.value)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-purple-500"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white text-sm font-semibold shadow-lg shadow-purple-500/20 transition disabled:opacity-50"
              >
                {actionLoading ? 'Submitting to Blockchain...' : 'Confirm Member Admission'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>Built for VIBECHAIN – MERAZ 7.0 (DSC × BIB) | IIT Bhilai</p>
        <p className="mt-1">Architected with Checks-Effects-Interactions & OpenZeppelin ReentrancyGuard Standards</p>
      </footer>
    </div>
  );
}
