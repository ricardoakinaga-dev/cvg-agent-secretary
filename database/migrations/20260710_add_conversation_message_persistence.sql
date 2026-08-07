BEGIN;

-- Remove historical duplicates before enforcing webhook idempotency.
WITH duplicate_messages AS (
    SELECT
        ctid,
        ROW_NUMBER() OVER (
            PARTITION BY conversation_id, chatwoot_message_id
            ORDER BY created_at ASC, id ASC
        ) AS duplicate_rank
    FROM messages
)
DELETE FROM messages AS message
USING duplicate_messages AS duplicate
WHERE message.ctid = duplicate.ctid
  AND duplicate.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uk_messages_conversation_chatwoot_message
    ON messages(conversation_id, chatwoot_message_id);

COMMIT;
