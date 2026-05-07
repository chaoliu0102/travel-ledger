const STORAGE_KEYS = {
  expenses: "travel-split.expenses",
  settings: "travel-split.settings",
  activities: "travel-split.activities",
};

const SHEET_ID = "1Fw2OaJ3UzGdq0GW7XBor7dOPCi6Tm_qwqIzqogMug1Y";
const URL_HISTORY_SHEET = "AppScriptUrls";

const CURRENCY_LABELS = {
  TWD: "台幣",
  MOP: "澳門元",
  HKD: "港幣",
  JPY: "日圓",
  USD: "美元",
  KRW: "韓元",
  EUR: "歐元",
  GBP: "英鎊",
  SGD: "新加坡元",
  THB: "泰銖",
  CNY: "人民幣",
};

const DEFAULT_PROJECT = {
  name: "澳門 2026",
  currencies: ["TWD", "MOP"],
  people: ["兆", "婷"],
  exchangeRates: { MOP: 4 },
};

const DEFAULT_SETTINGS = {
  endpointUrl: "",
  projects: [DEFAULT_PROJECT],
  currentProject: DEFAULT_PROJECT.name,
};

const form = document.querySelector("#expenseForm");
const settingsDialog = document.querySelector("#settingsDialog");
const helpDialog = document.querySelector("#helpDialog");
const projectDialog = document.querySelector("#projectDialog");
const settingsButton = document.querySelector("#settingsButton");
const helpButton = document.querySelector("#helpButton");
const spentDateInput = document.querySelector("#spentDate");
const amountInput = document.querySelector("#amount");
const buyerInput = document.querySelector("#buyer");
const payerInput = document.querySelector("#payer");
const endpointUrlInput = document.querySelector("#endpointUrl");
const importProjectInput = document.querySelector("#importProjectInput");
const importProjectButton = document.querySelector("#importProjectButton");
const projectSelect = document.querySelector("#projectSelect");
const addProjectButton = document.querySelector("#addProjectButton");
const editProjectButton = document.querySelector("#editProjectButton");
const deleteProjectButton = document.querySelector("#deleteProjectButton");
const projectNameInput = document.querySelector("#projectNameInput");
const projectPeopleInput = document.querySelector("#projectPeopleInput");
const projectCurrencyOptions = document.querySelector("#projectCurrencyOptions");
const projectExchangeRateInput = document.querySelector("#projectExchangeRateInput");
const fetchRateButton = document.querySelector("#fetchRateButton");
const saveProjectButton = document.querySelector("#saveProjectButton");
const projectDialogTitle = document.querySelector("#projectDialogTitle");
const currencyOptions = document.querySelector("#currencyOptions");
const submitExpenseButton = document.querySelector("#submitExpenseButton");
const cancelEditExpenseButton = document.querySelector("#cancelEditExpenseButton");
const todayTotal = document.querySelector("#todayTotal");
const pendingCount = document.querySelector("#pendingCount");
const recentList = document.querySelector("#recentList");
const personFilter = document.querySelector("#personFilter");
const personSummary = document.querySelector("#personSummary");
const personList = document.querySelector("#personList");
const statsGrid = document.querySelector("#statsGrid");
const settlementList = document.querySelector("#settlementList");
const toast = document.querySelector("#toast");
const connectionBanner = document.querySelector("#connectionBanner");
const connectionStatus = document.querySelector("#connectionStatus");
const installButton = document.querySelector("#installButton");
const refreshCloudButton = document.querySelector("#refreshCloudButton");
const shareButton = document.querySelector("#shareButton");

let deferredInstallPrompt = null;
let projectDialogMode = "create";
let originalProjectName = "";
let editingExpenseId = "";
let autoRefreshTimer = 0;

let expenses = loadJson(STORAGE_KEYS.expenses, []);
let settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...loadJson(STORAGE_KEYS.settings, {}) });
let activities = loadJson(STORAGE_KEYS.activities, []);
expenses = expenses.map((expense) => ({
  ...expense,
  id: expense.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
  projectName: expense.projectName || settings.currentProject,
  projectCurrencies: expense.projectCurrencies || getProjectCurrencies(settings.currentProject),
}));
saveJson(STORAGE_KEYS.settings, settings);
saveJson(STORAGE_KEYS.expenses, expenses);
saveJson(STORAGE_KEYS.activities, activities);

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeList(value, fallback) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items.map((item) => String(item).trim()).filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : fallback;
}

function normalizeCurrencies(value) {
  const currencies = normalizeList(value, []);
  const validCurrencies = currencies.filter((currency) => CURRENCY_LABELS[currency]);
  return ["TWD", ...validCurrencies.filter((currency) => currency !== "TWD")];
}

function normalizeProjects(projects) {
  const source = Array.isArray(projects) ? projects : [];
  const normalized = source
    .map((project) => {
      if (typeof project === "string") {
        return { name: project.trim(), currencies: ["TWD", "MOP"], people: DEFAULT_PROJECT.people, exchangeRates: DEFAULT_PROJECT.exchangeRates };
      }
      const currencies = normalizeCurrencies(project?.currencies || ["TWD", "MOP"]);
      return {
        name: String(project?.name || "").trim(),
        currencies,
        people: normalizeList(project?.people, DEFAULT_PROJECT.people),
        exchangeRates: normalizeExchangeRates(project?.exchangeRates, currencies),
      };
    })
    .filter((project) => project.name);

  const unique = [];
  const seen = new Set();
  for (const project of normalized) {
    if (seen.has(project.name)) continue;
    seen.add(project.name);
    unique.push(project);
  }
  return unique.length ? unique : [DEFAULT_PROJECT];
}

