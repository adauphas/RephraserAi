// PROD : remplacer par l'URL HTTPS de ton backend deploye (a changer aussi dans
// background.js, content.js, le manifest host_permissions et le backend). Voir DEPLOYMENT.md.
const DEFAULT_BACKEND_URL = "https://rephraserai.onrender.com";
const DEFAULT_USER_ID = "user_free";
const LEGACY_BACKEND_URLS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3005",
  "http://127.0.0.1:3005"
]);
const PLAN_RANKS = {
  Free: 0,
  "Free+": 1,
  Premium: 2,
  "Premium+": 3,
  "Premium Pro": 4
};
const ACTION_LABEL_KEYS = {
  correct: "actionCorrect",
  professionalize: "actionProfessionalize",
  enrich: "actionEnrich",
  shorten: "actionShorten",
  reply: "actionReply",
  linkedin_message: "actionLinkedinMessage",
  promptify: "actionPromptify"
};

// Liste des options par offre, reprise du site, pour le menu deroulant de chaque carte.
const PLAN_OPTION_KEYS = {
  "Free+": ["featPromptAi", "featManualLanguage", "featComfortQuota"],
  Premium: ["featComposer", "featHistory", "featLinkedin", "featMoreRequests"],
  "Premium+": ["featHighVolume", "featHistory", "featLongTexts", "featIntensiveDaily"],
  "Premium Pro": ["featMaxVolume", "featHistory", "featVeryLongTexts", "featAdvancedWriting"]
};

const lastResult = document.getElementById("lastResult");
const copyLastResultButton = document.getElementById("copyLastResult");
const historyPanel = document.getElementById("historyPanel");
const historyStatus = document.getElementById("historyStatus");
const historyList = document.getElementById("historyList");
const authForm = document.getElementById("authForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");
const logoutButton = document.getElementById("logoutButton");
const accountStatus = document.getElementById("accountStatus");
const billingStatus = document.getElementById("billingStatus");
const plansList = document.getElementById("plansList");
const accountSignedIn = document.getElementById("accountSignedIn");
const subscriptionManage = document.getElementById("subscriptionManage");
const cancellationNotice = document.getElementById("cancellationNotice");
const cancelSubscriptionButton = document.getElementById("cancelSubscription");
const resumeSubscriptionButton = document.getElementById("resumeSubscription");
const deleteAccountButton = document.getElementById("deleteAccount");
const deleteConfirm = document.getElementById("deleteConfirm");
const deleteCancelButton = document.getElementById("deleteCancel");
const deleteConfirmButton = document.getElementById("deleteConfirmBtn");
const deleteStatus = document.getElementById("deleteStatus");
const openProfileButton = document.getElementById("openProfile");
const closeProfileButton = document.getElementById("closeProfile");
const profileView = document.getElementById("profileView");
const profileEmail = document.getElementById("profileEmail");
const profilePlan = document.getElementById("profilePlan");
const profileStatusValue = document.getElementById("profileStatusValue");
const profileCancelRow = document.getElementById("profileCancelRow");
const profileCancelAt = document.getElementById("profileCancelAt");
const profileUsage = document.getElementById("profileUsage");
const profileUsageBar = document.getElementById("profileUsageBar");
const profileSubStatus = document.getElementById("profileSubStatus");
const uiLanguageSelect = document.getElementById("uiLanguage");
const languageStatus = document.getElementById("languageStatus");
const composerPanel = document.querySelector(".composer-panel");
const composerForm = document.getElementById("composerForm");
const composerText = document.getElementById("composerText");
const composerAction = document.getElementById("composerAction");
const composerSubmit = document.getElementById("composerSubmit");
const composerStatus = document.getElementById("composerStatus");

let languageHintTimer = null;
let lastResultText = "";
let currentHistory = [];
let currentUser = null;
let currentPlans = [];

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
  return (PLAN_RANKS[plan] ?? 0) >= (PLAN_RANKS[minimumPlan] ?? 0);
}

function normalizeBackendUrl(url) {
  return String(url || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

function localizeStaticText() {
  document.documentElement.lang = RephraserI18n.normalizeLanguage(uiLanguageSelect.value || RephraserI18n.getChromeLanguage());

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n, element.textContent);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder, element.getAttribute("placeholder") || ""));
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel, element.getAttribute("aria-label") || ""));
  });
}

