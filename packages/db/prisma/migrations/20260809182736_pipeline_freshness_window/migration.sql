/*
  Warnings:

  - You are about to drop the column `dedupeWindowHours` on the `Pipeline` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Pipeline" DROP COLUMN "dedupeWindowHours",
ADD COLUMN     "freshnessWindowHours" INTEGER NOT NULL DEFAULT 48;
