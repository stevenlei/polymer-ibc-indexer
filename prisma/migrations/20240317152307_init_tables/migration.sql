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
    "timestamp" INTEGER NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "withId" TEXT,
    "chainId" TEXT,
    "blockId" TEXT,
    "type" TEXT,
    "txHash" TEXT,
    "fromAddress" TEXT,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Packet" (
    "id" TEXT NOT NULL,
    "fromChainId" TEXT NOT NULL,
    "fromChannelId" TEXT NOT NULL,
    "toChainId" TEXT NOT NULL,
    "toChannelId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "timeoutTimestamp" INTEGER NOT NULL,
    "timestamp" INTEGER NOT NULL,

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
    "timestamp" INTEGER NOT NULL,
    "latency" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "portAddress" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_withId_key" ON "Channel"("withId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_fromAddress_fkey" FOREIGN KEY ("fromAddress") REFERENCES "Address"("address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "Chain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_withId_fkey" FOREIGN KEY ("withId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_fromChainId_fkey" FOREIGN KEY ("fromChainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_toChainId_fkey" FOREIGN KEY ("toChainId") REFERENCES "Chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_fromChannelId_fkey" FOREIGN KEY ("fromChannelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Packet" ADD CONSTRAINT "Packet_toChannelId_fkey" FOREIGN KEY ("toChannelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
