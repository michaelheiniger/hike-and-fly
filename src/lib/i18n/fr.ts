import type { Messages } from './en'

const waypointsPhrase = (n: number) => (n === 1 ? 'la balise' : `les ${n} balises`)
const straightPhrase = (ratio: string | null) => (ratio === null ? 'est bloquée par le relief' : `demanderait ${ratio}`)

export const fr: Messages = {
  language: 'Langue',

  app: {
    loadingElevation: 'Chargement des données d’altitude…',
    computingReach: 'Calcul de la zone atteignable…',
    computingRoutes: 'Calcul des itinéraires…',
    searchingAlternatives: 'Recherche d’itinéraires alternatifs…',
    resizePanel: 'Redimensionner le panneau (double-clic pour l’ajuster au contenu)',
    offline: 'Hors ligne',
    clickSets: 'Un clic sur la carte place',
    clickToStart: 'Cliquez sur la carte pour placer le décollage.',
    clickToLand: 'Cliquez sur la carte pour placer l’atterrissage et obtenir la finesse requise.',
    settings: 'Réglages',
    settingsTitle: 'Réglages : carte, hors ligne, hypothèses',
    start: 'Décollage',
    waypoint: 'Balise',
    landing: 'Atterrissage',
    reportIssue: 'Signaler un problème',
    reportHint: 'Avec ce plan et ses résultats joints, pour que le problème puisse être reproduit.',
    launchZone: 'Zone de décollage',
    notReachable: 'Non atteignable',
    kmFlown: (km) => `${km} km parcourus`,
  },

  agl: 'sol',
  amsl: 'alt.',

  places: {
    start: 'Décollage',
    landing: 'Atterrissage',
    startAltitude: 'Altitude de départ',
    startAltitudeTitle: (agl, ground) => `Altitude de départ, ${agl} m au-dessus du sol (${ground} m)`,
    ground: 'Sol',
    groundAtStart: 'Altitude du sol au décollage',
    groundAtLanding: 'Altitude du sol à l’atterrissage',
    to: 'vers',
    removeLanding: 'Retirer l’atterrissage',
    heightDifference: 'Dénivelé',
    heightDifferenceTitle: 'De l’altitude de départ jusqu’à l’atterrissage',
    distance: 'Distance',
    straightDistance: 'Distance en ligne droite',
    straightRatio: 'Finesse en ligne droite',
    straightRatioTitle: (arrival) =>
      `Finesse en ligne droite, sans tenir compte du relief : distance divisée par la hauteur, avec ${arrival} m au-dessus de l’atterrissage`,
    where: (distance, elevation) => `à ${distance} (${elevation} m)`,
    terrainBlocks: (where) => `Le relief bloque la ligne droite ${where}.`,
    terrainRaises: (ratio, where) => `Le relief porte la ligne droite à ${ratio} : sol ${where}.`,
    computing: 'Calcul…',
    noGlide: (run) =>
      `Aucun plané possible d’ici : le sol sur la course d’envol (${run} m) n’est pas plus pentu que la trajectoire. Choisissez une pente plus raide, une course d’envol plus longue ou une hauteur de départ.`,
    onlyLaunchZone: (zone) =>
      `Rien n’est atteignable au-delà de la zone de décollage (les ${zone} premiers mètres après l’envol, non colorés) : le sol sous le décollage est à peine plus pentu que la trajectoire. Choisissez une pente plus raide ou une hauteur de départ.`,
    truncated: 'La zone atteignable touche le bord de la zone de recherche et peut être tronquée.',
    computedIn: (total, terrain, search) => `Calculé en ${total} s (relief ${terrain} s, recherche ${search} s)`,
  },

  route: {
    requiredGlideRatio: 'Finesse requise',
    viaWaypoints: (n, straight) => `En passant par ${waypointsPhrase(n)}, dans l’ordre ; la ligne droite ${straightPhrase(straight)}.`,
    alongStraight: 'En ligne droite.',
    aroundSide: (side, straight) => `En contournant le relief côté ${side} ; la ligne droite ${straightPhrase(straight)}.`,
    includesArrival: (height) => `Inclut ${height} m au-dessus de l’atterrissage.`,
    landingNotBelow: (height) => `L’atterrissage n’est pas plus bas que le décollage (avec ${height} m de hauteur d’arrivée).`,
    blockedEverywhere: (max, waypoints) =>
      `Non atteignable même avec une finesse de ${max} : le relief bloque tous les itinéraires${waypoints ? ` par ${waypointsPhrase(waypoints)}` : ''}.`,
    routesWith: (ratio) => `Itinéraires avec votre finesse de ${ratio}`,
    sideOffset: (side, km) => `Côté ${side}, à ${km} km`,
    alongStraightName: 'En ligne droite',
    shortest: 'le plus court',
    facts: (km, ratio) => `${km} km · demande ${ratio}`,
    arrive: (height) => `arrivée ${height} m au-dessus`,
    notReachable: 'non atteignable',
    computing: 'Calcul de l’itinéraire…',
    searching: 'Recherche d’autres itinéraires…',
  },

  compass: {
    North: 'nord',
    'North-east': 'nord-est',
    East: 'est',
    'South-east': 'sud-est',
    South: 'sud',
    'South-west': 'sud-ouest',
    West: 'ouest',
    'North-west': 'nord-ouest',
  },

  waypoints: {
    title: 'Balises',
    removeAll: 'Tout retirer',
    explain: 'Survolées dans l’ordre, avec la marge sur le relief, en route vers l’atterrissage.',
    remove: 'Retirer',
    removeOne: (n) => `Retirer la balise ${n}`,
  },
}
