<template>
  <DruxtFormFlip v-if="entity" :entity="entity">
    <DuiDiagram :source="entity.attributes.field_diagram || ''" />
  </DruxtFormFlip>
</template>

<script>
/** A mermaid diagram. */
export default {
  // DruxtEntity's other props (fields, schema, value) are not HTML attributes.
  inheritAttrs: false,
  props: {
    entity: { type: Object, default: undefined },
  },
}
</script>
