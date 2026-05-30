(function initRephraserI18n(globalScope) {
  const DEFAULT_LANGUAGE = "fr";
  const SUPPORTED_LANGUAGES = ["fr", "en", "de", "es", "pt"];
  let activeLanguage = "";
  let messages = {};

  function normalizeLanguage(language) {
    const base = String(language || "").trim().toLowerCase().split("-")[0];
    return SUPPORTED_LANGUAGES.includes(base) ? base : DEFAULT_LANGUAGE;
  }

  function getChromeLanguage() {
    return normalizeLanguage(chrome.i18n.getUILanguage());
  }

  function replaceSubstitutions(message, substitutions) {
    const values = Array.isArray(substitutions) ? substitutions : substitutions ? [substitutions] : [];
    return String(message).replace(/\$(\d+)/g, (match, index) => values[Number(index) - 1] ?? match);
  }

  async function loadCatalog(language) {
    const normalizedLanguage = normalizeLanguage(language);
    const response = await fetch(chrome.runtime.getURL(`_locales/${normalizedLanguage}/messages.json`));

    if (!response.ok) {
      throw new Error(`Locale ${normalizedLanguage} unavailable`);
    }

    activeLanguage = normalizedLanguage;
    messages = await response.json();
  }

  async function setLanguage(language) {
    const normalizedLanguage = normalizeLanguage(language);

    try {
      await loadCatalog(normalizedLanguage);
    } catch (error) {
      if (normalizedLanguage !== DEFAULT_LANGUAGE) {
        await loadCatalog(DEFAULT_LANGUAGE);
        return activeLanguage;
      }

      messages = {};
      activeLanguage = DEFAULT_LANGUAGE;
    }

    return activeLanguage;
  }

  async function init(language) {
    return setLanguage(language || getChromeLanguage());
  }

  function t(key, fallback = key, substitutions = undefined) {
    const localMessage = messages[key]?.message;

    if (localMessage) {
      return replaceSubstitutions(localMessage, substitutions);
    }

    return chrome.i18n.getMessage(key, substitutions) || fallback;
  }

  globalScope.RephraserI18n = {
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
    getChromeLanguage,
    init,
    normalizeLanguage,
    setLanguage,
    t
  };
})(globalThis);