function normalizeExchangeRates(value, currencies) {
  const rates = { ...(value || {}) };
  for (const currency of currencies) {
    if (currency === "TWD") continue;
    const number = Number(rates[currency]);
    rates[currency] = Number.isFinite(number) && number > 0 ? number : 1;
  }
  return rates;
}

function normalizeSettings(nextSettings) {
  const projects = normalizeProjects(nextSettings.projects);
  const currentProject = projects.some((project) => project.name === nextSettings.currentProject)
    ? nextSettings.currentProject
    : projects[0].name;
  return {
    endpointUrl: nextSettings.endpointUrl || "",
    projects,
    currentProject,
  };
}

function todayDateValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function formatDateForSheet(value) {
  const [, month, day] = value.split("-");
  return `${month}-${day}`;
}

function formatMoney(value, currency) {
  const number = Number(value || 0);
  const prefix = currency === "TWD" ? "NT$" : `${currency} `;
  return `${prefix}${new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: currency === "TWD" || currency === "JPY" || currency === "KRW" ? 0 : 2,
  }).format(number)}`;
}

function formatShortDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTotals(totals, currencies = getCurrentProject().currencies) {
  return currencies.map((currency) => formatMoney(totals[currency] || 0, currency)).join(" / ");
}

function totalAsTwd(totals, project = getCurrentProject()) {
  return project.currencies.reduce((sum, currency) => {
    const amount = Number(totals[currency] || 0);
    if (currency === "TWD") return sum + amount;
    return sum + amount * Number(project.exchangeRates?.[currency] || 1);
  }, 0);
}

function currencyBreakdown(totals, currencies = getCurrentProject().currencies) {
  return currencies
    .filter((currency) => Number(totals[currency] || 0) !== 0)
    .map((currency) => `${CURRENCY_LABELS[currency] || currency} ${formatMoney(totals[currency] || 0, currency)}`)
    .join(" · ") || "尚無消費";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function updateConnectionStatus() {
  const online = navigator.onLine;
  connectionBanner.classList.toggle("is-offline", !online);
  connectionStatus.textContent = online ? "連線正常" : "離線中，資料會先保存在本機";
}

function buildEndpointUrl(params) {
  const separator = settings.endpointUrl.includes("?") ? "&" : "?";
  return `${settings.endpointUrl}${separator}${params.toString()}`;
}

function requestScript(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callbackName = `travelSplitCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("連線逾時，請確認 Apps Script URL 與部署權限"));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (result) => {
      cleanup();
      if (!result || result.ok === false) {
        reject(new Error(result?.error || "同步失敗"));
        return;
      }
      resolve(result);
    };

    const joiner = url.includes("?") ? "&" : "?";
    script.src = `${url}${joiner}callback=${encodeURIComponent(callbackName)}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("無法連線到 Apps Script"));
    };
    document.body.append(script);
  });
}

function requestJsonp(url, callbackParam, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callbackName = `travelSplitJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("連線逾時"));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (result) => {
      cleanup();
      resolve(result);
    };

    if (url.includes("__CALLBACK__")) {
      script.src = url.replace("__CALLBACK__", encodeURIComponent(callbackName));
    } else {
      const joiner = url.includes("?") ? "&" : "?";
      script.src = `${url}${joiner}${callbackParam}=${encodeURIComponent(callbackName)}`;
    }
    script.onerror = () => {
      cleanup();
      reject(new Error("無法讀取 Google Sheet 設定"));
    };
    document.body.append(script);
  });
}

async function fetchLatestEndpointFromSheet() {
  const params = new URLSearchParams({
    sheet: URL_HISTORY_SHEET,
    tqx: "out:json;responseHandler:__CALLBACK__",
    tq: "select A,B",
    ts: String(Date.now()),
  });
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params.toString()}`;
  const result = await requestJsonp(url, "callback");
  const rows = result?.table?.rows || [];
  const urls = rows
    .map((row) => String(row.c?.[1]?.v || row.c?.[1]?.f || "").trim())
    .filter((value) => value.startsWith("https://script.google.com/macros/s/"));
  return urls.at(-1) || "";
}

async function fetchLatestEndpointFromCurrentEndpoint() {
  if (!settings.endpointUrl) return "";
  const params = new URLSearchParams({
    action: "latestEndpoint",
    ts: String(Date.now()),
  });
  const result = await requestScript(buildEndpointUrl(params));
  return String(result.endpointUrl || "").trim();
}

async function initializeEndpointUrlFromSheet() {
  try {
    let latestUrl = "";
    try {
      latestUrl = await fetchLatestEndpointFromCurrentEndpoint();
    } catch {
      latestUrl = "";
    }
    if (!latestUrl) latestUrl = await fetchLatestEndpointFromSheet();
    if (!latestUrl || latestUrl === settings.endpointUrl) return false;
    settings = normalizeSettings({
      ...settings,
      endpointUrl: latestUrl,
    });
    saveJson(STORAGE_KEYS.settings, settings);
    applySettingsToUi();
    showToast("已自動帶入最新 Apps Script URL");
    return true;
  } catch {
    return false;
  }
}

function getPeople() {
  const projectPeople = normalizeList(getCurrentProject().people, []);
  return projectPeople.length ? projectPeople : DEFAULT_PROJECT.people;
}

function getProjects() {
  return settings.projects;
}

function getCurrentProject() {
  return getProjects().find((project) => project.name === settings.currentProject) || getProjects()[0];
}

function getProjectCurrencies(projectName) {
  const project = getProjects().find((item) => item.name === projectName) || getCurrentProject();
  return project.currencies;
}

