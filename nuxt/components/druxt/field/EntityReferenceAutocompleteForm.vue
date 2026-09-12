<template>
  <!-- An autocomplete widget: the referenced entity's label, as Drupal fills it in. -->
  <div>
    <strong v-if="label">{{ label }}:</strong>
    <input type="text" :value="text" :placeholder="placeholder" readonly>
  </div>
</template>

<script>
import { referenceId, referenceTypes } from '~/utils/form-widgets'

export default {
  props: {
    schema: { type: Object, default: () => ({}) },
    value: { type: [Array, Object, String], default: null },
  },
  data: () => ({ entity: null }),
  async fetch() {
    // The label of what is referenced, where the backend lets us read it.
    const id = referenceId(this.value)
    const type = (((this.value || {}).data && [].concat(this.value.data)[0]) || {}).type || referenceTypes(this.schema)[0]
    if (!id || !type) return
    this.entity = await this.$store.dispatch('druxt/getResource', { type, id }).then((r) => (r || {}).data || null, () => null)
  },
  computed: {
    label: ({ schema }) => ((schema || {}).label || {}).text || '',
    placeholder: ({ schema }) => ((((schema || {}).settings || {}).display || {}).placeholder) || '',
    text: ({ entity, value }) => {
      const a = (entity || {}).attributes || {}
      const id = referenceId(value)
      const name = a.display_name || a.name || a.title || a.label
      return name ? `${name} (${id.slice(0, 8)})` : id
    },
  },
}
</script>
