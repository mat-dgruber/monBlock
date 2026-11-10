# Especificação de Design: Revisão da Política de Privacidade e dos Termos de Uso

**Data:** 2026-11-09  
**Status:** Minuta interna — revisão técnica e decisões do usuário incorporadas; aprovação formal da spec pendente  
**Escopo:** `docs/legal/privacy-policy.md`, `docs/legal/terms-of-use.md`  
**Artefato:** especificação em `docs/ai/specs/`, conforme a governança documental do repositório.  
**Base:** revisão assistida por IA dos documentos atuais e inspeção técnica do código; não constitui aconselhamento jurídico.

---

## 1. Contexto

A revisão dos documentos identificou contradições entre declarações amplas de ausência de coleta/compartilhamento e as integrações declaradas com Telegram e GitHub. Também faltam a identificação clara do responsável pelo tratamento e um canal direto de contato. Nos Termos, há risco de a aceitação automática de alterações e a isenção ampla de garantias serem interpretadas como limitação de direitos legais.

Esta especificação orienta a correção documental sem presumir fatos técnicos ou dados jurídicos que ainda não foram confirmados. As afirmações finais devem refletir o comportamento real da versão publicada e ser submetidas a revisão jurídica antes da publicação.

## 1.1 Decisões consolidadas na sabatina (Q1–Q29)

- A distribuição pretendida inicialmente é no Brasil; não se declara bloqueio geográfico. Eventual GDPR será tratado como condicional à aplicação concreta, inclusive se houver direcionamento/acompanhamento de usuários na União Europeia.
- Esta entrega é uma minuta interna para preparar publicação futura, não autorização de publicação.
- O público principal é adulto. O produto não será apresentado como solução parental pronta, homologada ou auditada. Um adulto responsável pode configurar o aplicativo diretamente no dispositivo do menor, sem gestão remota; o menor deve receber explicação adequada à idade e o Ajudante deve ser adulto responsável. O uso parental fica sujeito a revisão específica antes de qualquer alegação de suporte.
- CCAT é o projeto/produto de tecnologia criado por Matheus Diniz Gruber de Oliveira, sem empresa ou CNPJ confirmado. A identificação provisória da pessoa física como responsável/controlador depende de validação jurídica. Não descrever CCAT como pessoa jurídica registrada.
- Não existe canal de privacidade monitorado confirmado. A publicação permanece bloqueada até definir e validar esse canal e a identidade jurídica.
- A Política deve informar, de forma compreensível, que os fluxos do Telegram podem transmitir URL/domínio, título, regra/motivo, duração solicitada, código de desafio e, conforme o fluxo, imagem; incluir também convite de pareamento e kit de emergência quando tecnicamente confirmados. Não prometer exclusão completa das cópias externas.
- A verificação de atualização ocorre automaticamente ao iniciar; o download do instalador exige ação do usuário. A consulta e eventuais assets de checksum são requisições ao GitHub.
- A desinstalação remove caminhos específicos, mas não prova apagamento integral de todos os dados locais, backups ou dados externos. Não afirmar remoção de 100% nem fixar limite temporal do Telegram sem validação documental atual do provedor.
- Não há prazo geral de retenção confirmado para dados locais. A retenção de logs pelo sistema e a permanência do `.pkg` em diretório temporário são desconhecidas; a spec deve registrar essas lacunas e não prometer exclusão ou não persistência.
- SHA-256 deve ser descrito como verificação de integridade do arquivo, não como assinatura ou prova independente de autenticidade quando o checksum vem da mesma release. O downloader recusa hash ausente por padrão (`allowUnverified` é opção explícita e não está exposta no fluxo de produção examinado).
- As respostas Q26–Q28 confirmaram os limites de retenção e a redação do SHA-256 acima. Na Q29, o usuário aprovou atualizar primeiro esta spec, manter Política e Termos sem alterações até aprovação explícita da spec e só depois preparar os documentos como minutas internas.

## 1.2 Fatos técnicos confirmados e limites

