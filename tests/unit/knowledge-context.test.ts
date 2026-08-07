import { describe, expect, it } from 'vitest';
import {
  buildClinicalWalkInResponse,
  shouldUseClinicalWalkInResponse,
} from '../../src/modules/knowledge/context';
import { KnowledgeChunk } from '../../src/shared/types';

describe('Knowledge context clinical guardrails', () => {
  it('uses deterministic walk-in guidance for generic clinical consultation requests', () => {
    const chunks: KnowledgeChunk[] = [{
      id: 'consulta',
      content: '120 3 Consultas e atendimento CONSULTA CLINICO GERAL SEGUNDA À SÁBADO DAS 08H AS 20H R$ 89,00',
      source: 'qdrant',
      relevance: 0.91,
      title: 'Tabela de Serviços',
    }];

    const query = 'Meu cão está doente e preciso passar com ele em consulta';

    expect(shouldUseClinicalWalkInResponse(query, chunks, 'duvida_clinica')).toBe(true);
    expect(buildClinicalWalkInResponse(query, chunks)).toBe(
      'Entendo sua preocupação. Para avaliação clínica no Centro Veterinário Guarapiranga, o atendimento é por ordem de chegada e não precisa de agendamento. Você pode ir diretamente à unidade para que a equipe avalie o pet. Se houver sinais de emergência, como sangue, apatia intensa, dificuldade para respirar, vômitos contínuos ou piora rápida, procure atendimento imediato.'
    );
  });
});
