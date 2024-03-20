// this is a graphql resolver

/*
channels(
  chainId: String
  type: ChannelType
  client: String
  portAddress: String
  status: ChannelStatus
  limit: Int
  offset: Int
): ChannelConnection
channel(id: String!): Channel

type Chain {
  id: String
  name: String
  type: String
  channels: ChannelConnection
  blocks: BlockConnection
  packets: PacketConnection
}

type PacketConnection {
  totalCount: Int
  offset: Int
  limit: Int
  list: [Packet]
}

type ChannelConnection {
  totalCount: Int
  offset: Int
  limit: Int
  list: [Channel]
}

type BlockConnection {
  totalCount: Int
  offset: Int
  limit: Int
  list: [Block]
}

type Block {
  id: String
  chain: Chain
  number: Int
  hash: String
  timestamp: Int
}
type Channel {
  id: String
  counterparty: Channel
  chain: Chain
  block: Block
  type: ChannelType
  client: String
  portAddress: String
  portId: String
  connectionHops: [String]
  txHash: String
  from: Address
  status: ChannelStatus
  timestamp: Int
}
type Packet {
  id: String
  fromChain: Chain
  fromChannel: Channel
  toChain: Chain
  toChannel: Channel
  block: Block
  txHash: String
  sequence: Int
  from: Address
  currentState: PacketState
  timeout: Int
  timestamp: Int
  states: [PacketState]
}

enum ChannelStatus {
  INIT
  PENDING
  OPEN
  CLOSED
  UNINITIALIZED
}
*/

function channelStatus(stage) {
  return ["INIT", "PENDING", "OPEN"][stage - 1];
}

module.exports = {
  Query: {
    channels: async (_parent, _args, { prisma }) => {
      // handle the query
      const {
        chainId,
        type,
        client,
        portAddress,
        status,
        limit = 50,
        offset,
      } = _args;
      const where = {
        chainId: chainId ? { equals: chainId } : undefined,
        type: type ? { equals: type } : undefined,
        client: client ? { equals: client } : undefined,
        portAddress: portAddress ? { equals: portAddress } : undefined,
        status: status ? { equals: status } : undefined,
      };

      const results = await prisma.channel.findMany({
        where,
        include: {
          // chain: true,
          // block: true,
          // counterparty: true,
          // from: true,
        },
        take: Math.min(limit, 100),
        skip: offset,
        orderBy: [
          {
            timestamp: "asc",
          },
          {
            id: "asc",
          },
        ],
      });

      const count = await prisma.channel.count({ where });

      return {
        totalCount: count,
        offset,
        limit: Math.min(limit, 100),
        list: results,
      };
    },
    channel: async (_parent, _args, { prisma }) => {
      const { id } = _args;
      const result = await prisma.channel.findUnique({
        where: {
          id,
        },
        include: {
          // chain: true,
          // block: true,
          // counterparty: true,
          // from: true,
        },
      });

      return result;
    },
  },
  Channel: {
    counterparty: async (parent, _args, { prisma }) => {
      const { counterpartyId } = parent;
      if (!counterpartyId) {
        return null;
      }

      const result = await prisma.channel.findUnique({
        where: {
          id: counterpartyId,
        },
        include: {
          counterparty: true,
        },
      });

      return result;
    },
    type: (parent) => {
      return parent.type.toUpperCase();
    },
    status: (parent) => {
      return channelStatus(parent.stage);
    },
    timestamp: (parent) => {
      return Number(parent.timestamp);
    },
    connectionHops: (parent) => {
      return parent.connectionHops ? JSON.parse(parent.connectionHops) : [];
    },
    portId: async (parent, _args, { prisma }) => {
      let counterparty = parent.counterparty;

      if (!counterparty) {
        counterparty = await prisma.channel.findUnique({
          where: {
            id: parent.counterpartyId,
          },
        });
      }

      return counterparty ? counterparty.counterpartyPortId : null;
    },
    chain: async (parent, _args, { prisma }) => {
      return await prisma.chain.findUnique({
        where: {
          id: parent.chainId,
        },
      });
    },
    block: async (parent, _args, { prisma }) => {
      return await prisma.block.findUnique({
        where: {
          id: parent.blockId,
        },
      });
    },
    from: async (parent, _args, { prisma }) => {
      return await prisma.address.findUnique({
        where: {
          address: parent.fromAddress,
        },
      });
    },
  },
  Mutation: {},
};
