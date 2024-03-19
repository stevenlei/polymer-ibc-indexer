const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const { ethers } = require("ethers");

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

/*
OpenIbcChannel(address indexed portAddress, string version, uint8 ordering, bool feeEnabled, string[] connectionHops, string counterpartyPortId, bytes32 counterpartyChannelId)
ConnectIbcChannel(address indexed portAddress, bytes32 channelId)
*/

// encode event signature to match
const signatureOpenIbcChannel = ethers.id(
  "OpenIbcChannel(address,string,uint8,bool,string[],string,bytes32)"
);
const signatureConnectIbcChannel = ethers.id(
  "ConnectIbcChannel(address,bytes32)"
);
const signatureSendPacket = ethers.id(
  "SendPacket(address,bytes32,bytes,uint64,uint64)"
);
const signatureRecvPacket = ethers.id("RecvPacket(address,bytes32,uint64)");
const signatureWriteAckPacket = ethers.id(
  "WriteAckPacket(address,bytes32,uint64,(bool,bytes))"
);
const signatureAcknowledgement = ethers.id(
  "Acknowledgement(address,bytes32,uint64)"
);

const prisma = new PrismaClient();

let eventFiles = fs
  .readdirSync(`${__dirname}/data-debug`)
  .filter((file) => file.endsWith(".json"))
  .sort((a, b) => {
    const blockA = parseInt(a.split("-")[1]);
    const blockB = parseInt(b.split("-")[1]);

    return blockA - blockB;
  });

// eventFiles = [
//   ...eventFiles.filter((file) => file.startsWith("op")),
//   ...eventFiles.filter((file) => file.startsWith("base")),
// ];

let txFiles = fs
  .readdirSync(`${__dirname}/data-tx-debug`)
  .filter((file) => file.endsWith(".json"))
  .sort((a, b) => {
    const blockA = parseInt(a.split("-")[1]);
    const blockB = parseInt(b.split("-")[1]);

    return blockA - blockB;
  });

// txFiles = [
//   ...txFiles.filter((file) => file.startsWith("op")),
//   ...txFiles.filter((file) => file.startsWith("base")),
// ];

console.log(eventFiles, txFiles);

