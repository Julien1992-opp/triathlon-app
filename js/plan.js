/*
 * plan.js
 * Générateur du plan d'entraînement, coeur métier de l'application.
 *
 * Dépendances :
 *   - REFERENCE : phases, disciplines, renforcement, libellés.
 *   - ALLURES   : zones et allure visée par discipline.
 *   - STORAGE   : lecture des profils, stockage des plans.
 *
 * Principes :
 *   - 15 semaines, du 18 mai au 30 août 2026.
 *   - 4 séances effectives par semaine et par athlète.
 *     Une séance combinée vélo puis course enchaînée compte pour 2.
 *   - Pas de phase d'initiation. Les deux athlètes sont confirmés.
 *   - Progression graduelle dans la phase, semaines allégées toutes
 *     les 4 semaines (4, 8, 12), affûtage en 13 et 14, course en 15.
 *   - Logique différenciée par athlète, paramétrée dans TEMPLATES.
 *     Un seul moteur, deux jeux de pondérations.
 *   - Les allures cibles sont strictement celles d'ALLURES, jamais
 *     recalculées ici. Si une discipline n'a pas de zone, la séance
 *     porte un message d'invitation, pas de valeur inventée.
 *   - La sortie commune vélo de 27 km en 1h23 est une allure facile,
 *     écartée des chronos de référence dans profils.js ; le plan ne
 *     l'utilise jamais comme base de charge.
 *   - Aucune garantie de résultat dans la sortie.
 *   - Génération déterministe : mêmes profil et chronos en entrée
 *     produisent le même plan en sortie. Aucun aléatoire.
 *   - Aucun trait d'union dans les textes affichables.
 *
 * Logique différenciée :
 *   - Julien : surpondération natation. La 4e séance penche
 *     régulièrement vers une 2e natation en phase de développement.
 *     En spécifique, accent sur seuil et alternance vélo seuil et
 *     vélo tempo.
 *   - Giulia : pas de rampe de distance pure. Une combinée toutes
 *     les deux semaines en développement, puis une combinée chaque
 *     semaine en spécifique. Accent sur l'allure de compétition,
 *     la transition rapide et la gestion de l'effort.
 *
 * Séances communes :
 *   - Sortie vélo endurance le dernier jour commun des deux trames
 *     en phase de développement.
 *   - Footing souple commun en semaine 14.
 *   - Triathlon le 30 août, séance commune par essence.
 *   - Toujours allure facile ou endurance, jamais en qualité.
 *     Chaque athlète garde ses zones propres sur la séance.
 *
 * Renforcement :
 *   - Ajouté en fin de séance existante, jamais en créneau séparé.
 *   - 2 séances équipées en développement, 1 en spécifique,
 *     1 en affûtage haute (sem 13), 0 ensuite.
 *   - Type de bloc tiré de REFERENCE.renforcement[athleteCle].
 *   - Préférence sur les séances non combinées et non qualité.
 */

