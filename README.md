# Polymer IBC Indexer + GraphQL API Server

This is an indexer for the [Polymer IBC](https://www.polymerlabs.org) - an Ethereum’s Interoperability Hub, connecting Ethereum Layer 2’s using the Inter-Blockchain Communication Protocol.

The goal of this project is to provide a GraphQL API server that indexes all the events emitted by the Polymer IBC dispatcher across all supported chains (Optimism Sepolia, Base Sepolia and Molten Magma at the moment), so that developers can easily query the data they need.

I built this indexer to support the development of the [Polymer IBC Inspector](https://ibcinspector.com).

## Features

- Indexes all the events emitted by the Polymer IBC dispatcher across all supported chains.
- Provides a GraphQL API server to query the indexed data.

## Environment Requirements

- Node.js v20 or higher
- PostgreSQL v13 or higher

## Installation

1. Clone this repository.
2. Run `npm install` to install the dependencies.
3. Copy the `.env.example` file to `.env` and fill in the required environment variables.
   - Edit `.env`, set `OP_RPC_URL`, `BASE_RPC_URL` and `MOLTEN_RPC_URL` respectively to the RPC URLs of the Optimism Sepolia, Base Sepolia and Molten Magma chains.
   - Edit `.env`, set `DATABASE_URL` to the URL of your PostgreSQL database.
4. Run `npx prisma migrate dev` to create the database schema.

## Usage

### Indexer

The indexer is responsible for listening to the events emitted by the Polymer IBC dispatcher and storing them in the database. There are 3 processes that need to be run separately:

- `npm run events` - Indexes the events emitted by the Polymer IBC dispatcher from the last block indexed, or from the genesis block if it's the first time running. Saves as raw data into the database.
- `npm run transactions` - Indexes the transactions corresponding to the events indexed. Saves as raw data into the database.
- `npm run process` - Process the raw data into a more structured format into the database.

It is recommended to run these 3 processes in order for the first time. After that, you can run them in watch mode, here are the commands to run them in watch mode with `pm2`:

- `pm2 start start:events` - Indexes the events emitted by the Polymer IBC dispatcher in watch mode.
- `pm2 start start:transactions` - Indexes the transactions corresponding to the events indexed in watch mode.
- `pm2 start start:process` - Process the raw data into a more structured format in watch mode.

### GraphQL API Server

The GraphQL API server provides a GraphQL API to query the indexed data. To start the server, run `npm run serve`.

## Data Inconsistencies

Sometimes the indexer may fail to process the raw data into a more structured format due to various reasons, such as bugs in the code or new chains being added to the Polymer IBC. In such cases, we may need to reprocess from the raw data.

Consider the only reference we have across different chains is the `timestamp` of the event/transaction, so we can reprocess the raw data from a specific timestamp:

`npm run process -- --correct=[timestamp]`

## Contributing

Contributions are welcome! Please feel free to submit a pull request.

## License

This project is licensed under the MIT License
