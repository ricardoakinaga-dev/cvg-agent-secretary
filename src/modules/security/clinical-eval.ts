import { checkGuardrails, checkResponseGuardrails } from './guardrails';

export const CLINICAL_EVAL_CATEGORIES = [
  'diagnosis',
  'prescription',
  'prognosis',
  'emergency',
  'paraphrase',
  'jailbreak',
  'exfiltration',
  'tool_injection',
] as const;

export type ClinicalEvalCategory = typeof CLINICAL_EVAL_CATEGORIES[number];
export type ClinicalEvalSurface = 'input' | 'response' | 'tool_output';
export type ClinicalEvalDecision = 'allow' | 'clinical_redirect' | 'handoff' | 'block';

export interface ClinicalEvalCase {
  id: string;
  category: ClinicalEvalCategory;
  surface: ClinicalEvalSurface;
  text: string;
  expected: ClinicalEvalDecision;
}

export interface ClinicalEvalThresholds {
  overall: number;
  byCategory: Record<ClinicalEvalCategory, number>;
}

export interface ClinicalEvalDataset {
  datasetVersion: string;
  description: string;
  thresholds: ClinicalEvalThresholds;
  cases: ClinicalEvalCase[];
}

export interface ClinicalEvalFailure {
  id: string;
  category: ClinicalEvalCategory;
  expected: ClinicalEvalDecision;
  actual: ClinicalEvalDecision;
}

export interface ClinicalEvalCategoryResult {
  total: number;
  correct: number;
  accuracy: number;
  threshold: number;
  passed: boolean;
}

export interface ClinicalEvalResult {
  datasetVersion: string;
  passed: boolean;
  total: number;
  correct: number;
  accuracy: number;
  threshold: number;
  byCategory: Record<ClinicalEvalCategory, ClinicalEvalCategoryResult>;
  failures: ClinicalEvalFailure[];
}

const SURFACES = new Set<ClinicalEvalSurface>(['input', 'response', 'tool_output']);
const DECISIONS = new Set<ClinicalEvalDecision>(['allow', 'clinical_redirect', 'handoff', 'block']);
const CATEGORIES = new Set<ClinicalEvalCategory>(CLINICAL_EVAL_CATEGORIES);

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Validate a versioned evaluation dataset before executing security code with it.
 */
export function assertClinicalEvalDataset(dataset: unknown): asserts dataset is ClinicalEvalDataset {
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('Dataset clínico inválido');
  }

  const candidate = dataset as Partial<ClinicalEvalDataset>;
  if (typeof candidate.datasetVersion !== 'string' || candidate.datasetVersion.trim() === '') {
    throw new Error('Versão do dataset clínico é obrigatória');
  }
  if (!candidate.thresholds || !isUnitInterval(candidate.thresholds.overall)) {
    throw new Error('Threshold geral deve estar entre 0 e 1');
  }

  for (const category of CLINICAL_EVAL_CATEGORIES) {
    if (!isUnitInterval(candidate.thresholds.byCategory?.[category])) {
      throw new Error(`Threshold da categoria ${category} deve estar entre 0 e 1`);
    }
  }

  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0) {
    throw new Error('Dataset clínico deve conter ao menos um caso');
  }

  const ids = new Set<string>();
  for (const item of candidate.cases) {
    if (!item || typeof item !== 'object') {
      throw new Error('Caso clínico inválido');
    }
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      throw new Error('Todo caso clínico deve ter id');
    }
    if (ids.has(item.id)) {
      throw new Error(`Id de caso duplicado: ${item.id}`);
    }
    ids.add(item.id);

    if (!CATEGORIES.has(item.category)) {
      throw new Error(`Categoria inválida no caso ${item.id}`);
    }
    if (!SURFACES.has(item.surface)) {
      throw new Error(`Superfície inválida no caso ${item.id}`);
    }
    if (!DECISIONS.has(item.expected)) {
      throw new Error(`Decisão esperada inválida no caso ${item.id}`);
    }
    if (typeof item.text !== 'string' || item.text.trim() === '') {
      throw new Error(`Texto vazio no caso ${item.id}`);
    }
  }
}

function decisionForCase(item: ClinicalEvalCase): ClinicalEvalDecision {
  const result = item.surface === 'response'
    ? checkResponseGuardrails(item.text)
    : checkGuardrails(item.text);

  if (result.action === 'handoff') {
    return 'handoff';
  }
  if (!result.allowed || result.action === 'block') {
    return 'block';
  }
  if (result.reason === 'Conteúdo clínico detectado') {
    return 'clinical_redirect';
  }
  return 'allow';
}

/**
 * Run the local, deterministic guardrails against the versioned clinical dataset.
 */
export function evaluateClinicalDataset(dataset: ClinicalEvalDataset): ClinicalEvalResult {
  assertClinicalEvalDataset(dataset);

  const failures: ClinicalEvalFailure[] = [];
  const counts = Object.fromEntries(CLINICAL_EVAL_CATEGORIES.map((category) => [
    category,
    { total: 0, correct: 0 },
  ])) as Record<ClinicalEvalCategory, { total: number; correct: number }>;

  let correct = 0;
  for (const item of dataset.cases) {
    const actual = decisionForCase(item);
    counts[item.category].total += 1;
    if (actual === item.expected) {
      correct += 1;
      counts[item.category].correct += 1;
    } else {
      failures.push({
        id: item.id,
        category: item.category,
        expected: item.expected,
        actual,
      });
    }
  }

  const byCategory = Object.fromEntries(CLINICAL_EVAL_CATEGORIES.map((category) => {
    const count = counts[category];
    const accuracy = count.total === 0 ? 1 : count.correct / count.total;
    const threshold = dataset.thresholds.byCategory[category];
    return [category, {
      ...count,
      accuracy,
      threshold,
      passed: accuracy >= threshold,
    }];
  })) as Record<ClinicalEvalCategory, ClinicalEvalCategoryResult>;

  const accuracy = correct / dataset.cases.length;
  return {
    datasetVersion: dataset.datasetVersion,
    passed: accuracy >= dataset.thresholds.overall
      && CLINICAL_EVAL_CATEGORIES.every((category) => byCategory[category].passed),
    total: dataset.cases.length,
    correct,
    accuracy,
    threshold: dataset.thresholds.overall,
    byCategory,
    failures,
  };
}
