import { maskSensitiveData } from '../../shared/data-masking';
import {
  ContactIntakeState,
  ContactRole,
} from '../../shared/types';
import { IntentClassification, IntentType } from '../intent/types';

const MAX_REASON_CHARS = 500;
const MAX_SHORT_FIELD_CHARS = 120;
const MAX_QUERY_CHARS = 700;
const MAX_UNANSWERED_ATTEMPTS = 3;

const PET_CONTEXT_INTENTS = new Set<IntentType>([
  'agendamento',
  'cancelamento',
  'duvida_clinica',
  'informacao_pet',
]);

const GENERIC_ANSWERS = /^(?:sim|n[aã]o|ok|certo|entendi|n[aã]o entendi|ainda n[aã]o entendi|obrigad[oa])\.?$/i;
const GENERIC_PET_NAME_WORDS = new Set([
  'a', 'meu', 'minha', 'o', 'seu', 'sua', 'um', 'uma',
]);

export type ContactIntakeDecision = {
  status: 'needs_input' | 'ready' | 'handoff';
  state: ContactIntakeState;
  response?: string;
  knowledgeQuery?: string;
  useRetainedReason?: boolean;
  handoffReason?: string;
};

interface KnownPet {
  name: string;
  species: string;
}

interface AdvanceContactIntakeInput {
  currentState?: ContactIntakeState;
  message: string;
  classification: IntentClassification;
  knownPets?: KnownPet[];
  now?: Date;
}

function cleanText(value: string, maxChars: number): string {
  const withoutControlCharacters = [...maskSensitiveData(value)]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : character;
    })
    .join('');

  return withoutControlCharacters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function detectContactRole(message: string): ContactRole | undefined {
  const normalized = message.toLowerCase().trim();

  if (
    /\bfornecedor(?:a)?\b|\brepresentante\s+(?:comercial|de\s+uma\s+empresa)\b/.test(normalized)
  ) {
    return 'fornecedor';
  }
  if (
    /\bcolaborador(?:a)?\b|\bfuncion[aá]ri[oa]\b|\btrabalho\s+(?:no|na)\s+(?:cvg|centro\s+veterin[aá]rio)\b/.test(normalized)
  ) {
    return 'colaborador';
  }
  if (
    /\btutor(?:a)?\b|\bdon[oa]\s+(?:do|da)\s+(?:pet|cachorro|gato|animal)\b|\b(?:meu|minha)\s+(?:pet|cachorro|gato|animal)\b/.test(normalized)
  ) {
    return 'tutor';
  }
  if (
    /\b(?:sou|como)\s+(?:um(?:a)?\s+)?cliente\b|\bj[aá]\s+sou\s+cliente\b|^cliente\b/.test(normalized)
  ) {
    return 'cliente';
  }
  if (/^(?:sou\s+)?(?:outro|outra|visitante)\b/.test(normalized)) {
    return 'outro';
  }

  return undefined;
}

function extractReason(message: string): string | undefined {
  let candidate = message
    .replace(/^\s*(?:ol[aá]|oi|bom\s+dia|boa\s+tarde|boa\s+noite)[!,.:;\s-]*/i, '')
    .replace(
      /^\s*(?:eu\s+)?(?:sou|falo\s+como)\s+(?:um(?:a)?\s+)?(?:tutor(?:a)?|cliente|colaborador(?:a)?|funcion[aá]ri[oa]|fornecedor(?:a)?|representante\s+comercial|visitante)\b[,.\s-]*/i,
      ''
    )
    .replace(/^\s*(?:e|mas|porque|pois)\s+/i, '')
    .trim();

  candidate = cleanText(candidate, MAX_REASON_CHARS);
  if (candidate.length < 5 || GENERIC_ANSWERS.test(candidate)) {
    return undefined;
  }
  return candidate;
}

function hasSubstantiveReason(
  reason: string | undefined,
  classification: IntentClassification,
  message: string
): reason is string {
  if (!reason) return false;
  if (classification.intent !== 'saudacao' && classification.intent !== 'desconhecido') {
    return true;
  }

  return /\b(quero|preciso|gostaria|d[uú]vida|saber|informar|resolver|tratar|como|qual|quando|onde|por que)\b/i.test(message);
}

