// Guard contre la double injection (manifest.json + scripting.executeScript)
if (typeof window.__rephraserAiLoaded !== "undefined") { throw new Error("already loaded"); }
window.__rephraserAiLoaded = true;

// PROD : remplacer par l'URL HTTPS de ton backend deploye (voir DEPLOYMENT.md).
const DEFAULT_BACKEND_URL = "https://rephraserai.onrender.com";
const DEFAULT_USER_ID = "user_free";

let lastEditableSelection = null;
let lastPageRange = null;
let currentModal = null;

const ACTION_LABEL_KEYS = {
  correct: "actionCorrect",
  professionalize: "actionProfessionalize",
  casual: "actionCasual",
  formal: "actionFormal",
  simple_corrections: "actionSimpleCorrections",
  shorten: "actionShorten",
  enrich: "actionEnrich",
  reply: "actionReply",
  linkedin_message: "actionLinkedinMessage",
  promptify: "actionPromptify",
  translate_en: "actionTranslateEn",
  translate_es: "actionTranslateEs",
  translate_fr: "actionTranslateFr",
  translate_de: "actionTranslateDe",
  translate_pt: "actionTranslatePt"
};

function t(key, fallback = key, substitutions = undefined) {
  return RephraserI18n.t(key, fallback, substitutions);
}

function getActionLabel(action) {
  return t(ACTION_LABEL_KEYS[action] || "", action || t("genericAction", "Action"));
}

function getPlanBenefits(plan) {
  return [
    t("benefitDailyRequests", "$COUNT$ requests per day", [String(plan?.dailyRequests || 0)]),
    t("benefitMonthlyRequests", "$COUNT$ requests per month", [String(plan?.monthlyRequests || 0)]),
    t("benefitCharacters", "$COUNT$ characters per request", [String(plan?.characterLimit || 0)])
  ];
}

async function saveResultEntry(entry) {
  const normalizedEntry = {
    action: entry.action,
    actionLabel: entry.actionLabel,
    result: entry.result,
    createdAt: entry.createdAt || new Date().toISOString()
  };
  const localSettings = await chrome.storage.local.get({
    aiRewriterHistory: []
  });
  const history = Array.isArray(localSettings.aiRewriterHistory) ? localSettings.aiRewriterHistory : [];

  await chrome.storage.local.set({
    aiRewriterLastResult: normalizedEntry,
    aiRewriterHistory: [normalizedEntry, ...history].filter((item) => item?.result).slice(0, 5)
  });
}

function isEditableElement(element) {
  if (!element) return false;
  const tagName = element.tagName?.toLowerCase();
  return tagName === "textarea" || (tagName === "input" && /^(text|search|url|tel|email)?$/i.test(element.type || "text"));
}

function isContentEditableElement(element) {
  return Boolean(element && element.isContentEditable);
}

// Champ pris en charge par l'icone flottante (point 1).
function isQuickFixTarget(element) {
  if (!element) return false;
  if (isContentEditableElement(element)) {
    return true;
  }
  if (!isEditableElement(element)) {
    return false;
  }
  return !element.readOnly && !element.disabled;
}

function readFieldText(element) {
  if (isContentEditableElement(element)) {
    return element.innerText || element.textContent || "";
  }
  return element.value || "";
}

function writeFieldText(element, value) {
  if (isContentEditableElement(element)) {
    element.focus();
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: value }));
    return true;
  }

  if (isEditableElement(element)) {
    element.focus();
    element.value = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return false;
}

function rememberSelection() {
  const activeElement = document.activeElement;

  if (isEditableElement(activeElement)) {
    lastEditableSelection = {
      element: activeElement,
      start: activeElement.selectionStart,
      end: activeElement.selectionEnd,
      value: activeElement.value
    };
    return;
  }

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
    lastPageRange = selection.getRangeAt(0).cloneRange();
  }
}

document.addEventListener("selectionchange", rememberSelection);
document.addEventListener("mouseup", rememberSelection, true);
document.addEventListener("keyup", rememberSelection, true);

if (!globalThis.aiRewriterContentListenerInstalled) {
  globalThis.aiRewriterContentListenerInstalled = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "AI_REWRITER_RUN") {
      return;
    }

    handleRewriteRequest(message);
  });
}

