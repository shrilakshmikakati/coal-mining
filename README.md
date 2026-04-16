# ⬡ Coal Chain — Blockchain Concession Management System

A production-ready coal mining concession management system built with:
- **Smart Contracts** (Solidity) deployed on **Ganache** (Proof of Work)
- **Next.js** frontend with an industrial dark UI
- **Express.js** backend (< 500 lines) with **MongoDB**

---

## Architecture

```
coal-chain/
<<<<<<< HEAD
├── contracts/          # Solidity smart contracts
├── migrations/         # Truffle migration scripts
├── scripts/            # Utility scripts
├── backend/            # Express.js API server
=======
├── contracts/          
├── migrations/        
├── scripts/          
├── backend/       
>>>>>>> b79293b (initial clean commit)
│   ├── server.js       # Main server (< 500 lines)
│   └── abi/            # Auto-generated after migration
└── frontend/           # Next.js application
    ├── pages/          # Routes: dashboard, concessions, extractions, blockchain
    ├── components/     # Layout component
<<<<<<< HEAD
    ├── styles/         # Global CSS
    └── utils/          # API client
=======
    ├── styles/        
    └── utils/         
>>>>>>> b79293b (initial clean commit)
```

---

## Prerequisites

- **Node.js** >= 18
- **MongoDB** running locally on port 27017
- **Ganache** (GUI or CLI) running on port 7545
- **Truffle** CLI

```bash
npm install -g truffle ganache
```

---

## Setup Guide

### 1. Start Ganache
Open Ganache GUI and create a new workspace with:
- **Port**: 7545
- **Network ID**: 5777
- **Mnemonic**: (save for reference)

Or with CLI:
```bash
ganache --port 7545 --deterministic --mnemonic "your seed phrase here"
```

### 2. Compile & Deploy Smart Contract

```bash
# From project root
npm install
npm run compile   # truffle compile
npm run migrate   # truffle migrate --reset
npm run setup     # copies ABI + prints contract address
```

Copy the printed `CONTRACT_ADDRESS`.

### 3. Configure Backend

```bash
cd backend
cp .env.example .env
# Edit .env and set CONTRACT_ADDRESS from step 2
npm install
npm run dev
```

Backend runs on **http://localhost:4000**

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:3000**

---

## API Reference

### Concessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/concessions` | List all concessions (filter by status, coalType) |
| GET | `/api/concessions/:id` | Get concession + blockchain data |
| POST | `/api/concessions` | Create new concession (stored in MongoDB) |
| POST | `/api/concessions/:id/deploy` | Deploy concession to Ganache blockchain |
| PATCH | `/api/concessions/:id/status` | Update concession status on-chain |

### Extractions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/extractions` | List extraction records |
| POST | `/api/extractions` | Record extraction (writes to blockchain) |

### Analytics & Blockchain
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/dashboard` | Dashboard stats and aggregations |
| GET | `/api/blockchain/info` | Network info, block number, regulator |

---

<<<<<<< HEAD
## How Proof of Stake Works Here
=======
## How Proof of Work Works Here
>>>>>>> b79293b (initial clean commit)

Ganache simulates Ethereum's **Proof of Work** consensus:

1. **Transaction Broadcast** — Backend sends a signed transaction to Ganache
2. **Block Mining** — Ganache mines a new block (instant in dev mode, simulating PoW)
3. **Chain Confirmation** — Transaction is included in a block with a valid hash
4. **MongoDB Sync** — Transaction hash & blockchain ID stored in MongoDB

In production, deploying to Ethereum mainnet or a PoW testnet gives real mining.

---

## Smart Contract Functions

```solidity
// Grant a new concession (regulator only)
grantConcession(owner, mongoId, location, areaHa, maxTons, durationDays, licenseHash)

// Record coal extraction (owner or regulator)
recordExtraction(concessionId, tons, batchId)

// Update concession status (regulator only)
updateStatus(concessionId, Status)

// View functions
getConcession(id)
getOwnerConcessions(address)
getExtractionHistory(concessionId)
getAllConcessionIds()
```

---

## Features

- ✅ Full CRUD for coal concessions
- ✅ One-click blockchain deployment per concession
- ✅ Immutable extraction records on Ganache (PoW)
- ✅ License hash generation (SHA-256)
- ✅ Quota tracking with visual progress bars
- ✅ Status management (Active/Suspended/Revoked)
- ✅ MongoDB for rich querying & analytics
- ✅ Dashboard with extraction trend charts
- ✅ Blockchain explorer page
- ✅ Real-time block number in sidebar
