const mongoose = require("mongoose");
const { Web3 } = require("web3");
const CONTRACT_ABI = require("./backend/abi/CoalConcession.json");
require("dotenv").config({ path: "./backend/.env" });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const web3 = new Web3(process.env.GANACHE_URL);
  const contract = new web3.eth.Contract(CONTRACT_ABI.abi, process.env.CONTRACT_ADDRESS);
  const accounts = await web3.eth.getAccounts();
  
  const Concession = mongoose.model("Concession", new mongoose.Schema({}, { strict: false }));
  const concessions = await Concession.find({ status: "Active" });
  console.log("Active Concessions:", concessions.length);
  
  for (let doc of concessions) {
    try {
      console.log(`Checking concession ${doc._id}, blockchainId: ${doc.blockchainId}`);
      const chainData = await contract.methods.getConcession(doc.blockchainId).call();
      console.log("Chain data:", chainData);
    } catch(e) {
      console.error("Contract call failed for", doc._id, e.message);
    }
  }
  process.exit();
}
run();
