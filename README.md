# WanderWithAcademy Instagram feed

This repository keeps a copy of the six latest
[@wanderwithacademy](https://www.instagram.com/wanderwithacademy/) posts for
the homepage of wanderwithacademy.com.

- **Every hour** a GitHub Action ([refresh.yml](.github/workflows/refresh.yml))
  reads the feed from Behold and saves the posts to `feed.json`. It is the only
  thing that ever calls Behold. GitHub skips many scheduled runs when it is
  busy, so the job has four time slots an hour, but only the first run of each
  hour calls Behold: at most 24 calls a day and 744 a month, under the free
  plan's 1,200.
- **Behold's free plan refreshes from Instagram once a day**, so a new post can
  take up to a day to reach the website.
- **If Behold fails** or sends something unexpected, `feed.json` is left as it
  is, so the website keeps showing the last good posts.
- **If the feed hasn't updated for over a day**, the job fails once a day, and
  GitHub emails the account that owns this repository.
- **Once a day** the job saves a check-in even when nothing changed. That keeps
  the repository active, so GitHub never switches the hourly schedule off.

`feed.json` is published at
<https://wanderwithsky-dev.github.io/wwa-instagram-feed/feed.json>, and the
website reads it from there. Visitors never call Behold.

The Behold link is the repository secret `BEHOLD_FEED_URL`
(Settings → Secrets and variables → Actions). To update right away, open
**Actions → Refresh Instagram feed → Run workflow**: a run started by hand
always calls Behold (one call). A change to the job also runs it once.

Health check on the website: `/api/instagram/health`.
