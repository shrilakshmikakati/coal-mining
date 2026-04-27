module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "1337",
      gas: 6721975,
      gasPrice: 20000000000,
      from: "0xC3736C6Dd92999f29231851B9853b5854d719344",
    },
  },
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
        evmVersion: "paris",   // compatible with Ganache MERGE hardfork
      },
    },
  },
};