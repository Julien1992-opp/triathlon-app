/*
 * seances.js
 * Vue de consultation et de suivi des séances.
 *
 * Dépendances :
 *   - REFERENCE : disciplines, zones, jours, libellés, avertissement.
 *   - STORAGE   : statuts, notes, préférences.
 *   - ALLURES   : mention de fiabilité par discipline.
 *   - PLAN      : récupération et modification du plan, catalogue.
 *
 * Rôle :
 *   - Afficher le plan d'un athlète, semaine par semaine.
 *   - Naviguer entre les semaines 1 à 15.
 *   - Afficher le détail d'une séance.
 *   - Marquer une séance faite, partielle ou manquée.
 *   - Noter librement une séance.
 *   - Remplacer la séance personnalisable d'une semaine.
 *
 * Garde fous :
 *   - Toutes les allures viennent du plan ou d'ALLURES, jamais
 *     recalculées localement.
 *   - Si une discipline manque de chrono, message d'invitation,
 *     aucune valeur inventée.
 *   - Aucune garantie de résultat affichée.
 *   - Aucun trait d'union dans les libellés affichables.
 */

// Tant que app.js n'orchestre pas la navigation entre onglets,
// on désactive l'auto initialisation de PROFILS pour que la vue
// séances prenne la place dans le conteneur lors du chargement.
window.PROFILS_AUTO_INIT = false;

