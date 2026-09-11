<template>
  <DruxtFormFlip v-if="entity" :entity="entity">
    <DuiCodeBlock :code="entity.attributes.field_code || ''" :language="entity.attributes.field_language || 'text'" />
  </DruxtFormFlip>
</template>

<script>
/** A code block, highlighted by its declared language. */
export default {
  // DruxtEntity's other props (fields, schema, value) are not HTML attributes.
  inheritAttrs: false,
  props: {
    entity: { type: Object, default: undefined },
  },
}
</script>
