// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CoalConcession {
    enum Status { Pending, Active, Suspended, Expired, Revoked }

    struct Concession {
        uint256 id;
        string mongoId;
        address owner;
        string location;
        uint256 areaHectares;
        uint256 maxExtractionTons;
        uint256 extractedTons;
        Status status;
        uint256 issuedAt;
        uint256 expiresAt;
        string licenseHash;
    }

    struct ExtractionRecord {
        uint256 concessionId;
        uint256 tons;
        uint256 timestamp;
        address recorder;
        string batchId;
    }

    address public regulator;
    uint256 private nextId;
    
    mapping(uint256 => Concession) public concessions;
    mapping(address => uint256[]) public ownerConcessions;
    mapping(uint256 => ExtractionRecord[]) public extractionHistory;
    uint256[] public allConcessionIds;

    event ConcessionGranted(uint256 indexed id, address indexed owner, string location);
    event ConcessionStatusChanged(uint256 indexed id, Status newStatus);
    event ExtractionRecorded(uint256 indexed concessionId, uint256 tons, string batchId);
    event RegulatorTransferred(address oldRegulator, address newRegulator);

    modifier onlyRegulator() {
        require(msg.sender == regulator, "Not regulator");
        _;
    }

    modifier concessionExists(uint256 id) {
        require(id > 0 && id <= nextId, "Concession not found");
        _;
    }

    constructor() {
        regulator = msg.sender;
        nextId = 0;
    }

    function grantConcession(
        address owner,
        string calldata mongoId,
        string calldata location,
        uint256 areaHectares,
        uint256 maxExtractionTons,
        uint256 durationDays,
        string calldata licenseHash
    ) external onlyRegulator returns (uint256) {
        require(owner != address(0), "Invalid owner");
        require(areaHectares > 0, "Area must be positive");
        require(maxExtractionTons > 0, "Max extraction must be positive");
        require(durationDays > 0, "Duration must be positive");

        nextId++;
        uint256 id = nextId;

        concessions[id] = Concession({
            id: id,
            mongoId: mongoId,
            owner: owner,
            location: location,
            areaHectares: areaHectares,
            maxExtractionTons: maxExtractionTons,
            extractedTons: 0,
            status: Status.Active,
            issuedAt: block.timestamp,
            expiresAt: block.timestamp + (durationDays * 1 days),
            licenseHash: licenseHash
        });

        ownerConcessions[owner].push(id);
        allConcessionIds.push(id);

        emit ConcessionGranted(id, owner, location);
        return id;
    }

    function recordExtraction(
        uint256 concessionId,
        uint256 tons,
        string calldata batchId
    ) external concessionExists(concessionId) {
        Concession storage c = concessions[concessionId];
        require(
            msg.sender == c.owner || msg.sender == regulator,
            "Not authorized"
        );
        require(c.status == Status.Active, "Concession not active");
        require(block.timestamp <= c.expiresAt, "Concession expired");
        require(c.extractedTons + tons <= c.maxExtractionTons, "Exceeds quota");

        c.extractedTons += tons;

        extractionHistory[concessionId].push(ExtractionRecord({
            concessionId: concessionId,
            tons: tons,
            timestamp: block.timestamp,
            recorder: msg.sender,
            batchId: batchId
        }));

        emit ExtractionRecorded(concessionId, tons, batchId);

        if (c.extractedTons >= c.maxExtractionTons) {
            c.status = Status.Expired;
            emit ConcessionStatusChanged(concessionId, Status.Expired);
        }
    }

    function updateStatus(uint256 concessionId, Status newStatus)
        external
        onlyRegulator
        concessionExists(concessionId)
    {
        concessions[concessionId].status = newStatus;
        emit ConcessionStatusChanged(concessionId, newStatus);
    }

    function transferRegulator(address newRegulator) external onlyRegulator {
        require(newRegulator != address(0), "Invalid address");
        emit RegulatorTransferred(regulator, newRegulator);
        regulator = newRegulator;
    }

    function getConcession(uint256 id) external view concessionExists(id) returns (Concession memory) {
        return concessions[id];
    }

    function getOwnerConcessions(address owner) external view returns (uint256[] memory) {
        return ownerConcessions[owner];
    }

    function getExtractionHistory(uint256 concessionId) external view returns (ExtractionRecord[] memory) {
        return extractionHistory[concessionId];
    }

    function getAllConcessionIds() external view returns (uint256[] memory) {
        return allConcessionIds;
    }

    function getTotalConcessions() external view returns (uint256) {
        return nextId;
    }
}
