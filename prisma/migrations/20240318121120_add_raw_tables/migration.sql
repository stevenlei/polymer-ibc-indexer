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
    "timestamp" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL,
    "gasLimit" TEXT NOT NULL,
    "maxPriorityFeePerGas" TEXT NOT NULL,
    "maxFeePerGas" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawTransaction_pkey" PRIMARY KEY ("id")
);
