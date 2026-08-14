-- @veri-migration: transactions.title optional (Tracker form parity — no title field)
ALTER TABLE "transactions" ALTER COLUMN "title" DROP NOT NULL;
