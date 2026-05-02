import axios from "axios";

const isLocal = typeof window !== "undefined" && window.location.hostname === "localhost";
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || (isLocal ? "http://localhost:4000" : "/_/backend"),
  timeout: 30000,
});

export const getConcessions = (params) => api.get("/api/concessions", { params });
export const getConcession = (id) => api.get(`/api/concessions/${id}`);
export const createConcession = (data) => api.post("/api/concessions", data);
export const deployConcession = (id) => api.post(`/api/concessions/${id}/deploy`);
export const updateStatus = (id, status) => api.patch(`/api/concessions/${id}/status`, { status });

export const getExtractions = (params) => api.get("/api/extractions", { params });
export const recordExtraction = (data) => api.post("/api/extractions", data);

export const getTrucks = (params) => api.get("/api/trucks", { params });
export const createTruck = (data) => api.post("/api/trucks", data);
export const registerTruckOnChain = (id) => api.post(`/api/trucks/${id}/register-chain`);
export const updateTruck = (id, data) => api.patch(`/api/trucks/${id}`, data);

export const getShipments = (params) => api.get("/api/shipments", { params });
export const getShipment = (id) => api.get(`/api/shipments/${id}`);
export const createShipment = (data) => api.post("/api/shipments", data);
export const addCheckpoint = (id, data) => api.post(`/api/shipments/${id}/checkpoint`, data);
export const confirmDelivery = (id, finalTons) => api.post(`/api/shipments/${id}/deliver`, { finalTons });

export const getAlerts = (params) => api.get("/api/alerts", { params });
export const resolveAlert = (id, notes) => api.patch(`/api/alerts/${id}/resolve`, { notes });
export const raiseManualAlert = (data) => api.post("/api/alerts/manual", data);

export const getDashboard = () => api.get("/api/analytics/dashboard");
export const getTruckAnalytics = () => api.get("/api/analytics/trucks");
export const getBlockchainInfo = () => api.get("/api/blockchain/info");

export const getDepots = () => api.get("/api/depots");
export const createDepot = (data) => api.post("/api/depots", data);
export const depotScan = (shipmentId, data) => api.post(`/api/shipments/${shipmentId}/depot-scan`, data);
export const gpsping = (shipmentId, data) => api.post(`/api/shipments/${shipmentId}/ping`, data);

export const SHIPMENT_STATUS_COLORS = {
  Dispatched: "pending", InTransit: "active", Flagged: "suspended",
  Delivered: "active", Seized: "revoked",
};

export const ALERT_SEVERITY_COLORS = {
  Low: "#10b981", Medium: "#f59e0b", High: "#f97316", Critical: "#f43f5e",
};

export const statusColors = {
  Active: "active", Pending: "pending", Suspended: "suspended",
  Expired: "expired", Revoked: "revoked",
};

export const coalTypeColors = {
  Anthracite: "#38bdf8", Bituminous: "#f59e0b",
  "Sub-bituminous": "#10b981", Lignite: "#f97316",
};

export default api;