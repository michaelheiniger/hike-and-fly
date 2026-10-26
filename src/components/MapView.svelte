<script lang="ts">
  import { Map, Marker, NavigationControl, ScaleControl, setWorkerUrl, type ImageSource } from 'maplibre-gl'
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

  interface Props {
    start: LngLat | null
    overlay: Overlay | null
    basemap: BasemapId
    onpick: (p: LngLat) => void
    onhover: (p: LngLat | null) => void
  }

  let { start, overlay, basemap, onpick, onhover }: Props = $props()

  let container: HTMLDivElement
  let map: Map | undefined = $state()
  let loaded = $state(false)
  let marker: Marker | undefined

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
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-right')
    m.on('load', () => (loaded = true))
    m.on('click', (e) => onpick({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
    m.on('mousemove', (e) => onhover({ lng: e.lngLat.lng, lat: e.lngLat.lat }))
    m.on('mouseout', () => onhover(null))
    map = m
    return () => m.remove()
  })

  // Start marker, draggable to move the start.
  $effect(() => {
    if (!map) return
    if (!start) {
      marker?.remove()
      marker = undefined
      return
    }
    if (!marker) {
      marker = new Marker({ color: '#1a1a19', draggable: true }).setLngLat([start.lng, start.lat]).addTo(map)
      marker.on('dragend', () => {
        const p = marker!.getLngLat()
        onpick({ lng: p.lng, lat: p.lat })
      })
    } else {
      marker.setLngLat([start.lng, start.lat])
    }
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
      map.addLayer({
        id: 'agl',
        type: 'raster',
        source: 'agl',
        paint: { 'raster-opacity': 0.6, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
      })
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
