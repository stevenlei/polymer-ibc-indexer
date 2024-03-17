require("dotenv").config();

// This is an indexer for catching all events from several contracts
// Store the raw events data into text files
// We will be processing the raw data in the next step

const { ethers } = require("ethers");
const fs = require("fs");

const providerOp = new ethers.JsonRpcProvider(process.env.OP_RPC_URL);
const providerBase = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);

async function main() {
  //

  await getBlocksAndTransactions("op", providerOp);
  await getBlocksAndTransactions("base", providerBase);
}

async function getBlocksAndTransactions(chain, provider) {
  const files = fs.readdirSync(`${__dirname}/data`);
  const processedFiles = fs.readdirSync(`${__dirname}/data-tx`);

  const chainFiles = files
    .filter((file) => file.startsWith(chain))
    .filter((file) => !processedFiles.includes(file));

  // Loop through the files and read the file content
  for (let i = 0; i < chainFiles.length; i++) {
    const blocksAndTransactions = [];

    const file = chainFiles[i];
    console.log(
      `Processing file ${i + 1} of ${chainFiles.length} [${file}]...`
    );

    const fileContent = fs.readFileSync(`${__dirname}/data/${file}`, "utf-8");

    const data = JSON.parse(fileContent);

    for (let j = 0; j < data.length; j++) {
      const event = data[j];

      if (
        !blocksAndTransactions.find(
          (item) => item.blockNumber === event.blockNumber
        )
      ) {
        blocksAndTransactions.push({
          blockNumber: event.blockNumber,
          transactions: [event.transactionHash],
        });
      } else {
        const block = blocksAndTransactions.find(
          (item) => item.blockNumber === event.blockNumber
        );

        if (!block.transactions.includes(event.transactionHash)) {
          block.transactions.push(event.transactionHash);
        }
      }
    }

    //
    const processedFile = `${__dirname}/data-tx/${file}`;
    const result = await fillBlockAndTransactionData(
      provider,
      blocksAndTransactions
    );
    fs.writeFileSync(processedFile, JSON.stringify(result, null, 2));
  } // for
}

async function fillBlockAndTransactionData(
  provider,
  blocksAndTransactions,
  chunkSize = 50
) {
  // we should process blocksAndTransactions in chunks
  // to avoid hitting the rate limit of the provider

  const chunks = [];

  for (let i = 0; i < blocksAndTransactions.length; i += chunkSize) {
    chunks.push(blocksAndTransactions.slice(i, i + chunkSize));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const blocks = await Promise.all(
      chunk.map(async (record) => {
        return await provider.getBlock(record.blockNumber, true);
      })
    );

    for (let j = 0; j < chunk.length; j++) {
      const record = chunk[j];

      const theBlock = blocks.find(
        (block) => block.number === record.blockNumber
      );

      if (!record.block) {
        record.block = {
          number: theBlock.number,
          hash: theBlock.hash,
          timestamp: theBlock.timestamp,
        };
      }

      // get transactions
      record.prefetchedTransactions = theBlock.prefetchedTransactions
        .filter((tx) => record.transactions.includes(tx.hash))
        .map((tx) => {
          return {
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

      // console.log(theBlock.prefetchedTransactions);
    }

    console.log(`> Processed chunk ${i + 1} of ${chunks.length}`);
    await wait(1000);
  }

  // combine the chunks back to the original array
  const combined = chunks.reduce((acc, val) => acc.concat(val), []);

  return combined;

  // const recordsToProcess = blocksAndTransactions
  //   .filter((block) => block.transactions.length > 1)
  //   .slice(0, 3);

  // console.log(recordsToProcess);

  // // get block
  // const blocks = await Promise.all(
  //   recordsToProcess.map(async (record) => {
  //     return await provider.getBlock(record.blockNumber, true);
  //   })
  // );

  // for (let i = 0; i < recordsToProcess.length; i++) {
  //   const record = recordsToProcess[i];

  //   const theBlock = blocks.find(
  //     (block) => block.number === record.blockNumber
  //   );

  //   if (!record.block) {
  //     record.block = {
  //       number: theBlock.number,
  //       hash: theBlock.hash,
  //       timestamp: theBlock.timestamp,
  //     };
  //   }

  //   // get transactions
  //   record.prefetchedTransactions = theBlock.prefetchedTransactions
  //     .filter((tx) => record.transactions.includes(tx.hash))
  //     .map((tx) => {
  //       return {
  //         hash: tx.hash,
  //         from: tx.from,
  //         to: tx.to,
  //         value: tx.value.toString(),
  //         gasPrice: tx.gasPrice.toString(),
  //         gasLimit: tx.gasLimit.toString(),
  //         maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString(),
  //         maxFeePerGas: tx.maxFeePerGas.toString(),
  //         data: tx.data,
  //         nonce: Number(tx.nonce),
  //         index: Number(tx.index),
  //       };
  //     });

  //   // console.log(theBlock.prefetchedTransactions);
  // }

  // console.log(JSON.stringify(recordsToProcess, null, 2));
}

main();

async function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
