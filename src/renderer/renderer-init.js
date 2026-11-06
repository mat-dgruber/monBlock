'use strict';

// Rota inicial (spec 2026-11-06-rota-inicial): só `paired` decide; sem estado ou depois de navegar, não decide.
function pickInitialView(state, { dismissed = false, userNavigated = false } = {}) {
  if (!state || userNavigated) return null;
  return state.paired === true || dismissed ? 'categories' : 'onboarding';
}
globalThis.monblockRenderer = { pickInitialView };

(function bootstrapDesktopRenderer() {
  if (typeof document === 'undefined') return;

  const htmlEl = document.documentElement;
  const bridge = window.monblock;
  const navBtns = Array.from(document.querySelectorAll('[data-nav-target]'));
  const views = Array.from(document.querySelectorAll('[data-view]'));
  const dialog = document.getElementById('partnerAuthDialog');
  const feedback = document.getElementById('actionFeedback');
  const status = document.getElementById('protectionStatus');
  const partnerStatus = document.getElementById('partnerStatus');
  const cooldownDisplay = document.getElementById('cooldownTimerDisplay');
  const startCooldownBtn = document.getElementById('startCooldownBtn');
  let cooldownStartedAtMs = null;
  let currentRules = {
    enabledCategories: ['adult'],
    blockedDomains: [],
    allowlistDomains: [],
    keywords: [],
  };

  const CATEGORIES_DATA = [
    {
      id: 'adult',
      namePt: 'Conteúdo Adulto & Pornografia',
      domains: ['pornhub.com', 'xvideos.com', 'xnxx.com', 'onlyfans.com', 'redtube.com'],
      keywords: ['porn', 'xxx', 'nsfw', 'hentai'],
    },
    {
      id: 'gambling',
      namePt: 'Apostas & Cassinos (Bets)',
      domains: ['bet365.com', 'blaze.com', 'stake.com', 'betano.com', 'sportingbet.com'],
      keywords: ['cassino,online', 'roleta,aposta', 'slot,bonus'],
    },
    {
      id: 'games',
      namePt: 'Jogos Online',
      domains: ['roblox.com', 'poki.com', 'twitch.tv'],
      keywords: ['jogos,online,gratis'],
    },
    {
      id: 'proxy',
      namePt: 'Proxies, VPNs & Bypass',
      domains: ['hidemyass.com', 'croxyproxy.com', 'kproxy.com'],
      keywords: ['web,proxy,unblock'],
    },
    {
      id: 'dating',
      namePt: 'Sites de Relacionamento',
      domains: ['tinder.com', 'badoo.com', 'bumble.com'],
      keywords: ['encontros,casuais'],
    },
    {
      id: 'social',
      namePt: 'Redes Sociais',
      domains: ['instagram.com', 'tiktok.com', 'x.com', 'facebook.com'],
      keywords: [],
    },
    {
      id: 'video',
      namePt: 'Streaming & Vídeos',
      domains: ['netflix.com', 'primevideo.com'],
      keywords: [],
    },
    {
      id: 'forums',
      namePt: 'Fóruns & Comunidades Mistas',
      domains: ['reddit.com', '4chan.org', '9gag.com'],
      keywords: [],
    },
    {
      id: 'shopping',
      namePt: 'Compras por Impulso',
      domains: ['shopee.com.br', 'aliexpress.com', 'shein.com'],
      keywords: [],
    },
    {
      id: 'news',
      namePt: 'Notícias & Portais',
      domains: ['tmz.com', 'buzzfeed.com'],
      keywords: [],
    },
    {
      id: 'search_unsafe',
      namePt: 'Buscadores sem SafeSearch',
      domains: ['yandex.com', 'duckduckgo.com'],
      keywords: [],
    },
  ];

  let pairingPollInterval = null;
  let userNavigated = false;
  let initialViewPicked = false;
  const DISMISS_KEY = 'monblock.onboardingDismissed';
  // localStorage é só conveniência de UI: indisponível = não dispensou.
  const readDismissed = () => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  };

  function stopPairingPoll() {
    if (pairingPollInterval) {
      clearInterval(pairingPollInterval);
      pairingPollInterval = null;
    }
  }

  window.addEventListener('beforeunload', stopPairingPoll);

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function notify(message, isError = false) {
    feedback.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" style="background:none; border:none; color:inherit; font-weight:700; cursor:pointer; padding:0 0.5rem; font-size:1rem;" aria-label="Fechar aviso">✕</button>`;
    feedback.hidden = false;
    feedback.dataset.kind = isError ? 'error' : 'success';
    feedback.setAttribute('role', isError ? 'alert' : 'status');
    feedback.querySelector('button')?.addEventListener('click', () => {
      feedback.hidden = true;
    });
  }

  function switchView(targetView, moveFocus = false) {
    if (!views.some((view) => view.dataset.view === targetView)) return;
    if (targetView !== 'onboarding') {
      stopPairingPoll();
    }
    for (const btn of navBtns) {
      const active = btn.dataset.navTarget === targetView;
      btn.classList.toggle('ccat-btn-primary', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }
    for (const view of views) view.hidden = view.dataset.view !== targetView;
    if (moveFocus) views.find((view) => view.dataset.view === targetView)?.querySelector('h2')?.focus();
  }

  function renderCategories(enabledCategories) {
    for (const card of document.querySelectorAll('[data-category-id]')) {
      const catId = card.dataset.categoryId;
      const enabled = enabledCategories.includes(catId);
      card.dataset.locked = String(enabled);
      const button = card.querySelector('[data-action]');
      if (button) {
        button.dataset.action = enabled ? 'request-partner-unlock' : 'enable-category';
        button.classList.toggle('ccat-btn-primary', !enabled);
        button.textContent = enabled ? 'Pedir ajuda para alterar' : 'Ativar bloqueio';
      }
      let badge = card.querySelector('[data-category-status]');
      if (!badge) {
        badge = document.createElement('span');
        badge.dataset.categoryStatus = '';
        badge.className = 'category-badge-status';
        card.querySelector('.category-header, h3')?.appendChild(badge);
      }
      badge.textContent = enabled ? 'Ativa' : 'Não ativada';
    }
  }

  function renderActiveRulesTable(filterQuery = '') {
    const tbody = document.getElementById('activeRulesTableBody');
    if (!tbody) return;

    const query = filterQuery.trim().toLowerCase();
    const rows = [];

    // Adiciona regras das categorias ativas
    for (const catId of currentRules.enabledCategories || []) {
      const cat = CATEGORIES_DATA.find((c) => c.id === catId);
      if (!cat) continue;
      for (const d of cat.domains) {
        if (!query || d.toLowerCase().includes(query) || cat.namePt.toLowerCase().includes(query)) {
          rows.push({
            item: d,
            type: 'Domínio',
            origin: `Categoria: ${cat.namePt}`,
            status: '🔒 Protegido',
          });
        }
      }
      for (const kw of cat.keywords) {
        if (!query || kw.toLowerCase().includes(query) || cat.namePt.toLowerCase().includes(query)) {
          rows.push({
            item: kw,
            type: 'Palavra-chave',
            origin: `Categoria: ${cat.namePt}`,
            status: '🔒 Protegido',
          });
        }
      }
    }

    // Adiciona domínios customizados
    for (const d of currentRules.blockedDomains || []) {
      if (!query || d.toLowerCase().includes(query)) {
        rows.push({
          item: d,
          type: 'Domínio',
          origin: 'Adicionado Manualmente',
          status: '🔒 Protegido',
        });
      }
    }

    // Adiciona palavras customizadas
    for (const kw of currentRules.keywords || []) {
      if (!query || kw.toLowerCase().includes(query)) {
        rows.push({
          item: kw,
          type: 'Palavra-chave',
          origin: 'Adicionado Manualmente',
          status: '🔒 Protegido',
        });
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--ccat-text-muted); padding: 1.5rem;">Nenhuma regra corresponde ao filtro.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .slice(0, 100)
      .map(
        (r) => `
        <tr>
          <td><span class="category-tag-chip ${r.type === 'Domínio' ? 'category-tag-chip--domain' : 'category-tag-chip--keyword'}">${r.type === 'Domínio' ? '🌐' : '🔤'} ${escapeHtml(r.item)}</span></td>
          <td>${escapeHtml(r.type)}</td>
          <td>${escapeHtml(r.origin)}</td>
          <td><span class="category-badge-status">${escapeHtml(r.status)}</span></td>
        </tr>`
      )
      .join('');
  }

  function checkUrlBlockStatus(rawInput) {
    const input = rawInput.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/[\/:].*$/, '');
    if (!input) return null;

    // Checa categorias ativas
    for (const catId of currentRules.enabledCategories || []) {
      const cat = CATEGORIES_DATA.find((c) => c.id === catId);
      if (!cat) continue;
      for (const d of cat.domains) {
        if (input === d || input.endsWith('.' + d)) {
          return { blocked: true, reason: `Categoria: ${cat.namePt}`, item: d };
        }
      }
      for (const kw of cat.keywords) {
        const terms = kw.split(',').map((t) => t.trim());
        if (terms.every((t) => input.includes(t))) {
          return { blocked: true, reason: `Termo da Categoria ${cat.namePt}`, item: kw };
        }
      }
    }

    // Checa domínios customizados
    for (const d of currentRules.blockedDomains || []) {
      if (input === d.toLowerCase() || input.endsWith('.' + d.toLowerCase())) {
        return { blocked: true, reason: 'Lista Customizada de Bloqueios', item: d };
      }
    }

    // Checa palavras customizadas
    for (const kw of currentRules.keywords || []) {
      const terms = kw.toLowerCase().split(',').map((t) => t.trim());
      if (terms.every((t) => input.includes(t))) {
        return { blocked: true, reason: 'Palavra-chave Customizada', item: kw };
      }
    }

    return { blocked: false };
  }

  function updateCooldown() {
    if (cooldownStartedAtMs === null) {
      cooldownDisplay.textContent = 'Não iniciada';
      startCooldownBtn.disabled = false;
      return;
    }
    const remaining = Math.max(0, 72 * 3600 * 1000 - Math.max(0, Date.now() - cooldownStartedAtMs));
    const seconds = Math.ceil(remaining / 1000);
    cooldownDisplay.textContent = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
      .map((value) => String(value).padStart(2, '0')).join(':');
    startCooldownBtn.disabled = true;
  }

  const quickStats = document.getElementById('quickStatsHeader');
  const reinstallServiceBtn = document.getElementById('reinstallServiceBtn');
  const profileBanner = document.getElementById('profileBanner');
  const serviceUpdateBanner = document.getElementById('serviceUpdateBanner');
  const profileStepsDialog = document.getElementById('profileStepsDialog');

  // Só `false` mostra o aviso: `null` (não verificado/falha) não incomoda o usuário.
  function renderProfileBanner(state) {
    if (profileBanner) profileBanner.hidden = state?.browserProfileInstalled !== false;
    // Campo ausente = daemon anterior à 0.3.0 (o .app foi atualizado sem reinstalar o serviço).
    if (serviceUpdateBanner) serviceUpdateBanner.hidden = !state || 'browserProfileInstalled' in state;
  }

  async function loadState() {
    let result;
    try {
      result = await bridge.getState();
      if (!result || result.status !== 200 || !result.state) throw new Error(result?.detail || 'O estado da proteção não pôde ser consultado.');
      if (reinstallServiceBtn) reinstallServiceBtn.hidden = true;
      renderProfileBanner(result.state);
      if (!initialViewPicked) {
        initialViewPicked = true;
        const initial = pickInitialView(result.state, { dismissed: readDismissed(), userNavigated });
        if (initial) switchView(initial);
      }
      currentRules = result.state.rules || currentRules;
      renderCategories(currentRules.enabledCategories || []);
      renderActiveRulesTable();
      cooldownStartedAtMs = result.state.cooldown?.startedAtMs ?? null;
      updateCooldown();
      status.textContent = result.state.tamperLockdown ? 'Estado carregado — modo de segurança' : 'Estado da proteção carregado';
      status.dataset.status = result.state.tamperLockdown ? 'error' : 'loaded';
      if (quickStats) quickStats.textContent = result.state.tamperLockdown ? 'Modo de segurança' : 'Proteção ativa';
      isPaired = result.state.paired === true;
      renderOnboardingGate();
      partnerStatus.textContent = result.state.paired ? 'Ajudante pareado' : 'Ajudante ainda não pareado';
      htmlEl.dataset.uiState = 'active';
      return true;
    } catch (error) {
      htmlEl.dataset.uiState = 'error';
      // 503: o serviço root não responde (ADR-0007). Sem ele a proteção não pode ser confirmada.
      const daemonOffline = result?.status === 503;
      status.textContent = daemonOffline ? 'Proteção não verificada' : 'Não foi possível conferir a proteção';
      status.dataset.status = 'error';
      if (quickStats) quickStats.textContent = 'Proteção não verificada';
      if (reinstallServiceBtn) reinstallServiceBtn.hidden = !daemonOffline;
      renderProfileBanner(null);
      document.getElementById('problemDetailsTitle').textContent = daemonOffline ? 'Proteção não verificada' : 'Estado indisponível';
      document.getElementById('problemDetailsDetail').textContent = error.message || 'Abra novamente o aplicativo para tentar consultar o estado.';
      return false;
    }
  }

  async function execute(button, operation, successMessage) {
    if (button) button.disabled = true;
    try {
      const response = await operation();
      if (!response || response.status !== 200) {
        notify(response?.detail || 'Não foi possível concluir a ação. Consulte o estado antes de tentar novamente.', true);
        return false;
      }
      notify(successMessage);
      return true;
    } catch (error) {
      notify(error.message || 'Falha de comunicação. Consulte o estado antes de tentar novamente.', true);
      return false;
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Seletor de Tema
  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      htmlEl.dataset.theme = themeSelect.value;
      for (const option of themeSelect.options) option.setAttribute('aria-pressed', String(option.selected));
    });
  }

  // Navegação Principal da Sidebar
  for (const btn of navBtns) {
    btn.addEventListener('click', () => {
      userNavigated = true;
      switchView(btn.dataset.navTarget, true);
    });
  }
  document.getElementById('retryStateBtn')?.addEventListener('click', () => void loadState());
  document.getElementById('skipOnboardingBtn')?.addEventListener('click', () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* sem persistência: volta ao onboarding na próxima abertura */ }
    switchView('categories', true);
  });
  document.getElementById('goToCategoriesBtn')?.addEventListener('click', () => switchView('categories', true));
  document.getElementById('addFirstDomainBtn')?.addEventListener('click', () => {
    switchView('rules', true);
    document.getElementById('batchDomainsTextarea')?.focus();
  });

  // Stepper Interativo de Onboarding (Passos 1 a 4). O passo 4 (códigos de emergência) só existe depois do pareamento.
  let isPaired = false;
  const confirmCodesCheckbox = document.getElementById('onboardingConfirmCodesCheckbox');
  const finishOnboardingBtn = document.getElementById('goToCategoriesBtn');
  const nextToStep4Btn = document.getElementById('nextToStep4Btn');
  const stepTab = (i) => document.getElementById(`stepIndicator${i}`);

  function renderOnboardingGate() {
    if (nextToStep4Btn) nextToStep4Btn.disabled = !isPaired;
    const tab4 = stepTab(4);
    if (tab4) {
      if (isPaired) tab4.removeAttribute('aria-disabled');
      else tab4.setAttribute('aria-disabled', 'true');
    }
    if (finishOnboardingBtn) finishOnboardingBtn.disabled = !confirmCodesCheckbox?.checked;
  }
  confirmCodesCheckbox?.addEventListener('change', renderOnboardingGate);

  function switchOnboardingStep(stepNumber, moveFocus = false) {
    if (stepNumber === 4 && !isPaired) return;
    for (let i = 1; i <= 4; i++) {
      const panel = document.getElementById(`onboardingStepPanel${i}`);
      const tab = stepTab(i);
      if (panel) panel.hidden = i !== stepNumber;
      if (tab) {
        tab.classList.toggle('active', i === stepNumber);
        tab.setAttribute('aria-selected', String(i === stepNumber));
        tab.tabIndex = i === stepNumber ? 0 : -1;
      }
    }
    const progress = document.getElementById('onboardingProgress');
    if (progress) progress.textContent = `Passo ${stepNumber} de 4`;
    if (moveFocus) stepTab(stepNumber)?.focus();
  }

  for (let i = 1; i <= 4; i++) {
    stepTab(i)?.addEventListener('click', () => switchOnboardingStep(i));
    // Setas/Home/End movem entre abas (padrão ARIA tabs); o passo 4 bloqueado é pulado.
    stepTab(i)?.addEventListener('keydown', (event) => {
      const last = isPaired ? 4 : 3;
      const next = { ArrowRight: i === last ? 1 : i + 1, ArrowLeft: i === 1 ? last : i - 1, Home: 1, End: last }[event.key];
      if (!next) return;
      event.preventDefault();
      switchOnboardingStep(next, true);
    });
  }
  document.getElementById('nextToStep2Btn')?.addEventListener('click', () => switchOnboardingStep(2));
  document.getElementById('backToStep1Btn')?.addEventListener('click', () => switchOnboardingStep(1));
  document.getElementById('nextToStep3Btn')?.addEventListener('click', () => switchOnboardingStep(3));
  document.getElementById('backToStep2Btn')?.addEventListener('click', () => switchOnboardingStep(2));
  nextToStep4Btn?.addEventListener('click', () => switchOnboardingStep(4));
  document.getElementById('backToStep3Btn')?.addEventListener('click', () => switchOnboardingStep(3));
  renderOnboardingGate();

  // Modal de Pausa Consciente & Respiração 10s
  let breathingInterval = null;
  function startBreathingTimer() {
    const timerEl = document.getElementById('dialogBreathingTimer');
    if (!timerEl) return;
    let count = 10;
    timerEl.textContent = String(count);
    clearInterval(breathingInterval);
    breathingInterval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(breathingInterval);
        timerEl.textContent = '✓';
      } else {
        timerEl.textContent = String(count);
      }
    }, 1000);
  }

  document.getElementById('closePartnerDialogBtn')?.addEventListener('click', () => {
    clearInterval(breathingInterval);
    dialog?.close();
  });
  dialog?.addEventListener('close', () => {
    clearInterval(breathingInterval);
  });

  // Categorias
  for (const card of document.querySelectorAll('[data-category-id]')) {
    const button = card.querySelector('[data-action]');
    if (button) {
      button.addEventListener('click', async () => {
        if (button.dataset.action === 'request-partner-unlock') {
          if (dialog && typeof dialog.showModal === 'function') {
            startBreathingTimer();
            dialog.showModal();
          }
          return;
        }
        if (await execute(button, () => bridge.enableCategory(card.dataset.categoryId), 'Categoria ativada.')) {
          await loadState();
        }
      });
    }
  }

  // Verificador Universal Raio-X
  const urlCheckerInput = document.getElementById('urlCheckerInput');
  const urlCheckerBtn = document.getElementById('urlCheckerBtn');
  const urlCheckerResult = document.getElementById('urlCheckerResult');

  function runUrlCheck() {
    if (!urlCheckerInput || !urlCheckerResult) return;
    const value = urlCheckerInput.value.trim();
    if (!value) {
      urlCheckerResult.style.display = 'none';
      return;
    }
    const check = checkUrlBlockStatus(value);
    urlCheckerResult.style.display = 'flex';
    if (check && check.blocked) {
      urlCheckerResult.dataset.status = 'blocked';
      urlCheckerResult.textContent = `🚫 Bloqueado por: ${check.reason} (regra: ${check.item})`;
    } else {
      urlCheckerResult.dataset.status = 'allowed';
      urlCheckerResult.textContent = '🟢 Acesso livre: este endereço não coincide com nenhuma categoria ou bloqueio ativo.';
    }
  }

  urlCheckerBtn?.addEventListener('click', runUrlCheck);
  urlCheckerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runUrlCheck();
  });

  // Filtro na Tabela de Regras Ativas
  const rulesTableSearchInput = document.getElementById('rulesTableSearchInput');
  rulesTableSearchInput?.addEventListener('input', () => {
    renderActiveRulesTable(rulesTableSearchInput.value);
  });

  // Pareamento no Onboarding via Telegram (Sem senha local)
  const onboardingPairBtn = document.getElementById('onboardingPairBtn');
  const onboardingPairingCard = document.getElementById('onboardingPairingCard');
  const onboardingPairingWaitingCard = document.getElementById('onboardingPairingWaitingCard');
  const cancelPairingBtn = document.getElementById('cancelPairingBtn');

  cancelPairingBtn?.addEventListener('click', async () => {
    stopPairingPoll();
    if (bridge?.cancelPairing) await bridge.cancelPairing();
    if (onboardingPairingWaitingCard) onboardingPairingWaitingCard.style.display = 'none';
    if (onboardingPairingCard) onboardingPairingCard.style.display = 'grid';
    if (onboardingPairBtn) onboardingPairBtn.disabled = false;
    notify('Convite de pareamento cancelado.');
  });

  onboardingPairBtn?.addEventListener('click', async () => {
    const partnerName = document.getElementById('onboardingPartnerNameInput')?.value.trim();
    const telegramChatId = document.getElementById('onboardingTelegramChatIdInput')?.value.trim();

    if (!partnerName || !telegramChatId) {
      notify('Preencha o Nome do Ajudante e o Chat ID do Telegram.', true);
      return;
    }

    if (onboardingPairBtn) onboardingPairBtn.disabled = true;

    try {
      const res = await bridge.initiatePairing({ partnerName, telegramChatId });
      if (!res || res.status !== 200) {
        notify(res?.detail || 'Não foi possível enviar o convite pelo Telegram.', true);
        if (onboardingPairBtn) onboardingPairBtn.disabled = false;
        return;
      }

      // Alterna para tela de espera do Ajudante
      if (onboardingPairingCard) onboardingPairingCard.style.display = 'none';
      if (onboardingPairingWaitingCard) onboardingPairingWaitingCard.style.display = 'grid';
      notify(`Convite enviado ao Telegram de ${partnerName}! Aguardando definição da senha...`);

      stopPairingPoll();
      pairingPollInterval = setInterval(async () => {
        try {
          const statusRes = await bridge.checkPairingStatus();
          if (statusRes?.status === 200 && statusRes.paired) {
            stopPairingPoll();
            await loadState();
            notify('Ajudante configurou a Senha Mestra no Telegram! Proteção ativa.');
            switchOnboardingStep(4);
          } else if (statusRes?.error) {
            stopPairingPoll();
            notify(statusRes.error, true);
            if (onboardingPairingWaitingCard) onboardingPairingWaitingCard.style.display = 'none';
            if (onboardingPairingCard) onboardingPairingCard.style.display = 'grid';
            if (onboardingPairBtn) onboardingPairBtn.disabled = false;
          }
        } catch {
          // Continua tentando
        }
      }, 2000);
    } catch (err) {
      notify(err?.message || 'Falha ao iniciar pareamento.', true);
      if (onboardingPairBtn) onboardingPairBtn.disabled = false;
    }
  });

  // Lote de Domínios
  const batchTextarea = document.getElementById('batchDomainsTextarea');
  const batchCounter = document.getElementById('batchCounter');
  const parseBatch = () => batchTextarea.value.split(/[\r\n,\s]+/).map((entry) => entry.trim()).filter(Boolean);
  batchTextarea?.addEventListener('input', () => {
    if (batchCounter) batchCounter.textContent = `${parseBatch().length} / 100 domínios`;
  });
  const submitBatchBtn = document.getElementById('submitBatchBtn');
  submitBatchBtn?.addEventListener('click', async () => {
    const domains = parseBatch();
    if (!domains.length || domains.length > 100) {
      notify('Informe entre 1 e 100 sites para bloquear.', true);
      return;
    }
    if (await execute(submitBatchBtn, () => bridge.addBatchDomains(domains), 'Sites adicionados à proteção.')) {
      batchTextarea.value = '';
      if (batchCounter) batchCounter.textContent = '0 / 100 domínios';
      await loadState();
    }
  });

  // Palavra-chave
  const keywordInput = document.getElementById('keywordInput');
  const submitKeywordBtn = document.getElementById('submitKeywordBtn');
  submitKeywordBtn?.addEventListener('click', async () => {
    const keyword = keywordInput.value.trim();
    if (!keyword) {
      notify('Escreva uma palavra ou combinação para bloquear.', true);
      return;
    }
    if (await execute(submitKeywordBtn, () => bridge.addKeywords([keyword]), 'Palavra adicionada à proteção.')) {
      keywordInput.value = '';
      await loadState();
    }
  });

  // Código de Recuperação
  const recoveryInput = document.getElementById('recoveryCodeInput');
  const recoveryTarget = document.getElementById('recoveryTargetInput');
  const recoveryBtn = document.getElementById('useRecoveryCodeBtn');
  recoveryBtn?.addEventListener('click', async () => {
    const recoveryCode = recoveryInput.value.trim();
    const target = recoveryTarget.value.trim();
    if (!recoveryCode || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(target)) {
      notify('Informe um código de recuperação e um domínio válido (ex.: exemplo.com).', true);
      return;
    }
    if (await execute(recoveryBtn, () => bridge.verifyRecoveryCode({ recoveryCode, target }), 'Código validado. O site informado foi liberado por uma hora.')) {
      recoveryInput.value = '';
      await loadState();
    }
  });

  // Cooldown de 72h
  startCooldownBtn?.addEventListener('click', async () => {
    if (await execute(startCooldownBtn, () => bridge.triggerEmergencyCooldown(), 'Espera de 72 horas iniciada. A proteção permanece ativa.')) {
      await loadState();
    }
  });

  reinstallServiceBtn?.addEventListener('click', async () => {
    await execute(reinstallServiceBtn, () => bridge.reinstallService(), 'Instalador aberto. Siga as instruções e volte ao monBlock.');
  });
  if (bridge?.onDaemonStatus) bridge.onDaemonStatus(() => void loadState());

  document.getElementById('openProfileSettingsBtn')?.addEventListener('click', (event) =>
    execute(event.currentTarget, () => bridge.openProfileSettings(), 'Ajustes abertos em Gerenciamento de Dispositivos.')
  );
  document.getElementById('updateServiceBtn')?.addEventListener('click', (event) =>
    execute(event.currentTarget, () => bridge.reinstallService(), 'Instalador aberto. Siga as instruções e volte ao monBlock.')
  );
  document.getElementById('showProfileStepsBtn')?.addEventListener('click', () => profileStepsDialog?.showModal());
  document.getElementById('closeProfileStepsBtn')?.addEventListener('click', () => profileStepsDialog?.close());
  // Confere a cada 15 s só o aviso (sem re-renderizar o painel): some após a aprovação e volta se o perfil for removido.
  setInterval(async () => {
    if (!profileBanner) return;
    try {
      const result = await bridge.getState();
      if (result?.status === 200) renderProfileBanner(result.state);
    } catch {
      // Falha de consulta: mantém o aviso; o loadState trata o daemon offline.
    }
  }, 15_000);

  if (bridge?.onTrayNavigate) bridge.onTrayNavigate((viewId) => {
    userNavigated = true;
    switchView(viewId, true);
  });
  switchView('categories');
  void loadState();
  setInterval(updateCooldown, 1000);
})();