function getCurrentExpenses() {
  const currentProject = getCurrentProject();
  return expenses.filter((expense) => expense.projectName === currentProject.name);
}

function setCurrentProject(projectName) {
  settings.currentProject = projectName;
  saveJson(STORAGE_KEYS.settings, settings);
  fillProjectSelect();
  fillPeopleSelects();
  fillCurrencyOptions();
  render();
}

function scheduleProjectCloudRefresh() {
  if (!settings.endpointUrl || !navigator.onLine) return;
  window.clearTimeout(autoRefreshTimer);
  autoRefreshTimer = window.setTimeout(() => {
    refreshFromCloud({ silent: true }).catch(() => {});
  }, 180);
}

function makeCurrencyTotals(currencies = getCurrentProject().currencies) {
  return Object.fromEntries(currencies.map((currency) => [currency, 0]));
}

function addToTotals(totals, currency, amount) {
  totals[currency] = (totals[currency] || 0) + Number(amount || 0);
}

function fillPeopleSelects() {
  const people = getPeople();
  for (const select of [buyerInput, payerInput, personFilter]) {
    const current = select.value;
    select.innerHTML = "";
    for (const person of people) {
      const option = document.createElement("option");
      option.value = person;
      option.textContent = person;
      select.append(option);
    }
    if (people.includes(current)) select.value = current;
  }
}

function fillProjectSelect() {
  const currentProject = getCurrentProject();
  projectSelect.innerHTML = "";
  for (const project of getProjects()) {
    const option = document.createElement("option");
    option.value = project.name;
    option.textContent = project.name;
    projectSelect.append(option);
  }
  projectSelect.value = currentProject.name;
}

function fillCurrencyOptions() {
  const currentProject = getCurrentProject();
  currencyOptions.innerHTML = "";
  currencyOptions.style.gridTemplateColumns = `repeat(${currentProject.currencies.length}, minmax(0, 1fr))`;

  for (const currency of currentProject.currencies) {
    const input = document.createElement("input");
    input.type = "radio";
    input.id = `currency${currency}`;
    input.name = "currency";
    input.value = currency;
    if (currency === currentProject.currencies[0]) input.checked = true;

    const label = document.createElement("label");
    label.htmlFor = input.id;
    label.textContent = CURRENCY_LABELS[currency] || currency;

    currencyOptions.append(input, label);
  }
}

function fillProjectCurrencyOptions() {
  const currentProject = getCurrentProject();
  projectCurrencyOptions.innerHTML = "";
  for (const [currency, label] of Object.entries(CURRENCY_LABELS)) {
    const item = document.createElement("label");
    item.className = "check-field compact-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "projectCurrency";
    input.value = currency;
    input.checked = currentProject.currencies.includes(currency);
    if (currency === "TWD") {
      input.checked = true;
      input.disabled = true;
    }

    const text = document.createElement("span");
    text.textContent = label;
    item.append(input, text);
  projectCurrencyOptions.append(item);
  }
  updateProjectExchangeRateInput();
}

projectCurrencyOptions.addEventListener("change", updateProjectExchangeRateInput);
fetchRateButton.addEventListener("click", fetchLatestExchangeRate);

function updateProjectExchangeRateInput() {
  const currentProject = getCurrentProject();
  const destinationCurrency =
    [...projectCurrencyOptions.querySelectorAll('input[name="projectCurrency"]:checked')]
      .map((input) => input.value)
      .find((currency) => currency !== "TWD") || currentProject.currencies.find((currency) => currency !== "TWD");
  projectExchangeRateInput.disabled = !destinationCurrency;
  projectExchangeRateInput.value = destinationCurrency ? Number(currentProject.exchangeRates?.[destinationCurrency] || 1) : "";
  projectExchangeRateInput.placeholder = destinationCurrency ? `1 ${CURRENCY_LABELS[destinationCurrency] || destinationCurrency} = ? TWD` : "僅台幣時不需填";
  fetchRateButton.disabled = !destinationCurrency || !navigator.onLine;
}

async function fetchLatestExchangeRate() {
  const destinationCurrency =
    [...projectCurrencyOptions.querySelectorAll('input[name="projectCurrency"]:checked')]
      .map((input) => input.value)
      .find((currency) => currency !== "TWD") || getCurrentProject().currencies.find((currency) => currency !== "TWD");
  if (!destinationCurrency) {
    showToast("僅台幣專案不需更新匯率");
    return;
  }

  try {
    fetchRateButton.disabled = true;
    const response = await fetch(`https://api.frankfurter.dev/v2/rates/latest?base=${encodeURIComponent(destinationCurrency)}&symbols=TWD`);
    const data = await response.json();
    const rate = Number(data?.rates?.TWD);
    if (!response.ok || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("匯率服務暫時沒有此幣別資料");
    }
    projectExchangeRateInput.value = rate.toFixed(4);
    showToast(`已更新匯率：1 ${destinationCurrency} = ${rate.toFixed(4)} TWD`);
  } catch (error) {
    showToast(error.message || "無法更新匯率，請手動輸入");
  } finally {
    fetchRateButton.disabled = false;
  }
}

function applySettingsToUi() {
  endpointUrlInput.value = settings.endpointUrl;
  fillPeopleSelects();
  fillProjectSelect();
  fillCurrencyOptions();
}

