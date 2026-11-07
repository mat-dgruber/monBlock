# Spec: listas ampliadas de domínios e palavras-chave das categorias

- Data: 2026-11-06
- Status: **aguardando aprovação** (nada implementado)
- Versão alvo: 0.6.0 (SemVer minor)
- Relacionados: ADR-0002 (3 camadas), RN-WEB-04/06/07, `docs/domains/web_blocking/`

## 1. Como funciona hoje (lido no código)

| Peça | Fato |
| --- | --- |
| `src/domain/categories.ts` | 11 categorias, `domains: string[]` e `keywords: string[]` escritos à mão (adult: 5 domínios, 4 palavras). Só o `id` é guardado no estado do usuário (`enabledCategories`); a lista vem do catálogo. Logo, listas grandes **não** incham o estado cifrado. |
| Formato de keyword | `'cassino,online'` = todos os termos separados por vírgula (AND, RN-WEB-06). Cada termo casa por palavra inteira Unicode `(?<![\p{L}\p{N}])termo(?![\p{L}\p{N}])` com a flag `iu` (RN-WEB-07), sobre `URL decodificada + título` (título passa por `sanitizeBenignTitleContexts`). Regex em cache por termo. |
| Camada 1, `/etc/hosts` | `platform-enforcer.resolveEffectiveBlockedDomains` junta domínios das categorias ativas + manuais, tira allowlist/`CRITICAL_INFRA_ALLOWLIST`. `buildManagedHostsContent` grava `0.0.0.0 d` e `0.0.0.0 www.d` por domínio (**só o host exato e o `www.`; subdomínios não são cobertos**). Escrita atômica; `dscacheutil -flushcache` + `HUP` no mDNSResponder só quando o conteúdo muda. |
| Camada 2, navegadores | `generateBrowserMobileconfig` (perfil que o usuário aprova) é gerado **no build** (`scripts/build-pkg.sh`) só com `adult.domains`, `lockIncognito: true`, repetido por 8 bundle IDs. O plist em `/Library/Managed Preferences` escrito pelo daemon é removido pelo macOS sem MDM (spike S1), então o perfil é a camada efetiva. `URLBlocklist` por domínio cobre subdomínios. Mudar a lista do perfil exige que o usuário **reaprove o perfil** (como na 0.4.0). |
| Camada 3, vigia | `macos-watcher` roda a cada 1,5 s no app; `evaluateUrlAndTitle` testa categorias ativas com `cat.domains.some(matchesDomain)` (O(n) por aba) e depois todas as keywords. Cobre subdomínios. |
| Daemon | watchdog de 60 s chama `verifyApplied`, que reconstrói o hosts esperado e compara com o disco. |
| UI | `index.html` tem 11 cartões fixos com contagem e chips escritos à mão; `renderer-init.js` tem `CATEGORIES_DATA` duplicado e a busca/“Inspecionar” e o bloqueio de teste usam essa cópia (usa `includes` em vez de palavra inteira: diverge do motor). Hoje as duas cópias coincidem; com milhares de itens divergirão. |
| Divergência de versão | `package.json` = 0.5.0, `VERSION` = 0.3.0, CHANGELOG já cita 0.4.0. Sincronizo no release. |

## 2. Limites técnicos (medidos ou pesquisados)

