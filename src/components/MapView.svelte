<script lang="ts">
  import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type ImageSource } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre locates its worker relative to its own module, which breaks once Vite bundles it.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
  import { onMount } from 'svelte'
  import type { LngLat } from '../lib/terrain/geo'
  import type { Bounds } from '../lib/offline/areas'
  import { BASEMAPS, initialStyle, type BasemapId } from '../lib/map/style'
  import { AWS_TERRARIUM, SWISS_ARCHIVE } from '../lib/terrain/loader'

  export interface Overlay {
    url: string
    north: number
    south: number
    west: number
    east: number
  }

  export interface RouteLine {
    id: number
    points: LngLat[]
    selected: boolean
    /** Dashed: a route the pilot's glide ratio does not make. */
    dashed: boolean
  }

  interface Props {
    start: LngLat | null
    landing: LngLat | null
    routes: RouteLine[]
    /** Point highlighted from the profile chart. */
    highlight: LngLat | null
    overlay: Overlay | null
    basemap: BasemapId
    showSlope: boolean
    /** Fit the map to these bounds whenever the object changes. */
    fitTo: Bounds | null
    onviewchange: (bounds: Bounds) => void
    ontoggleslope: () => void
    onpick: (p: LngLat) => void
    onselectroute: (id: number) => void
    onmovestart: (p: LngLat) => void
    onmovelanding: (p: LngLat) => void
    onhover: (p: LngLat | null) => void
  }

  let { start, landing, routes, highlight, overlay, basemap, showSlope, ontoggleslope, fitTo, onviewchange, onpick, onselectroute, onmovestart, onmovelanding, onhover }: Props =
    $props()

  let container: HTMLDivElement
  let map: Map | undefined = $state()
  let loaded = $state(false)
  /** The map could not start, usually because WebGL is unavailable. */
  let failed = $state(false)
  let routeBadges: Marker[] = []
  let startMarker: Marker | undefined
  let landingMarker: Marker | undefined

  /** Throws when the browser cannot create a WebGL context. */
  function createMap(): Map {
    return new Map({
      container,
      style: initialStyle(),
      center: start ? [start.lng, start.lat] : [8.2, 46.8],
      zoom: start ? 11 : 7.5,
      maxZoom: 18,
      attributionControl: { compact: true, customAttribution: [SWISS_ARCHIVE.attribution, AWS_TERRARIUM.attribution] },
    })
  }

  onMount(() => {
    setWorkerUrl(maplibreWorkerUrl)
    let m: Map
    try {
      m = createMap()
    } catch (err) {
      console.error(err)
      failed = true
      return
    }
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new ScaleControl({ unit: 'metric' }), 'top-right')
    m.on('load', () => {
      // MapLibre opens the compact attribution at first; start folded to its (i) button.
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      const empty = { type: 'FeatureCollection' as const, features: [] }
      m.addSource('route', { type: 'geojson', data: empty })
      m.addSource('highlight', { type: 'geojson', data: empty })
      // Other routes: thin, gray, clickable.
      m.addLayer({
        id: 'route-other',
        type: 'line',
        source: 'route',
        filter: ['!=', ['get', 'selected'], true],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#5f5e5a', 'line-width': 2.5, 'line-opacity': 0.9 },
      })
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        filter: ['==', ['get', 'selected'], true],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6 },
      })
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        filter: ['all', ['==', ['get', 'selected'], true], ['!=', ['get', 'dashed'], true]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1a1a19', 'line-width': 3 },
      })
      m.addLayer({
        id: 'route-dashed',
        type: 'line',
        source: 'route',
        filter: ['all', ['==', ['get', 'selected'], true], ['==', ['get', 'dashed'], true]],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#1a1a19', 'line-width': 3, 'line-dasharray': [2, 1.5] },
      })
      // Slope classes above the AGL overlay (inserted below it), under the routes.
      m.moveLayer('slope', 'route-other')
      m.on('mouseenter', 'route-other', () => (m.getCanvas().style.cursor = 'pointer'))
      m.on('mouseleave', 'route-other', () => (m.getCanvas().style.cursor = ''))
      m.addLayer({
        id: 'highlight',
        type: 'circle',
        source: 'highlight',
        paint: { 'circle-radius': 6, 'circle-color': '#6250d6', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
      })
      loaded = true
    })
    m.on('click', (e) => {
      // A click on another route selects it rather than moving a marker.
      const box: [[number, number], [number, number]] = [
        [e.point.x - 4, e.point.y - 4],
        [e.point.x + 4, e.point.y + 4],
      ]
      const hit = m.getLayer('route-other') ? m.queryRenderedFeatures(box, { layers: ['route-other'] })[0] : undefined
      if (hit) onselectroute(hit.properties.id as number)
      else onpick({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    })
    m.on('mousemove', (e) => onhover({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
    m.on('mouseout', () => onhover(null))
    const reportView = () => {
      const b = m.getBounds()
      onviewchange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
    }
    m.on('moveend', reportView)
    m.once('load', reportView)
    map = m
    return () => m.remove()
  })

  /** Point halfway along a polyline (by vertex distance in degrees: fine for placing a label). */
  function midpoint(points: LngLat[]): LngLat {
    const seg = points.slice(1).map((p, i) => Math.hypot(p.lng - points[i].lng, p.lat - points[i].lat))
    let half = seg.reduce((a, b) => a + b, 0) / 2
    for (let i = 0; i < seg.length; i++) {
      if (half <= seg[i]) {
        const t = seg[i] ? half / seg[i] : 0
        return { lng: points[i].lng + (points[i + 1].lng - points[i].lng) * t, lat: points[i].lat + (points[i + 1].lat - points[i].lat) * t }
      }
      half -= seg[i]
    }
    return points[points.length - 1]
  }

  /** Keeps a draggable marker in sync with a point. */
  function syncMarker(marker: Marker | undefined, p: LngLat | null, color: string, onmove: (p: LngLat) => void) {
    if (!map) return marker
    if (!p) {
      marker?.remove()
      return undefined
    }
    if (marker) return marker.setLngLat([p.lng, p.lat])
    const created = new Marker({ color, draggable: true }).setLngLat([p.lng, p.lat]).addTo(map)
    created.on('dragend', () => {
      const q = created.getLngLat()
      onmove({ lng: q.lng, lat: q.lat })
    })
    return created
  }

  $effect(() => {
    startMarker = syncMarker(startMarker, start, '#1a1a19', onmovestart)
  })

  $effect(() => {
    landingMarker = syncMarker(landingMarker, landing, '#2a78d6', onmovelanding)
  })

  $effect(() => {
    if (!map || !loaded) return
    const features = routes.map((r) => ({
      type: 'Feature' as const,
      properties: { id: r.id, selected: r.selected, dashed: r.dashed },
      geometry: { type: 'LineString' as const, coordinates: r.points.map((p) => [p.lng, p.lat]) },
    }))
    ;(map.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features })

    // A letter at the middle of each route, matching the route list.
    for (const badge of routeBadges) badge.remove()
    routeBadges = routes.map((r) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = r.selected ? 'route-badge selected' : 'route-badge'
      el.textContent = String.fromCharCode(65 + r.id)
      el.setAttribute('aria-label', `Route ${el.textContent}`)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onselectroute(r.id)
      })
      const mid = midpoint(r.points)
      return new Marker({ element: el }).setLngLat([mid.lng, mid.lat]).addTo(map!)
    })
  })

  $effect(() => {
    if (!map || !loaded) return
    const features = highlight
      ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [highlight.lng, highlight.lat] } }]
      : []
    ;(map.getSource('highlight') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  })

  $effect(() => {
    if (!map || !loaded) return
    for (const id of Object.keys(BASEMAPS)) map.setLayoutProperty(id, 'visibility', id === basemap ? 'visible' : 'none')
  })

  $effect(() => {
    if (!map || !fitTo) return
    map.fitBounds(
      [
        [fitTo.west, fitTo.south],
        [fitTo.east, fitTo.north],
      ],
      { padding: 20 },
    )
  })

  $effect(() => {
    if (!map || !loaded) return
    map.setLayoutProperty('slope', 'visibility', showSlope ? 'visible' : 'none')
  })

  // AGL overlay as an image source, above the basemaps.
  $effect(() => {
    if (!map || !loaded) return
    const source = map.getSource('agl') as ImageSource | undefined
    if (!overlay) {
      if (source) {
        map.removeLayer('agl')
        map.removeSource('agl')
      }
      return
    }
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [overlay.west, overlay.north],
      [overlay.east, overlay.north],
      [overlay.east, overlay.south],
      [overlay.west, overlay.south],
    ]
    if (source) {
      source.updateImage({ url: overlay.url, coordinates })
    } else {
      map.addSource('agl', { type: 'image', url: overlay.url, coordinates })
      map.addLayer(
        {
          id: 'agl',
          type: 'raster',
          source: 'agl',
          paint: { 'raster-opacity': 0.7, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
        },
        'slope',
      )
    }
  })
