const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const { ethers } = require("ethers");

const OP_GENESIS_BLOCK = 8752864;
const BASE_GENESIS_BLOCK = 6768208;

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

const prisma = new PrismaClient();

async function main() {
  //
  const lastBlockOp = await getLastIndexedBlockNumber("optimism-sepolia");
  const lastBlockBase = await getLastIndexedBlockNumber("base-sepolia");

  const START_BLOCK_OP = lastBlockOp ? lastBlockOp + 1 : OP_GENESIS_BLOCK;
  const START_BLOCK_BASE = lastBlockBase
    ? lastBlockBase + 1
    : BASE_GENESIS_BLOCK;

  // OP
  await indexEventsToDB(
    "optimism-sepolia",
    providerOp,
    opContractAddresses,
    START_BLOCK_OP,
    5000
  );

  // BASE
  await indexEventsToDB(
    "base-sepolia",
    providerBase,
    baseContractAddresses,
    START_BLOCK_BASE,
    5000
  );
}

async function getLastIndexedBlockNumber(chain) {
  const lastRecord = await prisma.RawEvent.findFirst({
    where: { chain },
    orderBy: { blockNumber: "desc" },
  });

  return lastRecord ? lastRecord.blockNumber : null;
}

async function indexEventsToDB(
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

  let batch = 0;

  for (let i = startBlock; i < latestBlock; i += perBatch) {
    const fromBlock = i;
    const toBlock = Math.min(i + perBatch, latestBlock);

    const filter = {
      address: contractAddresses,
      fromBlock,
      toBlock,
    };

    const events = await provider.getLogs(filter);

    await prisma.RawEvent.createMany({
      data: events.map((event) => ({
        chain,
        address: event.address,
        blockHash: event.blockHash,
        blockNumber: event.blockNumber,
        data: event.data,
        index: event.index,
        removed: event.removed,
        topics: JSON.stringify(event.topics),
        transactionHash: event.transactionHash,
        transactionIndex: event.transactionIndex,
      })),
      skipDuplicates: true,
    });

    batch++;

    console.log(
      `Indexed ${
        events.length
      } events from block ${fromBlock} to ${toBlock} ${batch} of ${Math.ceil(
        (latestBlock - startBlock) / perBatch
      )}`
    );
  }
}

main();
