Here's a complete client-side architecture. No server, no backend, no WebSocket — just a static HTML file you can host on GitHub Pages or Netlify.

---

## Core Idea: Anchor Sync

Instead of trying to guess when a YouTube live stream started, you capture a **moment in wall-clock time** and map it to a **position in the video**. Everyone calculates the same formula independently.

```
targetTime = baseOffset + (currentWallClock - seed)
```

- **Seed**: Unix timestamp (ms) — the exact moment your friend clicked "Start Sync"
- **Base Offset**: Seconds into the video at that exact moment
- **Current Wall Clock**: `Date.now()` (optionally corrected via a public time API)

---

## How It Works in Practice

**Your friend (User A):**
1. Opens the site, pastes `youtube.com/live/xxxx`
2. Player loads. They watch for a bit or seek to where they want the group to be.
3. Clicks **"Create Seed"** — app captures:
   - `seed = Date.now()` (e.g., `1714147200000`)
   - `offset = player.getCurrentTime()` (e.g., `125.5` seconds)
4. App generates a share link:
   ```
   https://yoursite.com/#v=xxxx&s=1714147200000&o=125
   ```
5. Friend sends you the link (or just tells you the seed + offset).

**You (User B):**
1. Open the link.
2. App parses `v`, `s`, `o` from the URL hash.
3. Calculates: `target = 125 + (Date.now() - 1714147200000) / 1000`
4. Seeks player to `target` and starts a sync loop.

Even if you join 10 minutes late, you jump to the exact same moment everyone else is watching.

---

## URL Format (Shareable Link)

Everything lives in the URL hash so nothing hits a server:

```
https://watchsync.pages.dev/#v=VIDEO_ID&s=SEED&o=OFFSET[&l=1]
```

| Param | Meaning |
|-------|---------|
| `v` | YouTube video ID |
| `s` | Seed timestamp (Unix ms) |
| `o` | Base offset in seconds (where the stream was when seed was created) |
| `l` | Optional flag indicating live stream (for UI logic) |

**Example:**
```
#v=dQw4w9WgXcQ&s=1714147200000&o=0&l=1
```

---

## Handling Live Streams Specifically

YouTube live with DVR allows `seekTo()` relative to stream start . The key insight: **you don't need to know the stream's actual start time.** You only need to know the offset *at a specific wall-clock time*.

**Live edge protection:**
```javascript
const LIVE_BUFFER = 10; // stay 10s behind edge to avoid buffering

function getTarget() {
  const elapsed = (Date.now() - seed) / 1000;
  let target = baseOffset + elapsed;
  
  // For live: don't seek past the current live edge
  const duration = player.getDuration(); // current stream length
  if (isLive && target > duration - LIVE_BUFFER) {
    target = duration - LIVE_BUFFER;
  }
  
  return target;
}
```

If the stream is 30 minutes in and your friend created the seed 5 minutes ago at the 25-minute mark, you join now and land at the 30-minute mark — exactly where they are.

---

## Clock Drift Fix (Still Client-Side)

Device clocks can drift. Fix it by calling a free public time API once on load:

```javascript
// Optional but recommended
async function calibrateTime() {
  try {
    const start = performance.now();
    const res = await fetch('https://worldtimeapi.org/api/ip');
    const data = await res.json();
    const rtt = performance.now() - start;
    const serverTime = new Date(data.utc_datetime).getTime() + (rtt / 2);
    window.timeOffset = serverTime - Date.now();
  } catch {
    window.timeOffset = 0; // fallback to local clock
  }
}

// Use this everywhere instead of Date.now()
function now() {
  return Date.now() + (window.timeOffset || 0);
}
```

This keeps devices synchronized within ~100ms without owning any infrastructure.

---

## Sync Loop Algorithm

```javascript
const SYNC_MS = 2000;      // check every 2 seconds
const DRIFT_S = 1.5;       // correct if off by more than 1.5s

function syncLoop() {
  if (!player || player.getPlayerState() !== YT.PlayerState.PLAYING) return;
  
  const target = getTarget();
  const current = player.getCurrentTime();
  
  if (Math.abs(current - target) > DRIFT_S) {
    player.seekTo(target, true); // allowSeekAhead = true
  }
}

setInterval(syncLoop, SYNC_MS);
```

