<script lang="ts">
  import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type ImageSource } from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // MapLibre locates its worker relative to its own module, which breaks once Vite bundles it.
  import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
  import { onMount } from 'svelte'
  import type { LngLat } from '../lib/terrain/geo'
  import { BASEMAPS, initialStyle, type BasemapId } from '../lib/map/style'
  import { AWS_TERRARIUM } from '../lib/terrain/loader'

  export interface Overlay {
    url: string
    north: number
    south: number
    west: number
    east: number
  }

  export interface RouteLine {
    points: LngLat[]
    /** Dashed: a route the pilot's glide ratio does not make. */
    dashed: boolean
  }

  interface Props {
    start: LngLat | null
    landing: LngLat | null
    route: RouteLine | null
    /** Point highlighted from the profile chart. */
    highlight: LngLat | null
    overlay: Overlay | null
    basemap: BasemapId
    onpick: (p: LngLat) => void
    onmovestart: (p: LngLat) => void
    onmovelanding: (p: LngLat) => void
    onhover: (p: LngLat | null) => void
  }

  let { start, landing, route, highlight, overlay, basemap, onpick, onmovestart, onmovelanding, onhover }: Props = $props()

  let container: HTMLDivElement
  let map: Map | undefined = $state()
  let loaded = $state(false)
  let startMarker: Marker | undefined
  let landingMarker: Marker | undefined

  onMount(() => {
    setWorkerUrl(maplibreWorkerUrl)
    const m = new Map({
      container,
      style: initialStyle(),
      center: start ? [start.lng, start.lat] : [8.2, 46.8],
      zoom: start ? 11 : 7.5,
      maxZoom: 18,
      attributionControl: { compact: true, customAttribution: AWS_TERRARIUM.attribution },
    })
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new ScaleControl({ unit: 'metric' }), 'top-right')
    m.on('load', () => {
      const empty = { type: 'FeatureCollection' as const, features: [] }
      m.addSource('route', { type: 'geojson', data: empty })
      m.addSource('highlight', { type: 'geojson', data: empty })
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6 },
      })
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1a1a19', 'line-width': 3 },
      })
      m.addLayer({
        id: 'highlight',
        type: 'circle',
        source: 'highlight',
        paint: { 'circle-radius': 6, 'circle-color': '#6250d6', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
      })
      loaded = true
    })
    m.on('click', (e) => onpick({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
    m.on('mousemove', (e) => onhover({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
    m.on('mouseout', () => onhover(null))
    map = m
    return () => m.remove()
  })

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
    const features = route
      ? [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates: route.points.map((p) => [p.lng, p.lat]) },
          },
        ]
      : []
    ;(map.getSource('route') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
    map.setPaintProperty('route', 'line-dasharray', route?.dashed ? [2, 1.5] : [1, 0])
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
        'route-casing',
      )
    }
  })
</script>

<div class="map" bind:this={container}></div>

<style>
  .map {
    position: absolute;
    inset: 0;
  }
</style>
