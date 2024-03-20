module.exports = /* GraphQL */ `
  type Query {
    chains(name: String, type: String): [Chain]
    chain(id: String!): Chain

    blocks(chainId: String!, limit: Int, offset: Int): BlockConnection
    block(id: String!): Block

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

    packets(
      fromChainId: String
      fromChannelId: String
      toChainId: String
      toChannelId: String
      limit: Int
      offset: Int
      order: Order
    ): PacketConnection
    packet(id: String!): Packet

    packetStates(packetId: String!): [PacketState]
  }

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
    currentState: PacketType
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
`;
