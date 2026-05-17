/*
 * allures.js
 * Moteur de calcul des allures et des zones d'entraînement.
 *
 * MODÈLE
 *
 *   Deux objets bien distincts en sortie pour chaque discipline,
 *   à ne jamais confondre :
 *
 *   A. Allure visée en compétition.
 *      Vitesse moyenne extrapolée sur la distance cible de l'épreuve,
 *      à partir d'un chrono représentatif saisi par l'athlète.
 *      C'est une PRÉDICTION DE COURSE, pas une zone d'entraînement.
 *      Exemple, sur 10 km, Julien vise environ 4:18 par km.
 *
 *   B. Zones d'entraînement.
 *      Plages d'allure plus lentes que la compétition pour l'essentiel,
 *      destinées à structurer les séances. Quatre zones, du plus
 *      facile au plus intense : facile, endurance, seuil, VO2.
 *      Le SEUIL d'entraînement est toujours plus lent que l'allure
 *      visée en compétition sur la distance cible, jamais égal au
 *      chrono.
 *
 * RAISONNEMENT SUR LES COEFFICIENTS
 *
 *   L'allure visée en compétition correspond à un effort proche du
 *   maximum sur la distance cible, environ 30 à 90 minutes.
 *   Le SEUIL D'ENTRAÎNEMENT correspond à un effort soutenable plus
 *   longtemps, de l'ordre d'une heure à allure régulière, avec marge.
 *   En pratique, il se situe quelques pourcents plus lent que
 *   l'allure de compétition sur 10 km en course, sur 1.5 km en nage
 *   ou sur 40 km en vélo.
 *
 *   On applique donc au temps de l'allure visée :
 *     facile     : 1.30  (sortie longue très souple)
 *     endurance  : 1.18  (sortie longue à allure soutenable)
 *     seuil      : 1.05  (effort tenable environ une heure)
 *     VO2        : 0.93  (fractions courtes, plus rapides que l'allure
 *                          de compétition sur la distance cible)
 *
 *   Ces coefficients sont des conventions classiques des plans
 *   d'endurance grand public. La zone seuil n'est donc jamais alignée
 *   sur le chrono : elle laisse de la marge à l'entraînement, ce qui
 *   est particulièrement important pour Julien en natation, point
 *   faible à ménager.
 *
 * FORMULE D'EXTRAPOLATION ET LIMITES
 *
 *   On utilise la formule classique de Pete Riegel pour ramener un
 *   chrono saisi à la distance cible :
 *     T_cible = T_chrono * (D_cible / D_chrono) ^ 1.06
 *
 *   Cette formule est calibrée pour la course à pied. Appliquée au
 *   vélo et à la natation, elle reste une estimation acceptable,
 *   mais d'autant moins fiable que la distance du chrono source
 *   s'éloigne de la distance cible.
 *
 *   Pour rendre cette limite VISIBLE, chaque résultat embarque un
 *   indicateur de fiabilité :
 *     elevee  : chrono source proche de la distance cible
 *     moyenne : extrapolation modérée
 *     faible  : extrapolation forte, à interpréter avec prudence
 *
 *   Le module continue d'utiliser Riegel, qui reste le meilleur
 *   choix simple et explicable. L'indicateur sert à l'interface
 *   pour afficher une mention de prudence si nécessaire.
 *
 * GARDE FOUS
 *
 *   - Calcul uniquement à partir des chronos réels saisis dans
 *     le profil. Aucune valeur de remplacement inventée.
 *   - La sortie facile est écartée du calcul via le drapeau
 *     estReference = false. Concrètement, la sortie commune
 *     vélo à allure détendue ne biaise jamais les zones.
 *   - Aucune fréquence cardiaque dérivée. La FC est purement
 *     manuelle, gérée ailleurs.
 *   - Toutes les valeurs produites sont des ESTIMATIONS, jamais
 *     présentées comme une garantie de performance.
 *
 * FORMAT D'ENTRÉE D'UN CHRONO
 *
 *   {
 *     libelle: 'Triathlon Olympic, segment vélo',
 *     distance: 40,
 *     uniteDistance: 'km',    // 'km' ou 'm'
 *     temps_s: 4860,
 *     date: '2025-09-15',
 *     estReference: true,     // false = allure facile, écarté
 *   }
 */

