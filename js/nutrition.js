/*
 * nutrition.js
 * Module nutrition et compléments, à périmètre strictement informatif.
 *
 * Ce que ce module FAIT :
 *   - Affiche un avertissement santé clair, en évidence, en haut.
 *   - Affiche les repères généraux définis dans REFERENCE.nutrition.
 *   - Permet à l'utilisateur de créer ses propres rappels visuels
 *     (libellé qu'il choisit lui même), et de cocher chaque jour.
 *   - Persiste les rappels et l'historique des cases via STORAGE.
 *
 * Ce que ce module NE FAIT JAMAIS :
 *   - Aucun calcul de dosage personnalisé.
 *   - Aucune quantité présentée comme une prescription.
 *   - Aucun calcul fondé sur le poids, le profil ou les séances.
 *   - Aucune notification système, aucune Notification API.
 *   - Aucune affirmation de garantie sur l'effet d'un complément.
 *   - Aucune incitation à consommer un produit.
 *
 * Le contenu des repères vient de REFERENCE.nutrition.reperes et reste
 * général et qualitatif. Le module se contente de l'afficher.
 */

// Tant qu'app.js n'orchestre pas la navigation entre onglets, on
// désactive les auto initialisations des autres modules pour que
// nutrition.js prenne la place dans #contenu en preview.
window.PROFILS_AUTO_INIT = false;
window.SEANCES_AUTO_INIT = false;
window.PROGRESSION_AUTO_INIT = false;

