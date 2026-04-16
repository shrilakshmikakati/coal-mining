const CoalConcession = artifacts.require("CoalConcession");
const TruckTracking  = artifacts.require("TruckTracking");

module.exports = function (deployer) {
  deployer.deploy(CoalConcession);
  deployer.deploy(TruckTracking);
};
