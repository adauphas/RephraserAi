importScripts("i18n-runtime.js");

const PARENT_MENU_ID = "ai_rewriter_parent";
// PROD : remplacer par l'URL HTTPS de ton backend deploye (voir DEPLOYMENT.md).
const DEFAULT_BACKEND_URL = "http://localhost:3006";
const LEGACY_BACKEND_URLS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3005",
  "http://127.0.0.1:3005"
]);

const MENU_ACTIONS = [
  { id: "correct", messageKey: "actionCorrect" },
  { id: "professionalize", messageKey: "actionProfessionalize" },
  { id: "casual", messageKey: "actionCasual" },
  { id: "formal", messageKey: "actionFormal" },
  { id: "simple_corrections", messageKey: "actionSimpleCorrections" },
  { id: "shorten", messageKey: "actionShorten" },
  { id: "enrich", messageKey: "actionEnrich" },
  { id: "reply", messageKey: "actionReply" },
  { id: "linkedin_message", messageKey: "actionLinkedinMessage", minimumPlan: "Premium" },
  { id: "promptify", messageKey: "actionPromptify", minimumPlan: "Free+" },
  { id: "translate_en", messageKey: "actionTranslateEn" },
  { id: "translate_es", messageKey: "actionTranslateEs" },
  { id: "translate_fr", messageKey: "actionTranslateFr" },
  { id: "translate_de", messageKey: "actionTranslateDe" },
  { id: "translate_pt", messageKey: "actionTranslatePt" }
];

const PLAN_RANKS = {
  Free: 0,
  "Free+": 1,
  Premium: 2,
  "Premium+": 3,
  "Premium Pro": 4
};

function t(key, fallback = key, substitutions = undefined) {
  return RephraserI18n.t(key, fallback, substitutions);
}

function isPaidPlan(plan) {
  return Boolean(plan && plan !== "Free");
}

function getEffectivePlan(settings) {
  return settings.aiRewriterAccountPlan || "Free";
}

function isPlanAtLeast(plan, minimumPlan) {
  if (!minimumPlan) {
    return true;
  }

  return (PLAN_RANKS[plan] ?? 0) >= (PLAN_RANKS[minimumPlan] ?? 0);
}

async function prepareLanguage(settings = null) {
  const currentSettings = settings || await chrome.storage.sync.get({
    aiRewriterUiLanguage: "",
    aiRewriterAccountPlan: "",
    aiRewriterUserId: "user_free"
  });
  const paid = isPaidPlan(getEffectivePlan(currentSettings));
  return RephraserI18n.init(paid ? currentSettings.aiRewriterUiLanguage : "");
}

async function createContextMenus() {
  const settings = await chrome.storage.sync.get({
    aiRewriterUiLanguage: "",
    aiRewriterAccountPlan: "",
    aiRewriterUserId: "user_free"
  });
  await prepareLanguage(settings);

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: PARENT_MENU_ID,
      title: t("extensionName", "Rephraser AI"),
      contexts: ["selection"]
    });

    for (const action of MENU_ACTIONS.filter((item) => isPlanAtLeast(getEffectivePlan(settings), item.minimumPlan))) {
      chrome.contextMenus.create({
        id: action.id,
        parentId: PARENT_MENU_ID,
        title: t(action.messageKey, action.id),
        contexts: ["selection"]
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onInstalled.addListener(migrateBackendUrl);
chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
  migrateBackendUrl();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && (
    changes.aiRewriterUiLanguage ||
    changes.aiRewriterAccountPlan ||
    changes.aiRewriterUserId ||
    changes.aiRewriterAuthToken
  )) {
    createContextMenus();
  }
});