**Why this works without a master:**
- Everyone runs the same math.
- Everyone corrects their own drift.
- No one needs to broadcast their position.

---

## UI Flow & States

### State 1: Setup
```
[ Paste YouTube URL here        ]
[ Join Existing Seed ] [ Create New Seed ]
```

### State 2: Creating (User A)
- Player loads video.
- Big button: **"Start Sync From Here"**
- On click: captures `seed` + `offset`, updates URL hash, shows:
  - Copyable short link
  - QR code (optional, using a client-side QR lib)
  - Raw numbers: `Seed: 1714147200000 | Offset: 125s`

### State 3: Joining (User B)
- Opens link → app auto-parses hash.
- If `Date.now() < seed`: Show **countdown timer** until sync starts.
- If `Date.now() >= seed`: Load player, seek to target, start sync loop.
- Show **Sync Status** indicator (green dot = within 1s, yellow = correcting).

### State 4: Watching
- Minimal UI over player.
- "Copy Link" button.
- Manual **"Resync Now"** button (forces `seekTo`).
- Optional: latency indicator showing how far behind live you are.

---

## File Structure (Single Static Site)

```
/index.html      (UI + layout)
/app.js          (all logic)
/style.css       (minimal)
```

No build step. No npm. Load YouTube IFrame API via CDN:

```html
<script src="https://www.youtube.com/iframe_api"></script>
```

---

## Key Code Modules

### 1. URL Parser
```javascript
function parseHash() {
  const hash = new URLSearchParams(location.hash.slice(1));
  return {
    videoId: hash.get('v'),
    seed: parseInt(hash.get('s')),
    offset: parseFloat(hash.get('o')),
    isLive: hash.has('l')
  };
}
```

### 2. YouTube ID Extractor
Handle all formats:
```
youtube.com/watch?v=ID
youtu.be/ID
youtube.com/live/ID
youtube.com/embed/ID
```

### 3. Player Wrapper
```javascript
let player;

function initPlayer(videoId, startTime) {
  player = new YT.Player('player', {
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      mute: 1,          // required for autoplay in modern browsers
      start: Math.floor(startTime),
      rel: 0
    },
    events: {
      onReady: () => {
        player.seekTo(startTime, true);
        setInterval(syncLoop, 2000);
      }
    }
  });
}
```

### 4. Seed Generator
```javascript
function createSeed() {
  const seed = Date.now();
  const offset = player.getCurrentTime();
  const hash = new URLSearchParams({ v: videoId, s: seed, o: offset.toFixed(1) });
  if (isLiveMode) hash.set('l', '1');
  location.hash = hash.toString();
  showShareUI();
}
```

---

## Edge Cases & Mitigations

| Problem | Fix |
|--------|-----|
| **User joins before seed time** | Countdown overlay. Auto-start at seed. |
| **User joins after stream ended** | Detect `getDuration()` vs target. Show "Stream ended" with option to restart from seed. |
| **Mobile autoplay blocked** | Start muted. Show "Tap to unmute" overlay. |
| **YouTube ad plays** | Ad detection is hard via IFrame API. Just let the sync loop correct after the ad finishes. |
| **Tab backgrounded / phone locked** | On `visibilitychange` event, force resync immediately when tab returns. |
| **Live stream has no DVR** | If `seekTo()` fails or snaps back to edge, show warning: "Broadcaster disabled DVR — sync unavailable." |
| **Negative offset** | `Math.max(0, target)` everywhere. |

---

## Deployment Checklist

1. **Host**: GitHub Pages, Cloudflare Pages, or Netlify (free, static hosting).
2. **Domain**: Optional custom domain. Not required.
3. **HTTPS**: Required for `worldtimeapi.org` fetch and modern browser APIs.
4. **No API keys needed**: YouTube IFrame API is free and keyless for playback.

---

## Summary

Your friend sends you a link like:
```
https://watchsync.pages.dev/#v=AbCdEfG&s=1714147200000&o=0&l=1
```

You open it. The app calculates exactly where in the live stream you should be based on how much time passed since `1714147200000`. Everyone runs the same math. No server. No accounts. Just a seed, an offset, and the current time.
