import type { ComplaintIndicator, FinancialPattern, UrgencyIndicator } from './types';

/**
 * Urgency indicators that trigger immediate handoff
 * Based on specs/10_SECURITY_AND_GUARDRAILS.md
 */
export const URGENCY_INDICATORS: UrgencyIndicator[] = [
  // Critical - immediate handoff
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal|dog|cat)\s+(?:não\s+)?(?:consegue\s+)?respirar/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - dificuldade respiratória',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:comeu|ingeriu|engoliu)\s+(?:veneno|rato|toxina|poison)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - suspeita de envenenamento',
    riskLevel: 'high',
  },
  {
    pattern: /(?:pet|cachorro|gato|animal).{0,30}(?:foi\s+)?atropelad[oa]|atropelaram\s+(?:meu|minha|o|a)\s+(?:pet|cachorro|gato|animal)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - atropelamento',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:teve|está\s+tendo)\s+convulsão/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - convulsão',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:está\s+)?sangrando\s+(?:muito|demais)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - sangramento intenso',
    riskLevel: 'high',
  },
  {
    pattern: /(?:não|nao)\s+(?:est[áa]\s+)?respirando\s+(?:direito|bem)|respira[cç][aã]o\s+(?:ruim|fraca|dif[ií]cil)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - dificuldade respiratória',
    riskLevel: 'high',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:não\s+)?(?:consegue|mover|levantar)\s+andar/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - não consegue andar',
    riskLevel: 'high',
  },
  {
    pattern: /(?:pet|cachorro|gato|animal|gato|cachorro).{0,40}(?:morrendo|morrer|morreu|desfalec(?:eu|ido)|muito\s+fraco|fraqueza\s+extrema)|(?:morrendo|morrer|morreu|desfalec(?:eu|ido)|muito\s+fraco|fraqueza\s+extrema).{0,40}(?:pet|cachorro|gato|animal)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica - paciente muito fraco ou em risco de vida',
    riskLevel: 'high',
  },
  {
    pattern: /(?:pet|cachorro|gato|animal)\s+(?:em\s+)?emergência|urgência\s+(?:veterinária|do|para)/i,
    priority: 'critical',
    requiresHandoff: true,
    handoffReason: 'Emergência clínica identificada',
    riskLevel: 'high',
  },
  // High priority
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:não\s+)?(?:come|alimenta|coma)\s+(?:há|não\s+come)\s+\d+\s+dia/i,
    priority: 'high',
    requiresHandoff: true,
    handoffReason: 'Pet sem se alimentar por múltiplos dias',
    riskLevel: 'medium',
  },
  {
    pattern: /(?:meu|me|a) (?:pet|cachorro|gato|animal)\s+(?:muito|demais|forte)\s+(?:doente|doendo|dor)/i,
    priority: 'high',
    requiresHandoff: true,
    handoffReason: 'Pet muito doente identificado',
    riskLevel: 'medium',
  },
];
/**
 * Complaint indicators that may require handoff
 * Based on specs/02_AGENT_BEHAVIOR.md
 */
export const COMPLAINT_INDICATORS: ComplaintIndicator[] = [
  {
    pattern: /(?:quero|falei|falar)\s+com\s+(?:o|o|a)\s+responsável|gerente|supervisor|chefe/i,
    requiresHandoff: true,
    severity: 'high',
  },
  {
    pattern: /isso\s+é\s+(?:um\s+)?(?:absurdo|vergonha|desgraça)/i,
    requiresHandoff: true,
    severity: 'high',
  },
  {
    pattern: /vou\s+(?:procurar|buscar)\s+(?:os\s+)?(?:órgãos|procon|justiça|advogado)/i,
    requiresHandoff: true,
    severity: 'high',
  },
  {
    pattern: /(?:muito|demais)\s+(?:insatisfeito|triste|bravo|irritado)/i,
    requiresHandoff: true,
    severity: 'medium',
  },
  {
    pattern: /não\s+estou\s+aguentando\s+mais/i,
    requiresHandoff: true,
    severity: 'medium',
  },
  {
    pattern: /reclamação|reclamar|reclama/i,
    requiresHandoff: false, // Can handle initially
    severity: 'medium',
  },
];

/**
 * Sensitive financial patterns that may require handoff
 * Based on specs/08_HANDOFF_SYSTEM.md
 */
export const FINANCIAL_PATTERNS: FinancialPattern[] = [
  {
    pattern: /(?:não|não\s+tenho)\s+(?:como|condição)\s+pagar/i,
    requiresHandoff: true,
  },
  {
    pattern: /quero\s+(?:solicitar|pedir)\s+reembolso/i,
    requiresHandoff: true,
  },
  {
    pattern: /discussão\s+de\s+valor|preço\s+muito\s+caro|muito\s+caro/i,
    requiresHandoff: false, // Can handle with options first
  },
  {
    pattern: /desconto|promoção|oferta\s+especial/i,
    requiresHandoff: false, // Can try to help
  },
  {
    pattern: /parcelamento|parcelar/i,
    requiresHandoff: false, // Can offer options
  },
];

