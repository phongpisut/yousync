<script>
  let {
    status = 'idle', // idle | good | correcting
    latency = 0,
    onResync = () => {},
  } = $props()

  const dotColor = $derived.by(() => {
    if (status === 'good') return 'var(--success)'
    if (status === 'correcting') return 'var(--warning)'
    return 'var(--muted)'
  })
</script>

<div class="overlay">
  <div class="status">
    <span class="dot" style="background: {dotColor};"></span>
    <span class="label">{status === 'good' ? 'Synced' : status === 'correcting' ? 'Correcting…' : 'Sync idle'}</span>
  </div>
  {#if latency > 0}
    <span class="latency">{Math.round(latency)}s behind live</span>
  {/if}
  <button onclick={onResync}>Resync Now</button>
</div>

<style>
  .overlay {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: rgba(11, 12, 16, 0.85);
    border-top: 1px solid #33404d;
    backdrop-filter: blur(4px);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
  }

  .dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    display: inline-block;
  }

  .latency {
    margin-left: auto;
    font-size: 0.8rem;
    opacity: 0.8;
  }

  button {
    font-size: 0.8rem;
    padding: 0.4rem 0.7rem;
  }
</style>
