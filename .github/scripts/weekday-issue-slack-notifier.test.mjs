import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildSlackPayload,
  filterNewIssues,
  parsePositiveHours,
  resolveLookbackWindow,
} from './weekday-issue-slack-notifier.mjs';

test('parsePositiveHours returns null for empty values', () => {
  assert.equal(parsePositiveHours(''), null);
  assert.equal(parsePositiveHours(undefined), null);
});

test('parsePositiveHours accepts positive numeric strings', () => {
  assert.equal(parsePositiveHours('24'), 24);
  assert.equal(parsePositiveHours('1.5'), 1.5);
});

test('parsePositiveHours rejects non-positive values', () => {
  assert.throws(() => parsePositiveHours('0'), /positive number/);
  assert.throws(() => parsePositiveHours('-2'), /positive number/);
});

test('resolveLookbackWindow prefers a manual override', () => {
  const currentTime = new Date('2026-06-04T00:00:00.000Z');
  const result = resolveLookbackWindow({
    currentTime,
    previousRunStartedAt: '2026-06-03T00:00:00.000Z',
    lookbackHours: 6,
  });

  assert.equal(result.source, 'manual lookback override (6h)');
  assert.equal(result.startedAfter.toISOString(), '2026-06-03T18:00:00.000Z');
});

test('resolveLookbackWindow uses the previous completed run when available', () => {
  const result = resolveLookbackWindow({
    currentTime: '2026-06-04T00:00:00.000Z',
    previousRunStartedAt: '2026-06-03T00:00:00.000Z',
  });

  assert.equal(result.source, 'previous completed workflow run');
  assert.equal(result.startedAfter.toISOString(), '2026-06-03T00:00:00.000Z');
});

test('resolveLookbackWindow falls back to 24 hours on the first run', () => {
  const result = resolveLookbackWindow({
    currentTime: '2026-06-04T00:00:00.000Z',
  });

  assert.equal(result.source, '24h fallback window');
  assert.equal(result.startedAfter.toISOString(), '2026-06-03T00:00:00.000Z');
});

test('filterNewIssues excludes pull requests and old issues', () => {
  const issues = [
    {
      number: 58,
      created_at: '2026-06-04T00:05:00.000Z',
    },
    {
      number: 57,
      created_at: '2026-06-03T23:59:59.000Z',
      pull_request: {},
    },
    {
      number: 56,
      created_at: '2026-06-02T23:59:59.000Z',
    },
  ];

  const filtered = filterNewIssues(issues, new Date('2026-06-03T00:00:00.000Z'));
  assert.deepEqual(
    filtered.map((issue) => issue.number),
    [58],
  );
});

test('buildSlackPayload includes the target name, window, and issue details', () => {
  const payload = buildSlackPayload({
    repoFullName: 'Hanjo92/NoPilot',
    issues: [
      {
        number: 58,
        title: 'Set up weekday Slack notification',
        html_url: 'https://github.com/Hanjo92/NoPilot/issues/58',
        created_at: '2026-06-04T00:05:00.000Z',
        user: { login: 'Hanjo92' },
        labels: [{ name: 'enhancement' }, { name: 'Todo' }],
      },
    ],
    startedAfter: new Date('2026-06-03T00:00:00.000Z'),
    lookbackSource: 'previous completed workflow run',
    timeZone: 'Asia/Seoul',
    targetName: '#github-alerts',
  });

  assert.match(payload.text, /Hanjo92\/NoPilot: 1 new issue/);
  assert.match(payload.text, /Target: #github-alerts/);
  assert.match(payload.text, /Set up weekday Slack notification/);
  assert.equal(payload.blocks.length, 3);
});

test('workflow source keeps the expected trigger and script wiring', () => {
  const workflowSource = readFileSync(
    new URL('../workflows/weekday-issue-slack-notifier.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflowSource, /cron:\s*"0 0 \* \* 1-5"/);
  assert.match(workflowSource, /workflow_dispatch:/);
  assert.match(workflowSource, /ISSUE_NOTIFIER_TIME_ZONE:\s*Asia\/Seoul/);
  assert.match(workflowSource, /SLACK_ISSUE_WEBHOOK_URL:\s*\$\{\{\s*secrets\.SLACK_ISSUE_WEBHOOK_URL\s*\}\}/);
  assert.match(workflowSource, /run:\s*node \.github\/scripts\/weekday-issue-slack-notifier\.mjs/);
});
