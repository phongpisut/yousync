<script>
  import { onMount, onDestroy } from 'svelte'

  let {
    videoId,
    startTime = 0,
    isLive = false,
    autoplay = 1,
    onReady = () => {},
    onReadyChange = () => {},
  } = $props()

  let player = $state(null)
  let container = $state(null)
  let ready = $state(false)

  $effect(() => {
    onReadyChange(ready)
  })

  onMount(() => {
    function init() {
      if (!container) return
      player = new YT.Player(container, {
        videoId,
        playerVars: {
          autoplay,
          mute: 1,
          start: Math.floor(startTime),
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            ready = true
            if (startTime > 0) {
              e.target.seekTo(startTime, true)
            }
            onReady(e.target)
          },
          onStateChange: (e) => {
            // no-op; sync loop handles drift
          },
          onError: (e) => {
            console.error('YT Player Error', e.data)
          },
        },
      })
    }

    if (window.YT && window.YT.Player) {
      init()
    } else {
      window.onYouTubeIframeAPIReady = init
      // In case script already loaded but callback fired
      const check = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(check)
          init()
        }
      }, 200)
    }
  })

  onDestroy(() => {
    if (player && typeof player.destroy === 'function') {
      try { player.destroy() } catch (e) {}
    }
  })

  export function getPlayer() {
    return player
  }

  export function isPlayerReady() {
    return ready
  }
</script>

<div bind:this={container} class="yt-wrap"></div>

<style>
  .yt-wrap {
    width: 100%;
    height: 100%;
  }
  :global(.yt-wrap iframe) {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }
</style>
