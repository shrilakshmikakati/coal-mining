require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { Web3 } = require("web3");
const crypto = require("crypto");
const { router: truckRouter } = require("./trucks");

// App Setup
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// Serverless DB & Web3 Connection Middleware
let isConnected = false;
async function ensureConnections() {
  if (!isConnected) {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/coal_mining");
    console.log("MongoDB connected");
    await initWeb3();
    isConnected = true;
  }
}

app.use(async (req, res, next) => {
  try {
    await ensureConnections();
    next();
  } catch (err) {
    console.error("Connection error:", err);
    res.status(500).json({ success: false, error: "Internal connection error" });
  }
});
// Web3 Setup
const web3 = new Web3(process.env.GANACHE_URL || "http://127.0.0.1:7545");
const CONTRACT_ABI       = require("./abi/CoalConcession.json");
const TRUCK_CONTRACT_ABI = require("./abi/TruckTracking.json");
let contract;

async function initWeb3() {
  const accounts = await web3.eth.getAccounts();
  contract = new web3.eth.Contract(CONTRACT_ABI.abi, process.env.CONTRACT_ADDRESS);
  const truckContract = new web3.eth.Contract(TRUCK_CONTRACT_ABI.abi, process.env.TRUCK_CONTRACT_ADDRESS);
  app.locals.web3 = web3;
  app.locals.truckContract = truckContract;
  console.log("Web3 connected. Regulator:", accounts[0]);
  return accounts[0];
}

// MongoDB Models
const concessionSchema = new mongoose.Schema({
  blockchainId: { type: Number, default: null },
  txHash: { type: String, default: null },
  companyName: { type: String, required: true },
  ownerAddress: { type: String, required: true },
  location: { type: String, required: true },
  coordinates: { lat: Number, lng: Number },
  areaHectares: { type: Number, required: true },
  maxExtractionTons: { type: Number, required: true },
  extractedTons: { type: Number, default: 0 },
  coalType: { type: String, enum: ["Anthracite", "Bituminous", "Sub-bituminous", "Lignite"], required: true },
  status: { type: String, enum: ["Pending", "Active", "Suspended", "Expired", "Revoked"], default: "Pending" },
  durationDays: { type: Number, required: true },
  licenseHash: { type: String },
  issuedAt: Date,
  expiresAt: Date,
  documents: [{ name: String, hash: String, uploadedAt: Date }],
}, { timestamps: true });

const extractionSchema = new mongoose.Schema({
  concessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Concession", required: true },
  blockchainId: { type: Number, required: true },
  batchId: { type: String, required: true },
  tons: { type: Number, required: true },
  coalQuality: { grade: String, moisturePercent: Number, ashPercent: Number, calorificValue: Number },
  txHash: String,
  recordedBy: String,
  notes: String,
}, { timestamps: true });

const Concession = mongoose.model("Concession", concessionSchema);
const Extraction = mongoose.model("Extraction", extractionSchema);

// Helpers
const STATUS_MAP = ["Pending", "Active", "Suspended", "Expired", "Revoked"];
const generateLicenseHash = (data) => crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
const handleError = (res, err, msg = "Server error") => {
  console.error(msg, err?.message || err);
  res.status(500).json({ success: false, error: msg, detail: err?.message });
};

// Concessions
app.get("/api/concessions", async (req, res) => {
  try {
    const { status, coalType, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (coalType) filter.coalType = coalType;
    const total = await Concession.countDocuments(filter);
    const data = await Concession.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit);
    res.json({ success: true, data, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) { handleError(res, err, "Failed to fetch concessions"); }
});

app.get("/api/concessions/:id", async (req, res) => {
  try {
    const doc = await Concession.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    let chainData = null;
    if (doc.blockchainId && contract) {
      try { chainData = await contract.methods.getConcession(doc.blockchainId).call(); } catch (_) {}
    }
    res.json({ success: true, data: doc, chainData });
  } catch (err) { handleError(res, err, "Failed to fetch concession"); }
});

app.post("/api/concessions", async (req, res) => {
  try {
    const { companyName, ownerAddress, location, coordinates, areaHectares, maxExtractionTons, coalType, durationDays, documents } = req.body;
    const licenseHash = generateLicenseHash({ companyName, ownerAddress, location, areaHectares, maxExtractionTons, ts: Date.now() });
    const concession = await Concession.create({
      companyName, ownerAddress: ownerAddress.toLowerCase(), location, coordinates,
      areaHectares, maxExtractionTons, coalType, durationDays, licenseHash,
      status: "Pending", documents: documents || [],
    });
    res.status(201).json({ success: true, data: concession });
  } catch (err) { handleError(res, err, "Failed to create concession"); }
});

app.post("/api/concessions/:id/deploy", async (req, res) => {
  try {
    const doc = await Concession.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    if (doc.blockchainId) return res.status(400).json({ success: false, error: "Already deployed" });
    const accounts = await web3.eth.getAccounts();
    const receipt = await contract.methods.grantConcession(
      doc.ownerAddress, doc._id.toString(), doc.location,
      doc.areaHectares, doc.maxExtractionTons, doc.durationDays, doc.licenseHash
    ).send({ from: accounts[0], gas: 500000 });
    const blockchainId = Number(receipt.events.ConcessionGranted.returnValues.id);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + doc.durationDays * 86400000);
    await doc.updateOne({ blockchainId, txHash: receipt.transactionHash, status: "Active", issuedAt, expiresAt });
    res.json({ success: true, blockchainId, txHash: receipt.transactionHash });
  } catch (err) { handleError(res, err, "Blockchain deployment failed"); }
});

app.patch("/api/concessions/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const doc = await Concession.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const statusIndex = STATUS_MAP.indexOf(status);
    if (statusIndex === -1) return res.status(400).json({ success: false, error: "Invalid status" });
    if (doc.blockchainId && contract) {
      const accounts = await web3.eth.getAccounts();
      await contract.methods.updateStatus(doc.blockchainId, statusIndex).send({ from: accounts[0], gas: 100000 });
    }
    await doc.updateOne({ status });
    res.json({ success: true, data: { status } });
  } catch (err) { handleError(res, err, "Status update failed"); }
});

