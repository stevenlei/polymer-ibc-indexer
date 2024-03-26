// this is a graphql resolver

const { Prisma } = require("@prisma/client");

/*
packetStates(packetId: String!): [PacketState]

enum Order {
  ASC
  DESC
}

enum PacketType {
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
  type: PacketType
  timestamp: Int
  latency: Int
  from: Address
  portAddress: String
  txHash: String
  latencyStats: PacketStateLatency
}

type PacketStateLatency {
  median: Int
  p90: Int
  p95: Int
  p99: Int
}
*/

function channelStatus(stage) {
  return ["INIT", "PENDING", "OPEN"][stage - 1];
}

module.exports = {
  Query: {
    packetStates: async (_parent, _args, { prisma }) => {
      const { packetId } = _args;
      const results = await prisma.state.findMany({
        where: {
          packetId,
        },
        orderBy: {
          timestamp: "asc",
        },
      });

      return results.map((state) => {
        return {
          ...state,
          timestamp: Number(state.timestamp),
        };
      });
    },
  },
  PacketState: {
    type: (parent) => {
      return parent.type;
    },
    packet: async (_parent, _args, { prisma }) => {
      const { packetId } = _parent;
      const results = await prisma.packet.findUnique({
        where: {
          id: packetId,
        },
      });

      return results;
    },
    channel: async (_parent, _args, { prisma }) => {
      const { channelId } = _parent;
      const results = await prisma.channel.findUnique({
        where: {
          id: channelId,
        },
      });

      return results;
    },
    chain: async (_parent, _args, { prisma }) => {
      const { chainId } = _parent;
      const results = await prisma.chain.findUnique({
        where: {
          id: chainId,
        },
      });

      return results;
    },
    block: async (_parent, _args, { prisma }) => {
      const { blockId } = _parent;
      const results = await prisma.block.findUnique({
        where: {
          id: blockId,
        },
      });

      return results;
    },
    from: async (_parent, _args, { prisma }) => {
      const { fromAddress } = _parent;
      const results = await prisma.address.findUnique({
        where: {
          address: fromAddress,
        },
      });

      return results;
    },
    timestamp: (parent) => {
      return Number(parent.timestamp);
    },
    latency: (parent) => {
      return Number(parent.latency);
    },
    latencyStats: async (parent, _args, { prisma }) => {
      // Use raw SQL query to calculate latency stats

      /*
        Example:
        SELECT
          PERCENTILE_DISC(0.5) within group (order by "State"."latency") as median,
          PERCENTILE_DISC(0.9) within group (order by "State"."latency") as p90,
          PERCENTILE_DISC(0.95) within group (order by "State"."latency") as p95,
          PERCENTILE_DISC(0.99) within group (order by "State"."latency") as p99
        FROM "State" WHERE "State"."type" = 'RecvPacket' AND "State"."channelId" = 'channel-10';
  
        SELECT
          PERCENTILE_DISC(0.5) within group (order by "State"."latency") as median,
          PERCENTILE_DISC(0.9) within group (order by "State"."latency") as p90,
          PERCENTILE_DISC(0.95) within group (order by "State"."latency") as p95,
          PERCENTILE_DISC(0.99) within group (order by "State"."latency") as p99
        FROM "State" WHERE "State"."type" = 'Acknowledgement' AND "State"."channelId" = 'channel-10';
        */

      if (parent.type === "SendPacket" || parent.type === "WriteAckPacket") {
        return {
          median: 0,
          p90: 0,
          p95: 0,
          p99: 0,
        };
      }

      const stats = await prisma.$queryRaw(
        Prisma.sql`
            SELECT
              PERCENTILE_DISC(0.5) within group (order by "State"."latency") as median,
              PERCENTILE_DISC(0.9) within group (order by "State"."latency") as p90,
              PERCENTILE_DISC(0.95) within group (order by "State"."latency") as p95,
              PERCENTILE_DISC(0.99) within group (order by "State"."latency") as p99
            FROM "State" WHERE "State"."type" = ${parent.type} AND "State"."channelId" = ${parent.channelId}
          `
      );

      return {
        median: Number(stats[0].median),
        p90: Number(stats[0].p90),
        p95: Number(stats[0].p95),
        p99: Number(stats[0].p99),
      };
    },
  },
  Mutation: {},
};