async function handleRewriteRequest({ action, actionLabel, selectedText, uiLanguage = "" }) {
  await RephraserI18n.init(uiLanguage);

  const text = (selectedText || "").trim();
  let settings = null;

  if (!text) {
    renderModal({
      actionLabel: actionLabel || getActionLabel(action),
      state: "error",
      error: t("errorNoSelection", "No text is selected.")
    });
    return;
  }

  renderModal({
    actionLabel: actionLabel || getActionLabel(action),
    state: "loading"
  });

  try {
    settings = await chrome.storage.sync.get({
      aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
      aiRewriterUserId: DEFAULT_USER_ID,
      aiRewriterAuthToken: ""
    });

    const result = await requestRewrite({
      backendUrl: settings.aiRewriterBackendUrl,
      userId: settings.aiRewriterUserId,
      authToken: settings.aiRewriterAuthToken || "",
      action,
      text
    });

    await saveResultEntry({
      action,
      actionLabel: actionLabel || getActionLabel(action),
      result: result.text
    });

    renderModal({
      actionLabel: actionLabel || getActionLabel(action),
      state: "success",
      result: result.text,
      originalText: text,
      usage: result.usage
    });
  } catch (error) {
    if ((error.status === 429 || error.status === 403) && error.payload?.nextPlan) {
      renderModal({
        actionLabel: error.payload?.reason === "paid_feature_required"
          ? t("paidFeatureTitle", "Premium feature")
          : t("quotaReachedTitle", "Quota reached"),
        state: "upgrade",
        error: error.message,
        usage: error.payload.usage,
        upgrade: {
          plan: error.payload.nextPlan,
          backendUrl: settings?.aiRewriterBackendUrl || DEFAULT_BACKEND_URL,
          authToken: settings?.aiRewriterAuthToken || ""
        }
      });
      return;
    }

    renderModal({
      actionLabel: actionLabel || getActionLabel(action),
      state: "error",
      error: error.message || t("errorGenericReload", "An error occurred. Reload the extension and the tab if it persists.")
    });
  }
}

async function requestRewrite({ backendUrl, userId, authToken, action, text }) {
  const response = await chrome.runtime.sendMessage({
    type: "AI_REWRITER_FETCH",
    payload: {
      backendUrl,
      userId,
      authToken,
      action,
      text
    }
  });

  if (!response?.ok) {
    const error = new Error(response?.error || t("errorBackendContact", "Unable to reach the backend."));
    error.status = response?.status;
    error.payload = response?.payload;
    throw error;
  }

  return response.payload;
}