- O updater consulta `https://api.github.com/repos/matheus-diniz/monBlock/releases/latest`, envia `User-Agent` com versão, procura o asset `.pkg` e pode consultar um asset de checksum ou as notas da release (`src/main/updater.ts`).
- O fluxo de interface chama a verificação no carregamento; o download depende de interação do usuário e, após validação, abre o pacote para instalação (`src/renderer/renderer-init.js`, `src/main/main.ts`). A verificação de hash é comparação com valor obtido da release; não equivale a assinatura independente.
- A implementação do Telegram tem fluxos de pedido de desbloqueio, pareamento, envio de kit e polling de comandos. O inventário final de campos por mensagem deve ser revisto contra cada payload antes da versão publicável (`src/daemon/telegram-client.ts`, `src/daemon/monblockd.ts`, `src/daemon/entry.ts`).
- O estado local é persistido em cópias cifradas em caminhos de sistema; pedidos concluídos têm rotina de expiração inferior a 24 horas, mas não há prazo geral de retenção para todo estado (`src/daemon/entry.ts`, `src/storage/state-store.ts`, `src/daemon/unblock-requests.ts`).
- Os caminhos conhecidos de dados/serviços são removidos pelo desinstalador; isso não demonstra exclusão integral de backups, dados fora desses caminhos ou cópias em serviços externos (`packaging/macos/uninstall.sh`).
- Foram encontrados usos de `console.error`, mas não uma política própria de gravação/rotação. Retenção de `stderr` pelo `launchd`/sistema não foi determinada. O `.pkg` final é salvo em `os.tmpdir()` e não tem expiração/remoção explícita visível no fluxo examinado (`src/main/updater.ts`).

## 2. Objetivos

- Tornar coerentes e específicas as declarações sobre dados processados e comunicações externas.
- Identificar o controlador/responsável e disponibilizar canal utilizável para assuntos de privacidade e exercício de direitos.
- Explicar de forma compreensível as integrações com Telegram e GitHub, incluindo quais dados trafegam e para quais finalidades.
- Descrever armazenamento, retenção, exclusão e segurança sem promessas técnicas não verificadas.
- Ajustar os Termos para explicar alterações materiais e preservar direitos que não possam ser afastados por contrato.
- Explicitar limites operacionais relevantes do cooldown e do mecanismo de recuperação.

## 3. Não objetivos

- Alterar o comportamento do aplicativo, daemon, updater ou integração Telegram.
- Declarar conformidade jurídica ou certificação não comprovada.
- Inventar nome empresarial, endereço, e-mail, encarregado, base legal, prazo de retenção, foro ou campos transmitidos.
- Substituir análise de advogado brasileiro; a aplicabilidade do GDPR e regras de transferência internacional dependerá do contexto real.

## 4. Requisitos

### R1 — Escopo e linguagem de privacidade

Substituir afirmações absolutas como “Zero Coleta Externa”, “100% em memória” e “nenhum dado pessoal jamais residiu fora do seu computador” por descrições delimitadas, verificáveis e consistentes com as integrações. Distinguir claramente:

- ausência de analytics/servidor próprio, se confirmada;
- dados processados localmente;
- dados transmitidos quando o usuário ativa ou usa uma integração;
- tratamento realizado pelos provedores externos.

Não afirmar que dados são descartados imediatamente, não são persistidos ou não são transmitidos sem validação técnica.

### R2 — Inventário de dados e terceiros

Para cada fluxo externo, documentar:

- evento que inicia a transmissão e se depende de ação/configuração do usuário;
- campos efetivamente enviados e finalidade;
- destinatário/provedor e protocolo;
- retenção ou critério conhecido; quando desconhecido, declarar a limitação sem inventar prazo;
- eventual processamento fora do Brasil e informação de transferência aplicável, após validação jurídica.

Verificar separadamente Telegram Bot API e GitHub Releases/updater. O inventário Telegram deve cobrir pedidos de desbloqueio, pareamento, kit de emergência e polling; conferir cada payload real antes da redação final. A consulta de atualização começa ao abrir o aplicativo e pode consultar assets de checksum. Não presumir que “conexão direta via HTTPS” elimina tratamento pelo destinatário ou transferência internacional.

### R3 — Controlador, contato e direitos

Identificar, de forma provisória e sujeita à validação jurídica, Matheus Diniz Gruber de Oliveira como responsável pessoa física pelo projeto, sem apresentar CCAT como pessoa jurídica registrada. Antes de qualquer publicação, validar a identidade jurídica apropriada e preencher um canal direto e monitorado para solicitações de privacidade. O canal ainda não está disponível; não deixar endereço fictício nem placeholder na versão publicável.

Explicar como o usuário pode exercer direitos previstos na legislação aplicável, sem criar prazos ou procedimentos incompatíveis com a lei. A ausência de canal e validação de identidade mantém a publicação bloqueada.

