# Weekday Issue Slack Notifier

This repository now includes a scheduled GitHub Actions workflow that posts to Slack when new GitHub issues were created since the previous completed notifier run.

## Default Decisions

- Slack target: a shared Slack channel via `SLACK_ISSUE_WEBHOOK_URL`
- Schedule: weekdays at 09:00 `Asia/Seoul` (`0 0 * * 1-5` in GitHub Actions UTC cron)
- New issue criterion: non-PR issues with `created_at` later than the previous completed workflow run's `run_started_at`

The previous-run comparison means Monday's 09:00 run naturally includes issues opened over the weekend, and a failed weekday run does not lose issues because the next successful run still compares against the last completed run.

## Required Setup

Add this repository secret:

- `SLACK_ISSUE_WEBHOOK_URL`: Incoming webhook URL for the Slack channel that should receive issue notifications

Optional repository variable:

- `SLACK_ISSUE_TARGET_NAME`: Human-readable destination label to show in the Slack message, for example `#github-alerts`

## Manual Runs

The workflow also supports `workflow_dispatch`.

- Leave `lookback_hours` empty to use the same previous-completed-run logic as the scheduled job.
- Set `lookback_hours` to a positive number to backfill a manual window without editing the workflow file.

## Files

- Workflow: `.github/workflows/weekday-issue-slack-notifier.yml`
- Script: `.github/scripts/weekday-issue-slack-notifier.mjs`
- Script tests: `.github/scripts/weekday-issue-slack-notifier.test.mjs`