async function main() {
  //
  // Upsert two chains: optimism-sepolia and base-sepolia
  await prisma.chain.upsert({
    where: { id: "optimism-sepolia" },
    create: {
      id: "optimism-sepolia",
      name: "Optimism Sepolia",
      type: "testnet",
    },
    update: {},
  });

  await prisma.chain.upsert({
    where: { id: "base-sepolia" },
    create: {
      id: "base-sepolia",
      name: "Base Sepolia",
      type: "testnet",
    },
    update: {},
  });

  for (let i = 0; i < eventFiles.length; i++) {
    const file = eventFiles[i];
    const data = JSON.parse(
      fs.readFileSync(`${__dirname}/data-debug/${file}`).toString()
    );
    const txData = JSON.parse(
      fs.readFileSync(`${__dirname}/data-tx-debug/${txFiles[i]}`).toString()
    );

    const chainId = {
      op: "optimism-sepolia",
      base: "base-sepolia",
    }[file.split("-")[0]];

    for (let j = 0; j < data.length; j++) {
      const event = data[j];

      const decoded = await decodeEvent(event);

      if (decoded) {
        const theBlock = txData.find((tx) => tx.blockNumber === decoded.block);
        decoded.block = theBlock.block;

        const theTx = theBlock.prefetchedTransactions.find(
          (tx) => tx.hash === decoded.tx
        );
        decoded.from = theTx.from;
        decoded.index = theTx.index;
        // decoded.sendData = theTx.data;

        // console.log(chainId, decoded);
        // continue;

        // DB

        // Upsert Address
        const address = await prisma.address.upsert({
          where: { address: decoded.from },
          create: {
            address: decoded.from,
          },
          update: {},
        });

        // Upsert Block
        const block = await prisma.block.upsert({
          where: { id: `${chainId}-${decoded.block.number}` },
          create: {
            id: `${chainId}-${decoded.block.number}`,
            chainId: chainId,
            number: decoded.block.number,
            hash: decoded.block.hash,
            timestamp: decoded.block.timestamp,
          },
          update: {},
        });

        if (decoded.type === "OpenIbcChannel") {
          console.log("OpenIbcChannel", decoded);
          const [
            counterpartyProtocol,
            counterpartyClient,
            _counterpartyPortAddress,
          ] = decoded.counterpartyPortId.split(".");

          const counterpartyPortAddress = `0x${_counterpartyPortAddress}`;

          // okay, we need to find out if there is an existing record by the counterpartyPortAddress
          const counterpartyChannel = await prisma.channel.findFirst({
            where: {
              portAddress: counterpartyPortAddress,
            },
          });

          if (counterpartyChannel) {
            console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

            await prisma.channel.update({
              where: {
                id: counterpartyChannel.id,
              },
              data: {
                counterpartyPortAddress: decoded.portAddress,
              },
            });
          } else {
            // if there isn't
            if (decoded.counterpartyChannelId === "") {
              // Initializer, create counterparty channel
              await prisma.channel.create({
                data: {
                  id: `handshake-${counterpartyPortAddress}`,
                  chainId: counterpartyChainId(counterpartyClient),
                  portAddress: counterpartyPortAddress,
                  counterpartyPortAddress: decoded.portAddress,
                },
              });
            } else {
              // Counterparty, we know the counterparty's channel id here
              await prisma.channel.create({
                data: {
                  id: decoded.counterpartyChannelId,
                  chainId: counterpartyChainId(counterpartyClient),
                  portAddress: counterpartyPortAddress,
                  counterpartyPortAddress: decoded.portAddress,
                },
              });

              // update the initializer's channel
              // await prisma.channel.updateMany({
              //   where: {
              //     portAddress: decoded.portAddress,
              //   },
              //   data: {
              //     id: decoded.counterpartyChannelId,
              //     blockId: block.id,
              //     client: counterpartyClient,
              //     counterpartyPortId: decoded.counterpartyPortId,
              //     connectionHops: JSON.stringify(decoded.connectionHops),
              //     txHash: decoded.tx,
              //     fromAddress: decoded.from,
              //   },
              // });
            }
          }

          // let tempId;

          // // if counterpartyChannelId is empty then it's a new channel (initiated by the current chain)
          // if (decoded.counterpartyChannelId === "") {
          //   tempId = `init-${decoded.portAddress}`;
          // } else {
          //   tempId = `handshake-${decoded.portAddress}`;
          // }

          // if (await prisma.channel.findUnique({ where: { id: tempId } })) {
          //   console.error("Channel already exists", tempId);
          //   continue;
          // }

          // const channel = await prisma.channel.create({
          //   data: {
          //     id: tempId,
          //     chainId: chainId,
          //     blockId: block.id,
          //     type: null,
          //     portAddress: decoded.portAddress,
          //     connectionHops: JSON.stringify(decoded.connectionHops),
          //     txHash: decoded.tx,
          //     fromAddress: decoded.from,
          //     counterpartyPortAddress: counterpartyPortAddress,
          //   },
          // });

          // if (decoded.counterpartyChannelId !== "") {
          //   // this is the counterparty channel accepting the handshake

          //   // check if the counterparty channel exists as it can be late due to log processing
          //   const counterpartyChannel = await prisma.channel.findFirst({
          //     where: {
          //       portAddress: counterpartyPortAddress,
          //     },
          //   });

          //   // if it doesn't exist, create it
          //   if (!counterpartyChannel) {
          //     const initializer = await prisma.channel.create({
          //       data: {
          //         id: decoded.counterpartyChannelId,
          //         portAddress: counterpartyPortAddress,
          //       },
          //     });

          //     // link up with the current channel
          //     await prisma.channel.updateMany({
          //       where: {
          //         portAddress: decoded.portAddress,
          //       },
          //       data: {
          //         counterpartyId: initializer.id,
          //       },
          //     });
          //   } else {
          //     // if it does exist, update it
          //     await prisma.channel.updateMany({
          //       where: {
          //         portAddress: counterpartyPortAddress,
          //       },
          //       data: {
          //         id: decoded.counterpartyChannelId,
          //       },
          //     });

          //     // link up with the current channel
          //     await prisma.channel.update({
          //       where: {
          //         id: decoded.counterpartyChannelId,
          //       },
          //       data: {
          //         portAddress: decoded.portAddress,
          //       },
          //     });
          //   }
          // }
        }

        if (decoded.type === "ConnectIbcChannel") {
          console.log("ConnectIbcChannel", decoded);

          const channel = await prisma.channel.upsert({
            where: {
              id: `handshake-${decoded.portAddress}`,
            },
            create: {
              id: decoded.channelId,
              chainId: chainId,
              portAddress: decoded.portAddress,
            },
            update: {},
          });

          if (channel.id) {
            await prisma.channel.updateMany({
              where: {
                counterpartyPortAddress: decoded.portAddress,
              },
              data: {
                counterpartyId: channel.id,
              },
            });
          }
        }

        // const channel = await prisma.channel.findUnique({
        //   where: {
        //     id: decoded.channelId,
        //   },
        // });

        // if (!channel) {
        //   throw new Error("Channel not found", decoded.channelId);
        // }

        // if (decoded.type === "SendPacket") {
        //   await prisma.packet.insert({
        //     data: {
        //       id: `${chainId}-${decoded.channelId}-${decoded.sequence}`,
        //       fromChainId: chainId,
        //       fromChannelId: decoded.channelId,
        //       blockId: block.id,
        //       txHash: decoded.tx,
        //       sequence: decoded.sequence,
        //       fromAddress: decoded.from,
        //       currentState: "SendPacket",
        //       timeoutTimestamp: decoded.timeout,
        //       timestamp: decoded.block.timestamp,
        //     },
        //   });
        // } else if (decode.type === "RecvPacket") {
        //   await prisma.state.insert({
        //     data: {
        //       packetId: "",
        //     },
        //   });
        // }
      }
    }

    // if (i > 50) break;
  }
}

