# Relatório — Spikes da Fase 0 (daemon root)

- **Data:** 2026-11-05
- **Plano:** `docs/ai/plans/2026-11-05-daemon-root.md` (Fase 0)
- **Máquina:** macOS 27.0.1, arm64, Node v24.13.1 (universal, `/usr/local/bin/node`)
- **Limite:** nenhum teste com `sudo` nem reboot foi feito nesta sessão. S1 e a execução como LaunchDaemon ficam para a CI macOS ou para um teste manual.

| Spike | Resultado | Confiança |
|---|---|---|
| S1 Managed Preferences | **Provável "não"**: plist escrito à mão sem MDM tende a ser removido | 🟡 (fonte não oficial; falta medir com reboot) |
| S2 Firefox | **Sim**: `/Library/Preferences/org.mozilla.firefox.plist` + `EnterprisePoliciesEnabled` | 🟢 (doc Mozilla) |
| S3 Node SEA | **Sim, com 2 ajustes**; RSS acima da meta | 🟢 (medido) |
| S4 Permissão do socket | **Sim**: o kernel respeita a permissão do arquivo e do diretório | 🟢 (medido) |
| S5 Keychain | **Sim**: ≥ 256 KiB; mas `-w` expõe o valor no `ps` | 🟢 (medido) |

## S1 — `/Library/Managed Preferences` sem MDM

- Não há documento da Apple. Um guia sobre Vivaldi (Chromium) relata que o plist colocado à mão funciona no início e depois é removido como preferência gerenciada órfã. Com um perfil de configuração, persiste após reboot.
- No Sequoia há relatos de falha silenciosa ao criar arquivos nessa pasta sem MDM.
- **Consequência:** a camada 2 (políticas de Chromium) não pode depender de escrever nessa pasta. Opções para a spec:
  1. **Perfil `.mobileconfig`** com o payload `com.google.Chrome` (e Brave/Edge), instalado no onboarding. O macOS exige que o usuário aprove em Ajustes; a remoção do perfil exige Admin. Persiste após reboot.
  2. Manter a escrita direta + reaplicação a cada 60 s (best-effort; janela sem política logo após o boot).
  - **Recomendado: 1**, com 2 como reforço. O hosts (camada 1) continua sendo a garantia principal.
- **Pendente:** medir no `macos-latest` da CI, com `sudo` e reboot, se `chrome://policy` aplica a política.

## S2 — Firefox

- A Mozilla documenta o plist `org.mozilla.firefox` em `/Library/Preferences`, ativado por `EnterprisePoliciesEnabled = TRUE` e com chaves aninhadas achatadas por `__` (ex.: `Homepage__URL`). Não mexe no bundle → não quebra a assinatura.
- **Decisão:** usar esse caminho; descartar `distribution/policies.json`. O `generateFirefoxPoliciesJson` atual vira um gerador de plist.

## S3 — Node SEA

Receita que funcionou (scratchpad, assinatura ad-hoc):

```bash
node --experimental-sea-config sea.json                # gera sea-prep.blob
lipo "$(command -v node)" -thin arm64 -output monblockd # binário universal tem o sentinel 2x
codesign --remove-signature monblockd
npx postject monblockd NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA
codesign --force --sign - --options runtime --entitlements ent.plist monblockd
```

- **Ajuste 1:** o binário universal falha ("Multiple occurences of sentinel"). É preciso gerar um SEA por arquitetura e juntar com `lipo -create` depois de assinar cada um.
- **Ajuste 2:** com hardened runtime e sem `com.apple.security.cs.allow-jit`, o V8 aborta ("Failed to reserve virtual memory for CodeRange"). O entitlement entra no `ent.plist`.
- **Tamanho:** 118 MB por arquitetura (~236 MB universal).
- **RSS:** 44 MB num script trivial. **A meta "< 50 MB" da spec/ADR-0001 não é realista** com o daemon real. Proposta: meta `< 120 MB` RSS, medida na Fase 6.
- **Dependência:** `postject` entra como `devDependency` (ferramenta oficial do Node.js, só no build). Isso contradiz a restrição "sem dependência npm nova" do plano → ajustar para "sem dependência de runtime".
- **Pendente:** notarização (precisa de Developer ID) e execução como LaunchDaemon (precisa de `sudo`).

## S4 — Permissões do socket Unix

Teste com `net.createServer` + `net.connect` (mesmo usuário dono):

| Condição | `connect` |
|---|---|
| normal | OK |
| arquivo do socket `0000` | `EACCES` |
| diretório sem `x` | `EACCES` |

- O macOS respeita as duas permissões → o modelo `root:monblock 0750` (diretório) + `0660` (socket) da spec §5 vale.
- **Achado extra:** caminhos de socket acima de ~104 bytes (`sun_path`) dão `EINVAL` no `listen`. `/var/run/monblock/monblockd.sock` cabe; nos testes de integração, criar sockets em diretórios curtos (`os.tmpdir()` pode ser longo demais no macOS).

## S5 — System Keychain

- Teste em keychain temporário: payloads de 4 KiB a 256 KiB gravados e lidos com `security add/find-generic-password`. O estado real tem poucos KiB → sem limite prático.
- **Achado de segurança:** `security add-generic-password -w <valor>` coloca o cofre inteiro no argv, visível a qualquer usuário via `ps`. O adaptador tem que passar o comando por stdin (`security -i`) ou usar outra API. Vale também para qualquer `execFile` com segredo no argv.

## Mudanças propostas na spec e no plano (precisam de nova aprovação)

1. §9 / Fase 4: Chromium via perfil `.mobileconfig` no onboarding (+ reaplicação direta como reforço); Firefox via `/Library/Preferences/org.mozilla.firefox.plist`.
2. Restrições: RSS `< 120 MB`; "sem dependência **de runtime** nova" (`postject` como devDependency).
3. Fase 8: SEA por arquitetura + `lipo -create`; entitlement `allow-jit`.
4. Fase 6: adaptador do Keychain sem segredo no argv (`security -i` via stdin).
5. Testes: sockets em diretório curto.

## Fontes

- [Locking Down Vivaldi Settings on macOS with Managed Policies](https://axonasif.pages.dev/posts/Vivaldi-(Chromium)-managed-policies-on-MacOS)
- [Apple Developer Forums — managed settings via dscl not appearing on Sequoia](https://developer.apple.com/forums/thread/767845)
- [Jamf Community — legacy managed preferences](https://community.jamf.com/general-discussions-2/jamf-deployed-legacy-managed-preferences-how-to-remove-them-27949)
- [Mozilla — Manage policies on macOS desktops](https://support.mozilla.org/sq/kb/managing-policies-macos-desktops)
