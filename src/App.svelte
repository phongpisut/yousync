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
  } from './lib/sync.ts'

  // Phases: setup | creating | countdown | watching
  let phase = $state('setup')
  let seed = $state(null)
  let baseOffset = $state(0)
  let isLive = $state(false)
  let videoId = $state(null)
  let shareHash = $derived.by(() => {
    if (videoId && seed != null && baseOffset != null) {
      return buildShareHash({ videoId, seed, offset: baseOffset.toFixed(1), isLive })
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
    return getTarget({ seed, baseOffset, isLive, getDuration: () => dur })
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
    const hash = buildShareHash({ videoId, seed, offset: baseOffset.toFixed(1), isLive })
    location.hash = hash
    phase = 'watching'
    startSyncLoop()
  }

  // Start creating flow: load video, wait for user to click Start Sync
  function startCreate(videoIdFromForm) {
    videoId = videoIdFromForm
    isLive = false
    phase = 'creating'
  }

  // Join existing seed from parsed hash
  function startJoin(videoIdFromHash, s, o, liveFlag) {
    videoId = videoIdFromHash
    seed = s
    baseOffset = o ?? 0
    isLive = liveFlag
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
      if (v && s != null && o != null) {
        startJoin(v, s, o, l)
        return
      }
    } catch {
      // not a full URL, maybe plain video ID or partial
    }

    // Otherwise, try page hash
    const h = parseHash()
    if (h.videoId && h.seed != null && h.offset != null) {
      startJoin(h.videoId, h.seed, h.offset, h.isLive)
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
      startJoin(h.videoId, h.seed, h.offset, h.isLive)
    }
    document.addEventListener('visibilitychange', onVisibility)
  })

  onDestroy(() => {
    stopSyncLoop()
    document.removeEventListener('visibilitychange', onVisibility)
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
          />
        {/if}

        {#if phase === 'creating'}
          <div class="create-overlay">
            <button class="primary big" onclick={doCaptureSeed}>Start Sync From Here</button>
            <p class="sub">Seek to where you want the group to start, then click the button.</p>
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

  .footer-share {
    padding: 0.5rem;
    border-top: 1px solid #1f2833;
    background: #0b0c10;
  }
</style>
