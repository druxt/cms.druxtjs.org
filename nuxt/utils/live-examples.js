/**
 * What the live example card knows about each Druxt component.
 *
 * A stopgap until docgen emits this per component: the props
 * a reader can change, where a select's options come from, and the examples
 * offered as presets. The card reads nothing else.
 */

/**
 * Backends the card can render against. Both are proxied onto this origin.
 */
export const BACKENDS = {
  site: { label: "This site's Drupal", api: '/jsonapi' },
  umami: {
    label: 'Umami demo',
    api: '/umami-jsonapi',
    storybook: 'https://storybook.umami.demo.druxtjs.org/',
    storybookLabel: 'Umami',
  },
}

const get = async (api, path) => {
  const response = await fetch(`${api}${path}`, { headers: { Accept: 'application/vnd.api+json' } })
  if (!response.ok) throw new Error(`${response.status} from ${path}`)
  return response.json()
}

const label = (o) => {
  const a = o.attributes || {}
  return a.title || a.name || a.info || a.label || a.drupal_internal__id || o.id
}

/**
 * Option lists a select can be filled from. Each returns [{ value, label, group? }].
 * Dependent sources take the values chosen before them.
 */
export const SOURCES = {
  blocks: async (api) => {
    const { data } = await get(api, '/block/block?page%5Blimit%5D=50')
    return data
      .filter((o) => o.attributes.status)
      .map((o) => ({
        value: o.id,
        label: o.attributes.drupal_internal__id,
        suffix: o.attributes.region,
        group: o.attributes.theme,
      }))
      .sort((a, b) => (a.group + a.label).localeCompare(b.group + b.label))
  },

  themes: async (api) => {
    const { data } = await get(api, '/block/block?page%5Blimit%5D=50&fields%5Bblock--block%5D=theme')
    return [...new Set(data.map((o) => o.attributes.theme))].sort().map((t) => ({ value: t, label: t }))
  },

  regions: async (api, { theme }) => {
    if (!theme) return []
    const { data } = await get(api, '/block/block?page%5Blimit%5D=50&fields%5Bblock--block%5D=region,theme')
    return [...new Set(data.filter((o) => o.attributes.theme === theme).map((o) => o.attributes.region))]
      .sort()
      .map((r) => ({ value: r, label: r }))
  },

  // Entity types, then bundles, from the enabled view displays.
  entityTypes: async (api) => {
    const { data } = await get(api, '/entity_view_display/entity_view_display?filter%5Bstatus%5D=1&fields%5Bentity_view_display--entity_view_display%5D=targetEntityType')
    return [...new Set(data.map((o) => o.attributes.targetEntityType))].sort().map((t) => ({ value: t, label: t }))
  },

  bundles: async (api, { entityType }) => {
    if (!entityType) return []
    const { data } = await get(api, `/entity_view_display/entity_view_display?filter%5Bstatus%5D=1&filter%5BtargetEntityType%5D=${entityType}&fields%5Bentity_view_display--entity_view_display%5D=bundle`)
    return [...new Set(data.map((o) => o.attributes.bundle))].sort().map((b) => ({ value: b, label: b }))
  },

  entities: async (api, { entityType, bundle }) => {
    if (!entityType || !bundle) return []
    const { data } = await get(api, `/${entityType}/${bundle}?page%5Blimit%5D=50`)
    // The Storybook stories label entities `title (id)`; the card matches them.
    return data.map((o) => ({ value: o.id, label: `${label(o)} (${o.id.slice(0, 8)})` })).sort((a, b) => a.label.localeCompare(b.label))
  },

  // View modes or form modes for a bundle, by schemaType.
  modes: async (api, { entityType, bundle, schemaType = 'view' }) => {
    if (!entityType || !bundle) return []
    const type = `entity_${schemaType}_display`
    const { data } = await get(api, `/${type}/${type}?filter%5Bstatus%5D=1&filter%5BtargetEntityType%5D=${entityType}&filter%5Bbundle%5D=${bundle}&fields%5B${type}--${type}%5D=mode`)
    return [...new Set(data.map((o) => o.attributes.mode))]
      .sort((a, b) => (a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b)))
      .map((m) => ({ value: m, label: m }))
  },

  menus: async (api) => {
    const { data } = await get(api, '/menu/menu?page%5Blimit%5D=50')
    // Labelled `label (machine_name)`, as the Storybook stories label them.
    return data.map((o) => ({ value: o.attributes.drupal_internal__id, label: `${o.attributes.label} (${o.attributes.drupal_internal__id})` })).sort((a, b) => a.label.localeCompare(b.label))
  },

  views: async (api) => {
    const { data } = await get(api, '/view/view?page%5Blimit%5D=50&filter%5Bstatus%5D=1')
    return data.map((o) => ({ value: o.attributes.drupal_internal__id, label: `${o.attributes.label} (${o.attributes.drupal_internal__id})` })).sort((a, b) => a.label.localeCompare(b.label))
  },

  displays: async (api, { viewId }) => {
    if (!viewId) return []
    const { data } = await get(api, `/view/view?filter%5Bdrupal_internal__id%5D=${viewId}`)
    const displays = ((data[0] || {}).attributes || {}).display || {}
    return Object.keys(displays).map((d) => ({ value: d, label: d }))
  },
}

