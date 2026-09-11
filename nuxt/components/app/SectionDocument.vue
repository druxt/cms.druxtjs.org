<template>
  <article>
    <AppPageHeader :title="document.title" :description="document.description" />
    <!-- A live demo of DruxtEntity in form mode, from Drupal's form displays. -->
    <div v-if="drupal" class="not-prose mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-box border border-base-300 px-4 py-3 text-sm">
      <label class="flex cursor-pointer items-center gap-2 font-semibold">
        <input v-model="form.on" type="checkbox" class="toggle toggle-sm toggle-primary" />
        Show the blocks as Drupal forms
      </label>
      <span class="text-base-content/70">DruxtEntity renders each block from its form display. Nothing is saved.</span>
    </div>
    <AppProse v-if="!drupal" :document="document" />
    <!-- Keyed so each page gets a fresh AppProse, whose enhance() runs on mount. -->
    <AppProse v-else :key="document.path" :title="document.title">
      <DruxtEntity :type="document.type" :uuid="document.uuid" mode="full" />
    </AppProse>
    <AppDocFooter :edit-path="editPath" :prev="prev" :next="next" />
  </article>
</template>

<script>
import { seoHead } from '~/utils/seo'
import { documentDescription } from '~/utils/content'
import { fetchDrupalPage, sectionOf } from '~/lib/drupal-document'

/**
 * A page in one of the authored sections: tutorials, how-to or explanation.
 *
 * Read from Drupal and rendered by DruxtEntity, or read from the markdown when
 * DOCS_SOURCE is "markdown". Each section's `_.vue` extends this.
 */
export default {
  name: 'AppSectionDocument',
  // Form mode, read by the paragraph wrappers through DruxtFormFlip. A getter,
  // because Nuxt replaces `form` when it reuses this page for the next path.
  provide() {
    const page = this
    return {
      docsForm: {
        get on() {
          return page.form.on
        },
      },
    }
  },
  data: () => ({ form: { on: false } }),
  async asyncData({ $config, $content, error, params, store, route }) {
    const section = sectionOf(route.path)
    const path = route.path.replace(/\/$/, '') || '/'

    if ($config.docsSource !== 'markdown') {
      const document = await fetchDrupalPage(store, path)
      if (!document) return error({ statusCode: 404, message: 'Document not found' })
      // Siblings in the docs menu's order, the section landing first.
      const top = store.state.menu.find((item) => (item.props || {}).to === `/${section}`)
      // Drupal's menu also lists the landing among its own children; keep it once.
      const siblings = top
        ? [top, ...(top.children || [])]
            .map((item) => ({ text: item.text, to: item.props.to }))
            .filter((item, index, all) => all.findIndex((o) => o.to === item.to) === index)
        : []
      store.commit('addRecent', { text: document.title, to: route.path })
      store.commit('setToc', document.toc)
      return { document, drupal: true, section, siblings, current: path }
    }

    const slug = params.pathMatch || 'README'
    let document
    try {
      document = await $content(`${section}/`, slug).fetch()
    } catch (e) {
      return error({ statusCode: 404, message: 'Document not found' })
    }
    const index = await $content(section).sortBy('weight').only(['path', 'title']).fetch()
    const to = (item) => item.path.replace('/README', '')
    store.commit('addRecent', { text: document.title, to: route.path })
    store.commit('setToc', document.toc || [])
    return {
      document,
      drupal: false,
      section,
      siblings: index.map((item) => ({ text: item.title, to: to(item) })),
      current: to(document),
    }
  },
  head() {
    return seoHead({
      title: this.document.title,
      description: this.drupal ? this.document.description : documentDescription(this.document),
      path: this.$route.path,
    })
  },
  computed: {
    editPath: ({ drupal, section, document }) => (drupal ? null : section + document.path.replace(`/${section}`, '') + '.md'),
    position: ({ siblings, current }) => siblings.findIndex((o) => o.to === current),
    prev: ({ siblings, position }) => (position > 0 ? siblings[position - 1] : null),
    next: ({ siblings, position }) => (position > -1 && position < siblings.length - 1 ? siblings[position + 1] : null),
  },
}
</script>
