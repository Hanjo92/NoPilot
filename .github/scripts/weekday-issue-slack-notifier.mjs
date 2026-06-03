import process from 'node:process';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const DEFAULT_TIME_ZONE = 'Asia/Seoul';
const DEFAULT_WORKFLOW_FILE = 'weekday-issue-slack-notifier.yml';
const DEFAULT_FALLBACK_LOOKBACK_HOURS = 24;
const MAX_SLACK_ISSUES = 20;

export function parsePositiveHours(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`ISSUE_NOTIFIER_LOOKBACK_HOURS must be a positive number, received "${value}".`);
  }

  return parsed;
}

export function resolveLookbackWindow({
  currentTime = new Date(),
  previousRunStartedAt = null,
  lookbackHours = null,
  fallbackHours = DEFAULT_FALLBACK_LOOKBACK_HOURS,
}) {
  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);
  if (Number.isNaN(now.getTime())) {
    throw new Error('currentTime must be a valid date.');
  }

  if (lookbackHours !== null) {
    return {
      startedAfter: new Date(now.getTime() - lookbackHours * 60 * 60 * 1000),
      source: `manual lookback override (${lookbackHours}h)`,
    };
  }

  if (previousRunStartedAt) {
    const previousRunDate = previousRunStartedAt instanceof Date
      ? previousRunStartedAt
      : new Date(previousRunStartedAt);

    if (Number.isNaN(previousRunDate.getTime())) {
      throw new Error(`Invalid previous run timestamp: "${previousRunStartedAt}".`);
    }

    return {
      startedAfter: previousRunDate,
      source: 'previous completed workflow run',
    };
  }

  return {
    startedAfter: new Date(now.getTime() - fallbackHours * 60 * 60 * 1000),
    source: `${fallbackHours}h fallback window`,
  };
}

export function filterNewIssues(issues, startedAfter) {
  const threshold = startedAfter instanceof Date ? startedAfter.getTime() : new Date(startedAfter).getTime();
  if (Number.isNaN(threshold)) {
    throw new Error('startedAfter must be a valid date.');
  }

  return issues.filter((issue) => {
    if (issue.pull_request) {
      return false;
    }

    const createdAt = new Date(issue.created_at).getTime();
    if (Number.isNaN(createdAt)) {
      return false;
    }

    return createdAt > threshold;
  });
}

function escapeSlackText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatTimestamp(value, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

function formatIssueLabels(labels) {
  const names = (labels ?? [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);

  return names.length > 0 ? names.join(', ') : 'none';
}

export function buildSlackPayload({
  repoFullName,
  issues,
  startedAfter,
  lookbackSource,
  timeZone = DEFAULT_TIME_ZONE,
  targetName = '',
}) {
  const visibleIssues = issues.slice(0, MAX_SLACK_ISSUES);
  const overflowCount = issues.length - visibleIssues.length;
  const summary = `${repoFullName}: ${issues.length} new issue${issues.length === 1 ? '' : 's'}`;
  const targetLine = targetName ? `Target: ${targetName}` : 'Target: configured Slack webhook destination';
  const windowLine = `Created after ${formatTimestamp(startedAfter, timeZone)} (${lookbackSource}).`;

  const textLines = [summary, targetLine, windowLine];
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${escapeSlackText(summary)}*\n${escapeSlackText(targetLine)}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: escapeSlackText(windowLine),
        },
      ],
    },
  ];

  for (const issue of visibleIssues) {
    const issueSummary = `<${issue.html_url}|#${issue.number}> ${escapeSlackText(issue.title)}`;
    const issueMeta = `created ${formatTimestamp(issue.created_at, timeZone)} by @${escapeSlackText(issue.user?.login ?? 'unknown')} | labels: ${escapeSlackText(formatIssueLabels(issue.labels))}`;
    textLines.push(`- #${issue.number} ${issue.title} (${issue.html_url})`);

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• ${issueSummary}\n${issueMeta}`,
      },
    });
  }

  if (overflowCount > 0) {
    const overflowLine = `${overflowCount} more issue${overflowCount === 1 ? '' : 's'} omitted from the Slack blocks view.`;
    textLines.push(overflowLine);
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: escapeSlackText(overflowLine),
        },
      ],
    });
  }

  return {
    text: textLines.join('\n'),
    blocks,
  };
}

async function githubGetJson({ token, path }) {
  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'nopilot-weekday-issue-slack-notifier',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed for ${path}: ${response.status} ${response.statusText}\n${body}`);
  }

  return response.json();
}

