<script>
/**
 * Its view content, or, while the page's form mode is on, the same entity
 * through DruxtEntity in form mode, as Drupal's form display arranges it.
 */
export default {
  inject: {
    docsForm: { default: () => ({ on: false }) },
  },
  props: {
    entity: { type: Object, required: true },
  },
  render(h) {
    if (!this.docsForm.on) return (this.$slots.default || [])[0]
    return h('DruxtEntity', {
      props: { type: this.entity.type, uuid: this.entity.id, mode: 'default', schemaType: 'form' },
    })
  },
}
</script>
