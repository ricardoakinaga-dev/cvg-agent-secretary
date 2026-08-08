# CVG Agent Secretary - Documentation Index

## Visão Geral

Este índice organiza a documentação do projeto e aponta a baseline válida para a fase de implementação.

## Documentos de Referência Atual

### Fonte autoritativa atual

- `63_current_project_code_audit.md` - auditoria técnica do working tree
- `64_executive_remediation_plan.md` - plano executivo de remediação
- `65_remediation_roadmap.md` - gates e sequência de entrega
- `66_remediation_backlog.md` - única fonte de status das tarefas
- `67_data_inventory_and_flow_map.md` - inventário técnico de dados
- `68_privacy_retention_policy.md` - política técnica sujeita a aprovação
- `69_data_subject_rights_runbook.md` - direitos do titular
- `70_architecture_decision_records.md` - ADRs implementadas
- `71_security_operations_and_recovery_runbook.md` - operação, rotação, incidente e restore
- `72_residual_risk_and_go_no_go.md` - riscos residuais e decisão atual
- `73_post_remediation_reaudit.md` - notas e evidências após a implementação
- `74_final_remediation_execution_report.md` - consolidacao final da execucao, gates e pendencias externas
- `75_contact_intake_qdrant_handoff_progress.md` - progresso do intake, Qdrant e handoff enriquecido
- `76_current_production_readiness_audit.md` - auditoria atual de prontidao para atendimento em producao
- `77_executive_production_readiness_plan.md` - plano executivo para resolver os bloqueadores atuais
- `78_production_readiness_roadmap.md` - roadmap de execucao por gates
- `79_production_readiness_backlog.md` - backlog atual de prontidao para producao

### Estratégia e arquitetura

- `01_vision-product.md`
- `03_target-architecture.md`
- `04_ai-multi-provider-strategy.md`
- `05_security-and-guardrails.md`
- `06_data-and-rag-strategy.md`
- `07_runtime-and-orchestration.md`
- `08_integrations-chatwoot-telegram.md`

### Qualidade e operações

- `09_testing-and-quality.md`
- `10_observability.md`
- `11_devops-and-ci-cd.md`
- `12_scalability-and-performance.md`

### Fases

- `14_phase-0-stabilization.md`
- `15_phase-1-hardening.md`
- `16_phase-2-ai-evolution.md`
- `17_phase-3-omnichannel.md`
- `18_phase-4-intelligence.md`
- `19_phase-5-scale-enterprise.md`

## Documentos Históricos

Os arquivos abaixo ajudam a entender a evolução do projeto, mas não devem ser usados como fonte única para decisão de implementação:

- `02_current-state-audit.md`
- `auditoria-codigo.md`
- `progress-initial-docs.md`
- `phase-0-progress.md`
- `phase-1-progress.md`
- `phase-2-progress.md`
- `phase-3-progress.md`
- `phase-4-progress.md`
- `13_roadmap-phases.md`
- `20_execution_master_plan.md`
- `21_audit_report.md`
- relatórios de progresso `23` a `62`

## Observação

Em caso de conflito entre documentos, a prioridade é:

1. `72_residual_risk_and_go_no_go.md` para decisão de liberação e riscos atuais
2. `76_current_production_readiness_audit.md` para a baseline dos achados e bloqueadores
3. `79_production_readiness_backlog.md` para o status detalhado do ciclo atual
4. `77_executive_production_readiness_plan.md` para a decisao e os criterios executivos
5. `78_production_readiness_roadmap.md` para gates e sequencia de entrega
6. `74_final_remediation_execution_report.md` para evidencias finais da execucao anterior
7. `66_remediation_backlog.md` para o historico da remediacao anterior
8. `63_current_project_code_audit.md` para a baseline dos achados

*Índice revisado em 08/08/2026.*
