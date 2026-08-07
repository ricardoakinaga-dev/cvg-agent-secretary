# Observabilidade de producao

Este pacote fecha o contrato operacional de metricas para multiplas replicas:

- Prometheus descobre e coleta **cada pod**, nunca somente o Service/load balancer;
- counters e histogramas sao locais ao processo e agregados com `sum(rate(...))`;
- `rate` trata reset de counter apos restart e o TSDB preserva o historico;
- gauges da fila Redis possuem `scope="shared"` e sao deduplicados com `max`;
- nenhuma label pode conter tenant, conta, contato, conversa, job, telefone, e-mail,
  nome, conteudo ou correlation ID;
- OAuth2 de curta duracao e mTLS protegem `/api/metrics`; JWT estatico nao e aceito
  como desenho de producao.
- o client OAuth2 deve ser mapeado pelo IdP para uma identidade de servico com
  role que contenha somente `analytics:read`; ele nao representa um usuario humano.
- a rota possui quota local propria (20 scrapes/min/pod), pois aplicar a quota IP
  compartilhada entre pods bloquearia o mesmo Prometheus ao aumentar replicas.

## Instalacao

1. Adaptar `prometheus-scrape.example.yml` ao namespace, IdP e PKI reais.
2. Carregar `prometheus-recording-rules.yml`, `prometheus-slo-rules.yml` e
   `prometheus-alerts.yml` no Prometheus/Thanos/Mimir gerenciado.
3. Importar `grafana-dashboard.json` no Grafana e selecionar o datasource.
4. Rotear alertas pelos labels `owner` e `severity`; os procedimentos estao nos
   runbooks apontados em cada regra.
5. Executar `promtool check rules` em todos os arquivos de regras e
   `promtool test rules deploy/monitoring/prometheus-rules.test.yml` antes do deploy.
6. Disparar sinteticamente cada classe de alerta em staging e anexar evidencia ao
   registro de go/no-go. Nao alterar thresholds apenas para silenciar incidentes.

## SLOs iniciais

| SLI | Objetivo | Janela | Owner |
|---|---:|---:|---|
| Webhooks processados com sucesso | 99,9% | 30 dias | Backend |
| Respostas em ate 10 s | 95% | 30 dias | Backend |
| Webhooks retirados da fila em ate 30 s | 99% | 30 dias | Platform |

Os objetivos precisam de aprovacao operacional antes do go-live e devem ser
reavaliados com trafego real sem reduzir os limites clinicos ou de privacidade.
