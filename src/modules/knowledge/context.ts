import { KnowledgeChunk } from '../../shared/types';

const PRICE_PATTERN = /R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/gi;
const PRICING_QUERY_PATTERN = /\b(?:quanto|valor|pre[cç]o|custa|saindo|tabela|or[cç]amento)\b/i;
const HOURS_QUERY_PATTERN = /\b(?:hor[aá]rio|abre|fecha|24\s*h|24\s*horas|plant[aã]o|que\s+horas)\b/i;
const HOURS_EVIDENCE_PATTERN = /\b(?:hor[aá]rio|funcionamento|24\s*h|24\s*horas|plant[aã]o|atendimento imediato|urg[eê]ncias?)\b/i;
const INTERNAL_HOURS_NOTE_PATTERN = /\b(?:confirmar oficialmente|se houver diferen[cç]a|revisar a cada|diret[oó]rios de terceiros|corrigir inconsist[eê]ncias|auditoria mensal)\b/i;
const CONSULTATION_PATTERN = /\bconsult(?:a|as|o|ar)\b/i;
const WALK_IN_SERVICE_PATTERN = /\b(?:ordem de chegada|sem agendamento|nao precisa de agendamento|não precisa de agendamento|nao necessita agendamento|não necessita agendamento|nao e necessario agendar|não é necessário agendar)\b/i;
const CLINIC_SERVICE_PATTERN = /\b(?:clinica medica|clínica médica|consulta clinica|consulta clínica|clinico geral|clínico geral|atendimento clinico|atendimento clínico)\b/i;
const SCHEDULING_POLICY_PATTERN = /\b(?:mediante agendamento|com agendamento|agendamento previo|agendamento prévio|agendamento obrigatorio|agendamento obrigatório|com hora marcada|horario marcado|horário marcado)\b/i;
const SCHEDULING_PROPOSAL_PATTERN = /\b(?:posso|podemos|consigo|vamos|vou)\s+(?:te\s+)?(?:ajudar\s+a\s+)?(?:agendar|marcar|verificar\s+hor[aá]rios?|reservar|iniciar\s+o\s+processo\s+de\s+agendamento)|\b(?:processo\s+de\s+agendamento|me informe|informe|qual)\s+(?:a\s+)?(?:data|dia|hor[aá]rio|de\s+uma\s+consulta)|\b(?:agendar|marcar)\s+(?:um\s+)?hor[aá]rio\b/i;
const SERVICE_AVAILABILITY_QUERY_PATTERN = /\b(?:tem|t[eê]m|possui|realiza|realizam|faz|fazem|oferece|oferecem)\b/i;
const SERVICE_TERM_PATTERN = /\b(?:exames?|sangue|raio\s*-?\s*x|rx|ultrass(?:om|onografia)|consulta|cl[ií]nica|atendimento|vacina|cirurgia|internac[aã]o|banho|tosa)\b/i;
const SCHEDULING_REQUEST_PATTERN = /\b(?:agend|marcar|reservar|hor[aá]rio para|quero para|pode ser)\b/i;
const CLINICAL_CARE_QUERY_PATTERN = /\b(?:consulta|atendimento|cl[ií]nica\s+m[eé]dica|cl[ií]nico\s+geral|doente|diarreia|diarr[eé]ia|v[oô]mit|febre|tosse|coceira|ferida|apatia|fraco|man[cç]ando|parou\s+de\s+comer|n[aã]o\s+quer\s+comer)\b/i;
const SPECIALTY_OR_PROCEDURE_QUERY_PATTERN = /\b(?:cardio\w*|cardiolog\w*|dermato\w*|dermatolog\w*|endo\w*|endocrino\w*|oftalmo\w*|ortop\w*|ortopedia\w*|neuro\w*|ultrass\w*|raio\s*-?\s*x|rx|exames?|cirurg\w*|vacina\w*|banho|tosa|internac[aã]o)\b/i;
const GENERAL_CONSULTATION_EVIDENCE_PATTERN = /\b(?:consulta\s+clinico\s+geral|consulta\s+cl[ií]nico\s+geral|consultas\s+e\s+atendimento|cl[ií]nica\s+m[eé]dica|atendimento\s+cl[ií]nico)\b/i;

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'esta',
  'está', 'eu', 'o', 'os', 'para', 'passar', 'preciso', 'qual', 'quanto', 'que',
  'saindo', 'uma', 'um', 'valor', 'preco', 'preço', 'custa',
]);

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function significantTerms(query: string): string[] {
  const tokens = normalize(query).match(/\w{3,}/g) || [];
  return Array.from(new Set(tokens.filter((token) => !STOP_WORDS.has(token))));
}

