"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFullFlowSmokeTest = runFullFlowSmokeTest;
const evolutionSmoke_1 = require("./evolutionSmoke");
const stagingSmoke_1 = require("./stagingSmoke");
async function runFullFlowSmokeTest(env, fetchImpl = fetch) {
    const agentOptions = (0, stagingSmoke_1.createSmokeOptionsFromEnv)(env);
    const evolutionOptions = (0, evolutionSmoke_1.createEvolutionSmokeOptionsFromEnv)(env);
    const [agentResult, evolutionResult] = await Promise.all([
        (0, stagingSmoke_1.runStagingSmokeTest)(agentOptions, fetchImpl),
        (0, evolutionSmoke_1.runEvolutionSmokeTest)(evolutionOptions, fetchImpl),
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
//# sourceMappingURL=fullFlowSmoke.js.map