function buildExpense(formData) {
  const currency = formData.get("currency");
  const amount = Number(formData.get("amount"));
  const currentProject = getCurrentProject();
  const existing = editingExpenseId ? expenses.find((expense) => expense.id === editingExpenseId) : null;
  const id = existing?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  return {
    ...existing,
    id,
    projectName: currentProject.name,
    projectCurrencies: currentProject.currencies,
    date: formData.get("spentDate"),
    sheetDate: formatDateForSheet(formData.get("spentDate")),
    merchant: String(formData.get("merchant") || "").trim(),
    summary: String(formData.get("summary") || "").trim(),
    paymentMethod: formData.get("paymentMethod"),
    currency,
    amount,
    buyer: formData.get("buyer"),
    payer: formData.get("payer"),
    note: String(formData.get("note") || "").trim(),
    settled: formData.get("settled") === "on",
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    syncMode: existing ? "update" : "append",
  };
}

function mutationLabel(type) {
  if (type === "update") return "修改";
  if (type === "delete") return "刪除";
  return "新增";
}

function activityFromExpense(expense, type) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    expenseId: expense.id,
    projectName: expense.projectName,
    type,
    timestamp: new Date().toISOString(),
    date: expense.sheetDate || formatDateForSheet(expense.date || todayDateValue()),
    merchant: expense.merchant || "",
    summary: expense.summary || "",
    currency: expense.currency,
    amount: Number(expense.amount || 0),
    status: expense.status || "pending",
  };
}

function recordActivity(type, expense) {
  const activity = activityFromExpense(expense, type);
  activities = [activity, ...activities].slice(0, 80);
  saveJson(STORAGE_KEYS.activities, activities);
  return activity.id;
}

function updateActivityStatus(activityId, status) {
  if (!activityId) return;
  activities = activities.map((activity) => (activity.id === activityId ? { ...activity, status } : activity));
  saveJson(STORAGE_KEYS.activities, activities);
}

function totalsFor(records, currencies = getCurrentProject().currencies) {
  return records.reduce((totals, expense) => {
    addToTotals(totals, expense.currency, expense.amount);
    return totals;
  }, makeCurrencyTotals(currencies));
}

function getStats() {
  const currentProject = getCurrentProject();
  const currentExpenses = getCurrentExpenses();
  const people = getPeople();
  const emptyStats = () => ({
    spent: makeCurrencyTotals(currentProject.currencies),
    paidForOthers: makeCurrencyTotals(currentProject.currencies),
    owedByOthers: makeCurrencyTotals(currentProject.currencies),
    owesToOthers: makeCurrencyTotals(currentProject.currencies),
  });
  const byPerson = Object.fromEntries(people.map((person) => [person, emptyStats()]));
  const pairMap = new Map();

  for (const expense of currentExpenses) {
    const currency = expense.currency;
    const amount = Number(expense.amount || 0);
    const buyer = String(expense.buyer || "").trim();
    const payer = String(expense.payer || "").trim();
    if (!buyer) continue;
    if (!byPerson[buyer]) byPerson[buyer] = emptyStats();
    if (payer && !byPerson[payer]) byPerson[payer] = emptyStats();

    addToTotals(byPerson[buyer].spent, currency, amount);
    if (payer && buyer !== payer) {
      addToTotals(byPerson[payer].paidForOthers, currency, amount);
      if (!expense.settled) {
        addToTotals(byPerson[payer].owedByOthers, currency, amount);
        addToTotals(byPerson[buyer].owesToOthers, currency, amount);
        const key = `${buyer}__${payer}__${currency}`;
        pairMap.set(key, (pairMap.get(key) || 0) + amount);
      }
    }
  }

  return { byPerson, pairMap };
}

function renderExpenseList(container, records) {
  container.innerHTML = "";
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "尚無紀錄";
    container.append(empty);
    return;
  }

  for (const expense of records) {
    const item = document.createElement("article");
    item.className = "expense-item";
    item.dataset.expenseId = expense.id;
    const statusClass = expense.status === "synced" ? "synced" : expense.status === "error" ? "error" : "pending";
    item.innerHTML = `
      <div>
        <strong>${expense.merchant} · ${expense.summary}</strong>
        <p class="expense-meta">${expense.sheetDate} · ${expense.paymentMethod} · ${expense.buyer} 買 / ${expense.payer} 付${expense.settled ? " · 已結清" : ""}</p>
        <label class="settled-toggle">
          <input type="checkbox" data-action="toggle-settled" ${expense.settled ? "checked" : ""} />
          代墊已結清
        </label>
      </div>
      <div class="expense-side">
        <strong>${formatMoney(expense.amount, expense.currency)}</strong>
        <span class="status-pill status-${statusClass}">${statusClass === "synced" ? "已同步" : statusClass === "error" ? "待重試" : "待同步"}</span>
        <div class="item-actions">
          <button class="tool-button compact-tool" type="button" data-action="edit-expense" aria-label="編輯消費" title="編輯消費">✎</button>
          <button class="tool-button compact-tool danger-tool" type="button" data-action="delete-expense" aria-label="刪除消費" title="刪除消費">🗑</button>
        </div>
      </div>
    `;
    container.append(item);
  }
}

