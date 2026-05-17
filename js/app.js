/*
 * app.js
 * Point d'entrée de l'application. Chargé en dernier.
 *
 * Rôle :
 *   - Construit l'entête (titre, compte à rebours vers le 30 août 2026)
 *     et la barre de navigation à quatre onglets.
 *   - Désactive proprement les auto initialisations temporaires des
 *     autres modules pour devenir le seul responsable du montage.
 *   - Conserve l'onglet actif dans les préférences (via STORAGE).
 *   - Au premier lancement (aucun chrono saisi), force l'onglet profil
 *     pour guider clairement l'utilisateur vers la saisie initiale.
 *
 * Garde fous :
 *   - Aucune donnée d'entraînement fabriquée ici. app.js ne fait
 *     qu'orchestrer.
 *   - Aucune garantie de résultat affichée.
 *   - Aucun trait d'union dans les libellés affichables.
 */

// Désactivation explicite des auto initialisations temporaires des
// autres modules. Doit être exécuté AVANT le DOMContentLoaded pour
// que les écouteurs des modules voient les drapeaux en place et
// n'auto initialisent rien. app.js étant chargé en dernier dans
// index.html, son code de top niveau s'exécute après ceux des autres,
// mais toujours avant que DOMContentLoaded ne se déclenche.
window.PROFILS_AUTO_INIT = false;
window.SEANCES_AUTO_INIT = false;
window.PROGRESSION_AUTO_INIT = false;
window.NUTRITION_AUTO_INIT = false;

