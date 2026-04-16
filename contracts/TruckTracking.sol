// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract TruckTracking {
    enum ShipmentStatus { Dispatched, InTransit, Flagged, Delivered, Seized }
    enum AlertSeverity  { Low, Medium, High, Critical }

    struct Truck {
        uint256 id;
        string plateNumber;
        address operator;
        string mongoId;
        bool active;
        uint256 registeredAt;
    }

    struct Manifest {
        uint256 shipmentId;
        uint256 concessionBlockchainId;
        string  truckMongoId;
        uint256 authorizedTons;
        string  originLocation;
        string  destinationLocation;
        string  sealHash;          // SHA-256 of manifest data — tamper proof
        uint256 dispatchedAt;
        uint256 deliveredAt;
        ShipmentStatus status;
    }

    struct Checkpoint {
        uint256 shipmentId;
        string  location;
        uint256 reportedTons;
        uint256 timestamp;
        address scanner;
        bool    tonsMatch;
        string  notes;
    }

    struct TheftAlert {
        uint256 id;
        uint256 shipmentId;
        AlertSeverity severity;
        string  reason;
        uint256 expectedTons;
        uint256 reportedTons;
        uint256 raisedAt;
        bool    resolved;
        address raisedBy;
    }

    address public regulator;
    uint256 private nextTruckId;
    uint256 private nextShipmentId;
    uint256 private nextAlertId;

    mapping(uint256 => Truck)         public trucks;
    mapping(string  => uint256)       public plateToTruckId;   // plateNumber → truckId
    mapping(uint256 => Manifest)      public shipments;
    mapping(uint256 => Checkpoint[])  public checkpoints;
    mapping(uint256 => TheftAlert)    public alerts;
    mapping(uint256 => uint256[])     public shipmentAlerts;   // shipmentId → alertIds

    uint256[] public allShipmentIds;
    uint256[] public allAlertIds;

    event TruckRegistered(uint256 indexed id, string plateNumber, address operator);
    event ShipmentDispatched(uint256 indexed id, string truckMongoId, uint256 authorizedTons);
    event CheckpointScanned(uint256 indexed shipmentId, string location, bool tonsMatch);
    event TheftAlertRaised(uint256 indexed alertId, uint256 indexed shipmentId, AlertSeverity severity);
    event AlertResolved(uint256 indexed alertId);
    event ShipmentDelivered(uint256 indexed id, uint256 finalTons);

    modifier onlyRegulator() { require(msg.sender == regulator, "Not regulator"); _; }
    modifier shipmentExists(uint256 id) { require(id > 0 && id <= nextShipmentId, "Shipment not found"); _; }

    constructor() { regulator = msg.sender; }

    // ─── Truck Registration ───────────────────────────────────────────────────

    function registerTruck(
        string calldata plateNumber,
        address operator,
        string calldata mongoId
    ) external onlyRegulator returns (uint256) {
        require(plateToTruckId[plateNumber] == 0, "Plate already registered");
        require(operator != address(0), "Invalid operator");
        nextTruckId++;
        trucks[nextTruckId] = Truck({
            id: nextTruckId,
            plateNumber: plateNumber,
            operator: operator,
            mongoId: mongoId,
            active: true,
            registeredAt: block.timestamp
        });
        plateToTruckId[plateNumber] = nextTruckId;
        emit TruckRegistered(nextTruckId, plateNumber, operator);
        return nextTruckId;
    }

    function setTruckActive(uint256 truckId, bool active) external onlyRegulator {
        require(truckId > 0 && truckId <= nextTruckId, "Truck not found");
        trucks[truckId].active = active;
    }

    // ─── Shipment Dispatch ────────────────────────────────────────────────────

    function dispatchShipment(
        uint256 concessionBlockchainId,
        string calldata truckMongoId,
        uint256 authorizedTons,
        string calldata originLocation,
        string calldata destinationLocation,
        string calldata sealHash
    ) external onlyRegulator returns (uint256) {
        require(authorizedTons > 0, "Tons must be positive");
        nextShipmentId++;
        uint256 id = nextShipmentId;
        shipments[id] = Manifest({
            shipmentId: id,
            concessionBlockchainId: concessionBlockchainId,
            truckMongoId: truckMongoId,
            authorizedTons: authorizedTons,
            originLocation: originLocation,
            destinationLocation: destinationLocation,
            sealHash: sealHash,
            dispatchedAt: block.timestamp,
            deliveredAt: 0,
            status: ShipmentStatus.Dispatched
        });
        allShipmentIds.push(id);
        emit ShipmentDispatched(id, truckMongoId, authorizedTons);
        return id;
    }

    // ─── Checkpoint Scan ──────────────────────────────────────────────────────

    function recordCheckpoint(
        uint256 shipmentId,
        string calldata location,
        uint256 reportedTons,
        string calldata notes
    ) external shipmentExists(shipmentId) {
        require(
            msg.sender == regulator,
            "Not authorized"
        );
        Manifest storage m = shipments[shipmentId];
        require(
            m.status == ShipmentStatus.Dispatched || m.status == ShipmentStatus.InTransit,
            "Shipment not in transit"
        );

        // Allow ±2% tolerance
        uint256 tolerance = m.authorizedTons * 2 / 100;
        bool tonsMatch = reportedTons >= m.authorizedTons - tolerance &&
                     reportedTons <= m.authorizedTons + tolerance;

        checkpoints[shipmentId].push(Checkpoint({
            shipmentId: shipmentId,
            location: location,
            reportedTons: reportedTons,
            timestamp: block.timestamp,
            scanner: msg.sender,
            tonsMatch: tonsMatch,
            notes: notes
        }));

        m.status = ShipmentStatus.InTransit;
        emit CheckpointScanned(shipmentId, location,tonsMatch);

        // Auto-raise alert if tons don't match
        if (!tonsMatch) {
            _raiseAlert(
                shipmentId,
                reportedTons < m.authorizedTons ? AlertSeverity.High : AlertSeverity.Medium,
                reportedTons < m.authorizedTons ? "SHORTAGE_DETECTED" : "EXCESS_DETECTED",
                m.authorizedTons,
                reportedTons
            );
        }
    }

    // ─── Delivery Confirmation ────────────────────────────────────────────────

    function confirmDelivery(
        uint256 shipmentId,
        uint256 finalTons
    ) external onlyRegulator shipmentExists(shipmentId) {
        Manifest storage m = shipments[shipmentId];
        require(m.status != ShipmentStatus.Delivered, "Already delivered");
        require(m.status != ShipmentStatus.Seized, "Shipment seized");

        uint256 tolerance = m.authorizedTons * 2 / 100;
        bool tonsMatch = finalTons >= m.authorizedTons - tolerance &&
                     finalTons <= m.authorizedTons + tolerance;

        if (!tonsMatch) {
            _raiseAlert(
                shipmentId,
                AlertSeverity.Critical,
                "DELIVERY_DISCREPANCY",
                m.authorizedTons,
                finalTons
            );
            m.status = ShipmentStatus.Flagged;
        } else {
            m.status = ShipmentStatus.Delivered;
            m.deliveredAt = block.timestamp;
        }

        emit ShipmentDelivered(shipmentId, finalTons);
    }

    // ─── Manual Alert & Resolution ────────────────────────────────────────────

    function raiseManualAlert(
        uint256 shipmentId,
        AlertSeverity severity,
        string calldata reason
    ) external onlyRegulator shipmentExists(shipmentId) {
        Manifest storage m = shipments[shipmentId];
        _raiseAlert(shipmentId, severity, reason, m.authorizedTons, 0);
        if (severity == AlertSeverity.Critical) {
            m.status = ShipmentStatus.Seized;
        }
    }

    function resolveAlert(uint256 alertId) external onlyRegulator {
        require(alertId > 0 && alertId <= nextAlertId, "Alert not found");
        alerts[alertId].resolved = true;
        emit AlertResolved(alertId);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _raiseAlert(
        uint256 shipmentId,
        AlertSeverity severity,
        string memory reason,
        uint256 expected,
        uint256 reported
    ) internal {
        nextAlertId++;
        alerts[nextAlertId] = TheftAlert({
            id: nextAlertId,
            shipmentId: shipmentId,
            severity: severity,
            reason: reason,
            expectedTons: expected,
            reportedTons: reported,
            raisedAt: block.timestamp,
            resolved: false,
            raisedBy: msg.sender
        });
        shipmentAlerts[shipmentId].push(nextAlertId);
        allAlertIds.push(nextAlertId);
        emit TheftAlertRaised(nextAlertId, shipmentId, severity);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getShipment(uint256 id) external view shipmentExists(id) returns (Manifest memory) {
        return shipments[id];
    }

    function getCheckpoints(uint256 shipmentId) external view returns (Checkpoint[] memory) {
        return checkpoints[shipmentId];
    }

    function getShipmentAlerts(uint256 shipmentId) external view returns (uint256[] memory) {
        return shipmentAlerts[shipmentId];
    }

    function getAlert(uint256 alertId) external view returns (TheftAlert memory) {
        require(alertId > 0 && alertId <= nextAlertId, "Alert not found");
        return alerts[alertId];
    }

    function getAllShipmentIds() external view returns (uint256[] memory) {
        return allShipmentIds;
    }

    function getAllAlertIds() external view returns (uint256[] memory) {
        return allAlertIds;
    }

    function getTruckById(uint256 truckId) external view returns (Truck memory) {
        require(truckId > 0 && truckId <= nextTruckId, "Truck not found");
        return trucks[truckId];
    }

    function getTotals() external view returns (uint256 totalTrucks, uint256 totalShipments, uint256 totalAlerts) {
        return (nextTruckId, nextShipmentId, nextAlertId);
    }
}
