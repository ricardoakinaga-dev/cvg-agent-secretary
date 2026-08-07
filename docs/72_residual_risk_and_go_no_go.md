# 72 - Riscos Residuais e Gate Go/No-Go

## Estado executivo

**Decisao atual: NO-GO para producao hospitalar com dados reais.** A implementacao tecnica fechou a maior parte dos achados de codigo, mas controles dependentes de ambiente, governanca e terceiros ainda nao possuem evidencia. Staging controlado e permitido somente com dados sinteticos e secrets proprios.

## Riscos residuais

| ID | Risco | Severidade | Tratamento necessario | Owner/aprovador | Estado |
|---|---|---:|---|---|---|
| R-01 | Contrato real do webhook/Agent Bot divergir do HMAC implementado | Critica | capturar evidencia real de headers/corpo bruto e executar cenarios WHK-001 | A designar | Aberto |
| R-02 | Bases legais, prazos, legal hold e direitos do titular nao aprovados | Critica | DPO e owner hospitalar aprovarem documentos 67-69 e policy versionada | A designar | Aberto |
| R-03 | Fornecedores/transferencia internacional sem DPA aprovado | Critica | revisar Chatwoot, OpenAI/OpenRouter e suboperadores | A designar | Aberto |
| R-04 | TLS, secret manager e rede privada nao comprovados no alvo | Alta | evidenciar topologia, certificados, ACLs e rotacao | A designar | Aberto |
| R-05 | Backend externo de metricas/logs/alertas nao provisionado | Alta | configurar scrape, persistencia, dashboards, alertas e on-call | A designar | Aberto |
| R-06 | Restore/RPO/RTO medidos no gate descartavel, mas nao reproduzidos/aprovados no alvo nem ligados a legal hold | Alta | executar o mesmo gate no ambiente isolado do alvo e obter aceite operacional/DPO | A designar | Aberto |
| R-07 | E2E WhatsApp/Chatwoot e indisponibilidades nao homologados | Critica | executar matriz G5 com numero e conta de teste | A designar | Aberto |
| R-08 | Carga/restart/concorrencia passaram no ambiente descartavel, mas SLO e capacidade do alvo nao foram homologados | Alta | reproduzir carga/lease/retry no alvo de staging e aprovar capacidade | A designar | Aberto |
| R-09 | Mudancas ainda sem commit/PR/revisor independente | Alta | consolidar commits, PR, secret scan e revisao P0/P1 | A designar | Aberto |
| R-10 | Qdrant/logs dependem de atestacao de ausencia de PII | Alta | inspecionar backend real ou implementar adapters especificos | A designar | Aberto |
| R-11 | Chaves de PII ainda nao foram provisionadas/rotacionadas no secret manager alvo | Alta | gerar chaves, executar migration/backfill, comprovar zero legados e ensaiar rotacao | A designar | Aberto |
| R-12 | Auditoria local e append-only para a role app, mas sem garantia WORM contra superuser | Alta | restringir administradores e exportar outbox/eventos para sink imutavel externo | A designar | Aberto |

## Evidencias tecnicas disponiveis

- JWT/RBAC, webhook, tenant/RLS, tools, guardrails e filas cobertos por testes automatizados;
- 865 testes catalogados, sendo 853 ativos aprovados e 12 integracoes externas/condicionais ignoradas;
- cobertura global acima de 80% linhas e 70% branches;
- Postgres, Redis e Qdrant reais validados em ambiente descartavel;
- carga/restart sem perda ou duplicacao, migration rollback/lock e restores medidos com artifacts JSON;
- regras Prometheus e cenarios de disparo validados nativamente por `promtool` no CI;
- PII de contatos protegida com AES-256-GCM, indices cegos, backfill e rotacao testados;
- auditoria critica transacional, idempotente, append-only e com ator opaco;
- migrations idempotentes com lock/checksum;
- npm audit de producao e completo sem vulnerabilidades;
- Docker build reproduzivel, imagens pinadas e CI com SBOM/scan;
- runbooks, inventario, ADRs e politica tecnica versionados.

## Checklist de go-live

Marcar GO somente quando todos os itens tiverem ticket, timestamp, ambiente, commit e aprovador:

- [ ] owners e aprovadores nomeados;
- [ ] PR independente revisado e branch protection ativa;
- [ ] contrato Chatwoot real aprovado;
- [ ] DPO aprova inventario, bases, retencao, fornecedores e atestacoes;
- [ ] IdP, secrets, TLS e menor privilegio evidenciados no alvo;
- [ ] dashboards, alertas e on-call testados;
- [ ] backup/restore e RPO/RTO aprovados;
- [ ] E2E WhatsApp/Chatwoot, agenda, handoff, emergencia, replay e falhas aprovado;
- [ ] carga/restart/concorrencia dentro dos SLOs;
- [ ] scan de imagem do commit final sem high/critical nao aceito;
- [ ] risk register sem risco critico aberto ou com aceite formal;
- [ ] ata de go/no-go assinada por Sponsor, Tech Lead, Security/Privacy, QA e operacao.

## Ata

| Campo | Valor |
|---|---|
| Release/commit | Pendente |
| Ambiente | Pendente |
| Data | Pendente |
| Decisao | NO-GO |
| Sponsor | Pendente |
| Tech Lead | Pendente |
| Security/Privacy/DPO | Pendente |
| QA | Pendente |
| Operacao hospitalar | Pendente |
| Riscos aceitos | Nenhum |
