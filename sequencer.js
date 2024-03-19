// This is a sequencer script that will merge the data from the two sources and write it to a new file
// Data are from two blockchains, events and transactions
// So we will sort them by timestamp

const fs = require("fs");
const path = require("path");

const opTxs = fs
  .readdirSync(path.join(__dirname, "data-tx-debug"))
  .filter((file) => file.endsWith(".json") && file.startsWith("op-"))
  .sort((a, b) => {
    const blockA = parseInt(a.split("-")[1]);
    const blockB = parseInt(b.split("-")[1]);

    return blockA - blockB;
  });

const baseTxs = fs
  .readdirSync(path.join(__dirname, "data-tx-debug"))
  .filter((file) => file.endsWith(".json") && file.startsWith("base-"))
  .sort((a, b) => {
    const blockA = parseInt(a.split("-")[1]);
    const blockB = parseInt(b.split("-")[1]);

    return blockA - blockB;
  });

// So there are two set of data, starts with op- and base-
// We will merge them by timestamp

/*
The structure:
[
  {
    "blockNumber": 6769996,
    "transactions": [
      "0x822c04e87ed83decc0eced80b2ec55fe6e333170b54b27b940d3aee6caf35c2a"
    ],
    "block": {
      "number": 6769996,
      "hash": "0xfda47177dfd80db5ff3d5d9126dce11b42a44f715f62c7d5ea5ad091212c48c1",
      "timestamp": 1709308280
    },
  },
  ...
}

I want it to be sorted like this:
[
  {
    "file": "op-6769996.json",
    "tx": "0x822c04e87ed83decc0eced80b2ec55fe6e333170b54b27b940d3aee6caf35c2a",
    "timestamp": 1709308280,
  },
  ...
]
*/

function processTxsData(files) {
  return files.map((file) => {
    const data = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data-tx-debug", file))
    );

    return data
      .map((block) => {
        return block.transactions.map((tx) => {
          return {
            file: file,
            tx,
            timestamp: block.block.timestamp,
          };
        });
      })
      .flat();
  });
}

const opTxsData = processTxsData(opTxs);
const baseTxsData = processTxsData(baseTxs);

const allTxs = [...opTxsData.flat(), ...baseTxsData.flat()].sort(
  (a, b) => a.timestamp - b.timestamp
);

fs.writeFileSync(
  path.join(__dirname, "sorted-txns.json"),
  JSON.stringify(allTxs, null, 2)
);
