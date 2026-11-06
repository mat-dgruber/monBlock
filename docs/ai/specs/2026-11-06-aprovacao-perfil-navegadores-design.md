# Spec — Guiar a aprovação do perfil dos navegadores

- **Data:** 2026-11-06
- **Status:** aprovada (2026-11-06)
- **Plano:** `docs/ai/plans/2026-11-06-aprovacao-perfil-navegadores.md`
- **Relacionado:** ADR-0007, spike S1 (`docs/ai/reports/2026-11-05-spikes-daemon-root.md`)

## 1. Problema

O `postinstall` abre `monblock-browsers.mobileconfig` e o macOS mostra só "Profile Downloaded —
Review the profile in System Settings". Não diz onde fica nem por que importa. O usuário precisa achar
Ajustes > Geral > Gerenciamento de Dispositivos e clicar em Instalar. Sem isso, Chrome/Brave/Edge ficam
só com a escrita direta em `/Library/Managed Preferences`, que o macOS remove (spike S1), e o DNS
seguro do navegador fica ligado (fura o `/etc/hosts`). E ninguém avisa depois se o usuário fechou o alerta.

## 2. Objetivo

1. No fim da instalação, o usuário vê **por que** e **como** aprovar, e cai direto no painel certo.
2. Enquanto o perfil não estiver instalado, o app mostra um aviso persistente com os passos e um
   botão que abre o painel. O aviso some sozinho quando o perfil é instalado.

Fora de escopo: MDM, instalar o perfil sem o usuário (o macOS não permite), Firefox (usa plist próprio).

## 3. Desenho

### 3.1 Instalador (`.pkg`)
- **Página de conclusão** do Instalador (`productbuild --distribution` com `<conclusion file="conclusion.html">`),
  em pt-BR: "Falta 1 passo: aprove o perfil dos navegadores", 3 passos numerados, por que importa
  (sem ele o Chrome/Brave/Edge ignoram o bloqueio), e que o painel já foi aberto.
- **`postinstall`:** depois do `open` do `.mobileconfig`, abre direto o painel
  `x-apple.systempreferences:com.apple.Profiles-Settings.extension` como o usuário do console.
  (Mesmo padrão do `open` que já existe, com `launchctl asuser`.)

### 3.2 Daemon
- Novo campo em `GET_STATE`: `browserProfileInstalled: boolean | null`.
  O daemon (root) roda `/usr/bin/profiles list -all` com `execFile`, timeout de 5 s, e procura
  `com.ccat.monblock.browsers`. Roda no watchdog (60 s) e guarda o resultado em memória (não persiste).
  `null` = ainda não verificado ou o comando falhou (a UI não mostra o aviso nesse caso, para não
  incomodar por falha de verificação; o erro vai para o log).

### 3.3 App
- **Aviso** (faixa no topo do painel, `role="status"`, tokens CCAT existentes) quando
  `browserProfileInstalled === false`:
  - título: "Falta 1 passo para proteger os navegadores"
  - texto: "Aprove o perfil do monBlock em Ajustes do Sistema > Geral > Gerenciamento de Dispositivos.
    Sem ele, Chrome, Brave e Edge podem ignorar o bloqueio."
  - botões: **"Abrir Ajustes"** (primário) e **"Ver passos"** (abre `<dialog>` nativo com os 3 passos).
- **IPC novo** `monblock:open-profile-settings`: sem parâmetros; o main abre a URL fixa do painel
  (`shell.openExternal`) e, se o perfil sumiu do disco do usuário, reabre o `.mobileconfig` de
  `HELPER_DIR`. Nenhum dado do renderer chega ao shell.
- Some sozinho no próximo `GET_STATE` com `true`.

**Estados da UI:**

| Estado | `browserProfileInstalled` | O que aparece |
|---|---|---|
| Carregando / ainda não verificado | `null` | nada (sem spinner: a verificação é de fundo) |
| Falha ao verificar | `null` | nada; erro só no log do daemon |
| Falta aprovar | `false` | faixa de aviso + botões |
| Aprovado | `true` | nada |
| Daemon offline | — | tela "Proteção não verificada" existente |
| "Abrir Ajustes" falhou | — | mensagem inline na faixa: "Abra Ajustes do Sistema > Geral > Gerenciamento de Dispositivos." |

**Fronteiras:** o IPC novo não recebe nada do renderer (URL e caminho fixos no main); a saída do
`profiles` não é exposta, só o booleano; nenhum dado pessoal novo.

## 4. Alternativas

| Opção | Veredito |
|---|---|
| Só a página de conclusão do Instalador | Barata, mas some se o usuário fechar e nunca mais avisa |
| Só o aviso no app | Pega todos os casos, mas o usuário sai do Instalador sem saber o que fazer |
| **Ambos** *(recomendada)* | Instalador explica na hora; app cobre quem fechou o alerta ou removeu o perfil depois |
| Modal bloqueante no app | Atrito alto; o aviso persistente cumpre o objetivo sem travar o painel |

## 5. Critérios de aceite (BDD)

- **Dado** uma instalação do `.pkg`, **quando** termina, **então** a página de conclusão mostra os passos
  e os Ajustes abrem no painel de perfis.
- **Dado** o perfil não instalado, **quando** abro o app, **então** vejo o aviso; **quando** clico
  "Abrir Ajustes", **então** os Ajustes abrem no painel de perfis.
- **Dado** que aprovo o perfil, **então** em até ~25 s (UI consulta a cada 15 s; com o perfil não confirmado, o `GET_STATE` refaz a checagem no máximo a cada 10 s) o aviso some sem reiniciar o app.
- **Dado** que `profiles` falha ou estoura o timeout, **então** `browserProfileInstalled` é `null`,
  o aviso não aparece e o log registra o erro.
- Aviso acessível: anunciado por leitor de tela (`role="status"`), foco visível, operável por teclado,
  `<dialog>` fecha com Esc.

## 6. Casos de borda

- Usuário remove o perfil depois (precisa ser Admin): o aviso volta no próximo tick.
- `profiles list -all` muda de formato em versão futura do macOS: busca só pelo identificador; se falhar → `null`.
- A URL do painel não abrir em alguma versão: o fallback é o texto dos passos no aviso e no `<dialog>`.
- Daemon offline: vale a tela "Proteção não verificada" que já existe; o aviso do perfil não aparece.

## 7. Riscos e spike

- **Spike (antes de codar):** confirmar no macOS 27 (a) o formato de `sudo profiles list -all` com o
  perfil instalado e não instalado; (b) se `open x-apple.systempreferences:com.apple.Profiles-Settings.extension`
  abre o painel certo.
- **Spike (a), 2026-11-06, macOS 27.0.1:** com o perfil aprovado, `sudo profiles list -all` imprime
  `_computerlevel[3] attribute: profileIdentifier: com.ccat.monblock.browsers`. A busca usa a linha
  `profileIdentifier: com.ccat.monblock.browsers` (o índice entre colchetes varia).
- **Spike (b), 2026-11-06, macOS 27.0.1:** `open x-apple.systempreferences:com.apple.Profiles-Settings.extension`
  abre Ajustes > Geral > Gerenciamento de Dispositivos ("Device Management") com o perfil listado.
- `execFile` a cada 60 s como root: custo desprezível; argumentos fixos, sem shell.

## 8. Rollback

Aditivo: remover o campo do `GET_STATE`, o aviso, o IPC e a página de conclusão. O `.pkg` volta a ser
`productbuild --package`.
