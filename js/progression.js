/*
 * progression.js
 * Indicateurs de suivi de progression et de charge.
 *
 * Lecture seule. Ce module n'écrit jamais. Il agrège les données du
 * plan et des statuts enregistrés pour produire des indicateurs
 * simples et lisibles.
 *
 * Dépendances :
 *   - REFERENCE : libellés disciplines, phases, couleurs.
 *   - STORAGE   : statuts des séances, préférences.
 *   - PLAN      : plans générés.
 *
 * Indicateurs :
 *   - Total séances par statut (faite, partielle, manquée, à venir).
 *   - Volume total prévu et volume réalisé en minutes.
 *   - Répartition par discipline en minutes prévues.
 *   - Avancement semaine par semaine, taux de complétion.
 *
 * Calcul de la charge RÉALISÉE par séance, ordre strict de priorité :
 *   1. Statut 'manquee' force la contribution à 0, quelle que soit
 *      la saisie. La saisie est conservée (préservation utilisateur)
 *      mais ne pèse pas dans la charge.
 *   2. Sinon, si une durée réelle (realisation.duree_min) est saisie
 *      et strictement positive, on l'utilise directement.
 *   3. Sinon, si une distance réelle (realisation.distance_km) est
 *      saisie et que l'allure cible de la séance est calculable
 *      depuis les chronos courants du profil, on convertit la
 *      distance en minutes via cette allure (natation, vélo, course).
 *   4. Sinon, repli sur la pondération par statut sur la durée
 *      prévue : faite = 1, partielle = 0.5, autres = 0.
 *
 * Garde fous :
 *   - Aucune projection de performance, aucun temps de course estimé.
 *   - Si aucune séance n'a encore été réalisée, état vide explicite.
 *   - Aucun trait d'union dans les libellés affichables.
 */

// Tant que app.js n'orchestre pas la navigation, on désactive les
// auto initialisations des autres vues pour que progression.js
// puisse s'afficher dans #contenu.
window.PROFILS_AUTO_INIT = false;
window.SEANCES_AUTO_INIT = false;

