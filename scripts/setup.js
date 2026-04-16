#!/usr/bin/env node
/**
 * Run after `truffle migrate` to copy ABIs and print contract addresses
 * Usage: node scripts/setup.js
 */
const fs = require("fs");
const path = require("path");

const buildDir = path.join(__dirname, "../build/contracts");
const backendAbiDir = path.join(__dirname, "../backend/abi");
fs.mkdirSync(backendAbiDir, { recursive: true });

const contracts = ["CoalConcession", "TruckTracking"];
const addresses = {};

for (const name of contracts) {
  const buildPath = path.join(buildDir, `${name}.json`);
  if (!fs.existsSync(buildPath)) {
    console.error(` ${name} not compiled. Run: truffle migrate`);
    process.exit(1);
  }
  fs.copyFileSync(buildPath, path.join(backendAbiDir, `${name}.json`));
  const artifact = JSON.parse(fs.readFileSync(buildPath));
  const networkIds = Object.keys(artifact.networks);
  if (networkIds.length === 0) {
    console.error(` ${name} not deployed. Run: truffle migrate`);
    process.exit(1);
  }
  const latest = artifact.networks[networkIds[networkIds.length - 1]];
  addresses[name] = latest.address;
  console.log(` ${name} ABI copied → ${latest.address}`);
}

console.log(`\n Add to backend/.env:`);
console.log(`CONTRACT_ADDRESS=${addresses.CoalConcession}`);
console.log(`TRUCK_CONTRACT_ADDRESS=${addresses.TruckTracking}`);