function renderModal({ actionLabel, state, result = "", error = "", originalText = "", usage = null, upgrade = null }) {
  ensureStyles();

  if (currentModal) {
    currentModal.remove();
  }

  const overlay = document.createElement("div");
  overlay.className = "ai-rewriter-overlay";

  const dialog = document.createElement("section");
  dialog.className = "ai-rewriter-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "false");

  const header = document.createElement("div");
  header.className = "ai-rewriter-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "ai-rewriter-title";
  const mark = document.createElement("span");
  mark.className = "ai-rewriter-mark";
  mark.textContent = "R";
  const eyebrow = document.createElement("p");
  eyebrow.className = "ai-rewriter-eyebrow";
  eyebrow.textContent = "Rephraser AI";
  const title = document.createElement("h2");
  title.textContent = actionLabel;
  const titleText = document.createElement("div");
  titleText.append(eyebrow, title);
  titleWrap.append(mark, titleText);

  const headerMeta = document.createElement("div");
  headerMeta.className = "ai-rewriter-header-meta";

  if (usage) {
    const counter = document.createElement("div");
    counter.className = "ai-rewriter-counter";
    counter.setAttribute("aria-label", t("remainingRequestsAria", "Remaining requests"));

    const counterValue = document.createElement("strong");
    counterValue.textContent = String(usage.remainingToday ?? usage.remaining ?? 0);

    const counterLabel = document.createElement("span");
    counterLabel.textContent = t("remainingToday", "remaining today");

    const monthLabel = document.createElement("small");
    monthLabel.textContent = t("remainingMonth", "$CURRENT$/$LIMIT$ this month", [
      String(usage.remaining ?? 0),
      String(usage.monthlyLimit ?? 0)
    ]);

    counter.append(counterValue, counterLabel, monthLabel);
    headerMeta.append(counter);
  }

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ai-rewriter-icon-button";
  closeButton.setAttribute("aria-label", t("closeButton", "Close"));
  closeButton.textContent = "x";
  closeButton.addEventListener("click", () => overlay.remove());

  headerMeta.append(closeButton);
  header.append(titleWrap, headerMeta);
  dialog.append(header);

  const body = document.createElement("div");
  body.className = "ai-rewriter-body";

  if (state === "loading") {
    const loading = document.createElement("p");
    loading.className = "ai-rewriter-loading";
    loading.textContent = t("loading", "Loading...");
    body.append(loading);
  }

  if (state === "error") {
    const message = document.createElement("p");
    message.className = "ai-rewriter-error";
    message.textContent = error;
    body.append(message);
  }

  if (state === "upgrade") {
    const upgradePanel = document.createElement("div");
    upgradePanel.className = "ai-rewriter-upgrade";

    const upgradeTitle = document.createElement("h3");
    upgradeTitle.textContent = t("upgradeTitle", "Upgrade your plan");

    const upgradeText = document.createElement("p");
    upgradeText.textContent = error || t("upgradeQuotaText", "Your quota has been reached for this plan.");

    const plan = upgrade?.plan;
    const benefits = getPlanBenefits(plan);

    const planBox = document.createElement("div");
    planBox.className = "ai-rewriter-plan-box";

    const planName = document.createElement("strong");
    planName.textContent = plan
      ? t("planPriceMonthly", "$PLAN$ - $PRICE$ EUR / month", [plan.name, String(plan.monthlyPriceEur).replace(".", ",")])
      : t("higherPlan", "Higher plan");

    const benefitList = document.createElement("ul");
    for (const benefit of benefits) {
      const item = document.createElement("li");
      item.textContent = benefit;
      benefitList.append(item);
    }

    const checkoutButton = document.createElement("button");
    checkoutButton.type = "button";
    checkoutButton.className = "ai-rewriter-button ai-rewriter-primary";
    checkoutButton.textContent = t("openStripeCheckout", "Open Stripe Checkout");
    checkoutButton.addEventListener("click", async () => {
      checkoutButton.disabled = true;
      checkoutButton.textContent = t("opening", "Opening...");

      try {
        const checkout = await chrome.runtime.sendMessage({
          type: "AI_REWRITER_CHECKOUT",
          payload: {
            backendUrl: upgrade?.backendUrl || DEFAULT_BACKEND_URL,
            authToken: upgrade?.authToken || "",
            plan: plan?.name
          }
        });

        if (!checkout?.ok) {
          throw new Error(checkout?.error || t("errorCheckoutOpen", "Unable to open Stripe Checkout."));
        }

        checkoutButton.textContent = t("checkoutOpened", "Checkout opened");
      } catch (checkoutError) {
        checkoutButton.disabled = false;
        checkoutButton.textContent = t("openStripeCheckout", "Open Stripe Checkout");
        const checkoutMessage = document.createElement("p");
        checkoutMessage.className = "ai-rewriter-error ai-rewriter-checkout-error";
        checkoutMessage.textContent = checkoutError.message || t("errorCheckoutOpen", "Unable to open Stripe Checkout.");
        upgradePanel.append(checkoutMessage);
      }
    });

    planBox.append(planName, benefitList);
    upgradePanel.append(upgradeTitle, upgradeText, planBox, checkoutButton);
    body.append(upgradePanel);
  }

  if (state === "success") {
    const resultBox = document.createElement("div");
    resultBox.className = "ai-rewriter-result";
    resultBox.textContent = result;

    const actions = document.createElement("div");
    actions.className = "ai-rewriter-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "ai-rewriter-button ai-rewriter-primary";
    copyButton.textContent = t("copyButton", "Copy");
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(result);
      copyButton.textContent = t("copiedButton", "Copied");
      setTimeout(() => {
        copyButton.textContent = t("copyButton", "Copy");
      }, 1400);
    });

    const replaceButton = document.createElement("button");
    replaceButton.type = "button";
    replaceButton.className = "ai-rewriter-button";
    replaceButton.textContent = t("replaceSelectionButton", "Replace selection");
    replaceButton.addEventListener("click", () => {
      const replaced = replaceSelection(result, originalText);
      if (replaced) {
        overlay.remove();
        return;
      }

      replaceButton.textContent = t("replaceUnavailable", "Replacement unavailable");
      replaceButton.disabled = true;
    });

    actions.append(copyButton, replaceButton);
    body.append(resultBox, actions);
  }

  dialog.append(body);
  overlay.append(dialog);
  document.documentElement.append(overlay);
  currentModal = overlay;
}

