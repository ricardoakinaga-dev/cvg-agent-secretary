"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEvolutionSmokeTest = runEvolutionSmokeTest;
exports.createEvolutionSmokeOptionsFromEnv = createEvolutionSmokeOptionsFromEnv;
function normalizeBaseUrl(url) {
    return url.replace(/\/$/, '');
}
async function readJsonOrText(response) {
    try {
        return JSON.stringify(await response.json());
    }
    catch {
        try {
            return await response.text();
        }
        catch {
            return '';
        }
    }
}
async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, {
            ...init,
            signal: controller.signal,
        });
    }
    finally {
        clearTimeout(timeout);
    }
}
function isConnectedPayload(payload) {
    try {
        const parsed = JSON.parse(payload);
        return (parsed.instance?.connectionStatus === 'open' ||
            parsed.instance?.state === 'open' ||
            parsed.state === 'open');
    }
    catch {
        return false;
    }
}
async function runEvolutionSmokeTest(options, fetchImpl = fetch) {
    const baseUrl = normalizeBaseUrl(options.evolutionApiUrl);
    const timeoutMs = options.timeoutMs || 10_000;
    const checks = [];
    try {
        const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/instance/connectionState/${options.whatsappInstance}`, {
            method: 'GET',
            headers: { apikey: options.evolutionApiKey },
        }, timeoutMs);
        const details = await readJsonOrText(response);
        checks.push({
            name: 'evolution_instance_connection',
            passed: response.ok && isConnectedPayload(details),
            status: response.status,
            details,
        });
    }
    catch (error) {
        checks.push({
            name: 'evolution_instance_connection',
            passed: false,
            details: error.message,
        });
    }
    if (options.sendTestMessage) {
        if (!options.testPhoneNumber) {
            checks.push({
                name: 'evolution_send_test_message',
                passed: false,
                details: 'TEST_WHATSAPP_NUMBER is required when SEND_EVOLUTION_TEST_MESSAGE=true',
            });
        }
        else {
            try {
                const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/message/sendText/${options.whatsappInstance}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: options.evolutionApiKey,
                    },
                    body: JSON.stringify({
                        number: options.testPhoneNumber,
                        text: options.testMessage || 'Teste automatico EvolutionAPI -> WhatsApp.',
                    }),
                }, timeoutMs);
                const details = await readJsonOrText(response);
                checks.push({
                    name: 'evolution_send_test_message',
                    passed: response.ok,
                    status: response.status,
                    details,
                });
            }
            catch (error) {
                checks.push({
                    name: 'evolution_send_test_message',
                    passed: false,
                    details: error.message,
                });
            }
        }
    }
    return {
        passed: checks.every((check) => check.passed),
        checks,
    };
}
function createEvolutionSmokeOptionsFromEnv(env) {
    const required = ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY', 'WHATSAPP_INSTANCE'];
    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) {
        throw new Error(`Missing Evolution smoke test environment variables: ${missing.join(', ')}`);
    }
    return {
        evolutionApiUrl: env.EVOLUTION_API_URL,
        evolutionApiKey: env.EVOLUTION_API_KEY,
        whatsappInstance: env.WHATSAPP_INSTANCE,
        testPhoneNumber: env.TEST_WHATSAPP_NUMBER,
        testMessage: env.EVOLUTION_TEST_MESSAGE,
        sendTestMessage: env.SEND_EVOLUTION_TEST_MESSAGE === 'true',
        timeoutMs: env.SMOKE_TIMEOUT_MS ? Number(env.SMOKE_TIMEOUT_MS) : undefined,
    };
}
//# sourceMappingURL=evolutionSmoke.js.map