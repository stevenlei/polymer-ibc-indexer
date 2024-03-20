const { createServer } = require("node:http");
const { createYoga } = require("graphql-yoga");
const { createContext } = require("./context");
const schema = require("./schema");

const yoga = createYoga({
  landingPage: false,
  schema: schema,
  context: createContext,
});

const server = createServer(yoga);

server.listen(4000, () => {
  console.info("Server is running on http://localhost:4000/graphql");
});