// Extractions
app.get("/api/extractions", async (req, res) => {
  try {
    const { concessionId, page = 1, limit = 20 } = req.query;
    const filter = concessionId ? { concessionId } : {};
    const total = await Extraction.countDocuments(filter);
    const data = await Extraction.find(filter).populate("concessionId", "companyName location coalType").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit);
    res.json({ success: true, data, total });
  } catch (err) { handleError(res, err, "Failed to fetch extractions"); }
});

app.post("/api/extractions", async (req, res) => {
  try {
    const { concessionMongoId, tons, coalQuality, notes } = req.body;
    const doc = await Concession.findById(concessionMongoId);
    if (!doc) return res.status(404).json({ success: false, error: "Concession not found" });
    if (doc.status !== "Active") return res.status(400).json({ success: false, error: "Concession not active" });
    if (!doc.blockchainId) return res.status(400).json({ success: false, error: "Not deployed to blockchain" });
    
    if (doc.extractedTons + tons > doc.maxExtractionTons) {
      return res.status(400).json({ 
        success: false, 
        error: `Exceeds quota. You tried to extract ${tons}t but only ${doc.maxExtractionTons - doc.extractedTons}t remaining.` 
      });
    }

    if (doc.expiresAt && new Date() > new Date(doc.expiresAt)) {
      return res.status(400).json({ success: false, error: "Concession has expired" });
    }

    const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const accounts = await web3.eth.getAccounts();
    const receipt = await contract.methods.recordExtraction(doc.blockchainId, Math.floor(tons), batchId).send({ from: accounts[0], gas: 500000 });
    const extraction = await Extraction.create({
      concessionId: doc._id, blockchainId: doc.blockchainId, batchId,
      tons, coalQuality, txHash: receipt.transactionHash,
      recordedBy: accounts[0], notes,
    });
    await doc.updateOne({ $inc: { extractedTons: tons } });
    res.status(201).json({ success: true, data: extraction });
  } catch (err) { handleError(res, err, "Extraction recording failed"); }
});

// Analytics
app.get("/api/analytics/dashboard", async (req, res) => {
  try {
    const [statusAgg, coalTypeAgg, extractionTrend, totalExtractions, recentExtractions] = await Promise.all([
      Concession.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Concession.aggregate([{ $group: { _id: "$coalType", totalArea: { $sum: "$areaHectares" }, totalExtracted: { $sum: "$extractedTons" } } }]),
      Extraction.aggregate([
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, tons: { $sum: "$tons" }, batches: { $sum: 1 } } },
        { $sort: { _id: 1 } }, { $limit: 30 }
      ]),
      Extraction.aggregate([{ $group: { _id: null, total: { $sum: "$tons" } } }]),
      Extraction.find().sort({ createdAt: -1 }).limit(5).populate("concessionId", "companyName"),
    ]);
    res.json({
      success: true,
      data: {
        concessionsByStatus: statusAgg,
        concessionsByCoalType: coalTypeAgg,
        extractionTrend,
        totalExtractedTons: totalExtractions[0]?.total || 0,
        recentExtractions,
      },
    });
  } catch (err) { handleError(res, err, "Analytics failed"); }
});

app.get("/api/blockchain/info", async (req, res) => {
  try {
    const [block, accounts, balance] = await Promise.all([
      web3.eth.getBlockNumber(),
      web3.eth.getAccounts(),
      web3.eth.getBalance(await web3.eth.getAccounts().then(a => a[0])),
    ]);
    res.json({
      success: true, data: {
        latestBlock: block.toString(),
        regulator: accounts[0],
        balance: web3.utils.fromWei(balance, "ether"),
        networkId: await web3.eth.net.getId().then(id => id.toString()),
        contractAddress: process.env.CONTRACT_ADDRESS,
        truckContractAddress: process.env.TRUCK_CONTRACT_ADDRESS,
      }
    });
  } catch (err) { handleError(res, err, "Blockchain info failed"); }
});

// Mount truck router
app.use(truckRouter);

// Export for Vercel Serverless
module.exports = app;

// Local Development Fallback
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (Local Dev Mode)`);
  });
}
