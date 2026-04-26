<script>
  let {
    onJoin = () => {},
    onCreate = () => {},
  } = $props()

  let url = $state('')

  function handleJoin() {
    onJoin(url)
  }

  function handleCreate() {
    onCreate(url)
  }

  function keydown(e) {
    if (e.key === 'Enter') handleJoin()
  }
</script>

<div class="setup">
  <h1>YouSync</h1>
  <p class="tagline">Watch YouTube together. No server. Just a seed and the current time.</p>

  <input
    type="text"
    placeholder="Paste YouTube URL here (e.g. youtube.com/live/xxxx)"
    bind:value={url}
    onkeydown={keydown}
  />

  <div class="actions">
    <button onclick={handleJoin}>Join Existing Seed</button>
    <button class="primary" onclick={handleCreate}>Create New Seed</button>
  </div>
</div>

<style>
  .setup {
    max-width: 520px;
    margin: 0 auto;
    padding: 2rem 1rem;
    text-align: center;
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 2rem;
    color: var(--accent);
    letter-spacing: 0.05em;
  }

  .tagline {
    margin: 0 0 1.5rem;
    color: var(--text);
    opacity: 0.85;
  }

  input {
    margin-bottom: 0.75rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .actions button {
    flex: 1 1 auto;
  }
</style>
