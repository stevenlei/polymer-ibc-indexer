const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const { ethers } = require("ethers");

const OP_GENESIS_BLOCK = 8752864;
const BASE_GENESIS_BLOCK = 6768208;
const MOLTEN_GENESIS_BLOCK = 3587398;

const providerOp = new ethers.JsonRpcProvider(process.env.OP_RPC_URL);
const providerBase = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
const providerMolten = new ethers.JsonRpcProvider(process.env.MOLTEN_RPC_URL);

const opContractAddresses = [
  process.env.OP_DISPATCHER.split(","),
  process.env.OP_DISPATCHER_SIM.split(","),
].flat();

const baseContractAddresses = [
  process.env.BASE_DISPATCHER.split(","),
  process.env.BASE_DISPATCHER_SIM.split(","),
].flat();

const moltenContractAddresses = [
  process.env.MOLTEN_DISPATCHER_SIM.split(","),
].flat();

const prisma = new PrismaClient();

// if running this script with --watch, keep running indefinitely
const watch = process.argv.includes("--watch");

if (watch) {
  console.log(`Running in watch mode`);
}

// correct mode: sometimes we want to re-process the data from a certain timestamp
// for example, when there is a new chain added, we want to re-process the data
const correct = process.argv.includes("--correct");
let correctTimestamp = 0;

if (correct) {
  // get the value of the timestamp
  correctTimestamp = process.argv[process.argv.indexOf("--correct") + 1];
  console.log(`Correcting data from ${correctTimestamp}`);
}

async function main() {
  // If correct mode is enabled, delete all the events and transactions from that timestamp onwards
  if (correct) {
    // we need to know the first block number from that timestamp of each chain
    // as timestamp is only available in transactions, not in events

    const chains = await prisma.chain.findMany();

    for (const chain of chains) {
      // get the first block number from that timestamp
      const firstBlock = await prisma.rawTransaction.findFirst({
        where: {
          chain: chain.id,
          timestamp: { gte: correctTimestamp },
        },
        orderBy: { blockNumber: "asc" },
      });

      if (firstBlock) {
        console.log(
          `Deleting data from ${firstBlock.blockNumber} onwards for ${chain.id}`
        );

        // delete all the events and transactions from that block number onwards
        await prisma.rawEvent.deleteMany({
          where: {
            chain: chain.id,
            blockNumber: { gte: firstBlock.blockNumber },
          },
        });

        await prisma.rawTransaction.deleteMany({
          where: {
            chain: chain.id,
            blockNumber: { gte: firstBlock.blockNumber },
          },
        });
      }
    }
  }

  while (true) {
    await indexEvents();
    if (!watch) {
      break;
    }

    // 10 seconds between indexing runs
    await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
  }
}

async function indexEvents() {
  const lastBlockOp = await getLastIndexedBlockNumber(
    "optimism-sepolia",
    correct
  );
  const lastBlockBase = await getLastIndexedBlockNumber(
    "base-sepolia",
    correct
  );
  const lastBlockMolten = await getLastIndexedBlockNumber(
    "molten-magma",
    correct
  );

  const START_BLOCK_OP = lastBlockOp ? lastBlockOp + 1 : OP_GENESIS_BLOCK;
  const START_BLOCK_BASE = lastBlockBase
    ? lastBlockBase + 1
    : BASE_GENESIS_BLOCK;
  const START_BLOCK_MOLTEN = lastBlockMolten
    ? lastBlockMolten + 1
    : MOLTEN_GENESIS_BLOCK;

  const all = await Promise.all([
    getNewEvents(
      "optimism-sepolia",
      providerOp,
      opContractAddresses,
      START_BLOCK_OP,
      5000
    ),
    getNewEvents(
      "base-sepolia",
      providerBase,
      baseContractAddresses,
      START_BLOCK_BASE,
      5000
    ),
    getNewEvents(
      "molten-magma",
      providerMolten,
      moltenContractAddresses,
      START_BLOCK_MOLTEN,
      5000
    ),
  ]);

  const events = all.flat();

  console.log(`Total new events`, events.length);

  // write to db in batches
  await prisma.rawEvent.createMany({
    data: events.map((event) => ({
      chain: event.chain,
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
}

async function getLastIndexedBlockNumber(chain, correctMode = false) {
  const lastEventBlockNumberQuery = await prisma.indexerStatus.findUnique({
    where: { id: `last-event-blocknumber-${chain}` },
  });

  let lastEventBlockNumber = lastEventBlockNumberQuery
    ? Number(lastEventBlockNumberQuery.value)
    : 0;

  // fallback: if the last event block number is 0, find the last indexed event from the db
  if (lastEventBlockNumber === 0 || correctMode) {
    const lastRecord = await prisma.rawEvent.findFirst({
      where: { chain },
      orderBy: { blockNumber: "desc" },
    });

    lastEventBlockNumber = lastRecord ? lastRecord.blockNumber : 0;
  }

  return lastEventBlockNumber || null;
}

async function getNewEvents(
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

  const results = [];

  for (let i = startBlock; i < latestBlock; i += perBatch) {
    const fromBlock = i;
    const toBlock = Math.min(i + perBatch, latestBlock);

    const filter = {
      address: contractAddresses,
      fromBlock,
      toBlock,
    };

    const events = await provider.getLogs(filter);

    results.push(...events.map((event) => ({ ...event, chain })));

    batch++;

    console.log(
      `Indexed ${
        events.length
      } events from block ${fromBlock} to ${toBlock} ${batch} of ${Math.ceil(
        (latestBlock - startBlock) / perBatch
      )}`
    );

    // update the last processed index status
    await prisma.indexerStatus.upsert({
      where: { id: `last-event-blocknumber-${chain}` },
      create: {
        id: `last-event-blocknumber-${chain}`,
        value: `${toBlock}`,
      },
      update: {
        value: `${toBlock}`,
      },
    });
  }

  return results;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
