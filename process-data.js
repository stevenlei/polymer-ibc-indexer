require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { ethers } = require("ethers");
const dispatcherAbi = require("./abi/Dispatcher.json");
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

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
  // if correct mode, we need to re-process the data from a certain timestamp
  if (correct) {
    // so we need to delete all the data from that timestamp
    // and re-process the data from that timestamp

    // 1. get the correct `RawTransaction.id` - 1 from the timestamp
    const correctTx = await prisma.rawTransaction.findFirst({
      where: {
        timestamp: {
          lt: Number(correctTimestamp),
        },
      },
      orderBy: [{ timestamp: "desc" }, { index: "desc" }],
    });

    if (!correctTx) {
      console.log("No data to correct");
      process.exit(0);
    }

    // 2. delete all the data from that timestamp, affected tables: Packet, State, Channel, Block
    await prisma.state.deleteMany({
      where: {
        timestamp: {
          gte: Number(correctTimestamp),
        },
      },
    });

    await prisma.packet.deleteMany({
      where: {
        timestamp: {
          gte: Number(correctTimestamp),
        },
      },
    });

    await prisma.channel.deleteMany({
      where: {
        timestamp: {
          gte: Number(correctTimestamp),
        },
      },
    });

    await prisma.block.deleteMany({
      where: {
        timestamp: {
          gte: Number(correctTimestamp),
        },
      },
    });

    // 3. update the last processed index status
    await prisma.indexerStatus.upsert({
      where: { id: "last-processed-txid" },
      create: {
        id: "last-processed-txid",
        value: `${correctTx.id}`,
      },
      update: {
        value: `${correctTx.id}`,
      },
    });
  }

  //
  while (true) {
    await processData();
    if (!watch) {
      break;
    }

    // 10 seconds between indexing runs
    await new Promise((resolve) => setTimeout(resolve, 10 * 1000));
  }
}

