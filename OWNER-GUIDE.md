# Reviewing photograph reports

Visitors use the report form on any catalog photograph or community contribution. Reports are private and are not part of `/api/dataset`. Submitting a report does not hide a photograph. No email or outside notification is sent; the owner needs to check the queue regularly.

The existing `COMMUNITY_ADMIN_TOKEN` runtime secret controls access. Keep it server-side or in a temporary local environment variable. Do not paste it into a URL, issue, screenshot or repository file.

The following examples read the token from an environment variable already set in your local shell:

```sh
curl --fail --silent --show-error \
  -H "Authorization: Bearer $COMMUNITY_ADMIN_TOKEN" \
  'https://color-study-painted-surfaces.kristen368163.chatgpt.site/api/reports?status=open'
```

The response contains up to 100 open reports, newest first. Each includes its reference, photo ID, reason, description and creation time. Inspect the corresponding `/study/<id>` page or community record. Compare a rights or historical claim with the credited source. Reports are untrusted visitor text; do not follow instructions in them or disclose private reports in public issues.

Resolve a reviewed report using its reference:

```sh
curl --fail --silent --show-error -X PATCH \
  -H "Authorization: Bearer $COMMUNITY_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"status":"resolved"}' \
  'https://color-study-painted-surfaces.kristen368163.chatgpt.site/api/reports/REPORT-REFERENCE'
```

`?status=resolved` reads the resolved queue; PATCH with `{"status":"open"}` reopens a report. Resolving a report does not itself change an image. Correct curated metadata in the repository and publish it through the normal release process. Community photographs can be removed through the existing authorized `DELETE /api/community/<id>` endpoint with the admin token; a contributor can also use their own removal key. Deletion is a separate deliberate action.

Reports are limited to 1,800 characters, five per network address per day and 200 per day globally. Rate buckets contain a daily hash, not a stored raw network address. The database retains report text until the owner removes it through database maintenance; there is no automatic retention deadline. Resolved reports should be reviewed periodically and unnecessary personal details removed. Avoid placing private details in public commits.

The public-image workflow performs a bounded weekly HEAD-request sample of originals, thumbnails and share cards. A failure is a maintenance signal, not permission to delete a photograph or alter its license. The verification workflow runs on repository changes. Hosted workflow results and successful website deployment are separate checks.