function renderLastResult(last) {
  if (last?.result) {
    lastResultText = last.result;
    lastResult.textContent = last.result;
    copyLastResultButton.disabled = false;
    copyLastResultButton.textContent = t("copyButton", "Copy");
    return;
  }

  lastResultText = "";
  lastResult.textContent = t("noResultYet", "No result yet.");
  copyLastResultButton.disabled = true;
  copyLastResultButton.textContent = t("copyButton", "Copy");
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
  const updatedHistory = [normalizedEntry, ...history].filter((item) => item?.result).slice(0, 5);

  await chrome.storage.local.set({
    aiRewriterLastResult: normalizedEntry,
    aiRewriterHistory: updatedHistory
  });

  renderLastResult(normalizedEntry);
  currentHistory = updatedHistory;
  renderHistoryPanel(await getSyncSettings());
}

async function getSyncSettings() {
  return chrome.storage.sync.get({
    aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
    aiRewriterUserId: DEFAULT_USER_ID,
    aiRewriterAuthToken: "",
    aiRewriterAccountEmail: "",
    aiRewriterAccountPlan: "",
    aiRewriterUiLanguage: ""
  });
}

async function applyRuntimeLanguage(settings) {
  const paid = isPaidPlan(getEffectivePlan(settings));
  await RephraserI18n.init(paid ? settings.aiRewriterUiLanguage : "");
  uiLanguageSelect.value = paid ? settings.aiRewriterUiLanguage || "" : "";
  localizeStaticText();
  renderLanguageControl(settings);
  renderComposerControl(settings);
}

async function loadSettings(settings = null) {
  const syncSettings = settings || await getSyncSettings();

  const normalizedBackendUrl = normalizeBackendUrl(syncSettings.aiRewriterBackendUrl);
  const backendUrl = LEGACY_BACKEND_URLS.has(normalizedBackendUrl) ? DEFAULT_BACKEND_URL : normalizedBackendUrl;

  if (backendUrl !== syncSettings.aiRewriterBackendUrl) {
    await chrome.storage.sync.set({
      aiRewriterBackendUrl: backendUrl
    });
  }

  emailInput.value = syncSettings.aiRewriterAccountEmail;
  uiLanguageSelect.value = isPaidPlan(getEffectivePlan(syncSettings)) ? syncSettings.aiRewriterUiLanguage || "" : "";
  renderAccountStatus(syncSettings);
  renderLanguageControl(syncSettings);
  renderComposerControl(syncSettings);
  await loadHistory(syncSettings);
  loadBilling(syncSettings);

  const localSettings = await chrome.storage.local.get("aiRewriterLastResult");
  renderLastResult(localSettings.aiRewriterLastResult);
}

loginButton.addEventListener("click", () => authenticate("login"));
registerButton.addEventListener("click", () => authenticate("register"));

// Permet de se connecter avec la touche Entree depuis le champ email ou mot de passe.
[emailInput, passwordInput].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      authenticate("login");
    }
  });
});

openProfileButton.addEventListener("click", openProfile);
closeProfileButton.addEventListener("click", closeProfile);

logoutButton.addEventListener("click", async () => {
  closeProfile();
  currentUser = null;
  await chrome.storage.sync.set({
    aiRewriterAuthToken: "",
    aiRewriterAccountEmail: "",
    aiRewriterAccountPlan: "",
    aiRewriterUiLanguage: "",
    aiRewriterUserId: DEFAULT_USER_ID
  });
  passwordInput.value = "";
  const settings = { aiRewriterUserId: DEFAULT_USER_ID, aiRewriterAuthToken: "", aiRewriterAccountPlan: "", aiRewriterUiLanguage: "" };
  await applyRuntimeLanguage(settings);
  renderAccountStatus(settings);
  await loadHistory(settings);
  loadBilling(settings);
});

cancelSubscriptionButton.addEventListener("click", cancelCurrentSubscription);
resumeSubscriptionButton.addEventListener("click", resumeCurrentSubscription);

deleteAccountButton.addEventListener("click", () => {
  deleteAccountButton.hidden = true;
  deleteConfirm.hidden = false;
  deleteStatus.textContent = "";
  deleteStatus.className = "delete-status";
});

deleteCancelButton.addEventListener("click", hideDeleteConfirm);
deleteConfirmButton.addEventListener("click", deleteAccountData);

uiLanguageSelect.addEventListener("focus", showLanguageUpgradeHint);
uiLanguageSelect.addEventListener("click", showLanguageUpgradeHint);

