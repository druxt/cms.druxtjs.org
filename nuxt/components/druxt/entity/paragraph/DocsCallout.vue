<template>
  <DruxtFormFlip v-if="entity" :entity="entity">
    <div :data-callout="entity.attributes.field_callout_type">
      <slot name="field_callout" />
    </div>
  </DruxtFormFlip>
</template>

<script>
/** A callout. Its type ("Before you start", "Program output") is data, not a printed label. */
export default {
  // DruxtEntity's other props (fields, schema, value) are not HTML attributes.
  inheritAttrs: false,
  props: {
    entity: { type: Object, default: undefined },
  },
}
</script>