</script>

<div class="map" bind:this={container}></div>
{#if failed}
  <div class="map-failed" role="alert">
    <strong>The map cannot be displayed</strong>
    <p>
      This browser could not start WebGL, which the map needs. Turn on hardware acceleration in the browser settings, or
      try another browser.
    </p>
  </div>
{:else}
  <button type="button" class="layer-toggle" aria-pressed={showSlope} onclick={ontoggleslope} title="swisstopo slope classes over 30°">
    Slopes &gt; 30°
  </button>
{/if}

<style>
  .map :global(.route-badge) {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid #ffffff;
    background: #5f5e5a;
    color: #ffffff;
    font: 600 12px/1 system-ui, sans-serif;
    cursor: pointer;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
  }

  .map :global(.route-badge.selected) {
    background: #1a1a19;
    width: 26px;
    height: 26px;
    font-size: 13px;
  }

  .map {
    position: absolute;
    inset: 0;
  }

  .map-failed {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(360px, calc(100% - 32px));
    padding: 14px 16px;
    background: var(--surface);
    color: var(--text);
    border-radius: 10px;
    box-shadow: var(--shadow);
  }

  .map-failed p {
    margin: 6px 0 0;
    color: var(--text-muted);
  }

  .layer-toggle {
    position: absolute;
    top: 110px;
    right: 10px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 500;
    color: #1a1a19;
    background: #ffffff;
    border: 0;
    border-radius: 4px;
    box-shadow: 0 0 0 2px rgb(0 0 0 / 0.1);
  }

  .layer-toggle[aria-pressed='true'] {
    background: #1a1a19;
    color: #ffffff;
  }
</style>