uiLanguageSelect.addEventListener("change", async () => {
  const settings = await getSyncSettings();
  const paid = isPaidPlan(getEffectivePlan(settings));
  // Le choix manuel est reserve aux abonnes payants ; sinon on retombe sur la langue de Chrome.
  const language = paid ? uiLanguageSelect.value : "";

  if (!paid) {
    uiLanguageSelect.value = "";
  }

  await chrome.storage.sync.set({ aiRewriterUiLanguage: language });
  const updatedSettings = { ...settings, aiRewriterUiLanguage: language };
  await applyRuntimeLanguage(updatedSettings);
  renderAccountStatus(updatedSettings);
  renderLanguageControl(updatedSettings);
  await loadHistory(updatedSettings);

  // Re-rendre les contenus generes en JS (cartes d'offres, dernier resultat, profil)
  // dans la nouvelle langue : sinon ils restent affiches dans la langue precedente.
  const localLast = await chrome.storage.local.get("aiRewriterLastResult");
  renderLastResult(localLast.aiRewriterLastResult);
  await loadBilling(updatedSettings);

  await chrome.runtime.sendMessage({ type: "AI_REWRITER_REFRESH_MENUS" }).catch(() => null);
});

copyLastResultButton.addEventListener("click", async () => {
  if (!lastResultText) {
    return;
  }

  await navigator.clipboard.writeText(lastResultText);
  copyLastResultButton.textContent = t("copiedButton", "Copied");
  setTimeout(() => {
    copyLastResultButton.textContent = t("copyButton", "Copy");
  }, 1400);
});

async function copyHistoryResult(index, button) {
  const entry = currentHistory[index];

  if (!entry?.result) {
    return;
  }

  await navigator.clipboard.writeText(entry.result);
  const originalText = button.textContent;
  button.textContent = t("copiedButton", "Copied");
  const copiedMessage = button.parentElement.querySelector(".history-copied");
  if (copiedMessage) {
    copiedMessage.textContent = t("historyCopied", "Copied");
  }
  setTimeout(() => {
    button.textContent = originalText;
    if (copiedMessage) {
      copiedMessage.textContent = "";
    }
  }, 1400);
}

composerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = await getSyncSettings();
  const plan = getEffectivePlan(settings);

  if (!isPlanAtLeast(plan, "Premium")) {
    composerStatus.className = "composer-status error";
    composerStatus.textContent = t("composerPremiumHelp", "Available from Premium.");
    return;
  }

  const text = composerText.value.trim();

  if (!text) {
    composerStatus.className = "composer-status error";
    composerStatus.textContent = t("composerEmptyError", "Write or paste text first.");
    return;
  }

  composerSubmit.disabled = true;
  composerStatus.className = "composer-status is-loading";
  composerStatus.textContent = t("composerLoading", "Generating...");

  try {
    const action = composerAction.value;
    const actionLabel = t(ACTION_LABEL_KEYS[action] || "", composerAction.selectedOptions[0]?.textContent || action);
    const response = await chrome.runtime.sendMessage({
      type: "AI_REWRITER_FETCH",
      payload: {
        backendUrl: normalizeBackendUrl(settings.aiRewriterBackendUrl),
        userId: settings.aiRewriterUserId,
        authToken: settings.aiRewriterAuthToken || "",
        action,
        text
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("errorBackendContact", "Unable to reach the backend."));
    }

    await saveResultEntry({
      action,
      actionLabel,
      result: response.payload.text
    });
    composerStatus.className = "composer-status success";
    composerStatus.textContent = t("composerSuccess", "Result generated below.");
  } catch (error) {
    composerStatus.className = "composer-status error";
    composerStatus.textContent = error.message || t("errorGenericReload", "An error occurred.");
  } finally {
    composerSubmit.disabled = false;
    renderComposerControl(await getSyncSettings());
  }
});

