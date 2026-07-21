-- Allow contact entity in audit_logs

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_type_chk;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_type_chk CHECK ("entity_type" IN (
	'patient', 'contact', 'appointment', 'transaction', 'inbound_message', 'file', 'tenant', 'user'
));
