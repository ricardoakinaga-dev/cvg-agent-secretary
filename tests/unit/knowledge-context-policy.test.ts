import {
  buildServiceAvailabilityResponse,
  buildWalkInServiceResponse,
  containsSchedulingProposal,
  hasSchedulingPolicyEvidence,
  hasWalkInServiceEvidence,
  isServiceAvailabilityQuery,
} from '../../src/modules/knowledge/context';
import { KnowledgeChunk } from '../../src/shared/types';

describe('knowledge context operational policy', () => {
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
