<template>
  <div data-testid="druxt-example" class="not-prose my-8 border border-base-300 rounded-lg bg-base-200 overflow-hidden text-base-content">
    <!-- Header: live dot, component, backend. -->
    <div class="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
      <span class="relative flex h-[7px] w-[7px]" aria-hidden="true">
        <span v-if="!error && live" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
        <span class="relative inline-flex h-[7px] w-[7px] rounded-full" :class="error ? 'bg-error' : live ? 'bg-success' : 'bg-base-300'" />
      </span>
      <span class="text-[10.5px] font-semibold uppercase tracking-[0.08em]" :class="error ? 'text-error' : 'text-base-content/70'">
        {{ error ? 'Not live' : 'Live' }}
      </span>

      <code v-if="fixed" class="text-[13px] text-primary-focus">&lt;{{ name }}&gt;</code>
      <label v-else class="flex items-center gap-2 text-sm">
        <span class="sr-only sm:not-sr-only text-base-content/70">Component</span>
        <!-- Capped: the disabled options' reasons would otherwise set the width. -->
        <select v-model="name" data-testid="component" class="select select-sm select-bordered h-[30px] min-h-0 rounded-md w-[15rem] max-w-full">
          <option value="">Pick one</option>
          <optgroup v-for="group in picker" :key="group.label" :label="group.label">
            <option v-for="o in group.options" :key="o.name" :value="o.name" :disabled="!group.enabled">{{ o.label }}</option>
          </optgroup>
        </select>
      </label>

      <!-- Right on a wide band; left under the picker when the band wraps. -->
      <label v-if="live" class="sm:ml-auto flex items-center gap-2 text-sm">
        <span class="text-base-content/70">Backend</span>
        <select v-model="backend" data-testid="backend" class="select select-sm select-bordered h-[30px] min-h-0 rounded-md">
          <option v-for="(b, key) in backends" :key="key" :value="key" :disabled="!supports(key)">
            {{ b.label }}{{ supports(key) ? '' : ' (not for this component yet)' }}
          </option>
        </select>
      </label>
    </div>

    <!-- A component that is not live on its own: one line, and a way in. -->
    <div v-if="name && !live" class="border-t border-base-300 bg-base-100 px-3.5 py-3 text-sm">
      <template v-if="contextOnly">
        <span class="text-base-content/70">Rendered by its parent.</span>
        <NuxtLink v-if="contextOnly.parent && pageFor(contextOnly.parent)" :to="pageFor(contextOnly.parent)" class="text-primary-focus ml-1">See {{ contextOnly.parent }}</NuxtLink>
        <span v-else class="ml-1 text-base-content/70">{{ contextOnly.reason }}.</span>
      </template>
      <template v-else-if="shipped">
        <span class="text-base-content/70">Shown by</span>
        <NuxtLink v-if="pageFor(shipped.by)" :to="pageFor(shipped.by)" class="text-primary-focus mx-1">{{ shipped.by }}</NuxtLink>
        <span class="text-base-content/70">when {{ shipped.when }}.</span>
      </template>
    </div>

    <template v-if="live">
      <!-- Examples as presets. -->
      <div class="flex items-center gap-1.5 px-3.5 pb-2.5 overflow-x-auto" style="scrollbar-width: none">
        <span class="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-base-content/70 mr-1 flex-shrink-0">Examples</span>
        <button
          v-for="chip in chips"
          :key="chip.label"
          type="button"
          class="h-[26px] px-3 rounded-full text-[12.5px] border whitespace-nowrap flex-shrink-0"
          :class="[
            chip.selected ? 'bg-base-100 border-base-content font-semibold' : 'border-base-300 text-base-content/70',
            chip.edited ? 'italic' : '',
          ]"
          :disabled="chip.edited"
          @click="applyExample(chip)"
        >
          {{ chip.label }}
        </button>
      </div>

      <!-- Wrapper bar. -->
      <div class="flex items-center justify-between gap-3 px-3.5 py-2 bg-base-100 border-t border-base-300">
        <span data-testid="matched" class="text-[11px] font-mono text-base-content/70 truncate">
          <template v-if="!wrapper">No wrapper: {{ name }} renders the data only</template>
          <template v-else-if="resolution.is && resolution.is !== 'DruxtWrapper'">{{ resolution.is }} matched</template>
          <template v-else-if="resolution.is">No component matched; Druxt used its own wrapper</template>
          <template v-else>resolving</template>
        </span>
        <div class="flex h-[22px] rounded-md bg-base-200 p-0.5 text-[12px] flex-shrink-0" role="group" aria-label="Wrapper">
          <button type="button" class="px-2.5 rounded" :class="wrapper ? 'bg-base-100 font-semibold shadow-sm' : 'text-base-content/70'" @click="setWrapper(true)">Wrapped</button>
          <button type="button" class="px-2.5 rounded" :class="!wrapper ? 'bg-base-100 font-semibold shadow-sm' : 'text-base-content/70'" @click="setWrapper(false)">Raw</button>
        </div>
      </div>

      <!-- The instance: the only band on base-100. Capped and scrolling, so nothing lies over the output. -->
      <div data-testid="preview" class="bg-base-100 border-t border-base-300 px-[18px] py-5 max-h-[380px] overflow-y-auto">
        <div v-if="error" class="text-sm">
          <p class="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-error">Backend not responding</p>
          <p class="mt-1 text-base-content/70">The {{ backends[backend].label }} did not answer. The controls keep their values, so nothing is lost.</p>
          <p class="mt-2 font-mono text-[12px] text-base-content/70">{{ error }}</p>
          <button type="button" class="btn btn-sm btn-outline mt-3" @click="retry">Try again</button>
        </div>

        <template v-else>
          <!-- Raw and empty: Druxt rendered nothing, which is the point. -->
          <div v-if="!wrapper && rawEmpty" class="border border-dashed border-base-300 rounded-md px-[18px] py-4 text-sm mb-4">
            <p class="flex items-center gap-2">
              <span class="font-mono text-[11px] text-base-content/70">NOTHING RENDERED</span>
              <span class="text-[10.5px] font-semibold uppercase tracking-[0.08em] bg-base-200 rounded px-1.5 py-0.5">Expected</span>
            </p>
            <p class="mt-2 text-base-content/70">With the wrapper off, Druxt hands the data straight to the page and renders no markup of its own. This is what an unwrapped component looks like.</p>
            <a href="/explanation/component-resolution" class="text-primary-focus text-[12.5px]">How wrapper resolution works</a>
          </div>

          <!-- The real instance, wrapped or raw. Raw is Druxt's own output, only styled. -->
          <client-only>
            <div ref="stage" :class="wrapper ? '' : 'druxt-raw'">
              <component :is="name" v-if="ready && primed" :key="renderKey" ref="instance" v-bind="renderProps" :wrapper="wrapper ? undefined : false" />
              <p v-else class="text-sm text-base-content/70">loading</p>
            </div>
          </client-only>
        </template>
      </div>

      <!-- Props panel: the props table, live. -->
      <div class="border-t border-base-300 px-[18px] pt-3 pb-4">
        <p class="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-base-content/70">
          Props <span class="normal-case tracking-normal font-normal text-[12px] ml-2">live: every change re-renders above</span>
        </p>

        <!-- Dependent chain, one row. -->
        <div v-if="schema.chain" class="druxt-props-row gap-x-4 gap-y-2 py-2.5 border-t border-base-300 mt-2">
          <div>
            <p class="font-mono text-[12.5px]" :class="dirtyChain ? 'font-medium' : ''">{{ schema.chain.label }}</p>
            <p class="text-[11.5px] text-base-content/70">{{ schema.chain.description }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <template v-for="(step, i) in schema.chain.steps">
              <span v-if="i" :key="step.name + ':sep'" class="text-base-content/50">›</span>
              <select
                :key="step.name"
                :data-testid="'step-' + step.name"
                class="select select-sm select-bordered h-[30px] min-h-0 rounded-md font-mono text-[12.5px] max-w-full"
                :value="values[step.name] || ''"
                :disabled="!stepEnabled(step)"
                @change="setStep(i, $event.target.value)"
              >
                <option value="">{{ loadingOf(step) ? 'loading' : step.name }}</option>
                <option v-for="o in optionsOf(step)" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </template>
          </div>
        </div>

        <!-- Plain rows: the component's own, then the shared DruxtModule props. -->
        <div v-for="prop in rows" :key="prop.name" class="druxt-props-row gap-x-4 gap-y-2 py-2.5 border-t border-base-300">
          <div>
            <p class="font-mono text-[12.5px]" :class="isDirty(prop) ? 'font-medium' : ''">{{ prop.name }}</p>
            <p class="text-[11.5px] text-base-content/70">{{ prop.type }}<template v-if="prop.default !== undefined && prop.default !== null">, {{ prop.default }}</template></p>
          </div>
          <div class="flex flex-wrap items-center gap-3 text-sm">
            <span v-if="prop.control === 'code'" class="text-[12.5px] text-base-content/70 italic">set in code</span>
            <div v-else-if="prop.control === 'segmented'" class="flex h-[30px] rounded-md border border-base-300 bg-base-100 p-0.5 text-[12.5px]" role="group" :aria-label="prop.name">
              <button v-for="o in prop.options" :key="o" type="button" class="px-3 rounded" :class="(values[prop.name] || prop.default) === o ? 'bg-base-200 font-semibold' : 'text-base-content/70'" :disabled="fixedValues[prop.name] !== undefined" @click="setValue(prop.name, o)">
                {{ o.charAt(0).toUpperCase() + o.slice(1) }}
              </button>
            </div>
            <select v-else-if="prop.control === 'select'" :data-testid="'prop-' + prop.name" class="select select-sm select-bordered h-[30px] min-h-0 rounded-md w-[200px] max-w-full font-mono text-[12.5px]" :value="values[prop.name] || ''" @change="setValue(prop.name, $event.target.value)">
              <option value="">{{ loading[prop.source] ? 'loading' : prop.name }}</option>
              <template v-if="grouped(prop).length">
                <optgroup v-for="g in grouped(prop)" :key="g.group" :label="g.group">
                  <option v-for="o in g.items" :key="o.value" :value="o.value">{{ o.label }}<template v-if="o.suffix"> {{ o.suffix }}</template></option>
                </optgroup>
              </template>
              <option v-for="o in ungrouped(prop)" v-else :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <label v-else-if="prop.control === 'toggle'" class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" class="toggle toggle-sm toggle-primary" :checked="toggleValue(prop)" @change="setValue(prop.name, $event.target.checked)" />
              <span class="text-[12px]">{{ toggleValue(prop) ? 'on' : 'off' }}</span>
            </label>
            <input v-else-if="prop.control === 'number'" type="number" class="input input-sm input-bordered h-[30px] min-h-0 rounded-md w-[72px] font-mono text-[12.5px]" :placeholder="prop.default == null ? '' : String(prop.default)" :value="values[prop.name] == null ? '' : values[prop.name]" @change="setValue(prop.name, $event.target.value === '' ? undefined : Number($event.target.value))" />
            <input v-else type="text" class="input input-sm input-bordered h-[30px] min-h-0 rounded-md w-full font-mono text-[12.5px]" :placeholder="prop.default == null ? '' : String(prop.default)" :value="values[prop.name] || ''" @change="setValue(prop.name, $event.target.value || undefined)" />
            <span v-if="prop.note" class="text-[12px] text-base-content/70">{{ prop.note }}</span>
          </div>
        </div>

        <!-- Markup: always open, the site's own code block, one line. -->
        <div class="border-t border-base-300 pt-3 mt-1 relative" data-testid="markup">
          <!-- The site's code styling keys on .prose, which a playground page lacks. -->
          <div class="prose max-w-none druxt-markup">
            <DuiCodeBlock :code="snippet" language="vue" class="text-xs whitespace-pre-wrap break-all" />
          </div>
          <button type="button" class="absolute top-5 right-3 text-[12.5px] font-medium" style="color: rgba(229, 236, 241, 0.82)" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
        </div>

        <!-- Resolution: closed, its answer; open, the list. -->
        <div class="pt-2.5" data-testid="resolution">
          <div class="flex items-center gap-2 min-h-[20px] text-[12.5px]">
            <button type="button" class="text-base-content/50 text-[10px]" :aria-expanded="String(openResolution)" @click="openResolution = !openResolution">{{ openResolution ? '▾' : '▸' }}</button>
            <span class="text-base-content/70">{{ resolutionLine }}</span>
          </div>
          <div v-if="openResolution" class="mt-2 pl-5 text-xs space-y-2">
            <ol class="font-mono space-y-0.5 list-none pl-0">
              <li v-for="(n, i) in resolution.options" :key="n" :class="n === resolution.is ? 'font-semibold' : 'text-base-content/70'">{{ i + 1 }}. {{ n }}</li>
            </ol>
            <p v-if="source" class="text-base-content/70">Data came from <code>{{ source }}</code></p>
          </div>
        </div>

        <!-- Open in Storybook: follows the backend, absent where none exists. -->
        <div v-if="storybook" class="pt-2.5 flex items-center gap-2 min-h-[20px] pl-5">
          <a :href="storybook.href" target="_blank" rel="noopener" class="text-primary-focus text-[12.5px] font-medium inline-flex items-center gap-1" @click="track('example_storybook')">
            {{ storybook.label }}
            <AppIconExternal class="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </template>

    <div v-else-if="!name" data-testid="preview" class="bg-base-100 border-t border-base-300 px-[18px] py-5 text-sm text-base-content/70">
      Pick a component to render it against a live Drupal.
    </div>
  </div>
</template>

<script>
/**
 * A live Druxt component with its props as controls and its examples as presets.
 *
 * Lives in components/global/ because @nuxt/content v1 only resolves globally
 * registered components inside markdown. What it knows about each component
 * comes from utils/live-examples.js until docgen emits it per component.
 *
 * The Umami backend works by priming the store: a resource fetched without a
 * `fields` parameter is stored as complete and handed back untouched, so the
 * component never asks this site's Drupal for it.
 */
import {
  BACKENDS,
  COMPONENTS,
  CONTEXT_ONLY,
  PICKER,
  SHIPPED_WRAPPERS,
  SOURCES,
  UMAMI_COMPONENTS,
  liveComponentsOf,
  packageOf,
  pageFor,
} from '~/utils/live-examples'

// The props every module component shares. `value` and `settings` are
// objects, so they are set in code rather than from a control.
const SHARED_PROPS = [
  { name: 'langcode', type: 'string', control: 'text', description: 'The resource language code.' },
  { name: 'value', type: 'object', control: 'code', description: 'The v-model binding; supplies the data and skips the fetch.' },
]
const SETTINGS_PROP = { name: 'settings', type: 'object', control: 'code', description: 'Module settings overriding the site defaults.' }
const DECLARES_SETTINGS = ['DruxtEntity', 'DruxtEntityForm', 'DruxtView']

// Option lists are fetched once per backend and source and shared between
// mounts, because the component remounts when the markdown around it re-renders.
const cache = {}
const cached = (id, load) => {
  if (!cache[id]) {
    cache[id] = load().catch((e) => {
      delete cache[id]
      throw e
    })
  }
  return cache[id]
}

export default {
  name: 'DruxtExample',

  props: {
    /** Fixed on a component's own page; empty on the playground, which shows a picker. */
    component: { type: String, default: '' },
    /** On a module page: the picker offers that package's components only. */
    pkg: { type: String, default: '' },
  },

  data() {
    return {
      name: this.component || liveComponentsOf(this.pkg)[0] || '',
      backend: 'site',
      values: {},
      options: {},
      loading: {},
      wrapper: true,
      example: 'Default',
      openResolution: false,
      copied: false,
      error: null,
      source: '',
      resolution: { is: '', options: [] },
      renderKey: 0,
      // The instance mounts only after its resource is primed, or the first
      // fetch goes to this site's Drupal whatever the backend select says.
      primed: false,
      rawEmpty: false,
    }
  },

  computed: {
    backends: () => BACKENDS,
    fixed: ({ component }) => !!component,
    live: ({ name }) => !!COMPONENTS[name],
    contextOnly: ({ name }) => CONTEXT_ONLY[name] || null,
    shipped: ({ name }) => SHIPPED_WRAPPERS[name] || null,
    schema: ({ name }) => COMPONENTS[name] || { props: [], examples: [] },
    fixedValues: ({ schema }) => schema.fixedValues || {},
    /** Where the card sits, for analytics. */
    placement: ({ component, pkg }) => (component ? 'api' : pkg ? 'module' : 'playground'),

    picker: ({ pkg }) =>
      PICKER.map((group) => ({
        ...group,
        options: group.names
          .filter((n) => !pkg || packageOf(n) === pkg)
          .map((n) => {
            const why = CONTEXT_ONLY[n] ? (CONTEXT_ONLY[n].parent ? `rendered by ${CONTEXT_ONLY[n].parent}` : CONTEXT_ONLY[n].reason) : SHIPPED_WRAPPERS[n] ? `shown by ${SHIPPED_WRAPPERS[n].by}` : ''
            return { name: n, label: why ? `${n} (${why})` : n }
          }),
      })).filter((group) => group.options.length),

    rows: ({ schema, name }) => [
      ...(schema.props || []),
      ...SHARED_PROPS,
      ...(DECLARES_SETTINGS.includes(name) ? [SETTINGS_PROP] : []),
    ],

    chips: ({ schema, example }) => {
      const list = (schema.examples || []).map((e) => ({ ...e, selected: e.label === example }))
      if (example === 'Edited') list.push({ label: 'Edited', props: {}, edited: true, selected: true })
      return list
    },

    /** Props handed to the component: chain values composed, internal steps dropped, unset left out. */
    renderProps: ({ schema, values, fixedValues }) => {
      const out = {}
      const internal = new Set(((schema.chain || {}).steps || []).filter((s) => s.internal).map((s) => s.name))
      for (const [key, value] of Object.entries({ ...values, ...fixedValues })) {
        if (internal.has(key) || key === 'wrapper' || value === undefined || value === '') continue
        out[key] = value
      }
      if (schema.chain && schema.chain.compose) Object.assign(out, schema.chain.compose(values))
      return out
    },

    ready: ({ schema, values, live }) => {
      if (!live) return false
      for (const step of (schema.chain || {}).steps || []) if (step.required && !values[step.name]) return false
      for (const prop of schema.props || []) if (prop.required && !values[prop.name]) return false
      return true
    },

    snippet: ({ name, renderProps, wrapper }) => {
      const attrs = Object.entries(renderProps).map(([k, v]) =>
        typeof v === 'boolean' || typeof v === 'number' ? `:${k}="${v}"` : `${k}="${v}"`,
      )
      if (!wrapper) attrs.push(':wrapper="false"')
      return `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''} />`
    },

    resolutionLine: ({ resolution }) => {
      if (!resolution.options.length) return 'Resolving the component.'
      const n = resolution.options.length
      const k = resolution.options.indexOf(resolution.is)
      const count = `Druxt looked for ${n} component${n === 1 ? '' : 's'}.`
      if (k < 0) return `${count} None matched; it used its own wrapper.`
      return `${count} The ${['1st', '2nd', '3rd'][k] || k + 1 + 'th'} matched.`
    },

    dirtyChain: ({ schema, values }) => ((schema.chain || {}).steps || []).some((s) => values[s.name]),

    storybook: ({ backend, schema, renderProps }) => {
      const b = BACKENDS[backend]
      if (!b.storybook || !schema.story) return null
      const carried = Object.entries(renderProps).filter(([k]) => (schema.args || []).includes(k))
      const args = carried.map(([k, v]) => `${k}:${typeof v === 'boolean' ? '!' + v : v}`).join(';')
      return {
        href: `${b.storybook}?path=/story/${schema.story}${args ? '&args=' + encodeURIComponent(args) : ''}`,
        label: carried.length ? `Open in ${b.storybookLabel} Storybook` : `Open this component in ${b.storybookLabel} Storybook`,
      }
    },
  },

  watch: {
    component(value) {
      this.name = value
    },
    name() {
      this.reset()
      if (this.name) this.track('example_component')
    },
    backend() {
      this.reset()
      this.track('example_backend')
    },
  },

  mounted() {
    if (this.name) {
      this.reset()
      this.track('example_component')
    }
  },

  methods: {
    pageFor,

    /** One GA4 event per interaction. gtag() exists only on production, so this is a no-op elsewhere. */
    track(event, params = {}) {
      window.gtag?.('event', event, { component: this.name, backend: this.backend, placement: this.placement, ...params })
    },

    supports(backend) {
      return backend === 'site' || !this.name || UMAMI_COMPONENTS.includes(this.name)
    },

    /**
     * Read what the instance looked for and what it chose, and whether raw
     * output came to anything.
     *
     * DruxtModule keeps both on the instance, but sets them after its own
     * fetch, which never re-renders this component. So poll the ref, briefly.
     */
    readResolution(key) {
      let tries = 0
      const look = () => {
        if (key !== this.renderKey) return
        const c = (this.$refs.instance || {}).component
        if (c && (c.options || []).length) {
          this.resolution = { is: c.is, options: [...c.options] }
          const stage = this.$refs.stage
          this.rawEmpty = !this.wrapper && !!stage && !stage.textContent.trim() && !stage.querySelector('img, svg, input, a')
          return
        }
        if (++tries < 40) setTimeout(look, 150)
      }
      this.$nextTick(look)
    },

    /** Only entity types and bundles this site holds display schemas for can render. */
    allowed(step, list) {
      const filter = (((this.$druxt || {}).settings || {}).schema || {}).filter || []
      if (!filter.length || this.backend !== 'site') return list
      if (step.name === 'entityType') {
        const types = new Set(filter.map((p) => p.split('--')[0]))
        return list.filter((o) => types.has(o.value)).sort((a, b) => (a.value === 'node' ? -1 : b.value === 'node' ? 1 : 0))
      }
      if (step.name === 'bundle') {
        const type = this.values.entityType
        return list.filter((o) => filter.some((p) => new RegExp('^' + p).test(`${type}--${o.value}--`)))
      }
      return list
    },

    /** Back to the component as documented: defaults, first example, wrapper on. */
    async reset() {
      if (!this.supports(this.backend)) {
        // The watcher brings us back here.
        this.backend = 'site'
        return
      }
      this.error = null
      this.resolution = { is: '', options: [] }
      this.rawEmpty = false
      this.values = {}
      this.wrapper = true
      this.example = 'Default'
      if (!this.live) return
      try {
        for (const prop of this.schema.props || []) if (prop.source) await this.loadOptions(prop.source, {})
        await this.autoFill()
      } catch (e) {
        this.error = e.message
      }
    },

    optionsKey(source, deps) {
      return source + JSON.stringify(deps)
    },

    async loadOptions(source, deps) {
      const key = this.optionsKey(source, deps)
      this.$set(this.loading, source, true)
      try {
        const list = await cached(`${this.backend}:${key}`, () => SOURCES[source](BACKENDS[this.backend].api, deps))
        this.$set(this.options, key, list)
        return list
      } finally {
        this.$set(this.loading, source, false)
      }
    },

    depsOf(step) {
      const deps = {}
      for (const n of step.needs || []) deps[n] = this.values[n] || this.fixedValues[n] || (n === 'schemaType' ? 'view' : undefined)
      return deps
    },
    optionsOf(step) {
      return this.allowed(step, this.options[this.optionsKey(step.source, this.depsOf(step))] || [])
    },
    loadingOf(step) {
      return !!this.loading[step.source]
    },
    stepEnabled(step) {
      return (step.needs || []).every((n) => n === 'schemaType' || this.values[n])
    },

    async loadStep(i) {
      const step = ((this.schema.chain || {}).steps || [])[i]
      if (!step || !this.stepEnabled(step)) return []
      return this.loadOptions(step.source, this.depsOf(step))
    },

    /** The value a step should take on its own: its default if offered, else the first option. */
    pickFor(step, list) {
      if (step.default && list.find((o) => o.value === step.default)) return step.default
      return (list[0] || {}).value
    },

    /** Set one chain step, clear everything after it, and fill those steps in. */
    async setStep(i, value) {
      const steps = this.schema.chain.steps
      this.$set(this.values, steps[i].name, value || undefined)
      for (let j = i + 1; j < steps.length; j++) this.$set(this.values, steps[j].name, undefined)
      this.markEdited()
      this.track('example_prop', { prop: steps[i].name })
      await this.fillFrom(i + 1)
      this.rerender()
    },

    async fillFrom(start) {
      const steps = (this.schema.chain || {}).steps || []
      for (let i = start; i < steps.length; i++) {
        await this.loadStep(i)
        const pick = this.pickFor(steps[i], this.optionsOf(steps[i]))
        if (!pick) break
        this.$set(this.values, steps[i].name, pick)
      }
    },

    /** First load: walk the chain, then give each select a value that renders something. */
    async autoFill() {
      await this.fillFrom(0)
      for (const prop of this.schema.props || []) {
        if (prop.source && !this.values[prop.name]) {
          const list = this.options[this.optionsKey(prop.source, {})] || []
          const preferred = list.find((o) => /branding|main/.test(o.label)) || list[0]
          if (preferred) this.$set(this.values, prop.name, preferred.value)
        }
      }
      this.example = 'Default'
      this.rerender()
    },

    async setValue(prop, value) {
      this.$set(this.values, prop, value)
      this.markEdited()
      this.track('example_prop', { prop })
      // Form swaps mode for form modes.
      if (prop === 'schemaType' && this.schema.chain) {
        const i = this.schema.chain.steps.findIndex((s) => s.name === 'mode')
        if (i >= 0) {
          this.$set(this.values, 'mode', undefined)
          await this.fillFrom(i)
        }
      }
      this.rerender()
    },

    setWrapper(on) {
      this.wrapper = on
      this.$set(this.values, 'wrapper', on ? undefined : false)
      this.markEdited()
      this.track('example_wrapper', { wrapper: on ? 'wrapped' : 'raw' })
      this.rerender()
    },

    toggleValue(prop) {
      const v = this.values[prop.name]
      return v === undefined ? prop.default !== false : v !== false
    },

    isDirty(prop) {
      const v = this.values[prop.name]
      return v !== undefined && v !== prop.default
    },

    /** Select the preset the values match, or Edited. Which instance renders is a choice, not an edit. */
    markEdited() {
      const match = (this.schema.examples || []).find((chip) => {
        const plain = (this.schema.props || []).filter((p) => !p.source).every((p) => this.values[p.name] === chip.props[p.name] || (this.values[p.name] === undefined && chip.props[p.name] === undefined))
        return plain && this.wrapper === (chip.props.wrapper !== false)
      })
      this.example = match ? match.label : 'Edited'
    },

    /** Load a preset: plain props back to the example's values; the chain and instance pickers stay as chosen. */
    applyExample(chip) {
      if (chip.edited) return
      this.example = chip.label
      this.track('example_preset', { preset: chip.label })
      for (const p of this.schema.props || []) {
        if (p.source && chip.props[p.name] === undefined) continue
        this.$set(this.values, p.name, chip.props[p.name])
      }
      this.wrapper = chip.props.wrapper !== false
      this.$set(this.values, 'wrapper', this.wrapper ? undefined : false)
      this.rerender()
    },

    grouped(prop) {
      const list = this.options[this.optionsKey(prop.source, {})] || []
      if (!list.some((o) => o.group)) return []
      return [...new Set(list.map((o) => o.group))].map((group) => ({ group, items: list.filter((o) => o.group === group) }))
    },
    ungrouped(prop) {
      return this.options[this.optionsKey(prop.source, {})] || []
    },

    /** Prime a by-uuid resource from the chosen backend, then re-key the instance. */
    async rerender() {
      this.error = null
      this.primed = false
      this.rawEmpty = false
      this.resolution = { is: '', options: [] }
      if (!this.ready) return
      const b = BACKENDS[this.backend]
      const uuid = this.renderProps.uuid
      const type = this.name === 'DruxtBlock' ? 'block--block' : this.renderProps.type
      try {
        if (uuid && type) {
          const [entity, bundle] = type.split('--')
          const href = `${b.api}/${entity}/${bundle}/${uuid}`
          const res = await fetch(href, { headers: { Accept: 'application/vnd.api+json' } })
          if (!res.ok) throw new Error(`${res.status} from ${href}`)
          const body = await res.json()
          this.$store.commit('druxt/addResource', { prefix: undefined, resource: { data: body.data, links: { self: { href } } } })
          this.source = href
        } else {
          this.source = b.api
        }
        this.primed = true
        this.renderKey++
        this.readResolution(this.renderKey)
      } catch (e) {
        this.error = e.message
      }
    },

    retry() {
      this.reset()
    },

    async copy() {
      try {
        await navigator.clipboard.writeText(this.snippet)
        this.copied = true
        this.track('example_copy')
        setTimeout(() => {
          this.copied = false
        }, 1500)
      } catch (e) {
        // No clipboard here; the text is on screen to select.
      }
    },
  },
}
</script>
