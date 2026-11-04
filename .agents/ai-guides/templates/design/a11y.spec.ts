// Fonte canônica: templates/design/a11y.spec.ts (guia-universal-design-ui-ux-acessibilidade.md §5 e §11) — instalado por UI-05
// Auditoria WCAG 2.2 AA automatizada com axe-core. Ajuste ROUTES para as telas críticas do produto.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = ['/'];

for (const route of ROUTES) {
  test(`a11y: ${route} sem violações WCAG 2.2 AA`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}
