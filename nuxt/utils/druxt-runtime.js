import axios from 'axios'
import Vuex from 'vuex'
import { DruxtClient, DruxtStore } from 'druxt'
import { DruxtRouter, DruxtRouterStore } from 'druxt-router'
import { DruxtSchema, DruxtSchemaStore } from 'druxt-schema'
import { DruxtMenu, DruxtMenuStore } from 'druxt-menu'
import { DruxtViewsStore } from 'druxt-views'
import mutations from '~/store/mutations'

/**
 * A Druxt runtime of its own for one backend: a client, a store and the
 * services the modules inject. A component mounted under it renders against
 * that backend the way it would on a site built for it, sharing nothing
 * with this site's own.
 *
 * Display schemas are built from the backend's own configuration on demand,
 * where a site builds them once when it builds.
 *
 * @param {object} backend
 * @param {string} backend.baseUrl - The backend's own origin, as its JSON:API links name it.
 * @param {string} [backend.proxyRoot] - Where requests go on this origin instead; '' for this site's own proxy.
 * @param {object} [backend.settings] - The Druxt module settings to carry over.
 * @param {object} [backend.state] - This site's own store state, which its wrappers read.
 */
export function createRuntime({ baseUrl, proxyRoot = '', settings = {}, state = {} }) {
  // One axios for everything, sent through the proxy; the client strips
  // `baseUrl` from the links the backend hands back, so they stay relative.
  const http = axios.create({ baseURL: proxyRoot || undefined })
  // Files too: a file entity names its URL on the backend's own origin.
  if (proxyRoot) {
    const reroute = (o) => { if (o && o.type === 'file--file' && ((o.attributes || {}).uri || {}).url && o.attributes.uri.url.startsWith('/')) o.attributes.uri.url = proxyRoot + o.attributes.uri.url }
    http.interceptors.response.use((response) => {
      const body = response.data || {}
      ;[].concat(body.data || [], body.included || []).forEach(reroute)
      return response
    })
  }
  const options = { ...settings, baseUrl, endpoint: '/jsonapi', proxy: { api: false, files: false }, axios: http }
  const client = new DruxtClient(baseUrl, options)
  client.settings = options

  // This site's own store too, so its wrappers find what they read there. A
  // copy: this site's store is strict, and would object to a wrapper
  // committing here into an object it also holds.
  const store = new Vuex.Store({ state: JSON.parse(JSON.stringify(state)), mutations })
  for (const install of [DruxtStore, DruxtRouterStore, DruxtSchemaStore, DruxtMenuStore, DruxtViewsStore]) install({ store })
  store.$druxt = client
  // The router store reaches its siblings through the app.
  store.app = { store, context: {} }

  // What the modules' plugins inject, for the store and the root alike.
  const menu = new DruxtMenu(baseUrl, options)
  const router = new DruxtRouter(baseUrl, options)
  store.$druxtMenu = menu
  store.$druxtRouter = () => router

  const builder = new DruxtSchema(baseUrl, { ...options, schema: { filter: [] } })
  store.$druxtSchema = {
    /**
     * Build the schema a site would have generated for this id. The default
     * mode stands in for a missing one; a bundle with no display at all, such
     * as a file, gets an empty schema, so a slot can still render its entity.
     */
    import: async (id) => {
      const [entityType, bundle, mode, schemaType] = id.split('--')
      const index = await builder.druxt.getIndex()
      // The builder returns its Schema object even when generating found no display; the schema is then empty.
      const build = (m) => builder.getSchema({ entityType, bundle, mode: m, schemaType, filter: [], ...index[`${entityType}--${bundle}`] }).then((s) => (s && s.schema) || false, () => false)
      const schema = (await build(mode)) || (mode !== 'default' && (await build('default')))
      if (schema) return schema
      return { id, resourceType: `${entityType}--${bundle}`, config: { entityType, bundle, mode, schemaType, filter: [] }, fields: [] }
    },
  }

  return { axios: http, client, store, menu, router: store.$druxtRouter }
}
