-- Selective contact PII encryption and deterministic keyed lookup indexes.
-- Existing rows remain readable only while encryption is disabled. Run the
-- idempotent contact PII backfill before enabling PII_ENCRYPTION_REQUIRED.

ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS pii_encrypted JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS name_lookup CHAR(64),
    ADD COLUMN IF NOT EXISTS email_lookup CHAR(64),
    ADD COLUMN IF NOT EXISTS phone_lookup CHAR(64),
    ADD COLUMN IF NOT EXISTS whatsapp_lookup CHAR(64),
    ADD COLUMN IF NOT EXISTS cpf_lookup CHAR(64);

DROP INDEX IF EXISTS uk_contacts_phone;
DROP INDEX IF EXISTS uk_contacts_email;
DROP INDEX IF EXISTS uk_contacts_tenant_phone;
DROP INDEX IF EXISTS uk_contacts_tenant_email;
DROP INDEX IF EXISTS idx_contacts_name;
DROP INDEX IF EXISTS idx_contacts_tenant_name;

CREATE UNIQUE INDEX IF NOT EXISTS uk_contacts_phone_lookup
    ON contacts(tenant_id, phone_lookup) WHERE phone_lookup IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uk_contacts_email_lookup
    ON contacts(tenant_id, email_lookup) WHERE email_lookup IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_name_lookup
    ON contacts(tenant_id, name_lookup) WHERE name_lookup IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_lookup
    ON contacts(tenant_id, whatsapp_lookup) WHERE whatsapp_lookup IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_cpf_lookup
    ON contacts(tenant_id, cpf_lookup) WHERE cpf_lookup IS NOT NULL;
