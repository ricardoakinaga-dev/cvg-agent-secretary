# 05 - Sistema de Conhecimento RAG

## Visão Geral

O sistema RAG (Retrieval Augmented Generation) do CVG Secretary Agent fornece ao agente acesso a informações estruturadas sobre o hospital veterinário, permitindo respostas consistentes e precisas sem depender apenas da memória do modelo de linguagem.

## O que Entra no RAG

### Categorias de Conhecimento

| Categoria | Descrição | Exemplos |
|-----------|-----------|----------|
| **FAQ** | Perguntas frequentes dos clientes | "Qual o horário de funcionamento?", "Vocês atendem emergência?" |
| **Preparo** | Orientações de preparo para procedimentos | "Animal precisa jejum?", "Trazer exames anteriores?" |
| **Políticas** | Regras e políticas do hospital | "Política de cancelamento", "Formas de pagamento" |
| **Horários** | Informações sobre horários | "Horário de visita", "Horário de funcionamento" |
| **Serviços** | Descrição de serviços oferecidos | "Cirurgias", "Exames", "Banho e tosa" |
| **Documentos Internos** | Manuais e procedimentos internos | "Protocolo de triagem", "Fluxo de atendimento" |
| **Orientações Pós-Tratamento** | Cuidados após procedimentos | "Pós-cirúrgico", "Medicação em casa" |

### Conteúdo Estruturado para Postgres

Informações que devem ser armazenadas em Postgres (não no RAG):

| Dado | Razão |
|------|-------|
| **Catálogo de serviços** | Estruturado, pesquisável, atualizável com preços |
| **Horário de funcionamento** | Formato estruturado (json com dias/horários) |
| **Dados de contato** | Estruturado, pode mudar frequentemente |
| **Regras operacionais** | Formato estruturado com versionamento |
| **Métricas e relatórios** | Dados estruturados para analytics |

### Conteúdo para Vector Store

Conteúdo ideal para o vector store (RAG):

| Tipo | Características |
|------|-----------------|
| FAQ | Texto longo, perguntas naturais |
| Políticas | Texto explicativo, múltiplas regras |
| Procedimentos | Passos descritivos |
| Orientações | Instruções em linguagem natural |
| Histórico de interações | Contexto conversacional |

## Pipeline de Ingestão

### Fluxo de Ingestão

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌────────────┐    ┌─────────────┐
│   Telegram  │───>│  Classificação│───>│  Validação  │───>│  Chunking  │───>│  Embedding  │
│   (Input)   │    │              │    │             │    │             │    │             │
└─────────────┘    └──────────────┘    └─────────────┘    └────────────┘    └─────────────┘
                                                                                    │
                                                                                    ▼
                                                                              ┌────────────┐
                                                                              │   Vector   │
                                                                              │   Store    │
                                                                              └────────────┘
```

### Etapas do Pipeline

#### 1. Recepção (Telegram ou Manual)

- Mensagem chega via Telegram (preferido) ou inserção manual
- Sistema identifica tipo de conteúdo
- Cria registro em `telegram_ingestions` com status "pending"

#### 2. Classificação

- Classificador determina categoria do conteúdo
- Categorias: `knowledge`, `rule`, `command`, `feedback`
- Se `knowledge`: direciona para pipeline RAG
- Se `rule`: direciona para `operational_rules`
- Se `command`: executa ação diretamente

#### 3. Validação

- Verifica formato e estrutura
- Conteúdo deve ter título e corpo
- Comprimento mínimo: 50 caracteres
- Comprimento máximo: 50.000 caracteres

#### 4. Processamento

- Limpeza de texto (remover formatação excessiva)
- Detecção de idioma (priorizar português)
- Extração de metadados (se aplicável)

## Chunking

### Estratégia de Divisão

O conteúdo é dividido em chunks para otimizar a recuperação:

| Parâmetro | Valor |
|-----------|-------|
| **Tamanho do chunk** | 500 tokens |
| **Overlap** | 50 tokens (10%) |
| **Estratégia** | Markdown-aware (mantém parágrafos juntos) |

### Tipos de Chunking

#### Para FAQs
```
Pergunta 1
Resposta 1

Pergunta 2
Resposta 2
```
Cada par pergunta-resposta vira um chunk

#### Para Políticas
```
TÍTULO: Política de Cancelamento

1. O cliente pode cancelar...
2. Com menos de 24h...
3. Reembolso...
```
Cada seção pode ser chunk separado

#### Para Procedimentos
```
PASSO 1: Preparação
[Descrição detalhada]

