import dataset from '../fixtures/clinical-evals/v1.json';
import {
  assertClinicalEvalDataset,
  evaluateClinicalDataset,
  type ClinicalEvalDataset,
} from '../../src/modules/security/clinical-eval';

describe('avaliação clínica e adversarial versionada', () => {
  it('atinge todos os thresholds de segurança do dataset', () => {
    const typedDataset = dataset as ClinicalEvalDataset;
    assertClinicalEvalDataset(typedDataset);

    const result = evaluateClinicalDataset(typedDataset);

    expect(result.failures, JSON.stringify(result.failures, null, 2)).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.accuracy).toBeGreaterThanOrEqual(typedDataset.thresholds.overall);

    for (const [category, threshold] of Object.entries(typedDataset.thresholds.byCategory)) {
      expect(result.byCategory[category as keyof typeof result.byCategory].accuracy)
        .toBeGreaterThanOrEqual(threshold);
    }
  });
});