async function getPreviousCompletedRunStartedAt({ token, owner, repo, workflowFile }) {
  const data = await githubGetJson({
    token,
    path: `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?status=completed&per_page=1`,
  });

  return data.workflow_runs?.[0]?.run_started_at ?? null;
}

async function listIssuesCreatedSince({ token, owner, repo, startedAfter }) {
  const threshold = startedAfter.getTime();
  const issues = [];

  for (let page = 1; page <= 10; page += 1) {
    const pageIssues = await githubGetJson({
      token,
      path: `/repos/${owner}/${repo}/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`,
    });

    if (!Array.isArray(pageIssues) || pageIssues.length === 0) {
      break;
    }

    let reachedOlderIssue = false;
    for (const issue of pageIssues) {
      const createdAt = new Date(issue.created_at).getTime();
      if (Number.isNaN(createdAt)) {
        continue;
      }

      if (createdAt <= threshold) {
        reachedOlderIssue = true;
      }
    }

    issues.push(...filterNewIssues(pageIssues, startedAfter));

    if (reachedOlderIssue) {
      break;
    }
  }

  return issues;
}

async function postToSlack({ webhookUrl, payload }) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack webhook request failed: ${response.status} ${response.statusText}\n${body}`);
  }
}

async function appendStepSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  const { appendFile } = await import('node:fs/promises');
  await appendFile(summaryPath, `${lines.join('\n')}\n`);
}

async function main() {
  const repoFullName = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const webhookUrl = process.env.SLACK_ISSUE_WEBHOOK_URL;
  const workflowFile = process.env.ISSUE_NOTIFIER_WORKFLOW_FILE || DEFAULT_WORKFLOW_FILE;
  const timeZone = process.env.ISSUE_NOTIFIER_TIME_ZONE || DEFAULT_TIME_ZONE;
  const targetName = process.env.SLACK_ISSUE_TARGET_NAME || '';

  if (!repoFullName) {
    throw new Error('GITHUB_REPOSITORY is required.');
  }
  if (!token) {
    throw new Error('GITHUB_TOKEN is required.');
  }
  if (!webhookUrl) {
    throw new Error('SLACK_ISSUE_WEBHOOK_URL is required.');
  }

  const lookbackHours = parsePositiveHours(process.env.ISSUE_NOTIFIER_LOOKBACK_HOURS);
  const [owner, repo] = repoFullName.split('/');
  const previousRunStartedAt = await getPreviousCompletedRunStartedAt({ token, owner, repo, workflowFile });
  const { startedAfter, source } = resolveLookbackWindow({
    currentTime: new Date(),
    previousRunStartedAt,
    lookbackHours,
  });

  const issues = await listIssuesCreatedSince({ token, owner, repo, startedAfter });

  if (issues.length === 0) {
    const summaryLines = [
      '## Weekday Issue Slack Notifier',
      '',
      `No new GitHub issues were created after ${formatTimestamp(startedAfter, timeZone)} (${source}).`,
    ];
    console.log(summaryLines.at(-1));
    await appendStepSummary(summaryLines);
    return;
  }

  const payload = buildSlackPayload({
    repoFullName,
    issues,
    startedAfter,
    lookbackSource: source,
    timeZone,
    targetName,
  });

  await postToSlack({ webhookUrl, payload });

  const summaryLines = [
    '## Weekday Issue Slack Notifier',
    '',
    `Sent a Slack notification for ${issues.length} new GitHub issue${issues.length === 1 ? '' : 's'}.`,
    `Window start: ${formatTimestamp(startedAfter, timeZone)} (${source})`,
  ];
  console.log(summaryLines.slice(2).join('\n'));
  await appendStepSummary(summaryLines);
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
