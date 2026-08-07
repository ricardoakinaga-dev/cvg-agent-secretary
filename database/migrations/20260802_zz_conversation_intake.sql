BEGIN;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS contact_intake JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
  ALTER TABLE conversations
    ADD CONSTRAINT conversations_contact_intake_object
    CHECK (jsonb_typeof(contact_intake) = 'object');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

COMMIT;
