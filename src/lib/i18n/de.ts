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
}
