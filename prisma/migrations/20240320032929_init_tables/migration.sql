-- CreateTable
CREATE TABLE "RawEvent" (
    "id" SERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "removed" BOOLEAN NOT NULL,
    "topics" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "transactionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawTransaction" (
    "id" SERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "hash" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT,
    "value" TEXT NOT NULL,
    "gasPrice" TEXT,
    "gasLimit" TEXT,
    "maxPriorityFeePerGas" TEXT,
    "maxFeePerGas" TEXT,
    "data" TEXT,
    "nonce" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "address" TEXT NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "Chain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Chain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "chainId" TEXT,
    "number" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT,
    "chainId" TEXT,
    "blockId" TEXT,
    "type" TEXT,
    "client" TEXT,
    "portAddress" TEXT,
    "counterpartyPortId" TEXT,
    "counterpartyPortAddress" TEXT,
    "connectionHops" TEXT,
    "txHash" TEXT,
    "fromAddress" TEXT,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "timestamp" BIGINT NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Packet" (
    "id" TEXT NOT NULL,
    "fromChainId" TEXT NOT NULL,
    "fromChannelId" TEXT NOT NULL,
    "toChainId" TEXT,
    "toChannelId" TEXT,
    "blockId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "timeoutTimestamp" BIGINT NOT NULL,
    "timestamp" BIGINT NOT NULL,

    CONSTRAINT "Packet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "packetId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "latency" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "portAddress" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerStatus" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactionHash" ON "RawEvent"("transactionHash");

-- CreateIndex
CREATE INDEX "hash" ON "RawTransaction"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_counterpartyId_key" ON "Channel"("counterpartyId");

-- CreateIndex
CREATE INDEX "chainId" ON "Channel"("chainId");

-- CreateIndex
CREATE INDEX "type" ON "Channel"("type");

-- CreateIndex
CREATE INDEX "client" ON "Channel"("client");

-- CreateIndex
CREATE INDEX "portAddress" ON "Channel"("portAddress");

-- CreateIndex
CREATE INDEX "counterpartyPortAddress" ON "Channel"("counterpartyPortAddress");

-- CreateIndex
CREATE INDEX "fromAddress" ON "Channel"("fromAddress");

-- CreateIndex
CREATE INDEX "fromChannelId" ON "Packet"("fromChannelId");

-- CreateIndex
CREATE INDEX "toChannelId" ON "Packet"("toChannelId");

-- CreateIndex
CREATE INDEX "packetId" ON "State"("packetId");

-- CreateIndex
CREATE INDEX "channelId" ON "State"("channelId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_fromAddress_fkey" FOREIGN KEY ("fromAddress") REFERENCES "Address"("address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_fromChainId_fkey" FOREIGN KEY ("fromChainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_toChainId_fkey" FOREIGN KEY ("toChainId") REFERENCES "Chain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_fromChannelId_fkey" FOREIGN KEY ("fromChannelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_toChannelId_fkey" FOREIGN KEY ("toChannelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_fromAddress_fkey" FOREIGN KEY ("fromAddress") REFERENCES "Address"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_packetId_fkey" FOREIGN KEY ("packetId") REFERENCES "Packet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "State" ADD CONSTRAINT "State_fromAddress_fkey" FOREIGN KEY ("fromAddress") REFERENCES "Address"("address") ON DELETE RESTRICT ON UPDATE CASCADE;