function replaceSelection(replacement, originalText) {
  if (lastEditableSelection?.element?.isConnected) {
    const { element, start, end, value } = lastEditableSelection;
    const selectedValue = value.slice(start, end).trim();

    if (selectedValue === originalText.trim()) {
      element.focus();
      element.setRangeText(replacement, start, end, "end");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: replacement }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  const selection = window.getSelection();
  if (lastPageRange && lastPageRange.toString().trim() === originalText.trim()) {
    const target = lastPageRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? lastPageRange.commonAncestorContainer
      : lastPageRange.commonAncestorContainer.parentElement;
    selection.removeAllRanges();
    selection.addRange(lastPageRange);
    lastPageRange.deleteContents();
    lastPageRange.insertNode(document.createTextNode(replacement));
    target?.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: replacement }));
    selection.removeAllRanges();
    return true;
  }

  return false;
}

function ensureStyles() {
  if (document.getElementById("ai-rewriter-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "ai-rewriter-style";
  style.textContent = `
    .ai-rewriter-overlay {
      position: fixed;
      inset: auto 20px 20px auto;
      z-index: 2147483647;
      color: #15211f;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    }

    .ai-rewriter-dialog {
      width: min(420px, calc(100vw - 32px));
      max-height: min(620px, calc(100vh - 32px));
      overflow: hidden;
      border: 1px solid rgba(21, 33, 31, 0.14);
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 24px 65px rgba(10, 17, 24, 0.28);
    }

    .ai-rewriter-header {
      position: relative;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      overflow: hidden;
      padding: 16px 16px 14px;
      background: linear-gradient(135deg, #16736b, #285a9f 56%, #17211f);
      color: #ffffff;
    }

    .ai-rewriter-header::after {
      content: "";
      position: absolute;
      inset: auto 0 0;
      height: 3px;
      background: linear-gradient(90deg, #d69a31, #f8d680, transparent);
    }

    .ai-rewriter-title {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 10px;
    }

    .ai-rewriter-mark {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.13);
      color: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
      font-size: 24px;
      font-weight: 900;
      line-height: 1;
    }

    .ai-rewriter-header-meta {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      flex: 0 0 auto;
    }

    .ai-rewriter-counter {
      min-width: 96px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      padding: 6px 8px;
      text-align: right;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }

    .ai-rewriter-counter strong,
    .ai-rewriter-counter span,
    .ai-rewriter-counter small {
      display: block;
    }

    .ai-rewriter-counter strong {
      font-size: 18px;
      line-height: 1;
      font-weight: 800;
    }

    .ai-rewriter-counter span {
      margin-top: 2px;
      font-size: 10px;
      line-height: 1.15;
      font-weight: 700;
    }

    .ai-rewriter-counter small {
      margin-top: 3px;
      color: rgba(255, 255, 255, 0.68);
      font-size: 10px;
      line-height: 1.15;
    }

    .ai-rewriter-eyebrow {
      margin: 0 0 4px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 11px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .ai-rewriter-header h2 {
      margin: 0;
      color: #ffffff;
      font-size: 17px;
      line-height: 1.2;
      font-weight: 850;
    }

    .ai-rewriter-icon-button {
      width: 32px;
      height: 32px;
      flex: 0 0 auto;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
    }

    .ai-rewriter-body {
      background:
        linear-gradient(145deg, rgba(22, 115, 107, 0.08), transparent 40%),
        #ffffff;
      padding: 16px;
    }

    .ai-rewriter-loading,
    .ai-rewriter-error {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
    }

    .ai-rewriter-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #15211f;
      font-weight: 600;
    }

    .ai-rewriter-loading::before {
      content: "";
      width: 16px;
      height: 16px;
      flex: 0 0 auto;
      border: 2px solid rgba(22, 115, 107, 0.25);
      border-top-color: #16736b;
      border-radius: 50%;
      animation: ai-rewriter-spin 0.7s linear infinite;
    }

    @keyframes ai-rewriter-spin {
      to { transform: rotate(360deg); }
    }

    .ai-rewriter-error {
      color: #b42318;
    }

    .ai-rewriter-upgrade {
      display: grid;
      gap: 12px;
    }

    .ai-rewriter-upgrade h3 {
      margin: 0;
      color: #15211f;
      font-size: 18px;
      line-height: 1.25;
      font-weight: 800;
    }

    .ai-rewriter-upgrade p {
      margin: 0;
      color: #34444d;
      font-size: 14px;
      line-height: 1.45;
    }

    .ai-rewriter-plan-box {
      border: 1px solid rgba(40, 90, 159, 0.2);
      border-radius: 8px;
      background: linear-gradient(180deg, #ffffff, #f6fafb);
      padding: 12px;
    }

    .ai-rewriter-plan-box strong {
      display: block;
      color: #123c8c;
      font-size: 15px;
      line-height: 1.3;
    }

    .ai-rewriter-plan-box ul {
      margin: 8px 0 0;
      padding-left: 18px;
      color: #172026;
      font-size: 13px;
      line-height: 1.45;
    }

    .ai-rewriter-checkout-error {
      margin-top: 0 !important;
    }

    .ai-rewriter-result {
      max-height: 310px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border: 1px solid rgba(21, 33, 31, 0.12);
      border-radius: 8px;
      background: #f8fbfb;
      padding: 13px;
      color: #15211f;
      font-size: 14px;
      line-height: 1.55;
      box-shadow: inset 3px 0 0 rgba(22, 115, 107, 0.28);
    }

    .ai-rewriter-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .ai-rewriter-button {
      min-height: 36px;
      border: 1px solid rgba(21, 33, 31, 0.16);
      border-radius: 8px;
      background: #ffffff;
      color: #15211f;
      cursor: pointer;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 800;
      line-height: 1.2;
      box-shadow: 0 8px 18px rgba(21, 33, 31, 0.08);
    }

    .ai-rewriter-primary {
      border-color: #173d3a;
      background: linear-gradient(135deg, #173d3a, #285a9f);
      color: #ffffff;
      box-shadow: 0 10px 20px rgba(40, 90, 159, 0.22);
    }

    .ai-rewriter-button:disabled {
      cursor: not-allowed;
      opacity: 0.72;
    }

    @media (max-width: 520px) {
      .ai-rewriter-overlay {
        inset: auto 12px 12px 12px;
      }

      .ai-rewriter-dialog {
        width: 100%;
      }

      .ai-rewriter-header {
        gap: 10px;
      }

      .ai-rewriter-counter {
        min-width: 86px;
      }
    }
  `;
  document.documentElement.append(style);
}

/* =========================================================================
   Point 1 : icone flottante dans les champs de saisie.
   Affichee au focus d'un champ editable, un clic applique l'action rapide
   choisie dans le profil (par defaut "correct") et remplace le texte.
   ========================================================================= */

const DEFAULT_QUICK_ACTION = "correct";
let quickFixIcon = null;
let quickFixTarget = null;
let quickFixBusy = false;
let quickFixSettings = { enabled: true, action: DEFAULT_QUICK_ACTION, uiLanguage: "", plan: "" };
let hideIconTimer = null;

function isPaidPlanContent(plan) {
  return Boolean(plan && plan !== "Free");
}

// Vrai tant que le script tourne dans un contexte d'extension valide. Devient faux apres
// une mise a jour / un rechargement de l'extension sur un onglet deja ouvert.
function isExtensionContextValid() {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (error) {
    return false;
  }
}

// Message minimal (sans appel chrome.*) invitant a recharger la page apres une MAJ.
function showStaleContextNotice() {
  ensureStyles();
  if (currentModal) {
    currentModal.remove();
  }
  const overlay = document.createElement("div");
  overlay.className = "ai-rewriter-overlay";
  const dialog = document.createElement("section");
  dialog.className = "ai-rewriter-dialog";
  const header = document.createElement("div");
  header.className = "ai-rewriter-header";
  const titleWrap = document.createElement("div");
  titleWrap.className = "ai-rewriter-title";
  const mark = document.createElement("span");
  mark.className = "ai-rewriter-mark";
  mark.textContent = "R";
  const titleText = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "ai-rewriter-eyebrow";
  eyebrow.textContent = "Rephraser AI";
  const title = document.createElement("h2");
  title.textContent = "Rechargez la page";
  titleText.append(eyebrow, title);
  titleWrap.append(mark, titleText);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "ai-rewriter-icon-button";
  closeButton.textContent = "x";
  closeButton.addEventListener("click", () => overlay.remove());
  header.append(titleWrap, closeButton);
  const body = document.createElement("div");
  body.className = "ai-rewriter-body";
  const message = document.createElement("p");
  message.style.margin = "0";
  message.style.fontSize = "14px";
  message.style.lineHeight = "1.5";
  message.style.fontWeight = "600";
  message.style.color = "#15211f";
  message.textContent = "Rephraser AI a ete mis a jour. Rechargez cette page (F5) pour reactiver l'extension. / Please reload this page (F5).";
  body.append(message);
  dialog.append(header, body);
  overlay.append(dialog);
  document.documentElement.append(overlay);
  currentModal = overlay;
  // L'icone obsolete n'a plus d'utilite.
  if (quickFixIcon) {
    quickFixIcon.classList.remove("is-visible");
  }
}

async function refreshQuickFixSettings() {
  const stored = await chrome.storage.sync.get({
    aiRewriterInPageIcon: true,
    aiRewriterQuickAction: DEFAULT_QUICK_ACTION,
    aiRewriterUiLanguage: "",
    aiRewriterAccountPlan: ""
  });
  quickFixSettings = {
    enabled: stored.aiRewriterInPageIcon !== false,
    action: stored.aiRewriterQuickAction || DEFAULT_QUICK_ACTION,
    uiLanguage: stored.aiRewriterUiLanguage || "",
    plan: stored.aiRewriterAccountPlan || ""
  };
  return quickFixSettings;
}

function ensureIconStyles() {
  if (document.getElementById("ai-rewriter-icon-style")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "ai-rewriter-icon-style";
  style.textContent = `
    .ai-rewriter-fab {
      position: absolute;
      z-index: 2147483646;
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border: none;
      border-radius: 7px;
      background: linear-gradient(135deg, #16736b, #285a9f);
      color: #ffffff;
      cursor: pointer;
      padding: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
      font-size: 14px;
      font-weight: 900;
      line-height: 1;
      box-shadow: 0 4px 12px rgba(21, 33, 31, 0.32);
      opacity: 0;
      transform: scale(0.85);
      transition: opacity 120ms ease, transform 120ms ease;
    }
    .ai-rewriter-fab.is-visible {
      opacity: 1;
      transform: scale(1);
    }
    .ai-rewriter-fab:hover {
      box-shadow: 0 6px 16px rgba(40, 90, 159, 0.4);
    }
    .ai-rewriter-fab.is-busy {
      cursor: progress;
    }
    .ai-rewriter-fab.is-busy .ai-rewriter-fab-mark {
      display: none;
    }
    .ai-rewriter-fab.is-busy::after {
      content: "";
      width: 13px;
      height: 13px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: ai-rewriter-spin 0.7s linear infinite;
    }
    .ai-rewriter-menu {
      position: absolute;
      z-index: 2147483647;
      min-width: 190px;
      max-height: 280px;
      overflow-y: auto;
      margin: 0;
      padding: 5px;
      list-style: none;
      border: 1px solid rgba(21, 33, 31, 0.16);
      border-radius: 9px;
      background: #ffffff;
      box-shadow: 0 14px 34px rgba(10, 17, 24, 0.26);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
    }
    .ai-rewriter-menu-title {
      margin: 2px 6px 5px;
      color: #63716e;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .ai-rewriter-menu-item {
      display: block;
      width: 100%;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #15211f;
      cursor: pointer;
      padding: 7px 9px;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.2;
      text-align: left;
    }
    .ai-rewriter-menu-item:hover {
      background: rgba(40, 90, 159, 0.1);
    }
    .ai-rewriter-menu-item.is-active {
      color: #16736b;
      font-weight: 800;
    }
    .ai-rewriter-menu-item.is-active::after {
      content: " \\2713";
    }
  `;
  document.documentElement.append(style);
}

function ensureQuickFixIcon() {
  if (quickFixIcon) {
    return quickFixIcon;
  }
  ensureIconStyles();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ai-rewriter-fab";
  button.setAttribute("aria-label", "Rephraser AI");
  const mark = document.createElement("span");
  mark.className = "ai-rewriter-fab-mark";
  mark.textContent = "R";
  button.append(mark);

  // mousedown : on empeche le champ de perdre le focus avant le clic.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    runQuickFix();
  });
  // Clic droit : menu pour changer le type d'action applique.
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openActionMenu();
  });

  document.documentElement.append(button);
  quickFixIcon = button;
  return button;
}

