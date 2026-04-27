// trucks.js — Truck Tracking & Anti-Theft routes
const { Router } = require("express");
const mongoose   = require("mongoose");
const crypto     = require("crypto");

const router = Router();

// ─── Models ───────────────────────────────────────────────────────────────────
const truckSchema = new mongoose.Schema({
  blockchainId:    { type: Number, default: null },
  plateNumber:     { type: String, required: true, unique: true, uppercase: true },
  driverName:      { type: String, required: true },
  driverPhone:     { type: String },
  operatorAddress: { type: String, required: true },
  capacity:        { type: Number, required: true },
  make:            { type: String },
  model:           { type: String },
  gpsDeviceId:     { type: String },
  active:          { type: Boolean, default: true },
  txHash:          { type: String, default: null },
}, { timestamps: true });

const depotSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  location:     { type: String },
  lat:          { type: Number, required: true },
  lng:          { type: Number, required: true },
  radiusMeters: { type: Number, default: 500 },
  type:         { type: String, enum: ["Origin", "Transit", "Destination"], default: "Transit" },
  active:       { type: Boolean, default: true },
}, { timestamps: true });

const shipmentSchema = new mongoose.Schema({
  blockchainId:      { type: Number, default: null },
  txHash:            { type: String, default: null },
  concessionId:      { type: mongoose.Schema.Types.ObjectId, ref: "Concession", required: true },
  concessionChainId: { type: Number, required: true },
  truckId:           { type: mongoose.Schema.Types.ObjectId, ref: "Truck", required: true },
  authorizedTons:    { type: Number, required: true },
  origin:            { type: String, required: true },
  destination:       { type: String, required: true },
  sealHash:          { type: String },
  expectedCoalQuality: { grade: String, moisturePercent: Number, ashPercent: Number, calorificValue: Number },
  status: {
    type: String,
    enum: ["Dispatched", "InTransit", "Flagged", "Delivered", "Seized"],
    default: "Dispatched",
  },
  checkpoints: [{
    location:     String,
    reportedTons: Number,
    tonsMatch:    Boolean,
    scannedAt:    { type: Date, default: Date.now },
    notes:        String,
    txHash:       String,
    depotId:      { type: mongoose.Schema.Types.ObjectId, ref: "Depot", default: null },
    diff:         Number,
    coalQuality:  { grade: String, moisturePercent: Number, ashPercent: Number, calorificValue: Number },
  }],
  dispatchedAt: { type: Date, default: Date.now },
  deliveredAt:  Date,
  finalTons:    Number,
  lastLocation: { lat: Number, lng: Number, speedKmh: Number, heading: Number, ts: Date },
  gpsTrail:     [{ lat: Number, lng: Number, speedKmh: Number, heading: Number, ts: Date }],
}, { timestamps: true });

const alertSchema = new mongoose.Schema({
  blockchainId: { type: Number, default: null },
  shipmentId:   { type: mongoose.Schema.Types.ObjectId, ref: "Shipment", required: true },
  severity:     { type: String, enum: ["Low", "Medium", "High", "Critical"], required: true },
  reason:       { type: String, required: true },
  expectedTons: Number,
  reportedTons: Number,
  resolved:     { type: Boolean, default: false },
  resolvedAt:   Date,
  notes:        String,
}, { timestamps: true });

const Truck    = mongoose.models.Truck    || mongoose.model("Truck",    truckSchema);
const Depot    = mongoose.models.Depot    || mongoose.model("Depot",    depotSchema);
const Shipment = mongoose.models.Shipment || mongoose.model("Shipment", shipmentSchema);
const Alert    = mongoose.models.Alert    || mongoose.model("Alert",    alertSchema);

module.exports.Truck    = Truck;
module.exports.Depot    = Depot;
module.exports.Shipment = Shipment;
module.exports.Alert    = Alert;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const err = (res, e, msg) => res.status(500).json({ success: false, error: msg, detail: e?.message });
const sealHash = (data) => crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");

// ─── Trucks ───────────────────────────────────────────────────────────────────
router.get("/api/trucks", async (req, res) => {
  try {
    const { active, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (active !== undefined) filter.active = active === "true";
    const [data, total] = await Promise.all([
      Truck.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit),
      Truck.countDocuments(filter),
    ]);
    res.json({ success: true, data, total });
  } catch (e) { err(res, e, "Failed to fetch trucks"); }
});

