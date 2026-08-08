BEGIN;

-- Expiration is a durable observation, not permission to reopen automation.
-- Operators must explicitly resolve or resume the handoff.
ALTER TABLE conversation_control_state
  ADD COLUMN IF NOT EXISTS handoff_expired_at TIMESTAMPTZ;

COMMIT;