/**
 * Human agent request patterns
 */
export const HUMAN_REQUEST_PATTERNS: RegExp[] = [
  /quero\s+(?:falar|ser\s+atendido)\s+com\s+(?:humano|pessoa|atendente)/i,
  /mande\s+(?:um|uma)\s+(?:humano|pessoa|atendente)/i,
  /pode\s+chamar\s+(?:um|uma)\s+(?:atendente|humano)/i,
  /quero\s+falar\s+com\s+(?:humano|atendente)/i,
  /atendente\s+humano/i,
  /human[oa]/i,
];

/**
 * Greeting patterns
 */
export const GREETING_PATTERNS: RegExp[] = [
  /^olá|^oi|^bom\s+dia|^boa\s+tarde|^boa\s+noite|^ei|^eai|^hey/i,
  /^olá|^oi|^bom\s+dia|^boa\s+tarde|^boa\s+noite/,
  /tudo\s+bem|beleza|como\s+vai|como\s+está/i,
  /^[a-zA-Z]{1,3}$/, // Very short messages like "Oi", "Olá"
];

/**
 * Service inquiry patterns
 */
export const SERVICE_PATTERNS: RegExp[] = [
  /serviços?|o\s+que\s+vocês?\s+faz(?:em|em)?|quais?\s+serviços?/i,
  /(?:banho|banho\s+e\s+tosa|vacina|consulta|exame|cirurgia|emergência|internação)/i,
  /atendimento\s+(?:24h|emergência)/i,
];

/**
 * Hours of operation patterns
 */
export const HOURS_PATTERNS: RegExp[] = [
  /horário|horas?\s+de\s+atendimento|que\s+horas?|fecha\s+que\s+horas|abre\s+que\s+horas/i,
  /(?:segunda|terça|quarta|quinta|sexta|sábado|domingo)\s+(?:fech|abert)/i,
  /funciona\s+(?:de|nas?|em)\s+(?:que|qual)/i,
];

/**
 * Price inquiry patterns
 */
export const PRICE_PATTERNS: RegExp[] = [
  /preço|valor|custo|quanto\s+(?:custa|vai|cobram)|valor\s+da/i,
  /or[cç]amento|orçar|orcar|cobrar/i,
  /barato|caro|pesado/i,
];

/**
 * Scheduling patterns
 */
export const SCHEDULING_PATTERNS: RegExp[] = [
  /agend|marcar|reservar|horário\s+(?:disponív|para)/i,
  /(?:hoje|amanh[ãa]|segunda|terça|terca|quarta|quinta|sexta|s[áa]bado|sabado|domingo).{0,40}(?:\d{1,2}h|\d{1,2}:\d{2}|manh[ãa]|tarde|noite)/i,
  /(?:quinta|sexta|sábado|domingo|segunda|terça|quarta)\s+\d{1,2}/i,
  /(?:manhã|tarde|noite)\s+(?:de\s+)?(?:hoje|amanhã)/i,
];

export const SCHEDULING_FOLLOW_UP_PATTERNS: RegExp[] = [
  /(?:hoje|amanh[ãa]|segunda|terça|terca|quarta|quinta|sexta|s[áa]bado|sabado|domingo)/i,
  /\b\d{1,2}(?::\d{2})?\s*h?\b/i,
  /(?:manh[ãa]|tarde|noite)/i,
  /(?:prefiro|quero|pode\s+ser|por\s+volta)/i,
];

/**
 * Cancellation patterns
 */
export const CANCELLATION_PATTERNS: RegExp[] = [
  /cancel|desmarcar|remover\s+(?:a\s+)?(?:consulta|agendamento)/i,
  /não\s+(?:posso|vou|poder)\s+ir|mudar\s+de\s+ideia/i,
];

/**
 * Clinical question patterns
 */
export const CLINICAL_PATTERNS: RegExp[] = [
  /(?:meu|minha|o|a|ele|ela)\s+(?:pet|cachorro|cachorra|c[aã]o|gato|gata|animal)\s+(?:est[aá]|esta|t[aá]|tem|ficou|anda)\b/i,
  /(?:pet|cachorro|cachorra|c[aã]o|gato|gata|animal).{0,60}(?:doente|passar\s+(?:com\s+ele\s+|com\s+ela\s+)?em\s*n?consulta|consulta\s+cl[ií]nica)/i,
  /(?:doente|passar\s+(?:com\s+ele\s+|com\s+ela\s+)?em\s*n?consulta|consulta\s+cl[ií]nica).{0,60}(?:pet|cachorro|cachorra|c[aã]o|gato|gata|animal)/i,
  /o\s+que\s+(?:pode\s+ser|é|significa)/i,
  /dor|sintoma|tratamento|remédio|medicamento/i,
  /diarreia|diarr[eé]ia|v[oô]mit|enjoo|febre|tosse|tossindo|coceira|ferida|machucad[oa]|sangue|apatia|ap[aá]tico|fraco|man[cç]ando|parou\s+de\s+comer|n[aã]o\s+quer\s+comer|doente/i,
  /veterinári[oa]\s+pode|precisa\s+levar/i,
];
