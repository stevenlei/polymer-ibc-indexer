const { PrismaClient, User } = require("@prisma/client");

const prisma = new PrismaClient();

async function createContext(initialContext) {
  return {
    prisma,
  };
}

module.exports = {
  createContext,
};
