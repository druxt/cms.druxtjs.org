<template>
  <!-- plugins/mermaid.client.js replaces the pre with the rendered figure, inside this wrapper. -->
  <div style="display: contents"><pre><code class="language-mermaid">{{ source }}</code></pre></div>
</template>

<script>
/** A mermaid diagram, from its source. A first line of `%% text` captions it. */
export default {
  props: {
    source: { type: String, required: true },
  },
}
</script>