### R4 — Armazenamento, retenção e exclusão

Revisar cada linha da tabela de dados contra a implementação e documentar localização, finalidade, proteção, retenção/critério de retenção e efeito da desinstalação quando aplicável. O estado local é cifrado e mantido em múltiplas cópias em caminhos de sistema; pedidos concluídos têm expiração implementada inferior a 24 horas, mas não existe prazo geral confirmado para todo estado. Os caminhos cobertos pelo desinstalador podem ser descritos como removidos, sem afirmar apagamento integral de backups, arquivos fora desses caminhos ou dados de terceiros.

A retenção de `stderr`/`console.error` pelo sistema e a permanência do instalador `.pkg` em `os.tmpdir()` não estão determinadas. Explicitar essas lacunas; não prometer que logs ou pacote não persistem nem afirmar prazo de exclusão. Não fixar limite de retenção do Telegram sem validação atual das políticas do provedor. Confirmar em particular `/var/run/monblock/`, armazenamento de credenciais e hashes do Kit de Emergência. Não descrever hash como anonimização sem análise apropriada.

### R5 — Escopo regulatório

Remover a declaração genérica “Conforme LGPD, GDPR e Apple Privacy Guidelines” ou qualificá-la. Nomear apenas regimes realmente aplicáveis e descrever práticas confirmadas. Não declarar conformidade abrangente sem revisão jurídica e evidência suficiente.

### R6 — Atualizações dos Termos

Substituir a aceitação automática por uso continuado por processo transparente para alterações relevantes: meio de aviso, data de vigência e novo aceite quando exigido. Ressalvar que nenhuma alteração limita direitos legais inderrogáveis. O mecanismo de aviso deve corresponder a uma capacidade real do produto ou a um canal efetivamente mantido.

### R7 — Garantias e responsabilidade

Reformular “sem garantias de qualquer tipo” para deixar explícitas as limitações técnicas do software sem pretender afastar direitos do consumidor ou responsabilidades que a lei não permita excluir. A redação final requer validação jurídica brasileira.

### R8 — Catraca, cooldown e recuperação

Manter a explicação da autorização do Ajudante e do período de 72 horas, mas confirmar que a descrição corresponde ao produto. Esclarecer limitações técnicas e efeitos previsíveis de bloqueios involuntários, sem prometer infalibilidade. Não sugerir que o mecanismo substitui serviços de emergência ou atendimento profissional.

## 5. Casos de borda e invariantes documentais

- Se um fluxo Telegram falhar parcialmente, repetir ou enviar mensagem com imagem, a descrição não deve generalizar todos os payloads; revisar cada tipo de mensagem e distinguir dados tentados de dados efetivamente transmitidos quando isso for tecnicamente determinável.
- Se a release não tiver checksum, o updater pode detectar a atualização, mas o downloader padrão recusa o pacote; não dizer que a verificação de versão garante download autenticado.
- Se o checksum vier da mesma release e ambos forem comprometidos, a comparação SHA-256 não fornece autenticidade independente; a Política não deve usar “assinatura” ou “garantia de origem”.
- Se desinstalação, migração ou limpeza falhar, não afirmar remoção integral. Limitar a afirmação aos caminhos removidos pelo script e indicar que backups, temporários e dados de terceiros podem persistir.
- Para retenção desconhecida de logs do sistema, `.pkg` temporário ou dados do provedor, declarar expressamente que o projeto não confirmou um prazo; não preencher lacuna com estimativa.
- A identidade do responsável, o canal de contato e a revisão jurídica são gates de publicação: minuta interna não deve ser confundida com documento final válido para distribuição.

## 6. Critérios de aceitação

- [ ] Política e Termos não contêm afirmações contraditórias sobre coleta, transmissão ou compartilhamento.
- [ ] Cada fluxo externo citado informa evento, campos efetivamente enviados, finalidade, destinatário e retenção conhecida; lacunas são qualificadas.
- [ ] Identidade provisória do responsável está sujeita a validação jurídica; canal direto monitorado e identidade apropriada foram validados antes de publicação.
- [ ] Uso por menores é descrito com limites claros e sem apresentar o produto como solução parental pronta ou homologada.
- [ ] Armazenamento, retenção, exclusão e segurança foram conferidos contra a implementação; fatos não confirmados foram removidos ou qualificados.
- [ ] SHA-256 é apresentado como verificação de integridade, não como assinatura/autenticidade independente; download sem hash é descrito conforme o fluxo fail-closed.
- [ ] A alegação de GDPR/conformidade foi removida ou delimitada com justificativa validada.
- [ ] Os Termos explicam como alterações materiais são comunicadas sem tratar uso continuado como renúncia geral de direitos.
- [ ] Isenções preservam expressamente direitos e responsabilidades inderrogáveis.
- [ ] Cooldown e recuperação são descritos sem garantias incompatíveis com o comportamento real.
- [ ] A redação final foi revisada por advogado com experiência em LGPD e direito do consumidor antes da publicação.
- [ ] Não foram alterados código ou comportamento do aplicativo nesta iniciativa.

