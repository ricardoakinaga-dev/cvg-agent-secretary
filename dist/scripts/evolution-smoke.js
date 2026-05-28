"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const evolutionSmoke_1 = require("../modules/readiness/evolutionSmoke");
dotenv_1.default.config();
async function main() {
    const options = (0, evolutionSmoke_1.createEvolutionSmokeOptionsFromEnv)(process.env);
    const result = await (0, evolutionSmoke_1.runEvolutionSmokeTest)(options);
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
    console.error(`FAIL evolution_smoke error=${error.message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=evolution-smoke.js.map