<script>
  import { getShareUrl } from './sync.ts'

  let {
    hash,
  } = $props()

  let copied = $state(false)

  const url = $derived(getShareUrl(hash))

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      copied = true
      setTimeout(() => (copied = false), 1500)
    }
  }
</script>

<div class="share">
  <div class="row">
    <input type="text" readonly value={url} />
    <button class="primary" onclick={copy}>{copied ? 'Copied!' : 'Copy Link'}</button>
  </div>
</div>

<style>
  .share {
    padding: 0.5rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row input {
    flex: 1 1 auto;
    font-size: 0.85rem;
  }
</style>