## 7. Dependências e informações pendentes

1. Validação jurídica da identidade do responsável/controlador e definição de canal de privacidade direto e monitorado.
2. Revisão final, por fluxo, dos payloads do Telegram, incluindo imagens e dados de pareamento/kit; não concluir inventário legal só por nomes de funções.
3. Confirmação de retenção de logs pelo sistema e duração de permanência do `.pkg` em diretório temporário; até lá, declarar desconhecido.
4. Confirmação de localização/processamento dos provedores e orientação jurídica sobre transferências internacionais.
5. Decisão sobre canal efetivo de aviso de alterações materiais dos Termos; não prometer aviso in-app sem mecanismo real.
6. Parecer jurídico sobre LGPD, eventual GDPR, CDC, uso por menores, responsabilidade e cláusulas de recuperação.

## 8. Alternativas e trade-offs

| Abordagem | Vantagem | Custo/limite | Decisão |
| :--- | :--- | :--- | :--- |
| A — Redigir direto os dois documentos legais | Mais rápido | Risco de retrabalho e de converter lacunas em promessas publicáveis | Rejeitada |
| B — Atualizar spec primeiro e bloquear publicação | Mantém decisões, fatos e lacunas auditáveis antes das minutas | Exige etapa explícita de aprovação antes da redação legal | Selecionada |
| C — Aguardar parecer jurídico antes de qualquer minuta | Reduz risco de formulação legal prematura | Não resolve agora a organização dos fatos técnicos e das decisões de produto | Alternativa futura para validação, não substitui a spec |

A abordagem B é a mínima que mantém rastreabilidade e impede que a minuta seja confundida com aconselhamento jurídico ou autorização de publicação. Nenhuma abordagem elimina o risco jurídico; a validação final cabe a advogado.

## 9. Riscos e mitigação

| Risco | Mitigação |
| :--- | :--- |
| Publicar informação incompatível com o produto | Conferir os fluxos de código/configuração e payloads antes de redigir as afirmações finais. |
| Prometer privacidade, retenção ou exclusão absoluta | Usar linguagem delimitada; qualificar logs, `.pkg`, backups, caminhos removidos e dados externos. |
| Dados legais incompletos | Bloquear publicação enquanto identidade jurídica e canal de contato estiverem pendentes. |
| Uso parental interpretado como funcionalidade aprovada | Declarar limites e bloquear qualquer promessa de suporte parental pronto até revisão específica. |
| Cláusulas ineficazes ou abusivas | Submeter a versão final a advogado brasileiro; preservar direitos inderrogáveis. |
| Mudança dos Termos sem aviso funcional | Não prometer notificação in-app até existir mecanismo real; definir canal válido antes da publicação. |

## 10. Testabilidade e reversibilidade

A validação desta entrega é documental: comparar cada afirmação com a inspeção do código e configuração, revisar payloads por fluxo, verificar que lacunas estão explicitamente qualificadas e que nenhum texto legal final foi alterado antes da aprovação da spec. Não se aplica pirâmide de testes de software porque esta etapa não muda comportamento executável nem API.

As alterações desta iniciativa são documentais e podem ser revertidas por edição do arquivo da spec; os documentos legais permanecem sem alterações nesta etapa. Não alterar o comportamento do produto. Não publicar Política ou Termos até concluir as dependências, receber aprovação explícita da spec e obter revisão jurídica.

RFC 9457 não é escopo desta mudança: a spec é documental e não altera rotas, respostas HTTP ou contratos de API. O servidor HTTP de bloqueio existente já emite Problem Details.

## 11. Pendência de aprovação

Esta versão atualizada da spec deve ser aprovada explicitamente antes de preparar as minutas internas da Política e dos Termos. A aprovação não autoriza publicação; identidade/canal, revisão técnica final e parecer jurídico continuam sendo gates separados.