const APP = (function () {

  // -------------------- Constantes --------------------

  const DATE_COURSE = '2026-08-30';

  // Définition des quatre onglets. La clé sert d'identifiant interne.
  const ONGLETS = [
    { cle: 'profils',    libelle: 'Profil'     },
    { cle: 'seances',    libelle: 'Plan'       },
    { cle: 'progression',libelle: 'Suivi'      },
    { cle: 'nutrition',  libelle: 'Nutrition'  },
  ];

  // Résout le module global associé à un onglet. On ne passe pas par
  // window[...] car les modules sont déclarés avec const, ce qui ne
  // crée pas de propriété sur l'objet global. On référence donc les
  // bindings directement, en se protégeant si un module manquait.
  function obtenirModule(cle) {
    try {
      if (cle === 'profils'    && typeof PROFILS    !== 'undefined') return PROFILS;
      if (cle === 'seances'    && typeof SEANCES    !== 'undefined') return SEANCES;
      if (cle === 'progression'&& typeof PROGRESSION!== 'undefined') return PROGRESSION;
      if (cle === 'nutrition'  && typeof NUTRITION  !== 'undefined') return NUTRITION;
    } catch (e) {
      // ReferenceError si le module n'est pas chargé.
    }
    return null;
  }

  let etat = {
    ongletActif: 'profils',
    initialise: false,
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

  function joursAvantCourse() {
    const auj = new Date();
    auj.setHours(0, 0, 0, 0);
    const course = new Date(DATE_COURSE + 'T00:00:00');
    const diff = Math.ceil((course.getTime() - auj.getTime()) / 86400000);
    return Math.max(0, diff);
  }

  // Renvoie true si aucun chrono n'a encore été saisi pour aucun des
  // deux athlètes. Sert à détecter un premier lancement et à orienter
  // le démarrage vers l'onglet profil.
  function aucunChronoSaisi() {
    try {
      const julien = STORAGE.obtenirAthlete('julien');
      const giulia = STORAGE.obtenirAthlete('giulia');
      const nbChronos = function (a) {
        if (!a || !a.chronos) return 0;
        return (a.chronos.natation || []).length
          + (a.chronos.velo || []).length
          + (a.chronos.course || []).length;
      };
      return nbChronos(julien) === 0 && nbChronos(giulia) === 0;
    } catch (e) {
      return true;
    }
  }


  // -------------------- Icônes SVG des onglets --------------------

  function iconeOnglet(cle) {
    if (cle === 'profils') {
      return ''
        + '<svg viewBox="0 0 24 24" width="22" height="22" '
        + 'fill="currentColor" aria-hidden="true">'
        + '<circle cx="12" cy="8" r="4"/>'
        + '<path d="M4 21 C4 16 7.5 14 12 14 C16.5 14 20 16 20 21 Z"/>'
        + '</svg>';
    }
    if (cle === 'seances') {
      return ''
        + '<svg viewBox="0 0 24 24" width="22" height="22" '
        + 'fill="none" stroke="currentColor" stroke-width="2" '
        + 'aria-hidden="true">'
        + '<rect x="3" y="5" width="18" height="16" rx="2"/>'
        + '<line x1="3" y1="10" x2="21" y2="10"/>'
        + '<line x1="8" y1="3" x2="8" y2="7"/>'
        + '<line x1="16" y1="3" x2="16" y2="7"/>'
        + '<circle cx="8" cy="15" r="1.5" fill="currentColor"/>'
        + '<circle cx="14" cy="15" r="1.5" fill="currentColor"/>'
        + '</svg>';
    }
    if (cle === 'progression') {
      return ''
        + '<svg viewBox="0 0 24 24" width="22" height="22" '
        + 'fill="currentColor" aria-hidden="true">'
        + '<rect x="3"  y="13" width="4" height="8" rx="1"/>'
        + '<rect x="10" y="8"  width="4" height="13" rx="1"/>'
        + '<rect x="17" y="3"  width="4" height="18" rx="1"/>'
        + '</svg>';
    }
    if (cle === 'nutrition') {
      return ''
        + '<svg viewBox="0 0 24 24" width="22" height="22" '
        + 'fill="none" stroke="currentColor" stroke-width="2" '
        + 'stroke-linejoin="round" aria-hidden="true">'
        + '<path d="M12 7 C8 7 5 10 5 14 C5 18 8 21 12 21 '
        +   'C16 21 19 18 19 14 C19 10 16 7 12 7 Z"/>'
        + '<path d="M12 7 Q12 4 14 3" stroke-linecap="round"/>'
        + '<path d="M10 11 Q12 13 14 11" stroke-linecap="round"/>'
        + '</svg>';
    }
    return '';
  }


  // -------------------- Rendu de l'entête --------------------

  function rendreEntete() {
    const entete = document.getElementById('entete');
    if (!entete) return;
    const jours = joursAvantCourse();

    let html = ''
      + '<div class="app__entete">'
      +   '<div class="app__entete-gauche">'
      +     '<h1 class="app__entete-titre">Triathlon Lausanne</h1>'
      +     '<div class="app__entete-sous">Olympic, 30 août 2026</div>'
      +   '</div>'
      +   '<div class="app__entete-compteur">'
      +     '<span>Avant la course</span>'
      +     '<strong>' + jours + '</strong>'
      +     '<span>' + (jours <= 1 ? 'jour' : 'jours') + '</span>'
      +   '</div>'
      + '</div>';

    if (aucunChronoSaisi()) {
      html += '<div class="app__bandeau-onboarding">'
        + 'Saisir au moins un chrono dans le profil pour activer '
        + 'les allures cibles dans le reste de l\'application.'
        + '</div>';
    }

    entete.innerHTML = html;
  }


  // -------------------- Rendu de la navigation --------------------

  function rendreNav() {
    const navigation = document.getElementById('navigation');
    if (!navigation) return;

    let html = '<div class="app__nav" role="tablist">';
    for (let i = 0; i < ONGLETS.length; i++) {
      const o = ONGLETS[i];
      const actif = (o.cle === etat.ongletActif);
      html += ''
        + '<button type="button" '
        +   'class="app__nav-item'
        +     (actif ? ' app__nav-item--actif' : '') + '" '
        +   'role="tab" '
        +   'aria-selected="' + (actif ? 'true' : 'false') + '" '
        +   'data-onglet="' + o.cle + '">'
        +   iconeOnglet(o.cle)
        +   '<span>' + echapperHTML(o.libelle) + '</span>'
        + '</button>';
    }
    html += '</div>';
    navigation.innerHTML = html;

    const racine = navigation.querySelector('.app__nav');
    if (racine) {
      racine.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-onglet]');
        if (btn) basculerOnglet(btn.getAttribute('data-onglet'));
      });
    }
  }


  // -------------------- Bascule d'onglet --------------------

  function basculerOnglet(cle) {
    const onglet = ONGLETS.find(function (o) { return o.cle === cle; });
    if (!onglet) return;

    etat.ongletActif = cle;

    // Persister l'onglet courant pour qu'il soit retrouvé à la
    // prochaine ouverture, sauf au premier lancement où on reste
    // toujours sur profils.
    try {
      const prefs = STORAGE.obtenirPreferences() || {};
      prefs.ongletActif = cle;
      STORAGE.enregistrerPreferences(prefs);
    } catch (e) {
      // Si l'écriture échoue, l'app continue de fonctionner sans
      // persister la préférence.
    }

    // Met à jour la nav (état actif visuel).
    rendreNav();

    // Re-rendre l'entête pour rafraîchir le bandeau d'invitation
    // dès qu'un chrono a été saisi.
    rendreEntete();

    // Remplace #contenu par un clone vide. Indispensable :
    // chaque module attache ses propres écouteurs (click, change,
    // focusout, etc.) sur le conteneur via etat.conteneur. Comme
    // on réutilise le même élément DOM entre les bascules d'onglet,
    // ces écouteurs s'accumuleraient sans cela : un clic sur la
    // pastille de sélection d'athlète déclencherait aussi le
    // handler basculer-athlete d'un module précédemment visité,
    // qui réécrirait son propre contenu par dessus celui du module
    // courant. Conséquence visible : Profil basculant vers Suivi
    // au changement d'athlète, alors que l'onglet du bas reste sur
    // Profil. innerHTML = '' ne suffit pas à régler ce cas, car les
    // écouteurs sont attachés à l'élément conteneur lui-même, pas
    // à ses enfants. cloneNode(false) crée un nouvel élément vide,
    // de même id et même classe, sans aucun écouteur. replaceChild
    // le substitue dans le DOM. Le nouveau noeud est ensuite passé
    // au module, qui y attache ses propres écouteurs, seuls
    // présents pour la suite.
    const ancien = document.getElementById('contenu');
    if (!ancien) return;
    const neuf = ancien.cloneNode(false);
    ancien.parentNode.replaceChild(neuf, ancien);

    const moduleGlobal = obtenirModule(onglet.cle);
    if (moduleGlobal && typeof moduleGlobal.initialiser === 'function') {
      moduleGlobal.initialiser(neuf);
    } else {
      neuf.innerHTML = ''
        + '<div class="profils__avertissement">'
        + '<strong>Module indisponible.</strong> '
        + 'Le module « ' + echapperHTML(onglet.libelle) + ' » '
        + 'n\'a pas été chargé correctement. Vérifier l\'ordre '
        + 'des scripts dans index.html.'
        + '</div>';
    }
  }


  // -------------------- Sélection de l'onglet initial --------------------

  function determinerOngletDeDemarrage() {
    // Au premier lancement, on force l'onglet profils pour guider
    // explicitement vers la saisie initiale, conformément au cahier
    // des charges.
    if (aucunChronoSaisi()) {
      return 'profils';
    }
    try {
      const prefs = STORAGE.obtenirPreferences() || {};
      const cle = prefs.ongletActif;
      if (cle && ONGLETS.some(function (o) { return o.cle === cle; })) {
        return cle;
      }
    } catch (e) {
      // ignore
    }
    return 'profils';
  }


  // -------------------- Nettoyage du style temporaire --------------------

  // Si pour une raison quelconque le style temporaire injecté par
  // profils.js est resté présent, on le retire ici, puisque styles.css
  // pilote désormais l'apparence.
  function retirerStyleTemporaire() {
    const tmp = document.getElementById('profils-style-temporaire');
    if (tmp && tmp.parentNode) {
      tmp.parentNode.removeChild(tmp);
    }
  }


  // -------------------- Initialisation --------------------

  function initialiser() {
    if (etat.initialise) return;
    etat.initialise = true;

    retirerStyleTemporaire();

    etat.ongletActif = determinerOngletDeDemarrage();
    rendreEntete();
    rendreNav();
    basculerOnglet(etat.ongletActif);
  }


  // Lance l'initialisation au DOMContentLoaded, ou immédiatement si
  // le DOM est déjà prêt.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialiser);
  } else {
    initialiser();
  }


  // -------------------- Interface publique --------------------

  return {
    initialiser: initialiser,
    basculerOnglet: basculerOnglet,
    obtenirOngletActif: function () { return etat.ongletActif; },
    joursAvantCourse: joursAvantCourse,
  };

})();