// Actions proposees au clic droit (point : "modifier le type d'action").
const QUICK_FIX_MENU_ACTIONS = [
  "correct",
  "professionalize",
  "enrich",
  "shorten",
  "formal",
  "casual",
  "reply",
  "promptify",
  "linkedin_message",
  "translate_en",
  "translate_fr",
  "translate_es",
  "translate_de",
  "translate_pt"
];
let quickFixMenu = null;

function closeActionMenu() {
  if (quickFixMenu) {
    quickFixMenu.remove();
    quickFixMenu = null;
    document.removeEventListener("mousedown", onMenuOutsidePointer, true);
    document.removeEventListener("keydown", onMenuKeydown, true);
  }
}

function onMenuOutsidePointer(event) {
  if (quickFixMenu && !quickFixMenu.contains(event.target) && event.target !== quickFixIcon) {
    closeActionMenu();
  }
}

function onMenuKeydown(event) {
  if (event.key === "Escape") {
    closeActionMenu();
  }
}

async function openActionMenu() {
  closeActionMenu();
  if (!quickFixTarget || !quickFixTarget.isConnected) {
    return;
  }
  if (!isExtensionContextValid()) {
    showStaleContextNotice();
    return;
  }

  const paidLanguage = isPaidPlanContent(quickFixSettings.plan) ? quickFixSettings.uiLanguage : "";
  await RephraserI18n.init(paidLanguage);
  ensureIconStyles();

  const menu = document.createElement("div");
  menu.className = "ai-rewriter-menu";
  menu.setAttribute("role", "menu");

  const title = document.createElement("p");
  title.className = "ai-rewriter-menu-title";
  title.textContent = t("quickActionMenuTitle", "Choose an action");
  menu.append(title);

  for (const action of QUICK_FIX_MENU_ACTIONS) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "ai-rewriter-menu-item";
    if (action === quickFixSettings.action) {
      item.classList.add("is-active");
    }
    item.setAttribute("role", "menuitem");
    item.textContent = getActionLabel(action);
    // mousedown : on garde le focus du champ ; on agit au mousedown pour fiabilite.
    // Choix ponctuel : on applique cette action une fois sans changer l'action par defaut
    // (l'icone revient toujours sur "Corriger" au clic gauche).
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeActionMenu();
      runQuickFix(action);
    });
    menu.append(item);
  }

  document.documentElement.append(menu);
  quickFixMenu = menu;

  // Positionnement sous l'icone, en restant dans la fenetre.
  const iconRect = quickFixIcon.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = window.scrollX + iconRect.right - menuRect.width;
  let top = window.scrollY + iconRect.bottom + 4;
  if (left < window.scrollX + 4) {
    left = window.scrollX + 4;
  }
  if (top + menuRect.height > window.scrollY + window.innerHeight) {
    top = window.scrollY + iconRect.top - menuRect.height - 4;
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(window.scrollY + 2, top)}px`;

  document.addEventListener("mousedown", onMenuOutsidePointer, true);
  document.addEventListener("keydown", onMenuKeydown, true);
}

function positionQuickFixIcon() {
  if (!quickFixIcon || !quickFixTarget || !quickFixTarget.isConnected) {
    return;
  }
  const rect = quickFixTarget.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    hideQuickFixIcon();
    return;
  }
  const size = 26;
  const margin = 6;

  // Champ bas : on colle l'icone dans le coin bas-droite. Champ court (input d'une ligne) :
  // on la centre verticalement pour ne pas chevaucher le texte saisi.
  let top;
  if (rect.height <= size + margin * 2) {
    top = window.scrollY + rect.top + (rect.height - size) / 2;
  } else {
    top = window.scrollY + rect.bottom - size - margin;
  }
  const left = window.scrollX + rect.right - size - margin;

  // On garde l'icone visible dans la fenetre.
  const maxLeft = window.scrollX + window.innerWidth - size - 2;
  quickFixIcon.style.top = `${Math.max(window.scrollY + 2, top)}px`;
  quickFixIcon.style.left = `${Math.min(maxLeft, Math.max(window.scrollX + 2, left))}px`;
}

function showQuickFixIcon(target) {
  if (!quickFixSettings.enabled) {
    return;
  }
  clearTimeout(hideIconTimer);
  quickFixTarget = target;
  const icon = ensureQuickFixIcon();
  icon.title = "Rephraser AI";
  positionQuickFixIcon();
  icon.classList.add("is-visible");
}

function hideQuickFixIcon() {
  // On garde l'icone visible tant que le menu d'actions est ouvert ou qu'une requete tourne.
  if (!quickFixIcon || quickFixBusy || quickFixMenu) {
    return;
  }
  quickFixIcon.classList.remove("is-visible");
}

document.addEventListener("focusin", (event) => {
  if (!quickFixSettings.enabled) {
    return;
  }
  if (isQuickFixTarget(event.target)) {
    showQuickFixIcon(event.target);
  }
}, true);

document.addEventListener("focusout", () => {
  // Petit delai pour permettre au clic sur l'icone d'aboutir.
  hideIconTimer = setTimeout(hideQuickFixIcon, 180);
}, true);

window.addEventListener("scroll", () => {
  if (quickFixIcon && quickFixIcon.classList.contains("is-visible")) {
    positionQuickFixIcon();
  }
}, true);

window.addEventListener("resize", () => {
  if (quickFixIcon && quickFixIcon.classList.contains("is-visible")) {
    positionQuickFixIcon();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }
  if (changes.aiRewriterInPageIcon) {
    quickFixSettings.enabled = changes.aiRewriterInPageIcon.newValue !== false;
    if (!quickFixSettings.enabled) {
      hideQuickFixIcon();
    }
  }
  if (changes.aiRewriterQuickAction) {
    quickFixSettings.action = changes.aiRewriterQuickAction.newValue || DEFAULT_QUICK_ACTION;
  }
  if (changes.aiRewriterUiLanguage) {
    quickFixSettings.uiLanguage = changes.aiRewriterUiLanguage.newValue || "";
  }
  if (changes.aiRewriterAccountPlan) {
    quickFixSettings.plan = changes.aiRewriterAccountPlan.newValue || "";
  }
});

async function runQuickFix(overrideAction = null) {
  if (quickFixBusy || !quickFixTarget || !quickFixTarget.isConnected) {
    return;
  }

  // Extension rechargee/mise a jour sur un onglet deja ouvert : on previent au lieu de crasher.
  if (!isExtensionContextValid()) {
    showStaleContextNotice();
    return;
  }

  const target = quickFixTarget;
  const text = readFieldText(target).trim();
  // overrideAction : choix ponctuel via le clic droit. Sinon action par defaut (Corriger).
  const action = overrideAction || quickFixSettings.action || DEFAULT_QUICK_ACTION;
  const paidLanguage = isPaidPlanContent(quickFixSettings.plan) ? quickFixSettings.uiLanguage : "";
  await RephraserI18n.init(paidLanguage);

  if (!text) {
    renderModal({
      actionLabel: getActionLabel(action),
      state: "error",
      error: t("errorEmptyField", "The field is empty.")
    });
    return;
  }

  quickFixBusy = true;
  if (quickFixIcon) {
    quickFixIcon.classList.add("is-busy", "is-visible");
  }

  let settings = null;
  try {
    settings = await chrome.storage.sync.get({
      aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
      aiRewriterUserId: DEFAULT_USER_ID,
      aiRewriterAuthToken: ""
    });

    const result = await requestRewrite({
      backendUrl: settings.aiRewriterBackendUrl,
      userId: settings.aiRewriterUserId,
      authToken: settings.aiRewriterAuthToken || "",
      action,
      text
    });

    await saveResultEntry({
      action,
      actionLabel: getActionLabel(action),
      result: result.text
    });

    const replaced = writeFieldText(target, result.text);

    if (!replaced) {
      // Remplacement impossible : on bascule sur la fenetre resultat habituelle.
      renderModal({
        actionLabel: getActionLabel(action),
        state: "success",
        result: result.text,
        originalText: text,
        usage: result.usage
      });
    }
  } catch (error) {
    if ((error.status === 429 || error.status === 403) && error.payload?.nextPlan) {
      renderModal({
        actionLabel: error.payload?.reason === "paid_feature_required"
          ? t("paidFeatureTitle", "Premium feature")
          : t("quotaReachedTitle", "Quota reached"),
        state: "upgrade",
        error: error.message,
        usage: error.payload.usage,
        upgrade: {
          plan: error.payload.nextPlan,
          backendUrl: settings?.aiRewriterBackendUrl || DEFAULT_BACKEND_URL,
          authToken: settings?.aiRewriterAuthToken || ""
        }
      });
    } else {
      renderModal({
        actionLabel: getActionLabel(action),
        state: "error",
        error: error.message || t("errorGenericReload", "An error occurred. Reload the extension and the tab if it persists.")
      });
    }
  } finally {
    quickFixBusy = false;
    if (quickFixIcon) {
      quickFixIcon.classList.remove("is-busy");
    }
  }
}

// Initialisation des reglages de l'icone au chargement du content script.
refreshQuickFixSettings();
