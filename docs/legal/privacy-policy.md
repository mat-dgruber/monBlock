# Política de Privacidade — monBlock

_Última atualização: 9 de novembro de 2026_  
_Versão: 1.0 (Conforme LGPD, GDPR e Apple Privacy Guidelines)_

O **monBlock** foi concebido sob o princípio de **Privacy by Design** (Privacidade por Padrão e desde a Concepção). Nosso modelo operacional fundamenta-se na **custódia local estrita**: o software é um guardião de foco e compromisso compartilhado que opera em seu dispositivo sem qualquer telemetria, rastreamento comportamental ou dependência de servidores proprietários em nuvem.

---

## 1. Princípios Fundamentais

1. **Zero Coleta Externa**: O monBlock não possui servidores de coleta de dados, bancos de dados remotos de usuários ou ferramentas de analytics.
2. **Inspeção de Navegação 100% em Memória**: Quando o recurso de bloqueio de palavras-chave do vigia (`macos-watcher`) está ativo, a URL e o título da aba em foco são avaliados localmente em tempo real contra as listas de bloqueio e descartados imediatamente da memória. Nenhum histórico de navegação é gravado em disco ou transmitido a terceiros.
3. **Sem Venda ou Compartilhamento de Dados**: Nenhuma informação gerada pelo aplicativo é vendida, monetizada ou compartilhada com anunciantes ou corretores de dados.

---

## 2. Dados Processados e Onde Ficam Armazenados

| Dado                                           | Finalidade                                                      | Local de Armazenamento                                                        | Transmitido Externamente?                                                 |
| :--------------------------------------------- | :-------------------------------------------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **Listas de Bloqueio e Categorias**            | Definir quais domínios e termos são bloqueados                  | Arquivo local criptografado (`/var/run/monblock/`)                            | **Não** (apenas local)                                                    |
| **Token do Bot e Chat ID do Telegram**         | Enviar pedidos de liberação e códigos de emergência ao Ajudante | Cofre criptografado com chave de hardware (`safeStorage` / Keychain do macOS) | Apenas enviado diretamente à API oficial do Telegram (`api.telegram.org`) |
| **Códigos de Emergência (Kit de Recuperação)** | Permitir desinstalação ou liberação emergencial                 | Armazenados apenas como hashes criptográficos irreversíveis (SHA-256)         | **Não** (apenas o hash local)                                             |
| **Temporizador de Cooldown (72h)**             | Garantir o período de reflexão do compromisso                   | Arquivo local do daemon com verificação de integridade                        | **Não** (apenas local)                                                    |

---

## 3. Comunicação com Serviços de Terceiros

A única comunicação de rede originada pelo monBlock ocorre nos seguintes casos explícitos e controlados pelo usuário:

1. **Telegram Bot API (`api.telegram.org`)**:
   - Utilizada exclusivamente quando o usuário configura a integração com o Telegram para notificar o Ajudante sobre pedidos de desbloqueio temporário.
   - O tráfego ocorre via HTTPS direto entre o seu computador e os servidores do Telegram, sem servidores intermediários.
2. **Consulta Automática de Atualizações (GitHub Releases)**:
   - Uma requisição de leitura à API pública do GitHub (`https://api.github.com/repos/matheus-diniz/monBlock/releases/latest`) ocorre **automaticamente ao abrir o aplicativo**, com a finalidade exclusiva de identificar a disponibilidade de novas versões estáveis ou correções de segurança. Nenhuma informação pessoal ou de telemetria é enviada nessa consulta.
   - O download do instalador oficial `.pkg` adota a política de integridade estrita **Fail-Closed (Zero-Trust)**: requer a resolução obrigatória de hash SHA-256 (via assets dedicados `.sha256`, `checksums.txt`, `SHA256SUMS` ou notas oficiais da release). Se o hash for divergente ou se a release remota não fornecer assinatura de integridade verificável, o download in-app é recusado e o instalador não é executado.

---

## 4. Permissões Solicitadas no macOS

- **Automação de Sistema (`AppleEvents`)**: Permissão para ler a URL e título da aba ativa nos navegadores suportados (Safari, Chrome, Brave, Edge). Utilizada exclusivamente para comparação imediata com as regras configuradas pelo usuário.
- **Privilégios de Administrador (`LaunchDaemon` root)**: Necessários exclusivamente na instalação do `.pkg` para manter a integridade do `/etc/hosts` e dos perfis de sistema contra remoção acidental ou compulsiva.

---

## 5. Seus Direitos (LGPD / GDPR) e Exclusão de Dados

Como o monBlock não opera servidores centrais de coleta nem mantém bancos de dados na nuvem, você mantém controle físico e soberano sobre suas informações:

- **Exclusão Local Integral:** A qualquer momento, você pode inspecionar ou eliminar as regras e chaves locais usando o fluxo autorizado de desinstalação com o Ajudante (`uninstall.sh`). A desinstalação purga todos os arquivos de regras, estados e segredos armazenados no macOS.
- **Ausência de Exclusão Externa e Limitações do Telegram:**
  - A desinstalação local elimina de forma irreversível 100% dos dados no seu dispositivo.
  - O monBlock **não faz promessa nem possui viabilidade técnica de apagar cópias de dados retidas por terceiros**: mensagens, notificações de pedidos de liberação (contendo domínios e títulos) e kits de emergência já entregues permanecem retidos no Telegram do Ajudante e nos servidores da Telegram FZ-LLC, conforme as políticas do provedor.
  - A API oficial do Telegram impede que robôs apaguem mensagens com mais de 48 horas ou forcem a limpeza do histórico de terceiros. Para eliminar integralmente o histórico da conversa, cabe ao próprio Ajudante acionar a opção nativa **"Excluir conversa"** em seu aplicativo do Telegram.

---

## 6. Tratamento de Dados de Menores (Crianças e Adolescentes — Art. 14 da LGPD)

- **Não é uma Solução de Controle Parental:** O monBlock é um utilitário de autocontrole assistivo voltado ao público adulto ou sob compromisso consciente. O aplicativo **não deve ser considerado como solução homologada, pronta ou auditada de controle parental infantil**.
- **Alerta sobre Compartilhamento de Dados com o Ajudante:** Caso o software seja utilizado em dispositivos operados por menores de 18 anos, pais ou responsáveis legais devem estar cientes de que pedidos de desbloqueio transmitem diretamente ao chat do Ajudante no Telegram o nome do domínio e o título da aba em que o bloqueio ocorreu.
- **Adequação Regulatória Pendente:** Os mecanismos específicos de consentimento parental estrito, governança qualificada e salvaguardas formais exigidas pelo Art. 14 da LGPD e pelo Estatuto da Criança e do Adolescente (ECA) estão em fase de mapeamento de produto, permanecendo a adequação específica para proteção infantil **pendente e em desenvolvimento**.

---

## 7. Contato e Responsabilidade

O código do monBlock é auditável e de código aberto. Dúvidas ou sugestões sobre práticas de privacidade podem ser encaminhadas através do repositório oficial do projeto.