| Limite | Valor | Fonte |
| --- | --- | --- |
| `URLBlocklist` Chromium/Edge | docs: **1000** entradas, excedente ignorado; o código do Chromium subiu `kMaxUrlFiltersPerPolicy` para 1500 (versão não confirmada) | [Edge docs](https://learn.microsoft.com/he-il/deployedge/microsoft-edge-policies/urlblocklist), [commit Chromium](https://chromium.googlesource.com/chromium/src/+/8e6a6ff244943f861837f6545871ab367033e8b9) |
| Decisão | teto de **900** no perfil (folga sob 1000) | |
| Firefox `WebsiteFilter` | não confirmado; hoje o Firefox só recebe o plist do daemon, fora do perfil. **Fora de escopo** | |
| Tamanho do hosts | medido em Node (build + leitura + comparação): 5 mil domínios = 0,25 MB / 1 ms; 20 mil = 0,98 MB / 2 ms; 50 mil = 2,6 MB / 4 ms | bench local |
| Referência de realidade | `blocklistproject/porn` tem ~950 mil domínios = **56 MB** de hosts. Inviável como hosts; exige priorização | bench local |
| Custo no vigia | 500 keywords × 1 aba: ~1,05 ms por ciclo; lookup por sufixo em `Set`: 1e5 buscas em 5 ms. Muito abaixo de 1,5 s | bench local |
| Perfil | 900 domínios × 8 bundles ≈ 0,3 MB; ok | estimado |
| **Não medido** | tempo de carga do hosts pelo mDNSResponder e latência de DNS com 20 mil entradas. Exige root e mexer no `/etc/hosts`, proibido nesta tarefa. Teto de 25 mil linhas conservador; deixar comando de medição manual na doc | |

## 3. Arquitetura proposta

1. **Dados em texto, 1 arquivo por categoria**: `src/domain/lists/<id>.domains.txt` (um domínio por linha, `#` comenta, **a ordem é a prioridade**) e `src/domain/lists/<id>.keywords.txt`.
2. **Geração para TS**: `scripts/gen-lists.mjs` lê os `.txt`, valida e escreve `src/domain/lists.generated.ts` (um template string por arquivo, versionado). Motivo: funciona igual em `tsc`, esbuild (SEA do daemon) e Vitest, sem loader novo. Um teste falha se o gerado estiver fora de sincronia. `categories.ts` passa a montar `domains`/`keywords` a partir dele (a interface `CategoryDefinition` não muda).
3. **Camadas por prioridade**:
   - **Perfil**: só `adult`, as primeiras 900 linhas (`policyDomains(cat)`), cobre subdomínios.
   - **Hosts**: todas as categorias ativas, teto global `HOSTS_MAX_DOMAINS = 25 000` (adult ≤ ~20 mil; demais centenas). Estourando o teto, corta pela prioridade e **registra aviso**, nunca falha em silêncio.
   - **Vigia**: lista completa (sem teto) via índice `Set` com busca por sufixo; keywords só aqui.
4. **Casamento de domínio**: trocar `cat.domains.some(matchesDomain)` por `Set` + subir os sufixos do host (mesma semântica). Índice por categoria montado uma vez.
5. **Fonte única na UI**: novo IPC `monblock:get-categories` (id, nome, contagens, 12 amostras, `enabledByDefault`) alimentado por `PREDEFINED_CATEGORIES`. `renderer-init.js` apaga `CATEGORIES_DATA`; o painel e a busca usam o IPC; “Inspecionar” mostra amostra + “e mais N”. Os 11 cartões do HTML ficam (estrutura), mas contagens e chips vêm de dados. O teste de bloqueio do renderer passa a chamar o motor via IPC (palavra inteira, igual ao vigia).

## 4. Curadoria e licenças

Regra: **só entra no repositório o que a licença permite redistribuir**; o resto serve de sinal de validação.

| Fonte | Licença (conferida em `gh api .../license`) | Uso |
| --- | --- | --- |
| StevenBlack/hosts | MIT | cópia permitida, com atribuição |
| blocklistproject/Lists | Unlicense | cópia permitida |
| mhxion/pornaway | MIT | cópia permitida |
| Bon-Appetit/porn-domains | CC BY-SA 4.0 | **não copiar**; só sinal (domínio presente em ≥2 listas sobe de prioridade) |
| UT1 (Toulouse) | CC BY-SA 4.0 (servidor deu 503; a conferir) | **não copiar**; só sinal |
| OISD, hagezi | GPL-3.0 | **não copiar**; inspiração |
| Cloudflare Gateway, listas manuais de bets BR | sem lista pública | pesquisa própria (web) e conferência manual |

- Atribuição em `NOTICE` (novo) e `docs/domains/web_blocking/`. **O repositório não tem arquivo LICENSE**; os dados MIT/Unlicense não obrigam nada além da atribuição, mas peço sua decisão se quer adicionar uma licença ao projeto.
- Prioridade do adult: (1) nomes de maior tráfego/conhecidos (tubes, cams, fóruns, hentai, imagens, redes de anúncios, `.xxx/.adult/.porn/.sex` por TLD apenas no vigia/perfil via padrão `*.xxx`), (2) presença em ≥2 listas, (3) demais.
- Normalização: minúsculas, sem esquema/caminho/porta/`www.`, IDN em punycode, dedupe, só FQDN válido (`HOSTNAME_RE`).
- **Exclusões** (decididas e registradas no teste): `CRITICAL_INFRA_ALLOWLIST` + ampliar com `apple.com`, `icloud.com`, `telegram.org`, `t.me`, `google.com`, `microsoft.com`, `cloudflare.com`, CDNs (`akamai`, `fastly`, `amazonaws.com`, `googleusercontent.com`), `wikipedia.org`, `github.com`, e sites de saúde/educação sexual legítimos (ex.: `who.int`, `scielo.org`, `sbu.org.br`). Domínios genéricos que servem conteúdo misto vão para `social`/`forums`, não para `adult`.
- **Metas** (se a pesquisa render): adult 8–20 mil; gambling 1,5–3 mil (bets BR incluídas); social, video, forums, shopping, news, games, proxy, dating, search_unsafe 150–800 cada. A meta de “milhares” no adult depende de ter 2+ fontes permissivas; o número final sai no relatório.
- **Keywords**: pt-BR primeiro, depois inglês; termo ambíguo sempre em combinação (`'sexo,gratis'`, `'tigrinho,jogar'`); nada de `sex`, `anal`, `ass`, `tit`, nomes de cidade. Adult 80–200, gambling 40–120, demais 5–40. Toda keyword passa pela suíte de frases legítimas.
- Subdomínios/TLDs: o hosts não faz curinga. Mitigação: o perfil e o vigia cobrem; hosts recebe os apex mais prováveis.

## 5. Testes (TDD, Vitest)

1. Normalização e unicidade (nenhuma linha fora do padrão, zero duplicata, ordem estável) por categoria e entre categorias.
2. Nenhum domínio da infra crítica/ampliada, nem sufixo dela.
3. Falsos positivos: ~60 frases pt-BR legítimas (sexta-feira, “seg a sex”, “canal de análise”, “assunto”, “Essex”, “Sussex”, “Cumbuca”, “cassino” em contexto histórico/arquitetura quando aplicável, receitas, notícias, saúde) não podem disparar `evaluateUrlAndTitle`; e frases-alvo disparam.
4. Desempenho: hosts com o catálogo inteiro (build + `verifyApplied`) < 250 ms; 1000 avaliações de aba com todas as categorias ativas < 1,5 s no total (≈1,5 ms por aba, folga ≥ 1000× sobre os 1,5 s do ciclo); perfil ≤ 900 domínios e ≤ 1 MB.
5. Geração: `lists.generated.ts` == saída do gerador.
6. UI: `get-categories` retorna as 11 categorias do catálogo e `renderer-init.js` não contém `CATEGORIES_DATA`/lista literal.
7. Os testes existentes (66+) seguem verdes; o do hosts ganha caso de teto 25 mil com aviso.

## 6. Entregáveis

CHANGELOG, README (contagens por categoria geradas pelo script), `docs/domains/web_blocking/{overview,business-rules,tech-design}.md` (novas RN-WEB-08 prioridade por camada, RN-WEB-09 teto do hosts, RN-WEB-10 exclusões), `NOTICE`, ADR-0008 (listas em dados versionados + camadas por prioridade), `package.json`/`VERSION` 0.6.0. Commits convencionais, PR para `main`, CI verde. Não instalo nada nem toco `/etc/hosts`.

## 7. Riscos e rollback

- **Reaprovação do perfil**: a nova `URLBlocklist` muda o perfil; quem já instalou verá “Falta 1 passo”. Aceito (mesmo caso da 0.4.0). Alternativa: manter o perfil atual de 5 domínios e não ampliar a camada 2 (menos proteção).
- **Falso positivo em massa**: mitigado por exclusões, testes e prioridade por presença múltipla; domínio errado é removido editando o `.txt` e regerando.
- **Hosts grande**: teto 25 mil, sem escrita se nada mudou, aviso de corte. Lentidão do mDNSResponder **não medida** (ver §2).
- **Conteúdo sensível**: a pesquisa só coleta nomes de domínios de listas públicas; não abro os sites.
- **Rollback**: reverter o commit; os `.txt` são dados puros, nada migra no estado do usuário.

## 8. Decisões que preciso de você

1. Aprova ampliar o perfil dos navegadores (900 domínios do adult, exige reaprovação)? Recomendo **sim**.
2. Quer adicionar uma licença ao repositório (hoje não há `LICENSE`)? Recomendo MIT para o código; dados com atribuição no `NOTICE`.
3. Aprova o teto de 25 mil linhas no hosts (sem medição real do mDNSResponder)?

## 9. Auditoria `/plan-criticize` e blindagem

Veredito do `plan_critic.py`: **Risk Score 30/100 (moderado)**. Único apontamento HIGH: faltavam casos de borda. Incorporados:

- **Arquivos de dados**: CRLF/BOM, linhas em branco, comentário no fim da linha, IDN (vira punycode), host com porta/caminho, linha inválida → o gerador **falha o build** (não ignora em silêncio) e aponta arquivo:linha.
- **Mesmo domínio em 2 categorias**: permitido; no hosts deduplica; o rótulo do vigia usa a primeira categoria ativa.
- **Allowlist do usuário e concessões temporárias** continuam com precedência sobre as listas (RN-WEB-01, sem mudança).
- **Categoria vazia** (ex.: news sem keywords): válida. Arquivo ausente: erro de build.
- **Teto do hosts estourado**: corta pela ordem de prioridade e devolve aviso; o `verifyApplied` usa o mesmo corte (determinístico, sem drift falso a cada 60 s).
- **Upgrade**: o hosts do usuário cresce na primeira reaplicação do daemon (uma escrita atômica + flush); depois `changed:false`.
- **IPC novo**: interno ao app (sem HTTP), erros seguem o contrato atual do `call`; RFC 9457 não se aplica.
- **Alternativas**: A (proposta: dados + gerado + camadas), B lean (arrays maiores em `categories.ts`; rejeitada: revisão de diff inviável com milhares de linhas e sem validação), C enterprise (lista baixada em runtime e assinada; rejeitada: rede no daemon root, superfície de ataque, YAGNI).
- **Pre-Mortem**: pior caso é um domínio legítimo popular na lista; mitigado por exclusões, teste de infra e remoção por `.txt`. Segundo pior: perfil rejeitado por tamanho; mitigado pelo teto 900 e teste.