router.post("/api/trucks", async (req, res) => {
  try {
    const { plateNumber, driverName, driverPhone, operatorAddress, capacity, make, model, gpsDeviceId } = req.body;
    const truck = await Truck.create({ plateNumber, driverName, driverPhone, operatorAddress, capacity, make, model, gpsDeviceId });
    res.status(201).json({ success: true, data: truck });
  } catch (e) { err(res, e, "Failed to create truck"); }
});

router.post("/api/trucks/:id/register-chain", async (req, res) => {
  try {
    const { truckContract } = req.app.locals;
    const truck = await Truck.findById(req.params.id);
    if (!truck) return res.status(404).json({ success: false, error: "Truck not found" });
    if (truck.blockchainId) return res.status(400).json({ success: false, error: "Already on chain" });
    const accounts = await req.app.locals.web3.eth.getAccounts();
    const receipt = await truckContract.methods
      .registerTruck(truck.plateNumber, truck.operatorAddress, truck._id.toString())
      .send({ from: accounts[0], gas: 600000 });
    const blockchainId = Number(receipt.events.TruckRegistered.returnValues.id);
    await truck.updateOne({ blockchainId, txHash: receipt.transactionHash });
    res.json({ success: true, blockchainId, txHash: receipt.transactionHash });
  } catch (e) { err(res, e, "Truck chain registration failed"); }
});

router.patch("/api/trucks/:id", async (req, res) => {
  try {
    const truck = await Truck.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!truck) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: truck });
  } catch (e) { err(res, e, "Update failed"); }
});

// ─── Depots ───────────────────────────────────────────────────────────────────
router.get("/api/depots", async (req, res) => {
  try {
    const data = await Depot.find({ active: true }).sort({ name: 1 });
    res.json({ success: true, data });
  } catch (e) { err(res, e, "Failed to fetch depots"); }
});

router.post("/api/depots", async (req, res) => {
  try {
    const depot = await Depot.create(req.body);
    res.status(201).json({ success: true, data: depot });
  } catch (e) { err(res, e, "Failed to create depot"); }
});

// ─── Shipments ────────────────────────────────────────────────────────────────
router.get("/api/shipments", async (req, res) => {
  try {
    const { status, truckId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (truckId) filter.truckId = truckId;
    const [data, total] = await Promise.all([
      Shipment.find(filter)
        .populate("truckId", "plateNumber driverName capacity")
        .populate("concessionId", "companyName location coalType")
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit),
      Shipment.countDocuments(filter),
    ]);
    res.json({ success: true, data, total });
  } catch (e) { err(res, e, "Failed to fetch shipments"); }
});

router.get("/api/shipments/:id", async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id)
      .populate("truckId", "plateNumber driverName driverPhone capacity make model")
      .populate("concessionId", "companyName location coalType blockchainId");
    if (!shipment) return res.status(404).json({ success: false, error: "Not found" });
    const shipAlerts = await Alert.find({ shipmentId: shipment._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: shipment, alerts: shipAlerts });
  } catch (e) { err(res, e, "Failed to fetch shipment"); }
});

router.post("/api/shipments", async (req, res) => {
  try {
    const { concessionId, concessionChainId, truckId, authorizedTons, origin, destination, expectedCoalQuality } = req.body;
    const truck = await Truck.findById(truckId);
    if (!truck) return res.status(404).json({ success: false, error: "Truck not found" });
    if (!truck.active) return res.status(400).json({ success: false, error: "Truck is inactive" });
    if (authorizedTons > truck.capacity) return res.status(400).json({ success: false, error: "Exceeds truck capacity" });

    const seal = sealHash({ concessionId, truckId, authorizedTons, origin, destination, ts: Date.now() });
    const { truckContract } = req.app.locals;
    const accounts = await req.app.locals.web3.eth.getAccounts();
    const receipt = await truckContract.methods
      .dispatchShipment(concessionChainId, truckId.toString(), authorizedTons, origin, destination, seal)
      .send({ from: accounts[0], gas: 600000 });
    const blockchainId = Number(receipt.events.ShipmentDispatched.returnValues.id);

    const shipment = await Shipment.create({
      concessionId, concessionChainId, truckId, authorizedTons,
      origin, destination, sealHash: seal,
      blockchainId, txHash: receipt.transactionHash,
      status: "Dispatched", dispatchedAt: new Date(),
      expectedCoalQuality
    });
    res.status(201).json({ success: true, data: shipment });
  } catch (e) { err(res, e, "Shipment dispatch failed"); }
});

