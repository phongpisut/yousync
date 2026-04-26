# YouSync

Watch YouTube together with friends. No server, no backend, no accounts. Just a seed, an offset, and the current time.

## How it works

Instead of guessing when a YouTube live stream started, **YouSync** captures a moment in wall-clock time and maps it to a position in the video. Everyone runs the same formula independently:

```
targetTime = baseOffset + (currentWallClock - seed) / 1000
```

- **Seed** — Unix timestamp (ms) when someone clicked "Start Sync"
- **Offset** — Seconds into the video at that exact moment
- **Current Wall Clock** — `Date.now()` (calibrated via a free public time API)

## Quick Start

> **Wait for sync calibration on first load.**
> On first visit (or after clearing cache), YouSync calls `worldtimeapi.org` in the background to calibrate your device clock. You won't see a loading spinner—just wait a couple of seconds after the page loads before creating or joining a seed, especially if the calibration request is slow. The app works without it, but syncing accuracy is best once calibration finishes.
>
> **Note:** If the time API is unreachable or under heavy load, YouSync silently falls back to your device's local clock. For small groups this is usually fine (drift within a few seconds). For massive traffic, consider using your own time endpoint or a CDN-hosted timestamp.

### 1. Create a sync point

1. Open the app.
2. Paste a YouTube URL (e.g. `youtube.com/live/xxxx` or any video link).
3. Click **Create New Seed**.
4. The player loads. Seek to where you want the group to start watching.
5. Click **Start Sync From Here**.
6. The app captures `seed = Date.now()` and `offset = currentTime`, generates a shareable link, and starts the sync loop.

### 2. Share the link

A shareable link is automatically generated in the URL hash and displayed at the bottom of the page. Example:

```
https://yourname.github.io/yousync#v=VIDEO_ID&s=1714147200000&o=125&l=1
```

Copy it and send it to your friends.

### 3. Join a sync point

Your friends open the link. The app parses the hash, calibrates its clock, seeks to the correct calculated time, and runs a background sync loop every 2 seconds to correct any drift.

Even if someone joins 10 minutes late, they land exactly where everyone else is watching.

## URL Parameters

| Param | Meaning                                                  |
|-------|----------------------------------------------------------|
| `v`   | YouTube video ID                                         |
| `s`   | Seed timestamp (Unix ms)                                |
| `o`   | Base offset in seconds (video position when seed created)|
| `l`   | Optional flag indicating a live stream                   |

## Clock Calibration

Devices can have slightly different system clocks. YouSync calls `worldtimeapi.org` once on load to calibrate `Date.now()` within ~100ms. This keeps multiple devices in sync without any server infrastructure.

> **Scalability note:** `worldtimeapi.org` is a free public service and cannot handle massive traffic (e.g. 1M+ users). If it is rate-limited or down, the app **gracefully degrades** to the local device clock, which is accurate enough for most small-group syncing. For high-traffic production deployments, replace the `fetch` URL in `src/lib/sync.ts` with your own lightweight time endpoint or a CDN-hosted Unix timestamp.

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Type-check
npm run check

# Production build
npm run build
```

## Deploy to GitHub Pages

This project is a static site, so it can be hosted on any CDN or static host. For GitHub Pages:

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Choose **GitHub Actions** as the source.
4. The included workflow (`.github/workflows/deploy.yml`) will automatically build and deploy on every push to `main`.

## Live Stream Edge Protection

For live streams, the sync algorithm stays up to 10 seconds behind the live edge to avoid buffering issues.

## Edge Cases Handled

- **Join before seed time** — Countdown overlay, auto-starts when the seed time arrives.
- **Join after stream ended** — The sync loop continues; users can watch on-demand if the video is still available.
- **Mobile autoplay blocked** — Playback starts muted by default.
- **Tab backgrounded** — Forces a resync as soon as the tab becomes visible again.
- **Negative offset** — Clamped to 0.

## Tech Stack

- [Svelte 5](https://svelte.dev/)
- [Vite](https://vitejs.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)

## License

MIT