PASSO 2: Execução
[Descrição detalhada]
```
Cada passo pode ser chunk

### Metadados por Chunk

```json
{
  "document_id": "uuid",
  "chunk_index": 0,
  "title": "Título do documento",
  "category": "faq",
  "tags": ["urgência", "emergência", "hospital"],
  "version": 1,
  "source": "telegram",
  "created_at": "2024-01-15T10:00:00Z"
}
```

## Versionamento

### Política de Versionamento

| Aspecto | Regra |
|---------|-------|
| **Nova versão** | Quando conteúdo muda significativamente |
| **Versionamento** | Inteiro sequencial (1, 2, 3...) |
| **Reter versões** | Manter últimas 5 versões |
| **Chunks antigos** | Desativar, não deletar |

### Fluxo de Versionamento

1. Novo conteúdo chega
2. Sistema verifica se é atualização de documento existente
3. Se sim:
   - Incrementa versão
   - Desativa chunks da versão anterior
   - Cria novos chunks
4. Se não: cria novo documento

### RAG e Versionamento

- **Busca**: Apenas chunks ativos são incluídos na busca
- **Resposta**: Inclui versão da fonte na resposta
- **Fallback**: Se busca não retorna, pode buscar em versões anteriores

## Reindexação

### Quando Reindexar

| Gatilho | Prioridade |
|---------|------------|
| Mudança de modelo de embedding | Alta |
| Nova estratégia de chunking | Alta |
| Corrupção de índice | Alta |
| Performance ruim | Média |
| Manutenção programada | Baixa |

### Processo de Reindexação

```
1. Exportar todos os chunks ativos
2. Reprocessar com nova estratégia
3. Criar novo namespace no vector store
4. Validar qualidade (testes de recall)
5. Trocar namespace default
6. Limpar namespace antigo (após 7 dias)
```

## Política de Aprovação

### Fluxo de Aprovação

```
draft → pending_review → approved → published
                    ↓
                 rejected
```

| Status | Significado | Ação |
|--------|-------------|------|
| **draft** | Rascunho, em edição | Pode editar |
| **pending_review** | Aguardando aprovação | Revisor analisa |
| **approved** | Aprovado, pronto para publicar | Pode publicar |
| **published** | No ar, disponível para agente | Ativo no RAG |
| **rejected** | Reprovado | Não pode publicar |

### Papéis

| Papel | Permissões |
|-------|------------|
| **Editor** | Criar, editar, enviar para review |
| **Revisor** | Aprovar, rejeitar, publicar |
| **Admin** | Todas as permissões + excluir |

### Critérios de Aprovação

1. **Precisão**: Informação está correta?
2. **Clareza**: Linguagem é понятна?
3. **Consistência**: Alinhado com outras políticas?
4. **Segurança**: Não viola guidelines clínicos?
5. **Atualização**: Informação ainda é válida?

## Tipos de Conhecimento Detalhado

### FAQ

Perguntas frequentes com respostas em linguagem natural.

**Estrutura no Vector Store**:
```
P: [Pergunta natural]
R: [Resposta completa]

P: [Próxima pergunta]
R: [Próxima resposta]
```

**Exemplo**:
```
P: Qual o horário de funcionamento do hospital?
R: Nosso hospital funciona de segunda a sexta das 7h às 19h. 
   Aos sábados das 8h às 14h. Domingo temos plantão de emergência 
   das 8h às 12h.
```

### Orientações de Preparo

Instruções detalhadas para procedimentos.

**Estrutura**:
```
PROCEDIMENTO: [Nome]
DURAÇÃO APROXIMADA: [X] minutos
PREPARO NECESSÁRIO:
1. [Passo 1]
2. [Passo 2]

PÓS-PROCEDIMENTO:
- [Instrução 1]
- [Instrução 2]
```

### Políticas

Regras formais do hospital.

**Estrutura**:
```
POLÍTICA: [Nome]
DATA EFETIVA: [Data]
RESPONSÁVEL: [Pessoa/Setor]

CONTEÚDO:
[Texto da política]

EXCEÇÕES:
[Se houver]
```

### Serviços

Descrição de serviços oferecidos.

**Estrutura**:
```
SERVIÇO: [Nome]
DESCRIÇÃO: [O que é]
INDICAÇÃO: [Quando usar]
DURAÇÃO: [Tempo médio]
PREÇO: [Valor ou "consulte"]
PRÉ-REQUISITOS: [O que precisa traz er]
```

## Manutenção do RAG

### Métricas de Qualidade

| Métrica | Meta | Como Medir |
|---------|------|------------|
| **Recall** | ≥ 80% | Queries de teste retornam resposta relevante |
| **Precision** | ≥ 90% | Respostas recuperadas são de fato relevantes |
| **Latência** | < 2s | Tempo de busca no vector store |
| **Freshness** | 100% | Documentos approved estão publicados |

### Monitoramento

- **Queries de teste**: Conjunto de perguntas com respostas esperadas
- **A/B testing**: Comparar versões do índice
- **Feedback loop**: Usar interações para melhorar

### Limpeza

- **Sem uso**: Documentos nunca usados em 6 meses revisar
- **Obsoletos**: Verificar datas de validade
- **Duplicados**: Detectar e consolidar documentos similares
