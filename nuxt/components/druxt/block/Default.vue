<template>
  <div>
    <p v-if="label" class="text-sm font-semibold mb-1">{{ label }}</p>
    <p class="text-sm text-base-content/70">{{ plugin }}</p>
  </div>
</template>

<script>
/**
 * The default block wrapper: the block's label where it shows one, then the
 * plugin it renders. A block is whatever its plugin contains, so a default
 * can name it and no more.
 */
export default {
  props: {
    block: { type: Object, required: true },
  },
  computed: {
    settings: ({ block }) => (block.attributes || {}).settings || {},
    label: ({ settings }) => (settings.label_display ? settings.label : ''),
    plugin: ({ block }) => (block.attributes || {}).plugin || '',
  },
}
</script>
