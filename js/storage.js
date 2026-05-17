/*
 * storage.js
 * Seul module autorisé à lire et écrire dans localStorage.
 * Expose un objet global STORAGE consommé par tous les autres modules.
 *
 * Gère :
 *   - chargement et sauvegarde d'un état unique en localStorage,
 *   - structure initiale vide pour Julien et Giulia (aucun chrono inventé),
 *   - lecture et écriture par section (athlète, nutrition, plan, statuts),
 *   - export téléchargeable et import depuis un fichier JSON,
 *   - tolérance aux erreurs : localStorage indisponible, JSON invalide,
 *     quota dépassé.
 */

const STORAGE = (function () {

  // Clé unique de stockage. Suffixe de version pour permettre une future
  // migration sans casser la donnée existante.
  const CLE = 'triathlon_lausanne_2026_v1';

  // Mémoire de secours si localStorage n'est pas accessible
  // (mode privé du navigateur, restrictions d'environnement).
  // L'application continue de fonctionner pour la session en cours.
  let memoireSecours = null;
  let modeSecours = false;

  // Avertissement journalisé une seule fois si bascule en mode secours.
  let avertissementSecoursEmis = false;


  // -------------------- Disponibilité du localStorage --------------------

  function estDisponible() {
    try {
      const cleTest = '__test_disponibilite__';
      window.localStorage.setItem(cleTest, '1');
      window.localStorage.removeItem(cleTest);
      return true;
    } catch (e) {
      return false;
    }
  }

  function basculerEnSecours(raison) {
    modeSecours = true;
    if (!avertissementSecoursEmis) {
      avertissementSecoursEmis = true;
      console.warn(
        'Stockage local indisponible. Les données ne seront conservées '
        + 'que pour cette session. Raison : ' + raison
      );
    }
  }


  // -------------------- Structure initiale --------------------

  // État vide cohérent pour un premier lancement.
  // Aucun chrono saisi, aucun plan généré, aucune case nutrition cochée.
  function structureInitiale() {
    return {
      version: 1,
      creeLe: nouvelHorodatage(),
      miseAJour: nouvelHorodatage(),

      athletes: {
        julien: structureAthleteVide('Julien'),
        giulia: structureAthleteVide('Giulia'),
      },

      // Préférences globales et état du module nutrition.
      nutrition: {
        rappels: [],      // liste de compléments suivis, vide par défaut
        historique: {},   // { 'AAAA_MM_JJ': { 'cle_rappel': true } }
      },

      // Paramètres généraux de l'application.
      preferences: {
        athleteActif: 'julien',
        avatarsSimples: { julien: false, giulia: false },
      },
    };
  }

  function structureAthleteVide(prenom) {
    const cle = prenom.toLowerCase();
    const trameDefaut = (REFERENCE
      && REFERENCE.trameJoursDefaut
      && REFERENCE.trameJoursDefaut[cle])
      ? REFERENCE.trameJoursDefaut[cle].slice()
      : [1, 3, 5, 6];

    return {
      identite: {
        prenom: prenom,
        taille: null,
        poids: null,
        note: '',
      },

      // Liste de chronos saisis par l'utilisateur, par discipline.
      // Tableau vide tant que rien n'est saisi.
      // Format attendu d'une entrée : { libelle, distance, temps_s, date }.
      chronos: {
        natation: [],
        velo: [],
        course: [],
      },

      // Fréquences cardiaques par zone, optionnelles et purement manuelles.
      // null signifie non renseigné, donc non affiché.
      frequenceCardiaque: {
        facile: null,
        endurance: null,
        seuil: null,
        vo2: null,
      },

      // Jours de séance par défaut, modifiables.
      trameJours: trameDefaut,

      // Plan généré et état des séances. Vides au premier lancement.
      // plan : structure produite par plan.js.
      // statuts : { 'idSeance': 'faite' | 'partielle' | 'manquee' }.
      plan: null,
      statuts: {},
      notesSeance: {}, // { 'idSeance': 'texte libre' }
    };
  }


  // -------------------- Lecture et écriture brutes --------------------

  function charger() {
    if (modeSecours) {
      return memoireSecours
        ? clonageProfond(memoireSecours)
        : structureInitiale();
    }
    try {
      const brut = window.localStorage.getItem(CLE);
      if (brut === null || brut === undefined || brut === '') {
        return structureInitiale();
      }
      const donnees = JSON.parse(brut);
      if (!estStructureValide(donnees)) {
        // Donnée corrompue. On revient à un état initial propre.
        console.warn(
          'Données stockées invalides. Réinitialisation de la structure.'
        );
        return structureInitiale();
      }
      return donnees;
    } catch (e) {
      basculerEnSecours('lecture impossible (' + e.message + ')');
      return memoireSecours
        ? clonageProfond(memoireSecours)
        : structureInitiale();
    }
  }

  function sauvegarder(donnees) {
    if (!donnees || typeof donnees !== 'object') {
      throw new Error('Données à sauvegarder invalides.');
    }
    donnees.miseAJour = nouvelHorodatage();

    if (modeSecours) {
      memoireSecours = clonageProfond(donnees);
      return;
    }
    try {
      const texte = JSON.stringify(donnees);
      window.localStorage.setItem(CLE, texte);
    } catch (e) {
      // Quota dépassé ou autre erreur d'écriture.
      basculerEnSecours('écriture impossible (' + e.message + ')');
      memoireSecours = clonageProfond(donnees);
      throw new Error(
        'Impossible d\'écrire dans le stockage local. Les données '
        + 'restent conservées en mémoire pour la session.'
      );
    }
  }


  // -------------------- Accès par section --------------------

  function obtenirAthlete(cle) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    return clonageProfond(etat.athletes[cleNorm]);
  }

  function enregistrerAthlete(cle, donneesAthlete) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    etat.athletes[cleNorm] = clonageProfond(donneesAthlete);
    sauvegarder(etat);
  }

  function obtenirChronos(cle) {
    const athlete = obtenirAthlete(cle);
    return athlete.chronos;
  }

  function enregistrerChronos(cle, chronos) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    etat.athletes[cleNorm].chronos = clonageProfond(chronos);
    sauvegarder(etat);
  }

  function obtenirPlan(cle) {
    const athlete = obtenirAthlete(cle);
    return athlete.plan;
  }

  function enregistrerPlan(cle, plan) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    etat.athletes[cleNorm].plan = clonageProfond(plan);
    sauvegarder(etat);
  }

  function obtenirStatutSeance(cle, idSeance) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    return etat.athletes[cleNorm].statuts[idSeance] || 'a_venir';
  }

  function enregistrerStatutSeance(cle, idSeance, statut) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    if (!etat.athletes[cleNorm].statuts) {
      etat.athletes[cleNorm].statuts = {};
    }
    if (statut === 'a_venir' || statut === null || statut === undefined) {
      delete etat.athletes[cleNorm].statuts[idSeance];
    } else {
      etat.athletes[cleNorm].statuts[idSeance] = statut;
    }
    sauvegarder(etat);
  }

  function obtenirNotesSeance(cle, idSeance) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    return (etat.athletes[cleNorm].notesSeance || {})[idSeance] || '';
  }

  function enregistrerNotesSeance(cle, idSeance, texte) {
    const cleNorm = normaliserCleAthlete(cle);
    const etat = charger();
    if (!etat.athletes[cleNorm].notesSeance) {
      etat.athletes[cleNorm].notesSeance = {};
    }
    if (texte && texte.trim()) {
      etat.athletes[cleNorm].notesSeance[idSeance] = texte;
    } else {
      delete etat.athletes[cleNorm].notesSeance[idSeance];
    }
    sauvegarder(etat);
  }

  function obtenirNutrition() {
    const etat = charger();
    return clonageProfond(etat.nutrition);
  }

  function enregistrerNutrition(donneesNutrition) {
    const etat = charger();
    etat.nutrition = clonageProfond(donneesNutrition);
    sauvegarder(etat);
  }

  function obtenirPreferences() {
    const etat = charger();
    return clonageProfond(etat.preferences);
  }

  function enregistrerPreferences(prefs) {
    const etat = charger();
    etat.preferences = clonageProfond(prefs);
    sauvegarder(etat);
  }


  // -------------------- Export JSON --------------------

  // Déclenche le téléchargement d'un fichier JSON contenant
  // l'intégralité de l'état de l'application.
  function exporterJSON() {
    const etat = charger();
    const texte = JSON.stringify(etat, null, 2);
    const blob = new Blob([texte], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichierExport();
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);

    // Libération de l'URL après court délai pour laisser le clic agir.
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function nomFichierExport() {
    const d = new Date();
    const aaaa = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const jj = String(d.getDate()).padStart(2, '0');
    return 'triathlon_lausanne_export_' + aaaa + '_' + mm + '_' + jj + '.json';
  }


  // -------------------- Import JSON --------------------

  // Lit un objet File (issu d'un input type file) et écrit son contenu
  // dans le stockage après validation minimale. Retourne une Promise.
  function importerJSON(fichier) {
    return new Promise(function (resoudre, rejeter) {
      if (!fichier) {
        rejeter(new Error('Aucun fichier fourni.'));
        return;
      }
      const lecteur = new FileReader();

      lecteur.onerror = function () {
        rejeter(new Error('Lecture du fichier impossible.'));
      };

      lecteur.onload = function (evenement) {
        try {
          const texte = evenement.target.result;
          const donnees = JSON.parse(texte);
          if (!estStructureValide(donnees)) {
            rejeter(new Error(
              'Le fichier ne correspond pas au format attendu.'
            ));
            return;
          }
          sauvegarder(donnees);
          resoudre(donnees);
        } catch (e) {
          rejeter(new Error('Fichier JSON invalide : ' + e.message));
        }
      };

      lecteur.readAsText(fichier);
    });
  }

  // Validation minimale de la structure d'un état importé.
  // On vérifie que les champs essentiels existent et que les deux
  // athlètes sont présents. On reste tolérant pour le reste.
  function estStructureValide(donnees) {
    if (!donnees || typeof donnees !== 'object') return false;
    if (typeof donnees.version !== 'number') return false;
    if (!donnees.athletes || typeof donnees.athletes !== 'object') {
      return false;
    }
    if (!donnees.athletes.julien || !donnees.athletes.giulia) {
      return false;
    }
    return true;
  }


  // -------------------- Réinitialisation --------------------

  // Efface tout l'état et repart d'une structure vide.
  function reinitialiser() {
    if (modeSecours) {
      memoireSecours = null;
      return;
    }
    try {
      window.localStorage.removeItem(CLE);
    } catch (e) {
      basculerEnSecours('suppression impossible (' + e.message + ')');
      memoireSecours = null;
    }
  }

  // Remet à zéro un seul athlète sans toucher l'autre ni la nutrition.
  function reinitialiserAthlete(cle) {
    const cleNorm = normaliserCleAthlete(cle);
    const prenom = cleNorm === 'julien' ? 'Julien' : 'Giulia';
    const etat = charger();
    etat.athletes[cleNorm] = structureAthleteVide(prenom);
    sauvegarder(etat);
  }


  // -------------------- Utilitaires internes --------------------

  function nouvelHorodatage() {
    return new Date().toISOString();
  }

  function normaliserCleAthlete(cle) {
    if (typeof cle !== 'string') {
      throw new Error('Clé d\'athlète invalide.');
    }
    const c = cle.toLowerCase();
    if (c !== 'julien' && c !== 'giulia') {
      throw new Error('Athlète inconnu : ' + cle);
    }
    return c;
  }

  // Clonage profond simple via JSON. Suffisant ici puisque l'état ne
  // contient que des valeurs sérialisables (objets, tableaux, nombres,
  // chaînes, booléens, null).
  function clonageProfond(valeur) {
    if (valeur === null || valeur === undefined) return valeur;
    return JSON.parse(JSON.stringify(valeur));
  }


  // -------------------- Initialisation à l'import du script --------------------

  if (!estDisponible()) {
    basculerEnSecours('localStorage non disponible au chargement');
  }


  // -------------------- Interface publique --------------------

  return {
    // disponibilité
    estDisponible: estDisponible,
    estEnModeSecours: function () { return modeSecours; },

    // structure
    structureInitiale: structureInitiale,

    // lecture et écriture globales
    charger: charger,
    sauvegarder: sauvegarder,

    // athlètes
    obtenirAthlete: obtenirAthlete,
    enregistrerAthlete: enregistrerAthlete,
    obtenirChronos: obtenirChronos,
    enregistrerChronos: enregistrerChronos,
    obtenirPlan: obtenirPlan,
    enregistrerPlan: enregistrerPlan,

    // séances
    obtenirStatutSeance: obtenirStatutSeance,
    enregistrerStatutSeance: enregistrerStatutSeance,
    obtenirNotesSeance: obtenirNotesSeance,
    enregistrerNotesSeance: enregistrerNotesSeance,

    // nutrition
    obtenirNutrition: obtenirNutrition,
    enregistrerNutrition: enregistrerNutrition,

    // préférences
    obtenirPreferences: obtenirPreferences,
    enregistrerPreferences: enregistrerPreferences,

    // export et import
    exporterJSON: exporterJSON,
    importerJSON: importerJSON,

    // réinitialisation
    reinitialiser: reinitialiser,
    reinitialiserAthlete: reinitialiserAthlete,
  };

})();
