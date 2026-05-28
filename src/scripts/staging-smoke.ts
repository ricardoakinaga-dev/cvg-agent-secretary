import dotenv from 'dotenv';
import {
  createSmokeOptionsFromEnv,
  runStagingSmokeTest,
} from '../modules/readiness/stagingSmoke';

dotenv.config();

async function main(): Promise<void> {
  const options = createSmokeOptionsFromEnv(process.env);
  const result = await runStagingSmokeTest(options);

  for (const check of result.checks) {
    const status = check.status ? ` status=${check.status}` : '';
    const details = check.details ? ` details=${check.details}` : '';
    const outcome = check.passed ? 'PASS' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${outcome} ${check.name}${status}${details}`);
  }

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`FAIL staging_smoke error=${(error as Error).message}`);
  process.exitCode = 1;
});
