// this is a graphql resolver

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
  },
  Mutation: {},
};
