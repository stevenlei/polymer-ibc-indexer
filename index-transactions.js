require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

// This is an indexer for catching all events from several contracts
// Store the raw events data into text files
// We will be processing the raw data in the next step

const { ethers } = require("ethers");
const fs = require("fs");

const providerOp = new ethers.JsonRpcProvider(process.env.OP_RPC_URL);
const providerBase = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);

const prisma = new PrismaClient();

async function main() {
  //
  await getBlocksAndTransactions("optimism-sepolia", providerOp);
  await getBlocksAndTransactions("base-sepolia", providerBase);
}

async function getBlocksAndTransactions(chain, provider) {
  const lastEventRecord = await prisma.rawEvent.findFirst({
    where: { chain },
    orderBy: { blockNumber: "desc" },
  });

  const lastTransactionRecord = (await prisma.rawTransaction.findFirst({
    where: { chain },
    orderBy: { blockNumber: "desc" },
  })) || { blockNumber: 0 };

  if (!lastEventRecord && !lastTransactionRecord) {
    console.log(`No records found for ${chain}`);
    return;
  }

  if (lastTransactionRecord.blockNumber >= lastEventRecord.blockNumber) {
    console.log(
      `It is up to date. No need to process the transactions for ${chain}`
    );
  }

  // get the events start from lastTransactionRecord.blockNumber + 1
  // 50 blocks at a time

  const limit = 50;

  const blocksToFetch = (
    await prisma.rawEvent.findMany({
      where: {
        chain: chain,
        blockNumber: { gt: lastTransactionRecord.blockNumber },
      },
      select: { blockNumber: true },
      distinct: ["blockNumber"],
      orderBy: { blockNumber: "asc" },
    })
  ).map((record) => record.blockNumber);

  await getBlocksAndTransactionsInRange(chain, provider, blocksToFetch, limit);
}

async function getBlocksAndTransactionsInRange(
  chain,
  provider,
  blockNumbers,
  chunkSize
) {
  const chunks = [];

  for (let i = 0; i < blockNumbers.length; i += chunkSize) {
    chunks.push(blockNumbers.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const blocks = await Promise.all(
      chunk.map(async (blockNumber) => {
        return await provider.getBlock(blockNumber, true);
      })
    );

    for (let j = 0; j < blocks.length; j++) {
      //
      const block = blocks[j];

      const legitTransactions = (
        await prisma.rawEvent.findMany({
          where: { blockNumber: block.number },
          select: { transactionHash: true },
        })
      ).map((record) => record.transactionHash);

      const transactions = block.prefetchedTransactions
        .filter((tx) => legitTransactions.includes(tx.hash))
        .map((tx) => {
          return {
            chain: chain,
            blockNumber: block.number,
            timestamp: block.timestamp,
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value.toString(),
            gasPrice: tx.gasPrice.toString(),
            gasLimit: tx.gasLimit.toString(),
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() || null,
            maxFeePerGas: tx.maxFeePerGas?.toString() || null,
            data: tx.data,
            nonce: Number(tx.nonce),
            index: Number(tx.index),
          };
        });

      // save the transactions
      await prisma.rawTransaction.createMany(
        { data: transactions },
        { skipDuplicates: true }
      );
    }

    console.log(`> Processed chunk ${i + 1} of ${chunks.length}`);
    await wait(1000);
  }

  // combine the chunks back to the original array
  const combined = chunks.reduce((acc, val) => acc.concat(val), []);

  return combined;
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
async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
