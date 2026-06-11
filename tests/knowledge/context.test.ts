import {
  buildKnowledgeContext,
  buildServiceAvailabilityResponse,
  buildWalkInServiceResponse,
  containsSchedulingProposal,
  hasHoursEvidence,
  hasPriceEvidence,
  hasSchedulingPolicyEvidence,
  hasWalkInServiceEvidence,
  isHoursQuery,
  isPricingQuery,
  isServiceAvailabilityQuery,
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

  it('detects walk-in clinic evidence without treating it as schedulable', () => {
    const chunks: KnowledgeChunk[] = [{
      id: 'walk-in',
      content: 'Clínica médica: atendimento por ordem de chegada. Não precisa de agendamento.',
      source: 'qdrant',
      relevance: 0.95,
      title: 'Clínica médica',
    }];

    expect(hasWalkInServiceEvidence('quero agendar atendimento da clínica médica', chunks)).toBe(true);
    expect(hasSchedulingPolicyEvidence(chunks)).toBe(false);
    expect(buildWalkInServiceResponse('quero agendar atendimento da clínica médica', chunks)).toBe(
      'O atendimento de clínica médica é por ordem de chegada e não precisa de agendamento. Você pode ir diretamente ao Centro Veterinário Guarapiranga para atendimento.'
    );
  });

  it('detects unsupported scheduling proposals in service availability answers', () => {
    const chunks: KnowledgeChunk[] = [{
      id: 'exams',
      content: 'Serviços disponíveis: exames de sangue, raio-x e ultrassonografia.',
      source: 'qdrant',
      relevance: 0.94,
      title: 'Exames',
    }];

    expect(isServiceAvailabilityQuery('Vc tem exames de sangue, RX e ultrassom?')).toBe(true);
    expect(containsSchedulingProposal('Posso ajudar a agendar, me informe a data e horário.')).toBe(true);
    expect(hasSchedulingPolicyEvidence(chunks)).toBe(false);
    expect(buildServiceAvailabilityResponse('Vc tem exames de sangue, RX e ultrassom?', chunks)).toBe(
      'Sim, o Centro Veterinário Guarapiranga realiza exames de sangue, raio-x e ultrassonografia. Para preparo, disponibilidade e forma de atendimento, um atendente pode confirmar os detalhes sem gerar informação incorreta sobre agenda.'
    );
  });
});
