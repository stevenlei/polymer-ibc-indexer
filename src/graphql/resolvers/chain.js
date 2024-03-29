// this is a graphql resolver

/*
chains(name: String, type: String): [Chain]
chain(id: String!): Chain

type Chain {
  id: String
  name: String
  type: String
  availableClients: [String]
  universalChannels: [Channel]
  channelsCount: Int
  packetsCount: Int
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
*/

module.exports = {
  Query: {
    chains: async (_parent, _args, { prisma }) => {
      // handle the query
      const { name, type } = _args;
      const where = {
        name: name ? { equals: name } : undefined,
        type: type ? { equals: type } : undefined,
      };

      const results = await prisma.chain.findMany({
        where,
        include: {
          // channel: true,
        },
      });

      return results;
    },
    chain: async (_parent, _args, { prisma }) => {
      // handle the query
      const { id } = _args;
      const results = await prisma.chain.findUnique({
        where: {
          id,
        },
      });

      return results;
    },
  },
  Chain: {
    availableClients: async (parent, _args, { prisma }) => {
      const results = await prisma.channel.findMany({
        select: {
          client: true,
        },
        where: {
          chainId: parent.id,
        },
        distinct: ["client"],
      });

      return results.map((r) => r.client);
    },
    universalChannels: async (parent, _args, { prisma }) => {
      const results = await prisma.channel.findMany({
        where: {
          chainId: parent.id,
          type: "universal",
        },
      });

      return results;
    },
    channelsCount: async (parent, _args, { prisma }) => {
      const results = await prisma.channel.count({
        where: {
          chainId: parent.id,
        },
      });

      return results;
    },
    packetsCount: async (parent, _args, { prisma }) => {
      const results = await prisma.packet.count({
        where: {
          fromChainId: parent.id,
        },
      });

      return results;
    },
  },
  Mutation: {},
};
