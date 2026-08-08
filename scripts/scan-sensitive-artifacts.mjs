#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

const patterns = [
  { type: 'cpf', expression: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g },
  { type: 'cnpj', expression: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g },
  { type: 'email', expression: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'br_phone', expression: /(?:\+55\s*)?\(?\d{2}\)?[\s-]*9\d{4}[\s-]*\d{4}\b/g },
];

// CycloneDX includes third-party package attribution fields. Those fields can
// contain maintainer e-mails, which are dependency metadata rather than
// application/customer data. Keep scanning the rest of the SBOM while
// excluding only these explicitly classified attribution fields.
const SBOM_ATTRIBUTION_FIELDS = new Set([
  'author',
  'authors',
  'publisher',
  'supplier',
  'externalreferences',
]);

function usage() {
  console.error('Usage: npm run security:scan-artifacts -- <artifact-file> [more-files]');
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function scanValue(value, file, location, findings) {
  if (typeof value === 'string') {
    for (const pattern of patterns) {
      pattern.expression.lastIndex = 0;
      let match;
      while ((match = pattern.expression.exec(value)) !== null) {
        findings.push({
          file,
          location,
          type: pattern.type,
          fingerprint: digest(match[0]),
        });
        if (match[0].length === 0) pattern.expression.lastIndex += 1;
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValue(item, file, `${location}[${index}]`, findings));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (SBOM_ATTRIBUTION_FIELDS.has(key.toLowerCase())) continue;
      scanValue(item, file, `${location}.${key}`, findings);
    }
  }
}

function scanPlainText(file, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    scanValue(line, file, `line ${lineIndex + 1}`, findings);
  }
  return findings;
}

function scanFile(file) {
  const text = readFileSync(file, 'utf8');
  if (!file.endsWith('.cdx.json')) return scanPlainText(file, text);

  const document = JSON.parse(text);
  const findings = [];
  scanValue(document, file, '$', findings);
  return findings;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  usage();
  process.exitCode = 2;
} else {
  const findings = [];
  for (const file of files) {
    try {
      if (!statSync(file).isFile()) {
        throw new Error('not a regular file');
      }
      findings.push(...scanFile(file));
    } catch (error) {
      console.error(`Unable to scan ${file}: ${error.message}`);
      process.exitCode = 2;
    }
  }

  if (findings.length > 0) {
    console.error(`Sensitive artifact findings: ${findings.length}`);
    for (const finding of findings) {
      console.error(`${finding.file}:${finding.location} type=${finding.type} fingerprint=${finding.fingerprint}`);
    }
    process.exitCode = 1;
  } else if (!process.exitCode) {
    console.log(`Sensitive artifact scan passed for ${files.length} file(s).`);
  }
}
