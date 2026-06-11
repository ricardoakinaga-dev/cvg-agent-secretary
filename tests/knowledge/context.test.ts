import {
  buildKnowledgeContext,
  hasHoursEvidence,
  hasPriceEvidence,
  isHoursQuery,
  isPricingQuery,
  supportedPrices,
} from '../../src/modules/knowledge/context';
import { KnowledgeChunk } from '../../src/shared/types';

describe('Knowledge context builder', () => {
  const tableChunk: KnowledgeChunk = {
    id: 'chunk-1',
    content: [
      'io R$ 120,00',
      '119 30 Consultas e atendimento CONSULTA CARDIOLOGICA R$ 350,00',
      '120 3 Consultas e atendimento CONSULTA CLINICO GERAL SEGUNDA À SÁBADO DAS 08H AS 20H R$ 89,00',
      '121 1192 Consultas e atendimento CONSULTA DERMATOLOGIA DR GUILHERME R$ 350,00',
    ].join('\n'),
    source: 'imported',
    relevance: 1,
    title: 'Tabela de Serviços',
  };

  it('detects pricing questions', () => {
    expect(isPricingQuery('Quanto custa a consulta?')).toBe(true);
    expect(isPricingQuery('Olá, bom dia')).toBe(false);
  });

  it('keeps relevant consultation price evidence and drops unrelated truncated prices', () => {
    const context = buildKnowledgeContext(
      'Eu preciso passar em Consulta quanto está saindo?',
      [tableChunk]
    );

    expect(context).toHaveLength(1);
    expect(context[0].content).toContain('CONSULTA CLINICO GERAL');
    expect(context[0].content).toContain('R$ 89,00');
    expect(context[0].content).not.toContain('io R$ 120,00');
  });

  it('reports supported prices from prepared evidence', () => {
    const context = buildKnowledgeContext('Quanto custa consulta?', [tableChunk]);

    expect(hasPriceEvidence(context)).toBe(true);
    expect(supportedPrices(context)).toContain('R$ 89,00');
    expect(supportedPrices(context)).not.toContain('R$ 120,00');
  });

  it('detects hours questions', () => {
    expect(isHoursQuery('Qual o horário de atendimento?')).toBe(true);
    expect(isHoursQuery('Vocês funcionam 24 horas?')).toBe(true);
    expect(isHoursQuery('Quanto custa consulta?')).toBe(false);
    expect(isHoursQuery('Preciso passar em consulta como funciona?')).toBe(false);
  });

  it('keeps only operational evidence for hours questions', () => {
    const context = buildKnowledgeContext('Qual o horário de atendimento?', [{
      id: 'hours',
      content: [
        'TABELA 2 INTERNAÇÃO 24 HORAS R$ 274,25',
        'Padrao esperado: resposta clara sobre horario, endereco, servicos e preparo',
        'urgencias direcionadas para atendimento imediato',
      ].join('\n'),
      source: 'imported',
      relevance: 0.8,
      title: 'Jornada',
    }]);

    expect(context).toHaveLength(1);
    expect(hasHoursEvidence(context)).toBe(true);
    expect(context[0].content).toContain('horario');
  });

  it('returns no context for hours questions without operational evidence', () => {
    const context = buildKnowledgeContext('Qual o horário?', [tableChunk]);

    expect(context).toEqual([]);
  });
});
