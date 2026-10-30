import type { Messages } from './en'

/** Swiss orthography: ss, never ß. Instructions in the infinitive, neither du nor Sie. */

const waypointsPhrase = (n: number) => (n === 1 ? 'den Wegpunkt' : `die ${n} Wegpunkte`)
const straightPhrase = (ratio: string | null) => (ratio === null ? 'ist durch Gelände versperrt' : `bräuchte ${ratio}`)

export const de: Messages = {
  language: 'Sprache',

  app: {
    loadingElevation: 'Höhendaten werden geladen…',
    computingReach: 'Erreichbares Gebiet wird berechnet…',
    computingRoutes: 'Routen werden berechnet…',
    searchingAlternatives: 'Alternative Routen werden gesucht…',
    resizePanel: 'Bereichsgrösse ändern (Doppelklick passt sie dem Inhalt an)',
    offline: 'Offline',
    clickSets: 'Ein Klick auf die Karte setzt',
    clickToStart: 'Startplatz auf der Karte anklicken.',
    clickToLand: 'Landeplatz auf der Karte anklicken, um die erforderliche Gleitzahl zu erhalten.',
    settings: 'Einstellungen',
    settingsTitle: 'Einstellungen: Karte, Offline, Annahmen',
    start: 'Start',
    waypoint: 'Wegpunkt',
    landing: 'Landeplatz',
    reportIssue: 'Problem melden',
    reportHint: 'Mit diesem Plan und seinen Ergebnissen, damit sich das Problem nachvollziehen lässt.',
    launchZone: 'Startzone',
    notReachable: 'Nicht erreichbar',
    kmFlown: (km) => `${km} km geflogen`,
  },

  agl: 'ü. Grund',
  amsl: 'ü. M.',

  places: {
    start: 'Start',
    landing: 'Landeplatz',
    startAltitude: 'Starthöhe',
    startAltitudeTitle: (agl, ground) => `Starthöhe, ${agl} m über Grund (${ground} m)`,
    ground: 'Boden',
    groundAtStart: 'Bodenhöhe am Start',
    groundAtLanding: 'Bodenhöhe am Landeplatz',
    to: 'nach',
    removeLanding: 'Landeplatz entfernen',
    heightDifference: 'Höhendifferenz',
    heightDifferenceTitle: 'Von der Starthöhe hinunter zum Landeplatz',
    distance: 'Distanz',
    straightDistance: 'Luftlinie',
    straightRatio: 'Gleitzahl auf der Luftlinie',
    straightRatioTitle: (arrival) =>
      `Gleitzahl auf der Luftlinie, ohne Gelände: Distanz durch Höhe, mit ${arrival} m über dem Landeplatz`,
    where: (distance, elevation) => `nach ${distance} (${elevation} m)`,
    terrainBlocks: (where) => `Das Gelände versperrt die Luftlinie ${where}.`,
    terrainRaises: (ratio, where) => `Das Gelände erhöht die Luftlinie auf ${ratio}: Boden ${where}.`,
    computing: 'Berechnung…',
    noGlide: (run) =>
      `Von hier ist kein Gleitflug möglich: Der Boden im Startlauf (${run} m) ist nicht steiler als der Gleitpfad. Einen steileren Hang, einen längeren Startlauf oder mehr Starthöhe wählen.`,
    onlyLaunchZone: (zone) =>
      `Ausserhalb der Startzone ist nichts erreichbar (die ersten ${zone} m nach dem Abheben, nicht eingefärbt): Der Boden unter dem Start ist kaum steiler als der Gleitpfad. Einen steileren Hang oder mehr Starthöhe wählen.`,
    truncated: 'Das erreichbare Gebiet stösst an den Rand des Suchgebiets und ist möglicherweise abgeschnitten.',
    computedIn: (total, terrain, search) => `Berechnet in ${total} s (Gelände ${terrain} s, Suche ${search} s)`,
  },

  route: {
    requiredGlideRatio: 'Erforderliche Gleitzahl',
    viaWaypoints: (n, straight) => `Über ${waypointsPhrase(n)}, in dieser Reihenfolge; die Luftlinie ${straightPhrase(straight)}.`,
    alongStraight: 'Auf der Luftlinie.',
    aroundSide: (side, straight) => `Um das Gelände herum auf der ${side}seite; die Luftlinie ${straightPhrase(straight)}.`,
    includesArrival: (height) => `Inklusive ${height} m über dem Landeplatz.`,
    landingNotBelow: (height) => `Der Landeplatz liegt nicht tiefer als der Start (mit ${height} m Ankunftshöhe).`,
    blockedEverywhere: (max, waypoints) =>
      `Selbst mit Gleitzahl ${max} nicht erreichbar: Das Gelände versperrt jede Route${waypoints ? ` über ${waypointsPhrase(waypoints)}` : ''}.`,
    routesWith: (ratio) => `Routen mit Gleitzahl ${ratio}`,
    sideOffset: (side, km) => `${side}seite, ${km} km daneben`,
    alongStraightName: 'Auf der Luftlinie',
    shortest: 'kürzeste',
    facts: (km, ratio) => `${km} km · braucht ${ratio}`,
    arrive: (height) => `Ankunft ${height} m darüber`,
    notReachable: 'nicht erreichbar',
    computing: 'Route wird berechnet…',
    searching: 'Weitere Routen werden gesucht…',
  },

  compass: {
    North: 'Nord',
    'North-east': 'Nordost',
    East: 'Ost',
    'South-east': 'Südost',
    South: 'Süd',
    'South-west': 'Südwest',
    West: 'West',
    'North-west': 'Nordwest',
  },

  waypoints: {
    title: 'Wegpunkte',
    removeAll: 'Alle entfernen',
    explain: 'Werden der Reihe nach mit dem Geländeabstand überflogen, auf dem Weg zum Landeplatz.',
    remove: 'Entfernen',
    removeOne: (n) => `Wegpunkt ${n} entfernen`,
  },

  infoAbout: (topic) => `Erklärung: ${topic}`,
  topics: {
    glideRatio: 'Gleitzahl',
    startHeight: 'Starthöhe',
    clearance: 'Geländeabstand',
    launchZone: 'Startzone',
    takeoffRun: 'Startlauf',
    arrivalHeight: 'Ankunftshöhe',
    wind: 'Wind',
    elevation: 'Höhendaten',
    slopeClasses: 'Hangneigungsklassen',
    offline: 'Offline-Karten',
  },

  glide: {
    title: 'Gleitflug',
    glideRatio: 'Gleitzahl',
    default: 'Standard',
    startHeight: 'Starthöhe',
    heightReference: 'Höhenbezug',
    agl: 'ü. Grund',
    amsl: 'ü. M.',
  },

  assumptions: {
    title: 'Annahmen',
    clearance: 'Geländeabstand',
    launchZone: 'Startzone',
    takeoffRun: 'Startlauf',
    arrivalHeight: 'Ankunftshöhe',
    afterLiftoff: 'Nach Abheben (m)',
    clearanceRow: 'Abstand (m)',
    wind: 'Wind',
    stillAir: 'Ruhige Luft',
    elevationData: 'Höhendaten',
    elevationTip: (source) =>
      `${source}. Grate werden in jeder Gitterzelle auf ihrem höchsten Punkt gehalten, damit Hindernisse nie unterschätzt werden. Start- und Landeplatzhöhen sind exakt, wo der Höhendienst von swisstopo antwortet.`,
    grid: (meters) => `${meters}-m-Gitter`,
    reset: 'Auf Standardwerte zurücksetzen',
  },

  elevationSources: {
    aws: 'AWS Terrain Tiles (weltweit, ~10–30 m in den Alpen)',
    swiss: 'swissALTI3D (swisstopo, 2 m) in der Schweiz, pro ~13-m-Pixel auf dem höchsten Punkt gehalten; anderswo AWS Terrain Tiles',
  },

  explanations: {
    startHeight:
      'Höhe am Start. 0 m über Grund ist ein Fussstart. Ein höherer Wert plant einen Endanflug nach einem Thermikaufstieg.',
    glideRatio:
      'Gleitzahl in ruhiger Luft. Der Standardwert 5 ist absichtlich pessimistisch: Ein leichter Hike-&-Fly-Schirm erreicht ungebremst etwa 7, und die Reserve deckt sinkende Luft und Gegenwind.',
    clearance:
      'Mindesthöhe über dem Gelände, um es zu überfliegen und weiterzufliegen. Reserve für Sinken, Turbulenzen in Hangnähe und Fehler der Höhendaten. Gebiete darunter (unterstes Band der Legende) sind nur im Endanflug erreichbar.',
    launchZone:
      'Nach dem Abheben (am Start oder am Ende des Startlaufs) wächst der Geländeabstand über diese Distanz von 0 auf den vollen Wert — sonst wäre kein Fussstart möglich. Der Anstieg ist kubisch: erforderlicher Abstand = Abstand × (seit dem Abheben geflogene Distanz ÷ Startzone)³. Er wächst zuerst langsam (1/64 nach einem Viertel, 1/8 nach der Hälfte, etwa 2/5 nach drei Vierteln), gegen Ende schnell.',
    takeoffRun:
      'Beim Fussstart die Strecke, die der Pilot vor dem Abheben laufen darf: Der Gleitflug beginnt am Boden irgendwo so nahe am Start und nicht höher als er, typischerweise dort, wo der Hang steiler wird. Sonst würde ein flacher Startplatz, dessen erste Meter flacher als der Gleitpfad sind, alles blockieren. Mit 0 beginnt der Gleitflug genau am Start.',
    arrivalHeight: 'Höhe über dem Landeplatz bei der Ankunft, für die Landevolte. Die erforderliche Gleitzahl schliesst sie ein.',
    wind: 'Noch nicht modelliert: Die Berechnungen gehen von ruhiger Luft aus. Gegenwind und Sinken verkleinern das erreichbare Gebiet.',
  },

  settings: {
    title: 'Einstellungen',
    close: 'Einstellungen schliessen',
    map: 'Karte',
    basemaps: { swisstopo: 'swisstopo (Schweiz)', opentopomap: 'OpenTopoMap (weltweit)' },
    slopeClasses: 'Hangneigungsklassen',
    slopeTip: 'swisstopo, nach der Lawinenempfehlung des SLF. Nur Schweiz und Grenzgebiete.',
    colors: 'Farben',
    colorsStandard: 'Rot bis Grün',
    colorsColorblind: 'Für Farbenblinde geeignet',
  },

  diagram: {
    label: (run, clearance, zone) =>
      `Seitenansicht: Startlauf von ${run} m, danach wächst der Geländeabstand über die Startzone von ${zone} m auf ${clearance} m`,
    run: 'Startlauf',
    launchZone: 'Startzone',
    note: 'Start (dunkel), Abheben nach dem Startlauf (weiss), Gleitpfad (durchgezogen) und erforderlicher Geländeabstand (gestrichelt). Distanzen massstäblich, Höhen nicht.',
  },
}
