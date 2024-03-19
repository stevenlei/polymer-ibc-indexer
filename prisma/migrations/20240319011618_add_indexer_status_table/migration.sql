-- AlterTable
ALTER TABLE "RawTransaction" ALTER COLUMN "to" DROP NOT NULL,
ALTER COLUMN "gasPrice" DROP NOT NULL,
ALTER COLUMN "gasLimit" DROP NOT NULL,
ALTER COLUMN "maxPriorityFeePerGas" DROP NOT NULL,
ALTER COLUMN "maxFeePerGas" DROP NOT NULL,
ALTER COLUMN "data" DROP NOT NULL;

-- CreateTable
CREATE TABLE "IndexerStatus" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexerStatus_pkey" PRIMARY KEY ("id")
);
