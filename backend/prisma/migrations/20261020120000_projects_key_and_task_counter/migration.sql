-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "key" TEXT NOT NULL,
ADD COLUMN     "next_task_number" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "projects_organization_id_archived_at_created_at_idx" ON "projects"("organization_id", "archived_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_key_key" ON "projects"("organization_id", "key");

