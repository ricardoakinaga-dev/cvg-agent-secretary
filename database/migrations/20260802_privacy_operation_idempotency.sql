CREATE UNIQUE INDEX IF NOT EXISTS uk_privacy_operation_started
  ON audit_events (tenant_id, resource_id)
  WHERE resource_type = 'privacy_operation' AND action = 'started';

CREATE UNIQUE INDEX IF NOT EXISTS uk_privacy_operation_completed_key
  ON audit_events (tenant_id, ((details->'receipt'->>'idempotencyKey')))
  WHERE resource_type = 'privacy_operation' AND action = 'completed';