function renderRecentActivities() {
  const currentProject = getCurrentProject();
  const projectActivities = activities.filter((activity) => activity.projectName === currentProject.name);
  const activityExpenseIds = new Set(projectActivities.map((activity) => activity.expenseId));
  const fallbackActivities = getCurrentExpenses()
    .filter((expense) => !activityExpenseIds.has(expense.id))
    .map((expense) => ({
      ...activityFromExpense(expense, expense.syncMode === "update" ? "update" : "create"),
      id: `fallback-${expense.id}`,
      timestamp: expense.updatedAt || expense.syncedAt || expense.createdAt || new Date().toISOString(),
    }));
  const recentActivities = [...projectActivities, ...fallbackActivities]
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, 10);

  recentList.innerHTML = "";
  if (!recentActivities.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "尚無近期異動";
    recentList.append(empty);
    return;
  }

  for (const activity of recentActivities) {
    const currentExpense = expenses.find((expense) => expense.id === activity.expenseId);
    const status = currentExpense?.status || activity.status || "synced";
    const statusClass = status === "synced" ? "synced" : status === "error" ? "error" : "pending";
    const row = document.createElement("article");
    row.className = `recent-activity activity-${activity.type}`;
    row.innerHTML = `
      <div class="recent-time">${formatShortDateTime(activity.timestamp)}</div>
      <div class="recent-main">
        <strong>${activity.merchant || "未填店家"}</strong>
        <span>${activity.summary || "未填品項"}</span>
      </div>
      <strong class="recent-amount">${formatMoney(activity.amount, activity.currency)}</strong>
      <span class="status-pill status-${statusClass}">${statusClass === "synced" ? "已同步" : statusClass === "error" ? "待重試" : "待同步"}</span>
      <span class="mutation-pill">${mutationLabel(activity.type)}</span>
    `;
    recentList.append(row);
  }
}

function renderStats() {
  const currentProject = getCurrentProject();
  const { byPerson, pairMap } = getStats();
  statsGrid.innerHTML = "";

  for (const [person, stats] of Object.entries(byPerson)) {
    const spentTwdTotal = totalAsTwd(stats.spent, currentProject);
    const card = document.createElement("article");
    card.className = "stat-card";
    card.innerHTML = `
      <div class="stat-head">
        <h3>${person}</h3>
        <span>個人消費總額</span>
      </div>
      <strong class="stat-total">${formatMoney(spentTwdTotal, "TWD")}</strong>
      <p class="stat-breakdown">${currencyBreakdown(stats.spent, currentProject.currencies)}</p>
      <dl>
        <div><dt>幫人代墊</dt><dd>${formatTotals(stats.paidForOthers, currentProject.currencies)}</dd></div>
        <div><dt>未結應收</dt><dd>${formatTotals(stats.owedByOthers, currentProject.currencies)}</dd></div>
        <div><dt>未結應付</dt><dd>${formatTotals(stats.owesToOthers, currentProject.currencies)}</dd></div>
      </dl>
    `;
    statsGrid.append(card);
  }

  renderSettlements(pairMap);
}

function renderSettlements(pairMap) {
  const balances = new Map();
  for (const [key, amount] of pairMap.entries()) {
    const [buyer, payer, currency] = key.split("__");
    const reverseKey = `${payer}__${buyer}__${currency}`;
    if (balances.has(reverseKey)) {
      balances.set(reverseKey, balances.get(reverseKey) - amount);
    } else {
      balances.set(key, (balances.get(key) || 0) + amount);
    }
  }

  settlementList.innerHTML = "";
  const unsettled = [...balances.entries()].filter(([, amount]) => Math.abs(amount) > 0.0001);
  if (!unsettled.length) {
    settlementList.innerHTML = `<p class="empty-state">代墊款已結清</p>`;
    return;
  }

  for (const [key, amount] of unsettled) {
    const [buyer, payer, currency] = key.split("__");
    const from = amount > 0 ? buyer : payer;
    const to = amount > 0 ? payer : buyer;
    const row = document.createElement("div");
    row.className = "settlement-row";
    row.innerHTML = `<span>${from} 應還 ${to}</span><strong>${formatMoney(Math.abs(amount), currency)}</strong>`;
    settlementList.append(row);
  }
}