const PLAN = (function () {

  // ============================================================
  // CONSTANTES
  // ============================================================

  const DATE_DEBUT = '2026-05-18';            // lundi de la semaine 1
  const DATE_COURSE = '2026-08-30';           // dimanche de la semaine 15
  const SEMAINES_DECHARGE = [4, 8, 12];       // semaines allégées
  const ATHLETES = ['julien', 'giulia'];

  // Multiplicateurs de durée par athlète et discipline.
  // Calibrent les volumes selon le profil de chacun :
  //   - Julien : référence (1.0), athlète Olympic confirmé.
  //   - Giulia : volumes nettement réduits sur vélo et combinée,
  //     car passage Sprint vers Olympic. Évite tout pic de charge
  //     sur ces disciplines.
  const MULTIPLICATEURS_DUREE = {
    julien: { natation: 1.0,  velo: 1.0,  course: 1.0,  combinee: 1.0  },
    giulia: { natation: 0.95, velo: 0.75, course: 0.90, combinee: 0.80 },
  };

  // Durées de référence en minutes par phase et discipline.
  // Ce sont des minutes brutes, ajustées ensuite par un facteur de
  // progression dans la phase et par le multiplicateur de l'athlète,
  // ou remplacées par la version allégée.
  const DUREES_BASE = {
    developpement: {
      natation: { normale: 50, allegee: 35 },
      velo:     { normale: 100, allegee: 70 },
      course:   { normale: 55, allegee: 40 },
      combinee: { normale: 85, allegee: 65 },
    },
    specifique: {
      natation: { normale: 55, allegee: 40 },
      velo:     { normale: 115, allegee: 80 },
      course:   { normale: 60, allegee: 45 },
      combinee: { normale: 105, allegee: 75 },
    },
    affutage: {
      natation: { normale: 40 },
      velo:     { normale: 70 },
      course:   { normale: 40 },
      combinee: { normale: 55 },
    },
    course: {
      natation: { normale: 25 },
      velo:     { normale: 35 },
      course:   { normale: 20 },
    },
  };


  // ============================================================
  // CATALOGUE DE SÉANCES TYPES
  // ============================================================
  //
  // Chaque entrée décrit une séance type, sans durée fixe.
  // La durée est calculée par calculerDureeSeance à partir de la phase
  // et de la position dans la phase. La zone cible est tirée des zones
  // calculées par ALLURES pour la discipline donnée.

  const CATALOGUE = {

    // ---- NATATION ----
    nat_endurance: {
      discipline: 'natation', libelle: 'Endurance technique',
      zoneCible: 'endurance',
      objectif: 'Construire l\'aérobie et garder une nage propre.',
      details:
        'Échauffement 600 m varié. Série principale environ 4 fois '
        + '400 m récupération 30 secondes en zone endurance. '
        + 'Retour au calme 300 m souple.',
    },
    nat_technique: {
      discipline: 'natation', libelle: 'Bloc technique',
      zoneCible: 'facile',
      objectif: 'Améliorer le geste, gainage en glisse, respiration.',
      details:
        'Échauffement 400 m. Éducatifs 12 fois 50 m par séries de 4 : '
        + 'rattrapé, doigts traînés, poings fermés. 8 fois 100 m '
        + 'respiration alternée 3 et 5. Retour 200 m.',
    },
    nat_seuil: {
      discipline: 'natation', libelle: 'Intervalles au seuil',
      zoneCible: 'seuil',
      objectif: 'Pousser le seuil aérobie en natation.',
      details:
        'Échauffement 600 m varié. Série 4 fois 400 m au seuil '
        + 'récupération 45 secondes. Retour 300 m souple.',
    },
    nat_vo2: {
      discipline: 'natation', libelle: 'Fractions courtes VO2',
      zoneCible: 'vo2',
      objectif: 'Solliciter la capacité maximale aérobie.',
      details:
        'Échauffement 600 m. 8 fois 100 m départ 2 minutes 30 secondes '
        + 'en zone VO2. Retour 300 m souple.',
    },
    nat_allure: {
      discipline: 'natation', libelle: 'Allure de course',
      zoneCible: 'seuil',
      objectif: 'Caler le rythme visé sur la nage de 1.5 km.',
      details:
        'Échauffement 500 m. 3 fois 500 m à allure visée 1.5 km '
        + 'récupération 1 minute. Retour 200 m.',
    },
    nat_activation: {
      discipline: 'natation', libelle: 'Activation natation',
      zoneCible: 'facile',
      objectif: 'Garder le contact avec l\'eau, sans fatigue.',
      details:
        'Échauffement 300 m. 6 fois 50 m progressifs récupération '
        + '20 secondes. Retour 200 m souple.',
    },

    // ---- VÉLO ----
    velo_endurance: {
      discipline: 'velo', libelle: 'Endurance longue',
      zoneCible: 'endurance',
      objectif: 'Construire l\'endurance fondamentale, sortie longue.',
      details:
        'Sortie continue en zone endurance sur parcours roulant. '
        + 'Quelques relances de 30 secondes à allure soutenue toutes '
        + 'les 15 minutes pour rester dynamique.',
    },
    velo_tempo: {
      discipline: 'velo', libelle: 'Tempo soutenu',
      zoneCible: 'endurance',
      objectif: 'Tenir un rythme soutenu, juste sous le seuil.',
      details:
        'Échauffement 20 minutes. 2 fois 20 minutes en haut endurance '
        + 'récupération 5 minutes facile. Retour souple.',
    },
    velo_seuil: {
      discipline: 'velo', libelle: 'Intervalles au seuil',
      zoneCible: 'seuil',
      objectif: 'Repousser le seuil sur le vélo.',
      details:
        'Échauffement 20 minutes. 3 fois 12 minutes au seuil '
        + 'récupération 4 minutes facile. Retour souple.',
    },
    velo_vo2: {
      discipline: 'velo', libelle: 'Fractions VO2',
      zoneCible: 'vo2',
      objectif: 'Travailler la capacité maximale aérobie.',
      details:
        'Échauffement 20 minutes. 6 fois 3 minutes en zone VO2 '
        + 'récupération 3 minutes facile. Retour souple.',
    },
    velo_allure: {
      discipline: 'velo', libelle: 'Allure de course',
      zoneCible: 'seuil',
      objectif: 'Caler l\'allure visée sur 40 km.',
      details:
        'Échauffement 20 minutes. 2 fois 25 minutes à allure visée '
        + '40 km récupération 5 minutes. Retour souple.',
    },
    velo_souple: {
      discipline: 'velo', libelle: 'Vélo souple',
      zoneCible: 'facile',
      objectif: 'Récupération active en pédalant.',
      details:
        'Sortie continue en zone facile, jambes légères, '
        + 'pas de relance.',
    },

    // ---- COURSE ----
    crs_endurance: {
      discipline: 'course', libelle: 'Sortie endurance',
      zoneCible: 'endurance',
      objectif: 'Construire l\'endurance et la solidité musculaire.',
      details:
        'Footing continu en zone endurance. Foulée relâchée, '
        + 'cadence autour de 175 à 180 par minute si possible.',
    },
    crs_seuil: {
      discipline: 'course', libelle: 'Intervalles au seuil',
      zoneCible: 'seuil',
      objectif: 'Travailler le seuil en course.',
      details:
        'Échauffement 15 minutes. 5 fois 5 minutes au seuil '
        + 'récupération 2 minutes en trot. Retour 10 minutes.',
    },
    crs_vo2: {
      discipline: 'course', libelle: 'Fractions VO2',
      zoneCible: 'vo2',
      objectif: 'Travailler la VO2 max sur fractions courtes.',
      details:
        'Échauffement 15 minutes. 10 fois 1 minute en zone VO2 '
        + 'récupération 1 minute en trot. Retour 10 minutes.',
    },
    crs_allure: {
      discipline: 'course', libelle: 'Allure de course',
      zoneCible: 'seuil',
      objectif: 'Caler l\'allure visée sur 10 km.',
      details:
        'Échauffement 15 minutes. 3 fois 10 minutes à allure visée '
        + '10 km récupération 3 minutes. Retour 10 minutes.',
    },
    crs_cotes: {
      discipline: 'course', libelle: 'Côtes courtes',
      zoneCible: 'vo2',
      objectif: 'Renforcer la foulée, gagner en puissance.',
      details:
        'Échauffement 15 minutes. 12 fois 45 secondes en côte '
        + 'modérée, retour en trottinant. Retour 10 minutes.',
    },
    crs_souple: {
      discipline: 'course', libelle: 'Footing souple',
      zoneCible: 'facile',
      objectif: 'Récupération active, foulée légère.',
      details:
        'Footing continu en zone facile. Pas de relance, '
        + 'foulée détendue.',
    },

    // ---- COMBINÉES (vélo puis course enchaînée) ----
    comb_endurance: {
      discipline: 'combinee', libelle: 'Combinée endurance',
      zoneCible: 'endurance',
      zoneCourse: 'endurance',
      objectif: 'Habituer les jambes à courir après le vélo.',
      details:
        'Vélo en zone endurance, transition rapide en moins de '
        + '5 minutes, puis course en zone endurance environ '
        + '20 à 30 minutes. Sensations avant tout.',
    },
    comb_allure: {
      discipline: 'combinee', libelle: 'Combinée allure de course',
      zoneCible: 'seuil',
      zoneCourse: 'seuil',
      objectif: 'Travailler la transition à allure de compétition.',
      details:
        'Vélo à allure visée 40 km, transition rapide, puis course '
        + 'à allure visée 10 km environ 25 à 30 minutes. Gérer les '
        + 'jambes, ne pas partir trop vite à pied.',
    },
    comb_courte: {
      discipline: 'combinee', libelle: 'Combinée courte',
      zoneCible: 'endurance',
      zoneCourse: 'endurance',
      objectif: 'Caler la transition rapide, garder les sensations.',
      details:
        'Vélo en zone endurance puis course environ 15 minutes en '
        + 'endurance. Transition la plus rapide possible.',
    },

    // ---- ACTIVATIONS ET COURSE DU JOUR ----
    act_natation: {
      discipline: 'natation', libelle: 'Activation natation',
      zoneCible: 'facile',
      objectif: 'Réveiller le geste, sans fatigue.',
      details:
        '300 m varié et 4 fois 50 m progressifs. Rester souple.',
    },
    act_velo: {
      discipline: 'velo', libelle: 'Activation vélo',
      zoneCible: 'facile',
      objectif: 'Réveiller les jambes, vérifier le matériel.',
      details:
        'Sortie courte en zone facile avec 4 fois 1 minute '
        + 'progressives sans forcer.',
    },
    course_jour: {
      discipline: 'course_jour',
      libelle: 'Triathlon de Lausanne, format Olympic',
      zoneCible: null,
      objectif: 'Le grand jour. Application de ce qui a été préparé.',
      details:
        'Triathlon Olympic : 1.5 km natation, 40 km vélo, 10 km '
        + 'course. Gérer le départ, garder de la marge sur la nage, '
        + 'doser le vélo, finir avec la tête sur le 10 km.',
    },
  };


  // ============================================================
  // TEMPLATES PAR ATHLÈTE
  // ============================================================
  //
  // Chaque entrée définit une "composition" de séances pour une phase.
  // Une spécification de séance porte :
  //   - type           : clé dans CATALOGUE
  //   - combinee       : true si la séance compte pour 2 dans le décompte
  //   - personnalisable: true si la séance est la 4e séance modifiable
  //   - commune        : true si la séance est candidate à une séance
  //                       commune avec l'autre athlète (allure facile
  //                       ou endurance uniquement)
  //   - jourPrefere    : pour la semaine 15, indice de jour souhaité

  const TEMPLATES = {

    // La séance commune candidate (vélo endurance ou footing souple)
    // est volontairement placée en dernière position des templates
    // pertinents, pour qu'elle atterrisse sur le dernier jour de la
    // trame (typiquement dimanche) et qu'elle coïncide naturellement
    // avec le jour commun aux deux athlètes, sans déplacement.

    julien: {
      surpondereDiscipline: 'natation',
      developpement: {
        normale: [
          { type: 'nat_endurance' },
          { type: 'nat_technique', personnalisable: true },
          { type: 'crs_endurance' },
          { type: 'velo_endurance', commune: true },
        ],
        allegee: [
          { type: 'nat_endurance' },
          { type: 'nat_technique', personnalisable: true },
          { type: 'crs_endurance' },
          { type: 'velo_endurance', commune: true },
        ],
      },
      specifique: {
        // Sem 7, 9, 11 : combinée allure + 1 qualité nat + 1 endurance
        // vélo. Toujours une respiration sur les trois sessions.
        avecCombinee: [
          { type: 'nat_seuil' },
          { type: 'velo_endurance' },
          { type: 'comb_allure', combinee: true, personnalisable: true },
        ],
        // Sem 8, 10 : pas de combinée, 4 séances pures dont une
        // commune en endurance le dimanche. Deux natations par
        // semaine pour maintenir la surpondération du poste à
        // pousser pour Julien, plus un vélo seuil de qualité.
        // La course pure cède ici la place à la nat endurance :
        // le travail course continue via les segments course allure
        // des combinées des semaines 7, 9 et 11.
        sansCombinee: [
          { type: 'nat_seuil' },
          { type: 'velo_seuil' },
          { type: 'nat_endurance', personnalisable: true },
          { type: 'velo_endurance', commune: true },
        ],
        // Sem 12 : décharge complète, tout en endurance.
        allegee: [
          { type: 'nat_endurance' },
          { type: 'velo_endurance' },
          { type: 'comb_endurance', combinee: true, personnalisable: true },
        ],
      },
      affutage: {
        sem13: [
          { type: 'nat_seuil' },
          { type: 'velo_tempo' },
          { type: 'crs_seuil' },
          { type: 'nat_activation', personnalisable: true },
        ],
        sem14: [
          { type: 'nat_activation' },
          { type: 'velo_souple' },
          { type: 'nat_activation', personnalisable: true },
          { type: 'crs_souple', commune: true },
        ],
      },
      course: [
        { type: 'act_natation' },
        { type: 'act_velo' },
        { type: 'crs_souple' },
        { type: 'course_jour', commune: true },
      ],
    },

    giulia: {
      surpondereDiscipline: 'combinees',
      developpement: {
        // Semaines impaires non allégées : 4 séances pures dont
        // une 2e séance course pour ancrer la course à pied.
        sansCombinee: [
          { type: 'nat_endurance' },
          { type: 'crs_endurance' },
          { type: 'crs_souple', personnalisable: true },
          { type: 'velo_endurance', commune: true },
        ],
        // Semaines paires non allégées : 3 calendrier avec combinée
        // endurance, pour habituer les jambes à courir après le vélo.
        // Pas de séance commune ces semaines, la combinée occupe le
        // jour de la sortie longue.
        avecCombinee: [
          { type: 'nat_endurance' },
          { type: 'velo_endurance' },
          { type: 'comb_endurance', combinee: true, personnalisable: true },
        ],
        allegee: [
          { type: 'nat_endurance' },
          { type: 'crs_endurance' },
          { type: 'nat_technique', personnalisable: true },
          { type: 'velo_endurance', commune: true },
        ],
      },
      specifique: {
        // Sem 7, 9, 11 : combinée allure de course en sortie longue
        // dominicale, accompagnée d'un vélo seuil et d'une nat en
        // endurance pour respirer. Accent fort allure de compétition.
        avecCombinee: [
          { type: 'nat_endurance' },
          { type: 'velo_seuil' },
          { type: 'comb_allure', combinee: true, personnalisable: true },
        ],
        // Sem 8, 10 : pas de combinée, 4 séances pures dont une
        // commune en endurance le dimanche. Nat allure et course
        // seuil pour garder l'accent allure compétition.
        sansCombinee: [
          { type: 'nat_allure' },
          { type: 'crs_seuil' },
          { type: 'crs_souple', personnalisable: true },
          { type: 'velo_endurance', commune: true },
        ],
        allegee: [
          { type: 'nat_endurance' },
          { type: 'velo_endurance' },
          { type: 'comb_endurance', combinee: true, personnalisable: true },
        ],
      },
      affutage: {
        sem13: [
          { type: 'nat_seuil' },
          { type: 'velo_tempo' },
          { type: 'comb_courte', combinee: true, personnalisable: true },
        ],
        sem14: [
          { type: 'nat_activation' },
          { type: 'velo_souple' },
          { type: 'nat_activation', personnalisable: true },
          { type: 'crs_souple', commune: true },
        ],
      },
      course: [
        { type: 'act_natation' },
        { type: 'act_velo' },
        { type: 'crs_souple' },
        { type: 'course_jour', commune: true },
      ],
    },
  };


  // ============================================================
  // HELPERS
  // ============================================================

  // Renvoie 'AAAA-MM-JJ' pour la semaine et le jour donnés.
  // jourIndex : 0 = lundi, 6 = dimanche.
  function dateDuJour(numeroSemaine, jourIndex) {
    const debut = new Date(DATE_DEBUT + 'T12:00:00');
    const offset = (numeroSemaine - 1) * 7 + jourIndex;
    const d = new Date(debut.getTime() + offset * 86400000);
    const aaaa = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const jj = String(d.getDate()).padStart(2, '0');
    return aaaa + '-' + mm + '-' + jj;
  }

  function trouverPhase(numeroSemaine) {
    if (!REFERENCE || !REFERENCE.phases) return null;
    for (let i = 0; i < REFERENCE.phases.length; i++) {
      const p = REFERENCE.phases[i];
      if (numeroSemaine >= p.semaineDebut && numeroSemaine <= p.semaineFin) {
        return p;
      }
    }
    return null;
  }

  function estSemaineDecharge(numeroSemaine) {
    return SEMAINES_DECHARGE.indexOf(numeroSemaine) !== -1;
  }

  function genererIdSeance(athleteCle, semaineNum, indexSeance) {
    return athleteCle + '_s'
      + String(semaineNum).padStart(2, '0')
      + '_' + indexSeance;
  }

  // Durée en minutes selon la phase, la position dans la phase et
  // l'athlète. Trois étages :
  //   1. Base par phase et discipline (DUREES_BASE).
  //   2. Facteur de progression dans la phase, de 0.92 à 1.08, soit
  //      une amplitude de 16 % qui évite tout pic d'une semaine
  //      à l'autre. Allégée et affûtage suivent leurs règles propres.
  //   3. Multiplicateur par athlète et discipline, qui calibre les
  //      volumes selon le profil (voir MULTIPLICATEURS_DUREE).
  function calculerDureeSeance(discipline, phaseCle, semaineNum,
                               allegee, athleteCle) {
    const blocPhase = DUREES_BASE[phaseCle];
    if (!blocPhase) return null;
    const bloc = blocPhase[discipline];
    if (!bloc) return null;

    let baseDuree;
    if (allegee && typeof bloc.allegee === 'number') {
      baseDuree = bloc.allegee;
    } else if (phaseCle === 'affutage') {
      // Décharge progressive sur les deux semaines d'affûtage.
      baseDuree = semaineNum === 13
        ? bloc.normale
        : Math.round(bloc.normale * 0.7);
    } else if (phaseCle === 'course') {
      baseDuree = bloc.normale;
    } else {
      const phaseDef = trouverPhase(semaineNum);
      if (!phaseDef || phaseDef.duree <= 1) {
        baseDuree = bloc.normale;
      } else {
        const pos = semaineNum - phaseDef.semaineDebut;
        const progression = pos / (phaseDef.duree - 1);
        baseDuree = Math.round(bloc.normale * (0.92 + 0.16 * progression));
      }
    }

    const mults = MULTIPLICATEURS_DUREE[athleteCle];
    if (mults && typeof mults[discipline] === 'number') {
      baseDuree = Math.round(baseDuree * mults[discipline]);
    }
    return baseDuree;
  }


  // ============================================================
  // CONSTRUCTION DES ALLURES CIBLES
  // ============================================================

  function construireAllureCible(zones, discipline, zoneCible) {
    if (!zones || !discipline || !zoneCible) return null;
    const r = zones[discipline];
    if (!r || !r.estEstimation || !r.zonesEntrainement) return null;
    const z = r.zonesEntrainement.find(function (z) {
      return z.cle === zoneCible;
    });
    if (!z) return null;
    return {
      zone: zoneCible,
      libelle: z.libelle,
      affichage: z.affichage,
      valeur: z.valeur,
      unite: z.unite,
    };
  }

  function construireAllureCombinee(zones, zoneVelo, zoneCourse) {
    const out = {};
    const av = construireAllureCible(zones, 'velo', zoneVelo);
    const ac = construireAllureCible(zones, 'course', zoneCourse || zoneVelo);
    if (av) out.velo = av;
    if (ac) out.course = ac;
    return Object.keys(out).length > 0 ? out : null;
  }

  // Message d'invitation à compléter le profil quand une zone manque.
  function messageInvitationProfil(discipline) {
    const noms = { natation: 'la natation', velo: 'le vélo',
                   course: 'la course' };
    return 'Allure non calculée. Saisir un chrono représentatif pour '
      + (noms[discipline] || discipline)
      + ' dans le profil pour obtenir l\'allure cible de la séance.';
  }


  // ============================================================
  // RENFORCEMENT
  // ============================================================

  function construireBlocRenforcement(athleteCle) {
    if (!REFERENCE || !REFERENCE.renforcement) return null;
    const r = REFERENCE.renforcement[athleteCle];
    if (!r) return null;
    return {
      actif: true,
      orientation: r.orientation,
      exercices: r.exercices.slice(),
      duree: r.duree,
    };
  }

  // Attribue un bloc renforcement à un nombre limité de séances.
  // Préférence : séances non combinées et zones facile ou endurance.
  // Le renforcement reste secondaire et ne s'ajoute jamais sur une
  // combinée ni sur une séance VO2.
  function attribuerRenforcement(seances, athleteCle, phaseCle,
                                 semaineNum, allegee) {
    let nbBlocs = 0;
    if (phaseCle === 'developpement') nbBlocs = allegee ? 1 : 2;
    else if (phaseCle === 'specifique') nbBlocs = allegee ? 0 : 1;
    else if (phaseCle === 'affutage') nbBlocs = semaineNum === 13 ? 1 : 0;
    else nbBlocs = 0;

    if (nbBlocs === 0) return seances;

    function score(s) {
      if (s.discipline === 'combinee' || s.discipline === 'course_jour') {
        return 99;
      }
      if (s.zoneCible === 'vo2') return 3;
      if (s.zoneCible === 'seuil') return 2;
      return 1; // facile, endurance, technique
    }

    const candidates = seances
      .map(function (s, i) { return { s: s, i: i, sc: score(s) }; })
      .filter(function (e) { return e.sc < 99; })
      .sort(function (a, b) { return a.sc - b.sc; });

    for (let k = 0; k < nbBlocs && k < candidates.length; k++) {
      seances[candidates[k].i].renforcement =
        construireBlocRenforcement(athleteCle);
    }
    return seances;
  }


  // ============================================================
  // COMPOSITION HEBDOMADAIRE
  // ============================================================

  // Retourne la liste de spécifications de séances pour la semaine.
  // Une spécification = { type, combinee?, personnalisable?, commune? }
  function composerSemaine(athleteCle, semaineNum, phaseCle, allegee) {
    const t = TEMPLATES[athleteCle];

    if (phaseCle === 'course') {
      return t.course.slice();
    }
    if (phaseCle === 'affutage') {
      return (semaineNum === 13 ? t.affutage.sem13 : t.affutage.sem14)
        .slice();
    }
    if (allegee) {
      return t[phaseCle].allegee.slice();
    }
    if (phaseCle === 'developpement') {
      if (athleteCle === 'julien') {
        return t.developpement.normale.slice();
      }
      // Giulia : alternance combinée toutes les 2 semaines en dev.
      return (semaineNum % 2 === 0)
        ? t.developpement.avecCombinee.slice()
        : t.developpement.sansCombinee.slice();
    }
    if (phaseCle === 'specifique') {
      // Sem impaires (7, 9, 11) : avec combinée allure.
      // Sem paires (8, 10) : sans combinée, 4 séances pures dont
      // une commune en endurance, pour répartir les séances communes
      // de manière régulière sur toute la spécifique.
      return (semaineNum % 2 === 1)
        ? t.specifique.avecCombinee.slice()
        : t.specifique.sansCombinee.slice();
    }
    return [];
  }

  // Choisit les jours sur lesquels poser les séances de la semaine,
  // à partir de la trame de l'athlète. Si moins de séances que de
  // jours dans la trame, on saute l'avant dernier pour étaler.
  function distribuerJours(nbSeances, trameJours) {
    const tj = (trameJours || []).slice().sort(function (a, b) {
      return a - b;
    });
    if (tj.length === 0) return [];
    if (nbSeances >= tj.length) return tj.slice(0, nbSeances);
    if (nbSeances === tj.length - 1) {
      const r = [];
      for (let i = 0; i < tj.length; i++) {
        if (i === tj.length - 2) continue; // saute l'avant dernier
        r.push(tj[i]);
      }
      return r;
    }
    // Cas extrêmes : étirer entre premier et dernier.
    if (nbSeances <= 1) return [tj[0]];
    const out = [tj[0], tj[tj.length - 1]];
    for (let i = 1; i < tj.length - 1 && out.length < nbSeances; i++) {
      out.splice(out.length - 1, 0, tj[i]);
    }
    return out.slice(0, nbSeances);
  }


  // ============================================================
  // GÉNÉRATION D'UNE SÉANCE
  // ============================================================

  function genererSeance(spec, contexte) {
    const cat = CATALOGUE[spec.type];
    if (!cat) return null;

    const isCourseJour = spec.type === 'course_jour';
    const isCombinee = cat.discipline === 'combinee';

    const dureeMin = isCourseJour
      ? null
      : calculerDureeSeance(cat.discipline, contexte.phaseCle,
                            contexte.semaineNum, contexte.allegee,
                            contexte.athleteCle);

    let allureCible = null;
    let messageAllure = null;

    if (isCourseJour) {
      // Pas d'allure prescrite, c'est la course.
    } else if (isCombinee) {
      allureCible = construireAllureCombinee(
        contexte.zones, cat.zoneCible, cat.zoneCourse);
      if (!allureCible) {
        messageAllure =
          'Allures non calculées. Saisir un chrono pour le vélo et '
          + 'la course pour obtenir les allures de la séance combinée.';
      }
    } else {
      allureCible = construireAllureCible(
        contexte.zones, cat.discipline, cat.zoneCible);
      if (!allureCible) {
        messageAllure = messageInvitationProfil(cat.discipline);
      }
    }

    return {
      id: genererIdSeance(contexte.athleteCle, contexte.semaineNum,
                          contexte.indexDansSemaine),
      semaineNum: contexte.semaineNum,
      jour: contexte.jour,
      date: contexte.date,
      discipline: cat.discipline,
      typeSeance: spec.type,
      libelle: cat.libelle,
      duree_min: dureeMin,
      zoneCible: cat.zoneCible,
      // ATTENTION : allureCible et messageAllure ne sont plus
      // consultés pour l'affichage depuis la correction apportée
      // à seances.js. La source de vérité de l'allure est désormais
      // le calcul dynamique fait dans seances.js à partir des
      // chronos courants du profil (fonction calculerAllureCourante),
      // pour que toute saisie ou modification de chrono se reflète
      // immédiatement dans le Plan sans régénération.
      // Ces deux champs sont uniquement conservés pour la
      // compatibilité d'anciens exports JSON et la lisibilité de
      // la structure persistée. Ne pas les utiliser pour décider
      // de l'allure affichée. Ne pas se fier à leur valeur lors
      // d'une relecture future.
      allureCible: allureCible,
      messageAllure: messageAllure,
      objectif: cat.objectif,
      details: cat.details,
      renforcement: null, // attribué ensuite par attribuerRenforcement
      estCommune: false,  // marqué à la synchronisation entre plans
      estCommuneCandidate: !!spec.commune,
      estPersonnalisable: !!spec.personnalisable,
      compteCommeNSeances: spec.combinee ? 2 : 1,
    };
  }


  // ============================================================
  // GÉNÉRATION D'UNE SEMAINE
  // ============================================================

  function genererSemaine(athleteCle, semaineNum, profil, zones) {
    const phaseDef = trouverPhase(semaineNum);
    if (!phaseDef) return null;
    const phaseCle = phaseDef.cle;
    const allegee = estSemaineDecharge(semaineNum);

    const specs = composerSemaine(athleteCle, semaineNum, phaseCle, allegee);
    const trame = (profil && profil.trameJours)
      ? profil.trameJours
      : (REFERENCE && REFERENCE.trameJoursDefaut
          && REFERENCE.trameJoursDefaut[athleteCle])
        || [1, 3, 5, 6];

    // Cas spécial sem 15 : course le dimanche 30 août.
    let jours;
    if (phaseCle === 'course') {
      const trameTriee = trame.slice().sort(function (a, b) { return a - b; });
      const joursAvantDimanche = trameTriee
        .filter(function (j) { return j < 6; })
        .slice(0, 3);
      jours = joursAvantDimanche.slice();
      while (jours.length < 3) jours.push(jours[jours.length - 1] || 0);
      jours.push(6); // dimanche pour la course
    } else {
      jours = distribuerJours(specs.length, trame);
    }

    const seances = [];
    for (let i = 0; i < specs.length; i++) {
      const jour = jours[i];
      const date = phaseCle === 'course' && specs[i].type === 'course_jour'
        ? DATE_COURSE
        : dateDuJour(semaineNum, jour);
      const s = genererSeance(specs[i], {
        athleteCle: athleteCle,
        semaineNum: semaineNum,
        phaseCle: phaseCle,
        allegee: allegee,
        zones: zones,
        jour: jour,
        date: date,
        indexDansSemaine: i,
      });
      if (s) seances.push(s);
    }

    // Renforcement ajouté en fin de séances éligibles.
    attribuerRenforcement(seances, athleteCle, phaseCle, semaineNum, allegee);

    // Décompte
    let totalEff = 0;
    for (let i = 0; i < seances.length; i++) {
      totalEff += seances[i].compteCommeNSeances;
    }

    return {
      numero: semaineNum,
      phase: phaseCle,
      phaseLibelle: phaseDef.libelle,
      estAllegee: allegee,
      dateDebut: dateDuJour(semaineNum, 0),
      dateFin: dateDuJour(semaineNum, 6),
      seances: seances,
      totalSeancesCalendrier: seances.length,
      totalSeancesEffectives: totalEff,
    };
  }


  // ============================================================
  // GÉNÉRATION D'UN PLAN COMPLET
  // ============================================================

  function genererPlanInterne(athleteCle) {
    const profil = STORAGE.obtenirAthlete(athleteCle);
    const zones = ALLURES.calculerToutesZones(profil.chronos);

    const semaines = [];
    let totalEff = 0;
    for (let n = 1; n <= 15; n++) {
      const sem = genererSemaine(athleteCle, n, profil, zones);
      semaines.push(sem);
      totalEff += sem.totalSeancesEffectives;
    }

    return {
      athleteCle: athleteCle,
      dateGeneration: new Date().toISOString(),
      dateDebut: DATE_DEBUT,
      dateCourse: DATE_COURSE,
      reglesAppliquees: {
        surpondereDiscipline: TEMPLATES[athleteCle].surpondereDiscipline,
        semainesDecharge: SEMAINES_DECHARGE.slice(),
        affutage: [13, 14],
        semaineCourse: 15,
      },
      semaines: semaines,
      totalSeancesEffectives: totalEff,
    };
  }


  // ============================================================
  // SYNCHRONISATION DES SÉANCES COMMUNES
  // ============================================================

  // Pour chaque semaine, si les deux plans ont une séance commune
  // candidate, on les pose le même jour (préférer dimanche, sinon
  // le dernier jour commun aux deux trames) et on marque estCommune.
  // Sinon on laisse les jours par défaut, et aucune séance n'est
  // marquée commune cette semaine.
  function synchroniserCommunes(planJ, planG, trameJ, trameG) {
    const joursPrefereOrdre = [6, 5, 4, 3, 2, 1, 0];
    const jourCommun = joursPrefereOrdre.find(function (j) {
      return trameJ.indexOf(j) !== -1 && trameG.indexOf(j) !== -1;
    });

    for (let k = 0; k < planJ.semaines.length; k++) {
      const semJ = planJ.semaines[k];
      const semG = planG.semaines[k];

      // Cas particulier semaine de course : course_jour toujours commune.
      if (semJ.phase === 'course') {
        marquerCourseJourCommune(semJ);
        marquerCourseJourCommune(semG);
        continue;
      }

      const idxJ = semJ.seances.findIndex(function (s) {
        return s.estCommuneCandidate;
      });
      const idxG = semG.seances.findIndex(function (s) {
        return s.estCommuneCandidate;
      });
      if (idxJ === -1 || idxG === -1) continue;
      if (jourCommun === undefined) continue;

      // On ne marque commune que si la séance candidate coïncide déjà
      // avec le jour commun dans les deux plans. Sinon, le déplacement
      // risque d'écraser une autre séance sur le même jour : on préfère
      // laisser les deux plans inchangés cette semaine plutôt que créer
      // un doublon dans une journée.
      if (semJ.seances[idxJ].jour === jourCommun
          && semG.seances[idxG].jour === jourCommun) {
        semJ.seances[idxJ].estCommune = true;
        semG.seances[idxG].estCommune = true;
      }
    }
  }

  function marquerCourseJourCommune(semaine) {
    for (let i = 0; i < semaine.seances.length; i++) {
      if (semaine.seances[i].typeSeance === 'course_jour') {
        semaine.seances[i].estCommune = true;
      }
    }
  }


  // ============================================================
  // API PUBLIQUE
  // ============================================================

  // Génère et persiste un plan pour un athlète, sans synchronisation
  // des séances communes avec l'autre. Utile pour un usage individuel.
  function genererPlan(athleteCle) {
    if (ATHLETES.indexOf(athleteCle) === -1) {
      throw new Error('Athlète inconnu : ' + athleteCle);
    }
    const plan = genererPlanInterne(athleteCle);
    STORAGE.enregistrerPlan(athleteCle, plan);
    return plan;
  }

  // Génère et persiste les deux plans, puis synchronise les séances
  // communes entre eux. Conserve le caractère déterministe.
  function genererPlansLesDeux() {
    const planJ = genererPlanInterne('julien');
    const planG = genererPlanInterne('giulia');

    const profilJ = STORAGE.obtenirAthlete('julien');
    const profilG = STORAGE.obtenirAthlete('giulia');
    synchroniserCommunes(planJ, planG,
      profilJ.trameJours || [], profilG.trameJours || []);

    STORAGE.enregistrerPlan('julien', planJ);
    STORAGE.enregistrerPlan('giulia', planG);
    return { julien: planJ, giulia: planG };
  }

  function obtenirPlan(athleteCle) {
    return STORAGE.obtenirPlan(athleteCle);
  }

  // Remplace la séance personnalisable d'une semaine par une nouvelle
  // spécification fournie par l'utilisateur. Conserve la position et
  // les drapeaux (personnalisable, jour, date). Retourne le plan mis
  // à jour, ou null si la séance ciblée est introuvable.
  function modifierQuatriemeSeance(athleteCle, semaineNum, nouvelleSpec) {
    const plan = STORAGE.obtenirPlan(athleteCle);
    if (!plan || !plan.semaines) return null;
    const sem = plan.semaines.find(function (s) {
      return s.numero === semaineNum;
    });
    if (!sem) return null;
    const idx = sem.seances.findIndex(function (s) {
      return s.estPersonnalisable;
    });
    if (idx === -1) return null;

    const profil = STORAGE.obtenirAthlete(athleteCle);
    const zones = ALLURES.calculerToutesZones(profil.chronos);
    const ancienne = sem.seances[idx];

    const nouvelle = genererSeance(nouvelleSpec, {
      athleteCle: athleteCle,
      semaineNum: semaineNum,
      phaseCle: sem.phase,
      allegee: sem.estAllegee,
      zones: zones,
      jour: ancienne.jour,
      date: ancienne.date,
      indexDansSemaine: idx,
    });
    if (!nouvelle) return null;

    // On conserve l'identité de la position (id, drapeau personnalisable).
    nouvelle.id = ancienne.id;
    nouvelle.estPersonnalisable = true;
    sem.seances[idx] = nouvelle;

    // Recompte total effectives.
    let totalEff = 0;
    for (let i = 0; i < sem.seances.length; i++) {
      totalEff += sem.seances[i].compteCommeNSeances;
    }
    sem.totalSeancesEffectives = totalEff;

    STORAGE.enregistrerPlan(athleteCle, plan);
    return plan;
  }

  // Efface le plan persisté d'un athlète pour forcer une regénération.
  function invaliderPlan(athleteCle) {
    STORAGE.enregistrerPlan(athleteCle, null);
  }


  // ============================================================
  // INTERFACE PUBLIQUE
  // ============================================================

  return {
    // Constantes exposées pour transparence.
    DATE_DEBUT: DATE_DEBUT,
    DATE_COURSE: DATE_COURSE,
    SEMAINES_DECHARGE: SEMAINES_DECHARGE,
    CATALOGUE: CATALOGUE,
    TEMPLATES: TEMPLATES,

    // Génération.
    genererPlan: genererPlan,
    genererPlansLesDeux: genererPlansLesDeux,
    obtenirPlan: obtenirPlan,

    // Mutations contrôlées.
    modifierQuatriemeSeance: modifierQuatriemeSeance,
    invaliderPlan: invaliderPlan,

    // Utilitaires exposés (pour seances.js et progression.js).
    trouverPhase: trouverPhase,
    estSemaineDecharge: estSemaineDecharge,
    dateDuJour: dateDuJour,
  };

})();