function extractPetData(
  message: string,
  classification: IntentClassification
): Pick<ContactIntakeState, 'petName' | 'petSpecies'> {
  let petName = classification.entities.petName;
  let petSpecies = classification.entities.petSpecies;
  const compact = cleanText(message, MAX_SHORT_FIELD_CHARS * 2);
  const combined = compact.match(
    /(?:o\s+nome\s+(?:dele|dela)\s+[ée]\s+)?([\p{L}][\p{L}'-]{1,60})\s*[,;-]?\s*(?:[ée]\s+)?(cachorr[oa]|c[aã]o|gat[oa]|p[aá]ssaro|ave|roedor|coelho)/iu
  );

  if (combined) {
    const candidateName = combined[1];
    if (!GENERIC_PET_NAME_WORDS.has(candidateName.toLowerCase())) {
      petName = petName || candidateName;
    }
    petSpecies = petSpecies || combined[2].toLowerCase();
  }

  return {
    ...(petName ? { petName: cleanText(petName, MAX_SHORT_FIELD_CHARS) } : {}),
    ...(petSpecies ? { petSpecies: cleanText(petSpecies, MAX_SHORT_FIELD_CHARS) } : {}),
  };
}

function extractSector(message: string, canUseShortAnswer: boolean): string | undefined {
  const explicit = message.match(/\b(?:setor|[aá]rea)\s+(?:de\s+)?([\p{L}][\p{L}\s-]{1,80})/iu)?.[1];
  if (explicit) return cleanText(explicit, MAX_SHORT_FIELD_CHARS);
  if (!canUseShortAnswer) return undefined;

  const value = cleanText(message, MAX_SHORT_FIELD_CHARS);
  return value.length >= 2 && value.length <= 80 && !GENERIC_ANSWERS.test(value)
    ? value
    : undefined;
}

function extractOrganization(message: string, canUseShortAnswer: boolean): string | undefined {
  const explicit = message.match(
    /\b(?:fornecedor(?:a)?\s+(?:da|do)|represento\s+(?:a|o))\s+([\p{L}\p{N}][\p{L}\p{N}\s&.'-]{1,100})/iu
  )?.[1];
  if (explicit) return cleanText(explicit, MAX_SHORT_FIELD_CHARS);
  if (!canUseShortAnswer) return undefined;

  const value = cleanText(message, MAX_SHORT_FIELD_CHARS);
  return value.length >= 2 && value.length <= 100 && !GENERIC_ANSWERS.test(value)
    ? value
    : undefined;
}

function tutorNeedsPetData(state: ContactIntakeState): boolean {
  return state.contactRole === 'tutor'
    && PET_CONTEXT_INTENTS.has(state.reasonIntent as IntentType);
}

function missingPrompt(state: ContactIntakeState): string | undefined {
  if (!state.contactRole) {
    return 'Olá! Para direcionar seu atendimento, você é tutor/cliente, colaborador ou fornecedor? Conte também, em uma frase, o motivo do contato.';
  }
  if (!state.contactReason) {
    return 'Obrigada. Qual é o motivo do seu contato?';
  }
  if (tutorNeedsPetData(state) && !state.petName && !state.petSpecies) {
    return 'Para continuar, informe o nome e a espécie do pet (por exemplo: Rex, cachorro).';
  }
  if (tutorNeedsPetData(state) && !state.petName) {
    return 'Qual é o nome do pet?';
  }
  if (tutorNeedsPetData(state) && !state.petSpecies) {
    return 'Qual é a espécie do pet?';
  }
  if (state.contactRole === 'colaborador' && !state.sector) {
    return 'Qual é o seu setor ou área de trabalho?';
  }
  if (state.contactRole === 'fornecedor' && !state.organization) {
    return 'Qual é o nome da empresa que você representa?';
  }

  return undefined;
}

function snapshot(state: ContactIntakeState): string {
  return JSON.stringify({
    contactRole: state.contactRole,
    contactReason: state.contactReason,
    reasonIntent: state.reasonIntent,
    petName: state.petName,
    petSpecies: state.petSpecies,
    sector: state.sector,
    organization: state.organization,
  });
}

export function buildIntakeKnowledgeQuery(state: ContactIntakeState): string {
  const reason = (state.contactReason || 'não informado').replace(/[.!?]+$/g, '');
  const parts = [
    `Perfil do contato: ${state.contactRole || 'não identificado'}.`,
    `Motivo do contato: ${reason}.`,
  ];
  return cleanText(parts.join(' '), MAX_QUERY_CHARS);
}

export function buildIntakeHandoffContext(
  state: ContactIntakeState | undefined,
  fallbackReason: string
): {
  whatClientWanted: string;
  informationCollected: Record<string, string>;
  pendingQuestions: string[];
} {
  if (!state) {
    return {
      whatClientWanted: cleanText(fallbackReason, MAX_REASON_CHARS),
      informationCollected: {},
      pendingQuestions: ['Continuar o atendimento humano.'],
    };
  }

  const informationCollected: Record<string, string> = {};
  if (state.contactRole) informationCollected.perfil = state.contactRole;
  if (state.contactReason) informationCollected.motivo = state.contactReason;
  if (state.petName) informationCollected.pet = state.petName;
  if (state.petSpecies) informationCollected.especie = state.petSpecies;
  if (state.sector) informationCollected.setor = state.sector;
  if (state.organization) informationCollected.empresa = state.organization;

  const prompt = missingPrompt(state);
  return {
    whatClientWanted: state.contactReason || cleanText(fallbackReason, MAX_REASON_CHARS),
    informationCollected,
    pendingQuestions: prompt
      ? [prompt]
      : ['Continuar o atendimento sobre o motivo informado.'],
  };
}

export function advanceContactIntake(
  input: AdvanceContactIntakeInput
): ContactIntakeDecision {
  const previous = input.currentState;
  const state: ContactIntakeState = {
    stage: previous?.stage || 'identification',
    contactRole: previous?.contactRole,
    contactReason: previous?.contactReason,
    reasonIntent: previous?.reasonIntent,
    petName: previous?.petName,
    petSpecies: previous?.petSpecies,
    sector: previous?.sector,
    organization: previous?.organization,
    unansweredAttempts: previous?.unansweredAttempts || 0,
    updatedAt: (input.now || new Date()).toISOString(),
  };
  const before = snapshot(state);
  const detectedRole = detectContactRole(input.message);
  if (!state.contactRole && detectedRole) {
    state.contactRole = detectedRole;
  }

  const reason = extractReason(input.message);
  if (
    (!state.contactReason || state.stage === 'ready')
    && (
      state.stage === 'ready'
        ? Boolean(reason)
        : hasSubstantiveReason(reason, input.classification, input.message)
    )
  ) {
    state.contactReason = reason as string;
    state.reasonIntent = input.classification.intent;
  }

  const petData = extractPetData(input.message, input.classification);
  state.petName = state.petName || petData.petName;
  state.petSpecies = state.petSpecies || petData.petSpecies;

  if (state.contactRole === 'tutor' && input.knownPets?.length === 1) {
    state.petName = state.petName || cleanText(input.knownPets[0].name, MAX_SHORT_FIELD_CHARS);
    state.petSpecies = state.petSpecies || cleanText(input.knownPets[0].species, MAX_SHORT_FIELD_CHARS);
  }

  if (state.contactRole === 'colaborador' && !state.sector) {
    state.sector = extractSector(
      input.message,
      previous?.contactRole === 'colaborador' && Boolean(previous.contactReason)
    );
  }
  if (state.contactRole === 'fornecedor' && !state.organization) {
    state.organization = extractOrganization(
      input.message,
      previous?.contactRole === 'fornecedor' && Boolean(previous.contactReason)
    );
  }

  const prompt = missingPrompt(state);
  if (!prompt) {
    state.stage = 'ready';
    state.unansweredAttempts = 0;
    const reasonChanged = state.contactReason !== previous?.contactReason;
    return {
      status: 'ready',
      state,
      knowledgeQuery: buildIntakeKnowledgeQuery(state),
      useRetainedReason: Boolean(
        state.contactReason
        && (previous?.stage !== 'ready' || reasonChanged)
      ),
    };
  }

  state.stage = state.contactRole ? 'data_collection' : 'identification';
  const madeProgress = snapshot(state) !== before;
  state.unansweredAttempts = madeProgress ? 1 : state.unansweredAttempts + 1;
  if (state.unansweredAttempts >= MAX_UNANSWERED_ATTEMPTS) {
    return {
      status: 'handoff',
      state,
      response: 'Não consegui concluir sua identificação com segurança. Vou transferir você para um atendente humano continuar o atendimento.',
      handoffReason: 'Não foi possível concluir a identificação e a coleta inicial',
    };
  }

  return {
    status: 'needs_input',
    state,
    response: prompt,
  };
}
