'use strict';

/**
 * Inicializador de DOM do Renderer Electron do monBlock (MOD-04).
 *
 * Compatível com `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`
 * e Content-Security-Policy estrita (`script-src 'self'`).
 * Comunica-se exclusivamente com o processo Main via `window.monblock` (contextBridge).
 */
(function bootstrapDesktopRenderer() {
  if (typeof document === 'undefined') return;

  const htmlEl = document.documentElement;
  const themeBtns = Array.from(document.querySelectorAll('[data-theme-select]'));
  const navBtns = Array.from(document.querySelectorAll('[data-nav-target]'));
  const views = Array.from(document.querySelectorAll('[data-view]'));
  const dialog = document.getElementById('partnerAuthDialog');
  const closeDialogBtn = document.getElementById('closePartnerDialogBtn');
  const confirmDialogBtn = document.getElementById('confirmPartnerAuthBtn');

  function switchView(targetView) {
    htmlEl.setAttribute('data-ui-state', 'active');
    for (const btn of navBtns) {
      const isMatch = btn.getAttribute('data-nav-target') === targetView;
      if (isMatch) {
        btn.setAttribute('aria-current', 'page');
        btn.classList.add('ccat-btn-primary');
      } else {
        btn.removeAttribute('aria-current');
        btn.classList.remove('ccat-btn-primary');
      }
    }
    for (const view of views) {
      if (view.getAttribute('data-view') === targetView) {
        view.removeAttribute('hidden');
      } else {
        view.setAttribute('hidden', 'true');
      }
    }
  }

  // Inicializa exibindo a view ativa padrão (categories) e ocultando as outras 3
  switchView('categories');

  for (const btn of themeBtns) {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme-select') || 'capycro-ivory';
      htmlEl.setAttribute('data-theme', theme);
      for (const b of themeBtns) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      }
    });
  }

  for (const btn of navBtns) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav-target') || 'categories';
      switchView(target);
    });
  }

  // Interação das 11 Categorias (Catraca Append-Only) usando [data-category-id]
  document.querySelectorAll('[data-category-id]').forEach((card) => {
    const actionBtn = card.querySelector('[data-action]');
    if (!actionBtn) return;
    actionBtn.addEventListener('click', async () => {
      const action = actionBtn.getAttribute('data-action');
      const catId = card.getAttribute('data-category-id');
      if (action === 'request-partner-unlock') {
        if (dialog && typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
        return;
      }
      if (action === 'enable-category' && catId) {
        if (window.monblock && typeof window.monblock.enableCategory === 'function') {
          await window.monblock.enableCategory(catId);
        }
        card.setAttribute('data-locked', 'true');
        const badge = card.querySelector('.ccat-badge');
        if (badge) {
          badge.className = 'ccat-badge ccat-badge-locked';
          badge.textContent = '🔒 Ativa e Trancada pelo Ajudante';
        }
        actionBtn.setAttribute('data-action', 'request-partner-unlock');
        actionBtn.className = 'ccat-btn';
        actionBtn.textContent = 'Solicitar Desbloqueio ao Ajudante';
      }
    });
  });

  if (closeDialogBtn && dialog) {
    closeDialogBtn.addEventListener('click', () => dialog.close());
  }
  if (confirmDialogBtn && dialog) {
    confirmDialogBtn.addEventListener('click', () => dialog.close());
  }

  // Contador de Lote de Domínios (0 / 100)
  const batchTextarea = document.getElementById('batchDomainsTextarea');
  const batchCounter = document.getElementById('batchCounter');
  const submitBatchBtn = document.getElementById('submitBatchBtn');
  if (batchTextarea && batchCounter) {
    batchTextarea.addEventListener('input', () => {
      const lines = batchTextarea.value
        .split(/[\r\n,\s]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      batchCounter.textContent = `${lines.length} / 100 domínios`;
    });
  }
  if (submitBatchBtn && batchTextarea) {
    submitBatchBtn.addEventListener('click', async () => {
      const domains = batchTextarea.value
        .split(/[\r\n,\s]+/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (domains.length > 0 && domains.length <= 100 && window.monblock?.addBatchDomains) {
        await window.monblock.addBatchDomains(domains);
        batchTextarea.value = '';
        if (batchCounter) batchCounter.textContent = '0 / 100 domínios';
      }
    });
  }

  // Adição de Palavra-Chave
  const keywordInput = document.getElementById('keywordInput');
  const submitKeywordBtn = document.getElementById('submitKeywordBtn');
  if (submitKeywordBtn && keywordInput) {
    submitKeywordBtn.addEventListener('click', async () => {
      const kw = keywordInput.value.trim();
      if (kw && window.monblock?.addKeywords) {
        await window.monblock.addKeywords([kw]);
        keywordInput.value = '';
      }
    });
  }

  // Cooldown de 72h e Navegação vinda da Tray macOS
  const startCooldownBtn = document.getElementById('startCooldownBtn');
  const cooldownDisplay = document.getElementById('cooldownTimerDisplay');
  if (startCooldownBtn && cooldownDisplay) {
    startCooldownBtn.addEventListener('click', async () => {
      if (window.monblock?.triggerEmergencyCooldown) {
        await window.monblock.triggerEmergencyCooldown();
      }
      startCooldownBtn.textContent = 'Cooldown de 72h em Andamento (Ajudante Notificado)';
    });
  }

  if (window.monblock && typeof window.monblock.onTrayNavigate === 'function') {
    window.monblock.onTrayNavigate((viewId) => {
      if (viewId) switchView(viewId);
    });
  }
})();