function renderPersonView() {
  const currentProject = getCurrentProject();
  const person = personFilter.value || getPeople()[0];
  const records = getCurrentExpenses().filter((expense) => expense.buyer === person);
  const totals = totalsFor(records, currentProject.currencies);
  personSummary.innerHTML = currentProject.currencies
    .map(
      (currency) => `
        <div>
          <span>${CURRENCY_LABELS[currency] || currency}消費</span>
          <strong>${formatMoney(totals[currency] || 0, currency)}</strong>
        </div>
      `,
    )
    .join("");
  renderExpenseList(
    personList,
    [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
  );
}

function render() {
  const currentProject = getCurrentProject();
  const currentExpenses = getCurrentExpenses();
  projectSelect.value = currentProject.name;
  const today = todayDateValue();
  const todayRecords = currentExpenses.filter((expense) => expense.date === today);
  const todayTotals = totalsFor(todayRecords, currentProject.currencies);
  todayTotal.textContent = formatTotals(todayTotals, currentProject.currencies);
  pendingCount.textContent = currentExpenses.filter(
    (expense) => expense.status !== "synced" || expense.syncMode === "sent",
  ).length;

  renderRecentActivities();
  renderPersonView();
  renderStats();
}

function resetExpenseForm() {
  editingExpenseId = "";
  form.reset();
  spentDateInput.value = todayDateValue();
  fillCurrencyOptions();
  submitExpenseButton.textContent = "記一筆";
  cancelEditExpenseButton.hidden = true;
}

function editExpense(expenseId) {
  const expense = expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  editingExpenseId = expense.id;
  setCurrentProject(expense.projectName);
  spentDateInput.value = expense.date || todayDateValue();
  document.querySelector("#paymentMethod").value = expense.paymentMethod;
  document.querySelector("#merchant").value = expense.merchant;
  document.querySelector("#summary").value = expense.summary;
  const currencyInput = document.querySelector(`input[name="currency"][value="${expense.currency}"]`);
  if (currencyInput) currencyInput.checked = true;
  amountInput.value = expense.amount;
  buyerInput.value = expense.buyer;
  payerInput.value = expense.payer;
  document.querySelector("#note").value = expense.note || "";
  document.querySelector("#settled").checked = Boolean(expense.settled);
  submitExpenseButton.textContent = "儲存修改";
  cancelEditExpenseButton.hidden = false;
  document.querySelector('[data-view="entryView"]').click();
  amountInput.focus();
}

async function updateExpenseOnSheet(expense) {
  if (!settings.endpointUrl) return;
  const params = new URLSearchParams({
    payload: JSON.stringify({ action: "updateExpense", record: expense }),
    ts: String(Date.now()),
  });
  await requestScript(buildEndpointUrl(params));
}

async function deleteExpenseOnSheet(expense) {
  if (!settings.endpointUrl) return;
  const params = new URLSearchParams({
    payload: JSON.stringify({ action: "deleteExpense", record: expense }),
    ts: String(Date.now()),
  });
  await requestScript(buildEndpointUrl(params));
}

function buildSyncUrl(record) {
  const action = record.syncMode === "update" ? "updateExpense" : "appendExpenses";
  const params = new URLSearchParams({
    payload: JSON.stringify({ action, records: [record], record }),
    ts: String(Date.now()),
  });
  return buildEndpointUrl(params);
}

function sendRecordToSheet(record) {
  if (!settings.endpointUrl) {
    throw new Error("尚未設定 Apps Script Web App URL");
  }
  return requestScript(buildSyncUrl(record));
}

function buildCloudListUrl() {
  const currentProject = getCurrentProject();
  const params = new URLSearchParams({
    action: "listExpenses",
    projectName: currentProject.name,
    currencies: currentProject.currencies.join(","),
    ts: String(Date.now()),
  });
  return buildEndpointUrl(params);
}

function buildCloudProjectsUrl() {
  const params = new URLSearchParams({
    action: "listProjects",
    ts: String(Date.now()),
  });
  return buildEndpointUrl(params);
}

async function saveProjectsToCloud() {
  if (!settings.endpointUrl) return;
  const params = new URLSearchParams({
    payload: JSON.stringify({ action: "saveProjects", projects: getProjects() }),
    ts: String(Date.now()),
  });
  await requestScript(buildEndpointUrl(params));
}

async function renameProjectOnCloud(oldName, newName) {
  if (!settings.endpointUrl || !oldName || oldName === newName) return;
  const params = new URLSearchParams({
    payload: JSON.stringify({ action: "renameProject", oldName, newName }),
    ts: String(Date.now()),
  });
  await requestScript(buildEndpointUrl(params));
}

async function refreshProjectsFromCloud() {
  if (!settings.endpointUrl) return false;
  const result = await requestScript(buildCloudProjectsUrl());
  const cloudProjects = normalizeProjects(result.projects || []);
  if (!cloudProjects.length) {
    await saveProjectsToCloud();
    return false;
  }
  const currentProject = cloudProjects.some((project) => project.name === settings.currentProject)
    ? settings.currentProject
    : cloudProjects[0].name;
  settings = normalizeSettings({
    ...settings,
    projects: cloudProjects,
    currentProject,
  });
  saveJson(STORAGE_KEYS.settings, settings);
  applySettingsToUi();
  setCurrentProject(settings.currentProject);
  saveProjectsToCloud().catch(() => {});
  return true;
}

async function importProjectFromCloud() {
  const projectName = importProjectInput.value.trim();
  if (!projectName) {
    showToast("請輸入 Google Sheet 分頁名稱");
    return;
  }
  settings = normalizeSettings({
    ...settings,
    endpointUrl: endpointUrlInput.value.trim() || settings.endpointUrl,
  });
  saveJson(STORAGE_KEYS.settings, settings);
  if (!settings.endpointUrl) {
    showToast("請先儲存 Apps Script Web App URL");
    return;
  }

  importProjectButton.disabled = true;
  try {
    await refreshProjectsFromCloud();
    const imported = getProjects().find((project) => project.name === projectName);
    if (!imported) {
      showToast("找不到同名 Google Sheet 分頁");
      return;
    }
    setCurrentProject(imported.name);
    await refreshFromCloud();
    importProjectInput.value = "";
    settingsDialog.close();
    showToast(`已匯入「${imported.name}」`);
  } catch (error) {
    showToast(error.message || "匯入專案失敗");
  } finally {
    importProjectButton.disabled = false;
  }
}

function cloudRecordId(record) {
  return [
    record.projectName,
    record.sheetDate,
    record.merchant,
    record.summary,
    record.currency,
    record.amount,
    record.buyer,
    record.payer,
    record.note,
  ].join("|");
}

async function refreshFromCloud(options = {}) {
  if (!settings.endpointUrl) {
    if (!options.silent) showToast("尚未設定 Apps Script Web App URL");
    return;
  }
  try {
    refreshCloudButton.disabled = true;
    await refreshProjectsFromCloud();
    const result = await requestScript(buildCloudListUrl());
    const currentProject = getCurrentProject();
    const cloudRecords = (result.records || []).map((record) => ({
      ...record,
      id: record.id || `cloud-${cloudRecordId(record)}`,
      projectName: currentProject.name,
      projectCurrencies: currentProject.currencies,
      amount: Number(record.amount || 0) || 0,
      buyer: String(record.buyer || "").trim(),
      payer: String(record.payer || record.buyer || "").trim(),
      status: "synced",
      syncMode: "cloud",
    }));
    const localOnly = expenses.filter((expense) => expense.projectName !== currentProject.name || expense.status !== "synced");
    expenses = [...localOnly, ...cloudRecords];
    saveJson(STORAGE_KEYS.expenses, expenses);
    render();
    if (!options.silent) showToast(`已更新雲端資料 ${cloudRecords.length} 筆`);
  } catch (error) {
    if (!options.silent) showToast(error.message);
  } finally {
    refreshCloudButton.disabled = false;
  }
}

async function syncPending() {
  const currentProject = getCurrentProject();
  const targets = expenses.filter(
    (expense) =>
      expense.projectName === currentProject.name && (expense.status !== "synced" || expense.syncMode === "sent"),
  );
  if (!targets.length) {
    showToast("沒有待同步資料");
    return;
  }

  try {
    for (const target of targets) {
      await sendRecordToSheet(target);
    }
    const syncedIds = new Set(targets.map((expense) => expense.id));
    expenses = expenses.map((expense) =>
      syncedIds.has(expense.id) ? { ...expense, status: "synced", syncedAt: new Date().toISOString(), syncMode: "get" } : expense,
    );
    saveJson(STORAGE_KEYS.expenses, expenses);
    render();
    showToast(`已送出 ${targets.length} 筆同步`);
  } catch (error) {
    const targetIds = new Set(targets.map((expense) => expense.id));
    expenses = expenses.map((expense) =>
      targetIds.has(expense.id) ? { ...expense, status: "error", lastError: error.message } : expense,
    );
    saveJson(STORAGE_KEYS.expenses, expenses);
    render();
    showToast(error.message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const wasEditing = Boolean(editingExpenseId);
  const expense = buildExpense(new FormData(form));
  if (wasEditing) {
    expenses = expenses.map((item) => (item.id === expense.id ? expense : item));
  } else {
    expenses = [expense, ...expenses];
  }
  recordActivity(wasEditing ? "update" : "create", expense);
  saveJson(STORAGE_KEYS.expenses, expenses);
  render();
  resetExpenseForm();
  amountInput.focus();
  showToast(wasEditing ? "已修改" : "已記錄");
  await syncPending();
});

cancelEditExpenseButton.addEventListener("click", resetExpenseForm);

document.querySelector("#syncButton").addEventListener("click", syncPending);
refreshCloudButton.addEventListener("click", refreshFromCloud);
shareButton.addEventListener("click", async () => {
  const shareData = {
    title: "說走就走 小帳本",
    text: "一起記錄旅行小帳與代墊分帳",
    url: window.location.href,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href);
      showToast("已複製分享連結");
    } else {
      showToast("請複製瀏覽器網址分享給旅伴");
    }
  } catch {
    showToast("已取消分享");
  }
});

