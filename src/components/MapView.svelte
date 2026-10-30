<script lang="ts">
  import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type ImageSource } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre locates its worker relative to its own module, which breaks once Vite bundles it.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
  import { onMount } from 'svelte'
  import type { LngLat } from '../lib/terrain/geo'
  import type { Bounds, OfflineArea } from '../lib/offline/areas'
  import { BASEMAPS, initialStyle, type BasemapId } from '../lib/map/style'
  import { AWS_TERRARIUM, SWISS_ARCHIVE } from '../lib/terrain/loader'
  import { t } from '../lib/i18n/index.svelte'

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
    /** Points to fly over on the way, numbered in order. */
    waypoints: LngLat[]
    routes: RouteLine[]
    /** Point highlighted from the profile chart. */
    highlight: LngLat | null
    overlay: Overlay | null
    basemap: BasemapId
    showSlope: boolean
    /** Circle around the start within which a ground launch may run before lifting off. */
    takeoffRun: { center: LngLat; radius: number } | null
    /** Downloaded areas to outline (dashed when they have gaps). */
    offlineAreas: OfflineArea[]
    /** Whether the toggle for the outlines is shown, and its state. */
    hasOfflineAreas: boolean
    showOfflineAreas: boolean
    ontoggleofflineareas: () => void
    /** Fit the map to these bounds whenever the object changes. */
    fitTo: Bounds | null
    onviewchange: (bounds: Bounds) => void
    ontoggleslope: () => void
    onpick: (p: LngLat) => void
    onselectroute: (id: number) => void
    onmovestart: (p: LngLat) => void
    onmovelanding: (p: LngLat) => void
    onmovewaypoint: (index: number, p: LngLat) => void
    onhover: (p: LngLat | null) => void
    /** Shown next to the mouse pointer while it is over the map, e.g. the elevation there. */
    pointerLabel: string | null
  }

  let {
    start,
    landing,
    waypoints,
    routes,
    highlight,
    overlay,
    basemap,
    showSlope,
    ontoggleslope,
    takeoffRun,
    offlineAreas,
    hasOfflineAreas,
    showOfflineAreas,
    ontoggleofflineareas,
    fitTo,
    onviewchange,
    onpick,
    onselectroute,
    onmovestart,
    onmovelanding,
    onmovewaypoint,
    onhover,
    pointerLabel,
  }: Props = $props()

  /** Mouse position over the map (px from its top-left corner); null when elsewhere. */
  let pointer = $state<{ x: number; y: number } | null>(null)

  let container: HTMLDivElement
  let map: Map | undefined = $state()
  let loaded = $state(false)
  /** The map could not start, usually because WebGL is unavailable. */
  let failed = $state(false)
  let routeBadges: Marker[] = []
  let startMarker: Marker | undefined
  let landingMarker: Marker | undefined
  let waypointMarkers: Marker[] = []

  /** MapLibre's control texts, which it reads once, when the map is created. */
  const mapLocale = () => ({
    'NavigationControl.ZoomIn': t.map.zoomIn,
    'NavigationControl.ZoomOut': t.map.zoomOut,
    'AttributionControl.ToggleAttribution': t.map.attribution,
    'Map.Title': t.map.title,
    'Marker.Title': t.map.marker,
  })

  // After a change of language, relabel the controls MapLibre made.
  $effect(() => {
    if (!map) return
    const labels: [string, string][] = [
      ['.maplibregl-ctrl-zoom-in', t.map.zoomIn],
      ['.maplibregl-ctrl-zoom-out', t.map.zoomOut],
      ['.maplibregl-ctrl-attrib-button', t.map.attribution],
    ]
    for (const [selector, label] of labels) {
      const el = container.querySelector(selector)
      el?.setAttribute('title', label)
      el?.setAttribute('aria-label', label)
    }
    map.getCanvas().setAttribute('aria-label', t.map.title)
  })

  /** Throws when the browser cannot create a WebGL context. */
  function createMap(): Map {
    return new Map({
      container,
      style: initialStyle(),
      center: start ? [start.lng, start.lat] : [8.2, 46.8],
      zoom: start ? 11 : 7.5,
      maxZoom: 18,
      attributionControl: { compact: true, customAttribution: [SWISS_ARCHIVE.attribution, AWS_TERRARIUM.attribution] },
      locale: mapLocale(),
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
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    m.on('load', () => {
      // MapLibre opens the compact attribution at first; start folded to its (i) button.
      container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      const empty = { type: 'FeatureCollection' as const, features: [] }
      m.addSource('route', { type: 'geojson', data: empty })
      m.addSource('highlight', { type: 'geojson', data: empty })
      m.addSource('offline-areas', { type: 'geojson', data: empty })
      m.addSource('takeoff-run', { type: 'geojson', data: empty })
      // Downloaded areas: a light tint under the AGL overlay (inserted below the slopes)…
      m.addLayer(
        { id: 'offline-areas-fill', type: 'fill', source: 'offline-areas', paint: { 'fill-color': '#1f4e9c', 'fill-opacity': 0.06 } },
        'slope',
      )
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
      // …and an outline above it, under the routes.
      m.addLayer(
        {
          id: 'offline-areas-casing',
          type: 'line',
          source: 'offline-areas',
          layout: { 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.8 },
        },
        'route-other',
      )
      m.addLayer(
        {
          id: 'offline-areas',
          type: 'line',
          source: 'offline-areas',
          filter: ['==', ['get', 'complete'], true],
          layout: { 'line-join': 'round' },
          paint: { 'line-color': '#1f4e9c', 'line-width': 2 },
        },
        'route-other',
      )
      m.addLayer(
        {
          id: 'offline-areas-gaps',
          type: 'line',
          source: 'offline-areas',
          filter: ['!=', ['get', 'complete'], true],
          paint: { 'line-color': '#1f4e9c', 'line-width': 2, 'line-dasharray': [2, 1.5] },
        },
        'route-other',
      )
      // Takeoff run: a whitened circle around the start, under the routes.
      m.addLayer(
        { id: 'takeoff-run-fill', type: 'fill', source: 'takeoff-run', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.35 } },
        'route-other',
      )
      m.addLayer(
        {
          id: 'takeoff-run',
          type: 'line',
          source: 'takeoff-run',
          paint: { 'line-color': '#1a1a19', 'line-width': 2, 'line-dasharray': [2, 1] },
        },
        'route-other',
      )
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
    m.on('mousemove', (e) => {
      pointer = { x: e.point.x, y: e.point.y }
      onhover({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    })
    m.on('mouseout', () => {
      pointer = null
      onhover(null)
    })
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

  // Markers by position in the list: removing one renumbers the ones after it.
  $effect(() => {
    const m = map
    if (!m) return
    while (waypointMarkers.length > waypoints.length) waypointMarkers.pop()!.remove()
    waypoints.forEach((p, i) => {
      let marker = waypointMarkers[i]
      if (!marker) {
        const el = document.createElement('div')
        el.className = 'waypoint-marker'
        el.textContent = `${i + 1}`
        marker = new Marker({ element: el, draggable: true }).setLngLat([p.lng, p.lat]).addTo(m)
        const dragged = marker
        dragged.on('dragend', () => {
          const q = dragged.getLngLat()
          onmovewaypoint(i, { lng: q.lng, lat: q.lat })
        })
        waypointMarkers[i] = marker
      } else {
        marker.setLngLat([p.lng, p.lat])
      }
      marker.getElement().title = t.map.waypointTitle(i + 1)
    })
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
      el.setAttribute('aria-label', t.map.route(el.textContent))
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
    const features = []
    if (takeoffRun) {
      // A circle of `radius` meters, flat-earth: fine at this size.
      const { center, radius } = takeoffRun
      const dLat = radius / 111_320
      const dLng = dLat / Math.cos((center.lat * Math.PI) / 180)
      const ring = Array.from({ length: 49 }, (_, i) => {
        const a = (i / 48) * 2 * Math.PI
        return [center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]
      })
      features.push({ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [ring] } })
    }
    ;(map.getSource('takeoff-run') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  })

  $effect(() => {
    if (!map || !loaded) return
    const features = offlineAreas.map(({ bounds: b, complete }) => ({
      type: 'Feature' as const,
      properties: { complete },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [b.west, b.south],
            [b.east, b.south],
            [b.east, b.north],
            [b.west, b.north],
            [b.west, b.south],
          ],
        ],
      },
    }))
    ;(map.getSource('offline-areas') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
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
{#if pointer && pointerLabel}
  <div class="pointer-label" style:left="{pointer.x + 14}px" style:top="{pointer.y + 14}px">{pointerLabel}</div>
{/if}
{#if failed}
  <div class="map-failed" role="alert">
    <strong>{t.map.failedTitle}</strong>
    <p>{t.map.failedText}</p>
  </div>
{:else}
  <button type="button" class="layer-toggle" aria-pressed={showSlope} onclick={ontoggleslope} title={t.map.slopesTitle}>
    {t.map.slopes}
  </button>
  {#if hasOfflineAreas}
    <button
      type="button"
      class="layer-toggle offline-toggle"
      aria-pressed={showOfflineAreas}
      onclick={ontoggleofflineareas}
      title={t.map.offlineAreasTitle}
    >
      {t.map.offlineAreas}
    </button>
  {/if}
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

  .map :global(.waypoint-marker) {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    background: #2a78d6;
    color: #ffffff;
    font: 600 11px/20px system-ui, sans-serif;
    text-align: center;
    cursor: grab;
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

  /* Next to the pointer, never in its way. */
  .pointer-label {
    position: absolute;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
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
    /* Below the zoom buttons. */
    top: 78px;
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

  .offline-toggle {
    top: 108px;
  }

  .layer-toggle[aria-pressed='true'] {
    background: #1a1a19;
    color: #ffffff;
  }
</style>
