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

      + (seance.renforcement
          ? '<div class="seances__carte-renforcement">'
            + 'Bloc renforcement en fin de séance</div>'
          : '')

      + '</li>';
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
      + construireBlocPersonnalisation(seance)
      + construireBlocStatut(seance)
      + construireBlocNote(seance)

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

  function construireBlocPersonnalisation(seance) {
    if (!seance.estPersonnalisable) return '';

    const catalogue = PLAN.CATALOGUE || {};
    const alternatives = Object.keys(catalogue).filter(function (cle) {
      const cat = catalogue[cle];
      if (cle === 'course_jour') return false;
      return cat.discipline === seance.discipline;
    });

    let html = '<section class="seances__bloc">'
      + '<h3>Remplacer cette séance</h3>'
      + '<p class="seances__aide">'
      + 'Choisir un autre type de séance pour la quatrième séance '
      + 'de la semaine. Le reste du plan reste inchangé.</p>'
      + '<div class="seances__alternatives">';
    for (let i = 0; i < alternatives.length; i++) {
      const cle = alternatives[i];
      const cat = catalogue[cle];
      const actif = (cle === seance.typeSeance);
      html += '<button type="button" '
        + 'class="seances__alternative'
        + (actif ? ' seances__alternative--actif' : '') + '" '
        + 'data-action="modifier-type" data-type="' + cle + '">'
        + echapperHTML(cat.libelle) + '</button>';
    }
    html += '</div></section>';
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
    if (action === 'modifier-type') {
      modifierType(el.getAttribute('data-type'));
      return;
    }
  }

  function gererBlur(e) {
    if (!e.target.getAttribute) return;
    const action = e.target.getAttribute('data-action');
    if (action === 'note' && etat.idSeanceDetail) {
      STORAGE.enregistrerNotesSeance(
        etat.athleteActif, etat.idSeanceDetail, e.target.value);
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

  function modifierType(nouveauType) {
    if (!etat.idSeanceDetail) return;
    const trouvee = trouverSeance(etat.idSeanceDetail);
    if (!trouvee) return;
    PLAN.modifierQuatriemeSeance(
      etat.athleteActif, trouvee.semaine.numero,
      { type: nouveauType, personnalisable: true });
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
