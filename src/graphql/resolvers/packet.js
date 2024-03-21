// this is a graphql resolver

/*
packets(
  fromChainId: String
  fromChannelId: String
  toChainId: String
  toChannelId: String
  limit: Int
  offset: Int
  order: Order
  sequence: Int
): PacketConnection
packet(id: String!): Packet

packetStates(packetId: String!): [PacketState]

enum Order {
  ASC
  DESC
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

type Address {
  address: String
}

type Chain {
  id: String
  name: String
  type: String
  channels: ChannelConnection
  blocks: BlockConnection
  packets: PacketConnection
}

type Block {
  id: String
  chain: Chain
  number: Int
  hash: String
  timestamp: Int
}

enum ChannelType {
  UNIVERSAL
  CUSTOM
}

enum ChannelStatus {
  INIT
  PENDING
  OPEN
  CLOSED
  UNINITIALIZED
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

enum PacketState {
  SendPacket
  RecvPacket
  WriteAckPacket
  Acknowledgement
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

type PacketState {
  id: String
  packet: Packet
  channel: Channel
  chain: Chain
  block: Block
  type: PacketState
  timestamp: Int
  latency: Int
  from: Address
  portAddress: String
  txHash: String
}
*/

function channelStatus(stage) {
  return ["INIT", "PENDING", "OPEN"][stage - 1];
}

module.exports = {
  Query: {
    packets: async (_parent, _args, { prisma }) => {
      // handle the query
      const {
        fromChainId,
        fromChannelId,
        toChainId,
        toChannelId,
        limit = 50,
        offset,
        order,
        sequence,
      } = _args;

      const where = {
        fromChainId: fromChainId ? { equals: fromChainId } : undefined,
        fromChannelId: fromChannelId ? { equals: fromChannelId } : undefined,
        toChainId: toChainId ? { equals: toChainId } : undefined,
        toChannelId: toChannelId ? { equals: toChannelId } : undefined,
        sequence: sequence ? { equals: sequence } : undefined,
      };

      const results = await prisma.packet.findMany({
        where,
        take: Math.min(limit, 100),
        skip: offset,
        include: {
          // fromChain: true,
          // fromChannel: true,
          // toChain: true,
          // toChannel: true,
          block: true,
          // states: true,
        },
        orderBy: [
          {
            timestamp: order === "ASC" ? "asc" : "desc",
          },
          {
            id: "asc",
          },
        ],
      });

      const count = await prisma.packet.count({ where });

      return {
        totalCount: count,
        offset,
        limit: Math.min(limit, 100),
        list: results.map((packet) => {
          return {
            ...packet,
            currentState: packet.currentState,
            timestamp: Number(packet.timestamp),
          };
        }),
      };
    },
  },
  Packet: {
    fromChain: async (parent, _args, { prisma }) => {
      return await prisma.chain.findUnique({
        where: {
          id: parent.fromChainId,
        },
      });
    },
    fromChannel: async (parent, _args, { prisma }) => {
      return await prisma.channel.findUnique({
        where: {
          id: parent.fromChannelId,
        },
        // include: {
        //   counterparty: true,
        // },
      });
    },
    toChain: async (parent, _args, { prisma }) => {
      return await prisma.chain.findUnique({
        where: {
          id: parent.toChainId,
        },
      });
    },
    toChannel: async (parent, _args, { prisma }) => {
      return await prisma.channel.findUnique({
        where: {
          id: parent.toChannelId,
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
    timeout: (parent) => {
      return Number(parent.timeoutTimestamp);
    },
    timestamp: (parent) => {
      return Number(parent.timestamp);
    },
    states: async (parent, _args, { prisma }) => {
      return await prisma.state.findMany({
        where: {
          packetId: parent.id,
        },
        orderBy: {
          timestamp: "asc",
        },
      });
    },
  },
  Mutation: {},
};