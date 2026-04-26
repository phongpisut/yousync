<script>
  import { onMount, onDestroy, tick } from 'svelte'
  import YoutubePlayer from './lib/YoutubePlayer.svelte'
  import SetupForm from './lib/SetupForm.svelte'
  import SharePanel from './lib/SharePanel.svelte'
  import SyncOverlay from './lib/SyncOverlay.svelte'
  import Countdown from './lib/Countdown.svelte'
  import {
    parseHash,
    buildShareHash,
    calibrateTime,
    now,
    getTarget,
    extractYouTubeId,
    parseYouTubeTime,
  } from './lib/sync.ts'

  // Phases: setup | creating | countdown | watching
  let phase = $state('setup')
  let seed = $state(null)
  let baseOffset = $state(0)
  let isLive = $state(false)
  let videoId = $state(null)
  let buffer = $state(0)
  let videoStartInput = $state('')
  let createBuffer = $state(2)
  let shareHash = $derived.by(() => {
    if (videoId && seed != null && baseOffset != null) {
      return buildShareHash({ videoId, seed, offset: baseOffset.toFixed(1), isLive, buffer })
    }
    return ''
  })

  // Player component ref
  let playerComp = $state(null)

  // Sync loop
  let syncInterval = null
  let syncStatus = $state('idle')
  let currentLatency = $state(0)

  const SYNC_MS = 2000
  const DRIFT_S = 1.5

  function getPlayer() {
    return playerComp?.getPlayer?.() ?? null
  }

  function getTargetTime() {
    if (seed == null) return 0
    const p = getPlayer()
    const dur = p && typeof p.getDuration === 'function' ? p.getDuration() : 0
    return getTarget({ seed, baseOffset, isLive, getDuration: () => dur, buffer })
  }

  function syncLoop() {
    const p = getPlayer()
    if (!p || typeof p.getPlayerState !== 'function') return
    if (p.getPlayerState() !== YT.PlayerState.PLAYING) return

    const target = getTargetTime()
    const current = p.getCurrentTime()
    const diff = Math.abs(current - target)

    if (diff > DRIFT_S) {
      syncStatus = 'correcting'
      p.seekTo(target, true)
    } else {
      syncStatus = 'good'
    }

    if (isLive) {
      const dur = typeof p.getDuration === 'function' ? p.getDuration() : 0
      currentLatency = Math.max(0, dur - current)
    } else {
      currentLatency = 0
    }
  }

  function startSyncLoop() {
    stopSyncLoop()
    syncInterval = setInterval(syncLoop, SYNC_MS)
  }

  function stopSyncLoop() {
    if (syncInterval) {
      clearInterval(syncInterval)
      syncInterval = null
    }
  }

  function forceResync() {
    const p = getPlayer()
    if (!p || typeof p.seekTo !== 'function') return
    const target = getTargetTime()
    p.seekTo(target, true)
    syncStatus = 'correcting'
  }

  function onVisibility() {
    if (!document.hidden) {
      tick().then(() => forceResync())
    }
  }

  // Capture seed from player current state
  function doCaptureSeed() {
    const s = now()
    const p = getPlayer()
    const offset = p && typeof p.getCurrentTime === 'function' ? p.getCurrentTime() : 0
    seed = s
    baseOffset = offset
    buffer = 0
    const hash = buildShareHash({ videoId, seed, offset: baseOffset.toFixed(1), isLive, buffer })
    location.hash = hash
    phase = 'watching'
    startSyncLoop()
  }

  function doCreateSeedFromTime() {
    const parsed = parseYouTubeTime(videoStartInput)
    if (parsed == null) return
    const p = getPlayer()
    if (p && typeof p.seekTo === 'function') {
      p.seekTo(parsed, true)
    }
    seed = now()
    baseOffset = parsed
    buffer = createBuffer
    isLive = false
    const hash = buildShareHash({ videoId, seed, offset: baseOffset.toFixed(1), isLive, buffer })
    location.hash = hash
    phase = 'watching'
    tick().then(() => {
      forceResync()
      startSyncLoop()
    })
  }

  // Start creating flow: load video, wait for user to click Start Sync
  function startCreate(videoIdFromForm) {
    videoId = videoIdFromForm
    isLive = false
    phase = 'creating'
  }

  // Join existing seed from parsed hash
  function startJoin(videoIdFromHash, s, o, liveFlag, buf = 0) {
    videoId = videoIdFromHash
    seed = s
    baseOffset = o ?? 0
    isLive = liveFlag
    buffer = buf
    if (now() < seed) {
      phase = 'countdown'
    } else {
      phase = 'watching'
      tick().then(() => {
        forceResync()
        startSyncLoop()
      })
    }
  }

  function onCountdownDone() {
    phase = 'watching'
    tick().then(() => {
      const p = getPlayer()
      if (p && typeof p.playVideo === 'function') {
        try {
          p.playVideo()
        } catch (e) {}
      }
      forceResync()
      startSyncLoop()
    })
  }

  function handleJoinClick(url) {
    // Try to parse a share link from the input
    try {
      const inputUrl = new URL(url)
      const hashParams = new URLSearchParams(inputUrl.hash.slice(1))
      const v = hashParams.get('v')
      const s = hashParams.has('s') ? parseInt(hashParams.get('s'), 10) : null
      const o = hashParams.has('o') ? parseFloat(hashParams.get('o')) : null
      const l = hashParams.has('l')
      const b = hashParams.has('b') ? parseFloat(hashParams.get('b')) : 0
      if (v && s != null && o != null) {
        startJoin(v, s, o, l, b)
        return
      }
    } catch {
      // not a full URL, maybe plain video ID or partial
    }

    // Otherwise, try page hash
    const h = parseHash()
    if (h.videoId && h.seed != null && h.offset != null) {
      startJoin(h.videoId, h.seed, h.offset, h.isLive, h.buffer)
      return
    }

    // Fallback: just load the video without sync
    // Extract video ID from input if possible
    const extracted = extractYouTubeId(url)
    if (extracted) {
      videoId = extracted
      phase = 'watching'
    }
  }

  function handleCreateClick(url) {
    // Extract video ID from input
    const extracted = extractYouTubeId(url)
    if (extracted) {
      startCreate(extracted)
    }
  }

  onMount(async () => {
    await calibrateTime()
    const h = parseHash()
    if (h.videoId && h.seed != null && h.offset != null) {
      startJoin(h.videoId, h.seed, h.offset, h.isLive, h.buffer)
    }
    document.addEventListener('visibilitychange', onVisibility)
  })

  onDestroy(() => {
    stopSyncLoop()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  $effect(() => {
    if (phase === 'countdown') {
      const p = getPlayer()
      if (p && typeof p.pauseVideo === 'function') {
        try {
          p.pauseVideo()
        } catch (e) {}
      }
    }
  })


</script>

<div class="app">
  {#if phase === 'setup'}
    <SetupForm onJoin={handleJoinClick} onCreate={handleCreateClick} />
  {:else}
    <div class="viewer">
      <div class="player-wrap">
        {#if videoId}
          <YoutubePlayer
            bind:this={playerComp}
            {videoId}
            startTime={phase === 'watching' ? getTargetTime() : 0}
            {isLive}
            autoplay={phase === 'countdown' ? 0 : 1}
          />
        {/if}

        {#if phase === 'creating'}
          <div class="create-overlay">
            <button class="primary big" onclick={doCaptureSeed}>Start Sync From Here</button>
            <p class="sub">Uses the current player position and starts now.</p>

            <div class="divider">or</div>

            <p class="sub">Set a video starting point:</p>
            <input
              type="text"
              bind:value={videoStartInput}
              placeholder="e.g. 02:03"
            />
            <div class="buffer-row">
              <label for="buffer-input">Buffer (seconds)</label>
              <input id="buffer-input" type="number" bind:value={createBuffer} min="0" max="60" step="1" />
            </div>
            <button class="primary big" onclick={doCreateSeedFromTime} disabled={!videoStartInput.trim()}>
              Create Sync Link
            </button>
            <p class="sub">Seeks to that moment and starts everyone from now.</p>
          </div>
        {/if}

        {#if phase === 'countdown'}
          <Countdown {seed} onDone={onCountdownDone} />
        {/if}
      </div>

      {#if phase === 'watching'}
        <SyncOverlay
          status={syncStatus}
          latency={currentLatency}
          onResync={forceResync}
        />
      {/if}
    </div>

    {#if shareHash}
      <div class="footer-share">
        <SharePanel hash={shareHash} />
      </div>
    {/if}
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .viewer {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .player-wrap {
    flex: 1 1 auto;
    position: relative;
    min-height: 0;
    background: #000;
  }

  .create-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: rgba(11, 12, 16, 0.88);
    z-index: 10;
  }

  .create-overlay .big {
    font-size: 1.2rem;
    padding: 0.8rem 1.4rem;
  }

  .create-overlay .sub {
    margin: 0;
    font-size: 0.85rem;
    opacity: 0.8;
    max-width: 320px;
    text-align: center;
  }

  .create-overlay .divider {
    margin: 0.25rem 0;
    font-size: 0.8rem;
    opacity: 0.5;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .create-overlay input[type="text"] {
    max-width: 320px;
    text-align: center;
  }

  .buffer-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 260px;
    justify-content: center;
  }

  .buffer-row label {
    font-size: 0.85rem;
    opacity: 0.9;
    white-space: nowrap;
  }

  .buffer-row input {
    width: 60px;
    text-align: center;
  }

  .footer-share {
    padding: 0.5rem;
    border-top: 1px solid #1f2833;
    background: #0b0c10;
  }
</style>
