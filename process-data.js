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

async function main() {
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

  // let { lastProcessedEventId, lastEventId } = await getEventIndexingStatus();

  // if (lastProcessedEventId === lastEventId) {
  //   console.log("No new events");
  //   return;
  // }

  await prisma.channel.deleteMany({});

  // 4. get the events
  while (true) {
    //
    const perBatch = 5000;

    const transactions = await prisma.rawTransaction.findMany({
      // where: {
      //   id: {  },
      // },
      orderBy: [{ timestamp: "asc" }, { index: "asc" }],
      take: perBatch,
    });

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];

      const event = await prisma.rawEvent.findFirst({
        where: { transactionHash: transaction.hash },
      });

      if (!event) {
        throw new Error("Event not found", transaction.hash);
      }

      const decodedEvent = await decodeEvent(event);

      // upsert block
      const block = await prisma.block.upsert({
        where: { id: `${event.chain}-${event.blockNumber}` },
        create: {
          id: `${event.chain}-${event.blockNumber}`,
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
          const [
            counterpartyProtocol,
            counterpartyClient,
            _counterpartyPortAddress,
          ] = decodedEvent.counterpartyPortId.split(".");

          const counterpartyPortAddress = `0x${_counterpartyPortAddress}`;

          // if counterpartyChannelId === '', this is the first step of initiating a channel
          if (decodedEvent.counterpartyChannelId === "") {
            // create the originating channel
            await prisma.channel.create({
              data: {
                id: `init-${block.id}-${decodedEvent.portAddress}`,
                counterpartyId: null,
                chainId: event.chain,
                blockId: block.id,
                type: null,
                client: null,
                portAddress: decodedEvent.portAddress,
                counterpartyPortId: decodedEvent.counterpartyPortId,
                counterpartyPortAddress: counterpartyPortAddress,
                connectionHops: JSON.stringify(decodedEvent.connectionHops),
                txHash: transaction.hash,
                fromAddress: address.address,
                stage: 1,
                timestamp: transaction.timestamp,
              },
            });

            // create the counterparty channel
            await prisma.channel.create({
              data: {
                id: `handshake-${block.id}-${counterpartyPortAddress}`,
                counterpartyId: null,
                chainId: counterpartyChainId(event.chain),
                blockId: null,
                type: null,
                client: counterpartyClient,
                portAddress: counterpartyPortAddress,
                counterpartyPortId: null,
                counterpartyPortAddress: decodedEvent.portAddress,
                connectionHops: null,
                txHash: null,
                fromAddress: null,
                stage: 1,
                timestamp: transaction.timestamp,
              },
            });
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
            const localChannelId = ethers.decodeBytes32String(
              functionDataDecoded[1][1]
            );

            const firstRecordToUpdate = await prisma.channel.findFirst({
              where: {
                portAddress: counterpartyPortAddress,
                stage: 1,
                chainId: counterpartyChainId(event.chain),
              },
              orderBy: { timestamp: "desc" }, // nearest
            });

            if (firstRecordToUpdate) {
              // update the originating channel
              await prisma.channel.update({
                where: { id: firstRecordToUpdate.id },
                data: {
                  id: decodedEvent.counterpartyChannelId,
                  type: channelType(decodedEvent.counterpartyChannelId),
                  client: counterpartyClient,
                  stage: 2,
                },
              });
            }

            const firstCounterpartyRecordToUpdate =
              await prisma.channel.findFirst({
                where: {
                  portAddress: decodedEvent.portAddress,
                  stage: 1,
                  chainId: event.chain,
                },
                orderBy: { timestamp: "desc" },
              });

            if (firstCounterpartyRecordToUpdate) {
              // update the counterparty channel
              await prisma.channel.update({
                where: { id: firstCounterpartyRecordToUpdate.id },
                data: {
                  id: localChannelId,
                  type: channelType(localChannelId),
                  blockId: block.id,
                  counterpartyId: decodedEvent.counterpartyChannelId,
                  counterpartyPortId: decodedEvent.counterpartyPortId,
                  connectionHops: JSON.stringify(decodedEvent.connectionHops),
                  txHash: transaction.hash,
                  fromAddress: address.address,
                  stage: 2,
                },
              });

              // link up them
              await prisma.channel.update({
                where: { id: decodedEvent.counterpartyChannelId },
                data: {
                  counterpartyId: localChannelId,
                },
              });
            }

            console.log(
              `Channel ${decodedEvent.counterpartyChannelId} <> ${localChannelId} created`
            );
          }
        } else if (decodedEvent.type === "ConnectIbcChannel") {
          // this is the final step of the handshake
          // we just need to update the state to 3 indicating the channel is open

          const firstRecordToUpdate = await prisma.channel.findFirst({
            where: {
              portAddress: decodedEvent.portAddress,
              stage: 2,
              chainId: event.chain,
            },
            orderBy: { timestamp: "desc" },
          });

          if (firstRecordToUpdate) {
            await prisma.channel.update({
              where: { id: firstRecordToUpdate.id },
              data: {
                stage: 3,
              },
            });

            console.log(`Channel ${firstRecordToUpdate.id} is now open`);
          }
        }
      } // if
    } // for

    // get again the last processed index status
    ({ lastProcessedEventId, lastEventId } = await getEventIndexingStatus());
    break;
    console.log(`Wait for 1 second...`);
    await wait(1000);
  } // while
}

async function getEventIndexingStatus() {
  // 1. get the last processed index status
  const lastProcessedEventIdQuery = await prisma.indexerStatus.findUnique({
    where: { id: "last-processed-event-id" },
  });

  let lastProcessedEventId = lastProcessedEventIdQuery
    ? lastProcessedEventIdQuery.value
    : 0;

  // 2. get the last event id
  const lastEventQuery = await prisma.rawEvent.findFirst({
    orderBy: { id: "desc" },
  });

  let lastEventId = lastEventQuery ? lastEventQuery.id : 0;

  return { lastProcessedEventId, lastEventId };
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
    return "base-sepolia";
  } else {
    return "optimism-sepolia";
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
