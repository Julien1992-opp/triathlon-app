/*
 * profils.js
 * Gestion des profils athlètes et de la saisie des chronos.
 *
 * Dépendances :
 *   - STORAGE pour toute persistance (jamais d'accès direct à localStorage).
 *   - ALLURES pour tout calcul d'allure visée et de zones d'entraînement.
 *
 * Le module construit son interface dans un conteneur DOM fourni par
 * app.js, ou s'auto initialise dans #contenu si app.js n'a pas encore
 * pris le relais (utile pour le rendu en preview tant que la phase de
 * développement n'est pas terminée).
 *
 * Garde fous :
 *   - Toute donnée vient de la saisie utilisateur. Rien n'est inventé.
 *   - Les allures sont strictement celles produites par ALLURES.
 *   - La fréquence cardiaque est purement manuelle, jamais dérivée.
 *   - Une sortie facile reste écartée du calcul des zones via le
 *     drapeau estReference = false, géré par une case à cocher dédiée.
 *   - Aucun trait d'union dans les libellés affichables.
 */

const PROFILS = (function () {

  // -------------------- État local du module --------------------

  const CLES_DISCIPLINES = ['natation', 'velo', 'course'];

  const TITRES_DISCIPLINES = {
    natation: 'Natation',
    velo: 'Vélo',
    course: 'Course',
  };

  // Couleurs reprises de reference.js, dupliquées localement pour
  // éviter une dépendance dure si reference.js évolue. Si REFERENCE
  // est disponible, on s'en sert en priorité.
  function couleurDiscipline(cle) {
    if (typeof REFERENCE !== 'undefined'
        && REFERENCE.disciplines
        && REFERENCE.disciplines[cle]) {
      return REFERENCE.disciplines[cle].couleur;
    }
    const repli = {
      natation: '#00B4D8',
      velo: '#F4A300',
      course: '#E63946',
    };
    return repli[cle] || '#888888';
  }

  let etat = {
    conteneur: null,
    athleteActif: 'julien',
    // Tampon d'édition pour l'identité, évite de muter le storage à
    // chaque keystroke. Sauvegarde au blur.
    brouillonIdentite: null,
  };


  // -------------------- Avatars SVG --------------------

  // Personnage Julien : silhouette stylisée, fond bleu, trifonction
  // rouge avec accent orange, cheveux courts foncés.
  function svgAvatarJulien(taille) {
    const t = taille || 96;
    return ''
      + '<svg viewBox="0 0 120 120" width="' + t + '" height="' + t + '" '
      + 'xmlns="http://www.w3.org/2000/svg" role="img" '
      + 'aria-label="Avatar de Julien">'
      + '<defs>'
        + '<radialGradient id="profBgJ" cx="50%" cy="38%" r="72%">'
          + '<stop offset="0%" stop-color="#48CAE4"/>'
          + '<stop offset="100%" stop-color="#023E8A"/>'
        + '</radialGradient>'
        + '<clipPath id="profClipJ"><circle cx="60" cy="60" r="58"/></clipPath>'
      + '</defs>'
      + '<circle cx="60" cy="60" r="58" fill="url(#profBgJ)" '
      + 'stroke="#012A4A" stroke-width="2"/>'
      + '<g clip-path="url(#profClipJ)">'
        // Trifonction
        + '<path d="M 18 122 L 18 96 Q 32 80 60 78 Q 88 80 102 96 L 102 122 Z" '
        + 'fill="#E63946"/>'
        // Bande accent orange centrale
        + '<path d="M 56 78 L 52 122 L 64 122 L 60 78 Z" fill="#F4A300"/>'
        // Col en V foncé
        + '<path d="M 47 80 L 60 92 L 73 80 L 73 88 L 60 102 L 47 88 Z" '
        + 'fill="#9D0208"/>'
        // Cou
        + '<rect x="52" y="62" width="16" height="14" fill="#F2CFAB"/>'
        // Tête
        + '<circle cx="60" cy="48" r="18" fill="#F2CFAB"/>'
        // Cheveux courts
        + '<path d="M 41 50 Q 42 28 60 28 Q 78 28 79 50 L 77 46 '
        + 'Q 60 38 43 46 Z" fill="#3A2418"/>'
        // Reflet discret sur les cheveux
        + '<path d="M 52 36 Q 60 33 68 36" stroke="#5A3A28" '
        + 'stroke-width="2" fill="none" stroke-linecap="round"/>'
      + '</g>'
      + '</svg>';
  }

  // Personnage Giulia : silhouette stylisée, fond corail, trifonction
  // violette avec accent jaune, cheveux longs avec queue de cheval.
  function svgAvatarGiulia(taille) {
    const t = taille || 96;
    return ''
      + '<svg viewBox="0 0 120 120" width="' + t + '" height="' + t + '" '
      + 'xmlns="http://www.w3.org/2000/svg" role="img" '
      + 'aria-label="Avatar de Giulia">'
      + '<defs>'
        + '<radialGradient id="profBgG" cx="50%" cy="38%" r="72%">'
          + '<stop offset="0%" stop-color="#FFB4A2"/>'
          + '<stop offset="100%" stop-color="#9D0208"/>'
        + '</radialGradient>'
        + '<clipPath id="profClipG"><circle cx="60" cy="60" r="58"/></clipPath>'
      + '</defs>'
      + '<circle cx="60" cy="60" r="58" fill="url(#profBgG)" '
      + 'stroke="#660002" stroke-width="2"/>'
      + '<g clip-path="url(#profClipG)">'
        // Queue de cheval derrière l'épaule
        + '<path d="M 78 52 Q 96 60 96 82 Q 92 96 82 100 L 78 88 '
        + 'Q 86 80 82 68 Z" fill="#5A3825"/>'
        // Trifonction
        + '<path d="M 18 122 L 18 96 Q 32 80 60 78 Q 88 80 102 96 L 102 122 Z" '
        + 'fill="#7A3FF1"/>'
        // Bande accent jaune
        + '<path d="M 56 78 L 52 122 L 64 122 L 60 78 Z" fill="#F4A300"/>'
        // Col en V foncé
        + '<path d="M 47 80 L 60 92 L 73 80 L 73 88 L 60 102 L 47 88 Z" '
        + 'fill="#4C1FA8"/>'
        // Cou
        + '<rect x="52" y="62" width="16" height="14" fill="#F2CFAB"/>'
        // Tête
        + '<circle cx="60" cy="48" r="18" fill="#F2CFAB"/>'
        // Cheveux longs encadrant le visage
        + '<path d="M 38 56 Q 38 24 60 24 Q 82 24 82 56 L 79 50 '
        + 'Q 80 32 60 32 Q 40 32 41 50 Z" fill="#5A3825"/>'
        // Frange légère
        + '<path d="M 46 38 Q 56 34 66 39" stroke="#3A2418" '
        + 'stroke-width="2" fill="none" stroke-linecap="round"/>'
        // Boucle d'oreille discrète
        + '<circle cx="42" cy="54" r="2" fill="#FFD60A"/>'
      + '</g>'
      + '</svg>';
  }

  // Repli simple : disque coloré avec l'initiale du prénom. Sert si
  // l'utilisateur active "Avatar simple" pour un athlète.
  function svgAvatarInitiale(prenom, couleurFond, taille) {
    const t = taille || 96;
    const init = (prenom || '?').charAt(0).toUpperCase();
    return ''
      + '<svg viewBox="0 0 120 120" width="' + t + '" height="' + t + '" '
      + 'xmlns="http://www.w3.org/2000/svg" role="img" '
      + 'aria-label="Avatar simple de ' + echapperHTML(prenom) + '">'
      + '<circle cx="60" cy="60" r="58" fill="' + couleurFond
      + '" stroke="#1A1A1A" stroke-width="2"/>'
      + '<text x="60" y="74" text-anchor="middle" '
      + 'font-family="Helvetica, Arial, sans-serif" '
      + 'font-size="56" font-weight="800" fill="#FFFFFF">'
      + init + '</text>'
      + '</svg>';
  }

  function rendreAvatar(cleAthlete, taille) {
    const prefs = STORAGE.obtenirPreferences();
    const simples = (prefs && prefs.avatarsSimples) || {};
    if (simples[cleAthlete]) {
      const couleur = cleAthlete === 'julien' ? '#023E8A' : '#9D0208';
      const prenom = cleAthlete === 'julien' ? 'Julien' : 'Giulia';
      return svgAvatarInitiale(prenom, couleur, taille);
    }
    return cleAthlete === 'julien'
      ? svgAvatarJulien(taille)
      : svgAvatarGiulia(taille);
  }


  // -------------------- Helpers généraux --------------------

  function echapperHTML(texte) {
    if (texte === null || texte === undefined) return '';
    return String(texte)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function genererId() {
    return 'c_' + Date.now().toString(36)
      + '_' + Math.random().toString(36).slice(2, 8);
  }

  // Accepte "SS", "MM:SS" ou "HH:MM:SS" et renvoie le nombre de
  // secondes. Renvoie null si la chaîne est vide ou invalide.
  function parserTempsEnSecondes(texte) {
    if (!texte) return null;
    const trim = String(texte).trim();
    if (trim === '') return null;
    const parties = trim.split(':').map(function (p) {
      return parseInt(p, 10);
    });
    if (parties.some(function (n) { return isNaN(n) || n < 0; })) {
      return null;
    }
    if (parties.length === 1) return parties[0];
    if (parties.length === 2) return parties[0] * 60 + parties[1];
    if (parties.length === 3) {
      return parties[0] * 3600 + parties[1] * 60 + parties[2];
    }
    return null;
  }

  // Formate un nombre de secondes en MM:SS, ou H:MM:SS au delà de 1h.
  function formaterTempsSelonDuree(secondes) {
    if (typeof secondes !== 'number' || !(secondes > 0)) return '';
    const total = Math.round(secondes);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
      return h + ':' + String(m).padStart(2, '0')
        + ':' + String(s).padStart(2, '0');
    }
    return m + ':' + String(s).padStart(2, '0');
  }


  // -------------------- Rendu général --------------------

  function rendreTout() {
    if (!etat.conteneur) return;
    const athlete = STORAGE.obtenirAthlete(etat.athleteActif);
    const allures = ALLURES.calculerToutesZones(athlete.chronos);
    etat.brouillonIdentite = clonageSimple(athlete.identite);

    etat.conteneur.innerHTML = construireHTML(athlete, allures);
    attacherEvenements();
  }

  function clonageSimple(obj) {
    return obj ? JSON.parse(JSON.stringify(obj)) : null;
  }


  // -------------------- Construction HTML --------------------

  function construireHTML(athlete, allures) {
    return ''
      + '<div class="profils">'
      + construireSelecteur()
      + construireBandeauProfil(athlete)
      + construireBlocIdentite(athlete)
      + construireBlocChronos(athlete)
      + construireBlocFC(athlete)
      + construireBlocTrame(athlete)
      + construireBlocAllures(allures)
      + construireBlocSauvegarde()
      + construireAvertissement()
      + '</div>';
  }

  function construireSelecteur() {
    const actif = etat.athleteActif;
    return ''
      + '<nav class="profils__selecteur" aria-label="Choix du profil">'
      + pastilleAthlete('julien', 'Julien', actif === 'julien')
      + pastilleAthlete('giulia', 'Giulia', actif === 'giulia')
      + '</nav>';
  }

  function pastilleAthlete(cle, prenom, estActif) {
    return ''
      + '<button type="button" class="profils__pastille'
      + (estActif ? ' profils__pastille--actif' : '')
      + '" data-action="basculer-athlete" data-cle="' + cle + '">'
      + '<span class="profils__pastille-avatar">'
      + rendreAvatar(cle, 56)
      + '</span>'
      + '<span class="profils__pastille-nom">' + prenom + '</span>'
      + '</button>';
  }

  function construireBandeauProfil(athlete) {
    const cle = etat.athleteActif;
    const prenom = athlete.identite.prenom || (cle === 'julien' ? 'Julien' : 'Giulia');
    const prefs = STORAGE.obtenirPreferences();
    const simple = !!(prefs.avatarsSimples && prefs.avatarsSimples[cle]);
    return ''
      + '<header class="profils__bandeau">'
      + '<div class="profils__bandeau-avatar">' + rendreAvatar(cle, 128) + '</div>'
      + '<div class="profils__bandeau-info">'
      + '<h2 class="profils__titre">' + echapperHTML(prenom) + '</h2>'
      + '<label class="profils__avatar-simple">'
      + '<input type="checkbox" data-action="avatar-simple"'
      + (simple ? ' checked' : '') + '/> '
      + 'Avatar simple, lettre colorée'
      + '</label>'
      + '</div>'
      + '</header>';
  }

  function construireBlocIdentite(athlete) {
    const id = athlete.identite || {};
    return ''
      + '<section class="profils__section">'
      + '<h3 class="profils__section-titre">Identité</h3>'
      + '<div class="profils__grille">'
      + champ('Taille en cm', 'identite.taille', 'number', id.taille, '170')
      + champ('Poids en kg', 'identite.poids', 'number', id.poids, '65')
      + '</div>'
      + '<label class="profils__champ profils__champ--bloc">'
      + '<span>Note libre</span>'
      + '<textarea data-action="identite-note" rows="2" '
      + 'placeholder="Objectif, ressenti, contraintes...">'
      + echapperHTML(id.note || '') + '</textarea>'
      + '</label>'
      + '</section>';
  }

  function champ(libelle, dataChamp, type, valeur, placeholder) {
    return ''
      + '<label class="profils__champ">'
      + '<span>' + libelle + '</span>'
      + '<input type="' + type + '" data-action="identite" '
      + 'data-champ="' + dataChamp + '" '
      + 'value="' + (valeur === null || valeur === undefined ? '' : valeur) + '" '
      + 'placeholder="' + placeholder + '" />'
      + '</label>';
  }


  // ---- Bloc chronos ----

  function construireBlocChronos(athlete) {
    let html = ''
      + '<section class="profils__section">'
      + '<h3 class="profils__section-titre">Mes chronos de référence</h3>'
      + '<p class="profils__aide">'
      + 'Saisir au moins un chrono par discipline pour calculer les '
      + 'allures. Cocher la case sortie facile pour qu\'un chrono ne '
      + 'serve pas de référence d\'effort.'
      + '</p>';

    for (let i = 0; i < CLES_DISCIPLINES.length; i++) {
      const d = CLES_DISCIPLINES[i];
      html += construireBlocDiscipline(d, athlete.chronos[d] || []);
    }
    html += '</section>';
    return html;
  }

  function construireBlocDiscipline(discipline, chronos) {
    const couleur = couleurDiscipline(discipline);
    let html = ''
      + '<div class="profils__discipline" '
      + 'style="border-left: 6px solid ' + couleur + ';">'
      + '<h4 class="profils__discipline-titre" style="color:' + couleur + ';">'
      + TITRES_DISCIPLINES[discipline] + '</h4>';

    if (chronos.length === 0) {
      html += '<p class="profils__discipline-vide">'
        + 'Aucun chrono saisi pour le moment.</p>';
    } else {
      html += '<ul class="profils__chronos-liste">';
      for (let i = 0; i < chronos.length; i++) {
        html += construireLigneChrono(discipline, chronos[i], i);
      }
      html += '</ul>';
    }

    html += construireFormulaireAjoutChrono(discipline);
    html += '</div>';
    return html;
  }

  function construireLigneChrono(discipline, chrono, index) {
    const tempsAff = formaterTempsSelonDuree(chrono.temps_s);
    const unite = chrono.uniteDistance
      || (discipline === 'natation' ? 'm' : 'km');
    return ''
      + '<li class="profils__chrono" data-index="' + index + '" '
      + 'data-discipline="' + discipline + '">'
      + '<div class="profils__chrono-ligne">'
      + '<strong>' + echapperHTML(chrono.libelle || 'Chrono') + '</strong>'
      + '<span class="profils__chrono-temps">'
      + chrono.distance + ' ' + unite + ' en ' + tempsAff
      + '</span>'
      + '</div>'
      + '<div class="profils__chrono-actions">'
      + '<label class="profils__chrono-toggle">'
      + '<input type="checkbox" data-action="chrono-facile" '
      + 'data-discipline="' + discipline + '" data-index="' + index + '"'
      + (chrono.estReference === false ? ' checked' : '') + '/> '
      + 'Sortie facile, ne pas utiliser pour le calcul des allures'
      + '</label>'
      + '<button type="button" class="profils__supprimer" '
      + 'data-action="supprimer-chrono" '
      + 'data-discipline="' + discipline + '" data-index="' + index + '">'
      + 'Supprimer</button>'
      + '</div>'
      + '</li>';
  }

  function construireFormulaireAjoutChrono(discipline) {
    const uniteDefaut = discipline === 'natation' ? 'm' : 'km';
    const placeholderDist = discipline === 'natation' ? '1500' : '10';
    const placeholderTemps = discipline === 'natation' ? '33:00' : 'MM:SS ou HH:MM:SS';
    return ''
      + '<form class="profils__ajout" data-action="ajouter-chrono" '
      + 'data-discipline="' + discipline + '">'
      + '<div class="profils__ajout-ligne">'
      + '<input type="text" name="libelle" placeholder="Libellé, par exemple 10 km Lausanne" />'
      + '<input type="number" name="distance" step="0.1" min="0" '
      + 'placeholder="' + placeholderDist + '" />'
      + '<select name="unite">'
      + '<option value="m"' + (uniteDefaut === 'm' ? ' selected' : '') + '>m</option>'
      + '<option value="km"' + (uniteDefaut === 'km' ? ' selected' : '') + '>km</option>'
      + '</select>'
      + '<input type="text" name="temps" placeholder="' + placeholderTemps + '" />'
      + '</div>'
      + '<div class="profils__ajout-ligne">'
      + '<label class="profils__ajout-facile">'
      + '<input type="checkbox" name="estFacile"/> '
      + 'Sortie facile, ne pas utiliser pour le calcul des allures'
      + '</label>'
      + '<button type="submit" class="profils__bouton">Ajouter</button>'
      + '</div>'
      + '</form>';
  }


  // ---- Bloc fréquence cardiaque ----

  function construireBlocFC(athlete) {
    const fc = athlete.frequenceCardiaque || {};
    return ''
      + '<section class="profils__section">'
      + '<h3 class="profils__section-titre">'
      + 'Fréquence cardiaque par zone, optionnel'
      + '</h3>'
      + '<p class="profils__aide">'
      + 'Saisie purement manuelle. Laisser vide si inconnu, '
      + 'rien ne sera affiché ni utilisé.'
      + '</p>'
      + '<div class="profils__grille">'
      + champFC('Facile', 'facile', fc.facile)
      + champFC('Endurance', 'endurance', fc.endurance)
      + champFC('Seuil', 'seuil', fc.seuil)
      + champFC('VO2', 'vo2', fc.vo2)
      + '</div>'
      + '</section>';
  }

  function champFC(libelle, cleZone, valeur) {
    return ''
      + '<label class="profils__champ">'
      + '<span>' + libelle + '</span>'
      + '<input type="number" min="30" max="240" '
      + 'data-action="fc" data-zone="' + cleZone + '" '
      + 'value="' + (valeur === null || valeur === undefined ? '' : valeur) + '" '
      + 'placeholder="bpm" />'
      + '</label>';
  }


  // ---- Bloc trame de jours ----

  function construireBlocTrame(athlete) {
    const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi',
                   'Vendredi', 'Samedi', 'Dimanche'];
    const trame = athlete.trameJours || [];
    let html = ''
      + '<section class="profils__section">'
      + '<h3 class="profils__section-titre">'
      + 'Trame des jours d\'entraînement'
      + '</h3>'
      + '<p class="profils__aide">'
      + 'Quatre jours conseillés par semaine. Modifiable à tout moment.'
      + '</p>'
      + '<div class="profils__jours">';
    for (let i = 0; i < jours.length; i++) {
      const coche = trame.indexOf(i) !== -1;
      html += ''
        + '<label class="profils__jour'
        + (coche ? ' profils__jour--actif' : '') + '">'
        + '<input type="checkbox" data-action="jour" data-jour="' + i + '"'
        + (coche ? ' checked' : '') + '/> '
        + jours[i] + '</label>';
    }
    html += '</div></section>';
    return html;
  }


  // ---- Bloc allures calculées ----

  function construireBlocAllures(allures) {
    let html = ''
      + '<section class="profils__section profils__section--allures">'
      + '<h3 class="profils__section-titre">'
      + 'Allures calculées par discipline'
      + '</h3>'
      + '<p class="profils__aide">'
      + 'Toutes les valeurs sont des estimations issues des chronos '
      + 'saisis. Aucune garantie de performance.'
      + '</p>';

    for (let i = 0; i < CLES_DISCIPLINES.length; i++) {
      const d = CLES_DISCIPLINES[i];
      html += construireBlocAlluresDiscipline(d, allures[d]);
    }
    html += '</section>';
    return html;
  }

  function construireBlocAlluresDiscipline(discipline, resultat) {
    const couleur = couleurDiscipline(discipline);
    let html = ''
      + '<div class="profils__allures-discipline" '
      + 'style="border-left: 6px solid ' + couleur + ';">'
      + '<h4 style="color:' + couleur + ';">'
      + TITRES_DISCIPLINES[discipline] + '</h4>';

    if (!resultat || !resultat.estEstimation) {
      html += '<p class="profils__allures-message">'
        + echapperHTML(resultat ? resultat.message : 'Pas de calcul disponible.')
        + '</p></div>';
      return html;
    }

    // Allure visée en compétition
    const ac = resultat.allureCompetition;
    html += ''
      + '<div class="profils__allure-visee">'
      + '<div class="profils__allure-visee-titre">'
      + echapperHTML(ac.libelle) + '</div>'
      + '<div class="profils__allure-visee-valeur">'
      + echapperHTML(ac.affichage) + '</div>'
      + '<div class="profils__allure-visee-temps">'
      + 'Temps total estimé : ' + echapperHTML(ac.tempsTotalEstime)
      + '</div>'
      + '<div class="profils__allure-visee-note">'
      + echapperHTML(ac.note) + '</div>'
      + '</div>';

    // Zones d'entraînement
    html += '<div class="profils__zones">'
      + '<div class="profils__zones-titre">Zones d\'entraînement</div>'
      + '<ul class="profils__zones-liste">';
    for (let i = 0; i < resultat.zonesEntrainement.length; i++) {
      const z = resultat.zonesEntrainement[i];
      html += ''
        + '<li class="profils__zone profils__zone--' + z.cle + '">'
        + '<span class="profils__zone-libelle">' + z.libelle + '</span>'
        + '<span class="profils__zone-valeur">'
        + echapperHTML(z.affichage) + '</span>'
        + '</li>';
    }
    html += '</ul></div>';

    // Fiabilité, message de prudence si moyenne ou faible
    if (resultat.fiabilite) {
      const niveau = resultat.fiabilite.niveau;
      const classe = 'profils__fiabilite profils__fiabilite--' + niveau;
      const libNiveau = niveau === 'elevee'
        ? 'Fiabilité élevée' : (niveau === 'moyenne'
          ? 'Fiabilité moyenne' : 'Fiabilité faible');
      html += '<div class="' + classe + '">'
        + '<strong>' + libNiveau + '.</strong> '
        + echapperHTML(resultat.fiabilite.message)
        + '</div>';
    }

    html += '</div>';
    return html;
  }


  // ---- Bloc sauvegarde et avertissement ----

  function construireBlocSauvegarde() {
    return ''
      + '<section class="profils__section profils__section--sauvegarde">'
      + '<h3 class="profils__section-titre">Sauvegarde des données</h3>'
      + '<p class="profils__aide">'
      + 'Les données sont stockées dans ce navigateur. Exporter '
      + 'régulièrement pour conserver une copie.'
      + '</p>'
      + '<div class="profils__sauvegarde-actions">'
      + '<button type="button" class="profils__bouton" '
      + 'data-action="exporter">Exporter en JSON</button>'
      + '<label class="profils__bouton profils__bouton--secondaire">'
      + 'Importer depuis JSON'
      + '<input type="file" accept="application/json,.json" '
      + 'data-action="importer" hidden/>'
      + '</label>'
      + '<button type="button" class="profils__bouton profils__bouton--danger" '
      + 'data-action="reinitialiser-athlete">'
      + 'Effacer ce profil</button>'
      + '</div>'
      + '</section>';
  }

  function construireAvertissement() {
    const txt = (typeof REFERENCE !== 'undefined' && REFERENCE.avertissementSante)
      ? REFERENCE.avertissementSante
      : 'Cet outil ne remplace pas un avis médical. Consulter un '
        + 'professionnel avant toute montée en charge importante.';
    return ''
      + '<footer class="profils__avertissement" role="note">'
      + '<strong>Avertissement.</strong> ' + echapperHTML(txt)
      + '</footer>';
  }


  // -------------------- Événements --------------------

  function attacherEvenements() {
    const c = etat.conteneur;
    c.addEventListener('click', gererClic);
    c.addEventListener('change', gererChange);
    c.addEventListener('submit', gererSubmit);
    // Sauvegarde au blur pour les inputs identité et FC.
    c.addEventListener('focusout', gererBlur, true);
  }

  function gererClic(e) {
    const action = e.target.getAttribute('data-action')
      || (e.target.closest('[data-action]')
        && e.target.closest('[data-action]').getAttribute('data-action'));
    if (!action) return;

    if (action === 'basculer-athlete') {
      const el = e.target.closest('[data-action]');
      const cle = el.getAttribute('data-cle');
      basculerAthlete(cle);
      return;
    }

    if (action === 'supprimer-chrono') {
      const discipline = e.target.getAttribute('data-discipline');
      const index = parseInt(e.target.getAttribute('data-index'), 10);
      supprimerChrono(discipline, index);
      return;
    }

    if (action === 'exporter') {
      try {
        STORAGE.exporterJSON();
      } catch (err) {
        alert('Export impossible : ' + err.message);
      }
      return;
    }

    if (action === 'reinitialiser-athlete') {
      const cle = etat.athleteActif;
      const prenom = cle === 'julien' ? 'Julien' : 'Giulia';
      if (confirm('Effacer toutes les données de ' + prenom + ' ? '
          + 'Action irréversible.')) {
        STORAGE.reinitialiserAthlete(cle);
        rendreTout();
      }
      return;
    }
  }

  function gererChange(e) {
    const action = e.target.getAttribute('data-action');
    if (!action) return;

    if (action === 'avatar-simple') {
      const prefs = STORAGE.obtenirPreferences();
      if (!prefs.avatarsSimples) prefs.avatarsSimples = {};
      prefs.avatarsSimples[etat.athleteActif] = e.target.checked;
      STORAGE.enregistrerPreferences(prefs);
      rendreTout();
      return;
    }

    if (action === 'chrono-facile') {
      const discipline = e.target.getAttribute('data-discipline');
      const index = parseInt(e.target.getAttribute('data-index'), 10);
      basculerEstReference(discipline, index, !e.target.checked);
      return;
    }

    if (action === 'fc') {
      const zone = e.target.getAttribute('data-zone');
      const valStr = e.target.value.trim();
      const val = valStr === '' ? null : parseInt(valStr, 10);
      modifierFC(zone, isNaN(val) ? null : val);
      return;
    }

    if (action === 'jour') {
      const jour = parseInt(e.target.getAttribute('data-jour'), 10);
      basculerJour(jour, e.target.checked);
      return;
    }

    if (action === 'importer') {
      const fichier = e.target.files && e.target.files[0];
      if (!fichier) return;
      STORAGE.importerJSON(fichier).then(function () {
        const prefs = STORAGE.obtenirPreferences();
        etat.athleteActif = prefs.athleteActif || 'julien';
        rendreTout();
        alert('Importation réussie.');
      }).catch(function (err) {
        alert('Importation échouée : ' + err.message);
      });
      return;
    }
  }

  function gererSubmit(e) {
    const action = e.target.getAttribute('data-action');
    if (action !== 'ajouter-chrono') return;
    e.preventDefault();
    const discipline = e.target.getAttribute('data-discipline');
    const form = e.target;

    const libelle = form.elements['libelle'].value.trim();
    const distance = parseFloat(form.elements['distance'].value);
    const unite = form.elements['unite'].value;
    const tempsTexte = form.elements['temps'].value;
    const temps_s = parserTempsEnSecondes(tempsTexte);
    const estFacile = !!form.elements['estFacile'].checked;

    if (!(distance > 0) || !(temps_s > 0)) {
      alert('Distance et temps requis pour ajouter un chrono. '
        + 'Format temps accepté : SS, MM:SS ou HH:MM:SS.');
      return;
    }
    ajouterChrono(discipline, {
      id: genererId(),
      libelle: libelle || 'Chrono',
      distance: distance,
      uniteDistance: unite,
      temps_s: temps_s,
      date: '',
      estReference: !estFacile,
    });
  }

  function gererBlur(e) {
    const action = e.target.getAttribute('data-action');
    if (!action) return;

    if (action === 'identite') {
      const champ = e.target.getAttribute('data-champ');
      const valStr = e.target.value.trim();
      let val;
      if (champ === 'identite.taille' || champ === 'identite.poids') {
        val = valStr === '' ? null : parseFloat(valStr);
        if (isNaN(val)) val = null;
      } else {
        val = valStr;
      }
      modifierIdentite(champ.split('.')[1], val);
      return;
    }

    if (action === 'identite-note') {
      modifierIdentite('note', e.target.value);
      return;
    }
  }


  // -------------------- Mutations --------------------

  function basculerAthlete(cle) {
    if (cle !== 'julien' && cle !== 'giulia') return;
    etat.athleteActif = cle;
    const prefs = STORAGE.obtenirPreferences();
    prefs.athleteActif = cle;
    STORAGE.enregistrerPreferences(prefs);
    rendreTout();
  }

  function modifierIdentite(champ, valeur) {
    const athlete = STORAGE.obtenirAthlete(etat.athleteActif);
    if (!athlete.identite) athlete.identite = {};
    athlete.identite[champ] = valeur;
    STORAGE.enregistrerAthlete(etat.athleteActif, athlete);
    // Pas de rendreTout, on ne perturbe pas le focus utilisateur.
  }

  function modifierFC(zone, valeur) {
    const athlete = STORAGE.obtenirAthlete(etat.athleteActif);
    if (!athlete.frequenceCardiaque) athlete.frequenceCardiaque = {};
    athlete.frequenceCardiaque[zone] = valeur;
    STORAGE.enregistrerAthlete(etat.athleteActif, athlete);
  }

  function basculerJour(jour, present) {
    const athlete = STORAGE.obtenirAthlete(etat.athleteActif);
    const trame = athlete.trameJours || [];
    const idx = trame.indexOf(jour);
    if (present && idx === -1) trame.push(jour);
    if (!present && idx !== -1) trame.splice(idx, 1);
    trame.sort(function (a, b) { return a - b; });
    athlete.trameJours = trame;
    STORAGE.enregistrerAthlete(etat.athleteActif, athlete);
    rendreTout();
  }

  function ajouterChrono(discipline, chrono) {
    const athlete = STORAGE.obtenirAthlete(etat.athleteActif);
    if (!athlete.chronos[discipline]) athlete.chronos[discipline] = [];
    athlete.chronos[discipline].push(chrono);
    STORAGE.enregistrerAthlete(etat.athleteActif, athlete);
    rendreTout();
  }

  function supprimerChrono(discipline, index) {
    const athlete = STORAGE.obtenirAthlete(etat.athleteActif);
    if (!athlete.chronos[discipline]) return;
    athlete.chronos[discipline].splice(index, 1);
    STORAGE.enregistrerAthlete(etat.athleteActif, athlete);
    rendreTout();
  }

  function basculerEstReference(discipline, index, valeur) {
    const athlete = STORAGE.obtenirAthlete(etat.athleteActif);
    if (!athlete.chronos[discipline]
        || !athlete.chronos[discipline][index]) return;
    athlete.chronos[discipline][index].estReference = !!valeur;
    STORAGE.enregistrerAthlete(etat.athleteActif, athlete);
    rendreTout();
  }


  // -------------------- Initialisation --------------------

  function initialiser(conteneur) {
    if (!conteneur) {
      console.warn('PROFILS.initialiser : aucun conteneur fourni.');
      return;
    }
    injecterStyleMinimal();
    etat.conteneur = conteneur;
    const prefs = STORAGE.obtenirPreferences();
    etat.athleteActif = (prefs && prefs.athleteActif) || 'julien';
    rendreTout();
  }

  // Style provisoire injecté UNIQUEMENT si styles.css n'est pas chargé.
  // On détecte la présence de styles.css via une variable CSS spécifique
  // (--fond-base). Si elle existe, on laisse styles.css piloter le rendu
  // et on n'injecte rien.
  function injecterStyleMinimal() {
    const stylesPresent = getComputedStyle(document.documentElement)
      .getPropertyValue('--fond-base').trim();
    if (stylesPresent) return;
    if (document.getElementById('profils-style-temporaire')) return;
    const css = ''
      + '.profils{max-width:760px;margin:0 auto;padding:12px;'
      + 'font-family:Helvetica,Arial,sans-serif;color:#1A1A1A;}'
      + '.profils__selecteur{display:flex;gap:12px;'
      + 'justify-content:center;margin:8px 0 16px;}'
      + '.profils__pastille{display:flex;flex-direction:column;'
      + 'align-items:center;gap:6px;border:none;background:transparent;'
      + 'cursor:pointer;padding:6px;border-radius:14px;'
      + 'transition:transform .15s ease, background .15s ease;}'
      + '.profils__pastille:hover{transform:translateY(-2px);}'
      + '.profils__pastille--actif{background:#F1F3F5;'
      + 'box-shadow:0 0 0 3px #1A1A1A inset;}'
      + '.profils__pastille-nom{font-weight:700;font-size:14px;}'
      + '.profils__bandeau{display:flex;gap:16px;align-items:center;'
      + 'background:#F7F9FB;padding:14px;border-radius:14px;'
      + 'margin-bottom:16px;}'
      + '.profils__titre{margin:0 0 6px;font-size:28px;'
      + 'letter-spacing:0.5px;}'
      + '.profils__avatar-simple{font-size:14px;color:#444;'
      + 'display:inline-flex;align-items:center;gap:6px;}'
      + '.profils__section{background:#FFFFFF;border:1px solid #E6EAEE;'
      + 'border-radius:14px;padding:14px;margin-bottom:14px;}'
      + '.profils__section-titre{margin:0 0 8px;font-size:18px;'
      + 'text-transform:uppercase;letter-spacing:1px;}'
      + '.profils__aide{font-size:14px;color:#555;margin:0 0 12px;}'
      + '.profils__grille{display:grid;'
      + 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr));'
      + 'gap:10px;}'
      + '.profils__champ{display:flex;flex-direction:column;gap:4px;'
      + 'font-size:14px;}'
      + '.profils__champ--bloc{margin-top:10px;}'
      + '.profils__champ input,.profils__champ textarea{'
      + 'padding:10px;border:1px solid #CCD2D8;border-radius:10px;'
      + 'font-size:16px;}'
      + '.profils__discipline{padding:10px 12px;margin:10px 0;'
      + 'background:#FAFBFC;border-radius:10px;}'
      + '.profils__discipline-titre{margin:0 0 6px;'
      + 'letter-spacing:0.5px;}'
      + '.profils__chronos-liste{list-style:none;padding:0;margin:0 0 8px;}'
      + '.profils__chrono{padding:8px 10px;margin:6px 0;'
      + 'background:#FFFFFF;border:1px solid #E6EAEE;border-radius:10px;}'
      + '.profils__chrono-ligne{display:flex;justify-content:space-between;'
      + 'gap:8px;flex-wrap:wrap;margin-bottom:4px;}'
      + '.profils__chrono-temps{color:#555;}'
      + '.profils__chrono-actions{display:flex;justify-content:space-between;'
      + 'gap:8px;flex-wrap:wrap;font-size:13px;color:#444;}'
      + '.profils__chrono-toggle{display:inline-flex;align-items:center;'
      + 'gap:6px;}'
      + '.profils__supprimer{background:#FFE5E7;color:#9D0208;'
      + 'border:none;padding:6px 10px;border-radius:8px;cursor:pointer;}'
      + '.profils__ajout-ligne{display:flex;gap:6px;flex-wrap:wrap;'
      + 'margin-top:6px;}'
      + '.profils__ajout-ligne input,.profils__ajout-ligne select{'
      + 'padding:10px;border:1px solid #CCD2D8;border-radius:10px;'
      + 'font-size:15px;flex:1 1 auto;min-width:90px;}'
      + '.profils__bouton{background:#1A1A1A;color:#FFFFFF;border:none;'
      + 'padding:12px 16px;border-radius:10px;cursor:pointer;'
      + 'font-weight:700;}'
      + '.profils__bouton--secondaire{background:#F1F3F5;color:#1A1A1A;'
      + 'display:inline-flex;align-items:center;cursor:pointer;}'
      + '.profils__bouton--danger{background:#9D0208;}'
      + '.profils__jours{display:flex;flex-wrap:wrap;gap:8px;}'
      + '.profils__jour{padding:8px 12px;border:1px solid #CCD2D8;'
      + 'border-radius:999px;display:inline-flex;align-items:center;'
      + 'gap:6px;cursor:pointer;background:#FFFFFF;}'
      + '.profils__jour--actif{background:#1A1A1A;color:#FFFFFF;'
      + 'border-color:#1A1A1A;}'
      + '.profils__allures-discipline{padding:10px 12px;margin:10px 0;'
      + 'background:#FAFBFC;border-radius:10px;}'
      + '.profils__allure-visee{background:#FFFFFF;padding:10px;'
      + 'border-radius:10px;border:1px solid #E6EAEE;margin-bottom:8px;}'
      + '.profils__allure-visee-titre{font-size:13px;'
      + 'text-transform:uppercase;letter-spacing:1px;color:#666;}'
      + '.profils__allure-visee-valeur{font-size:26px;font-weight:800;'
      + 'margin:4px 0;}'
      + '.profils__allure-visee-temps{font-size:14px;color:#444;}'
      + '.profils__allure-visee-note{font-size:12px;color:#777;'
      + 'margin-top:4px;}'
      + '.profils__zones-titre{font-size:13px;text-transform:uppercase;'
      + 'letter-spacing:1px;color:#666;margin-bottom:4px;}'
      + '.profils__zones-liste{list-style:none;padding:0;margin:0;'
      + 'display:grid;grid-template-columns:repeat(2,1fr);gap:6px;}'
      + '.profils__zone{display:flex;justify-content:space-between;'
      + 'padding:8px 10px;background:#FFFFFF;border:1px solid #E6EAEE;'
      + 'border-radius:8px;font-size:15px;}'
      + '.profils__zone-libelle{font-weight:700;}'
      + '.profils__fiabilite{margin-top:8px;padding:8px 10px;'
      + 'border-radius:8px;font-size:13px;}'
      + '.profils__fiabilite--elevee{background:#E8F5E9;color:#1B5E20;}'
      + '.profils__fiabilite--moyenne{background:#FFF8E1;color:#7A4F01;}'
      + '.profils__fiabilite--faible{background:#FFE5E7;color:#9D0208;}'
      + '.profils__sauvegarde-actions{display:flex;gap:8px;flex-wrap:wrap;}'
      + '.profils__avertissement{background:#FFF4E5;border:1px solid #FFB75D;'
      + 'padding:12px;border-radius:10px;margin-top:12px;font-size:14px;'
      + 'color:#4A2E00;}'
      + '@media (max-width:520px){'
      + '.profils__zones-liste{grid-template-columns:1fr;}'
      + '.profils__bandeau{flex-direction:column;text-align:center;}'
      + '}';
    const balise = document.createElement('style');
    balise.id = 'profils-style-temporaire';
    balise.textContent = css;
    document.head.appendChild(balise);
  }


  // -------------------- Auto initialisation pour preview --------------------

  // Tant que app.js n'orchestre pas, on monte l'interface profils
  // dans #contenu pour permettre le rendu en preview. Si app.js veut
  // prendre la main, il peut poser window.PROFILS_AUTO_INIT = false
  // avant le chargement, ou simplement appeler PROFILS.initialiser
  // après avoir mis sa propre interface dans le conteneur.
  document.addEventListener('DOMContentLoaded', function () {
    if (window.PROFILS_AUTO_INIT === false) return;
    const conteneur = document.getElementById('contenu');
    if (conteneur && conteneur.children.length === 0) {
      PROFILS.initialiser(conteneur);
    }
  });


  // -------------------- Interface publique --------------------

  return {
    initialiser: initialiser,
    basculerAthlete: basculerAthlete,
    obtenirAthleteActif: function () { return etat.athleteActif; },
    rendreAvatar: rendreAvatar,
    // utilitaires exposés pour test ou ré utilisation
    svgAvatarJulien: svgAvatarJulien,
    svgAvatarGiulia: svgAvatarGiulia,
    svgAvatarInitiale: svgAvatarInitiale,
  };

})();