const SEANCES = (function () {

  // -------------------- État local --------------------

  let etat = {
    conteneur: null,
    athleteActif: 'julien',
    semaineCourante: 1,
    idSeanceDetail: null,
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
    if (cle === 'course_jour') {
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

  function libelleZone(cle) {
    if (!cle) return '';
    const z = (REFERENCE.zones || []).find(function (z) {
      return z.cle === cle;
    });
    return z ? z.libelle : cle;
  }

  function libelleJour(jour) {
    if (typeof jour !== 'number') return '';
    return (REFERENCE.joursSemaine || [])[jour] || '';
  }

  function formaterDateCourte(isoDate) {
    if (!isoDate) return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    const mois = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin',
                  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const m = parseInt(parts[1], 10);
    const j = parseInt(parts[2], 10);
    if (isNaN(m) || isNaN(j)) return isoDate;
    return j + ' ' + (mois[m - 1] || '');
  }

  function libelleStatut(statut) {
    const map = {
      a_venir: 'À venir',
      faite: 'Faite',
      partielle: 'Partielle',
      manquee: 'Manquée',
    };
    return map[statut] || 'À venir';
  }

  function libelleRessenti(cle) {
    if (cle === 'facile') return 'Facile';
    if (cle === 'moyen') return 'Moyen';
    if (cle === 'dur') return 'Dur';
    return '';
  }

  function libelleJourCourt(jour) {
    const libs = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    if (typeof jour !== 'number') return '';
    return libs[jour] || '';
  }

  // Formate une durée en minutes en chaîne compacte humaine :
  // "0 min", "45 min", "1 h", "1 h 30". Aligné sur le format
  // utilisé dans progression.js pour cohérence visuelle.
  function formaterMinutes(min) {
    if (!min || min <= 0) return '0 min';
    if (min < 60) return Math.round(min) + ' min';
    const h = Math.floor(min / 60);
    const m = Math.round(min) % 60;
    if (m === 0) return h + ' h';
    return h + ' h ' + String(m).padStart(2, '0');
  }

  // Contribution en minutes réalisées pour une séance, déléguée à
  // PROGRESSION pour ne pas dupliquer la règle de priorité (durée
  // réelle, distance convertie, repli statut, manquee force 0).
  function contributionRealiseeSeance(seance, statut, realisation, zones) {
    if (typeof PROGRESSION === 'undefined'
        || !PROGRESSION.contributionRealiseeMin) {
      // Repli minimal si PROGRESSION pas encore chargé : on
      // pondère par statut. La règle distance et durée saisie
      // sera correctement appliquée dès que PROGRESSION est en
      // place (cas normal d'utilisation).
      if (statut === 'manquee') return 0;
      const d = seance.duree_min || 0;
      if (statut === 'faite') return d;
      if (statut === 'partielle') return d * 0.5;
      return 0;
    }
    return PROGRESSION.contributionRealiseeMin(
      seance, statut, realisation, zones);
  }

  // Indique si une saisie de réalisation est jugée "informative",
  // c'est à dire si l'utilisateur a renseigné au moins un champ
  // chiffré (durée ou distance). Sert à décider si on affiche la
  // ligne de comparaison prévu / réalisé en chiffres précis sur
  // la carte de liste, ou si on s'en tient à la pondération par
  // statut affichée ailleurs.
  function aSaisieChiffree(realisation) {
    if (!realisation) return false;
    if (typeof realisation.duree_min === 'number'
        && realisation.duree_min > 0) return true;
    if (typeof realisation.distance_km === 'number'
        && realisation.distance_km > 0) return true;
    return false;
  }

  // Semaine par défaut : courante si on est dans la fenêtre du plan,
  // sinon semaine 1 (avant le 18 mai 2026).
  function semaineParDefaut() {
    const auj = new Date();
    const debut = new Date('2026-05-18T00:00:00');
    if (auj < debut) return 1;
    const diff = Math.floor((auj - debut) / (7 * 86400000));
    return Math.max(1, Math.min(15, diff + 1));
  }


  // -------------------- Données --------------------

  function obtenirPlanSeance() {
    let plan = PLAN.obtenirPlan(etat.athleteActif);
    if (!plan) {
      // Génère pour les deux athlètes pour synchroniser les communes.
      PLAN.genererPlansLesDeux();
      plan = PLAN.obtenirPlan(etat.athleteActif);
    }
    return plan;
  }

  function obtenirSemaine(numero) {
    const plan = obtenirPlanSeance();
    if (!plan || !plan.semaines) return null;
    return plan.semaines.find(function (s) {
      return s.numero === numero;
    });
  }

  function trouverSeance(idSeance) {
    const plan = obtenirPlanSeance();
    if (!plan || !plan.semaines) return null;
    for (let i = 0; i < plan.semaines.length; i++) {
      const sem = plan.semaines[i];
      for (let j = 0; j < sem.seances.length; j++) {
        if (sem.seances[j].id === idSeance) {
          return { seance: sem.seances[j], semaine: sem };
        }
      }
    }
    return null;
  }

  function obtenirZones() {
    const profil = STORAGE.obtenirAthlete(etat.athleteActif);
    return ALLURES.calculerToutesZones(profil.chronos);
  }


  // -------------------- Rendu général --------------------

  function rendre() {
    if (!etat.conteneur) return;
    etat.conteneur.innerHTML = etat.idSeanceDetail
      ? construireVueDetail()
      : construireVueListe();
    attacherEvenements();
    // Restaure le scroll en haut quand on change de vue.
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo(0, 0);
    }
  }


  // -------------------- Vue liste (semaine) --------------------

  function construireVueListe() {
    return ''
      + '<div class="seances">'
      + construireSelecteurAthlete()
      + construireBandeauSemaine()
      + construireListeCartes()
      + construireAvertissement()
      + '</div>';
  }

  function construireSelecteurAthlete() {
    return ''
      + '<nav class="seances__selecteur" aria-label="Choix du profil">'
      + pastilleAthlete('julien', 'Julien', etat.athleteActif === 'julien')
      + pastilleAthlete('giulia', 'Giulia', etat.athleteActif === 'giulia')
      + '</nav>';
  }

  function pastilleAthlete(cle, prenom, estActif) {
    const avatar = (typeof PROFILS !== 'undefined' && PROFILS.rendreAvatar)
      ? PROFILS.rendreAvatar(cle, 44)
      : '';
    return ''
      + '<button type="button" class="seances__pastille'
      + (estActif ? ' seances__pastille--actif' : '')
      + '" data-action="basculer-athlete" data-cle="' + cle + '">'
      + '<span class="seances__pastille-avatar">' + avatar + '</span>'
      + '<span class="seances__pastille-nom">' + prenom + '</span>'
      + '</button>';
  }

  function construireBandeauSemaine() {
    const sem = obtenirSemaine(etat.semaineCourante);
    if (!sem) {
      return '<div class="seances__bandeau">Plan non disponible.</div>';
    }
    const nbAVenir = countStatuts(sem, 'a_venir');
    const nbFaite = countStatuts(sem, 'faite');
    const nbAutres = sem.seances.length - nbAVenir - nbFaite;

    // Agrégation prévu / réalisé en minutes sur la semaine. Le
    // réalisé suit la règle de priorité fournie par PROGRESSION.
    const zones = obtenirZones();
    let prevuMin = 0;
    let realiseMin = 0;
    for (let i = 0; i < sem.seances.length; i++) {
      const s = sem.seances[i];
      prevuMin += s.duree_min || 0;
      const statut = STORAGE.obtenirStatutSeance(etat.athleteActif, s.id);
      const realisation = STORAGE.obtenirRealisation(
        etat.athleteActif, s.id);
      realiseMin += contributionRealiseeSeance(
        s, statut, realisation, zones);
    }

    return ''
      + '<section class="seances__bandeau">'
      + '<button type="button" class="seances__nav-bouton" '
      + 'data-action="precedent"'
      + (etat.semaineCourante <= 1 ? ' disabled' : '') + '>‹</button>'
      + '<div class="seances__bandeau-info">'
      +   '<div class="seances__bandeau-titre">Semaine '
      +     sem.numero + ' sur 15</div>'
      +   '<div class="seances__bandeau-phase">'
      +     echapperHTML(sem.phaseLibelle)
      +     (sem.estAllegee ? ' · allégée' : '')
      +   '</div>'
      +   '<div class="seances__bandeau-dates">'
      +     formaterDateCourte(sem.dateDebut) + ' au '
      +     formaterDateCourte(sem.dateFin)
      +   '</div>'
      +   '<div class="seances__bandeau-meta">'
      +     sem.totalSeancesEffectives + ' séances effectives, '
      +     'dont ' + nbFaite + ' faites, '
      +     (nbAutres ? nbAutres + ' partielles ou manquées, ' : '')
      +     nbAVenir + ' à venir.'
      +   '</div>'
      +   '<div class="seances__bandeau-volumes">'
      +     '<span class="seances__bandeau-volume">'
      +       '<strong>Prévu</strong> ' + formaterMinutes(prevuMin)
      +     '</span>'
      +     '<span class="seances__bandeau-volume">'
      +       '<strong>Réalisé</strong> ' + formaterMinutes(realiseMin)
      +     '</span>'
      +   '</div>'
      + '</div>'
      + '<button type="button" class="seances__nav-bouton" '
      + 'data-action="suivant"'
      + (etat.semaineCourante >= 15 ? ' disabled' : '') + '>›</button>'
      + '</section>';
  }

  function countStatuts(semaine, statutCherche) {
    let n = 0;
    for (let i = 0; i < semaine.seances.length; i++) {
      const s = semaine.seances[i];
      const statut = STORAGE.obtenirStatutSeance(etat.athleteActif, s.id);
      if (statut === statutCherche) n++;
    }
    return n;
  }


  // -------------------- Calcul dynamique de l'allure --------------------
  //
  // L'allure cible et l'éventuel message d'invitation sont TOUJOURS
  // recalculés ici à partir des chronos courants du profil, jamais
  // lus depuis seance.allureCible ou seance.messageAllure stockés.
  //
  // Justification : à la première génération du plan, les chronos
  // n'ont pas encore été saisis, donc les allures sont figées à null
  // et le message d'invitation est stocké. Toute saisie ou
  // modification ultérieure de chrono dans le profil n'aurait pas
  // d'effet sur l'affichage si on lisait simplement la séance
  // stockée. En dérivant à la volée, le Plan reflète immédiatement
  // l'état du profil sans nécessiter de régénération, ce qui
  // préserve les statuts, les notes et les personnalisations de
  // 4e séance.

  // Récupère une zone d'allure précise pour une discipline donnée,
  // à partir des zones produites par ALLURES.calculerToutesZones.
  // Retourne null si la zone n'est pas calculable.
  function obtenirZoneAllure(zones, discipline, zoneCible) {
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

  // Pour une séance donnée et les zones courantes, retourne
  // { allureCible, messageAllure }. La structure d'allureCible
  // est identique à ce que plan.js produit historiquement :
  //   - séance pure : objet zone unique
  //   - combinée    : objet { velo, course } (parties possiblement
  //                   nulles si une discipline n'a pas de chrono)
  // Pour les combinées, on lit cat.zoneCible (vélo) et cat.zoneCourse
  // (course) directement depuis PLAN.CATALOGUE, ce qui évite de
  // stocker zoneCourse dans la séance.
  function calculerAllureCourante(seance, zones) {
    if (!seance) {
      return { allureCible: null, messageAllure: null };
    }
    if (seance.discipline === 'course_jour') {
      return { allureCible: null, messageAllure: null };
    }
    const catalogue = (typeof PLAN !== 'undefined' && PLAN.CATALOGUE)
      ? PLAN.CATALOGUE : {};
    const cat = catalogue[seance.typeSeance];
    if (!cat) {
      // Type de séance inconnu : on retombe sur les valeurs stockées
      // pour ne pas perdre l'information existante.
      return {
        allureCible: seance.allureCible || null,
        messageAllure: seance.messageAllure || null,
      };
    }

    if (seance.discipline === 'combinee') {
      const av = obtenirZoneAllure(zones, 'velo', cat.zoneCible);
      const ac = obtenirZoneAllure(
        zones, 'course', cat.zoneCourse || cat.zoneCible);
      if (!av && !ac) {
        return {
          allureCible: null,
          messageAllure:
            'Allures non calculées. Saisir un chrono pour le vélo '
            + 'et la course pour obtenir les allures de la séance '
            + 'combinée.',
        };
      }
      const out = {};
      if (av) out.velo = av;
      if (ac) out.course = ac;
      return { allureCible: out, messageAllure: null };
    }

    // Séance pure (natation, vélo, course)
    const a = obtenirZoneAllure(
      zones, seance.discipline, cat.zoneCible);
    if (!a) {
      const noms = {
        natation: 'la natation',
        velo: 'le vélo',
        course: 'la course',
      };
      const nom = noms[seance.discipline] || seance.discipline;
      return {
        allureCible: null,
        messageAllure: 'Allure non calculée. Saisir un chrono '
          + 'représentatif pour ' + nom + ' dans le profil pour '
          + 'obtenir l\'allure cible de la séance.',
      };
    }
    return { allureCible: a, messageAllure: null };
  }


  function construireListeCartes() {
    const sem = obtenirSemaine(etat.semaineCourante);
    if (!sem) return '';
    // Zones d'allure calculées une seule fois pour toute la semaine,
    // depuis les chronos courants du profil.
    const zones = obtenirZones();
    let html = '<ul class="seances__liste">';
    for (let i = 0; i < sem.seances.length; i++) {
      html += construireCarteSeance(sem.seances[i], zones);
    }
    html += '</ul>';
    return html;
  }

  function construireCarteSeance(seance, zones) {
    const statut = STORAGE.obtenirStatutSeance(
      etat.athleteActif, seance.id);
    const realisation = STORAGE.obtenirRealisation(
      etat.athleteActif, seance.id);
    const couleur = couleurDiscipline(seance.discipline);
    const jour = libelleJour(seance.jour);
    const dateAff = formaterDateCourte(seance.date);

    // Allure dérivée des chronos courants, jamais lue depuis le
    // plan stocké (voir commentaire de calculerAllureCourante).
    const dynamique = calculerAllureCourante(seance, zones);
    const allureCible = dynamique.allureCible;
    const messageAllure = dynamique.messageAllure;

    let allureHTML = '';
    if (seance.discipline === 'combinee' && allureCible) {
      const v = allureCible.velo;
      const c = allureCible.course;
      const parts = [];
      if (v) parts.push('Vélo ' + v.affichage);
      if (c) parts.push('Course ' + c.affichage);
      if (parts.length > 0) {
        allureHTML = '<div class="seances__carte-allure">'
          + parts.join(' puis ') + '</div>';
      }
    } else if (allureCible) {
      allureHTML = '<div class="seances__carte-allure">'
        + echapperHTML(allureCible.affichage) + '</div>';
    } else if (messageAllure) {
      allureHTML = '<div class="seances__carte-allure '
        + 'seances__carte-allure--manquante">'
        + 'Allure non calculée, compléter le profil</div>';
    }

    const dureeAff = seance.duree_min
      ? seance.duree_min + ' min'
      : '';
    const zoneAff = seance.zoneCible
      ? libelleZone(seance.zoneCible)
      : '';

    return ''
      + '<li class="seances__carte" data-action="ouvrir" '
      + 'data-id="' + seance.id + '" '
      + 'style="border-left-color:' + couleur + ';">'

      + '<div class="seances__carte-haut">'
      +   '<div class="seances__carte-jour">'
      +     '<strong>' + echapperHTML(jour) + '</strong>'
      +     '<span>' + dateAff + '</span>'
      +   '</div>'
      +   '<span class="statut statut--' + statut + '">'
      +     libelleStatut(statut) + '</span>'
      + '</div>'

      + '<div class="seances__carte-discipline" '
      + 'style="color:' + couleur + ';">'
      + echapperHTML(libelleDiscipline(seance.discipline))
      + (seance.estCommune ? ' · commune' : '')
      + (seance.estPersonnalisable ? ' · personnalisable' : '')
      + '</div>'

      + '<h3 class="seances__carte-titre">'
      + echapperHTML(seance.libelle) + '</h3>'

      + '<div class="seances__carte-meta">'
      + (dureeAff ? dureeAff : '')
      + (dureeAff && zoneAff ? ' · ' : '')
      + (zoneAff ? 'zone ' + zoneAff : '')
      + '</div>'

      + allureHTML

      + construireMiniRealiseCarte(seance, statut, realisation, zones)

      + (seance.renforcement
          ? '<div class="seances__carte-renforcement">'
            + 'Bloc renforcement en fin de séance</div>'
          : '')

      + '</li>';
  }

  // Mini ligne "Prévu X · Réalisé Y" sous la carte de liste, affichée
  // uniquement quand l'utilisateur a saisi une durée ou une distance
  // réelle. Le cas saisie purement qualitative (ressenti ou
  // commentaire seuls) reste discret pour ne pas alourdir la carte.
  function construireMiniRealiseCarte(seance, statut, realisation, zones) {
    if (!aSaisieChiffree(realisation)) return '';
    const prevu = seance.duree_min || 0;
    const realise = contributionRealiseeSeance(
      seance, statut, realisation, zones);
    const classeMod = realise > prevu * 1.05
      ? ' seances__carte-realise--surplus'
      : (realise < prevu * 0.95
          ? ' seances__carte-realise--deficit'
          : '');
    return '<div class="seances__carte-realise' + classeMod + '">'
      + 'Prévu ' + formaterMinutes(prevu)
      + ' · Réalisé ' + formaterMinutes(realise)
      + '</div>';
  }


  // -------------------- Vue détail --------------------

  function construireVueDetail() {
    const trouvee = trouverSeance(etat.idSeanceDetail);
    if (!trouvee) {
      etat.idSeanceDetail = null;
      return construireVueListe();
    }
    const seance = trouvee.seance;
    const couleur = couleurDiscipline(seance.discipline);
    const zones = obtenirZones();

    return ''
      + '<div class="seances">'

      + '<header class="seances__detail-entete" '
      + 'style="border-left: 6px solid ' + couleur + ';">'
      +   '<button type="button" class="seances__retour" '
      +     'data-action="retour">‹ Retour à la semaine</button>'
      +   '<div class="seances__detail-discipline" '
      +     'style="color:' + couleur + ';">'
      +     echapperHTML(libelleDiscipline(seance.discipline))
      +     (seance.estCommune ? ' · séance commune' : '')
      +   '</div>'
      +   '<h2 class="seances__detail-titre">'
      +     echapperHTML(seance.libelle) + '</h2>'
      +   '<div class="seances__detail-jour">'
      +     echapperHTML(libelleJour(seance.jour)) + ' '
      +     formaterDateCourte(seance.date)
      +   '</div>'
      + '</header>'

      + construireBlocMeta(seance)
      + construireBlocAllure(seance, zones)
      + construireBlocObjectif(seance)
      + construireBlocDetails(seance)
      + construireBlocRenforcement(seance)
      + construireBlocStatut(seance)
      + construireBlocPropositionReport(seance)
      + construireBlocRealise(seance)
      + construireBlocComparaison(seance, zones)
      + construireBlocNote(seance)
      + construireBlocAdapter(seance, trouvee.semaine)

      + construireAvertissement()
      + '</div>';
  }

  function construireBlocMeta(seance) {
    const items = [];
    if (seance.duree_min) {
      items.push('<span><strong>Durée</strong> '
        + seance.duree_min + ' minutes</span>');
    }
    if (seance.zoneCible) {
      items.push('<span><strong>Zone</strong> '
        + libelleZone(seance.zoneCible) + '</span>');
    }
    if (seance.estPersonnalisable) {
      items.push('<span><strong>Quatrième séance</strong> '
        + 'modifiable</span>');
    }
    if (items.length === 0) return '';
    return ''
      + '<section class="seances__bloc">'
      + '<div class="seances__meta">' + items.join('') + '</div>'
      + '</section>';
  }

  function construireBlocAllure(seance, zones) {
    if (seance.discipline === 'course_jour') return '';

    // Allure dérivée des chronos courants, jamais lue depuis le
    // plan stocké (voir commentaire de calculerAllureCourante).
    const dynamique = calculerAllureCourante(seance, zones);
    const allureCible = dynamique.allureCible;
    const messageAllure = dynamique.messageAllure;

    let interieur = '';

    if (seance.discipline === 'combinee') {
      if (!allureCible
          || (!allureCible.velo && !allureCible.course)) {
        interieur = '<div class="seances__allure-message">'
          + echapperHTML(messageAllure
              || 'Allures non calculées, compléter le profil pour '
                + 'obtenir les allures de la séance combinée.')
          + '</div>';
      } else {
        const v = allureCible.velo;
        const c = allureCible.course;
        interieur = '<div class="seances__allure-combinee">'
          + (v
              ? '<div class="seances__allure-partie">'
                + '<strong>Partie vélo</strong>'
                + '<span class="seances__allure-valeur">'
                + echapperHTML(v.affichage) + '</span></div>'
              : '<div class="seances__allure-partie">'
                + '<strong>Partie vélo</strong> non calculée</div>')
          + (c
              ? '<div class="seances__allure-partie">'
                + '<strong>Partie course</strong>'
                + '<span class="seances__allure-valeur">'
                + echapperHTML(c.affichage) + '</span></div>'
              : '<div class="seances__allure-partie">'
                + '<strong>Partie course</strong> non calculée</div>')
          + '</div>';
      }
      interieur += construireMentionsFiabilite(['velo', 'course'], zones);
    } else if (allureCible) {
      interieur = '<div class="seances__allure-valeur">'
        + echapperHTML(allureCible.affichage) + '</div>';
      interieur += construireMentionsFiabilite([seance.discipline], zones);
    } else if (messageAllure) {
      interieur = '<div class="seances__allure-message">'
        + echapperHTML(messageAllure) + '</div>';
    } else {
      return '';
    }

    return ''
      + '<section class="seances__bloc">'
      + '<h3>Allure cible</h3>'
      + interieur
      + '</section>';
  }

  function construireMentionsFiabilite(disciplines, zones) {
    let html = '';
    for (let i = 0; i < disciplines.length; i++) {
      const d = disciplines[i];
      const r = zones && zones[d];
      if (!r || !r.fiabilite) continue;
      if (r.fiabilite.niveau === 'elevee') continue;
      const classe = 'seances__fiabilite seances__fiabilite--'
        + r.fiabilite.niveau;
      const lib = r.fiabilite.niveau === 'moyenne'
        ? 'Fiabilité moyenne' : 'Fiabilité faible';
      html += '<div class="' + classe + '">'
        + '<strong>' + lib + ' sur ' + libelleDiscipline(d) + '.</strong> '
        + echapperHTML(r.fiabilite.message) + '</div>';
    }
    return html;
  }

  function construireBlocObjectif(seance) {
    if (!seance.objectif) return '';
    return ''
      + '<section class="seances__bloc">'
      + '<h3>Objectif</h3>'
      + '<p>' + echapperHTML(seance.objectif) + '</p>'
      + '</section>';
  }

  function construireBlocDetails(seance) {
    if (!seance.details) return '';
    return ''
      + '<section class="seances__bloc">'
      + '<h3>Déroulé</h3>'
      + '<p>' + echapperHTML(seance.details) + '</p>'
      + '</section>';
  }

  function construireBlocRenforcement(seance) {
    if (!seance.renforcement || !seance.renforcement.actif) return '';
    const r = seance.renforcement;
    let html = '<section class="seances__bloc seances__bloc--renforcement">'
      + '<h3>Renforcement, en fin de séance</h3>'
      + '<p class="seances__aide">' + echapperHTML(r.orientation) + '</p>'
      + '<ul class="seances__exercices">';
    for (let i = 0; i < (r.exercices || []).length; i++) {
      html += '<li>' + echapperHTML(r.exercices[i]) + '</li>';
    }
    html += '</ul>'
      + '<p class="seances__aide-petit">Durée totale du bloc : '
      + echapperHTML(r.duree || '12 à 15 minutes') + '.</p>'
      + '</section>';
    return html;
  }

  // ---- Bloc Réalisé (saisie après séance) ----
  //
  // Quatre champs saisissables :
  //   - durée réelle en minutes (input numérique),
  //   - distance réelle en km (input décimal),
  //   - ressenti d'effort (trois boutons radio facile / moyen / dur),
  //   - commentaire libre (textarea, 500 caractères max).
  // Les valeurs sont stockées via STORAGE.enregistrerRealisation à
  // chaque modification (blur pour les inputs, click pour le
  // ressenti). Si tous les champs sont vides après modification,
  // l'entrée est automatiquement supprimée par le storage.
  //
  // Cas course_jour : pas de bloc de saisie de réalisation
  // (la course du 30 août ne se "réalise" pas dans le sens
  // habituel). On laisse uniquement le statut et la note libre.
  function construireBlocRealise(seance) {
    if (seance.discipline === 'course_jour') return '';

    const r = STORAGE.obtenirRealisation(
      etat.athleteActif, seance.id) || {};
    const duree = (typeof r.duree_min === 'number' && r.duree_min > 0)
      ? String(r.duree_min) : '';
    const distance = (typeof r.distance_km === 'number' && r.distance_km > 0)
      ? String(r.distance_km) : '';
    const ressenti = r.ressenti || null;
    const commentaire = r.commentaire || '';

    return ''
      + '<section class="seances__bloc seances__bloc--realise">'
      + '<h3>Réalisé après la séance</h3>'
      + '<p class="seances__aide">'
      + 'Saisie facultative. Sert au calcul de la charge réalisée. '
      + 'Une séance manquée ne pèse pas dans la charge, même si une '
      + 'saisie est présente.</p>'

      + '<div class="seances__realise-ligne">'
      +   '<label class="seances__realise-champ">'
      +     '<span>Durée</span>'
      +     '<input type="number" inputmode="numeric" min="1" step="1" '
      +       'data-action="real-duree" placeholder="min" '
      +       'value="' + echapperHTML(duree) + '">'
      +     '<small>min</small>'
      +   '</label>'
      +   '<label class="seances__realise-champ">'
      +     '<span>Distance</span>'
      +     '<input type="number" inputmode="decimal" min="0" step="0.1" '
      +       'data-action="real-distance" placeholder="km" '
      +       'value="' + echapperHTML(distance) + '">'
      +     '<small>km</small>'
      +   '</label>'
      + '</div>'

      + '<div class="seances__realise-ressenti" role="group" '
      + 'aria-label="Ressenti d\'effort">'
      +   boutonRessenti('facile', ressenti)
      +   boutonRessenti('moyen', ressenti)
      +   boutonRessenti('dur', ressenti)
      + '</div>'

      + '<textarea class="seances__realise-commentaire" '
      + 'data-action="real-commentaire" maxlength="500" '
      + 'placeholder="Commentaire court : sensations, météo, '
      + 'circonstances...">'
      + echapperHTML(commentaire)
      + '</textarea>'

      + '</section>';
  }

  function boutonRessenti(cle, valeurActive) {
    return '<button type="button" '
      + 'class="seances__ressenti seances__ressenti--' + cle
      + (valeurActive === cle ? ' seances__ressenti--actif' : '') + '" '
      + 'data-action="real-ressenti" data-valeur="' + cle + '">'
      + libelleRessenti(cle) + '</button>';
  }


  // ---- Bloc Comparaison prévu / réalisé ----
  //
  // Tableau compact en deux ou trois lignes :
  //   - Durée prévue vs réalisée (en minutes formatées),
  //   - Distance réelle si saisie (informatif),
  //   - Ressenti si renseigné (informatif).
  // Affiché seulement si au moins une saisie ou un statut autre que
  // 'a_venir' apporte de l'information. Sinon, l'utilisateur n'a
  // rien à voir et le bloc reste invisible.
  function construireBlocComparaison(seance, zones) {
    if (seance.discipline === 'course_jour') return '';

    const statut = STORAGE.obtenirStatutSeance(
      etat.athleteActif, seance.id);
    const realisation = STORAGE.obtenirRealisation(
      etat.athleteActif, seance.id);

    // Conditions d'affichage : on évite d'afficher un bloc vide
    // tant qu'aucune réalisation n'est ni saisie ni implicite.
    const rienALireStatut = (statut === 'a_venir');
    if (rienALireStatut && !realisation) return '';

    const prevu = seance.duree_min || 0;
    const realise = contributionRealiseeSeance(
      seance, statut, realisation, zones);
    const delta = Math.round(realise - prevu);
    const signe = delta > 0 ? '+' : (delta < 0 ? '−' : '');
    const classeDelta = delta > 0
      ? 'seances__comparaison-delta--surplus'
      : (delta < 0
          ? 'seances__comparaison-delta--deficit'
          : 'seances__comparaison-delta--egal');

    let lignes = ''
      + '<div class="seances__comparaison-ligne">'
      +   '<span class="seances__comparaison-libelle">Durée</span>'
      +   '<span class="seances__comparaison-prevu">'
      +     formaterMinutes(prevu) + '</span>'
      +   '<span class="seances__comparaison-vers">→</span>'
      +   '<span class="seances__comparaison-realise">'
      +     formaterMinutes(realise) + '</span>'
      +   '<span class="seances__comparaison-delta '
      +     classeDelta + '">'
      +     (delta === 0 ? '=' : signe + formaterMinutes(Math.abs(delta)))
      +   '</span>'
      + '</div>';

    if (realisation && typeof realisation.distance_km === 'number'
        && realisation.distance_km > 0) {
      lignes += ''
        + '<div class="seances__comparaison-ligne">'
        +   '<span class="seances__comparaison-libelle">Distance</span>'
        +   '<span class="seances__comparaison-prevu">—</span>'
        +   '<span class="seances__comparaison-vers">→</span>'
        +   '<span class="seances__comparaison-realise">'
        +     echapperHTML(String(realisation.distance_km)) + ' km</span>'
        +   '<span></span>'
        + '</div>';
    }

    if (realisation && realisation.ressenti) {
      lignes += ''
        + '<div class="seances__comparaison-ligne">'
        +   '<span class="seances__comparaison-libelle">Ressenti</span>'
        +   '<span class="seances__comparaison-prevu">—</span>'
        +   '<span class="seances__comparaison-vers">→</span>'
        +   '<span class="seances__comparaison-realise">'
        +     libelleRessenti(realisation.ressenti) + '</span>'
        +   '<span></span>'
        + '</div>';
    }

    // Invite contextuelle : si une saisie chiffrée existe mais que
    // le statut est encore 'a_venir', on rappelle à l'utilisateur
    // que les deux sont indépendants. La saisie pèse déjà dans la
    // charge réalisée, mais le statut reflète l'état officiel de
    // la séance et reste à mettre à jour explicitement.
    const inviteStatut = (statut === 'a_venir' && aSaisieChiffree(realisation))
      ? '<p class="seances__aide-petit">'
        + 'Saisie enregistrée. Le statut ci-dessus reste sur "À venir" : '
        + 'pense à le passer à "Faite" ou "Partielle" pour qu\'il '
        + 'reflète la séance.</p>'
      : '';

    return ''
      + '<section class="seances__bloc seances__bloc--comparaison">'
      + '<h3>Prévu et réalisé</h3>'
      + '<div class="seances__comparaison">' + lignes + '</div>'
      + inviteStatut
      + (statut === 'manquee'
          ? '<p class="seances__aide-petit">'
            + 'Statut manqué : la saisie est conservée mais ne pèse '
            + 'pas dans la charge réalisée.</p>'
          : '')
      + '</section>';
  }


  // ---- Bandeau Proposition de report ----
  //
  // Apparaît uniquement quand toutes ces conditions sont réunies :
  //   - le statut courant de la séance est 'manquee',
  //   - la séance n'est pas la course du 30 août,
  //   - l'utilisateur n'a pas refusé un report pour cette séance
  //     (reportsIgnores[id] non actif),
  //   - PLAN.proposerJourReport retourne un jour candidat (donc
  //     un jour libre futur existe dans la semaine).
  //
  // La proposition lit l'état COURANT du plan à chaque rendu, donc
  // tout déplacement ou permutation précédent est pris en compte.
  function construireBlocPropositionReport(seance) {
    const statut = STORAGE.obtenirStatutSeance(
      etat.athleteActif, seance.id);
    if (statut !== 'manquee') return '';
    if (seance.typeSeance === 'course_jour') return '';

    const prefs = STORAGE.obtenirPreferences() || {};
    const ignores = prefs.reportsIgnores || {};
    if (ignores[seance.id]) return '';

    const propo = PLAN.proposerJourReport(etat.athleteActif, seance.id);
    if (!propo) {
      return ''
        + '<section class="seances__bloc seances__bloc--report '
        + 'seances__bloc--report-vide">'
        + '<h3>Proposer un report</h3>'
        + '<p class="seances__aide">'
        + 'Aucun jour libre n\'est disponible cette semaine pour '
        + 'reporter cette séance.</p>'
        + '</section>';
    }

    return ''
      + '<section class="seances__bloc seances__bloc--report">'
      + '<h3>Proposer un report</h3>'
      + '<p class="seances__aide">'
      + 'Reporter cette séance à '
      + '<strong>' + libelleJourCourt(propo.jour) + ' '
      + formaterDateCourte(propo.date) + '</strong> ?</p>'
      + '<div class="seances__report-actions">'
      +   '<button type="button" '
      +     'class="seances__report-bouton seances__report-bouton--valider" '
      +     'data-action="reporter-valider" data-jour="' + propo.jour + '">'
      +     'Reporter ce jour'
      +   '</button>'
      +   '<button type="button" '
      +     'class="seances__report-bouton seances__report-bouton--ignorer" '
      +     'data-action="reporter-ignorer">'
      +     'Ignorer'
      +   '</button>'
      + '</div>'
      + '</section>';
  }


  // ---- Bloc Adapter (déplacer, permuter, remplacer) ----
  //
  // Présenté en deux temps :
  //   1. Barre des 7 jours de la semaine : le jour de la séance
  //      est marqué actif. Cliquer un jour libre déplace la séance.
  //      Cliquer un jour occupé permute avec la séance présente.
  //      Le passage entre déplacement et permutation est donc
  //      transparent pour l'utilisateur, sans bouton séparé.
  //   2. Palette de remplacement de discipline : alternatives
  //      compatibles (même zoneCible, même nature simple ou
  //      combinée). La nature est préservée pour garder ferme
  //      le décompte hebdomadaire à 4 séances.
  //
  // Aucun bloc affiché pour la course du 30 août : la course
  // n'est ni déplacée ni remplacée.
  function construireBlocAdapter(seance, semaine) {
    if (seance.typeSeance === 'course_jour') return '';

    return ''
      + '<section class="seances__bloc seances__bloc--adapter">'
      + '<h3>Adapter la séance</h3>'
      + construireBarreJoursAdapter(seance, semaine)
      + construireRemplacementDiscipline(seance)
      + '</section>';
  }

  function construireBarreJoursAdapter(seance, semaine) {
    // Tableau des séances de la semaine par jour, pour identifier
    // celle qui occupe chaque créneau (pour la permutation).
    const parJour = {};
    for (let i = 0; i < semaine.seances.length; i++) {
      parJour[semaine.seances[i].jour] = semaine.seances[i];
    }

    let html = ''
      + '<div class="seances__adapter-sous-titre">Changer de jour</div>'
      + '<p class="seances__aide-petit">'
      + 'Cliquer un jour libre pour déplacer, ou un jour occupé '
      + 'pour permuter. Toujours dans cette semaine.</p>'
      + '<div class="seances__jours" role="group" '
      + 'aria-label="Choix du jour">';

    for (let j = 0; j < 7; j++) {
      const occupant = parJour[j];
      const estCourant = (occupant && occupant.id === seance.id);
      const occupePar = (occupant && !estCourant) ? occupant : null;

      let classes = 'seances__jour';
      let dataAction;
      let titre = '';

      if (estCourant) {
        classes += ' seances__jour--actuel';
        dataAction = '';
        titre = 'Jour actuel de la séance';
      } else if (occupePar) {
        // Cas semaine 15 : si l'occupant est la course du 30 août,
        // la permutation est refusée par PLAN.permuterSeances. On
        // reflète cette règle dans l'UI en désactivant le bouton.
        if (occupePar.typeSeance === 'course_jour') {
          classes += ' seances__jour--occupe seances__jour--bloque';
          dataAction = '';
          titre = 'Course du 30 août (non permutable)';
        } else {
          classes += ' seances__jour--occupe';
          dataAction = 'permuter';
          titre = 'Permuter avec ' + (occupePar.libelle || '');
        }
      } else {
        classes += ' seances__jour--libre';
        dataAction = 'deplacer';
        titre = 'Déplacer ici';
      }

      const dataAttrs = dataAction
        ? 'data-action="' + dataAction + '" '
          + 'data-jour="' + j + '"'
          + (occupePar
              ? ' data-id-cible="' + echapperHTML(occupePar.id) + '"'
              : '')
        : '';

      html += '<button type="button" class="' + classes + '" '
        + dataAttrs
        + ' title="' + echapperHTML(titre) + '"'
        + (dataAction ? '' : ' disabled')
        + '>'
        + '<span class="seances__jour-libelle">'
        + libelleJourCourt(j) + '</span>'
        + (occupePar
            ? '<span class="seances__jour-occupant">'
              + echapperHTML(
                  libelleDiscipline(occupePar.discipline)
                  || '')
              + '</span>'
            : (estCourant
                ? '<span class="seances__jour-occupant">ici</span>'
                : '<span class="seances__jour-occupant">libre</span>'))
        + '</button>';
    }
    html += '</div>';
    return html;
  }

  function construireRemplacementDiscipline(seance) {
    const catalogue = PLAN.CATALOGUE || {};
    const alternatives = (PLAN.cataloguesCompatibles
      ? PLAN.cataloguesCompatibles(seance.typeSeance) : []);

    if (alternatives.length <= 1) {
      // Aucune alternative en dehors de la séance courante :
      // on n'affiche pas le bloc plutôt que de présenter un seul
      // bouton inactif.
      return '';
    }

    let html = ''
      + '<div class="seances__adapter-sous-titre">'
      + 'Remplacer le contenu</div>'
      + '<p class="seances__aide-petit">'
      + 'Alternatives de même intensité et de même nature, pour '
      + 'préserver l\'intention de la semaine.</p>'
      + '<div class="seances__alternatives">';

    for (let i = 0; i < alternatives.length; i++) {
      const cle = alternatives[i];
      const cat = catalogue[cle];
      if (!cat) continue;
      const actif = (cle === seance.typeSeance);
      html += '<button type="button" '
        + 'class="seances__alternative'
        + (actif ? ' seances__alternative--actif' : '') + '" '
        + 'data-action="remplacer-discipline" data-type="' + cle + '"'
        + (actif ? ' disabled' : '')
        + '>'
        + echapperHTML(cat.libelle) + '</button>';
    }
    html += '</div>';
    return html;
  }

  function construireBlocStatut(seance) {
    const statut = STORAGE.obtenirStatutSeance(
      etat.athleteActif, seance.id);
    return ''
      + '<section class="seances__bloc">'
      + '<h3>Statut</h3>'
      + '<div class="boutons-statut">'
      +   boutonStatut('faite', statut)
      +   boutonStatut('partielle', statut)
      +   boutonStatut('manquee', statut)
      + '</div>'
      + (statut !== 'a_venir'
          ? '<p class="seances__aide-petit">'
            + 'Toucher de nouveau le bouton actif pour revenir à '
            + 'l\'état à venir.</p>'
          : '')
      + '</section>';
  }

  function boutonStatut(cle, statutActuel) {
    const libelles = {
      faite: 'Faite',
      partielle: 'Partielle',
      manquee: 'Manquée',
    };
    return '<button type="button" '
      + 'class="bouton-statut bouton-statut--' + cle
      + (statutActuel === cle ? ' actif' : '') + '" '
      + 'data-action="statut" data-valeur="' + cle + '">'
      + libelles[cle] + '</button>';
  }

  function construireBlocNote(seance) {
    const note = STORAGE.obtenirNotesSeance(etat.athleteActif, seance.id);
    return ''
      + '<section class="seances__bloc">'
      + '<h3>Note libre</h3>'
      + '<textarea class="seances__note" data-action="note" '
      + 'placeholder="Sensations, météo, observations">'
      + echapperHTML(note || '')
      + '</textarea>'
      + '</section>';
  }


  // -------------------- Avertissement --------------------

  function construireAvertissement() {
    const txt = (typeof REFERENCE !== 'undefined'
      && REFERENCE.avertissementSante)
      ? REFERENCE.avertissementSante
      : 'Cet outil ne remplace pas un avis médical.';
    return ''
      + '<footer class="seances__avertissement profils__avertissement">'
      + '<strong>Avertissement.</strong> ' + echapperHTML(txt)
      + '</footer>';
  }


  // -------------------- Événements --------------------

  function attacherEvenements() {
    const c = etat.conteneur;
    c.addEventListener('click', gererClic);
    c.addEventListener('focusout', gererBlur, true);
  }

  function trouverElementAction(cible) {
    let el = cible;
    while (el && el !== etat.conteneur) {
      if (el.getAttribute && el.getAttribute('data-action')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function gererClic(e) {
    const el = trouverElementAction(e.target);
    if (!el) return;
    const action = el.getAttribute('data-action');

    if (action === 'basculer-athlete') {
      basculerAthlete(el.getAttribute('data-cle'));
      return;
    }
    if (action === 'precedent') {
      basculerSemaine(etat.semaineCourante - 1);
      return;
    }
    if (action === 'suivant') {
      basculerSemaine(etat.semaineCourante + 1);
      return;
    }
    if (action === 'ouvrir') {
      etat.idSeanceDetail = el.getAttribute('data-id');
      rendre();
      return;
    }
    if (action === 'retour') {
      etat.idSeanceDetail = null;
      rendre();
      return;
    }
    if (action === 'statut') {
      basculerStatut(el.getAttribute('data-valeur'));
      return;
    }
    if (action === 'remplacer-discipline') {
      actionRemplacerDiscipline(el.getAttribute('data-type'));
      return;
    }
    if (action === 'real-ressenti') {
      saisirRessenti(el.getAttribute('data-valeur'));
      return;
    }
    if (action === 'deplacer') {
      actionDeplacer(parseInt(el.getAttribute('data-jour'), 10));
      return;
    }
    if (action === 'permuter') {
      actionPermuter(el.getAttribute('data-id-cible'));
      return;
    }
    if (action === 'reporter-valider') {
      actionReporterValider(parseInt(el.getAttribute('data-jour'), 10));
      return;
    }
    if (action === 'reporter-ignorer') {
      actionReporterIgnorer();
      return;
    }
  }

  // Sauvegarde d'un seul champ. Extrait pour pouvoir être appelé
  // par deux voies : focusout (cas normal) et bascule de visibilité
  // ou pagehide (filet de sauvegarde mobile, voir initialiser).
  function sauvegarderChamp(element) {
    if (!element || !element.getAttribute) return;
    const action = element.getAttribute('data-action');
    if (!etat.idSeanceDetail) return;

    if (action === 'note') {
      STORAGE.enregistrerNotesSeance(
        etat.athleteActif, etat.idSeanceDetail, element.value);
      return;
    }
    if (action === 'real-duree') {
      saisirChampRealisation('duree_min', element.value);
      return;
    }
    if (action === 'real-distance') {
      saisirChampRealisation('distance_km', element.value);
      return;
    }
    if (action === 'real-commentaire') {
      saisirChampRealisation('commentaire', element.value);
      return;
    }
  }

  function gererBlur(e) {
    sauvegarderChamp(e.target);
  }

  // Filet de sauvegarde mobile : parcourt tous les champs saisissables
  // visibles dans le conteneur courant et déclenche leur sauvegarde.
  // Appelé sur les événements de bascule d'onglet, de mise en veille
  // ou de fermeture de page, où focusout peut ne jamais se déclencher
  // proprement. Inoffensif quand on n'est pas sur la vue détail :
  // querySelectorAll retourne alors un ensemble vide.
  function forcerSauvegardeChampsActifs() {
    if (!etat.conteneur) return;
    const champs = etat.conteneur.querySelectorAll(
      'input[data-action], textarea[data-action]');
    for (let i = 0; i < champs.length; i++) {
      sauvegarderChamp(champs[i]);
    }
  }


  // -------------------- Mutations --------------------

  function basculerAthlete(cle) {
    if (cle !== 'julien' && cle !== 'giulia') return;
    etat.athleteActif = cle;
    etat.idSeanceDetail = null;
    const prefs = STORAGE.obtenirPreferences();
    prefs.athleteActif = cle;
    STORAGE.enregistrerPreferences(prefs);
    // Assure que le plan de cet athlète est généré.
    if (!PLAN.obtenirPlan(cle)) {
      PLAN.genererPlansLesDeux();
    }
    rendre();
  }

  function basculerSemaine(n) {
    n = Math.max(1, Math.min(15, n));
    etat.semaineCourante = n;
    etat.idSeanceDetail = null;
    rendre();
  }

  function basculerStatut(valeur) {
    if (!etat.idSeanceDetail) return;
    const actuel = STORAGE.obtenirStatutSeance(
      etat.athleteActif, etat.idSeanceDetail);
    const nouveau = actuel === valeur ? 'a_venir' : valeur;
    STORAGE.enregistrerStatutSeance(
      etat.athleteActif, etat.idSeanceDetail, nouveau);
    rendre();
  }

  // -------------------- Saisie du réalisé --------------------

  // Lit la réalisation courante, met à jour un seul champ, et
  // réécrit l'objet via STORAGE.enregistrerRealisation. Le storage
  // se charge de la normalisation (nombre positif ou null, ressenti
  // valide ou null, chaîne sinon) et de la suppression automatique
  // si tous les champs deviennent vides après la mise à jour.
  function saisirChampRealisation(champ, valeur) {
    if (!etat.idSeanceDetail) return;
    const courant = STORAGE.obtenirRealisation(
      etat.athleteActif, etat.idSeanceDetail) || {};
    const next = {
      duree_min: courant.duree_min,
      distance_km: courant.distance_km,
      ressenti: courant.ressenti,
      commentaire: courant.commentaire,
    };
    next[champ] = valeur;
    STORAGE.enregistrerRealisation(
      etat.athleteActif, etat.idSeanceDetail, next);
    // Re rendu pour que la comparaison prévu / réalisé et le
    // mini indicateur de la carte se mettent immédiatement à jour.
    rendre();
  }

  function saisirRessenti(valeur) {
    if (!etat.idSeanceDetail) return;
    const courant = STORAGE.obtenirRealisation(
      etat.athleteActif, etat.idSeanceDetail) || {};
    // Cliquer le bouton actif désactive (toggle).
    const nouveau = (courant.ressenti === valeur) ? null : valeur;
    saisirChampRealisation('ressenti', nouveau);
  }


  // -------------------- Actions de flexibilité --------------------

  // Déplace la séance courante vers un jour libre de sa semaine.
  // En cas d'échec, on lit la raison structurée renvoyée par
  // PLAN.deplacerSeance et on ne fait rien de visible : la barre
  // de jours est elle même la principale rétroaction, l'utilisateur
  // ne devrait pas tomber sur un cas d'échec ici puisque les jours
  // occupés sont affichés comme tels et déclenchent l'action
  // 'permuter', pas 'deplacer'.
  function actionDeplacer(nouveauJour) {
    if (!etat.idSeanceDetail) return;
    const res = PLAN.deplacerSeance(
      etat.athleteActif, etat.idSeanceDetail, nouveauJour);
    if (!res || !res.ok) return;
    rendre();
  }

  // Permute la séance courante avec une autre séance de la même
  // semaine. L'identifiant cible vient du data attribute du bouton
  // de jour occupé, ce qui garantit qu'il s'agit d'une séance de
  // la même semaine que la courante (rendue par construireBarre
  // JoursAdapter à partir de semaine.seances).
  function actionPermuter(idCible) {
    if (!etat.idSeanceDetail || !idCible) return;
    const res = PLAN.permuterSeances(
      etat.athleteActif, etat.idSeanceDetail, idCible);
    if (!res) return;
    rendre();
  }

  // Remplace le type / la discipline de la séance courante. Le
  // catalogue d'alternatives a déjà été filtré côté affichage par
  // PLAN.cataloguesCompatibles (même zoneCible, même nature). Le
  // décompte hebdomadaire reste donc ferme.
  function actionRemplacerDiscipline(nouveauType) {
    if (!etat.idSeanceDetail || !nouveauType) return;
    const res = PLAN.remplacerDiscipline(
      etat.athleteActif, etat.idSeanceDetail, nouveauType);
    if (!res) return;
    rendre();
  }


  // -------------------- Proposition de report --------------------

  // Valide la proposition : déplace la séance manquée vers le jour
  // libre proposé. Si le déplacement aboutit, on bascule le statut
  // sur 'a_venir' pour que la séance reportée puisse être suivie à
  // nouveau dans son nouveau créneau. On nettoie aussi le drapeau
  // d'ignorance éventuel, par symétrie.
  function actionReporterValider(nouveauJour) {
    if (!etat.idSeanceDetail) return;
    const res = PLAN.deplacerSeance(
      etat.athleteActif, etat.idSeanceDetail, nouveauJour);
    if (!res || !res.ok) {
      // Le jour libre proposé est devenu occupé entre l'affichage
      // et le clic. On re rend pour que la prochaine proposition
      // tienne compte du nouvel état (ou bascule sur "aucun jour
      // libre" si la semaine est saturée).
      rendre();
      return;
    }
    // Bascule du statut sur 'a_venir' : la séance reportée
    // redevient une séance à faire sur son nouveau créneau.
    STORAGE.enregistrerStatutSeance(
      etat.athleteActif, etat.idSeanceDetail, 'a_venir');
    // Nettoie un éventuel marqueur d'ignorance pour cette séance,
    // pour qu'une éventuelle future passage à manquée propose à
    // nouveau un report propre.
    const prefs = STORAGE.obtenirPreferences() || {};
    if (prefs.reportsIgnores && prefs.reportsIgnores[etat.idSeanceDetail]) {
      delete prefs.reportsIgnores[etat.idSeanceDetail];
      STORAGE.enregistrerPreferences(prefs);
    }
    rendre();
  }

  // Refuse la proposition : on mémorise que l'utilisateur ne
  // souhaite pas reporter cette séance, pour ne pas réafficher le
  // bandeau à chaque ouverture de la vue détail. Si la séance
  // bascule plus tard hors de 'manquee' puis y revient (rare), le
  // bandeau ne réapparaîtra pas tant que reportsIgnores reste actif.
  // Une validation ultérieure (actionReporterValider) nettoie ce
  // drapeau, et une réinitialisation des données aussi.
  function actionReporterIgnorer() {
    if (!etat.idSeanceDetail) return;
    const prefs = STORAGE.obtenirPreferences() || {};
    if (!prefs.reportsIgnores) prefs.reportsIgnores = {};
    prefs.reportsIgnores[etat.idSeanceDetail] = true;
    STORAGE.enregistrerPreferences(prefs);
    rendre();
  }


  // -------------------- Initialisation --------------------

  function initialiser(conteneur) {
    if (!conteneur) {
      console.warn('SEANCES.initialiser : aucun conteneur fourni.');
      return;
    }
    etat.conteneur = conteneur;
    const prefs = STORAGE.obtenirPreferences();
    etat.athleteActif = (prefs && prefs.athleteActif) || 'julien';
    etat.semaineCourante = semaineParDefaut();
    etat.idSeanceDetail = null;

    // Filet de sauvegarde mobile attaché UNE SEULE FOIS, au premier
    // initialiser. Les listeners ne sont pas réattachés aux bascules
    // d'onglet : ils restent valides et utilisent etat.conteneur,
    // mis à jour à chaque initialiser. Quand l'utilisateur est sur
    // un autre onglet, forcerSauvegardeChampsActifs ne trouve aucun
    // champ saisissable et reste inoffensive. Cible les cas mobile :
    //   - visibilitychange (hidden) : bascule d'onglet, mise en veille
    //   - pagehide                 : fermeture, navigation arrière
    if (!etat.filetsAttaches) {
      etat.filetsAttaches = true;
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
          forcerSauvegardeChampsActifs();
        }
      });
      window.addEventListener('pagehide', function () {
        forcerSauvegardeChampsActifs();
      });
    }

    // Assure qu'un plan est disponible pour les deux athlètes.
    if (!PLAN.obtenirPlan('julien') || !PLAN.obtenirPlan('giulia')) {
      PLAN.genererPlansLesDeux();
    }
    rendre();
  }


  // -------------------- Auto initialisation pour preview --------------------

  // Tant que app.js n'a pas pris le relais, seances.js initialise
  // directement la vue séances dans #contenu pour permettre le rendu
  // en preview. app.js pourra désactiver via window.SEANCES_AUTO_INIT.
  document.addEventListener('DOMContentLoaded', function () {
    if (window.SEANCES_AUTO_INIT === false) return;
    const conteneur = document.getElementById('contenu');
    if (conteneur && conteneur.children.length === 0) {
      SEANCES.initialiser(conteneur);
    }
  });


  // -------------------- Interface publique --------------------

  return {
    initialiser: initialiser,
    basculerAthlete: basculerAthlete,
    basculerSemaine: basculerSemaine,
    obtenirSemaine: obtenirSemaine,
    obtenirAthleteActif: function () { return etat.athleteActif; },
    obtenirSemaineCourante: function () { return etat.semaineCourante; },
  };

})();
