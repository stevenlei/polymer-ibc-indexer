require("dotenv").config();

// This is an indexer for catching all events from several contracts
// Store the raw events data into text files
// We will be processing the raw data in the next step

const { ethers } = require("ethers");
const fs = require("fs");

const providerOp = new ethers.JsonRpcProvider(process.env.OP_RPC_URL);
const providerBase = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);

const opContractAddresses = [
  process.env.OP_DISPATCHER,
  process.env.OP_DISPATCHER_SIM,
];

const baseContractAddresses = [
  process.env.BASE_DISPATCHER,
  process.env.BASE_DISPATCHER_SIM,
];

const START_BLOCK_OP = getLastIndexedBlockNumber("op") + 1 || 8752864;
const START_BLOCK_BASE = getLastIndexedBlockNumber("base") + 1 || 8752864;

async function main() {
  // fetch all events from the contracts
  // from the start block to the latest block

  // OP
  await indexEventsToFile(
    "op",
    providerOp,
    opContractAddresses,
    START_BLOCK_OP,
    5000
  );

  // BASE
  await indexEventsToFile(
    "base",
    providerBase,
    baseContractAddresses,
    START_BLOCK_BASE,
    5000
  );
}

function getLastIndexedBlockNumber(chain) {
  const files = fs.readdirSync(`${__dirname}/data`);
  const chainFiles = files.filter((file) => file.startsWith(chain));

  if (chainFiles.length === 0) {
    return 0;
  }

  const lastFile = chainFiles[chainFiles.length - 1];
  const lastBlock = lastFile.split("-")[2];

  return parseInt(lastBlock);
}

async function indexEventsToFile(
  chain,
  provider,
  contractAddresses,
  startBlock,
  perBatch
) {
  const latestBlock = await provider.getBlockNumber();

  console.log(
    `Latest block ${chain}: ${latestBlock}, Batches: ${Math.ceil(
      (latestBlock - startBlock) / perBatch
    )}`
  );

  for (let i = startBlock; i < latestBlock; i += perBatch) {
    const fromBlock = i;
    const toBlock = Math.min(i + perBatch, latestBlock);

    const filter = {
      address: contractAddresses,
      fromBlock,
      toBlock,
    };

    const events = await provider.getLogs(filter);

    const fileName = `${__dirname}/data/${chain}-${fromBlock}-${toBlock}.json`;
    const data = JSON.stringify(events);

    fs.writeFileSync(fileName, data);

    console.log(`Wrote ${events.length} events to ${fileName}`);
  }
}

main();