async function migrateBackendUrl() {
  const settings = await chrome.storage.sync.get("aiRewriterBackendUrl");
  const currentUrl = String(settings.aiRewriterBackendUrl || "").replace(/\/+$/, "");

  if (!currentUrl || LEGACY_BACKEND_URLS.has(currentUrl)) {
    await chrome.storage.sync.set({
      aiRewriterBackendUrl: DEFAULT_BACKEND_URL
    });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const action = MENU_ACTIONS.find((item) => item.id === info.menuItemId);

  if (!action || !tab?.id) {
    return;
  }

  const selectedText = (info.selectionText || "").trim();
  const settings = await chrome.storage.sync.get({
    aiRewriterUiLanguage: "",
    aiRewriterAccountPlan: "",
    aiRewriterUserId: "user_free"
  });
  const paid = isPaidPlan(getEffectivePlan(settings));
  await prepareLanguage(settings);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["i18n-runtime.js", "content.js"]
    });

    await chrome.tabs.sendMessage(tab.id, {
      type: "AI_REWRITER_RUN",
      action: action.id,
      actionLabel: t(action.messageKey, action.id),
      selectedText,
      uiLanguage: paid ? settings.aiRewriterUiLanguage : ""
    });
  } catch (error) {
    console.warn(t("consoleCannotDisplay", "Unable to show Rephraser AI on this page."), error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AI_REWRITER_REFRESH_MENUS") {
    createContextMenus()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Menu refresh failed." }));

    return true;
  }

  if (message?.type === "AI_REWRITER_HEALTH") {
    checkBackendHealth(message.payload)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message || t("errorBackendUnreachable", "Backend unreachable.") }));

    return true;
  }

  if (message?.type !== "AI_REWRITER_FETCH") {
    if (message?.type === "AI_REWRITER_CHECKOUT") {
      requestCheckoutFromBackend(message.payload)
        .then((payload) => sendResponse({ ok: true, payload }))
        .catch((error) => sendResponse({
          ok: false,
          error: error.message || t("errorCheckoutOpen", "Unable to open Stripe Checkout."),
          status: error.status || 500,
          payload: error.payload || null
        }));

      return true;
    }

    return false;
  }

  requestRewriteFromBackend(message.payload)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({
      ok: false,
      error: error.message || t("errorBackendContact", "Unable to reach the backend."),
      status: error.status || 500,
      payload: error.payload || null
    }));

  return true;
});

async function checkBackendHealth({ backendUrl }) {
  const normalizedBackendUrl = String(backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");

  let response;
  try {
    response = await fetch(`${normalizedBackendUrl}/health`);
  } catch (error) {
    throw new Error(t("errorHealthTest", "Test failed for $URL$.", [normalizedBackendUrl]));
  }

  if (!response.ok) {
    throw new Error(t("errorHealthStatus", "Backend responded with status $STATUS$.", [normalizedBackendUrl, String(response.status)]));
  }

  return response.json();
}

async function requestRewriteFromBackend({ backendUrl, userId, authToken, action, text }) {
  const normalizedBackendUrl = String(backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
  const headers = {
    "Content-Type": "application/json",
    "X-User-Id": userId
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response;
  try {
    response = await fetch(`${normalizedBackendUrl}/api/rewrite`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId,
        action,
        text
      })
    });
  } catch (error) {
    throw new Error(t("errorBackendAtUrl", "Backend unreachable at $URL$.", [normalizedBackendUrl]));
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || t("errorBackendRejected", "The backend rejected the request."));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  if (!payload.text) {
    throw new Error(t("errorNoResult", "The backend returned no result."));
  }

  return payload;
}

async function requestCheckoutFromBackend({ backendUrl, authToken, plan }) {
  const normalizedBackendUrl = String(backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");

  if (!authToken) {
    throw new Error(t("errorLoginBeforeUpgrade", "Sign in before upgrading."));
  }

  const response = await fetch(`${normalizedBackendUrl}/api/billing/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ plan })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.url) {
    const error = new Error(payload.error || t("errorPaymentCreate", "Unable to create payment."));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  await chrome.tabs.create({ url: payload.url });
  return payload;
}
