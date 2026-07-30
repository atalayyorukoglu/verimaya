-- files.status: pending (presign, bytes not confirmed) | ready (downloadable)
ALTER TABLE files
	ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';

ALTER TABLE files DROP CONSTRAINT IF EXISTS files_status_chk;
ALTER TABLE files
	ADD CONSTRAINT files_status_chk CHECK (status IN ('pending', 'ready'));

CREATE INDEX IF NOT EXISTS files_tenant_id_status_created_at_idx
	ON files (tenant_id, status, created_at DESC);