/**
 * One entry per component. `props` are rows in the panel, in order;
 * `chain` groups dependent selects into one row; `examples` are the presets.
 */
export const COMPONENTS = {
  DruxtBlock: {
    story: 'druxt-blocks-druxtblock--default',
    args: ['id', 'uuid'],
    props: [
      { name: 'uuid', type: 'string', control: 'select', source: 'blocks', required: true, description: 'The block entity UUID.' },
    ],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtBlockRegion: {
    story: 'druxt-blocks-druxtblockregion--default',
    args: [],
    chain: {
      label: 'theme, region',
      description: 'Each one narrows the next.',
      steps: [
        { name: 'theme', source: 'themes', required: true },
        { name: 'name', source: 'regions', needs: ['theme'] },
      ],
    },
    props: [],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtEntity: {
    story: 'druxt-entity-druxtentity--default',
    args: ['type', 'schemaType'],
    chain: {
      label: 'type, uuid, mode',
      description: 'Each one narrows the next.',
      steps: [
        { name: 'entityType', source: 'entityTypes', required: true, internal: true },
        { name: 'bundle', source: 'bundles', needs: ['entityType'], required: true, internal: true },
        { name: 'uuid', source: 'entities', needs: ['entityType', 'bundle'] },
        { name: 'mode', source: 'modes', needs: ['entityType', 'bundle', 'schemaType'] },
      ],
      // `type` is built from the two internal steps.
      compose: ({ entityType, bundle }) => (entityType && bundle ? { type: `${entityType}--${bundle}` } : {}),
    },
    props: [
      { name: 'schemaType', type: 'enum', control: 'segmented', options: ['view', 'form'], default: 'view', note: 'Form swaps mode for form modes.', description: 'Drupal display schema type.' },
    ],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtEntityForm: {
    story: 'druxt-entity-druxtentityform--default',
    args: ['type'],
    chain: {
      label: 'type, uuid, mode',
      description: 'Each one narrows the next.',
      steps: [
        { name: 'entityType', source: 'entityTypes', required: true, internal: true },
        { name: 'bundle', source: 'bundles', needs: ['entityType'], required: true, internal: true },
        { name: 'uuid', source: 'entities', needs: ['entityType', 'bundle'] },
        { name: 'mode', source: 'modes', needs: ['entityType', 'bundle', 'schemaType'] },
      ],
      compose: ({ entityType, bundle }) => (entityType && bundle ? { type: `${entityType}--${bundle}` } : {}),
    },
    // DruxtEntity with the schema fixed to form, plus submit and reset events.
    fixedValues: { schemaType: 'form' },
    props: [],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtMenu: {
    story: 'druxt-menu-druxtmenu--default',
    args: ['name'],
    props: [
      { name: 'name', type: 'string', control: 'select', source: 'menus', default: 'main', description: 'The menu machine name.' },
      { name: 'minDepth', type: 'number', control: 'number', default: 0, description: 'The minimum depth to render.' },
      { name: 'maxDepth', type: 'number', control: 'number', default: null, description: 'The maximum depth to render.' },
    ],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtView: {
    story: 'druxt-views-druxtview--default',
    args: [],
    chain: {
      label: 'viewId, displayId',
      description: 'Each one narrows the next.',
      steps: [
        { name: 'viewId', source: 'views', required: true },
        { name: 'displayId', source: 'displays', needs: ['viewId'], default: 'default' },
      ],
    },
    props: [
      { name: 'arguments', type: 'string', control: 'text', description: 'Contextual filter arguments, comma separated.' },
    ],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtBreadcrumb: {
    story: 'druxt-breadcrumb-druxtbreadcrumb--default',
    args: [],
    props: [
      { name: 'path', type: 'string', control: 'text', description: 'The path to build the breadcrumb for.' },
      { name: 'home', type: 'boolean', control: 'toggle', default: true, description: 'Whether to include the home link.' },
    ],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtRouter: {
    story: 'druxt-router-druxtrouter--default',
    args: [],
    props: [
      { name: 'path', type: 'string', control: 'text', description: 'The path to resolve.' },
    ],
    examples: [{ label: 'Default', props: {} }],
  },

  DruxtSite: {
    story: 'druxt-site-druxtsite--default',
    args: [],
    props: [
      { name: 'theme', type: 'string', control: 'select', source: 'themes', required: true, description: 'The Drupal theme whose regions render.' },
    ],
    examples: [{ label: 'Default', props: {} }],
  },
}

export const COMPONENT_NAMES = Object.keys(COMPONENTS)

/**
 * The other two tiers of the 45 components druxt.js ships.
 *
 * Tier 2 renders only inside a parent: its required props are objects a
 * parent passes, which no select can produce. Tier 3 is the shipped default
 * wrappers, which are output, never a card of their own.
 */
export const CONTEXT_ONLY = {
  DruxtField: { parent: 'DruxtEntity' },
  DruxtMenuItem: { parent: 'DruxtMenu' },
  DruxtViewsFilter: { parent: 'DruxtView' },
  DruxtViewsFilters: { parent: 'DruxtView' },
  DruxtViewsSorts: { parent: 'DruxtView' },
  DruxtViewsPager: { parent: 'DruxtView' },
  DruxtEntityFormButtons: { parent: 'DruxtEntityForm' },
  DruxtRouterEntity: { parent: 'DruxtRouter' },
  DruxtRouterView: { parent: 'DruxtRouter' },
  Druxt: { reason: "Druxt's own machinery" },
  DruxtModule: { reason: 'The base every module component extends' },
  DruxtWrapper: { reason: 'What Druxt renders when nothing else matches' },
  DruxtDebug: { reason: 'Development output' },
  DruxtDevelTemplate: { reason: 'Development output' },
}

export const SHIPPED_WRAPPERS = {
  DruxtBlockBlockContent: { by: 'DruxtBlock', when: 'the plugin is block_content' },
  DruxtBlockPageTitleBlock: { by: 'DruxtBlock', when: 'the plugin is page_title_block' },
  DruxtBlockSystemMainBlock: { by: 'DruxtBlock', when: 'the plugin is system_main_block' },
  DruxtBlockSystemBreadcrumbBlock: { by: 'DruxtBlock', when: 'the plugin is system_breadcrumb_block' },
  DruxtBlockSystemMenuBlock: { by: 'DruxtBlock', when: 'the plugin is system_menu_block' },
  DruxtBlockViewsBlock: { by: 'DruxtBlock', when: 'the plugin is views_block' },
  ...Object.fromEntries(
    [
      'BasicString', 'DatetimeDefault', 'EntityReferenceEntityView', 'EntityReferenceLabel',
      'EntityReferenceRevisionsEntityView', 'FileDefault', 'Image', 'Link', 'ListDefault',
      'NumberInteger', 'ResponsiveImage', 'String', 'TextDefault', 'TextSummaryOrTrimmed',
      'TextTrimmed', 'Timestamp',
    ].map((name) => [`DruxtField${name}`, { by: 'DruxtEntity', when: `a field uses the ${name} formatter` }]),
  ),
}

/** The package each component's API page lives under. */
export const PACKAGES = {
  DruxtBlock: 'blocks',
  DruxtBlockRegion: 'blocks',
  DruxtEntity: 'entity',
  DruxtEntityForm: 'entity',
  DruxtMenu: 'menu',
  DruxtView: 'views',
  DruxtBreadcrumb: 'breadcrumb',
  DruxtRouter: 'router',
  DruxtSite: 'site',
}

/** The API page for a tier-1 component. */
export const pageFor = (name) => (PACKAGES[name] ? `/api/packages/${PACKAGES[name]}/components/${name}` : null)

/** The package of any tier: a tier-2 or -3 component belongs with its parent. */
export const packageOf = (name) =>
  PACKAGES[name] || PACKAGES[(CONTEXT_ONLY[name] || {}).parent] || PACKAGES[(SHIPPED_WRAPPERS[name] || {}).by] || null

/** The components that render on their own in a package, for its module page. */
export const liveComponentsOf = (pkg) => COMPONENT_NAMES.filter((name) => PACKAGES[name] === pkg)

/** Whether a component has a card of any tier, for its API page. */
export const knowsComponent = (name) => !!(COMPONENTS[name] || CONTEXT_ONLY[name] || SHIPPED_WRAPPERS[name])

/** The picker: three groups, only the first enabled. */
export const PICKER = [
  { label: 'Renders on its own', names: COMPONENT_NAMES, enabled: true },
  { label: 'Rendered by a parent', names: Object.keys(CONTEXT_ONLY), enabled: false },
  { label: 'Shipped default wrappers', names: Object.keys(SHIPPED_WRAPPERS), enabled: false },
]

/**
 * Components that can render against the Umami backend today.
 *
 * Entity schemas are generated at build time from this site's Drupal, and
 * nothing fetches one from a second backend at runtime, so DruxtEntity and
 * everything that needs a schema stay on this site's Drupal until a component
 * can be handed a client of its own.
 * Blocks need no schema and are primed into the store from a fieldless fetch.
 */
export const UMAMI_COMPONENTS = ['DruxtBlock']