// ─── GPS Ping ─────────────────────────────────────────────────────────────────
router.post("/api/shipments/:id/ping", async (req, res) => {
  try {
    const { lat, lng, speedKmh = 0, heading = 0 } = req.body;
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: "Not found" });
    if (!["Dispatched", "InTransit"].includes(shipment.status))
      return res.status(400).json({ success: false, error: "Shipment not active" });

    const ping = { lat, lng, speedKmh, heading, ts: new Date() };
    shipment.gpsTrail.push(ping);
    shipment.lastLocation = ping;
    shipment.status = "InTransit";
    await shipment.save();

    const clients = req.app.locals.sseClients?.[shipment._id.toString()] || [];
    clients.forEach(c => c.write(`data: ${JSON.stringify({ type: "ping", ...ping })}\n\n`));

    res.json({ success: true });
  } catch (e) { err(res, e, "GPS ping failed"); }
});

// ─── SSE Live Stream ──────────────────────────────────────────────────────────
router.get("/api/shipments/:id/live", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const id = req.params.id;
  if (!req.app.locals.sseClients) req.app.locals.sseClients = {};
  if (!req.app.locals.sseClients[id]) req.app.locals.sseClients[id] = [];
  req.app.locals.sseClients[id].push(res);

  Shipment.findById(id).then(s => {
    if (s?.lastLocation) res.write(`data: ${JSON.stringify({ type: "ping", ...s.lastLocation })}\n\n`);
  });

  req.on("close", () => {
    if (req.app.locals.sseClients[id])
      req.app.locals.sseClients[id] = req.app.locals.sseClients[id].filter(c => c !== res);
  });
});

// ─── Depot Scan ───────────────────────────────────────────────────────────────
router.post("/api/shipments/:id/depot-scan", async (req, res) => {
  try {
    const { depotId, measuredTons, depotName, notes, coalQuality } = req.body;
    const shipment = await Shipment.findById(req.params.id)
      .populate("truckId", "plateNumber driverName");
    if (!shipment) return res.status(404).json({ success: false, error: "Shipment not found" });
    if (!["Dispatched", "InTransit"].includes(shipment.status))
      return res.status(400).json({ success: false, error: "Shipment not active" });

    const depot = depotId ? await Depot.findById(depotId) : null;
    const label = depot?.name || depotName || "Unknown Depot";

    // ─── Simulated PoS Validator Consensus ───
    let qualityTampered = false;
    let tamperingReason = "";
    if (shipment.expectedCoalQuality && coalQuality) {
      if (shipment.expectedCoalQuality.grade && coalQuality.grade && shipment.expectedCoalQuality.grade !== coalQuality.grade) {
        qualityTampered = true;
        tamperingReason = `Grade changed from ${shipment.expectedCoalQuality.grade} to ${coalQuality.grade}`;
      } else if (shipment.expectedCoalQuality.moisturePercent && coalQuality.moisturePercent && Math.abs(shipment.expectedCoalQuality.moisturePercent - coalQuality.moisturePercent) > 2) {
        qualityTampered = true;
        tamperingReason = `Moisture deviated from ${shipment.expectedCoalQuality.moisturePercent}% to ${coalQuality.moisturePercent}%`;
      } else if (shipment.expectedCoalQuality.ashPercent && coalQuality.ashPercent && Math.abs(shipment.expectedCoalQuality.ashPercent - coalQuality.ashPercent) > 2) {
        qualityTampered = true;
        tamperingReason = `Ash deviated from ${shipment.expectedCoalQuality.ashPercent}% to ${coalQuality.ashPercent}%`;
      }
    }

    if (qualityTampered) {
      const alert = await Alert.create({
        shipmentId: shipment._id,
        severity: "Critical",
        reason: "QUALITY_TAMPERING_DETECTED",
        expectedTons: shipment.authorizedTons,
        reportedTons: measuredTons,
        notes: `Simulated PoS Validators rejected scan at ${label}. Reason: ${tamperingReason}`,
      });
      shipment.status = "Flagged";
      await shipment.save();

      const clients = req.app.locals.sseClients?.[shipment._id.toString()] || [];
      clients.forEach(c => c.write(`data: ${JSON.stringify({ type: "alert", severity: "Critical", reason: "QUALITY_TAMPERING_DETECTED", diff: 0, depot: label })}\n\n`));

      return res.status(403).json({ success: false, error: "Validators rejected scan due to tampering detection", alert, qualityTampered: true });
    }
    // ─────────────────────────────────────────

    const tolerance = shipment.authorizedTons * 0.02;
    const tonsMatch = measuredTons >= shipment.authorizedTons - tolerance &&
                      measuredTons <= shipment.authorizedTons + tolerance;
    const diff = measuredTons - shipment.authorizedTons;

    const { truckContract } = req.app.locals;
    const accounts = await req.app.locals.web3.eth.getAccounts();
    
    let formattedNotes = notes || "";
    if (coalQuality) {
      const q = [];
      if (coalQuality.grade) q.push(`Grade: ${coalQuality.grade}`);
      if (coalQuality.moisturePercent) q.push(`Moisture: ${coalQuality.moisturePercent}%`);
      if (coalQuality.ashPercent) q.push(`Ash: ${coalQuality.ashPercent}%`);
      if (coalQuality.calorificValue) q.push(`GCV: ${coalQuality.calorificValue}`);
      if (q.length > 0) formattedNotes = (formattedNotes ? formattedNotes + " | " : "") + q.join(", ");
    }

    const receipt = await truckContract.methods
      .recordCheckpoint(shipment.blockchainId, label, measuredTons, formattedNotes)
      .send({ from: accounts[0], gas: 600000 });

    shipment.checkpoints.push({
      location: label, reportedTons: measuredTons, tonsMatch,
      notes, txHash: receipt.transactionHash, depotId: depot?._id || null, diff,
      coalQuality
    });
    shipment.status = "InTransit";
    await shipment.save();

    let alert = null;
    if (!tonsMatch) {
      alert = await Alert.create({
        shipmentId: shipment._id,
        severity: diff < 0 ? "Critical" : "High",
        reason: diff < 0 ? "SHORTAGE_AT_DEPOT" : "EXCESS_AT_DEPOT",
        expectedTons: shipment.authorizedTons,
        reportedTons: measuredTons,
        notes: `Depot: ${label}. Diff: ${diff > 0 ? "+" : ""}${diff.toFixed(2)}t`,
      });
      const clients = req.app.locals.sseClients?.[shipment._id.toString()] || [];
      clients.forEach(c => c.write(`data: ${JSON.stringify({ type: "alert", severity: alert.severity, reason: alert.reason, diff, depot: label })}\n\n`));
    }

    res.json({ success: true, tonsMatch, diff, txHash: receipt.transactionHash, alert });
  } catch (e) { err(res, e, "Depot scan failed"); }
});

