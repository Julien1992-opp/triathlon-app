/*
 * reference.js
 * Données fixes utilisées par l'application.
 * Aucune valeur de performance, aucun dosage prescriptif.
 * Les allures cibles sont calculées ailleurs (allures.js)
 * à partir des chronos réels saisis dans les profils.
 */

const REFERENCE = {

  // Informations sur la course cible.
  course: {
    nom: 'Triathlon de Lausanne, format Olympic',
    date: '2026-08-30',
    debutPlan: '2026-05-18',
    nombreSemaines: 15,
    distances: {
      natation: 1.5,   // km
      velo: 40,        // km
      course: 10,      // km
    },
  },

  // Trois disciplines principales plus le bloc renforcement
  // et le bloc séance combinée. Une teinte vive par discipline
  // pour le repérage immédiat.
  disciplines: {
    natation: {
      cle: 'natation',
      libelle: 'Natation',
      couleur: '#00B4D8',     // bleu vif
      uniteDistance: 'm',
      uniteAllure: 'min par 100 m',
    },
    velo: {
      cle: 'velo',
      libelle: 'Vélo',
      couleur: '#F4A300',     // jaune orangé
      uniteDistance: 'km',
      uniteAllure: 'km par heure',
    },
    course: {
      cle: 'course',
      libelle: 'Course',
      couleur: '#E63946',     // rouge corail
      uniteDistance: 'km',
      uniteAllure: 'min par km',
    },
    combinee: {
      cle: 'combinee',
      libelle: 'Séance combinée',
      couleur: '#7A3FF1',     // violet, comptée double
      uniteDistance: 'km',
      uniteAllure: 'voir détail',
    },
    renforcement: {
      cle: 'renforcement',
      libelle: 'Renforcement',
      couleur: '#2A9D8F',     // vert profond, bloc d'appoint
      uniteDistance: 'min',
      uniteAllure: 'poids du corps',
    },
  },

  // Quatre phases. Total de 15 semaines, du 18 mai au 30 août 2026.
  // Pas de phase d'initiation. Le découpage est volontairement simple.
  phases: [
    {
      cle: 'developpement',
      libelle: 'Phase de développement',
      semaineDebut: 1,
      semaineFin: 6,
      duree: 6,
      objectif:
        'Construire le volume et installer les bases techniques. '
        + 'Sortie longue progressive, premiers blocs au seuil.',
    },
    {
      cle: 'specifique',
      libelle: 'Phase spécifique',
      semaineDebut: 7,
      semaineFin: 12,
      duree: 6,
      objectif:
        'Travailler à allure de compétition, multiplier les séances '
        + 'combinées vélo puis course, affiner la gestion de l\'effort. '
        + 'Bloc principal du plan, à parité de durée avec le '
        + 'développement.',
    },
    {
      cle: 'affutage',
      libelle: 'Phase d\'affûtage',
      semaineDebut: 13,
      semaineFin: 14,
      duree: 2,
      objectif:
        'Réduire le volume tout en conservant un peu d\'intensité '
        + 'pour arriver frais et affûté.',
    },
    {
      cle: 'course',
      libelle: 'Semaine de course',
      semaineDebut: 15,
      semaineFin: 15,
      duree: 1,
      objectif:
        'Activations courtes, repos, soins. Triathlon de Lausanne '
        + 'le 30 août 2026.',
    },
  ],

  // Zones d'allure. Ordre du plus facile au plus intense.
  // Les valeurs chiffrées sont calculées dans allures.js
  // à partir des chronos saisis.
  zones: [
    {
      cle: 'facile',
      libelle: 'Facile',
      description:
        'Effort très souple, conversation possible sans gêne. '
        + 'Sert à la récupération active et à l\'endurance de base.',
    },
    {
      cle: 'endurance',
      libelle: 'Endurance',
      description:
        'Allure de sortie longue, soutenue mais confortable. '
        + 'Effort qui peut être maintenu longtemps.',
    },
    {
      cle: 'seuil',
      libelle: 'Seuil',
      description:
        'Effort soutenu, respiration courte mais maîtrisée. '
        + 'Allure proche de celle d\'un effort d\'une heure.',
    },
    {
      cle: 'vo2',
      libelle: 'VO2',
      description:
        'Effort très intense, par fractions courtes. '
        + 'Sollicite la capacité maximale aérobie.',
    },
  ],

  // Types de séance par discipline, pour amateurs confirmés.
  // Pas de séances d'initiation. Libellés courts pour l'écran mobile.
  typesSeance: {
    natation: [
      { cle: 'nat_endurance',  libelle: 'Endurance technique' },
      { cle: 'nat_technique',  libelle: 'Bloc technique pure' },
      { cle: 'nat_seuil',      libelle: 'Intervalles au seuil' },
      { cle: 'nat_vo2',        libelle: 'Fractions courtes VO2' },
      { cle: 'nat_allure',     libelle: 'Allure de course' },
      { cle: 'nat_eau_libre',  libelle: 'Eau libre, repères de course' },
    ],
    velo: [
      { cle: 'velo_endurance', libelle: 'Endurance longue' },
      { cle: 'velo_tempo',     libelle: 'Tempo soutenu' },
      { cle: 'velo_seuil',     libelle: 'Intervalles au seuil' },
      { cle: 'velo_vo2',       libelle: 'Fractions courtes VO2' },
      { cle: 'velo_allure',    libelle: 'Allure de course' },
    ],
    course: [
      { cle: 'crs_endurance',  libelle: 'Sortie endurance' },
      { cle: 'crs_seuil',      libelle: 'Intervalles au seuil' },
      { cle: 'crs_vo2',        libelle: 'Fractions courtes VO2' },
      { cle: 'crs_allure',     libelle: 'Allure de course' },
      { cle: 'crs_cotes',      libelle: 'Côtes courtes' },
    ],
    combinee: [
      {
        cle: 'comb_endurance',
        libelle: 'Vélo puis course, allure endurance',
      },
      {
        cle: 'comb_allure',
        libelle: 'Vélo puis course, allure de course',
      },
      {
        cle: 'comb_courte',
        libelle: 'Combinée courte, transition rapide',
      },
    ],
  },

  // Statuts possibles d'une séance.
  statuts: [
    { cle: 'a_venir',  libelle: 'À venir',  couleur: '#9AA0A6' },
    { cle: 'faite',    libelle: 'Faite',    couleur: '#2A9D8F' },
    { cle: 'partielle',libelle: 'Partielle',couleur: '#F4A300' },
    { cle: 'manquee',  libelle: 'Manquée',  couleur: '#E63946' },
  ],

  // Trame hebdomadaire de jours par défaut.
  // L'utilisateur peut la modifier pour chaque athlète.
  // Le code 0 = lundi, 6 = dimanche.
  trameJoursDefaut: {
    julien: [1, 3, 5, 6],   // mardi, jeudi, samedi, dimanche
    giulia: [1, 3, 5, 6],
  },
  joursSemaine: [
    'Lundi', 'Mardi', 'Mercredi', 'Jeudi',
    'Vendredi', 'Samedi', 'Dimanche',
  ],

  // Bloc de renforcement au poids du corps, ajouté en fin
  // de séance existante. Différencié par athlète.
  // Pas de créneau séparé.
  renforcement: {
    julien: {
      orientation:
        'Haut du corps et gainage, pour soutenir la traction '
        + 'en natation, son poste de progression principal.',
      exercices: [
        'Pompes classiques, 3 séries selon ressenti',
        'Tractions ou tirages élastiques, 3 séries',
        'Gainage ventral en planche, 3 fois 45 secondes',
        'Gainage latéral, 2 fois 30 secondes par côté',
        'Pompes en position pic, 3 séries pour les épaules',
        'Superman au sol pour la chaîne postérieure, 3 séries',
      ],
      duree: '12 à 15 minutes',
    },
    giulia: {
      orientation:
        'Jambes, hanches et gainage, pour soutenir le passage '
        + 'au format Olympic et la résistance sur le vélo et la course.',
      exercices: [
        'Squats au poids du corps, 3 séries',
        'Fentes alternées, 3 séries de 10 par jambe',
        'Pont fessier au sol, 3 séries',
        'Gainage ventral en planche, 3 fois 45 secondes',
        'Gainage latéral, 2 fois 30 secondes par côté',
        'Montées de genoux dynamiques, 3 séries courtes',
      ],
      duree: '12 à 15 minutes',
    },
  },

  // Repères nutrition strictement informatifs.
  // Aucun dosage personnalisé. Aucune prescription.
  // L'application n'affiche pas ces chiffres comme une recommandation
  // chiffrée pour l'utilisateur, mais comme des fourchettes générales
  // documentées dans la littérature grand public, à confirmer avec
  // un professionnel.
  nutrition: {
    avertissement:
      'Information générale, ne remplace pas l\'avis d\'un médecin '
      + 'ou d\'un nutritionniste. Consulter un professionnel avant '
      + 'de commencer un complément ou de modifier son alimentation.',
    reperes: [
      {
        cle: 'hydratation',
        libelle: 'Hydratation',
        usage:
          'Repère général, boire régulièrement sur la journée et '
          + 'à l\'effort. Sur sortie longue ou chaleur, ajouter des '
          + 'électrolytes peut aider à compenser les pertes.',
        moment: 'Toute la journée, et pendant et après les séances.',
        remarque:
          'Les besoins varient fortement selon la chaleur, la durée '
          + 'et la transpiration de chacun.',
      },
      {
        cle: 'glucides',
        libelle: 'Glucides',
        usage:
          'Principal carburant des séances longues ou intenses. '
          + 'Repas équilibré quelques heures avant, collation légère '
          + 'avant si nécessaire, ravitaillement liquide ou solide '
          + 'sur les sorties de plus d\'une heure.',
        moment: 'Avant, pendant les séances longues, après la séance.',
        remarque:
          'Adapter selon la durée et l\'intensité de la séance.',
      },
      {
        cle: 'proteines',
        libelle: 'Protéines',
        usage:
          'Soutiennent la récupération musculaire. Répartition sur '
          + 'la journée plus utile qu\'un apport ponctuel massif. '
          + 'Sources courantes : viande, poisson, oeufs, laitages, '
          + 'légumineuses, tofu.',
        moment:
          'Apport régulier sur la journée, dont une portion dans '
          + 'l\'heure qui suit une séance plus dure.',
        remarque:
          'Une alimentation variée couvre généralement les besoins. '
          + 'Les compléments en poudre sont une commodité, pas '
          + 'une obligation.',
      },
      {
        cle: 'creatine',
        libelle: 'Créatine monohydrate',
        usage:
          'Forme de complément la plus étudiée. Utile surtout pour '
          + 'les efforts courts et puissants. Effet plus discret sur '
          + 'l\'endurance pure, mais peut soutenir le renforcement.',
        moment:
          'Prise quotidienne régulière, le moment précis dans la '
          + 'journée a peu d\'importance.',
        remarque:
          'Boire suffisamment d\'eau. Demander un avis médical avant '
          + 'de commencer, surtout en cas de souci rénal connu.',
      },
      {
        cle: 'electrolytes',
        libelle: 'Sels minéraux et électrolytes',
        usage:
          'Sodium, potassium et magnésium peuvent être apportés via '
          + 'boisson d\'effort sur séances longues ou par fortes '
          + 'chaleurs, pour limiter le risque de crampes et soutenir '
          + 'l\'hydratation.',
        moment: 'Pendant les séances longues et par temps chaud.',
        remarque:
          'Pas systématique sur une séance courte en conditions '
          + 'fraîches.',
      },
      {
        cle: 'cafeine',
        libelle: 'Caféine',
        usage:
          'Stimulant courant, peut donner un coup de fouet ponctuel '
          + 'avant un effort. Tolérance très variable selon les '
          + 'personnes.',
        moment:
          'À tester à l\'entraînement avant d\'en faire usage le '
          + 'jour de la course. Éviter en fin de journée.',
        remarque:
          'Modération. À éviter si sensibilité, troubles du sommeil '
          + 'ou problème cardiaque connu.',
      },
    ],
  },

  // Avertissement santé global de l'application.
  avertissementSante:
    'Cet outil ne remplace pas un avis médical. Consulter un '
    + 'professionnel avant toute montée en charge importante ou '
    + 'avant de commencer un complément. Les allures cibles sont '
    + 'calculées uniquement à partir des chronos saisis et ne '
    + 'garantissent aucun résultat de course.',
};
