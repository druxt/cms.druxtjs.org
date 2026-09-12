<template>
  <!-- The select Drupal shows: a list field's allowed values, or the entities a reference can point at. -->
  <div>
    <strong v-if="label">{{ label }}:</strong>
    <select :value="current" @change="pick($event.target.value)">
      <option v-if="$fetchState.pending" value="" disabled>loading</option>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
  </div>
</template>

<script>
export default {
  props: {
    relationship: { type: Boolean, default: false },
    schema: { type: Object, default: () => ({}) },
    value: { type: [Number, String, Array, Object], default: null },
  },
  data: () => ({ entities: [] }),
  async fetch() {
    // A reference lists what it can point at: each target bundle's entities.
    const s = (this.schema || {}).settings || {}
    const type = (s.storage || {}).target_type
    const bundles = Object.keys(((s.config || {}).handler_settings || {}).target_bundles || {})
    if (!type || !bundles.length) return
    const collections = await Promise.all(bundles.map((bundle) => this.$store.dispatch('druxt/getCollection', { type: `${type}--${bundle}` })))
    this.entities = collections.flatMap((c) => (c || {}).data || [])
  },
  computed: {
    label: ({ schema }) => ((schema || {}).label || {}).text || '',
    item: ({ value }) => (Array.isArray(value) ? value[0] : value),
    current: ({ item }) => (item && typeof item === 'object' ? item.id : item) || '',
    options: ({ schema, entities }) => {
      if (entities.length) return entities.map((o) => ({ value: o.id, label: (o.attributes || {}).name || (o.attributes || {}).title || o.id, type: o.type }))
      // allowed_values arrives as a list of { value, label } or a map of value to label.
      const s = (schema || {}).settings || {}
      const allowed = (s.storage || {}).allowed_values || (s.config || {}).allowed_values || []
      return Array.isArray(allowed) ? allowed : Object.entries(allowed).map(([value, label]) => ({ value, label }))
    },
  },
  methods: {
    pick(value) {
      const o = this.options.find((x) => x.value === value) || {}
      this.$emit('input', o.type ? { type: o.type, id: value } : value)
    },
  },
}
</script>