async function authenticate(mode) {
  const backendUrl = DEFAULT_BACKEND_URL;
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  accountStatus.className = "";
  accountStatus.textContent = mode === "login" ? t("loginLoading", "Signing in...") : t("registerLoading", "Creating account...");

  try {
    const response = await fetch(`${backendUrl.replace(/\/+$/, "")}/api/auth/${mode}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Authentification impossible.");
    }

    await chrome.storage.sync.set({
      aiRewriterBackendUrl: backendUrl,
      aiRewriterAuthToken: payload.token,
      aiRewriterAccountEmail: payload.user.email,
      aiRewriterAccountPlan: payload.user.plan,
      aiRewriterUserId: payload.user.id
    });

    accountStatus.className = "success";
    accountStatus.textContent = t("accountPlanStatus", "$EMAIL$ - $PLAN$", [payload.user.email, payload.user.plan]);
    passwordInput.value = "";
    await applyRuntimeLanguage({
      aiRewriterUserId: payload.user.id,
      aiRewriterAuthToken: payload.token,
      aiRewriterAccountEmail: payload.user.email,
      aiRewriterAccountPlan: payload.user.plan,
      aiRewriterUiLanguage: uiLanguageSelect.value
    });
    loadBilling({
      aiRewriterBackendUrl: backendUrl,
      aiRewriterAuthToken: payload.token,
      aiRewriterAccountEmail: payload.user.email,
      aiRewriterAccountPlan: payload.user.plan,
      aiRewriterUiLanguage: uiLanguageSelect.value
    });
  } catch (error) {
    accountStatus.className = "error";
    accountStatus.textContent = error.message || "Authentification impossible.";
  }
}

function renderAccountStatus(settings) {
  const signedIn = Boolean(settings.aiRewriterAuthToken);

  // Connecte : on masque les champs de connexion et on affiche l'adresse du compte.
  authForm.hidden = signedIn;
  accountSignedIn.hidden = !signedIn;

  if (!signedIn) {
    hideDeleteConfirm();
  }

  if (signedIn) {
    accountStatus.className = "success";
    accountStatus.textContent = settings.aiRewriterAccountEmail
      ? t("accountSignedInEmail", "You are signed in as $EMAIL$.", [settings.aiRewriterAccountEmail])
      : t("accountConnected", "Account connected");
    return;
  }

  accountStatus.className = "";
  accountStatus.textContent = t("accountSignedOutHint", "Sign in or create an account.");
}

function hideDeleteConfirm() {
  if (deleteConfirm) {
    deleteConfirm.hidden = true;
  }
  if (deleteAccountButton) {
    deleteAccountButton.hidden = false;
  }
  if (deleteStatus) {
    deleteStatus.textContent = "";
    deleteStatus.className = "delete-status";
  }
}

function renderLanguageControl(settings) {
  const paid = isPaidPlan(getEffectivePlan(settings));
  uiLanguageSelect.disabled = false;
  uiLanguageSelect.querySelectorAll("option").forEach((option) => {
    option.disabled = !paid && option.value !== "";
  });

  if (!paid) {
    languageStatus.textContent = t("languagePremiumHelp", "Manual language selection is reserved for paid subscribers.");
    languageStatus.classList.remove("is-visible");
    return;
  }

  languageStatus.textContent = settings.aiRewriterUiLanguage
    ? t("languageManualActive", "Manual language active.")
    : t("languageAutoActive", "Automatic Chrome language active.");
  languageStatus.classList.remove("is-visible");
}

function showLanguageUpgradeHint() {
  getSyncSettings().then((settings) => {
    if (isPaidPlan(getEffectivePlan(settings))) {
      return;
    }

    languageStatus.textContent = t("languagePremiumHelp", "Manual language selection is reserved for paid subscribers.");
    languageStatus.classList.add("is-visible");
    clearTimeout(languageHintTimer);
    languageHintTimer = setTimeout(() => {
      languageStatus.classList.remove("is-visible");
    }, 3600);
  });
}

function renderComposerControl(settings) {
  const unlocked = isPlanAtLeast(getEffectivePlan(settings), "Premium");
  composerPanel.classList.toggle("is-locked", !unlocked);
  composerText.disabled = !unlocked;
  composerAction.disabled = !unlocked;
  composerSubmit.disabled = !unlocked;

  if (!unlocked) {
    composerStatus.className = "composer-status";
    composerStatus.textContent = t("composerPremiumHelp", "Available from Premium.");
  } else if (!composerStatus.textContent || composerStatus.textContent === t("composerPremiumHelp", "Available from Premium.")) {
    composerStatus.className = "composer-status";
    composerStatus.textContent = t("composerReady", "Write directly here, then choose an action.");
  }
}

async function loadHistory(settings = null) {
  const localSettings = await chrome.storage.local.get({
    aiRewriterHistory: []
  });
  currentHistory = Array.isArray(localSettings.aiRewriterHistory) ? localSettings.aiRewriterHistory.filter((item) => item?.result).slice(0, 5) : [];
  renderHistoryPanel(settings);
}

function renderHistoryPanel(settings = null) {
  const effectiveSettings = settings || {
    aiRewriterUserId: DEFAULT_USER_ID
  };
  const unlocked = isPlanAtLeast(getEffectivePlan(effectiveSettings), "Premium");
  historyPanel.classList.toggle("is-locked", !unlocked);
  historyList.textContent = "";

  if (!unlocked) {
    historyStatus.textContent = t("historyPremiumHelp", "History is reserved for Premium subscribers.");
    return;
  }

  if (!currentHistory.length) {
    historyStatus.textContent = t("historyEmpty", "No history yet.");
    return;
  }

  historyStatus.textContent = "";

  currentHistory.forEach((entry, index) => {
    const item = document.createElement("article");
    item.className = "history-item";

    const meta = document.createElement("div");
    meta.className = "history-meta";

    const action = document.createElement("strong");
    action.textContent = entry.actionLabel || t("genericAction", "Action");

    const date = document.createElement("span");
    date.textContent = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : "";
    meta.append(action, date);

    const preview = document.createElement("p");
    preview.textContent = entry.result;

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "secondary-button compact-button";
    copyButton.textContent = t("copyButton", "Copy");
    copyButton.addEventListener("click", () => copyHistoryResult(index, copyButton));

    const copied = document.createElement("span");
    copied.className = "history-copied";
    copied.setAttribute("aria-live", "polite");
    actions.append(copyButton, copied);

    item.append(meta, preview, actions);
    historyList.append(item);
  });
}

async function loadBilling(settings = null) {
  const currentSettings = settings || await chrome.storage.sync.get({
    aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
    aiRewriterAuthToken: "",
    aiRewriterAccountEmail: "",
    aiRewriterAccountPlan: "",
    aiRewriterUserId: DEFAULT_USER_ID
  });
  const backendUrl = normalizeBackendUrl(currentSettings.aiRewriterBackendUrl || DEFAULT_BACKEND_URL);
  const authToken = currentSettings.aiRewriterAuthToken || "";

  plansList.textContent = "";
  billingStatus.className = "";
  billingStatus.textContent = t("plansLoading", "Loading plans...");

  try {
    const plansResponse = await fetch(`${backendUrl}/api/billing/plans`);
    const plansPayload = await plansResponse.json().catch(() => ({}));

    if (!plansResponse.ok) {
      throw new Error(plansPayload.error || t("errorPlansLoad", "Unable to load plans."));
    }

    let user = null;
    if (authToken) {
      const meResponse = await fetch(`${backendUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const mePayload = await meResponse.json().catch(() => ({}));

      if (!meResponse.ok) {
        throw new Error(mePayload.error || t("errorSessionExpired", "Session expired. Sign in again."));
      }

      user = mePayload.user;
      await chrome.storage.sync.set({
        aiRewriterAccountEmail: user.email,
        aiRewriterAccountPlan: user.plan,
        aiRewriterUserId: user.id
      });
      const latestSettings = await getSyncSettings();
      await applyRuntimeLanguage({
        ...latestSettings,
        aiRewriterAccountEmail: user.email,
        aiRewriterAccountPlan: user.plan,
        aiRewriterUserId: user.id
      });
      renderAccountStatus({
        aiRewriterAuthToken: authToken,
        aiRewriterAccountEmail: user.email,
        aiRewriterAccountPlan: user.plan,
        aiRewriterUiLanguage: latestSettings.aiRewriterUiLanguage
      });
      await loadHistory({
        ...latestSettings,
        aiRewriterAccountEmail: user.email,
        aiRewriterAccountPlan: user.plan,
        aiRewriterUserId: user.id
      });
    }

    renderPlans(plansPayload.plans || [], user, authToken, getEffectivePlan(currentSettings));
  } catch (error) {
    billingStatus.className = "error";
    billingStatus.textContent = error.message || t("errorBillingLoad", "Unable to load subscription.");
  }
}

function renderPlans(plans, user, authToken, effectivePlan = "Free") {
  // L'offre courante vient du compte connecte si disponible, sinon de l'offre
  // effective (y compris en mode demo via l'utilisateur de test selectionne).
  const currentPlan = user?.plan || effectivePlan || "Free";
  const currentRank = PLAN_RANKS[currentPlan] ?? 0;

  currentPlans = Array.isArray(plans) ? plans : [];
  currentUser = user || null;

  // Point 1 : on n'affiche que l'offre courante et les offres superieures, afin de ne
  // jamais proposer a l'utilisateur de revenir vers une offre moins chere.
  const paidPlans = plans.filter((plan) => {
    if (plan.monthlyPriceEur <= 0) {
      return false;
    }
    return (PLAN_RANKS[plan.name] ?? 0) >= currentRank;
  });

  if (user) {
    billingStatus.className = "success";
    billingStatus.textContent = t("billingCurrentPlan", "$EMAIL$ - plan $PLAN$", [user.email, currentPlan]);
  } else {
    billingStatus.className = "";
    billingStatus.textContent = t("billingSignedOutSubscribe", "Sign in to subscribe or change plan.");
  }

  renderSubscriptionControls(user);

  plansList.textContent = "";

  for (const plan of paidPlans) {
    const card = document.createElement("article");
    const isCurrent = currentPlan === plan.name;
    card.className = `plan-card${plan.name === "Premium" ? " is-featured" : ""}${isCurrent ? " is-current" : ""}`;

    const planTop = document.createElement("div");
    planTop.className = "plan-top";

    const title = document.createElement("h3");
    title.textContent = plan.name;

    if (plan.name === "Premium") {
      const badge = document.createElement("span");
      badge.className = "plan-badge";
      badge.textContent = t("popularBadge", "Popular");
      planTop.append(title, badge);
    } else if (isCurrent) {
      const badge = document.createElement("span");
      badge.className = "plan-badge current";
      badge.textContent = t("currentBadge", "Current");
      planTop.append(title, badge);
    } else {
      planTop.append(title);
    }

    const price = document.createElement("p");
    price.className = "plan-price";
    price.textContent = `${String(plan.monthlyPriceEur).replace(".", ",")} EUR `;
    const priceSuffix = document.createElement("span");
    priceSuffix.textContent = t("perMonth", "/ month");
    price.append(priceSuffix);

    const details = document.createElement("p");
    details.className = "plan-details";
    details.textContent = t("planDetails", "$DAILY$ requests/day, $MONTHLY$ requests/month, $CHARS$ characters/request.", [
      String(plan.dailyRequests),
      String(plan.monthlyRequests),
      String(plan.characterLimit)
    ]);

    const metrics = document.createElement("div");
    metrics.className = "plan-metrics";
    metrics.append(
      createPlanMetric(String(plan.monthlyRequests), t("metricMonthly", "month")),
      createPlanMetric(String(plan.dailyRequests), t("metricDaily", "day")),
      createPlanMetric(String(plan.characterLimit), t("metricCharacters", "chars"))
    );

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = isCurrent ? t("currentPlanButton", "Current plan") : t("choosePlanButton", "Choose");
    button.disabled = isCurrent;
    button.className = isCurrent ? "secondary-button" : "";
    button.addEventListener("click", () => {
      // Si pas connecte, on dirige vers la creation de compte au lieu de bloquer le bouton.
      if (!authToken) {
        promptSignup();
        return;
      }
      startCheckout(plan.name, button);
    });

    card.append(planTop, price, metrics, details);

    const extra = createPlanOptions(plan.name);
    if (extra) {
      card.append(extra);
    }

    card.append(button);
    plansList.append(card);
  }

  if (!profileView.hidden) {
    renderProfile(currentUser);
  }
}

function createPlanMetric(value, label) {
  const metric = document.createElement("div");
  metric.className = "plan-metric";
  const number = document.createElement("strong");
  number.textContent = value;
  const caption = document.createElement("span");
  caption.textContent = label;
  metric.append(number, caption);
  return metric;
}

// Menu deroulant des options d'une offre, comme sur le site.
function createPlanOptions(planName) {
  const optionKeys = PLAN_OPTION_KEYS[planName];

  if (!optionKeys || !optionKeys.length) {
    return null;
  }

  const extra = document.createElement("details");
  extra.className = "plan-extra";

  const summary = document.createElement("summary");
  summary.textContent = t("planOptionsSummary", "See $PLAN$ options", [planName]);
  extra.append(summary);

  const list = document.createElement("ul");
  list.className = "plan-extra-list";

  for (const key of optionKeys) {
    const item = document.createElement("li");
    item.textContent = t(key, key);
    list.append(item);
  }

  extra.append(list);
  return extra;
}

function formatDate(isoDate) {
  if (!isoDate) {
    return "";
  }
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const locale = RephraserI18n.normalizeLanguage(uiLanguageSelect.value || RephraserI18n.getChromeLanguage());
  return date.toLocaleDateString(locale || undefined, { year: "numeric", month: "long", day: "numeric" });
}

function planStatusLabel(status) {
  switch (status) {
    case "active":
      return t("statusActive", "Active");
    case "canceling":
      return t("statusCanceling", "Cancellation scheduled");
    case "free":
      return t("statusFree", "Free");
    default:
      return status || "-";
  }
}

// Interface Profil : administration globale du compte.
function openProfile() {
  renderProfile(currentUser);
  profileSubStatus.textContent = "";
  profileSubStatus.className = "profile-sub-status";
  hideDeleteConfirm();
  profileView.hidden = false;
  document.body.classList.add("profile-open");
  profileView.scrollTop = 0;
}

function closeProfile() {
  profileView.hidden = true;
  document.body.classList.remove("profile-open");
  hideDeleteConfirm();
}

function renderProfile(user) {
  if (!user) {
    return;
  }

  profileEmail.textContent = user.email || "-";
  profilePlan.textContent = user.plan || "-";
  profileStatusValue.textContent = planStatusLabel(user.subscriptionStatus);

  if (user.subscriptionStatus === "canceling" && user.subscriptionCancelAt) {
    profileCancelRow.hidden = false;
    profileCancelAt.textContent = formatDate(user.subscriptionCancelAt);
  } else {
    profileCancelRow.hidden = true;
  }

  // Consommation mensuelle par rapport au quota de l'offre.
  const planInfo = currentPlans.find((plan) => plan.name === user.plan);
  const used = Number(user.monthlyUsage || 0);
  const limit = planInfo ? Number(planInfo.monthlyRequests) : 0;

  if (limit > 0) {
    profileUsage.textContent = t("profileUsageValue", "$USED$ / $LIMIT$ requests this month", [String(used), String(limit)]);
    const pct = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
    profileUsageBar.style.width = `${pct}%`;
  } else {
    profileUsage.textContent = t("profileUsageValueSimple", "$USED$ requests this month", [String(used)]);
    profileUsageBar.style.width = "0%";
  }

  renderSubscriptionControls(user);
}

// Point 3 : zone de gestion de l'abonnement (annulation avec date d'effet, reprise).
function renderSubscriptionControls(user) {
  const paidActive = Boolean(user) && isPaidPlan(user.plan);

  if (!paidActive) {
    subscriptionManage.hidden = true;
    return;
  }

  subscriptionManage.hidden = false;
  const isCanceling = user.subscriptionStatus === "canceling" && Boolean(user.subscriptionCancelAt);

  if (isCanceling) {
    cancellationNotice.hidden = false;
    cancellationNotice.className = "cancellation-notice is-scheduled";
    cancellationNotice.textContent = t(
      "cancellationScheduled",
      "Subscription cancelled. Paid access remains until $DATE$, then switches to Free.",
      [formatDate(user.subscriptionCancelAt)]
    );
    cancelSubscriptionButton.hidden = true;
    resumeSubscriptionButton.hidden = false;
  } else {
    cancellationNotice.hidden = true;
    cancellationNotice.textContent = "";
    cancelSubscriptionButton.hidden = false;
    cancelSubscriptionButton.disabled = false;
    cancelSubscriptionButton.textContent = t("cancelSubscriptionButton", "Cancel subscription");
    resumeSubscriptionButton.hidden = true;
  }
}

async function cancelCurrentSubscription() {
  const settings = await chrome.storage.sync.get({
    aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
    aiRewriterAuthToken: ""
  });

  if (!settings.aiRewriterAuthToken) {
    return;
  }

  const backendUrl = normalizeBackendUrl(settings.aiRewriterBackendUrl);
  cancelSubscriptionButton.disabled = true;
  cancelSubscriptionButton.textContent = t("cancelLoading", "Cancelling...");

  try {
    const response = await fetch(`${backendUrl}/api/billing/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.aiRewriterAuthToken}`,
        "Content-Type": "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || t("cancelError", "Unable to cancel the subscription."));
    }

    await loadBilling();
    profileSubStatus.className = "profile-sub-status success";
    profileSubStatus.textContent = t(
      "cancellationScheduled",
      "Subscription cancelled. Paid access remains until $DATE$, then switches to Free.",
      [formatDate(payload.effectiveDate)]
    );
  } catch (error) {
    profileSubStatus.className = "profile-sub-status error";
    profileSubStatus.textContent = error.message || t("cancelError", "Unable to cancel the subscription.");
    cancelSubscriptionButton.disabled = false;
    cancelSubscriptionButton.textContent = t("cancelSubscriptionButton", "Cancel subscription");
  }
}

async function resumeCurrentSubscription() {
  const settings = await chrome.storage.sync.get({
    aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
    aiRewriterAuthToken: ""
  });

  if (!settings.aiRewriterAuthToken) {
    return;
  }

  const backendUrl = normalizeBackendUrl(settings.aiRewriterBackendUrl);
  resumeSubscriptionButton.disabled = true;
  resumeSubscriptionButton.textContent = t("opening", "...");

  try {
    const response = await fetch(`${backendUrl}/api/billing/resume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.aiRewriterAuthToken}`,
        "Content-Type": "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || t("resumeError", "Unable to resume the subscription."));
    }

    await loadBilling();
    profileSubStatus.className = "profile-sub-status success";
    profileSubStatus.textContent = t("subscriptionResumed", "Subscription resumed.");
  } catch (error) {
    profileSubStatus.className = "profile-sub-status error";
    profileSubStatus.textContent = error.message || t("resumeError", "Unable to resume the subscription.");
  } finally {
    resumeSubscriptionButton.disabled = false;
    resumeSubscriptionButton.textContent = t("resumeSubscriptionButton", "Resume subscription");
  }
}

// Point 4 : droit a l'effacement (RGPD) avec garde-fou de confirmation.
async function deleteAccountData() {
  const settings = await chrome.storage.sync.get({
    aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
    aiRewriterAuthToken: ""
  });

  if (!settings.aiRewriterAuthToken) {
    return;
  }

  const backendUrl = normalizeBackendUrl(settings.aiRewriterBackendUrl);
  deleteConfirmButton.disabled = true;
  deleteCancelButton.disabled = true;
  deleteStatus.className = "delete-status";
  deleteStatus.textContent = t("deleteLoading", "Deleting...");

  try {
    const response = await fetch(`${backendUrl}/api/auth/me`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${settings.aiRewriterAuthToken}`
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || t("deleteError", "Unable to delete your data."));
    }

    // Effacement local complet : on revient a l'etat deconnecte.
    await chrome.storage.sync.set({
      aiRewriterAuthToken: "",
      aiRewriterAccountEmail: "",
      aiRewriterAccountPlan: "",
      aiRewriterUiLanguage: "",
      aiRewriterUserId: DEFAULT_USER_ID
    });
    await chrome.storage.local.remove(["aiRewriterLastResult", "aiRewriterHistory"]);

    passwordInput.value = "";
    emailInput.value = "";
    currentUser = null;
    hideDeleteConfirm();
    closeProfile();

    const signedOut = {
      aiRewriterUserId: DEFAULT_USER_ID,
      aiRewriterAuthToken: "",
      aiRewriterAccountPlan: "",
      aiRewriterUiLanguage: ""
    };
    await applyRuntimeLanguage(signedOut);
    renderAccountStatus(signedOut);
    currentHistory = [];
    renderLastResult(null);
    await loadHistory(signedOut);
    await loadBilling(signedOut);

    // Affiche le message de succes apres le rechargement, pour qu'il ne soit pas ecrase.
    billingStatus.className = "success";
    billingStatus.textContent = t("deleteSuccess", "Your data has been deleted.");
  } catch (error) {
    deleteStatus.className = "delete-status error";
    deleteStatus.textContent = error.message || t("deleteError", "Unable to delete your data.");
    deleteConfirmButton.disabled = false;
    deleteCancelButton.disabled = false;
  }
}

// Invite a creer un compte / se connecter avant de souscrire (bouton "Choisir" hors connexion).
function promptSignup() {
  authForm.scrollIntoView({ behavior: "smooth", block: "center" });
  emailInput.focus();
  accountStatus.className = "";
  accountStatus.textContent = t("signupToSubscribe", "Create an account to subscribe.");
}

async function startCheckout(planName, button) {
  const settings = await chrome.storage.sync.get({
    aiRewriterBackendUrl: DEFAULT_BACKEND_URL,
    aiRewriterAuthToken: ""
  });
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = t("opening", "Opening...");
  billingStatus.className = "";
  billingStatus.textContent = t("paymentCreating", "Creating payment for $PLAN$...", [planName]);

  try {
    const checkout = await chrome.runtime.sendMessage({
      type: "AI_REWRITER_CHECKOUT",
      payload: {
        backendUrl: normalizeBackendUrl(settings.aiRewriterBackendUrl),
        authToken: settings.aiRewriterAuthToken,
        plan: planName
      }
    });

    if (!checkout?.ok) {
      throw new Error(checkout?.error || t("errorCheckoutOpen", "Unable to open Stripe Checkout."));
    }

    billingStatus.className = "success";
    billingStatus.textContent = t("checkoutOpenedTab", "Stripe Checkout is open in a new tab.");
    button.textContent = t("checkoutOpened", "Checkout opened");
  } catch (error) {
    billingStatus.className = "error";
    billingStatus.textContent = error.message || t("errorCheckoutOpen", "Unable to open Stripe Checkout.");
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function initializePopup() {
  const settings = await getSyncSettings();
  await applyRuntimeLanguage(settings);
  await loadSettings(settings);
}

initializePopup();
