<script>
  import { onMount, onDestroy } from 'svelte'
  import { now } from './sync.ts'

  let {
    seed,
    onDone = () => {},
  } = $props()

  let remaining = $state(0)
  let interval

  onMount(() => {
    remaining = Math.max(0, Math.ceil((seed - now()) / 1000))
    interval = setInterval(() => {
      const r = Math.max(0, Math.ceil((seed - now()) / 1000))
      remaining = r
      if (r <= 0) {
        clearInterval(interval)
        onDone()
      }
    }, 500)
  })

  onDestroy(() => {
    clearInterval(interval)
  })

  function fmt(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }
</script>

<div class="countdown">
  <div class="box">
    <div class="label">Sync starts in</div>
    <div class="time">{fmt(remaining)}</div>
  </div>
</div>

<style>
  .countdown {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(11, 12, 16, 0.92);
    z-index: 10;
  }
  .box {
    text-align: center;
  }
  .label {
    font-size: 0.9rem;
    opacity: 0.8;
    margin-bottom: 0.25rem;
  }
  .time {
    font-size: 3rem;
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    font-weight: 700;
  }
</style>
