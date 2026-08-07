import { describe, expect, it } from 'vitest';
import { IntentClassification } from '../../src/modules/intent/types';
import {
  advanceContactIntake,
  buildIntakeKnowledgeQuery,
} from '../../src/modules/runtime/contactIntake';

function classification(
  overrides: Partial<IntentClassification> = {}
): IntentClassification {
  return {
    intent: 'desconhecido',
    confidence: 0.3,
    priority: 'low',
    detectedKeywords: [],
    entities: {},
    requiresHandoff: false,
    riskLevel: 'low',
    ...overrides,
  };
}

describe('contact intake', () => {
  it('asks for the contact role and reason on a generic first message', () => {
    const result = advanceContactIntake({
      message: 'Olá',
      classification: classification({ intent: 'saudacao', confidence: 0.9 }),
    });

    expect(result.status).toBe('needs_input');
    expect(result.state.stage).toBe('identification');
    expect(result.state.contactRole).toBeUndefined();
    expect(result.response).toContain('tutor/cliente, colaborador ou fornecedor');
    expect(result.response).toContain('motivo do contato');
  });

  it('retains an operational reason while waiting for the declared role', () => {
    const first = advanceContactIntake({
      message: 'Quero saber o horário de atendimento',
      classification: classification({ intent: 'horarios', confidence: 0.85 }),
    });

    expect(first.status).toBe('needs_input');
    expect(first.state.contactReason).toContain('horário de atendimento');

    const second = advanceContactIntake({
      currentState: first.state,
      message: 'Sou cliente',
      classification: classification(),
    });

    expect(second.status).toBe('ready');
    expect(second.state).toMatchObject({
      stage: 'ready',
      contactRole: 'cliente',
      contactReason: expect.stringContaining('horário de atendimento'),
    });
    expect(second.knowledgeQuery).toContain('horário de atendimento');
  });

  it('recognizes a client declaration after a greeting in the same message', () => {
    const result = advanceContactIntake({
      message: 'Olá, sou cliente e quero saber o horário de atendimento',
      classification: classification({ intent: 'saudacao', confidence: 0.9 }),
    });

    expect(result.status).toBe('ready');
    expect(result.state.contactRole).toBe('cliente');
    expect(result.state.contactReason).toContain('horário de atendimento');
  });

  it('collects pet identification for a tutor with a clinical reason', () => {
    const first = advanceContactIntake({
      message: 'Sou tutora e meu pet está vomitando',
      classification: classification({ intent: 'duvida_clinica', confidence: 0.78 }),
    });

    expect(first.status).toBe('needs_input');
    expect(first.state).toMatchObject({
      contactRole: 'tutor',
      reasonIntent: 'duvida_clinica',
    });
    expect(first.response).toContain('nome e a espécie do pet');

    const second = advanceContactIntake({
      currentState: first.state,
      message: 'Rex, cachorro',
      classification: classification({
        entities: { petName: 'Rex', petSpecies: 'cachorro' },
      }),
    });

    expect(second.status).toBe('ready');
    expect(second.state).toMatchObject({
      stage: 'ready',
      petName: 'Rex',
      petSpecies: 'cachorro',
    });
  });

  it('collects pet identification before handling a typoed consultation request', () => {
    const result = advanceContactIntake({
      message: 'Estou com meu cachorro e preciso passar emnconsulta',
      classification: classification({
        intent: 'duvida_clinica',
        confidence: 0.78,
        entities: { petSpecies: 'cachorro' },
      }),
    });

    expect(result.status).toBe('needs_input');
    expect(result.state).toMatchObject({
      contactRole: 'tutor',
      contactReason: 'Estou com meu cachorro e preciso passar emnconsulta',
      petSpecies: 'cachorro',
    });
    expect(result.response).toContain('nome do pet');
  });

  it('uses a single known pet instead of asking for the same data again', () => {
    const result = advanceContactIntake({
      message: 'Sou tutor e quero agendar uma consulta',
      classification: classification({ intent: 'agendamento', confidence: 0.8 }),
      knownPets: [{ name: 'Mel', species: 'gato' }],
    });

    expect(result.status).toBe('ready');
    expect(result.state).toMatchObject({
      contactRole: 'tutor',
      petName: 'Mel',
      petSpecies: 'gato',
    });
  });

  it('updates the retained reason when a ready contact starts a new subject', () => {
    const result = advanceContactIntake({
      currentState: {
        stage: 'ready',
        contactRole: 'fornecedor',
        contactReason: 'Cadastro inicial',
        reasonIntent: 'desconhecido',
        organization: 'Vet Supply',
        unansweredAttempts: 0,
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
      message: 'Entrega atrasada',
      classification: classification(),
    });

    expect(result.status).toBe('ready');
    expect(result.state.contactReason).toBe('Entrega atrasada');
    expect(result.knowledgeQuery).toContain('Entrega atrasada');
    expect(result.useRetainedReason).toBe(true);
  });

  it('does not replay an old reason when an identified contact only greets again', () => {
    const result = advanceContactIntake({
      currentState: {
        stage: 'ready',
        contactRole: 'cliente',
        contactReason: 'Consultar horários',
        reasonIntent: 'horarios',
        unansweredAttempts: 0,
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
      message: 'Olá',
      classification: classification({ intent: 'saudacao', confidence: 0.9 }),
    });

    expect(result.status).toBe('ready');
    expect(result.state.contactReason).toBe('Consultar horários');
    expect(result.useRetainedReason).toBe(false);
  });

  it('collects the sector for collaborators and the organization for suppliers', () => {
    const collaborator = advanceContactIntake({
      message: 'Sou colaborador e preciso acessar uma diretriz interna',
      classification: classification(),
    });
    expect(collaborator.status).toBe('needs_input');
    expect(collaborator.response).toContain('setor');

    const collaboratorReady = advanceContactIntake({
      currentState: collaborator.state,
      message: 'Recepção',
      classification: classification(),
    });
    expect(collaboratorReady.status).toBe('ready');
    expect(collaboratorReady.state.sector).toBe('Recepção');

    const supplier = advanceContactIntake({
      message: 'Sou fornecedor e quero tratar de uma entrega',
      classification: classification(),
    });
    expect(supplier.status).toBe('needs_input');
    expect(supplier.response).toContain('empresa');

    const supplierReady = advanceContactIntake({
      currentState: supplier.state,
      message: 'Empresa Vet Supply',
      classification: classification(),
    });
    expect(supplierReady.status).toBe('ready');
    expect(supplierReady.state.organization).toBe('Empresa Vet Supply');
  });

  it('hands off after repeated answers that do not complete the intake', () => {
    const first = advanceContactIntake({
      message: 'Oi',
      classification: classification({ intent: 'saudacao' }),
    });
    const second = advanceContactIntake({
      currentState: first.state,
      message: 'Não entendi',
      classification: classification(),
    });
    const third = advanceContactIntake({
      currentState: second.state,
      message: 'Ainda não entendi',
      classification: classification(),
    });

    expect(third.status).toBe('handoff');
    expect(third.handoffReason).toContain('identificação');
    expect(third.response).toContain('atendente humano');
  });

  it('builds a bounded, PII-masked query using the retained reason', () => {
    const query = buildIntakeKnowledgeQuery({
      stage: 'ready',
      contactRole: 'fornecedor',
      contactReason: 'Quero orientação sobre entrega; contato (11) 99999-8888',
      reasonIntent: 'desconhecido',
      organization: 'Empresa Vet Supply',
      unansweredAttempts: 0,
      updatedAt: '2026-08-02T00:00:00.000Z',
    });

    expect(query).toContain('Perfil do contato: fornecedor');
    expect(query).toContain('Motivo do contato:');
    expect(query).not.toContain('99999-8888');
    expect(query.length).toBeLessThanOrEqual(700);
  });
});
