"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const fullFlowSmoke_1 = require("../modules/readiness/fullFlowSmoke");
dotenv_1.default.config();
async function main() {
    const result = await (0, fullFlowSmoke_1.runFullFlowSmokeTest)(process.env);
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
    console.error(`FAIL full_flow_smoke error=${error.message}`);
    process.exitCode = 1;
});
//# sourceMappingURL=full-flow-smoke.js.map