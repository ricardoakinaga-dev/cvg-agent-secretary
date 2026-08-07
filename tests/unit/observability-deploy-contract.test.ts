import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const monitoring = resolve('deploy/monitoring');

interface AlertRule {
  alert?: string;
  record?: string;
  expr: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

function rules(file: string): AlertRule[] {
  const parsed = YAML.parse(readFileSync(resolve(monitoring, file), 'utf8')) as {
    groups: Array<{ rules: AlertRule[] }>;
  };
  return parsed.groups.flatMap((group) => group.rules);
}

describe('production observability deployment contract', () => {
  it('discovers every pod, uses short-lived OAuth2 and mTLS, and bounds labels', () => {
    const scrape = YAML.parse(
      readFileSync(resolve(monitoring, 'prometheus-scrape.example.yml'), 'utf8')
    ) as { scrape_configs: Array<Record<string, any>> };
    const job = scrape.scrape_configs[0];

    expect(job.kubernetes_sd_configs).toContainEqual(expect.objectContaining({ role: 'pod' }));
    expect(job.oauth2).toEqual(expect.objectContaining({
      client_secret_file: expect.any(String),
      token_url: expect.stringMatching(/^https:/),
    }));
    expect(job.authorization).toBeUndefined();
    expect(job.tls_config).toEqual(expect.objectContaining({
      ca_file: expect.any(String),
      cert_file: expect.any(String),
      key_file: expect.any(String),
    }));
    expect(job.label_limit).toBeLessThanOrEqual(20);
    expect(JSON.stringify(job.metric_relabel_configs)).toMatch(/tenant_id/);
  });

  it('aggregates process metrics across replicas and deduplicates shared Redis gauges', () => {
    const recording = rules('prometheus-recording-rules.yml');
    const serialized = JSON.stringify(recording);

    expect(serialized).toContain('sum without(instance, pod');
    expect(serialized).toContain('max without(instance, pod) (webhook_queue_depth');
    expect(serialized).toContain('rate(webhook_processing_total[5m])');
    expect(serialized).toContain('histogram_quantile(0.95');
    expect(serialized).toContain('webhook_processing_duration_seconds_bucket');
    expect(serialized).not.toContain('sum without(instance, pod) (webhook_queue_depth');
  });

  it('defines owners, severity and runbooks for every alert class', () => {
    const alertRules = rules('prometheus-alerts.yml').filter((rule) => rule.alert);
    const names = alertRules.map((rule) => rule.alert);

    expect(names).toEqual(expect.arrayContaining([
      'CvgWebhookQueueAgeHigh',
      'CvgWebhookDeadLettered',
      'CvgWebhookProcessingErrorRateHigh',
      'CvgResponseLatencyHigh',
      'CvgHandoffRateHigh',
      'CvgDependencyUnavailable',
      'CvgWebhookSloFastBurn',
    ]));
    for (const rule of alertRules) {
      expect(rule.labels?.owner, rule.alert).toMatch(/^(platform|backend|operations|ai|privacy)$/);
      expect(rule.labels?.severity, rule.alert).toMatch(/^(warning|critical)$/);
      expect(rule.annotations?.runbook, rule.alert).toMatch(/^docs\/\d+_/);
      expect(rule.annotations?.summary, rule.alert).toBeTruthy();
    }
  });

  it('has Prometheus-native firing tests for every required operational signal', () => {
    const ruleTests = YAML.parse(
      readFileSync(resolve(monitoring, 'prometheus-rules.test.yml'), 'utf8')
    ) as { tests: Array<{ alert_rule_test: Array<{ alertname: string }> }> };
    const alertNames = ruleTests.tests.flatMap((test) => (
      test.alert_rule_test.map(({ alertname }) => alertname)
    ));

    expect(alertNames).toEqual(expect.arrayContaining([
      'CvgWebhookQueueAgeHigh',
      'CvgWebhookDeadLettered',
      'CvgWebhookProcessingErrorRateHigh',
      'CvgResponseLatencyHigh',
      'CvgHandoffRateHigh',
      'CvgDependencyUnavailable',
      'CvgWebhookSloFastBurn',
    ]));
  });

  it('publishes explicit 30-day objectives and multi-window error-budget burn', () => {
    const sloRules = rules('prometheus-slo-rules.yml');
    const records = sloRules.map((rule) => rule.record);

    expect(records).toEqual(expect.arrayContaining([
      'cvg:slo_webhook_success_ratio:rate30d',
      'cvg:slo_response_latency_compliance:rate30d',
      'cvg:slo_queue_age_compliance:rate30d',
      'cvg:slo_webhook_error_budget_burn:rate1h',
      'cvg:slo_webhook_error_budget_burn:rate6h',
    ]));
    for (const rule of sloRules) {
      expect(Number(rule.labels?.objective)).toBeGreaterThan(0);
      expect(Number(rule.labels?.objective)).toBeLessThanOrEqual(1);
      expect(rule.labels?.owner).toMatch(/^(backend|platform)$/);
    }
  });

  it('ships a dashboard covering replicas, queue, DLQ, latency, handoff and SLOs', () => {
    const dashboard = JSON.parse(
      readFileSync(resolve(monitoring, 'grafana-dashboard.json'), 'utf8')
    ) as { panels: Array<{ title: string; targets: Array<{ expr: string }> }> };
    const queries = dashboard.panels.flatMap((panel) => panel.targets.map(({ expr }) => expr));
    const serialized = JSON.stringify({ titles: dashboard.panels.map(({ title }) => title), queries });

    for (const expected of ['up{', 'queue_depth', 'dead_letter', 'duration_seconds', 'handoff', 'slo_']) {
      expect(serialized).toContain(expected);
    }
    expect(serialized).not.toMatch(/tenant_id|contact_id|conversation_id|correlation_id/);
  });
});
