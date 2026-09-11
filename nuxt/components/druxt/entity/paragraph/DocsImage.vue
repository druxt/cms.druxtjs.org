<template>
  <DruxtFormFlip v-if="entity" :entity="entity">
    <div>
      <slot name="field_media" />
    </div>
  </DruxtFormFlip>
</template>

<script>
/** An image, rendered through its media entity. AppProse turns it into a figure. */
export default {
  // DruxtEntity's other props (fields, schema, value) are not HTML attributes.
  inheritAttrs: false,
  props: {
    entity: { type: Object, default: undefined },
  },
}
</script>
