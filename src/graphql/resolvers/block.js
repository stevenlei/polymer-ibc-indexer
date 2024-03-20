// this is a graphql resolver

/*
blocks(chainId: String!, limit: Int, offset: Int): BlockConnection
block(id: String!): Block

type Block {
  id: String
  chain: Chain
  number: Int
  hash: String
  timestamp: Int
}
*/

module.exports = {
  Query: {
    blocks: async (_parent, _args, { prisma }) => {
      // handle the query
      const { chainId, limit = 50, offset } = _args;

      const where = {
        chainId,
      };

      const results = await prisma.block.findMany({
        where,
        take: Math.min(limit, 100),
        skip: offset,
      });

      const totalCount = await prisma.block.count({
        where,
      });

      return {
        totalCount,
        offset,
        limit,
        list: results.map((block) => {
          return {
            ...block,
            timestamp: Number(block.timestamp),
          };
        }),
      };
    },
    block: async (_parent, _args, { prisma }) => {
      // handle the query
      const { id } = _args;
      const results = await prisma.block.findUnique({
        where: {
          id,
        },
      });

      return {
        ...results,
        timestamp: Number(results.timestamp),
      };
    },
    // chains: async (_parent, _args, { prisma }) => {
    //   // handle the query
    //   const { name, type } = _args;
    //   const where = {
    //     name: name ? { equals: name } : undefined,
    //     type: type ? { equals: type } : undefined,
    //   };

    //   const results = await prisma.chain.findMany({
    //     where,
    //     include: {
    //       // channel: true,
    //     },
    //   });

    //   return results;
    // },
    // chain: async (_parent, _args, { prisma }) => {
    //   // handle the query
    //   const { id } = _args;
    //   const results = await prisma.chain.findUnique({
    //     where: {
    //       id,
    //     },
    //     include: {
    //       // channel: true,
    //     },
    //   });

    //   return results;
    // },
  },
  Mutation: {},
};