function channelType(channelId) {
  if (
    ["channel-10", "channel-11", "channel-16", "channel-17"].includes(channelId)
  ) {
    return "universal";
  } else {
    return "custom";
  }
}

function counterpartyChainId(client) {
  if (client.includes("optimism")) {
    return "optimism-sepolia";
  } else {
    return "base-sepolia";
  }
}

async function decodeEvent(event) {
  const topic = event.topics[0];

  try {
    if (topic === signatureOpenIbcChannel) {
      // console.log("OpenIbcChannel", event);

      const [portAddress] = abiCoder.decode(["address"], event.topics[1]);

      const [
        version,
        ordering,
        feeEnabled,
        connectionHops,
        counterpartyPortId,
        counterpartyChannelId,
      ] = abiCoder.decode(
        ["string", "uint8", "bool", "string[]", "string", "bytes32"],
        event.data
      );

      const result = {
        type: "OpenIbcChannel",
        version: version,
        ordering: Number(ordering),
        feeEnabled: feeEnabled,
        connectionHops: [...connectionHops],
        counterpartyPortId: counterpartyPortId,
        counterpartyChannelId: ethers.decodeBytes32String(
          counterpartyChannelId
        ),
        portAddress: portAddress,
        block: event.blockNumber,
        tx: event.transactionHash,
      };

      return result;
    } else if (topic === signatureConnectIbcChannel) {
      // console.log("ConnectIbcChannel", event);

      const [portAddress] = abiCoder.decode(["address"], event.topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], event.data);

      const result = {
        type: "ConnectIbcChannel",
        channelId: ethers.decodeBytes32String(channelId),
        portAddress: portAddress,
        block: event.blockNumber,
        tx: event.transactionHash,
      };

      return result;
    } else if (topic === signatureSendPacket) {
      // console.log("SendPacket", event);

      // decode data
      const [portAddress] = abiCoder.decode(["address"], event.topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], event.topics[2]);
      const [packet, sequence, timeoutTimestamp] = abiCoder.decode(
        ["bytes", "uint64", "uint64"],
        event.data
      );

      const result = {
        type: "SendPacket",
        sequence: Number(sequence),
        channelId: ethers.decodeBytes32String(channelId),
        portAddress: portAddress,
        timeout: Number(timeoutTimestamp / 1000000000n),
        block: event.blockNumber,
        tx: event.transactionHash,
        packet: packet,
      };

      return result;
    } else if (topic === signatureRecvPacket) {
      // console.log("RecvPacket", event);

      // decode data
      const [portAddress] = abiCoder.decode(["address"], event.topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], event.topics[2]);
      const [sequence] = abiCoder.decode(["uint64"], event.data);

      const result = {
        type: "RecvPacket",
        sequence: Number(sequence),
        channelId: ethers.decodeBytes32String(channelId),
        portAddress: portAddress,
        block: event.blockNumber,
        tx: event.transactionHash,
      };

      return result;
    } else if (topic === signatureWriteAckPacket) {
      // console.log("WriteAckPacket", event);

      const [portAddress] = abiCoder.decode(["address"], event.topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], event.topics[2]);
      const [sequence, packet] = abiCoder.decode(
        ["uint64", "(bool,bytes)"],
        event.data
      );

      const result = {
        type: "WriteAckPacket",
        sequence: Number(sequence),
        channelId: ethers.decodeBytes32String(channelId),
        portAddress: portAddress,
        block: event.blockNumber,
        tx: event.transactionHash,
        packet: [...packet],
      };

      return result;
    } else if (topic === signatureAcknowledgement) {
      // console.log("Acknowledgement", event);

      const [portAddress] = abiCoder.decode(["address"], event.topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], event.topics[2]);
      const [sequence] = abiCoder.decode(["uint64"], event.data);

      const result = {
        type: "Acknowledgement",
        sequence: Number(sequence),
        channelId: ethers.decodeBytes32String(channelId),
        portAddress: portAddress,
        block: event.blockNumber,
        tx: event.transactionHash,
      };

      return result;
    } else {
      // console.log("Unknown", event);

      return null;
    }
  } catch (e) {
    console.error(e);
  }
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
