-- CreateEnum
CREATE TYPE "task_activity_type" AS ENUM ('created', 'title_changed', 'description_changed', 'status_changed', 'priority_changed', 'assignee_changed', 'due_date_changed');

-- CreateTable
CREATE TABLE "task_activity" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "type" "task_activity_type" NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_activity_task_id_created_at_idx" ON "task_activity"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_activity_actor_id_idx" ON "task_activity"("actor_id");

-- AddForeignKey
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_organization_id_fkey" FOREIGN KEY ("task_id", "organization_id") REFERENCES "tasks"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
