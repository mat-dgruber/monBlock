/** Rota inicial e contraste (spec 2026-11-06-rota-inicial-e-revisao-telas-design.md, F0/F1). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const rendererPath = path.join(root, 'src/renderer/renderer-init.js');

async function loadPick() {
  await import(/* @vite-ignore */ rendererPath);
  return (globalThis as unknown as { monblockRenderer: { pickInitialView: (s: unknown, o?: object) => string | null } })
    .monblockRenderer.pickInitialView;
}

function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('pickInitialView', () => {
  it('abre em Primeiros passos quando não pareado', async () => {
    const pick = await loadPick();
    expect(pick({ paired: false })).toBe('onboarding');
  });
  it('abre em Categorias quando pareado', async () => {
    const pick = await loadPick();
    expect(pick({ paired: true })).toBe('categories');
  });
  it('respeita "Agora não" mesmo sem pareamento', async () => {
    const pick = await loadPick();
    expect(pick({ paired: false }, { dismissed: true })).toBe('categories');
  });
  it('não decide sem estado (daemon indisponível) nem depois de navegar', async () => {
    const pick = await loadPick();
    expect(pick(null)).toBeNull();
    expect(pick({ paired: false }, { userNavigated: true })).toBeNull();
  });
});

describe('contraste do texto sobre a cor primária (AA 4,5:1)', () => {
  const themes = ['capycro-ivory', 'dark-tech', 'light-fintech', 'high-contrast-aaa'];
  for (const theme of themes) {
    it(`${theme}`, () => {
      const block = html.match(new RegExp(`\\[data-theme="${theme}"\\][^{]*\\{([^}]*)\\}`))![1]!;
      const brand = block.match(/--ccat-brand-primary:\s*(#[0-9A-Fa-f]{6})/)![1]!;
      const on = block.match(/--ccat-on-brand:\s*(#[0-9A-Fa-f]{6})/)![1]!;
      expect(ratio(on, brand)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it('não deixa #FFFFFF fixo sobre o primário', () => {
    expect(html).not.toMatch(/background: var\(--ccat-brand-primary\);\s*color: #FFFFFF/);
  });
});

describe('honestidade do cabeçalho', () => {
  it('não afirma proteção ativa de forma estática', () => {
    expect(html).not.toContain('Proteção Contínua Ativa');
    expect(html).toContain('id="retryStateBtn"');
  });
});

describe('onboarding acessível e honesto (F2)', () => {
  const js = fs.readFileSync(rendererPath, 'utf8');
  it('abas ligadas aos painéis, sem display inline e com setas', () => {
    for (const i of [1, 2, 3, 4]) {
      expect(html).toContain(`aria-controls="onboardingStepPanel${i}"`);
      expect(html).toContain(`id="onboardingStepPanel${i}" data-panel-step="${i}" role="tabpanel"`);
    }
    expect(html).not.toMatch(/onboardingStepPanel\d[^>]*style="display: none;"/);
    expect(js).toContain('ArrowRight:');
  });
  it('passo 4 só após o pareamento e confirmação nunca marcada sozinha', () => {
    expect(js).toContain('if (stepNumber === 4 && !isPaired) return;');
    expect(js).not.toContain('cb.checked = true');
    expect(html).toMatch(/id="goToCategoriesBtn"[^>]*disabled/);
  });
  it('dialog de pausa sem campo que não envia nada; dialogs com foco inicial', () => {
    expect(html).not.toContain('dialogUnblockReasonInput');
    expect(html).toMatch(/id="closePartnerDialogBtn" autofocus/);
    expect(html).toMatch(/id="closeProfileStepsBtn" autofocus/);
    expect(html).toContain('dialog#profileStepsDialog {');
  });
});