const ALLURES = (function () {

  // Distances cibles internes, en mètres pour uniformiser les calculs.
  const DISTANCES_REFERENCE_M = {
    natation: 1500,
    velo: 40000,
    course: 10000,
  };

  // Exposant de la formule de Pete Riegel. Convention 1.06.
  const EXPOSANT_RIEGEL = 1.06;

  // Coefficients appliqués au TEMPS de l'allure visée en compétition,
  // pour dériver les zones d'entraînement. Voir commentaire en tête
  // de fichier pour le raisonnement.
  const COEFFICIENTS_ZONES_TEMPS = {
    facile:    1.30,
    endurance: 1.18,
    seuil:     1.05,
    vo2:       0.93,
  };

  const LIBELLES_ZONES = {
    facile:    'Facile',
    endurance: 'Endurance',
    seuil:     'Seuil',
    vo2:       'VO2',
  };

  const ORDRE_ZONES = ['facile', 'endurance', 'seuil', 'vo2'];

  const LIBELLES_DISCIPLINE = {
    natation: 'la natation',
    velo: 'le vélo',
    course: 'la course',
  };

  // Libellés affichés au dessus de l'allure visée, par discipline.
  const LIBELLES_ALLURE_VISEE = {
    natation: 'Allure visée sur 1.5 km',
    velo:     'Allure visée sur 40 km',
    course:   'Allure visée sur 10 km',
  };


  // -------------------- Normalisation des entrées --------------------

  function distanceEnMetres(chrono, discipline) {
    let d = Number(chrono.distance);
    let unite = chrono.uniteDistance;
    if (!unite) {
      unite = (discipline === 'natation') ? 'm' : 'km';
    }
    if (unite === 'km') {
      d = d * 1000;
    }
    return d;
  }

  function chronoEstUtilisable(chrono) {
    if (!chrono || typeof chrono !== 'object') return false;
    if (chrono.estReference === false) return false;
    if (typeof chrono.temps_s !== 'number' || !(chrono.temps_s > 0)) {
      return false;
    }
    if (typeof chrono.distance !== 'number' || !(chrono.distance > 0)) {
      return false;
    }
    return true;
  }


  // -------------------- Sélection du chrono source --------------------

  // On garde le chrono dont la distance est la plus proche, en ratio,
  // de la distance cible. L'écart est mesuré en logarithme du ratio,
  // ce qui place 5 km et 20 km à la même distance perçue de 10 km.
  function choisirChronoSource(chronos, discipline) {
    const utiles = (Array.isArray(chronos) ? chronos : [])
      .filter(chronoEstUtilisable);
    if (utiles.length === 0) return null;

    const distanceCible = DISTANCES_REFERENCE_M[discipline];
    let meilleur = null;
    let meilleurEcart = Infinity;

    for (let i = 0; i < utiles.length; i++) {
      const c = utiles[i];
      const dm = distanceEnMetres(c, discipline);
      const ecart = Math.abs(Math.log(dm / distanceCible));
      if (ecart < meilleurEcart) {
        meilleurEcart = ecart;
        meilleur = c;
      }
    }
    return meilleur;
  }


  // -------------------- Extrapolation de Riegel --------------------

  function convertirChronoVersReference(chrono, discipline) {
    const distanceSource = distanceEnMetres(chrono, discipline);
    const distanceCible = DISTANCES_REFERENCE_M[discipline];
    const tempsConverti = chrono.temps_s
      * Math.pow(distanceCible / distanceSource, EXPOSANT_RIEGEL);
    return {
      distanceSource_m: distanceSource,
      tempsSource_s: chrono.temps_s,
      distanceCible_m: distanceCible,
      tempsCible_s: tempsConverti,
      extrapolation: Math.abs(distanceSource - distanceCible) > 1,
    };
  }


  // -------------------- Fiabilité de l'estimation --------------------

  // Niveau qualitatif basé sur le ratio entre la distance source et
  // la distance cible. Plus le chrono est éloigné, plus l'extrapolation
  // par Riegel devient incertaine.
  function evaluerFiabilite(distanceSource_m, distanceCible_m, discipline) {
    const ratio = Math.max(distanceSource_m, distanceCible_m)
                / Math.min(distanceSource_m, distanceCible_m);

    let niveau;
    if (ratio <= 1.25) {
      niveau = 'elevee';
    } else if (ratio <= 1.60) {
      niveau = 'moyenne';
    } else {
      niveau = 'faible';
    }

    let messageBase;
    if (niveau === 'elevee') {
      messageBase = 'Chrono source proche de la distance cible.';
    } else if (niveau === 'moyenne') {
      messageBase =
        'Chrono source extrapolé vers la distance cible. '
        + 'Estimation à interpréter avec prudence.';
    } else {
      messageBase =
        'Chrono source éloigné de la distance cible. '
        + 'L\'estimation est nettement moins fiable. '
        + 'Saisir un chrono plus proche de la distance cible '
        + 'améliore la précision.';
    }

    // La formule de Riegel est calibrée pour la course à pied.
    // Pour les deux autres disciplines, on le signale.
    if (discipline !== 'course') {
      messageBase += ' La formule d\'extrapolation est conçue pour '
        + 'la course ; elle reste une approximation acceptable en '
        + 'natation et en vélo.';
    }

    return {
      niveau: niveau,
      ratioDistance: Math.round(ratio * 100) / 100,
      message: messageBase,
    };
  }


  // -------------------- Formatage --------------------

  function formaterMinSec(secondes) {
    const total = Math.max(0, Math.round(secondes));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function arrondiUneDecimale(x) {
    return Math.round(x * 10) / 10;
  }

  // À partir d'un temps total sur la distance cible d'une discipline,
  // produit l'allure exprimée dans l'unité naturelle de la discipline.
  function exprimerAllure(tempsCible_s, discipline) {
    if (discipline === 'natation') {
      const distanceCible = DISTANCES_REFERENCE_M.natation;
      const secondesPar100 = (tempsCible_s / distanceCible) * 100;
      return {
        valeur: Math.round(secondesPar100),
        unite: 'min par 100 m',
        affichage: formaterMinSec(secondesPar100) + ' par 100 m',
      };
    }
    if (discipline === 'velo') {
      const distanceCibleKm = DISTANCES_REFERENCE_M.velo / 1000;
      const heures = tempsCible_s / 3600;
      const kmh = distanceCibleKm / heures;
      return {
        valeur: arrondiUneDecimale(kmh),
        unite: 'km par heure',
        affichage: arrondiUneDecimale(kmh).toFixed(1) + ' km par heure',
      };
    }
    if (discipline === 'course') {
      const distanceCibleKm = DISTANCES_REFERENCE_M.course / 1000;
      const secondesParKm = tempsCible_s / distanceCibleKm;
      return {
        valeur: Math.round(secondesParKm),
        unite: 'min par km',
        affichage: formaterMinSec(secondesParKm) + ' par km',
      };
    }
    return null;
  }


  // -------------------- Calcul d'une discipline --------------------

  function calculerZonesDiscipline(discipline, chronos) {
    const chronoSource = choisirChronoSource(chronos, discipline);

    if (!chronoSource) {
      return {
        discipline: discipline,
        chronoSource: null,
        allureCompetition: null,
        zonesEntrainement: null,
        fiabilite: null,
        message: messageAbsenceChrono(discipline),
        estEstimation: false,
      };
    }

    const conversion = convertirChronoVersReference(chronoSource, discipline);

    // Allure visée en compétition, dérivée directement du chrono Riegel.
    const allureVisee = exprimerAllure(conversion.tempsCible_s, discipline);

    // Estimation du temps total sur la distance cible.
    const tempsTotalEstime_s = Math.round(conversion.tempsCible_s);

    const allureCompetition = {
      libelle: LIBELLES_ALLURE_VISEE[discipline],
      valeur: allureVisee.valeur,
      unite: allureVisee.unite,
      affichage: allureVisee.affichage,
      tempsTotalEstime_s: tempsTotalEstime_s,
      tempsTotalEstime: formaterMinSec(tempsTotalEstime_s),
      note:
        'Allure de course visée. Estimation issue d\'un chrono saisi. '
        + 'Ne constitue pas une garantie de performance.',
    };

    // Zones d'entraînement, dérivées du temps de l'allure visée par
    // application des coefficients du tableau. La zone seuil reste
    // strictement plus lente que l'allure visée.
    const zonesEntrainement = ORDRE_ZONES.map(function (cle) {
      const coef = COEFFICIENTS_ZONES_TEMPS[cle];
      const tempsZone = conversion.tempsCible_s * coef;
      const allureZone = exprimerAllure(tempsZone, discipline);
      return {
        cle: cle,
        libelle: LIBELLES_ZONES[cle],
        coefficient: coef,
        valeur: allureZone.valeur,
        unite: allureZone.unite,
        affichage: allureZone.affichage,
      };
    });

    const fiabilite = evaluerFiabilite(
      conversion.distanceSource_m,
      conversion.distanceCible_m,
      discipline
    );

    return {
      discipline: discipline,
      chronoSource: {
        libelle: chronoSource.libelle || '',
        distance_m: conversion.distanceSource_m,
        temps_s: conversion.tempsSource_s,
        extrapolation: conversion.extrapolation,
      },
      allureCompetition: allureCompetition,
      zonesEntrainement: zonesEntrainement,
      fiabilite: fiabilite,
      message:
        'Estimations calculées à partir du chrono saisi. '
        + 'Allure visée et zones d\'entraînement sont distinctes. '
        + 'Aucune garantie de performance.',
      estEstimation: true,
    };
  }

  function messageAbsenceChrono(discipline) {
    const nom = LIBELLES_DISCIPLINE[discipline] || discipline;
    return 'Aucun chrono de référence saisi pour ' + nom + '. '
      + 'Saisir un chrono représentatif dans le profil pour calculer '
      + 'l\'allure visée et les zones d\'entraînement de cette discipline.';
  }


  // -------------------- Calcul global d'un athlète --------------------

  function calculerToutesZones(chronosParDiscipline) {
    const source = chronosParDiscipline || {};
    return {
      natation: calculerZonesDiscipline('natation', source.natation),
      velo:     calculerZonesDiscipline('velo', source.velo),
      course:   calculerZonesDiscipline('course', source.course),
    };
  }


  // -------------------- Interface publique --------------------

  return {
    // Constantes exposées pour transparence et inspection.
    DISTANCES_REFERENCE_M: DISTANCES_REFERENCE_M,
    EXPOSANT_RIEGEL: EXPOSANT_RIEGEL,
    COEFFICIENTS_ZONES_TEMPS: COEFFICIENTS_ZONES_TEMPS,
    ORDRE_ZONES: ORDRE_ZONES,
    LIBELLES_ALLURE_VISEE: LIBELLES_ALLURE_VISEE,

    // Calculs principaux.
    calculerToutesZones: calculerToutesZones,
    calculerZonesDiscipline: calculerZonesDiscipline,

    // Utilitaires de formatage exposés pour d'autres modules.
    formaterMinSec: formaterMinSec,
    exprimerAllure: exprimerAllure,
  };

})();