// ─── Checkpoint ───────────────────────────────────────────────────────────────
router.post("/api/shipments/:id/checkpoint", async (req, res) => {
  try {
    const { location, reportedTons, notes } = req.body;
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: "Not found" });
    if (!["Dispatched", "InTransit"].includes(shipment.status))
      return res.status(400).json({ success: false, error: "Shipment not in transit" });

    const { truckContract } = req.app.locals;
    const accounts = await req.app.locals.web3.eth.getAccounts();
    const receipt = await truckContract.methods
      .recordCheckpoint(shipment.blockchainId, location, reportedTons, notes || "")
      .send({ from: accounts[0], gas: 600000 });

    const tolerance = shipment.authorizedTons * 0.02;
    const tonsMatch = reportedTons >= shipment.authorizedTons - tolerance &&
                      reportedTons <= shipment.authorizedTons + tolerance;

    shipment.checkpoints.push({ location, reportedTons, tonsMatch, notes, txHash: receipt.transactionHash });
    shipment.status = "InTransit";
    await shipment.save();

    if (!tonsMatch) {
      const shortage = reportedTons < shipment.authorizedTons;
      const alertDoc = await Alert.create({
        shipmentId: shipment._id,
        severity: shortage ? "High" : "Medium",
        reason: shortage ? "SHORTAGE_DETECTED" : "EXCESS_DETECTED",
        expectedTons: shipment.authorizedTons, reportedTons,
      });
      return res.json({ success: true, data: shipment, alert: alertDoc, tonsMatch: false });
    }
    res.json({ success: true, data: shipment, tonsMatch: true });
  } catch (e) { err(res, e, "Checkpoint failed"); }
});