const NUTRITION = (function () {

  // -------------------- État local --------------------

  let etat = {
    conteneur: null,
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

  function genererId() {
    return 'rap_' + Date.now().toString(36)
      + '_' + Math.random().toString(36).slice(2, 8);
  }

  // Renvoie la date du jour au format AAAA_MM_JJ, cohérent avec le
  // format de l'historique stocké via STORAGE.
  function clefAujourdhui() {
    const d = new Date();
    const aaaa = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const jj = String(d.getDate()).padStart(2, '0');
    return aaaa + '_' + mm + '_' + jj;
  }

  function dateAffichage() {
    const noms = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi',
                  'samedi', 'dimanche'];
    const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                  'juillet', 'août', 'septembre', 'octobre',
                  'novembre', 'décembre'];
    const d = new Date();
    const jourSem = (d.getDay() + 6) % 7;
    return noms[jourSem] + ' ' + d.getDate() + ' ' + mois[d.getMonth()];
  }


  // -------------------- Lecture et écriture nutrition --------------------

  function obtenirNutrition() {
    const n = STORAGE.obtenirNutrition() || {};
    if (!Array.isArray(n.rappels)) n.rappels = [];
    if (!n.historique || typeof n.historique !== 'object') {
      n.historique = {};
    }
    return n;
  }

  function enregistrerNutrition(n) {
    STORAGE.enregistrerNutrition(n);
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
    return ''
      + '<div class="nutrition">'
      + construireAvertissement()
      + construireRappelsJour()
      + construireGestionRappels()
      + construireReperes()
      + '</div>';
  }


  // -------- Avertissement santé, immédiatement visible en haut --------

  function construireAvertissement() {
    const txt = (typeof REFERENCE !== 'undefined'
      && REFERENCE.nutrition
      && REFERENCE.nutrition.avertissement)
      ? REFERENCE.nutrition.avertissement
      : 'Information générale, ne remplace pas l\'avis d\'un '
        + 'médecin ou d\'un nutritionniste.';
    return ''
      + '<aside class="nutrition__avertissement" role="alert">'
      + '<div class="nutrition__avertissement-pictogramme">'
      + svgIconeAvertissement()
      + '</div>'
      + '<div class="nutrition__avertissement-corps">'
      + '<div class="nutrition__avertissement-titre">'
      + 'Information générale uniquement'
      + '</div>'
      + '<p class="nutrition__avertissement-texte">'
      + echapperHTML(txt)
      + '</p>'
      + '</div>'
      + '</aside>';
  }

  function svgIconeAvertissement() {
    return ''
      + '<svg viewBox="0 0 24 24" width="36" height="36" '
      + 'aria-hidden="true">'
      + '<path d="M12 2 L22 20 L2 20 Z" fill="none" '
      + 'stroke="#FBBF24" stroke-width="2" stroke-linejoin="round"/>'
      + '<rect x="11" y="9" width="2" height="6" fill="#FBBF24"/>'
      + '<rect x="11" y="16.5" width="2" height="2" fill="#FBBF24"/>'
      + '</svg>';
  }


  // -------- Rappels du jour, cases à cocher --------

  function construireRappelsJour() {
    const n = obtenirNutrition();
    const jour = clefAujourdhui();
    const etatsDuJour = n.historique[jour] || {};

    let html = ''
      + '<section class="nutrition__section nutrition__section--jour">'
      + '<div class="nutrition__section-entete">'
      + '<h3 class="nutrition__section-titre">Rappels du jour</h3>'
      + '<span class="nutrition__date-jour">'
      + dateAffichage() + '</span>'
      + '</div>';

    if (n.rappels.length === 0) {
      html += '<p class="nutrition__vide">'
        + 'Aucun rappel suivi pour l\'instant. Ajouter ce que tu '
        + 'souhaites suivre dans la section de gestion ci dessous.'
        + '</p>';
    } else {
      html += '<ul class="nutrition__rappels-liste">';
      for (let i = 0; i < n.rappels.length; i++) {
        const r = n.rappels[i];
        const coche = !!etatsDuJour[r.id];
        html += ''
          + '<li class="nutrition__rappel'
          + (coche ? ' nutrition__rappel--coche' : '') + '">'
          + '<label class="nutrition__rappel-label">'
          + '<input type="checkbox" '
          + 'data-action="case-jour" '
          + 'data-rappel="' + echapperHTML(r.id) + '"'
          + (coche ? ' checked' : '') + '/>'
          + '<div class="nutrition__rappel-info">'
          + '<span class="nutrition__rappel-libelle">'
          + echapperHTML(r.libelle) + '</span>'
          + (r.note
              ? '<span class="nutrition__rappel-note">'
                + echapperHTML(r.note) + '</span>'
              : '')
          + '</div>'
          + '</label>'
          + '</li>';
      }
      html += '</ul>'
        + '<p class="nutrition__rappel-aide">'
        + 'Liste des rappels que tu as choisis de suivre. '
        + 'Aucune obligation, aucun jugement.'
        + '</p>';
    }

    html += '</section>';
    return html;
  }


  // -------- Gestion des rappels, ajout et suppression --------

  function construireGestionRappels() {
    const n = obtenirNutrition();
    const reperes = (typeof REFERENCE !== 'undefined'
      && REFERENCE.nutrition && REFERENCE.nutrition.reperes)
      ? REFERENCE.nutrition.reperes : [];

    let optionsSuggestion = '<option value="">'
      + 'Choisir une suggestion ou laisser vide</option>';
    for (let i = 0; i < reperes.length; i++) {
      optionsSuggestion += '<option value="'
        + echapperHTML(reperes[i].libelle) + '">'
        + echapperHTML(reperes[i].libelle)
        + '</option>';
    }

    let html = ''
      + '<section class="nutrition__section">'
      + '<h3 class="nutrition__section-titre">Gérer mes rappels</h3>'
      + '<p class="nutrition__aide">'
      + 'Choisir ce que tu souhaites suivre. Tu peux reprendre une '
      + 'suggestion ou saisir un libellé de ton choix. '
      + 'Aucun dosage n\'est proposé ni stocké.'
      + '</p>'
      + '<form class="nutrition__ajout" data-action="ajouter-rappel">'
      + '<label class="nutrition__champ">'
      + '<span>Suggestion</span>'
      + '<select name="suggestion">' + optionsSuggestion + '</select>'
      + '</label>'
      + '<label class="nutrition__champ">'
      + '<span>Libellé personnalisé</span>'
      + '<input type="text" name="libelle" '
      + 'placeholder="Par exemple, magnésium du soir" '
      + 'maxlength="60"/>'
      + '</label>'
      + '<label class="nutrition__champ">'
      + '<span>Note libre, facultatif</span>'
      + '<input type="text" name="note" '
      + 'placeholder="Contexte, moment habituel" maxlength="80"/>'
      + '</label>'
      + '<button type="submit" class="nutrition__bouton">'
      + 'Ajouter ce rappel</button>'
      + '</form>';

    if (n.rappels.length > 0) {
      html += '<ul class="nutrition__gestion-liste">';
      for (let i = 0; i < n.rappels.length; i++) {
        const r = n.rappels[i];
        html += ''
          + '<li class="nutrition__gestion-ligne">'
          + '<div class="nutrition__gestion-info">'
          + '<strong>' + echapperHTML(r.libelle) + '</strong>'
          + (r.note
              ? '<span>' + echapperHTML(r.note) + '</span>'
              : '')
          + '</div>'
          + '<button type="button" class="nutrition__supprimer" '
          + 'data-action="supprimer-rappel" '
          + 'data-id="' + echapperHTML(r.id) + '">Retirer</button>'
          + '</li>';
      }
      html += '</ul>';
    }

    html += '</section>';
    return html;
  }


  // -------- Repères généraux, contenu informatif --------

  function construireReperes() {
    const reperes = (typeof REFERENCE !== 'undefined'
      && REFERENCE.nutrition && REFERENCE.nutrition.reperes)
      ? REFERENCE.nutrition.reperes : [];

    if (reperes.length === 0) {
      return ''
        + '<section class="nutrition__section">'
        + '<h3 class="nutrition__section-titre">'
        + 'Repères généraux</h3>'
        + '<p class="nutrition__vide">'
        + 'Aucun repère disponible.</p>'
        + '</section>';
    }

    let html = ''
      + '<section class="nutrition__section">'
      + '<h3 class="nutrition__section-titre">Repères généraux</h3>'
      + '<p class="nutrition__aide">'
      + 'Principes d\'usage généraux pour le sport d\'endurance. '
      + 'Aucun dosage personnalisé n\'est fourni. Pour toute prise '
      + 'régulière, l\'avis d\'un professionnel de santé reste la '
      + 'référence.'
      + '</p>'
      + '<div class="nutrition__reperes">';

    for (let i = 0; i < reperes.length; i++) {
      const r = reperes[i];
      html += ''
        + '<article class="nutrition__repere">'
        + '<h4 class="nutrition__repere-titre">'
        + echapperHTML(r.libelle) + '</h4>'
        + blocRepereChamp('À quoi cela sert', r.usage)
        + blocRepereChamp('Moment habituel', r.moment)
        + blocRepereChamp('Remarque', r.remarque)
        + '</article>';
    }
    html += '</div></section>';
    return html;
  }

  function blocRepereChamp(libelle, valeur) {
    if (!valeur) return '';
    return ''
      + '<div class="nutrition__repere-bloc">'
      + '<div class="nutrition__repere-libelle">'
      + libelle + '</div>'
      + '<p class="nutrition__repere-texte">'
      + echapperHTML(valeur) + '</p>'
      + '</div>';
  }


  // -------------------- Événements --------------------

  function attacherEvenements() {
    const c = etat.conteneur;
    c.addEventListener('click', gererClic);
    c.addEventListener('change', gererChange);
    c.addEventListener('submit', gererSubmit);
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
    if (action === 'supprimer-rappel') {
      const id = el.getAttribute('data-id');
      if (id && confirm('Retirer ce rappel ?')) {
        supprimerRappel(id);
      }
    }
  }

  function gererChange(e) {
    if (!e.target.getAttribute) return;
    const action = e.target.getAttribute('data-action');
    if (action === 'case-jour') {
      const id = e.target.getAttribute('data-rappel');
      basculerCaseJour(id, e.target.checked);
    }
  }

  function gererSubmit(e) {
    if (!e.target.getAttribute) return;
    if (e.target.getAttribute('data-action') !== 'ajouter-rappel') return;
    e.preventDefault();
    const form = e.target;
    const suggestion = (form.elements['suggestion'].value || '').trim();
    const libelleSaisi = (form.elements['libelle'].value || '').trim();
    const note = (form.elements['note'].value || '').trim();
    const libelle = libelleSaisi || suggestion;
    if (!libelle) {
      alert('Saisir un libellé ou choisir une suggestion.');
      return;
    }
    ajouterRappel(libelle, note);
  }


  // -------------------- Mutations --------------------

  function ajouterRappel(libelle, note) {
    const n = obtenirNutrition();
    n.rappels.push({
      id: genererId(),
      libelle: libelle,
      note: note || '',
    });
    enregistrerNutrition(n);
    rendre();
  }

  function supprimerRappel(id) {
    const n = obtenirNutrition();
    n.rappels = n.rappels.filter(function (r) { return r.id !== id; });
    // On garde l'historique : il témoigne de ce qui a été coché, mais
    // les libellés disparus n'apparaîtront plus à l'écran.
    enregistrerNutrition(n);
    rendre();
  }

  function basculerCaseJour(idRappel, coche) {
    const n = obtenirNutrition();
    const jour = clefAujourdhui();
    if (!n.historique[jour]) n.historique[jour] = {};
    if (coche) {
      n.historique[jour][idRappel] = true;
    } else {
      delete n.historique[jour][idRappel];
      if (Object.keys(n.historique[jour]).length === 0) {
        delete n.historique[jour];
      }
    }
    enregistrerNutrition(n);
    // Re render pour refléter la classe coche.
    rendre();
  }


  // -------------------- Initialisation --------------------

  function initialiser(conteneur) {
    if (!conteneur) return;
    etat.conteneur = conteneur;
    rendre();
  }


  // -------------------- Auto initialisation pour preview --------------------

  document.addEventListener('DOMContentLoaded', function () {
    if (window.NUTRITION_AUTO_INIT === false) return;
    const conteneur = document.getElementById('contenu');
    if (conteneur && conteneur.children.length === 0) {
      NUTRITION.initialiser(conteneur);
    }
  });


  // -------------------- Interface publique --------------------

  return {
    initialiser: initialiser,
    ajouterRappel: ajouterRappel,
    supprimerRappel: supprimerRappel,
    basculerCaseJour: basculerCaseJour,
  };

})();
