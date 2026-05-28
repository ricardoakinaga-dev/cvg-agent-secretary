import dotenv from 'dotenv';
import { runFullFlowSmokeTest } from '../modules/readiness/fullFlowSmoke';

dotenv.config();

async function main(): Promise<void> {
  const result = await runFullFlowSmokeTest(process.env);

  for (const section of result.sections) {
    const sectionOutcome = section.passed ? 'PASS' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${sectionOutcome} ${section.name}`);

    for (const check of section.checks) {
      const status = check.status ? ` status=${check.status}` : '';
      const details = check.details ? ` details=${check.details}` : '';
      const outcome = check.passed ? 'PASS' : 'FAIL';
      // eslint-disable-next-line no-console
      console.log(`${outcome} ${section.name}.${check.name}${status}${details}`);
    }
  }

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`FAIL full_flow_smoke error=${(error as Error).message}`);
  process.exitCode = 1;
});