export function isPricingQuery(query: string): boolean {
  return PRICING_QUERY_PATTERN.test(query);
}

export function isHoursQuery(query: string): boolean {
  const normalizedQuery = normalize(query);
  if (/\bconsulta\b/.test(normalizedQuery) && /\bcomo\s+funciona\b/.test(normalizedQuery)) {
    return false;
  }

  return HOURS_QUERY_PATTERN.test(query);
}

export function extractPrices(text: string): string[] {
  return Array.from(new Set(text.match(PRICE_PATTERN) || []));
}

function scoreLine(query: string, line: string, terms: string[]): number {
  const normalizedLine = normalize(line);
  let score = 0;

  for (const term of terms) {
    if (normalizedLine.includes(term)) {
      score += 2;
    }
  }

  if (CONSULTATION_PATTERN.test(query) && /consulta/i.test(line)) {
    score += 4;
  }

  if (CONSULTATION_PATTERN.test(query) && /consulta\s+clinico\s+geral/i.test(normalize(line))) {
    score += 10;
  }

  if (extractPrices(line).length > 0) {
    score += 2;
  }

  return score;
}

function relevantPricedLines(query: string, chunks: KnowledgeChunk[]): string[] {
  const terms = significantTerms(query);
  const candidates: Array<{ line: string; score: number; index: number }> = [];
  let index = 0;

  for (const chunk of chunks) {
    for (const rawLine of chunk.content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || extractPrices(line).length === 0) {
        index += 1;
        continue;
      }

      const score = scoreLine(query, line, terms);
      if (score > 2) {
        candidates.push({ line, score, index });
      }
      index += 1;
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((candidate) => candidate.line)
    .filter((line, lineIndex, lines) => lines.indexOf(line) === lineIndex)
    .slice(0, 8);
}

export function buildKnowledgeContext(query: string, chunks: KnowledgeChunk[]): KnowledgeChunk[] {
  if (!isPricingQuery(query)) {
    if (!isHoursQuery(query)) {
      return chunks;
    }

    const lines = relevantOperationalLines(chunks);
    if (lines.length === 0) {
      return [];
    }

    return [{
      id: chunks[0]?.id || 'hours-evidence',
      content: [
        'Evidencias operacionais encontradas na base:',
        ...lines.map((line) => `- ${line}`),
      ].join('\n'),
      source: chunks[0]?.source || 'qdrant',
      relevance: Math.max(...chunks.map((chunk) => chunk.relevance), 0),
      category: chunks[0]?.category,
      title: chunks[0]?.title,
    }];
  }

  const lines = relevantPricedLines(query, chunks);
  if (lines.length === 0) {
    return [];
  }

  return [{
    id: chunks[0]?.id || 'pricing-evidence',
    content: [
      'Evidencias de preco encontradas na base:',
      ...lines.map((line) => `- ${line}`),
    ].join('\n'),
    source: chunks[0]?.source || 'qdrant',
    relevance: Math.max(...chunks.map((chunk) => chunk.relevance), 0),
    category: chunks[0]?.category,
    title: chunks[0]?.title,
  }];
}

export function hasPriceEvidence(chunks: KnowledgeChunk[]): boolean {
  return chunks.some((chunk) => extractPrices(chunk.content).length > 0);
}

export function hasHoursEvidence(chunks: KnowledgeChunk[]): boolean {
  return chunks.some((chunk) => HOURS_EVIDENCE_PATTERN.test(chunk.content));
}

export function supportedPrices(chunks: KnowledgeChunk[]): string[] {
  return Array.from(new Set(chunks.flatMap((chunk) => extractPrices(chunk.content))));
}

export function hasWalkInServiceEvidence(query: string, chunks: KnowledgeChunk[]): boolean {
  const normalizedQuery = normalize(query);
  const queryLooksClinicalService = CLINIC_SERVICE_PATTERN.test(normalizedQuery)
    || /\b(?:consulta|atendimento)\b/.test(normalizedQuery);

  if (!queryLooksClinicalService) {
    return false;
  }

  return chunks.some((chunk) => WALK_IN_SERVICE_PATTERN.test(normalize(chunk.content)));
}

export function buildWalkInServiceResponse(query: string, chunks: KnowledgeChunk[]): string {
  const normalizedQuery = normalize(query);
  const serviceName = CLINIC_SERVICE_PATTERN.test(normalizedQuery)
    ? 'clínica médica'
    : 'esse serviço';
  const hasNoScheduleEvidence = chunks.some((chunk) => WALK_IN_SERVICE_PATTERN.test(normalize(chunk.content)));

  if (hasNoScheduleEvidence) {
    return `O atendimento de ${serviceName} é por ordem de chegada e não precisa de agendamento. Você pode ir diretamente ao Centro Veterinário Guarapiranga para atendimento.`;
  }

  return 'Esse atendimento segue orientação operacional específica do Centro Veterinário Guarapiranga. Vou verificar com um atendente para evitar informação incorreta.';
}

export function shouldUseClinicalWalkInResponse(
  query: string,
  chunks: KnowledgeChunk[],
  intent?: string
): boolean {
  if (hasSchedulingPolicyEvidence(chunks)) {
    return false;
  }

  const normalizedQuery = normalize(query);
  if (SPECIALTY_OR_PROCEDURE_QUERY_PATTERN.test(normalizedQuery)) {
    return false;
  }

  const queryLooksLikeGeneralClinicalCare = intent === 'duvida_clinica'
    || CLINICAL_CARE_QUERY_PATTERN.test(normalizedQuery);

  if (!queryLooksLikeGeneralClinicalCare) {
    return false;
  }

  const evidence = normalize(chunks.map((chunk) => chunk.content).join('\n'));
  return WALK_IN_SERVICE_PATTERN.test(evidence)
    || GENERAL_CONSULTATION_EVIDENCE_PATTERN.test(evidence)
    || intent === 'duvida_clinica';
}

export function buildClinicalWalkInResponse(query: string, chunks: KnowledgeChunk[]): string {
  if (hasWalkInServiceEvidence(query, chunks)) {
    return buildWalkInServiceResponse(query, chunks);
  }

  return 'Entendo sua preocupação. Para avaliação clínica no Centro Veterinário Guarapiranga, o atendimento é por ordem de chegada e não precisa de agendamento. Você pode ir diretamente à unidade para que a equipe avalie o pet. Se houver sinais de emergência, como sangue, apatia intensa, dificuldade para respirar, vômitos contínuos ou piora rápida, procure atendimento imediato.';
}

export function hasSchedulingPolicyEvidence(chunks: KnowledgeChunk[]): boolean {
  return chunks.some((chunk) => {
    const content = normalize(chunk.content);
    return SCHEDULING_POLICY_PATTERN.test(content) && !WALK_IN_SERVICE_PATTERN.test(content);
  });
}

export function containsSchedulingProposal(text: string): boolean {
  return SCHEDULING_PROPOSAL_PATTERN.test(text);
}

export function isServiceAvailabilityQuery(query: string): boolean {
  const normalizedQuery = normalize(query);
  return SERVICE_AVAILABILITY_QUERY_PATTERN.test(normalizedQuery)
    && SERVICE_TERM_PATTERN.test(normalizedQuery);
}

export function isSchedulingRequest(query: string): boolean {
  return SCHEDULING_REQUEST_PATTERN.test(normalize(query));
}

export function buildServiceAvailabilityResponse(query: string, chunks: KnowledgeChunk[]): string {
  const normalizedQuery = normalize(query);
  const offeredServices: string[] = [];

  if (/\b(?:exames?|sangue)\b/.test(normalizedQuery)) {
    offeredServices.push('exames de sangue');
  }
  if (/\b(?:raio\s*-?\s*x|rx)\b/.test(normalizedQuery)) {
    offeredServices.push('raio-x');
  }
  if (/\bultrass(?:om|onografia)\b/.test(normalizedQuery)) {
    offeredServices.push('ultrassonografia');
  }

  const evidenceText = normalize(chunks.map((chunk) => chunk.content).join('\n'));
  const confirmedServices = offeredServices.filter((service) => normalize(service).split(/\s+/).some((term) =>
    term.length > 2 && evidenceText.includes(term)
  ));

  const serviceText = confirmedServices.length > 0
    ? confirmedServices.join(', ').replace(/, ([^,]*)$/, ' e $1')
    : 'esse serviço';

  return `Sim, o Centro Veterinário Guarapiranga realiza ${serviceText}. Para preparo, disponibilidade e forma de atendimento, um atendente pode confirmar os detalhes sem gerar informação incorreta sobre agenda.`;
}

function relevantOperationalLines(chunks: KnowledgeChunk[]): string[] {
  const lines: string[] = [];

  for (const chunk of chunks) {
    for (const rawLine of chunk.content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (
        line
        && HOURS_EVIDENCE_PATTERN.test(line)
        && !INTERNAL_HOURS_NOTE_PATTERN.test(line)
        && extractPrices(line).length === 0
      ) {
        lines.push(line);
      }
    }
  }

  return Array.from(new Set(lines)).slice(0, 10);
}
