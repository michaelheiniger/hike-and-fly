/** English messages: the reference for the other languages. */

const waypointsPhrase = (n: number) => (n === 1 ? 'the waypoint' : `the ${n} waypoints`)
const straightPhrase = (ratio: string | null) => (ratio === null ? 'is blocked by terrain' : `would need ${ratio}`)

export const en = {
  language: 'Language',

  app: {
    loadingElevation: 'Loading elevation data…',
    computingReach: 'Computing reachable area…',
    computingRoutes: 'Computing routes…',
    searchingAlternatives: 'Looking for alternative routes…',
    resizePanel: 'Resize panel (double-click to fit the content)',
    offline: 'Offline',
    clickSets: 'Click on the map sets',
    clickToStart: 'Click the map to set the start.',
    clickToLand: 'Click the map to set a landing and get the required glide ratio.',
    settings: 'Settings',
    settingsTitle: 'Settings: map, offline, assumptions',
    start: 'Start',
    waypoint: 'Waypoint',
    landing: 'Landing',
    reportIssue: 'Report an issue',
    reportHint: 'With this plan and its results attached, so the problem can be reproduced.',
    launchZone: 'Launch zone',
    notReachable: 'Not reachable',
    kmFlown: (km: string) => `${km} km flown`,
  },

  /** Height references, after "m": 300 m AGL, 2461 m AMSL. */
  agl: 'AGL',
  amsl: 'AMSL',

  places: {
    start: 'Start',
    landing: 'Landing',
    startAltitude: 'Start altitude',
    startAltitudeTitle: (agl: number, ground: number) => `Start altitude, ${agl} m above the ground (${ground} m)`,
    ground: 'Ground',
    groundAtStart: 'Ground at the start',
    groundAtLanding: 'Ground at the landing',
    to: 'to',
    removeLanding: 'Remove the landing',
    heightDifference: 'Height difference',
    heightDifferenceTitle: 'From the start altitude down to the landing',
    distance: 'Distance',
    straightDistance: 'Straight distance',
    straightRatio: 'Straight line needs',
    straightRatioTitle: (arrival: number) =>
      `Glide ratio along the straight line, ignoring terrain: distance over height, with ${arrival} m above the landing`,
    /** Where terrain limits the straight line: "1.2 km out (2050 m)". */
    where: (distance: string, elevation: number) => `${distance} out (${elevation} m)`,
    terrainBlocks: (where: string) => `Terrain blocks the straight line ${where}.`,
    terrainRaises: (ratio: string, where: string) => `Terrain raises the straight line to ${ratio}: ground ${where}.`,
    computing: 'Computing…',
    noGlide: (run: number) =>
      `No glide possible from here: the ground within the takeoff run (${run} m) is not steeper than the glide path. Pick a steeper slope, a longer takeoff run, or add start height.`,
    onlyLaunchZone: (zone: number) =>
      `Nothing is reachable beyond the launch zone (the first ${zone} m after the liftoff, left uncolored): the ground below the start is barely steeper than the glide path. Pick a steeper slope or add start height.`,
    truncated: 'The reachable area reaches the edge of the search area and may be cut off.',
    computedIn: (total: string, terrain: string, search: string) =>
      `Computed in ${total} s (terrain ${terrain} s, search ${search} s)`,
  },

  route: {
    requiredGlideRatio: 'Required glide ratio',
    viaWaypoints: (n: number, straight: string | null) =>
      `Through ${waypointsPhrase(n)}, in order; the straight line ${straightPhrase(straight)}.`,
    alongStraight: 'Along the straight line.',
    aroundSide: (side: string, straight: string | null) =>
      `Around terrain on the ${side} side; the straight line ${straightPhrase(straight)}.`,
    includesArrival: (height: number) => `Includes ${height} m above the landing.`,
    landingNotBelow: (height: number) => `The landing is not below the start (with ${height} m arrival height).`,
    blockedEverywhere: (max: number, waypoints: number) =>
      `Not reachable even with glide ratio ${max}: terrain blocks every route${waypoints ? ` via ${waypointsPhrase(waypoints)}` : ''}.`,
    routesWith: (ratio: string) => `Routes with your glide ratio ${ratio}`,
    sideOffset: (side: string, km: string) => `${side[0].toUpperCase()}${side.slice(1)} side, ${km} km off`,
    alongStraightName: 'Along the straight line',
    shortest: 'shortest',
    facts: (km: string, ratio: string) => `${km} km · needs ${ratio}`,
    arrive: (height: number) => `arrive ${height} m above`,
    notReachable: 'not reachable',
    computing: 'Computing route…',
    searching: 'Looking for other routes…',
  },

  /** Sides of the straight line, by the route search's compass names. */
  compass: {
    North: 'north',
    'North-east': 'north-east',
    East: 'east',
    'South-east': 'south-east',
    South: 'south',
    'South-west': 'south-west',
    West: 'west',
    'North-west': 'north-west',
  } as Record<string, string>,

  waypoints: {
    title: 'Waypoints',
    removeAll: 'Remove all',
    explain: 'Flown over in order, with the clearance, on the way to the landing.',
    remove: 'Remove',
    removeOne: (n: number) => `Remove waypoint ${n}`,
  },

  /** Label of an explanation's (i) button, with a topic from `topics`. */
  infoAbout: (topic: string) => `About ${topic}`,
  topics: {
    glideRatio: 'the glide ratio',
    startHeight: 'the start height',
    clearance: 'the terrain clearance',
    launchZone: 'the launch zone',
    takeoffRun: 'the takeoff run',
    arrivalHeight: 'the arrival height',
    wind: 'wind',
    elevation: 'the elevation data',
    slopeClasses: 'the slope classes',
    offline: 'offline maps',
  },

  glide: {
    title: 'Glide',
    glideRatio: 'Glide ratio',
    default: 'default',
    startHeight: 'Start height',
    heightReference: 'Height reference',
    agl: 'AGL',
    amsl: 'AMSL',
  },

  assumptions: {
    title: 'Assumptions',
    clearance: 'Terrain clearance',
    launchZone: 'Launch zone',
    takeoffRun: 'Takeoff run',
    arrivalHeight: 'Arrival height',
    afterLiftoff: 'After liftoff (m)',
    clearanceRow: 'Clearance (m)',
    wind: 'Wind',
    stillAir: 'Still air',
    elevationData: 'Elevation data',
    elevationTip: (source: string) =>
      `${source}. Ridges are kept at their highest point in each grid cell so obstacles are never underestimated. Start and landing heights are exact where swisstopo's height service answers.`,
    grid: (meters: number) => `${meters} m grid`,
    reset: 'Reset to defaults',
  },

  /** The elevation sources, as the worker names them. */
  elevationSources: {
    aws: 'AWS Terrain Tiles (global, ~10–30 m in the Alps)',
    swiss: 'swissALTI3D (swisstopo, 2 m) in Switzerland, kept at its highest point per ~13 m pixel; AWS Terrain Tiles elsewhere',
  },

  explanations: {
    startHeight:
      'Height at the start. 0 m AGL is a ground launch. Use a higher value to plan a final glide after climbing in a thermal.',
    glideRatio:
      'Still-air glide ratio. The default of 5 is pessimistic on purpose: a light hike & fly wing does about 7 at trim, and the margin covers sinking air and headwind.',
    clearance:
      'Minimum height above terrain to fly over it and continue. Margin for sink, turbulence near slopes and elevation data errors. Areas below it (lowest legend band) are reachable as a final glide only.',
    launchZone:
      'After the liftoff (the start, or the end of the takeoff run), the clearance grows from 0 to its full value over this distance — otherwise no ground launch would be possible. The ramp is cubic: required clearance = clearance × (distance flown since the liftoff ÷ launch zone)³. It grows slowly at first (1/64 at a quarter, 1/8 at mid-distance, about 2/5 at three quarters), then quickly towards the end.',
    takeoffRun:
      'On a ground launch, how far the pilot may run before lifting off: the glide begins from the ground anywhere this close to the start and not above it, typically where the slope steepens. Otherwise a gentle takeoff, whose first meters are flatter than the glide path, would block everything. 0 starts the glide exactly at the start.',
    arrivalHeight: 'Height above the landing when arriving, for the landing pattern. The required glide ratio includes it.',
    wind: 'Not modelled yet: computations assume still air. Headwind and sink shrink the reachable area.',
  },

  settings: {
    title: 'Settings',
    close: 'Close settings',
    map: 'Map',
    basemaps: { swisstopo: 'swisstopo (Switzerland)', opentopomap: 'OpenTopoMap (worldwide)' },
    slopeClasses: 'Slope classes',
    slopeTip: 'swisstopo, after the SLF avalanche recommendation. Switzerland and border areas only.',
    colors: 'Colors',
    colorsStandard: 'Red to green',
    colorsColorblind: 'Color-blind friendly',
  },

  diagram: {
    label: (run: number, clearance: number, zone: number) =>
      `Side view: takeoff run of ${run} m, then the clearance grows to ${clearance} m over the ${zone} m launch zone`,
    run: 'Run',
    launchZone: 'Launch zone',
    note: 'Start (dark), liftoff after the run (white), glide path (solid) and required clearance (dashed). Distances to scale, heights not.',
  },
}

export type Messages = typeof en