document.querySelector("#clearSyncedButton").addEventListener("click", async () => {
  if (!settings.endpointUrl) {
    showToast("尚未設定 Apps Script URL，無法重新載入雲端資料");
    return;
  }
  const currentProject = getCurrentProject();
  const pendingCount = expenses.filter(
    (expense) => expense.projectName === currentProject.name && (expense.status !== "synced" || expense.syncMode === "sent"),
  ).length;
  if (pendingCount) {
    showToast("仍有待同步資料，請先同步後再清除本機暫存");
    return;
  }

  try {
    document.querySelector("#clearSyncedButton").disabled = true;
    await refreshFromCloud();
    expenses = expenses.filter(
      (expense) => expense.projectName !== currentProject.name || expense.status !== "synced" || expense.syncMode === "sent",
    );
    saveJson(STORAGE_KEYS.expenses, expenses);
    await refreshFromCloud();
    showToast("已清除本機暫存，並重新載入雲端資料");
  } catch (error) {
    showToast(error.message || "無法重新載入雲端資料，已保留本機資料");
  } finally {
    document.querySelector("#clearSyncedButton").disabled = false;
  }
});

async function handleExpenseListAction(event) {
  const action = event.target.dataset.action;
  if (!action) return;
  const item = event.target.closest(".expense-item");
  const expense = item ? expenses.find((record) => record.id === item.dataset.expenseId) : null;
  if (!expense) return;

  if (action === "edit-expense") {
    editExpense(expense.id);
    return;
  }

  if (action === "toggle-settled") {
    const updated = { ...expense, settled: event.target.checked, status: "pending", syncMode: "update", updatedAt: new Date().toISOString() };
    expenses = expenses.map((record) => (record.id === updated.id ? updated : record));
    recordActivity("update", updated);
    saveJson(STORAGE_KEYS.expenses, expenses);
    render();
    try {
      await updateExpenseOnSheet(updated);
      expenses = expenses.map((record) =>
        record.id === updated.id ? { ...record, status: "synced", syncMode: "get", syncedAt: new Date().toISOString() } : record,
      );
      saveJson(STORAGE_KEYS.expenses, expenses);
      render();
      showToast("已更新結清狀態");
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  if (action === "delete-expense") {
    if (!window.confirm("確定刪除這筆消費？")) return;
    const activityId = recordActivity("delete", { ...expense, status: "pending" });
    expenses = expenses.filter((record) => record.id !== expense.id);
    saveJson(STORAGE_KEYS.expenses, expenses);
    render();
    try {
      await deleteExpenseOnSheet(expense);
      updateActivityStatus(activityId, "synced");
      showToast("已刪除");
    } catch (error) {
      updateActivityStatus(activityId, "error");
      showToast("本機已刪除，雲端刪除失敗：" + error.message);
    }
    render();
  }
}

personList.addEventListener("click", handleExpenseListAction);
personList.addEventListener("change", handleExpenseListAction);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("is-visible"));
    tab.classList.add("is-active");
    document.querySelector(`#${tab.dataset.view}`).classList.add("is-visible");
  });
});

personFilter.addEventListener("change", renderPersonView);
projectSelect.addEventListener("change", () => {
  setCurrentProject(projectSelect.value);
  scheduleProjectCloudRefresh();
});

