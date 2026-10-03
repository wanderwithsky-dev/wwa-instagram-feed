// Reads the @wanderwithacademy feed from Behold, keeps only what the website
// shows, and writes feed.json. Run every hour by .github/workflows/refresh.yml.
//
// Behold's free plan allows 1,200 feed requests a month and pauses the account
// once that is exceeded, so this job is the ONLY thing that ever calls Behold:
// one request per run, no retries. A failed or odd-looking response never
// replaces feed.json, so the website keeps showing the last good copy.
//
// For a local dry run without calling Behold: BEHOLD_FEED_FILE=some.json node scripts/refresh.mjs

import { readFile, writeFile } from 'node:fs/promises'

const FILE = new URL('../feed.json', import.meta.url)
const MAX_POSTS = 6
const SIZES = ['small', 'medium', 'large']

// Fail the run (GitHub then emails the repo owner) only on the run at this
// UTC hour, and only once the feed hasn't been read for this long: at most
// one alert a day instead of one every hour.
const ALERT_HOUR_UTC = 6
const STALE_AFTER_HOURS = 26

/** Keep only what the website needs. Throws if nothing usable came back. */
function trim(behold) {
  if (!behold || !Array.isArray(behold.posts)) throw new Error('the response has no posts list')

  const posts = []
  for (const p of behold.posts) {
    const permalink = String(p.permalink ?? '')
    if (!permalink.startsWith('https://www.instagram.com/')) continue

    const images = {}
    for (const size of SIZES) {
      const url = p.sizes?.[size]?.mediaUrl
      if (typeof url === 'string' && url.startsWith('https://')) images[size] = url
    }
    if (!images.medium) continue

    const color = p.colorPalette?.dominant
    posts.push({
      id: String(p.id),
      permalink,
      type: permalink.includes('/reel/')
        ? 'reel'
        : p.mediaType === 'CAROUSEL_ALBUM'
          ? 'carousel'
          : p.mediaType === 'VIDEO'
            ? 'video'
            : 'image',
      timestamp: typeof p.timestamp === 'string' ? p.timestamp : null,
      likes: Number.isFinite(p.likeCount) ? p.likeCount : null,
      comments: Number.isFinite(p.commentsCount) ? p.commentsCount : null,
      color: typeof color === 'string' && /^\d{1,3},\d{1,3},\d{1,3}$/.test(color) ? color : null,
      images,
    })
    if (posts.length === MAX_POSTS) break
  }

  if (!posts.length) throw new Error('the response had no usable posts')
  return { username: typeof behold.username === 'string' ? behold.username : null, posts }
}

async function readBehold() {
  if (process.env.BEHOLD_FEED_FILE) {
    return JSON.parse(await readFile(process.env.BEHOLD_FEED_FILE, 'utf8'))
  }
  const url = process.env.BEHOLD_FEED_URL
  if (!url) throw new Error('the BEHOLD_FEED_URL secret is not set')
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Behold answered with status ${res.status}`)
  return res.json()
}

const now = new Date()
const previous = await readFile(FILE, 'utf8')
  .then(JSON.parse)
  .catch(() => null)

let fresh
try {
  fresh = trim(await readBehold())
} catch (err) {
  const lastGood = previous?.checkedAt ? new Date(previous.checkedAt) : null
  const hours = lastGood ? (now - lastGood) / 36e5 : Infinity
  console.log(
    `::warning::Could not read the Behold feed (${err.message}). Keeping the last good copy, last read ${lastGood?.toISOString() ?? 'never'}.`,
  )
  if (hours > STALE_AFTER_HOURS && now.getUTCHours() === ALERT_HOUR_UTC) {
    console.log(`::error::The Instagram feed has not updated for ${Math.round(hours)} hours. Check Behold.`)
    process.exit(1)
  }
  process.exit(0)
}

const changed = JSON.stringify(fresh.posts) !== JSON.stringify(previous?.posts)
// One check-in a day even when nothing changed: it shows the job is alive,
// and the commit keeps GitHub from switching off the hourly schedule.
const checkedToday = previous?.checkedAt?.slice(0, 10) === now.toISOString().slice(0, 10)

if (!changed && checkedToday) {
  console.log('No change since the last check.')
  process.exit(0)
}

const feed = {
  username: fresh.username,
  checkedAt: now.toISOString(),
  changedAt: changed ? now.toISOString() : previous.changedAt,
  posts: fresh.posts,
}
await writeFile(FILE, JSON.stringify(feed, null, 2) + '\n')
console.log(changed ? `Posts changed: saved ${feed.posts.length} posts.` : 'No change; saved the daily check-in.')
