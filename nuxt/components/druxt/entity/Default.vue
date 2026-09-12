<template>
  <div>
    <h3 v-if="title" class="text-[17px] font-semibold tracking-tight mb-3">{{ title }}</h3>

    <!-- Tailwind 2 drops multi-token arbitrary values, so the columns are inline. -->
    <dl class="grid gap-x-[18px] gap-y-[7px]" style="grid-template-columns: 118px minmax(0, 1fr)">
      <template v-for="field in rows">
        <dt :key="field.id + ':label'" class="text-xs text-base-content/70 pt-0.5">{{ field.label }}</dt>
        <dd :key="field.id + ':value'" class="text-[13.5px] min-w-0">
          <template v-if="form">
            <textarea v-if="field.long" class="textarea textarea-bordered textarea-sm w-full" :value="field.text" rows="3" />
            <input v-else type="text" class="input input-bordered input-sm w-full" :value="field.text" />
          </template>
          <div v-else-if="field.html" class="prose prose-sm max-w-none" v-html="field.html" />
          <span v-else-if="field.references" class="text-primary-focus">{{ field.text }}</span>
          <template v-else>{{ field.text }}</template>
        </dd>
      </template>
    </dl>

    <button v-if="form" type="button" class="btn btn-primary btn-sm mt-4" disabled>Save</button>
  </div>
</template>

<script>
/**
 * The default entity wrapper: the label, then each field's label and value.
 *
 * Catches any entity with no wrapper of its own. Does the least that still
 * reads as content, and announces itself by name so it is easy to override.
 */

// One line of text for a field value, whatever shape Drupal gave it.
const text = (value) => {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    if (value.value != null) return String(value.value)
    if (value.data) return text(value.data)
    if (value.type && value.id) return `${value.type} ${value.id.slice(0, 8)}`
    return Object.values(value).map(text).filter(Boolean).join(', ')
  }
  return String(value)
}

export default {
  props: {
    entity: { type: Object, default: () => ({}) },
    fields: { type: [Object, Boolean], default: () => ({}) },
    schema: { type: Object, default: () => ({}) },
  },

  computed: {
    title: ({ entity }) => {
      const a = entity.attributes || {}
      return a.title || a.name || a.label || a.info || ''
    },

    form: ({ schema }) => ((schema || {}).config || {}).schemaType === 'form',

    rows: ({ fields }) =>
      Object.values(fields || {}).map((field) => {
        const value = field.value
        const html = value && typeof value === 'object' && !Array.isArray(value) ? value.processed : null
        return {
          id: field.id,
          label: ((field.schema || {}).label || {}).text || field.id,
          html,
          text: text(value),
          long: !!html || (typeof value === 'string' && value.length > 80),
          references: !!field.relationship,
        }
      }),
  },
}
</script>
