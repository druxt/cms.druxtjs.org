<script>
/**
 * Every field in form mode: its label, then a control for each item, bound to
 * the item's value. A reference names what it points at rather than nesting
 * that entity's form.
 */
const INPUT = 'w-full rounded-btn border border-base-300 bg-base-100 p-2 font-mono text-sm'

export default {
  inheritAttrs: false,
  props: {
    errors: { type: Array, default: () => [] },
    relationship: { type: Boolean, default: false },
    schema: { type: Object, default: () => ({}) },
    value: { type: [Array, Boolean, Number, Object, String], default: undefined },
  },
  computed: {
    items() {
      if (this.value === undefined || this.value === null) return []
      const value = this.relationship && this.value.data !== undefined ? this.value.data : this.value
      return Array.isArray(value) ? value : [value]
    },
  },
  render(h) {
    // Per instance: the same field appears in every block of its type.
    const id = (delta) => `form-${this._uid}-${delta}`
    const label = (this.schema.label || {}).text
    const control = (item, delta) => {
      const attrs = { id: id(delta), 'aria-label': delta && label ? `${label} ${delta + 1}` : undefined }
      if (this.relationship) {
        const target = item && item.type ? `${item.type} ${item.id}` : ''
        return h('input', { class: INPUT, attrs: { ...attrs, type: 'text', readonly: true }, domProps: { value: target } })
      }
      const value = item !== null && typeof item === 'object' && 'value' in item ? item.value : item
      if (typeof value === 'boolean') {
        return h('input', { class: 'checkbox checkbox-sm', attrs: { ...attrs, type: 'checkbox' }, domProps: { checked: value } })
      }
      const text =
        value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
      if (/textarea/.test(this.schema.type || '') || text.includes('\n')) {
        const rows = Math.min(14, text.split('\n').length + 1)
        return h('textarea', { class: INPUT, attrs: { ...attrs, rows }, domProps: { value: text } })
      }
      return h('input', { class: INPUT, attrs: { ...attrs, type: 'text' }, domProps: { value: text } })
    }
    return h('div', { class: 'mb-4' }, [
      label ? h('label', { class: 'mb-1 block text-sm font-semibold', attrs: { for: id(0) } }, label) : null,
      ...this.items.map(control),
    ])
  },
}
</script>