// ─── Deliver ──────────────────────────────────────────────────────────────────
router.post("/api/shipments/:id/deliver", async (req, res) => {
  try {
    const { finalTons } = req.body;
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ success: false, error: "Not found" });

    const { truckContract } = req.app.locals;
    const accounts = await req.app.locals.web3.eth.getAccounts();
    await truckContract.methods.confirmDelivery(shipment.blockchainId, finalTons).send({ from: accounts[0], gas: 600000 });

    const tolerance = shipment.authorizedTons * 0.02;
    const match = finalTons >= shipment.authorizedTons - tolerance && finalTons <= shipment.authorizedTons + tolerance;

    shipment.finalTons = finalTons;
    shipment.status = match ? "Delivered" : "Flagged";
    shipment.deliveredAt = match ? new Date() : undefined;
    await shipment.save();

    if (!match) {
      await Alert.create({ shipmentId: shipment._id, severity: "Critical", reason: "DELIVERY_DISCREPANCY", expectedTons: shipment.authorizedTons, reportedTons: finalTons });
    }
    res.json({ success: true, data: shipment, discrepancy: !match });
  } catch (e) { err(res, e, "Delivery confirmation failed"); }
});

// ─── Alerts ───────────────────────────────────────────────────────────────────
router.get("/api/alerts", async (req, res) => {
  try {
    const { resolved, severity, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (resolved !== undefined) filter.resolved = resolved === "true";
    if (severity) filter.severity = severity;
    const [data, total] = await Promise.all([
      Alert.find(filter)
        .populate({ path: "shipmentId", populate: [
          { path: "truckId", select: "plateNumber driverName" },
          { path: "concessionId", select: "companyName" }
        ]})
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(+limit),
      Alert.countDocuments(filter),
    ]);
    res.json({ success: true, data, total });
  } catch (e) { err(res, e, "Failed to fetch alerts"); }
});

router.patch("/api/alerts/:id/resolve", async (req, res) => {
  try {
    const { notes } = req.body;
    const alert = await Alert.findByIdAndUpdate(req.params.id, { resolved: true, resolvedAt: new Date(), notes }, { new: true });
    if (!alert) return res.status(404).json({ success: false, error: "Alert not found" });
    try {
      const { truckContract } = req.app.locals;
      if (alert.blockchainId) {
        const accounts = await req.app.locals.web3.eth.getAccounts();
        await truckContract.methods.resolveAlert(alert.blockchainId).send({ from: accounts[0], gas: 600000 });
      }
    } catch (_) {}
    res.json({ success: true, data: alert });
  } catch (e) { err(res, e, "Resolve failed"); }
});

router.post("/api/alerts/manual", async (req, res) => {
  try {
    const { shipmentId, severity, reason, notes } = req.body;
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) return res.status(404).json({ success: false, error: "Shipment not found" });
    if (!shipment.blockchainId) return res.status(400).json({ success: false, error: "Shipment not deployed to blockchain" });
    
    const severityMap = { Low: 0, Medium: 1, High: 2, Critical: 3 };
    const { truckContract } = req.app.locals;
    const accounts = await req.app.locals.web3.eth.getAccounts();
    await truckContract.methods.raiseManualAlert(shipment.blockchainId, severityMap[severity] ?? 2, reason).send({ from: accounts[0], gas: 600000 });
    
    if (severity === "Critical") await Shipment.findByIdAndUpdate(shipmentId, { status: "Seized" });
    const alert = await Alert.create({ shipmentId, severity, reason, notes, expectedTons: shipment.authorizedTons });
    res.status(201).json({ success: true, data: alert });
  } catch (e) { err(res, e, "Manual alert failed"); }
});

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get("/api/analytics/trucks", async (req, res) => {
  try {
    const [shipmentsByStatus, activeAlerts, truckCount, recentAlerts, topAlertedTrucks] = await Promise.all([
      Shipment.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Alert.countDocuments({ resolved: false }),
      Truck.countDocuments({ active: true }),
      Alert.find({ resolved: false }).sort({ createdAt: -1 }).limit(5)
        .populate({ path: "shipmentId", populate: { path: "truckId", select: "plateNumber" } }),
      Shipment.aggregate([
        { $group: { _id: "$truckId", alerts: { $sum: { $cond: [{ $eq: ["$status", "Flagged"] }, 1, 0] } }, total: { $sum: 1 } } },
        { $sort: { alerts: -1 } }, { $limit: 5 },
      ]),
    ]);
    res.json({ success: true, data: { shipmentsByStatus, activeAlerts, activeTrucks: truckCount, recentAlerts, topAlertedTrucks } });
  } catch (e) { err(res, e, "Truck analytics failed"); }
});

module.exports.router = router;