async function processData() {
  // 1. init chains
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

  let { lastProcessedTxid, lastTxid } = await getLastPosition();

  if (lastProcessedTxid === lastTxid) {
    console.log("No new txs to process");
    return;
  }

  console.log("Processing transactions", lastProcessedTxid, lastTxid);

  // 4. get the events
  //
  const transactions = await prisma.rawTransaction.findMany({
    cursor: lastProcessedTxid ? { id: lastProcessedTxid } : undefined,
    skip: lastProcessedTxid ? 1 : 0,
    // take: 880,
    orderBy: [{ timestamp: "asc" }, { index: "asc" }],
    // take: perBatch,
  });

  console.log("Transactions", transactions.length);

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];

    const events = await prisma.rawEvent.findMany({
      where: { transactionHash: transaction.hash },
      orderBy: { index: "asc" },
    });

    // 1 transaction can have multiple events
    for (let event of events) {
      if (!event) {
        throw new Error("Event not found", transaction.hash);
      }

      const decodedEvent = await decodeEvent(event);

      // upsert block
      const block = await prisma.block.upsert({
        where: { id: `${event.chain}.${event.blockNumber}` },
        create: {
          id: `${event.chain}.${event.blockNumber}`,
          chainId: event.chain,
          number: event.blockNumber,
          hash: event.blockHash,
          timestamp: transactions[i].timestamp,
        },
        update: {},
      });

      // upsert address
      const address = await prisma.address.upsert({
        where: { address: transaction.from },
        create: {
          address: transaction.from,
        },
        update: {},
      });

      if (decodedEvent) {
        // console.log(event.chain, decodedEvent);

        if (decodedEvent.type === "OpenIbcChannel") {
          // if counterpartyChannelId === '', this is the first step of initiating a channel
          if (decodedEvent.counterpartyChannelId === "") {
            //
          } else if (decodedEvent.counterpartyChannelId !== "") {
            // this is the handshake event (2nd step)

            const iface = new ethers.Interface(dispatcherAbi);
            const functionDataDecoded = iface.decodeFunctionData(
              "openIbcChannel",
              transaction.data
            );

            // so we have both the counterparty (originating) and local (destination) channel ids here
            // counterparty channel id is from the event
            // local channel id is from the function data
            const destination = {};
            destination.portId = functionDataDecoded[1][0];
            destination.port = extractPortId(destination.portId);
            destination.channelId = ethers.decodeBytes32String(
              functionDataDecoded[1][1]
            );
            destination.version = functionDataDecoded[1][2];

            // console.log("destination", destination);

            const origin = {};
            origin.portId = functionDataDecoded[5][0];
            origin.port = extractPortId(origin.portId);
            origin.channelId = ethers.decodeBytes32String(
              functionDataDecoded[5][1]
            );
            origin.version = functionDataDecoded[5][2];

            // console.log("origin", origin);

            // origin
            await prisma.channel.upsert({
              where: { id: origin.channelId },
              create: {
                id: origin.channelId,
                chainId: chainIdFromClient(origin.port.client),
                // blockId: block.id,
                type: channelType(origin.channelId),
                client: origin.port.client,
                portAddress: origin.port.portAddress,
                counterpartyPortId: destination.portId,
                counterpartyPortAddress: destination.port.portAddress,
                connectionHops: null,
                // txHash: transaction.hash,
                // fromAddress: address.address,
                stage: 2,
                timestamp: transaction.timestamp,
              },
              update: {
                chainId: chainIdFromClient(origin.port.client),
                type: channelType(origin.channelId),
                client: origin.port.client,
                portAddress: origin.port.portAddress,
                counterpartyPortId: destination.portId,
                counterpartyPortAddress: destination.port.portAddress,
                stage: 2,
                timestamp: transaction.timestamp,
              },
            });

            // destination
            await prisma.channel.upsert({
              where: { id: destination.channelId },
              create: {
                id: destination.channelId,
                chainId: event.chain,
                // blockId: block.id,
                type: channelType(destination.channelId),
                client: destination.port.client,
                portAddress: destination.port.portAddress,
                counterpartyPortId: origin.portId,
                counterpartyPortAddress: origin.port.portAddress,
                connectionHops: null,
                // txHash: transaction.hash,
                // fromAddress: address.address,
                stage: 2,
                timestamp: transaction.timestamp,
              },
              update: {
                chainId: event.chain,
                type: channelType(destination.channelId),
                client: destination.port.client,
                portAddress: destination.port.portAddress,
                counterpartyPortId: origin.portId,
                counterpartyPortAddress: origin.port.portAddress,
                stage: 2,
                timestamp: transaction.timestamp,
              },
            });

            // link up them
            await prisma.channel.update({
              where: { id: origin.channelId },
              data: {
                counterpartyId: destination.channelId,
              },
            });

            await prisma.channel.update({
              where: { id: destination.channelId },
              data: {
                counterpartyId: origin.channelId,
              },
            });

            console.log(
              `Channel ${origin.channelId} <> ${destination.channelId} created`
            );
          }
        } else if (decodedEvent.type === "ConnectIbcChannel") {
          // this is the final step of the handshake
          // we just need to update the state to 3 indicating the channel is open

          const iface = new ethers.Interface(dispatcherAbi);
          const functionDataDecoded = iface.decodeFunctionData(
            "connectIbcChannel",
            transaction.data
          );

          const connectionHops = JSON.stringify(functionDataDecoded[2]);

          await prisma.channel.update({
            where: { id: decodedEvent.channelId },
            data: {
              stage: 3,
              blockId: block.id,
              txHash: transaction.hash,
              fromAddress: address.address,
              connectionHops: connectionHops,
            },
          });

          console.log(`Channel ${decodedEvent.channelId} is now open`);
        } else if (decodedEvent.type === "SendPacket") {
          // this is the packet sending event
          // create the packet record

          // console.log("SendPacket", decodedEvent);

          const channel = await prisma.channel.findFirst({
            where: {
              id: decodedEvent.channelId,
            },
            include: {
              counterparty: true,
            },
          });

          const packet = await prisma.packet.upsert({
            where: {
              id: `${decodedEvent.channelId}.${decodedEvent.sequence}`,
            },
            create: {
              id: `${decodedEvent.channelId}.${decodedEvent.sequence}`,
              fromChainId: channel.chainId,
              fromChannelId: channel.id,
              toChainId: channel.counterparty.chainId,
              toChannelId: channel.counterparty.id,
              blockId: block.id,
              txHash: decodedEvent.tx,
              sequence: decodedEvent.sequence,
              fromAddress: address.address,
              currentState: "SendPacket",
              timeoutTimestamp: decodedEvent.timeout,
              timestamp: transaction.timestamp,
            },
            update: {},
          });

          // create state
          await prisma.state.upsert({
            where: {
              id: `${decodedEvent.channelId}.${decodedEvent.sequence}.SendPacket`,
            },
            create: {
              id: `${decodedEvent.channelId}.${decodedEvent.sequence}.SendPacket`,
              packetId: packet.id,
              channelId: channel.id,
              chainId: channel.chainId,
              blockId: block.id,
              type: "SendPacket",
              timestamp: transaction.timestamp,
              latency: 0,
              fromAddress: address.address,
              portAddress: decodedEvent.portAddress,
              data: transaction.data,
              txHash: decodedEvent.tx,
              nonce: transaction.nonce,
              index: transaction.index,
            },
            update: {},
          });

          console.log(
            `SendPacket ${channel.id} > ${channel.counterparty.id} #${decodedEvent.sequence}`
          );
        } else if (decodedEvent.type === "RecvPacket") {
          // console.log("RecvPacket", decodedEvent);

          try {
            const channel = await prisma.channel.findFirst({
              where: {
                id: decodedEvent.channelId,
              },
              include: {
                counterparty: true,
              },
            });

            // this is the packet receiving event
            // update the packet record

            const packetId = `${channel.counterparty.id}.${decodedEvent.sequence}`;

            const packet = await prisma.packet.update({
              where: { id: packetId },
              data: {
                currentState: "RecvPacket",
              },
            });

            // get the SendPacket state
            const sendPacketState = await prisma.state.findFirst({
              where: {
                packetId: packet.id,
                type: "SendPacket",
              },
            });

            // create state
            await prisma.state.upsert({
              where: {
                id: `${decodedEvent.channelId}.${decodedEvent.sequence}.RecvPacket`,
              },
              create: {
                id: `${decodedEvent.channelId}.${decodedEvent.sequence}.RecvPacket`,
                packetId: packet.id,
                channelId: channel.id,
                chainId: channel.chainId,
                blockId: block.id,
                type: "RecvPacket",
                timestamp: transaction.timestamp,
                latency: Number(
                  transaction.timestamp - sendPacketState.timestamp
                ),
                fromAddress: address.address,
                portAddress: decodedEvent.portAddress,
                data: transaction.data,
                txHash: decodedEvent.tx,
                nonce: transaction.nonce,
                index: transaction.index,
              },
              update: {},
            });

            console.log(
              `RecvPacket ${channel.id} > ${channel.counterparty.id} #${decodedEvent.sequence}`
            );
          } catch (e) {
            console.error(e);
          }
        } else if (decodedEvent.type === "WriteAckPacket") {
          // console.log("WriteAckPacket", decodedEvent);

          try {
            const channel = await prisma.channel.findFirst({
              where: {
                id: decodedEvent.channelId,
              },
              include: {
                counterparty: true,
              },
            });

            // this is the packet acknowledgement event
            // update the packet record

            const packetId = `${channel.counterparty.id}.${decodedEvent.sequence}`;

            const packet = await prisma.packet.update({
              where: { id: packetId },
              data: {
                currentState: "WriteAckPacket",
              },
            });

            // create state
            await prisma.state.upsert({
              where: {
                id: `${decodedEvent.channelId}.${decodedEvent.sequence}.WriteAckPacket`,
              },
              create: {
                id: `${decodedEvent.channelId}.${decodedEvent.sequence}.WriteAckPacket`,
                packetId: packet.id,
                channelId: channel.id,
                chainId: channel.chainId,
                blockId: block.id,
                type: "WriteAckPacket",
                timestamp: transaction.timestamp,
                latency: 0, // It happens together with the RecvPacket anyway
                fromAddress: address.address,
                portAddress: decodedEvent.portAddress,
                data: transaction.data,
                txHash: decodedEvent.tx,
                nonce: transaction.nonce,
                index: transaction.index,
              },
              update: {},
            });

            console.log(
              `WriteAckPacket ${channel.id} > ${channel.counterparty.id} #${decodedEvent.sequence}`
            );
          } catch (e) {
            console.error(e);
          }
        } else if (decodedEvent.type === "Acknowledgement") {
          // console.log("Acknowledgement", decodedEvent);

          try {
            const channel = await prisma.channel.findFirst({
              where: {
                id: decodedEvent.channelId,
              },
              include: {
                counterparty: true,
              },
            });

            // this is the packet acknowledgement event
            // update the packet record

            const packetId = `${channel.id}.${decodedEvent.sequence}`;

            const packet = await prisma.packet.update({
              where: { id: packetId },
              data: {
                currentState: "Acknowledgement",
              },
            });

            const lastState = await prisma.state.findFirst({
              where: {
                packetId: packet.id,
              },
              orderBy: { timestamp: "desc" },
            });

            // create state
            await prisma.state.upsert({
              where: {
                id: `${decodedEvent.channelId}.${decodedEvent.sequence}.Acknowledgement`,
              },
              create: {
                id: `${decodedEvent.channelId}.${decodedEvent.sequence}.Acknowledgement`,
                packetId: packet.id,
                channelId: channel.id,
                chainId: channel.chainId,
                blockId: block.id,
                type: "Acknowledgement",
                timestamp: transaction.timestamp,
                latency:
                  Number(
                    lastState && transaction.timestamp - lastState.timestamp
                  ) || 0,
                fromAddress: address.address,
                portAddress: decodedEvent.portAddress,
                data: transaction.data,
                txHash: decodedEvent.tx,
                nonce: transaction.nonce,
                index: transaction.index,
              },
              update: {},
            });

            console.log(
              `Acknowledgement ${channel.id} > ${channel.counterparty.id} #${decodedEvent.sequence}`
            );
          } catch (e) {
            console.error(e);
          }
        }
      } // if
    } // for events

    // update the last processed index status
    await prisma.indexerStatus.upsert({
      where: { id: "last-processed-txid" },
      create: {
        id: "last-processed-txid",
        value: `${transaction.id}`,
      },
      update: {
        value: `${transaction.id}`,
      },
    });
  } // for
}

