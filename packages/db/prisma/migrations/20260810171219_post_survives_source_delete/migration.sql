-- DropForeignKey
ALTER TABLE "Post" DROP CONSTRAINT "Post_newsItemId_fkey";

-- AlterTable
ALTER TABLE "Post" ALTER COLUMN "newsItemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
