---
name: setup-testing-desktop
description: >
  Instala e verifica a suíte de testes desktop conforme guides/testing/desktop/README.md via verify_setup.py.
user-invocable: true
triggers:
  - /setup-testing-desktop
follow_up_skills:
  - setup
example_inputs:
  - "/setup-testing-desktop"
---

# setup-testing-desktop

Sub-skill fina: toda a lógica está no guia. O script executa os passos shell e prova; você faz só os passos `AGENT`.

0. `SETUP=<diretório base desta skill, informado ao carregá-la>/..` — o script é `$SETUP/scripts/verify_setup.py`.
1. **Gate de runtime (obrigatório, antes de tudo):** `uv run $SETUP/scripts/verify_setup.py where` **tem de imprimir `origem=projeto`**. Qualquer outra saída (`origem=plugin`, `origem=ausente`, exit ≠ 0) → rode `uv run $SETUP/scripts/verify_setup.py fetch` e repita. **NUNCA** trabalhe com o runtime do plugin: os guias têm de estar materializados em `.agents/ai-guides/` do projeto (versioná-los é do usuário, depois do G6).
2. `uv run $SETUP/scripts/verify_setup.py apply testing-desktop` → executa os `do` shell aplicáveis na ordem, prova cada um com o `verify` e lista os passos `AGENT` pendentes com o texto do `do`. Não reexecute à mão o que ele já rodou. Se o `/setup` pediu confirmação de instalações, antes rode `plan testing-desktop`, confirme cada id cujo `do` instala software e acrescente `--skip <ID>` ao `apply` para os recusados. Se o `apply` parar num ❌ e a saída do `do` apontar algo fora deste guia (hook, teste, config ou script do projeto), **não conserte à mão**: siga o que a saída mandar (ex.: `--skip <ID>`) e, se ela não disser, pergunte ao usuário (AskUserQuestion) antes de tocar.
3. Leia o guia em `GUIDE` (seção `## ⚙️ Heurísticas Executáveis` primeiro; `## 📚 Fundamentos` só se um `AGENT` exigir contexto).
4. Para cada `AGENT` pendente, na ordem: faça com as ferramentas de edição seguindo o texto literalmente. Caminho de template só se existir em `AI_GUIDES_RUNTIME` (confira com `ls`; nunca invente). Se o `apply` marcou algum id com ⏸️, rode o passo 2 de novo depois dos `AGENT`.
5. `uv run $SETUP/scripts/verify_setup.py verify testing-desktop --manifest`.
6. Se houver ❌: corrija UMA vez (releia o `do` do id falho e rode o passo 2 ou refaça o `AGENT`) e repita o passo 5. Se persistir, reporte `id` + o comando `verify` que falhou. ⚠️ não é pronto: é um `AGENT` que ficou por fazer (volte ao passo 4; `plan testing-desktop` mostra o texto sem executar nada), um id que o usuário recusou (`--skip`) ou uma pendência que o próprio texto do `do` manda deixar (ex.: dívida registrada em ADR).
7. Saída final: a saída do passo 5 **literal e completa** (termina na linha `RESULTADO:`), uma linha `⚠️ <ID>: <motivo>` para cada ⚠️ que sobrou e o que um `AGENT` mandou reportar na saída final (ex.: conflitos template × projeto do HARNESS-05/06). Nada mais.

Arquivo que você gerar (plano, relatório, spec, checkpoint) vai em `docs/ai/{plans,reports,specs,sessions,chats}/YYYY-MM-DD-<topico>.md`, nunca em `docs/superpowers/`, `plans/`, `reports/` ou na raiz.

**Nunca** passe `apply`/`verify` por `| head`, `| grep` ou `| tail` (o exit code e as linhas ⚠️ somem) e nunca encadeie `; echo "✅"` depois de um comando: quem diz se passou é o `verify`.
