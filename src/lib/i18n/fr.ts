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

  infoAbout: (topic) => `À propos de ${topic}`,
  topics: {
    glideRatio: 'la finesse',
    startHeight: 'la hauteur de départ',
    clearance: 'la marge sur le relief',
    launchZone: 'la zone de décollage',
    takeoffRun: 'la course d’envol',
    arrivalHeight: 'la hauteur d’arrivée',
    wind: 'le vent',
    elevation: 'les données d’altitude',
    slopeClasses: 'les classes de pente',
    offline: 'les cartes hors ligne',
  },

  glide: {
    title: 'Plané',
    glideRatio: 'Finesse',
    default: 'par défaut',
    startHeight: 'Hauteur de départ',
    heightReference: 'Référence de hauteur',
    agl: 'Sol',
    amsl: 'Alt.',
  },

  assumptions: {
    title: 'Hypothèses',
    clearance: 'Marge sur le relief',
    launchZone: 'Zone de décollage',
    takeoffRun: 'Course d’envol',
    arrivalHeight: 'Hauteur d’arrivée',
    afterLiftoff: 'Après l’envol (m)',
    clearanceRow: 'Marge (m)',
    wind: 'Vent',
    stillAir: 'Air calme',
    elevationData: 'Données d’altitude',
    elevationTip: (source) =>
      `${source}. Les crêtes sont gardées à leur point le plus haut dans chaque cellule de la grille, pour ne jamais sous-estimer un obstacle. Les altitudes du décollage et de l’atterrissage sont exactes là où le service d’altitude de swisstopo répond.`,
    grid: (meters) => `grille de ${meters} m`,
    reset: 'Valeurs par défaut',
  },

  elevationSources: {
    aws: 'AWS Terrain Tiles (mondial, ~10–30 m dans les Alpes)',
    swiss: 'swissALTI3D (swisstopo, 2 m) en Suisse, gardé à son point le plus haut par pixel d’environ 13 m ; AWS Terrain Tiles ailleurs',
  },

  explanations: {
    startHeight:
      'Hauteur au décollage. 0 m sol correspond à un décollage à pied. Une valeur plus haute permet de planifier un plané final après une ascendance thermique.',
    glideRatio:
      'Finesse en air calme. La valeur par défaut de 5 est volontairement pessimiste : une aile légère de hike & fly fait environ 7 bras hauts, et la marge couvre l’air descendant et le vent de face.',
    clearance:
      'Hauteur minimale au-dessus du relief pour le survoler et continuer. Marge pour les descendances, la turbulence près des pentes et les erreurs des données d’altitude. Les zones en dessous (bande la plus basse de la légende) ne sont atteignables qu’en plané final.',
    launchZone:
      'Après l’envol (le décollage, ou la fin de la course d’envol), la marge croît de 0 à sa pleine valeur sur cette distance — sinon aucun décollage à pied ne serait possible. La rampe est cubique : marge requise = marge × (distance parcourue depuis l’envol ÷ zone de décollage)³. Elle croît lentement au début (1/64 au quart, 1/8 à mi-distance, environ 2/5 aux trois quarts), puis vite vers la fin.',
    takeoffRun:
      'Lors d’un décollage à pied, la distance que le pilote peut courir avant de s’envoler : le plané commence au sol, n’importe où à cette distance du décollage et pas plus haut que lui, typiquement là où la pente se raidit. Sinon, un décollage en pente douce, dont les premiers mètres sont plus plats que la trajectoire, bloquerait tout. 0 fait commencer le plané exactement au décollage.',
    arrivalHeight:
      'Hauteur au-dessus de l’atterrissage à l’arrivée, pour la prise de terrain. La finesse requise l’inclut.',
    wind: 'Pas encore modélisé : les calculs supposent un air calme. Le vent de face et les descendances réduisent la zone atteignable.',
  },

  settings: {
    title: 'Réglages',
    close: 'Fermer les réglages',
    map: 'Carte',
    basemaps: { swisstopo: 'swisstopo (Suisse)', opentopomap: 'OpenTopoMap (monde)' },
    slopeClasses: 'Classes de pente',
    slopeTip: 'swisstopo, d’après la recommandation avalanches du SLF. Suisse et régions frontalières seulement.',
    colors: 'Couleurs',
    colorsStandard: 'Du rouge au vert',
    colorsColorblind: 'Adaptées aux daltoniens',
  },

  diagram: {
    label: (run, clearance, zone) =>
      `Vue de profil : course d’envol de ${run} m, puis la marge croît jusqu’à ${clearance} m sur la zone de décollage de ${zone} m`,
    run: 'Course',
    launchZone: 'Zone de décollage',
    note: 'Décollage (foncé), envol après la course (blanc), trajectoire (trait plein) et marge requise (tirets). Distances à l’échelle, hauteurs non.',
  },

  offline: {
    title: 'Hors ligne',
    tip: 'Téléchargez la zone affichée sur la carte : carte swisstopo, classes de pente et altitudes, pour planifier sans réseau en montagne. OpenTopoMap ne peut pas être téléchargé (ses conditions d’utilisation interdisent les téléchargements en masse) : hors ligne, utilisez la carte swisstopo.',
    online: 'En ligne',
    offline: 'Hors ligne',
    mapDetail: 'Détail de la carte',
    detail: { 13: 'Aperçu', 14: 'Standard', 15: 'Détaillé', 16: 'Très détaillé' },
    detailOption: (name, zoom) => `${name} (zoom ${zoom})`,
    progress: (done, total, mb) => `${done} / ${total} tuiles · ${mb} Mo`,
    cancel: 'Annuler',
    estimate: (tiles, mb) => `${tiles} tuiles · environ ${mb} Mo`,
    download: 'Télécharger cette zone',
    tooLarge: 'Trop grande : zoomez sur la carte ou choisissez moins de détail.',
    connect: 'Connectez-vous pour télécharger.',
    saved: (tiles, mb, reused) =>
      `Enregistrée : ${tiles} tuiles, ${mb} Mo${reused ? ` (${reused} déjà stockées pour d’autres zones)` : ''}.`,
    savedWithGaps: (failed) => `Enregistrée avec des lacunes : ${failed} tuiles n’ont pas pu être téléchargées.`,
    cancelled: 'Téléchargement annulé.',
    failed: (error) => `Échec du téléchargement : ${error}`,
    savedAreas: 'Zones enregistrées',
    areaFacts: (date, mb, zoom, gaps) => `${date} · ${mb} Mo · carte jusqu’au zoom ${zoom}${gaps ? ' · incomplète' : ''}`,
    show: 'Afficher',
    delete: 'Supprimer',
    storage: (used, quota) => `Stockage utilisé : ${used} Mo sur ${quota} Mo disponibles pour cette app.`,
    north: 'N',
    south: 'S',
    east: 'E',
    west: 'O',
  },

  map: {
    failedTitle: 'La carte ne peut pas être affichée',
    failedText:
      'Ce navigateur n’a pas pu démarrer WebGL, dont la carte a besoin. Activez l’accélération matérielle dans les réglages du navigateur ou essayez un autre navigateur.',
    slopes: 'Pentes > 30°',
    slopesTitle: 'Classes de pente swisstopo de plus de 30°',
    offlineAreas: 'Zones hors ligne',
    offlineAreasTitle: 'Contour des zones téléchargées pour l’usage hors ligne',
    waypointTitle: (n) => `Balise ${n} : glisser pour déplacer`,
    route: (letter) => `Itinéraire ${letter}`,
    zoomIn: 'Zoom avant',
    zoomOut: 'Zoom arrière',
    attribution: 'Afficher ou masquer les sources',
    title: 'Carte',
    marker: 'Marqueur',
  },

  legend: {
    title: 'Hauteur sol',
    finalGlide: 'plané final seulement',
    launchZone: (zone) => `Zone de décollage (${zone} premiers mètres après l’envol) : non colorée`,
  },

  profile: {
    caption: (letter, ratio, required) => `Itinéraire ${letter} · finesse ${ratio}${required ? ' (requise)' : ''}`,
    summary: (km, arrival) => `${km} km parcourus · arrivée ${arrival} m au-dessus de l’atterrissage`,
    glidePath: 'Trajectoire (couleurs de hauteur sol)',
    clearance: 'Marge',
    terrain: 'Relief',
    label: 'Profil d’altitude le long de l’itinéraire',
    runTitle: (meters) => `Course d’envol : ${meters} m au sol avant l’envol`,
    zoneTitle: (clearance, zone) => `Zone de décollage : la marge croît de 0 à ${clearance} m sur ${zone} m après l’envol`,
    run: 'Course',
    launchZone: 'Zone de décollage',
    liftoff: (meters) => `Envol, à ${meters} m du décollage`,
    terrainAt: (altitude, terrain) => `${altitude} m alt. · relief ${terrain} m`,
    resetZoom: 'Réinitialiser le zoom',
  },

  report: {
    title: 'Signaler un problème',
    explain:
      'Décrivez ce qui ne va pas. Le plan et ce qu’affiche l’app sont joints, pour que le problème puisse être reproduit. Aucun compte nécessaire.',
    category: 'De quoi s’agit-il ?',
    categories: {
      results: 'Les résultats semblent faux',
      terrain: 'Carte ou données d’altitude',
      bug: 'Quelque chose ne fonctionne pas',
      other: 'Autre',
    },
    message: 'Que s’est-il passé, et qu’attendiez-vous ?',
    email: 'Votre e-mail, pour une réponse (facultatif)',
    details: 'Détails joints (en anglais)',
    close: 'Fermer',
    send: 'Envoyer',
    sending: 'Envoi…',
    sent: 'Merci : le signalement a été envoyé.',
    failed: 'Le signalement n’a pas pu être envoyé. Vérifiez la connexion et réessayez.',
  },

  errors: {
    belowGround: (altitude, ground) => `L’altitude de départ (${altitude} m) est sous le sol (${ground} m).`,
    landingTooClose: 'L’atterrissage est trop près du décollage.',
    routeTooLong: (km) => `L’itinéraire fait ${km} km : trop loin pour être planifié.`,
    waypointTooFar: 'Une balise est trop loin du décollage et de l’atterrissage pour être planifiée.',
    elevationUnavailable: (tile) => `La tuile d’altitude ${tile} n’a pas pu être chargée.`,
    noOfflineElevation: 'Pas de données d’altitude hors ligne pour cette zone : téléchargez une zone plus grande en étant en ligne.',
  },
}