function extractPortId(portId) {
  const [protocol, client, _portAddress] = portId.split(".");

  const portAddress = `0x${_portAddress}`;
  return { protocol, client, portAddress };
}

async function getLastPosition() {
  // 1. get the last processed index status
  const lastProcessedTxidQuery = await prisma.indexerStatus.findUnique({
    where: { id: "last-processed-txid" },
  });

  let lastProcessedTxid = lastProcessedTxidQuery
    ? Number(lastProcessedTxidQuery.value)
    : 0;

  // 2. get the last txid
  const lastTxQuery = await prisma.rawTransaction.findFirst({
    orderBy: { id: "desc" },
  });

  let lastTxid = lastTxQuery ? lastTxQuery.id : 0;

  return { lastProcessedTxid, lastTxid };
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

function chainIdFromClient(client) {
  if (client.includes("base")) {
    return "base-sepolia";
  } else if (client.includes("optimism")) {
    return "optimism-sepolia";
  } else if (client.includes("molten")) {
    return "molten-magma";
  } else {
    throw new Error("Unknown chain id from client");
  }
}

async function decodeEvent(event) {
  const topics = JSON.parse(event.topics);
  const topic = topics[0];

  try {
    if (topic === signatureOpenIbcChannel) {
      // console.log("OpenIbcChannel", event);

      const [portAddress] = abiCoder.decode(["address"], topics[1]);

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

      const [portAddress] = abiCoder.decode(["address"], topics[1]);
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
      const [portAddress] = abiCoder.decode(["address"], topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], topics[2]);
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
      const [portAddress] = abiCoder.decode(["address"], topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], topics[2]);
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

      const [portAddress] = abiCoder.decode(["address"], topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], topics[2]);
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

      const [portAddress] = abiCoder.decode(["address"], topics[1]);
      const [channelId] = abiCoder.decode(["bytes32"], topics[2]);
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
