const { createSchema } = require("graphql-yoga");
const typeDefs = require("./typeDefs");

const { Query: chainQuery, Chain } = require("./resolvers/chain");
const { Query: channelQuery, Channel } = require("./resolvers/channel");
const { Query: blockQuery } = require("./resolvers/block");
const { Query: packetQuery, Packet } = require("./resolvers/packet");
const { Query: packetStateQuery, PacketState } = require("./resolvers/state");

module.exports = createSchema({
  typeDefs: typeDefs,
  resolvers: {
    Query: {
      ...chainQuery,
      ...channelQuery,
      ...blockQuery,
      ...packetQuery,
      ...packetStateQuery,
    },
    Chain,
    Channel,
    Packet,
    PacketState,
  },
});
