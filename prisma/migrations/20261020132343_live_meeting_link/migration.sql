-- AlterTable
ALTER TABLE "LiveSession" ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'jitsi';
