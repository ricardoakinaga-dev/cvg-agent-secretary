# 11 - DevOps e CI/CD

## Objetivo

Definir o estado real de DevOps do projeto e o gap exato até um pipeline mínimo de entrega contínua.

## Estado Atual

### Implementado

- `Dockerfile`
- `docker-compose.yml`
- Scripts de `build`, `test`, `lint` e `typecheck`

### Não implementado

- `.github/workflows/ci.yml`
- pipeline automatizado de lint, testes e build
- deploy automatizado

## Leitura Executiva

O projeto já possui base local de execução e containerização, mas ainda não possui CI/CD. Portanto, o status correto desta frente é **parcial**, não concluído.

## Pipeline Mínimo Necessário

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

## Bloqueadores

| Item | Impacto |
|------|---------|
| Falta de GitHub Actions | Toda validação depende de execução manual |
| Testes dependentes de env real | Pipeline pode falhar mesmo com código saudável |

## Critério de conclusão

- Workflow de CI criado
- Execução em pull request e `main`
- Pipeline verde sem uso de secrets de produção

## Próximo Passo Recomendado

Implementar primeiro o CI e só depois discutir automação de deploy.

*Documento revisado em 25/03/2026*