function openProjectDialog(mode) {
  projectDialogMode = mode;
  const currentProject = getCurrentProject();
  originalProjectName = mode === "edit" ? currentProject.name : "";
  projectDialogTitle.textContent = mode === "edit" ? "編輯旅遊專案" : "新增旅遊專案";
  saveProjectButton.textContent = mode === "edit" ? "儲存專案" : "建立專案";
  projectNameInput.value = mode === "edit" ? currentProject.name : "";
  projectPeopleInput.value = mode === "edit" ? currentProject.people.join(", ") : getPeople().join(", ");
  saveProjectButton.disabled = false;
  fillProjectCurrencyOptions();
  projectDialog.showModal();
}

addProjectButton.addEventListener("click", () => openProjectDialog("create"));
editProjectButton.addEventListener("click", () => openProjectDialog("edit"));
deleteProjectButton.addEventListener("click", () => {
  const currentProject = getCurrentProject();
  if (getProjects().length <= 1) {
    showToast("至少需要保留一個專案");
    return;
  }
  if (!window.confirm(`確定刪除「${currentProject.name}」？本機此專案紀錄也會移除，Google Sheet 分頁不會刪除。`)) return;
  settings.projects = getProjects().filter((project) => project.name !== currentProject.name);
  expenses = expenses.filter((expense) => expense.projectName !== currentProject.name);
  settings.currentProject = settings.projects[0].name;
  saveJson(STORAGE_KEYS.settings, settings);
  saveJson(STORAGE_KEYS.expenses, expenses);
  applySettingsToUi();
  setCurrentProject(settings.currentProject);
  saveProjectsToCloud().catch(() => {});
  showToast("已刪除專案");
});

saveProjectButton.addEventListener("click", async () => {
  if (saveProjectButton.disabled) return;
  const projectName = projectNameInput.value.trim();
  if (!projectName) {
    showToast("\u8acb\u8f38\u5165\u65c5\u904a\u5c08\u6848\u540d\u7a31");
    return;
  }
  const projectPeople = projectPeopleInput.value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (!projectPeople.length) {
    showToast("請輸入這個專案的人員名單");
    return;
  }
  const selectedCurrencies = [
    "TWD",
    ...[...projectCurrencyOptions.querySelectorAll('input[name="projectCurrency"]:checked')]
      .map((input) => input.value)
      .filter((currency) => currency !== "TWD"),
  ];
  const destinationCurrency = selectedCurrencies.find((currency) => currency !== "TWD");
  const exchangeRate = Number(projectExchangeRateInput.value || 1);
  saveProjectButton.disabled = true;
  const projects = getProjects().filter((project) => project.name !== (projectDialogMode === "edit" ? originalProjectName : projectName));
  settings.projects = [
    ...projects,
    {
      name: projectName,
      people: normalizeList(projectPeople, DEFAULT_PROJECT.people),
      currencies: normalizeCurrencies(selectedCurrencies),
      exchangeRates: destinationCurrency ? { [destinationCurrency]: exchangeRate > 0 ? exchangeRate : 1 } : {},
    },
  ];
  settings.currentProject = projectName;
  const renamedProject = projectDialogMode === "edit" && originalProjectName && originalProjectName !== projectName;
  if (projectDialogMode === "edit" && originalProjectName && originalProjectName !== projectName) {
    expenses = expenses.map((expense) =>
      expense.projectName === originalProjectName ? { ...expense, projectName, projectCurrencies: normalizeCurrencies(selectedCurrencies) } : expense,
    );
    saveJson(STORAGE_KEYS.expenses, expenses);
  }
  settings = normalizeSettings(settings);
  saveJson(STORAGE_KEYS.settings, settings);
  projectDialog.close();
  projectNameInput.value = "";
  projectPeopleInput.value = "";
  saveProjectButton.disabled = false;
  applySettingsToUi();
  setCurrentProject(projectName);
  try {
    if (renamedProject) {
      await renameProjectOnCloud(originalProjectName, projectName);
    }
    await saveProjectsToCloud();
  } catch (error) {
    showToast("專案已儲存本機，Google Sheet 分頁/專案清單同步失敗");
    return;
  }
  showToast("\u5df2\u65b0\u589e\u65c5\u904a\u5c08\u6848");
});

settingsButton.addEventListener("click", () => settingsDialog.showModal());
helpButton.addEventListener("click", () => helpDialog.showModal());

document.querySelector("#saveSettingsButton").addEventListener("click", async () => {
  settings = normalizeSettings({
    ...settings,
    endpointUrl: endpointUrlInput.value.trim(),
  });
  saveJson(STORAGE_KEYS.settings, settings);
  applySettingsToUi();
  render();
  settingsDialog.close();
  if (!settings.endpointUrl) {
    showToast("設定已儲存");
    return;
  }
  try {
    const loaded = await refreshProjectsFromCloud();
    showToast(loaded ? "設定已儲存，已載入雲端專案" : "設定已儲存，已建立雲端專案清單");
  } catch {
    try {
      await saveProjectsToCloud();
      showToast("設定已儲存，已建立雲端專案清單");
    } catch {
      showToast("設定已儲存，雲端專案清單尚未同步");
    }
  }
});

importProjectButton.addEventListener("click", importProjectFromCloud);

spentDateInput.value = todayDateValue();
applySettingsToUi();
render();
updateConnectionStatus();
window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    showToast("iPhone 可用 Safari 分享選單加入主畫面");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

initializeEndpointUrlFromSheet().then((updated) => {
  if (updated) refreshProjectsFromCloud().catch(() => {});
});
