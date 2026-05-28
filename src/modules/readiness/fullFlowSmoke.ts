import {
  createEvolutionSmokeOptionsFromEnv,
  runEvolutionSmokeTest,
} from './evolutionSmoke';
import {
  createSmokeOptionsFromEnv,
  runStagingSmokeTest,
} from './stagingSmoke';

export interface FullFlowSmokeResult {
  passed: boolean;
  sections: Array<{
    name: 'agent_chatwoot' | 'evolutionapi';
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      status?: number;
      details?: string;
    }>;
  }>;
}

type FetchLike = typeof fetch;

export async function runFullFlowSmokeTest(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike = fetch
): Promise<FullFlowSmokeResult> {
  const agentOptions = createSmokeOptionsFromEnv(env);
  const evolutionOptions = createEvolutionSmokeOptionsFromEnv(env);

  const [agentResult, evolutionResult] = await Promise.all([
    runStagingSmokeTest(agentOptions, fetchImpl),
    runEvolutionSmokeTest(evolutionOptions, fetchImpl),
  ]);

  return {
    passed: agentResult.passed && evolutionResult.passed,
    sections: [
      {
        name: 'agent_chatwoot',
        passed: agentResult.passed,
        checks: agentResult.checks,
      },
      {
        name: 'evolutionapi',
        passed: evolutionResult.passed,
        checks: evolutionResult.checks,
      },
    ],
  };
}
