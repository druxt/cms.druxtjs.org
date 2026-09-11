<template>
  <form class="not-prose my-6 rounded-box border border-base-300 bg-base-200 p-4" @submit.prevent>
    <p v-if="entity" class="mb-3 text-xs font-semibold uppercase tracking-wider text-base-content/70">
      {{ entity.type }}: Drupal form display
    </p>
    <slot />
  </form>
</template>

<script>
/**
 * Any paragraph in form mode: its fields, as Drupal's form display arranges
 * them. Named for the entity type, mode and schema type, so it outranks the
 * per-bundle view wrappers and a flipped block never resolves back to them.
 */
export default {
  // DruxtEntity's other props (fields, schema, value) are not HTML attributes.
  inheritAttrs: false,
  props: {
    entity: { type: Object, default: undefined },
  },
}
</script>
