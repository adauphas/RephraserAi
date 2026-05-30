const ACTIONS = Object.freeze({
  correct: {
    label: "Corriger",
    instruction: "Corrige uniquement les fautes d'orthographe, de grammaire et de ponctuation du texte suivant, sans changer le style ni le sens."
  },
  professionalize: {
    label: "Professionnaliser",
    instruction: "Reecris le texte suivant dans un style professionnel, clair et adapte a un contexte de travail."
  },
  casual: {
    label: "Casual",
    instruction: "Reecris le texte suivant dans un style plus naturel, detendu et conversationnel."
  },
  formal: {
    label: "Formel",
    instruction: "Reecris le texte suivant dans un style formel, poli et structure."
  },
  simple_corrections: {
    label: "Simple corrections",
    instruction: "Corrige seulement les erreurs evidentes sans reformuler."
  },
  shorten: {
    label: "Raccourcir",
    instruction: "Raccourcis le texte suivant en conservant le message principal."
  },
  enrich: {
    label: "Enrichir",
    instruction: "Ameliore et enrichis le texte suivant en ajoutant de la clarte, du contexte et une meilleure formulation."
  },
  reply: {
    label: "Repondre a cette selection",
    instruction: "Redige une reponse pertinente, claire et adaptee au texte selectionne."
  },
  linkedin_message: {
    label: "Message LinkedIn",
    instruction: "Transforme le texte suivant en message LinkedIn professionnel, naturel et engageant. Le message doit etre clair, humain, adapte a LinkedIn, sans etre trop commercial ni trop long. Conserve la langue la plus adaptee au texte source."
  },
  promptify: {
    label: "Transformer en prompt IA",
    instruction: "Transforme le texte suivant en prompt clair, directement utilisable avec une IA. Structure le prompt avec un objectif, du contexte utile, des contraintes, le ton attendu et le format de sortie souhaite. Conserve la langue la plus adaptee au texte source."
  },
  translate_en: {
    label: "Traduire en anglais",
    instruction: "Traduis le texte suivant en anglais, de maniere naturelle et fidele."
  },
  translate_es: {
    label: "Traduire en espagnol",
    instruction: "Traduis le texte suivant en espagnol, de maniere naturelle et fidele."
  },
  translate_fr: {
    label: "Traduire en francais",
    instruction: "Traduis le texte suivant en francais, de maniere naturelle et fidele."
  },
  translate_de: {
    label: "Traduire en allemand",
    instruction: "Traduis le texte suivant en allemand, de maniere naturelle et fidele."
  },
  translate_pt: {
    label: "Traduire en portugais",
    instruction: "Traduis le texte suivant en portugais, de maniere naturelle et fidele."
  }
});

function isAllowedAction(action) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, action);
}

function getActionLabel(action) {
  return ACTIONS[action]?.label || action;
}

function buildPrompt(action, text) {
  if (!isAllowedAction(action)) {
    throw new Error("Action inconnue.");
  }

  return [
    ACTIONS[action].instruction,
    "",
    "Contraintes strictes :",
    "- Ne pas ajouter d'explication inutile.",
    "- Retourner uniquement le texte final transforme.",
    "- Ne pas mettre de guillemets autour du resultat.",
    "- Ne pas ajouter de phrase introductive.",
    "- Garder la langue cible demandee.",
    "- Pour les corrections simples, ne pas modifier le sens.",
    "",
    "Texte :",
    text
  ].join("\n");
}

module.exports = {
  ACTIONS,
  isAllowedAction,
  getActionLabel,
  buildPrompt
};
