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

  // Resumo das categorias vindo do catálogo do app (IPC), a mesma fonte do daemon e do vigia.
  let categoryCatalog = [];

  async function loadCategoryCatalog() {
    try {
      categoryCatalog = (await bridge.getCategories()) || [];
    } catch {
      categoryCatalog = [];
    }
    for (const cat of categoryCatalog) {
      const card = document.querySelector(`[data-category-id="${cat.id}"]`);
      if (!card) continue;
      const count = card.querySelector('.category-rule-count');
      if (count) count.textContent = `${cat.domainCount.toLocaleString('pt-BR')} domínios + ${cat.keywordCount.toLocaleString('pt-BR')} palavras-chave`;
      const list = card.querySelector('.category-tags-list');
      if (!list) continue;
      list.replaceChildren();
      const chip = (kind, text) => {
        const el = document.createElement('span');
        el.className = `category-tag-chip category-tag-chip--${kind}`;
        el.textContent = text;
        list.append(el);
      };
      for (const d of cat.sampleDomains) chip('domain', `🌐 ${d}`);
      for (const k of cat.sampleKeywords) chip('keyword', `🔤 termo: ${k.replaceAll(',', ' + ')}`);
      const more = cat.domainCount - cat.sampleDomains.length;
      if (more > 0) chip('keyword', `e mais ${more.toLocaleString('pt-BR')} domínios`);
    }
  }

  let pairingPollInterval = null;
  let userNavigated = false;
  let loadSeq = 0;
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

  let feedbackTimer = null;
  function notify(message, isError = false) {
    // DOM API (textContent): a mensagem nunca é interpretada como HTML.
    const text = document.createElement('span');
    text.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'notice-close';
    close.setAttribute('aria-label', 'Fechar aviso');
    close.textContent = '✕';
    feedback.replaceChildren(text, close);
    feedback.hidden = false;
    feedback.dataset.kind = isError ? 'error' : 'success';
    // Uma região fixa (role=status); erro só eleva a urgência, sem trocar o role.
    feedback.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    feedback.querySelector('button')?.addEventListener('click', () => {
      feedback.hidden = true;
    });
    clearTimeout(feedbackTimer);
    // Sucesso some sozinho em 5 s (e espera hover/foco); erro fica até ser fechado.
    if (!isError) {
      feedbackTimer = setTimeout(() => {
        if (!feedback.matches(':hover, :focus-within')) feedback.hidden = true;
      }, 5000);
    }
  }

  function switchView(targetView, moveFocus = false) {
    if (!views.some((view) => view.dataset.view === targetView)) return false;
    // Em erro só "Ajudante e recuperação" tem conteúdo visível (CSS); não marcar como atual uma view escondida.
    if (htmlEl.dataset.uiState === 'error' && targetView !== 'partner') return false;
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
    return true;
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

    // Categorias ativas: amostra (a lista completa vive no daemon e no vigia)
    for (const catId of currentRules.enabledCategories || []) {
      const cat = categoryCatalog.find((c) => c.id === catId);
      if (!cat) continue;
      for (const d of cat.sampleDomains) {
        if (!query || d.includes(query) || cat.namePt.toLowerCase().includes(query)) {
          rows.push({ item: d, type: 'Domínio', origin: `Categoria: ${cat.namePt} (amostra de ${cat.domainCount.toLocaleString('pt-BR')})`, status: '🔒 Protegido' });
        }
      }
      for (const kw of cat.sampleKeywords) {
        if (!query || kw.includes(query) || cat.namePt.toLowerCase().includes(query)) {
          rows.push({ item: kw.replaceAll(',', ' + '), type: 'Palavra-chave', origin: `Categoria: ${cat.namePt}`, status: '🔒 Protegido' });
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

    // Liberados para sempre pelo Ajudante (falsos positivos): dá para voltar a bloquear
    for (const d of currentRules.allowlistDomains || []) {
      if (!query || d.toLowerCase().includes(query)) {
        rows.push({ item: d, type: 'Domínio', origin: 'Liberado para sempre pelo Ajudante', status: '', allow: d });
      }
    }

    // Adiciona palavras customizadas
    for (const kw of currentRules.keywords || []) {
      if (!query || kw.toLowerCase().includes(query)) {
        rows.push({
          item: kw.replaceAll(',', ' + '),
          type: 'Palavra-chave',
          origin: 'Adicionado Manualmente',
          status: '🔒 Protegido',
        });
      }
    }

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="table-empty-cell">Nenhuma regra corresponde ao filtro.</td></tr>';
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
          <td>${r.allow ? `<button type="button" class="ccat-btn ccat-btn-secondary" data-remove-allow="${escapeHtml(r.allow)}">Bloquear de novo</button>` : `<span class="category-badge-status">${escapeHtml(r.status)}</span>`}</td>
        </tr>`
      )
      .join('');
  }

  document.getElementById('activeRulesTableBody')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-remove-allow]');
    if (!button) return;
    void execute(button, () => bridge.removeAllowlistDomain(button.dataset.removeAllow), 'Endereço bloqueado de novo.').then((ok) => {
      if (ok) void loadState();
    });
  });

  async function checkUrlBlockStatus(rawInput) {
    const input = rawInput.trim();
    if (!input) return null;
    const r = await bridge.checkUrl(input, currentRules);
    return r.blocked ? { blocked: true, reason: r.ruleLabel || 'regra ativa', item: r.ruleLabel || input } : { blocked: false };
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
    const seq = ++loadSeq;
    try {
      result = await bridge.getState();
      if (seq !== loadSeq) return htmlEl.dataset.uiState === 'active'; // resposta velha: a mais recente vence
      if (!result || result.status !== 200 || !result.state) throw new Error(result?.detail || 'O estado da proteção não pôde ser consultado.');
      if (reinstallServiceBtn) reinstallServiceBtn.hidden = true;
      renderProfileBanner(result.state);
      // Sai do estado de erro antes de escolher a view: em erro o switchView só aceita 'partner'.
      htmlEl.dataset.uiState = 'active';
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
      if (quickStats) {
        // Perfil dos navegadores não aprovado: Chrome/Brave/Edge podem ignorar o bloqueio, então não é "ativa" plena.
        quickStats.textContent = result.state.tamperLockdown
          ? 'Modo de segurança'
          : result.state.browserProfileInstalled === false ? 'Proteção parcial' : 'Proteção ativa';
        quickStats.dataset.status = result.state.tamperLockdown
          ? 'warning'
          : result.state.browserProfileInstalled === false ? 'partial' : 'active';
      }
      const bot = result.state.bot;
      const botStatus = document.getElementById('botStatus');
      if (botStatus) botStatus.textContent = bot?.configured ? `Bot conectado: @${bot.username}` : 'Nenhum bot conectado.';
      const botRow = document.getElementById('botTokenRow');
      if (botRow) botRow.hidden = Boolean(bot?.configured);
      isPaired = result.state.paired === true;
      renderOnboardingGate();
      const emptyHint = document.getElementById('emptyRulesHint');
      if (emptyHint) emptyHint.hidden = (currentRules.blockedDomains?.length ?? 0) + (currentRules.keywords?.length ?? 0) > 0;
      const reminder = document.getElementById('helperReminder');
      if (reminder) reminder.hidden = isPaired;
      partnerStatus.textContent = result.state.paired ? 'Ajudante pareado' : 'Ajudante ainda não pareado';
      htmlEl.dataset.uiState = 'active';
      return true;
    } catch (error) {
      if (seq !== loadSeq) return htmlEl.dataset.uiState === 'active';
      htmlEl.dataset.uiState = 'error';
      switchView('partner'); // única view com conteúdo em erro; mantém a nav coerente
      // 503: o serviço root não responde (ADR-0007). Sem ele a proteção não pode ser confirmada.
      const daemonOffline = result?.status === 503;
      status.textContent = daemonOffline ? 'Proteção não verificada' : 'Não foi possível conferir a proteção';
      status.dataset.status = 'error';
      if (quickStats) {
        quickStats.textContent = 'Proteção não verificada';
        quickStats.dataset.status = 'error';
      }
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

  // Seletor Canônico de Tema CCAT (Custom Dropdown + Native Select Sync)
  const themeSelect = document.getElementById('themeSelect');
  const themeDropdownTrigger = document.getElementById('themeTriggerBtn');
  const themeDropdownMenu = document.getElementById('themeOptionsMenu');
  const themeTriggerLabel = document.getElementById('themeTriggerLabel');
  const themeActiveSwatch = document.getElementById('themeActiveSwatch');
  const themeOptionBtns = Array.from(document.querySelectorAll('.ccat-custom-select-item'));

  const THEME_NAMES = {
    'capycro-ivory': 'Padrão',
    'capycro-dark': 'Capycro escuro',
    'dark-tech': 'Escuro',
    'light-fintech': 'Claro',
    'high-contrast-aaa': 'Alto contraste',
  };

  function applyTheme(themeId) {
    if (!THEME_NAMES[themeId]) return;
    htmlEl.dataset.theme = themeId;
    if (themeSelect && themeSelect.value !== themeId) {
      themeSelect.value = themeId;
    }
    if (themeTriggerLabel) {
      themeTriggerLabel.textContent = THEME_NAMES[themeId] || themeId;
    }
    if (themeActiveSwatch) {
      themeActiveSwatch.className = `theme-indicator-swatch swatch-${themeId === 'high-contrast-aaa' ? 'high-contrast' : themeId}`;
    }
    for (const btn of themeOptionBtns) {
      const isSelected = btn.getAttribute('data-theme-select') === themeId;
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }
    try {
      localStorage.setItem('monblock.theme', themeId);
    } catch { /* sem persistência */ }
  }

  // Inicialização do tema persistido ou padrão
  let initialTheme = 'capycro-ivory';
  try {
    const saved = localStorage.getItem('monblock.theme');
    if (saved && THEME_NAMES[saved]) initialTheme = saved;
  } catch { /* localStorage indisponível */ }
  applyTheme(initialTheme);

  // Escuta no native select para sincronização bidirecional (ex.: testes ou automação)
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      applyTheme(themeSelect.value);
    });
  }

  // Interatividade do Dropdown Canônico CCAT
  if (themeDropdownTrigger && themeDropdownMenu) {
    function toggleThemeMenu(open) {
      const isExpanded = open ?? themeDropdownTrigger.getAttribute('aria-expanded') !== 'true';
      themeDropdownTrigger.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      themeDropdownMenu.hidden = !isExpanded;
      if (isExpanded) {
        const currentActive = themeOptionBtns.find((b) => b.getAttribute('aria-selected') === 'true') || themeOptionBtns[0];
        currentActive?.focus();
      }
    }

    themeDropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleThemeMenu();
    });

    for (const btn of themeOptionBtns) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const themeId = btn.getAttribute('data-theme-select');
        if (themeId) applyTheme(themeId);
        toggleThemeMenu(false);
        themeDropdownTrigger.focus();
      });
    }

    // Fechar ao clicar fora ou pressionar Escape
    document.addEventListener('click', (e) => {
      if (!themeDropdownTrigger.contains(e.target) && !themeDropdownMenu.contains(e.target)) {
        if (!themeDropdownMenu.hidden) toggleThemeMenu(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !themeDropdownMenu.hidden) {
        toggleThemeMenu(false);
        themeDropdownTrigger.focus();
      }
    });
  }

  // Navegação Principal da Sidebar
  for (const btn of navBtns) {
    btn.addEventListener('click', () => {
      if (switchView(btn.dataset.navTarget, true)) userNavigated = true;
    });
  }
  document.getElementById('retryStateBtn')?.addEventListener('click', () => void loadState());
  document.getElementById('openOnboardingBtn')?.addEventListener('click', () => {
    userNavigated = true;
    switchView('onboarding', true);
  });
  document.getElementById('skipOnboardingBtn')?.addEventListener('click', () => {
    userNavigated = true; // vale mesmo se o localStorage falhar
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

  let activeCategoryForUnlock = null;
  const sendUnblockBtn = document.getElementById('sendUnblockTelegramBtn');
  const partnerDialogFeedback = document.getElementById('partnerDialogFeedback');

  document.getElementById('closePartnerDialogBtn')?.addEventListener('click', () => {
    clearInterval(breathingInterval);
    dialog?.close();
  });
  dialog?.addEventListener('close', () => {
    clearInterval(breathingInterval);
  });

  sendUnblockBtn?.addEventListener('click', async () => {
    const reasonInput = document.getElementById('unblockReasonInput');
    const reason = reasonInput?.value.trim() || 'Solicitação de desbloqueio pelo aplicativo';
    const durationInput = document.querySelector('input[name="unblockDuration"]:checked');
    const durationMinutes = Number(durationInput?.value || 15);
    const cat = categoryCatalog.find((c) => c.id === activeCategoryForUnlock);
    const sampleDomain = cat?.sampleDomains?.[0] || (activeCategoryForUnlock ? `${activeCategoryForUnlock}.local` : 'exemplo.com');

    sendUnblockBtn.disabled = true;
    if (partnerDialogFeedback) {
      partnerDialogFeedback.hidden = false;
      partnerDialogFeedback.textContent = 'Enviando solicitação ao Telegram...';
    }

    try {
      const res = await bridge.requestUnblock({
        domain: sampleDomain,
        reason,
        durationMinutes,
        ruleLabel: cat ? `Categoria: ${cat.namePt}` : 'Regra do monBlock',
        title: `Alteração de categoria: ${cat ? cat.namePt : activeCategoryForUnlock}`,
      });

      if (res && (res.status === 200 || res.status === 202 || res.requested)) {
        if (partnerDialogFeedback) {
          partnerDialogFeedback.textContent = '✓ Pedido enviado ao Telegram do seu Ajudante! Aguardando resposta...';
        }
        notify(`Pedido enviado ao Telegram do Ajudante para ${cat ? cat.namePt : 'a categoria'}.`);
        setTimeout(() => {
          dialog?.close();
        }, 1500);
      } else {
        const detail = res?.detail || 'Não foi possível enviar o pedido ao Ajudante.';
        if (partnerDialogFeedback) {
          partnerDialogFeedback.textContent = detail;
        }
        notify(detail, true);
      }
    } catch (err) {
      const msg = err?.message || 'Falha ao comunicar com o serviço do Ajudante.';
      if (partnerDialogFeedback) partnerDialogFeedback.textContent = msg;
      notify(msg, true);
    } finally {
      sendUnblockBtn.disabled = false;
    }
  });

  // Categorias
  for (const card of document.querySelectorAll('[data-category-id]')) {
    const button = card.querySelector('[data-action]');
    if (button) {
      button.addEventListener('click', async () => {
        if (button.dataset.action === 'request-partner-unlock') {
          activeCategoryForUnlock = card.dataset.categoryId;
          const cat = categoryCatalog.find((c) => c.id === activeCategoryForUnlock);
          const titleEl = document.getElementById('dialog-title');
          if (titleEl && cat) {
            titleEl.textContent = `Pedir ajuda: ${cat.namePt}`;
          }
          if (partnerDialogFeedback) partnerDialogFeedback.hidden = true;
          const reasonInput = document.getElementById('unblockReasonInput');
          if (reasonInput) reasonInput.value = '';
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

  async function runUrlCheck() {
    if (!urlCheckerInput || !urlCheckerResult) return;
    const value = urlCheckerInput.value.trim();
    if (!value) {
      urlCheckerResult.style.display = 'none';
      return;
    }
    const check = await checkUrlBlockStatus(value);
    urlCheckerResult.style.display = 'flex';
    if (check && check.blocked) {
      urlCheckerResult.dataset.status = 'blocked';
      urlCheckerResult.textContent = `🚫 Bloqueado por: ${check.reason}`;
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

  // Bot do Telegram: o token vai direto ao serviço do sistema; o campo é limpo e nunca fica na interface.
  const botConnectBtn = document.getElementById('botConnectBtn');
  botConnectBtn?.addEventListener('click', async () => {
    const input = document.getElementById('botTokenInput');
    const token = input?.value.trim();
    if (!token) {
      notify('Cole o token que o @BotFather enviou.', true);
      return;
    }
    const ok = await execute(botConnectBtn, () => bridge.setBotToken({ token }), 'Bot conectado.');
    if (input) input.value = '';
    if (ok) await loadState();
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

  function startPairingPoll() {
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
  }

  // Pareamento por link: o Ajudante abre t.me/<bot>?start=<código> e é vinculado sozinho.
  document.getElementById('onboardingLinkBtn')?.addEventListener('click', async (event) => {
    const partnerName = document.getElementById('onboardingPartnerNameInput')?.value.trim();
    if (!partnerName) {
      notify('Preencha o Nome do Ajudante.', true);
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const res = await bridge.initiatePairingLink({ partnerName });
      if (!res || res.status !== 200) {
        notify(res?.detail || 'Não foi possível gerar o link de convite.', true);
        return;
      }
      if (onboardingPairingCard) onboardingPairingCard.style.display = 'none';
      if (onboardingPairingWaitingCard) onboardingPairingWaitingCard.style.display = 'grid';
      const linkText = document.getElementById('pairingLinkText');
      if (linkText) linkText.textContent = res.pairingLink;
      document.getElementById('pairingLinkRow')?.removeAttribute('hidden');
      notify('Link gerado. Envie ao seu Ajudante; ele vale por 15 minutos e só funciona uma vez.');
      startPairingPoll();
    } catch (err) {
      notify(err?.message || 'Falha ao gerar o link.', true);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('copyPairingLinkBtn')?.addEventListener('click', async () => {
    const text = document.getElementById('pairingLinkText')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      notify('Link copiado.');
    } catch {
      notify('Não foi possível copiar. Selecione o link e copie manualmente.', true);
    }
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

      startPairingPoll();
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

  // Modal Legal (Privacidade e Termos)
  const legalDialog = document.getElementById('legalDialog');
  const openPrivacyBtn = document.getElementById('openPrivacyBtn');
  const openTermsBtn = document.getElementById('openTermsBtn');
  const closeLegalDialogBtn = document.getElementById('closeLegalDialogBtn');
  const tabPrivacyBtn = document.getElementById('tabPrivacyBtn');
  const tabTermsBtn = document.getElementById('tabTermsBtn');
  const legalPrivacyPanel = document.getElementById('legalPrivacyPanel');
  const legalTermsPanel = document.getElementById('legalTermsPanel');

  function showLegalTab(tab) {
    const isPrivacy = tab === 'privacy';
    if (tabPrivacyBtn) tabPrivacyBtn.setAttribute('aria-selected', String(isPrivacy));
    if (tabTermsBtn) tabTermsBtn.setAttribute('aria-selected', String(!isPrivacy));
    if (legalPrivacyPanel) legalPrivacyPanel.hidden = !isPrivacy;
    if (legalTermsPanel) legalTermsPanel.hidden = isPrivacy;
  }

  openPrivacyBtn?.addEventListener('click', () => {
    showLegalTab('privacy');
    legalDialog?.showModal();
  });
  openTermsBtn?.addEventListener('click', () => {
    showLegalTab('terms');
    legalDialog?.showModal();
  });
  closeLegalDialogBtn?.addEventListener('click', () => legalDialog?.close());
  tabPrivacyBtn?.addEventListener('click', () => showLegalTab('privacy'));
  tabTermsBtn?.addEventListener('click', () => showLegalTab('terms'));

  // In-App Updater & Diálogo de Atualização
  const appUpdatePill = document.getElementById('appUpdatePill');
  const appUpdatePillText = document.getElementById('appUpdatePillText');
  const updateDialog = document.getElementById('updateDialog');
  const updateCurrentVersion = document.getElementById('updateCurrentVersion');
  const updateTargetVersion = document.getElementById('updateTargetVersion');
  const updateNotesContent = document.getElementById('updateNotesContent');
  const updateDownloadProgress = document.getElementById('updateDownloadProgress');
  const updateProgressFill = document.getElementById('updateProgressFill');
  const updateProgressText = document.getElementById('updateProgressText');
  const updateFeedback = document.getElementById('updateFeedback');
  const closeUpdateDialogBtn = document.getElementById('closeUpdateDialogBtn');
  const confirmUpdateBtn = document.getElementById('confirmUpdateBtn');

  let currentUpdateInfo = null;

  async function checkAppUpdates() {
    if (!bridge?.checkUpdates) return;
    try {
      const res = await bridge.checkUpdates();
      if (res && res.hasUpdate && res.latestVersion) {
        currentUpdateInfo = res;
        if (appUpdatePill) {
          appUpdatePill.hidden = false;
          if (appUpdatePillText) appUpdatePillText.textContent = `v${res.latestVersion}`;
        }
      }
    } catch {
      // Ignora falhas de rede na checagem em background
    }
  }

  function openUpdateModal() {
    if (!currentUpdateInfo) return;
    if (updateCurrentVersion) updateCurrentVersion.textContent = `v${currentUpdateInfo.currentVersion || '0.8.1'}`;
    if (updateTargetVersion) updateTargetVersion.textContent = `v${currentUpdateInfo.latestVersion}`;
    if (updateNotesContent) {
      updateNotesContent.textContent = currentUpdateInfo.releaseNotes || 'Melhorias de estabilidade, desempenho e segurança do monBlock.';
    }
    if (updateDownloadProgress) updateDownloadProgress.hidden = true;
    if (updateFeedback) updateFeedback.hidden = true;
    if (confirmUpdateBtn) confirmUpdateBtn.disabled = false;
    if (closeUpdateDialogBtn) closeUpdateDialogBtn.disabled = false;
    updateDialog?.showModal();
  }

  appUpdatePill?.addEventListener('click', openUpdateModal);
  closeUpdateDialogBtn?.addEventListener('click', () => updateDialog?.close());

  confirmUpdateBtn?.addEventListener('click', async () => {
    if (!currentUpdateInfo?.pkgUrl || !bridge?.downloadUpdate) {
      if (updateFeedback) {
        updateFeedback.hidden = false;
        updateFeedback.textContent = 'Pacote de instalação indisponível nesta release.';
      }
      return;
    }

    if (updateDownloadProgress) updateDownloadProgress.hidden = false;
    if (updateProgressFill) updateProgressFill.style.width = '45%';
    if (updateProgressText) updateProgressText.textContent = 'Baixando pacote oficial...';
    if (confirmUpdateBtn) confirmUpdateBtn.disabled = true;
    if (closeUpdateDialogBtn) closeUpdateDialogBtn.disabled = true;

    try {
      const result = await bridge.downloadUpdate({
        pkgUrl: currentUpdateInfo.pkgUrl,
        expectedSha256: currentUpdateInfo.sha256,
      });

      if (result && result.success) {
        if (updateProgressFill) updateProgressFill.style.width = '100%';
        if (updateProgressText) updateProgressText.textContent = '100% — Concluído!';
        setTimeout(() => {
          updateDialog?.close();
          notify('Instalador do monBlock aberto. Siga as instruções no instalador do macOS.');
        }, 1200);
      } else {
        if (updateFeedback) {
          updateFeedback.hidden = false;
          updateFeedback.textContent = result?.error || 'Não foi possível baixar o instalador.';
        }
        if (confirmUpdateBtn) confirmUpdateBtn.disabled = false;
        if (closeUpdateDialogBtn) closeUpdateDialogBtn.disabled = false;
      }
    } catch (err) {
      if (updateFeedback) {
        updateFeedback.hidden = false;
        updateFeedback.textContent = `Erro ao atualizar: ${err?.message || String(err)}`;
      }
      if (confirmUpdateBtn) confirmUpdateBtn.disabled = false;
      if (closeUpdateDialogBtn) closeUpdateDialogBtn.disabled = false;
    }
  });

  void checkAppUpdates();
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
    if (!switchView(viewId, true)) return;
    userNavigated = true;
    if (viewId === 'rules') document.getElementById('batchDomainsTextarea')?.focus();
  });
  switchView('categories');
  void loadCategoryCatalog().then(() => renderActiveRulesTable());
  void loadState();
  setInterval(updateCooldown, 1000);
})();
