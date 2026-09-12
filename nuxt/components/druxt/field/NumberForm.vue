<template>
  <!-- A number widget as a select over its range: a weight reads better picked than typed. -->
  <div>
    <strong v-if="label">{{ label }}:</strong>
    <select :value="current" @change="$emit('input', Number($event.target.value))">
      <option v-for="n in range" :key="n" :value="n">{{ n }}</option>
    </select>
  </div>
</template>

<script>
export default {
  props: {
    schema: { type: Object, default: () => ({}) },
    value: { type: [Number, String, Array], default: null },
  },
  computed: {
    label: ({ schema }) => ((schema || {}).label || {}).text || '',
    current: ({ value }) => Number(Array.isArray(value) ? value[0] : value) || 0,
    range: ({ schema, current }) => {
      const s = (schema || {}).settings || {}
      const min = Math.min(Number(((s.config || {}).min ?? -10)), current)
      const max = Math.max(Number(((s.config || {}).max ?? 10)), current)
      return Array.from({ length: max - min + 1 }, (_, i) => min + i)
    },
  },
}
</script>
