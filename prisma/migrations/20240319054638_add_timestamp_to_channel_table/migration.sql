/*
  Warnings:

  - You are about to drop the column `blockNumber` on the `Channel` table. All the data in the column will be lost.
  - Added the required column `timestamp` to the `Channel` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Channel" DROP COLUMN "blockNumber",
ADD COLUMN     "timestamp" INTEGER NOT NULL;
