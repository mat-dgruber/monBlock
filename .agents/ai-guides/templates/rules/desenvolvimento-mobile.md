# Checklist de Engenharia e Desenvolvimento Mobile (`.agents/rules/desenvolvimento-mobile.md`)

<!-- Fonte canônica: templates/rules/desenvolvimento-mobile.md (guides/mobile/guia-desenvolvimento-mobile-conceito-producao.md) — instalado por MOB-01 -->

Regra always-on: aplique este checklist em code review, auditoria de telas e aprovação de PRs de aplicativos móveis (Flutter, React Native/Expo, Swift/SwiftUI e Kotlin/Compose). Guia completo em `.agents/ai-guides/guides/mobile/guia-desenvolvimento-mobile-conceito-producao.md`.

## Checklist Canônico de Engenharia Mobile

### A. Fluxo Unidirecional e Gerenciamento de Estado
- [ ] A interface é uma projeção puramente reativa do estado atual? A UI apenas renderiza dados e despacha eventos/intenções?
- [ ] O estado da tela modela situações mutuamente exclusivas via tipos fechados/selados (ex.: `Idle`, `Loading`, `Success(data)`, `Empty`, `Error(message)`), evitando múltiplos booleanos concorrentes?
- [ ] O estado efêmero de UI (campos de texto em edição, foco) sobrevive à rotação de tela e recriação do processo pelo sistema operacional?
- [ ] Nenhuma chamada direta de banco de dados, HTTP ou GPS é realizada diretamente dentro de widgets ou componentes visuais?

### B. Resiliência de Rede, Bateria e Offline-First
- [ ] Toda requisição HTTP implementa timeout explícito, deduplicação/idempotência e suporte a cancelamento de requisição?
- [ ] O app trata a ausência de conectividade como estado operacional padrão, utilizando banco local (SQLite/Room/SwiftData/Drift) como fonte de leitura da UI?
- [ ] Operações de escrita offline são enfileiradas via padrão Outbox com resolução determinística de conflitos?
- [ ] Nenhuma computação pesada (parsing de JSON extenso, filtros em listas gigantes, criptografia) é executada na UI Thread?

### C. Ergonomia, UI Adaptável e Acessibilidade
- [ ] Os alvos de toque interativos possuem dimensões mínimas de 48x48 dp (Android) ou 44x44 pt (iOS) e espaçamento mínimo de 8 dp/pt?
- [ ] O layout respeita Safe Area insets (notches, Dynamic Island, barras de navegação por gestos) e reage dinamicamente à abertura do teclado virtual?
- [ ] O texto suporta Dynamic Type (iOS) e Font Scaling (Android) até 200% sem quebras de layout, sem altura estática e sem truncamento ilegível?
- [ ] Taxa de contraste mínima de 4.5:1 (texto normal) e 3.0:1 (texto grande/ícones) conforme WCAG 2.2 AA?
- [ ] Todos os controles interativos possuem rótulos semânticos, papéis e estados acessíveis para VoiceOver e TalkBack?
- [ ] Animações consultam a preferência do sistema de Redução de Movimento (*Reduce Motion*) e aplicam alternativa em cross-fade suave?

### D. Segurança Defensiva e Permissões (OWASP MASVS v2)
- [ ] Zero credenciais, chaves de API secretas ou certificados privados commitados no binário do aplicativo?
- [ ] Tokens de autenticação e segredos de sessão são armazenados exclusivamente em hardware seguro (iOS Keychain / Android Keystore / Expo SecureStore)? `AsyncStorage` e `SharedPreferences` não criptografados são terminantemente proibidos para dados sensíveis.
- [ ] Criptografia local em repouso utiliza AES-256-GCM (AEAD) com chaves derivadas via KDF robusto (Argon2id / PBKDF2)?
- [ ] Permissões de hardware (câmera, GPS, microfone, notificações) são solicitadas contextualmente com diálogo prévio de rationale, tratando graciosamente a recusa do usuário?
- [ ] Deep links, Universal Links e App Links são tratados como entrada não confiável, com validação de esquema, domínio e autorização antes da navegação?
- [ ] Builds de release ativam minificação, ofuscação (R8/ProGuard), stripping de símbolos e remoção completa de logs em compilação?
