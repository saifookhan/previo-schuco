ALTER TYPE "public"."user_status" ADD VALUE 'invite_failed' BEFORE 'active';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "cognito_sub" DROP NOT NULL;