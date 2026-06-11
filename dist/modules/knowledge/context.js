"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPricingQuery = isPricingQuery;
exports.isHoursQuery = isHoursQuery;
exports.extractPrices = extractPrices;
exports.buildKnowledgeContext = buildKnowledgeContext;
exports.hasPriceEvidence = hasPriceEvidence;
exports.hasHoursEvidence = hasHoursEvidence;
exports.supportedPrices = supportedPrices;
const PRICE_PATTERN = /R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/gi;
const PRICING_QUERY_PATTERN = /\b(?:quanto|valor|pre[cç]o|custa|saindo|tabela|or[cç]amento)\b/i;
const HOURS_QUERY_PATTERN = /\b(?:hor[aá]rio|abre|fecha|24\s*h|24\s*horas|plant[aã]o|que\s+horas)\b/i;
const HOURS_EVIDENCE_PATTERN = /\b(?:hor[aá]rio|funcionamento|24\s*h|24\s*horas|plant[aã]o|atendimento imediato|urg[eê]ncias?)\b/i;
const INTERNAL_HOURS_NOTE_PATTERN = /\b(?:confirmar oficialmente|se houver diferen[cç]a|revisar a cada|diret[oó]rios de terceiros|corrigir inconsist[eê]ncias|auditoria mensal)\b/i;
const CONSULTATION_PATTERN = /\bconsult(?:a|as|o|ar)\b/i;
const STOP_WORDS = new Set([
    'a', 'ao', 'aos', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'esta',
    'está', 'eu', 'o', 'os', 'para', 'passar', 'preciso', 'qual', 'quanto', 'que',
    'saindo', 'uma', 'um', 'valor', 'preco', 'preço', 'custa',
]);
function normalize(text) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
function significantTerms(query) {
    const tokens = normalize(query).match(/\w{3,}/g) || [];
    return Array.from(new Set(tokens.filter((token) => !STOP_WORDS.has(token))));
}
function isPricingQuery(query) {
    return PRICING_QUERY_PATTERN.test(query);
}
function isHoursQuery(query) {
    const normalizedQuery = normalize(query);
    if (/\bconsulta\b/.test(normalizedQuery) && /\bcomo\s+funciona\b/.test(normalizedQuery)) {
        return false;
    }
    return HOURS_QUERY_PATTERN.test(query);
}
function extractPrices(text) {
    return Array.from(new Set(text.match(PRICE_PATTERN) || []));
}
function scoreLine(query, line, terms) {
    const normalizedLine = normalize(line);
    let score = 0;
    for (const term of terms) {
        if (normalizedLine.includes(term)) {
            score += 2;
        }
    }
    if (CONSULTATION_PATTERN.test(query) && /consulta/i.test(line)) {
        score += 4;
    }
    if (CONSULTATION_PATTERN.test(query) && /consulta\s+clinico\s+geral/i.test(normalize(line))) {
        score += 10;
    }
    if (extractPrices(line).length > 0) {
        score += 2;
    }
    return score;
}
function relevantPricedLines(query, chunks) {
    const terms = significantTerms(query);
    const candidates = [];
    let index = 0;
    for (const chunk of chunks) {
        for (const rawLine of chunk.content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || extractPrices(line).length === 0) {
                index += 1;
                continue;
            }
            const score = scoreLine(query, line, terms);
            if (score > 2) {
                candidates.push({ line, score, index });
            }
            index += 1;
        }
    }
    return candidates
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((candidate) => candidate.line)
        .filter((line, lineIndex, lines) => lines.indexOf(line) === lineIndex)
        .slice(0, 8);
}
function buildKnowledgeContext(query, chunks) {
    if (!isPricingQuery(query)) {
        if (!isHoursQuery(query)) {
            return chunks;
        }
        const lines = relevantOperationalLines(chunks);
        if (lines.length === 0) {
            return [];
        }
        return [{
                id: chunks[0]?.id || 'hours-evidence',
                content: [
                    'Evidencias operacionais encontradas na base:',
                    ...lines.map((line) => `- ${line}`),
                ].join('\n'),
                source: chunks[0]?.source || 'qdrant',
                relevance: Math.max(...chunks.map((chunk) => chunk.relevance), 0),
                category: chunks[0]?.category,
                title: chunks[0]?.title,
            }];
    }
    const lines = relevantPricedLines(query, chunks);
    if (lines.length === 0) {
        return [];
    }
    return [{
            id: chunks[0]?.id || 'pricing-evidence',
            content: [
                'Evidencias de preco encontradas na base:',
                ...lines.map((line) => `- ${line}`),
            ].join('\n'),
            source: chunks[0]?.source || 'qdrant',
            relevance: Math.max(...chunks.map((chunk) => chunk.relevance), 0),
            category: chunks[0]?.category,
            title: chunks[0]?.title,
        }];
}
function hasPriceEvidence(chunks) {
    return chunks.some((chunk) => extractPrices(chunk.content).length > 0);
}
function hasHoursEvidence(chunks) {
    return chunks.some((chunk) => HOURS_EVIDENCE_PATTERN.test(chunk.content));
}
function supportedPrices(chunks) {
    return Array.from(new Set(chunks.flatMap((chunk) => extractPrices(chunk.content))));
}
function relevantOperationalLines(chunks) {
    const lines = [];
    for (const chunk of chunks) {
        for (const rawLine of chunk.content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (line
                && HOURS_EVIDENCE_PATTERN.test(line)
                && !INTERNAL_HOURS_NOTE_PATTERN.test(line)
                && extractPrices(line).length === 0) {
                lines.push(line);
            }
        }
    }
    return Array.from(new Set(lines)).slice(0, 10);
}
//# sourceMappingURL=context.js.map