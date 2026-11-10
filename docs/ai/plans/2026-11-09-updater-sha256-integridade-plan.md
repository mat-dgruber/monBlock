# Plano de Implementação: Garantia de Integridade Criptográfica SHA-256 no Atualizador In-App

- **Data:** 2026-11-09
- **Status:** Proposto (Aguardando Auditoria e Aprovação)
- **Documento de Origem:** `docs/ai/specs/2026-11-09-updater-sha256-integridade-design.md`
- **Alvo:** `docs/ai/plans/2026-11-09-updater-sha256-integridade-plan.md`

---

## 1. Resumo Executivo

Este plano implementa a garantia de verificação de integridade SHA-256 no módulo de atualização in-app (`src/main/updater.ts`), eliminando o bypass silencioso atual onde `expectedSha256` chegava indefinido.
A implementação adiciona:
1. Resolução automática do hash SHA-256 em `checkForAppUpdates` a partir de assets (`<nome>.pkg.sha256`, `SHA256SUMS`, `checksums.txt`) ou fallback estruturado no corpo da release (`body`).
2. Propagação do hash resolvido via IPC para o Renderer e de volta para a rotina de download.
3. Bloqueio estrito (Fail-Closed) em caso de divergência de hash ou erro de integridade com deleção imediata de arquivos temporários.
4. Atualização da suíte de testes unitários com mocks de arquivos de checksum e releases com hash no corpo.

---

## 2. Restrições Técnicas & Limites Operacionais

1. **Sem Dependências Externas:** A busca e verificação de hash deve utilizar exclusivamente a API nativa do Node.js (`crypto.createHash('sha256')`) e a função `fetchFn` injetável (compatível com `node-fetch`/`fetch` global).
2. **Latência de Rede e Timeouts:** O download do arquivo de checksum (quando presente) deve respeitar o mesmo timeout controlado da chamada de atualização (10.000 ms) e não travar o processo principal.
3. **Limite de Tamanho de Checksums:** O arquivo de checksums lido em memória não deve exceder 512 KB, prevenindo ataques de alocação de memória.
4. **Isolamento de Caminho e Permissões:** O arquivo baixado em pasta temporária (`os.tmpdir()`) deve utilizar escrita atômica com sufixo `.download` e ser purgado em caso de qualquer exceção ou falha de hash.

---

## 3. Matriz de Avaliação de Alternativas (Trade-offs)

| Dimensão | Opção A: Exigir apenas Hash no Body do GitHub | Opção B: Suporte Duplo (Asset Checksum + Body Fallback) (Eleita) | Opção C: Exigir Chave PGP/GPG Embutida |
| :--- | :--- | :--- | :--- |
| **Ergonomia de Release** | Manual (necessita colar o hash nas notas) | **Automática via script de CI (`shasum -a 256`) ou manual** | Complexa (gestão de expiração de subchaves) |
| **Resiliência a Formatação**| Baixa (markdown pode quebrar regex) | **Alta (arquivos `.sha256` / `checksums.txt` são determinísticos)** | Alta |
| **Segurança Supply Chain** | Média | **Alta (Zero-Trust com integridade comprovada)** | Muito Alta |
| **Veredito** | Frágil como única fonte | **ESCOLHIDA (Padrão industrial, robusto e flexível)** | Descartada por complexidade desproporcional |

---

## 4. Casos de Borda & Invariantes

- **Invariante 1:** Nenhum arquivo com hash divergente pode permanecer no disco nem ser executado via `shell.openPath`.
- **Invariante 2:** A busca por checksum em arquivo multi-linha (`SHA256SUMS`) deve encontrar a linha correta correspondente ao arquivo `.pkg`, ignorando outros arquivos (ex: `.zip`, `.dmg`).
- **Caso de Borda 1:** Checksum em formato BSD (`SHA256 (monblock.pkg) = hash`) vs formato GNU (`hash  monblock.pkg` ou `hash *monblock.pkg`). Ambos devem ser suportados.
- **Caso de Borda 2:** Release antiga sem nenhum hash publicado. O sistema deve alertar o usuário sobre a ausência de assinatura de integridade sem quebrar o fluxo.

---

## 5. Arquivos Afetados

| Arquivo | Mudança Principal |
| :--- | :--- |
| `src/main/updater.ts` | Implementar resolução de hash em `checkForAppUpdates` (lendo assets `.sha256`/`checksums.txt` ou `body`) e preencher `sha256`. |
| `src/renderer/renderer-init.js` | Exibir badge/status de integridade verificada na janela modal de atualização. |
| `tests/main/updater.test.ts` | Testar cenários de extração via asset `.sha256`, via `checksums.txt` (GNU e BSD), via body, e falha de integridade. |
| `docs/legal/privacy-policy.md` | Atualizar seção de comunicação externa e integridade de software. |

---

## 6. Tarefas de Implementação Passo a Passo

### Fase 1: Implementação da Resolução de Checksum
- [ ] Criar função auxiliar `extractSha256FromText(text: string, filename: string): string | undefined` em `src/main/updater.ts` com suporte aos formatos GNU, BSD e regex de body.
- [ ] Em `checkForAppUpdates`:
  - Se localizar asset `.pkg`, verificar se há asset com sufixo `.sha256` ou nomes `SHA256SUMS` / `checksums.txt`.
  - Se houver asset, fazer fetch do conteúdo e extrair o hash para o arquivo `.pkg`.
  - Se não houver asset, tentar extrair do `data.body`.
  - Preencher `sha256: resolvedHash` no objeto de retorno `UpdateCheckResult`.

### Fase 2: Testes Unitários de Integridade
- [ ] Criar testes unitários em `tests/main/updater.test.ts` cobrindo:
  - Extração com asset `<nome>.pkg.sha256`
  - Extração com asset `checksums.txt` multi-linha formato GNU
  - Extração com asset `SHA256SUMS` formato BSD
  - Extração de fallback a partir do body da release
  - Rejeição e exclusão de arquivo quando o hash divergente é detectado

### Fase 3: Validação Integrada e Build
- [ ] Executar suíte de testes: `npm test` / `npx vitest run tests/main/updater.test.ts`.
- [ ] Executar build de produção: `npm run build`.

---

## 7. Análise de Risco e Plano de Rollback

| Risco | Impacto | Mitigação |
| :--- | :--- | :--- |
| Release futura publicada sem checksum impedir atualização | Baixo | Fallback gracioso: o usuário é avisado e pode abrir o link oficial do GitHub Releases diretamente. |
| Falha temporária ao baixar o arquivo de checksum | Baixo | Tentar extrair do body; se indisponível, reporta aviso na UI. |

**Plano de Rollback:**
Caso haja qualquer problema em ambientes de release heterogêneos, a obrigatoriedade estrita do hash pode ser revertida de forma imediata sem afetar o restante do aplicativo, pois o instalador `.pkg` é autônomo.

