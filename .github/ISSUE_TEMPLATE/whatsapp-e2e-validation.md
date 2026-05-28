---
name: WhatsApp E2E validation
about: Record final staging/production validation for WhatsApp -> EvolutionAPI -> Chatwoot -> agent-secretary
title: "validation: WhatsApp E2E"
labels: validation, production-readiness
assignees: ""
---

## Context

Flow under validation:

```text
Tutor -> WhatsApp -> EvolutionAPI -> Chatwoot -> agent-secretary -> Chatwoot -> EvolutionAPI -> WhatsApp
```

## Environment

- Date/time:
- Environment:
- Version/commit:
- Responsible:

## Automated Smoke

- Command or workflow:
- Result:
- `npm run smoke:full-flow`: pass/fail
- GitHub Actions `Staging Smoke`: pass/fail

## WhatsApp Inbound

- Test phone number:
- Sent at:
- Message sent:
- Chatwoot conversation id:
- Chatwoot contact id:
- Chatwoot inbox id:

## Agent Processing

- Webhook received: yes/no
- Signature accepted: yes/no
- Message normalized: yes/no
- Knowledge/RAG executed: yes/no
- AI or tool executed: yes/no
- Response sent to Chatwoot: yes/no

## WhatsApp Outbound

- Response received at:
- Response content:
- Approx latency:

## Guardrails

- Clinical-risk message tested:
- Result:
- Handoff/audit evidence:

## Scheduling

- Scheduling message tested:
- Tool triggered:
- Confirmation only after `confirm_appointment`: yes/no

## Handoff

- Human-handoff message tested:
- Handoff id:
- Audit event id:
- Chatwoot label/note:

## Decision

- [ ] Go
- [ ] No-Go

## Pending Items

-