const PROGRESSION = (function () {

  // -------------------- État local --------------------

  let etat = {
    conteneur: null,
    athleteActif: 'julien',
  };


  // -------------------- Helpers --------------------

  function echapperHTML(texte) {
    if (texte === null || texte === undefined) return '';
    return String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function couleurDiscipline(cle) {
    if (cle === 'course_jour' || cle === 'course') {
      return (REFERENCE.disciplines.course || {}).couleur || '#888';
    }
    const d = REFERENCE.disciplines[cle];
    return d ? d.couleur : '#888';
  }

  function libelleDiscipline(cle) {
    if (cle === 'course_jour') return 'Triathlon';
    const d = REFERENCE.disciplines[cle];
    return d ? d.libelle : cle;
  }

  function formaterMinutes(min) {
    if (!min || min <= 0) return '0 min';
    if (min < 60) return Math.round(min) + ' min';
    const h = Math.floor(min / 60);
    const m = Math.round(min) % 60;
    if (m === 0) return h + ' h';
    return h + ' h ' + String(m).padStart(2, '0');
  }

  function pourcent(num, denom) {
    if (!denom) return 0;
    return Math.round((num / denom) * 100);
  }


  // -------------------- Données --------------------

  function obtenirPlan(cleAthlete) {
    let plan = PLAN.obtenirPlan(cleAthlete);
    if (!plan) {
      PLAN.genererPlansLesDeux();
      plan = PLAN.obtenirPlan(cleAthlete);
    }
    return plan;
  }


  // -------------------- Calculs --------------------

  // Convertit une distance réelle (en km) en minutes via l'allure
  // cible de la séance, en s'appuyant sur les zones d'entraînement
  // produites par ALLURES pour le profil. Retourne null si la
  // conversion n'est pas possible :
  //   - discipline 'combinee' : la distance saisie est ambiguë
  //     (vélo + course), on n'invente pas une décomposition ;
  //   - discipline 'course_jour' : pas d'allure cible ;
  //   - zone non calculable (chrono manquant pour la discipline) ;
  //   - séance sans zoneCible.
  //
  // Unités produites par ALLURES.exprimerAllure :
  //   - natation : valeur = secondes par 100 m,
  //     minutes = (distance_km * 10 * valeur) / 60
  //   - velo    : valeur = km par heure,
  //     minutes = (distance_km / valeur) * 60
  //   - course  : valeur = secondes par km,
  //     minutes = (distance_km * valeur) / 60
  function convertirDistanceEnMin(distance_km, seance, zones) {
    if (!zones || !seance) return null;
    if (typeof distance_km !== 'number' || !(distance_km > 0)) return null;
    const discipline = seance.discipline;
    if (discipline === 'combinee' || discipline === 'course_jour') return null;
    const r = zones[discipline];
    if (!r || !r.estEstimation || !r.zonesEntrainement) return null;
    const zoneCible = seance.zoneCible;
    if (!zoneCible) return null;
    const z = r.zonesEntrainement.find(function (z) {
      return z.cle === zoneCible;
    });
    if (!z || typeof z.valeur !== 'number' || !(z.valeur > 0)) return null;

    if (discipline === 'natation') {
      return (distance_km * 10 * z.valeur) / 60;
    }
    if (discipline === 'velo') {
      return (distance_km / z.valeur) * 60;
    }
    if (discipline === 'course') {
      return (distance_km * z.valeur) / 60;
    }
    return null;
  }

  // Contribution d'une séance à la charge réalisée, en minutes,
  // selon l'ordre de priorité strict documenté en tête de module :
  //   manquee -> 0,
  //   sinon durée réelle saisie,
  //   sinon distance réelle convertie via allure cible,
  //   sinon durée prévue pondérée par le statut (faite/partielle).
  function contributionRealiseeMin(seance, statut, realisation, zones) {
    // 1. Manquée force 0, quoi qu'il arrive côté saisie. L'entrée
    //    realisations est conservée en stockage mais ne pèse pas
    //    dans la charge, par cohérence avec le statut affiché.
    if (statut === 'manquee') return 0;

    const dureePrevue = seance.duree_min || 0;

    // 2. Durée réelle saisie : prioritaire.
    if (realisation
        && typeof realisation.duree_min === 'number'
        && realisation.duree_min > 0) {
      return realisation.duree_min;
    }

    // 3. Distance réelle saisie, convertie via allure cible.
    if (realisation
        && typeof realisation.distance_km === 'number'
        && realisation.distance_km > 0) {
      const min = convertirDistanceEnMin(
        realisation.distance_km, seance, zones);
      if (min !== null && min > 0) return min;
    }

    // 4. Repli : durée prévue pondérée par le statut.
    if (statut === 'faite') return dureePrevue;
    if (statut === 'partielle') return dureePrevue * 0.5;
    // statut 'a_venir' : aucune contribution.
    return 0;
  }


  // Calcule les statistiques du plan d'un athlète à partir du plan
  // persisté, des statuts et des saisies de réalisation. Le taux
  // de complétion des SÉANCES reste basé sur les statuts (faite,
  // partielle, manquée), tandis que le volume RÉALISÉ en minutes
  // suit la règle de priorité documentée plus haut. Une combinée
  // garde sa durée brute, le décompte d'effectives revient au plan.
  function calculerStats(cleAthlete) {
    const plan = obtenirPlan(cleAthlete);
    if (!plan || !plan.semaines) return null;

    // Zones d'entraînement courantes, dérivées des chronos saisis,
    // utilisées par contributionRealiseeMin pour convertir une
    // distance réelle en minutes via l'allure cible. Calculées une
    // seule fois par appel.
    const profil = STORAGE.obtenirAthlete(cleAthlete);
    const zones = ALLURES.calculerToutesZones(profil.chronos);

    const compteStatuts = {
      a_venir: 0, faite: 0, partielle: 0, manquee: 0,
    };
    let totalSeances = 0;
    let totalEffectives = 0;
    let totalPrevuMin = 0;
    let totalRealiseMin = 0;
    // Nombre de séances pour lesquelles l'utilisateur a saisi au
    // moins un champ de réalisation (durée, distance, ressenti ou
    // commentaire). Indicateur informatif distinct des statuts.
    let nbSeancesAvecSaisie = 0;

    const repartitionDiscipline = {
      natation: 0, velo: 0, course: 0, combinee: 0,
    };
    const minutesDiscipline = {
      natation: 0, velo: 0, course: 0, combinee: 0,
    };

    const semaines = [];

    for (let i = 0; i < plan.semaines.length; i++) {
      const sem = plan.semaines[i];
      let semPrevuMin = 0;
      let semRealiseMin = 0;
      let nbPrevues = 0;
      let nbFaitesEquiv = 0;

      for (let j = 0; j < sem.seances.length; j++) {
        const s = sem.seances[j];
        const duree = s.duree_min || 0;
        const statut = STORAGE.obtenirStatutSeance(cleAthlete, s.id);
        const realisation = STORAGE.obtenirRealisation(cleAthlete, s.id);

        // Comptage global
        compteStatuts[statut] = (compteStatuts[statut] || 0) + 1;
        totalSeances++;
        totalEffectives += (s.compteCommeNSeances || 1);
        totalPrevuMin += duree;
        semPrevuMin += duree;
        nbPrevues++;
        if (realisation) nbSeancesAvecSaisie++;

        // Taux de complétion des SÉANCES : basé sur le statut, comme
        // avant. Sert au pourcentage hebdomadaire de complétion qui
        // s'exprime en nombre de séances réalisées, pas en minutes.
        let part = 0;
        if (statut === 'faite') part = 1;
        else if (statut === 'partielle') part = 0.5;
        nbFaitesEquiv += part;

        // Volume RÉALISÉ en minutes : règle de priorité durée
        // réelle, distance convertie, repli statut. Détaillé dans
        // contributionRealiseeMin et son commentaire d'en tête.
        const contribution = contributionRealiseeMin(
          s, statut, realisation, zones);
        totalRealiseMin += contribution;
        semRealiseMin += contribution;

        // Répartition disciplines, course_jour rangé sous course.
        const cleDisc = s.discipline === 'course_jour'
          ? 'course' : s.discipline;
        if (repartitionDiscipline[cleDisc] !== undefined) {
          repartitionDiscipline[cleDisc] += 1;
          minutesDiscipline[cleDisc] += duree;
        }
      }

      semaines.push({
        numero: sem.numero,
        phase: sem.phase,
        phaseLibelle: sem.phaseLibelle,
        estAllegee: sem.estAllegee,
        prevu: Math.round(semPrevuMin),
        realise: Math.round(semRealiseMin),
        nbPrevues: nbPrevues,
        nbFaitesEquiv: nbFaitesEquiv,
        tauxRealisation: nbPrevues
          ? (nbFaitesEquiv / nbPrevues)
          : 0,
      });
    }

    return {
      athleteCle: cleAthlete,
      totalSeances: totalSeances,
      totalEffectives: totalEffectives,
      totalPrevuMin: Math.round(totalPrevuMin),
      totalRealiseMin: Math.round(totalRealiseMin),
      nbSeancesAvecSaisie: nbSeancesAvecSaisie,
      compteStatuts: compteStatuts,
      repartitionDiscipline: repartitionDiscipline,
      minutesDiscipline: minutesDiscipline,
      semaines: semaines,
      auCommence: (compteStatuts.faite + compteStatuts.partielle
        + compteStatuts.manquee) > 0,
    };
  }


  // -------------------- Rendu --------------------

  function rendre() {
    if (!etat.conteneur) return;
    etat.conteneur.innerHTML = construireHTML();
    attacherEvenements();
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo(0, 0);
    }
  }

  function construireHTML() {
    const stats = calculerStats(etat.athleteActif);
    return ''
      + '<div class="progression">'
      + construireSelecteurAthlete()
      + (stats
          ? construireCartesGlobales(stats)
            + construireRepartition(stats)
            + construireSemaines(stats)
          : '<p class="progression__vide">Plan non disponible.</p>')
      + construireAvertissement()
      + '</div>';
  }

  function construireSelecteurAthlete() {
    return ''
      + '<nav class="progression__selecteur" aria-label="Choix du profil">'
      + pastilleAthlete('julien', 'Julien', etat.athleteActif === 'julien')
      + pastilleAthlete('giulia', 'Giulia', etat.athleteActif === 'giulia')
      + '</nav>';
  }

  function pastilleAthlete(cle, prenom, estActif) {
    const avatar = (typeof PROFILS !== 'undefined' && PROFILS.rendreAvatar)
      ? PROFILS.rendreAvatar(cle, 44)
      : '';
    return ''
      + '<button type="button" class="progression__pastille'
      + (estActif ? ' progression__pastille--actif' : '')
      + '" data-action="basculer-athlete" data-cle="' + cle + '">'
      + '<span class="progression__pastille-avatar">' + avatar + '</span>'
      + '<span class="progression__pastille-nom">' + prenom + '</span>'
      + '</button>';
  }

  function construireCartesGlobales(stats) {
    const c = stats.compteStatuts;
    const tauxRealMin = pourcent(stats.totalRealiseMin, stats.totalPrevuMin);

    let html = ''
      + '<section class="progression__bandeau">'
      + '<div class="progression__bandeau-titre">'
      + 'Vue d\'ensemble du plan</div>'
      + '<div class="progression__bandeau-sous">'
      + stats.totalSeances + ' séances calendrier, '
      + stats.totalEffectives + ' effectives au décompte hebdomadaire'
      + '</div>'
      + '</section>';

    html += '<section class="progression__cartes">';
    html += carteIndicateur('Faites', c.faite, 'succes',
      stats.totalSeances);
    html += carteIndicateur('Partielles', c.partielle, 'avertissement',
      stats.totalSeances);
    html += carteIndicateur('Manquées', c.manquee, 'erreur',
      stats.totalSeances);
    html += carteIndicateur('À venir', c.a_venir, 'neutre',
      stats.totalSeances);
    html += '</section>';

    // Largeur de la barre principale clampée à 100 %, mais le
    // pourcentage textuel reste fidèle au calcul réel (peut
    // dépasser 100 % si l'utilisateur a saisi plus de minutes
    // réalisées que prévu). Indicateur informatif sans effet visuel
    // de débordement.
    const largeurBarre = Math.min(100, tauxRealMin);
    html += '<section class="progression__volume">'
      + '<div class="progression__volume-titre">Volume d\'entraînement</div>'
      + '<div class="progression__volume-corps">'
      +   '<div class="progression__volume-bloc">'
      +     '<div class="progression__volume-libelle">Réalisé</div>'
      +     '<div class="progression__volume-valeur">'
      +       formaterMinutes(stats.totalRealiseMin) + '</div>'
      +   '</div>'
      +   '<div class="progression__volume-bloc">'
      +     '<div class="progression__volume-libelle">Prévu total</div>'
      +     '<div class="progression__volume-valeur">'
      +       formaterMinutes(stats.totalPrevuMin) + '</div>'
      +   '</div>'
      +   '<div class="progression__volume-bloc">'
      +     '<div class="progression__volume-libelle">Avancement</div>'
      +     '<div class="progression__volume-valeur">'
      +       tauxRealMin + ' %</div>'
      +   '</div>'
      + '</div>'
      + '<div class="progression__barre">'
      +   '<div class="progression__barre-rempli" style="width:'
      +     largeurBarre + '%"></div>'
      + '</div>'
      + '</section>';

    if (!stats.auCommence) {
      html += '<p class="progression__vide-info">'
        + 'Aucune séance n\'a encore été marquée comme faite, '
        + 'partielle ou manquée. Les indicateurs de volume réalisé '
        + 'apparaîtront au fur et à mesure des séances enregistrées.'
        + '</p>';
    }

    return html;
  }

  function carteIndicateur(libelle, valeur, classeAccent, total) {
    const ratio = total ? Math.round((valeur / total) * 100) : 0;
    return ''
      + '<div class="progression__carte progression__carte--' + classeAccent + '">'
      + '<div class="progression__carte-valeur">' + valeur + '</div>'
      + '<div class="progression__carte-libelle">' + libelle + '</div>'
      + '<div class="progression__carte-ratio">' + ratio + ' %</div>'
      + '</div>';
  }

  function construireRepartition(stats) {
    const minutes = stats.minutesDiscipline;
    const totalMin = (minutes.natation || 0) + (minutes.velo || 0)
      + (minutes.course || 0) + (minutes.combinee || 0);

    if (totalMin === 0) {
      return ''
        + '<section class="progression__section">'
        + '<h3>Répartition par discipline</h3>'
        + '<p class="progression__vide">Pas de volume planifié pour '
        + 'cet athlète.</p>'
        + '</section>';
    }

    const ordre = ['natation', 'velo', 'course', 'combinee'];
    let barrePile = '<div class="progression__pile">';
    let legende = '<ul class="progression__legende">';
    for (let i = 0; i < ordre.length; i++) {
      const d = ordre[i];
      const m = minutes[d] || 0;
      if (m <= 0) continue;
      const pc = (m / totalMin) * 100;
      const couleur = couleurDiscipline(d);
      barrePile += '<div class="progression__pile-part" '
        + 'style="width:' + pc.toFixed(1) + '%;background:' + couleur + ';" '
        + 'title="' + libelleDiscipline(d) + '"></div>';
      legende += '<li class="progression__legende-item">'
        + '<span class="progression__pastille-couleur" '
        + 'style="background:' + couleur + ';"></span>'
        + '<span class="progression__legende-nom">'
        + libelleDiscipline(d) + '</span>'
        + '<span class="progression__legende-valeur">'
        + formaterMinutes(m) + '</span>'
        + '<span class="progression__legende-pourcent">'
        + Math.round(pc) + ' %</span>'
        + '</li>';
    }
    barrePile += '</div>';
    legende += '</ul>';

    return ''
      + '<section class="progression__section">'
      + '<h3>Répartition par discipline</h3>'
      + '<p class="progression__aide">Volumes planifiés en minutes. '
      + 'Les combinées sont comptées à part, elles couvrent vélo puis '
      + 'course en une même séance.</p>'
      + barrePile
      + legende
      + '</section>';
  }

  function construireSemaines(stats) {
    let html = ''
      + '<section class="progression__section">'
      + '<h3>Charge semaine par semaine</h3>'
      + '<p class="progression__aide">Hauteur de barre proportionnelle '
      + 'au volume prévu. Couleur de fond selon la phase. Trait '
      + 'horizontal indique la part réalisée.</p>'
      + '<div class="progression__semaines">';

    // Détermine le pic de volume pour calibrer la hauteur des barres.
    let pic = 0;
    for (let i = 0; i < stats.semaines.length; i++) {
      if (stats.semaines[i].prevu > pic) pic = stats.semaines[i].prevu;
    }
    if (pic === 0) pic = 1;

    for (let i = 0; i < stats.semaines.length; i++) {
      html += construireBarreSemaine(stats.semaines[i], pic);
    }
    html += '</div></section>';

    // Table récap textuelle pour accessibilité et lecture précise.
    html += '<section class="progression__section">'
      + '<h3>Détail par semaine</h3>'
      + '<ul class="progression__semaines-liste">';
    for (let i = 0; i < stats.semaines.length; i++) {
      const s = stats.semaines[i];
      const tauxAff = Math.round(s.tauxRealisation * 100);
      html += '<li class="progression__semaine-ligne progression__semaine-ligne--'
        + s.phase + '">'
        + '<span class="progression__semaine-num">Sem ' + s.numero + '</span>'
        + '<span class="progression__semaine-phase">'
        + echapperHTML(s.phaseLibelle)
        + (s.estAllegee ? ' · allégée' : '')
        + '</span>'
        + '<span class="progression__semaine-prevu">'
        + formaterMinutes(s.prevu) + ' prévu</span>'
        + '<span class="progression__semaine-realise">'
        + formaterMinutes(s.realise) + ' réalisé'
        + (s.nbPrevues
            ? ' · ' + tauxAff + ' %'
            : '')
        + '</span>'
        + '</li>';
    }
    html += '</ul></section>';
    return html;
  }

  function construireBarreSemaine(s, pic) {
    const hauteurPrevu = Math.max(8, Math.round((s.prevu / pic) * 100));
    // Hauteur de la part réalisée plafonnée à la hauteur prévue,
    // pour éviter qu'une saisie supérieure au prévu fasse déborder
    // visuellement la barre. La valeur réelle est conservée dans
    // le title pour rester lisible et exacte.
    const ratioReal = s.prevu > 0
      ? Math.min(1, s.realise / s.prevu)
      : 0;
    const hauteurRealise = Math.round(hauteurPrevu * ratioReal);

    return ''
      + '<div class="progression__barre-semaine progression__barre-semaine--'
      + s.phase + (s.estAllegee ? ' progression__barre-semaine--allegee' : '') + '">'
      + '<div class="progression__barre-canal" '
      + 'title="Sem ' + s.numero + ', ' + s.phaseLibelle + ', '
      + formaterMinutes(s.prevu) + ' prévu, '
      + formaterMinutes(s.realise) + ' réalisé">'
      +   '<div class="progression__barre-fond" style="height:'
      +     hauteurPrevu + '%"></div>'
      +   '<div class="progression__barre-real" style="height:'
      +     hauteurRealise + '%"></div>'
      + '</div>'
      + '<div class="progression__barre-num">' + s.numero + '</div>'
      + '</div>';
  }

  function construireAvertissement() {
    const txt = (typeof REFERENCE !== 'undefined'
      && REFERENCE.avertissementSante)
      ? REFERENCE.avertissementSante
      : 'Cet outil ne remplace pas un avis médical.';
    return ''
      + '<footer class="progression__avertissement">'
      + '<strong>Avertissement.</strong> ' + echapperHTML(txt)
      + '</footer>';
  }


  // -------------------- Événements --------------------

  function attacherEvenements() {
    etat.conteneur.addEventListener('click', gererClic);
  }

  function gererClic(e) {
    let el = e.target;
    while (el && el !== etat.conteneur) {
      if (el.getAttribute && el.getAttribute('data-action')) break;
      el = el.parentNode;
    }
    if (!el || el === etat.conteneur) return;
    const action = el.getAttribute('data-action');
    if (action === 'basculer-athlete') {
      basculerAthlete(el.getAttribute('data-cle'));
    }
  }

  function basculerAthlete(cle) {
    if (cle !== 'julien' && cle !== 'giulia') return;
    etat.athleteActif = cle;
    const prefs = STORAGE.obtenirPreferences();
    prefs.athleteActif = cle;
    STORAGE.enregistrerPreferences(prefs);
    if (!PLAN.obtenirPlan(cle)) {
      PLAN.genererPlansLesDeux();
    }
    rendre();
  }


  // -------------------- Initialisation --------------------

  function initialiser(conteneur) {
    if (!conteneur) return;
    etat.conteneur = conteneur;
    const prefs = STORAGE.obtenirPreferences();
    etat.athleteActif = (prefs && prefs.athleteActif) || 'julien';
    if (!PLAN.obtenirPlan('julien') || !PLAN.obtenirPlan('giulia')) {
      PLAN.genererPlansLesDeux();
    }
    rendre();
  }


  // -------------------- Auto initialisation pour preview --------------------

  document.addEventListener('DOMContentLoaded', function () {
    if (window.PROGRESSION_AUTO_INIT === false) return;
    const conteneur = document.getElementById('contenu');
    if (conteneur && conteneur.children.length === 0) {
      PROGRESSION.initialiser(conteneur);
    }
  });


  // -------------------- Interface publique --------------------

  return {
    initialiser: initialiser,
    basculerAthlete: basculerAthlete,
    calculerStats: calculerStats,
    // Helpers exposés pour permettre à seances.js d'afficher la
    // comparaison prévu vs réalisé séance par séance sans
    // dupliquer la logique de priorité de charge.
    contributionRealiseeMin: contributionRealiseeMin,
    convertirDistanceEnMin: convertirDistanceEnMin,
    obtenirAthleteActif: function () { return etat.athleteActif; },
  };

})();
