#!/usr/bin/env python3
"""merge_agent_md.py [--check] <template> <alvo>: cria ou completa AGENTS.md sem perder o conteúdo do projeto.

AGENTS.md ausente com CLAUDE.md/GEMINI.md ao lado: semeia com o primário (CLAUDE.md, senão GEMINI.md) verbatim,
as seções novas do secundário e as do template que faltam; imprime `migrado de …`.
Sem --check: alvo ausente → copia o template; alvo existente → acrescenta ao final só as seções `## `
do template que faltam, sem tocar em nada do que já existe. Imprime `criado`, `mesclado: <seções>` ou `completo`.
No texto inserido, o bloco ```bash de comandos perde as linhas `make X` cujo alvo não existe no Makefile ao lado
do alvo (sem Makefile, todas; com `include` ou regra `%`, nenhuma; os de memória que o HN3-09 cria depois contam
como existentes) e os grupos `# …` que ficarem vazios.
--check: exit 1 se faltar alguma seção `## ` do template, se alguma linha do alvo versionada em HEAD sumiu (o
conteúdo customizado do projeto foi reescrito; só o `make X` órfão do template pode sumir) ou se sobrou um `make X` do
template sem alvo no Makefile.
--migrate [--check] <stub-template> <AGENTS.md>: CLAUDE.md vira o stub (`@AGENTS.md`) e o GEMINI.md da raiz sai
(`git rm` se versionado, senão `unlink`). Recusa (exit 1, nada tocado) se faltar no AGENTS.md qualquer linha não
vazia do primário (CLAUDE.md legado, senão GEMINI.md; o título `# ` da 1ª linha não conta) ou qualquer heading `## `
do secundário — ou qualquer linha dele, se o GEMINI.md não estiver versionado e idêntico a HEAD. Imprime `migrado` ou
`completo`. Com --check: exit 1 se o CLAUDE.md não tem a linha `@AGENTS.md`, se o GEMINI.md ainda existe ou se falta
no AGENTS.md (ou no CLAUDE.md atual) algo do que HEAD tinha nos arquivos legados; sem git/HEAD, isso é vacuamente ok.
Nas comparações com HEAD, `docs/adr` e `docs/adrs` são a mesma linha (a migração de ADRs do /setup reescreve isso).
Fonte: templates/harness/merge_agent_md.py — HARNESS-05 (merge) e HARNESS-06 (--migrate).
"""
import re
import subprocess
import sys
from pathlib import Path

MAKE = re.compile(r"^make ([\w.-]+)")
BLOCO = re.compile(r"(```bash\n)(.*?)(```)", re.S)
ADR = re.compile(r"\bdocs/adr\b")  # a migração de ADRs do /setup (Fase 4) troca docs/adr → docs/adrs: não é perda


def linha(s: str) -> str:
    """Forma comparável de uma linha: sem espaço nas pontas e com `docs/adr` lido como `docs/adrs`."""
    return ADR.sub("docs/adrs", s.strip())
# ponytail: alvos que o HN3-09 (construcao-harness, sempre obrigatório) acrescenta ao Makefile depois do
# HARNESS-05/06; lista fixa — mude junto com o `do` do HN3-09
ALVOS_DO_SETUP = frozenset({"pull-memory", "push-memory", "setup-gemini-hook"})


def sections(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    cur = None
    for line in text.splitlines(keepends=True):
        if line.startswith("## "):
            cur = line.rstrip()
            out[cur] = ""
        if cur:
            out[cur] += line
    return out


def missing(template: str, target: str) -> dict[str, str]:
    have = {line.rstrip() for line in target.splitlines()}
    return {h: body for h, body in sections(template).items() if h not in have}


STUB = "@AGENTS.md"


def append(base: str, secoes: dict[str, str]) -> str:
    """`base` seguido das `secoes` (cada uma terminada em \\n), separadas por uma linha em branco; sem seções, `base`."""
    if not secoes:
        return base
    return base + ("" if base.endswith("\n") else "\n") + "\n" + "".join(b if b.endswith("\n") else b + "\n" for b in secoes.values())


def seed(pasta: Path) -> tuple[str, list[str]]:
    """AGENTS.md novo ao lado de CLAUDE.md/GEMINI.md: primário (CLAUDE.md, senão GEMINI.md) verbatim e, do
    secundário, só as seções `## ` cujo heading ainda não existe. Um CLAUDE.md que já é stub não conta."""
    fontes = []
    for nome in ("CLAUDE.md", "GEMINI.md"):
        p = pasta / nome
        if p.exists():
            texto = "".join(l for l in p.read_text(encoding="utf-8").splitlines(keepends=True) if l.strip() != STUB)
            if texto.strip():
                fontes.append((nome, texto))
    if not fontes:
        return "", []
    texto = fontes[0][1]
    for _, sec in fontes[1:]:
        texto = append(texto, missing(sec, texto))
    return texto, [n for n, _ in fontes]


def alvos_make(pasta: Path) -> set[str] | None:
    """Alvos do Makefile ao lado do alvo (sem Makefile: nenhum). None quando não dá para saber — `include` ou
    regra de padrão (`%`) — e aí nada é podado nem acusado."""
    mk = next((pasta / n for n in ("GNUmakefile", "makefile", "Makefile") if (pasta / n).exists()), None)
    if mk is None:
        return set()
    texto = mk.read_text(encoding="utf-8", errors="replace")
    if re.search(r"^-?s?include\s", texto, re.M):
        return None
    nomes = {n for regra in re.findall(r"^([^\s:=#][^:=#]*?)\s*:(?!=)", texto, re.M) for n in regra.split()}
    return None if any("%" in n for n in nomes) else nomes | ALVOS_DO_SETUP


def sem_alvo(linha: str, alvos: set[str] | None) -> bool:
    m = MAKE.match(linha)
    return bool(m) and alvos is not None and m.group(1) not in alvos


def prune(text: str, alvos: set[str] | None) -> str:
    """No bloco ```bash, tira `make X` sem alvo e o grupo `# …` que ficar sem comando."""
    def bloco(m: re.Match) -> str:
        grupos = []
        for g in m.group(2).strip("\n").split("\n\n"):
            linhas = [line for line in g.splitlines() if not sem_alvo(line, alvos)]
            if any(not line.startswith("#") for line in linhas):
                grupos.append("\n".join(linhas))
        corpo = "\n\n".join(grupos) or "# (sem alvo no Makefile: documente aqui os comandos do projeto)"
        return m.group(1) + corpo + "\n" + m.group(3)
    return BLOCO.sub(bloco, text)


def lost_lines(alvo: Path, target: str, isentas: set[str] = frozenset()) -> list[str]:
    """Linhas não vazias da versão em HEAD que não existem mais no alvo, exceto as `isentas` (comandos do template
    sem alvo no Makefile, que o --check manda apagar). Sem git/sem HEAD: nada a comparar."""
    r = subprocess.run(["git", "show", f"HEAD:./{alvo.name}"], cwd=alvo.parent, capture_output=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        return []
    norm = lambda line: ADR.sub("docs/adrs", line.rstrip())  # noqa: E731 — aqui a indentação conta
    have = {norm(line) for line in target.splitlines()} | {norm(line) for line in isentas}
    return [line for line in r.stdout.splitlines() if line.strip() and norm(line) not in have]


def head(pasta: Path, nome: str) -> str | None:
    """Conteúdo de `nome` em HEAD; None sem git, sem HEAD ou arquivo não versionado."""
    r = subprocess.run(["git", "show", f"HEAD:./{nome}"], cwd=pasta, capture_output=True, encoding="utf-8", errors="replace")
    return r.stdout if r.returncode == 0 else None


def ler(p: Path) -> str | None:
    return p.read_text(encoding="utf-8") if p.exists() else None


def conjunto(texto: str | None) -> set[str]:
    return {linha(l) for l in (texto or "").splitlines()}


def atual(pasta: Path, nome: str, texto: str | None) -> str | None:
    """`texto` (árvore de trabalho) se existir e não for o stub; senão HEAD; sem HEAD, o próprio `texto`."""
    if texto is not None and STUB not in conjunto(texto):
        return texto
    h = head(pasta, nome)
    return h if h is not None else texto


def fontes(c: str | None, g: str | None) -> tuple[str | None, str | None]:
    """(primário, secundário), a mesma regra no --check e no --migrate: CLAUDE.md legado é o primário; CLAUDE.md
    stub não é conteúdo (as linhas exclusivas do Claude ficam nele) e o GEMINI.md é secundário; sem CLAUDE.md, o
    GEMINI.md é o primário."""
    if c is not None and STUB not in conjunto(c):
        return c, g
    return (None, g) if c is not None else (g, None)


def recuperavel(pasta: Path) -> bool:
    """GEMINI.md versionado e idêntico a HEAD: removê-lo não perde nada que o git não guarde."""
    git = lambda *a: subprocess.run(["git", *a], cwd=pasta, capture_output=True).returncode == 0
    return git("ls-files", "--error-unmatch", "GEMINI.md") and git("diff", "--quiet", "HEAD", "--", "GEMINI.md")


def faltas(primario: str | None, secundario: str | None, tem: set[str], secundario_inteiro: bool = False) -> list[str]:
    """Linhas não vazias do primário (menos o título `# ` da 1ª linha) e headings `## ` do secundário ausentes em
    `tem`; com `secundario_inteiro`, todas as linhas do secundário (sem cópia no git, nada dele pode sumir)."""
    presentes = tem | {STUB}

    def corpo(texto: str | None) -> list[str]:
        ls = [l.rstrip() for l in (texto or "").splitlines() if l.strip()]
        ls = ls[1:] if ls and ls[0].startswith("# ") else ls  # o AGENTS.md já tem o seu título
        return [l for l in ls if linha(l) not in presentes]

    sec = corpo(secundario) if secundario_inteiro else [h for h in sections(secundario or "") if h not in tem]
    return corpo(primario) + sec


def migrate(stub_tpl: Path, agents: Path, check: bool) -> int:
    """HARNESS-06: CLAUDE.md vira stub `@AGENTS.md` e GEMINI.md da raiz sai, só se nada do primário nem nenhum
    heading do secundário (ou o secundário inteiro, se o git não o guarda) faltar no AGENTS.md."""
    pasta, claude, gemini = agents.parent, agents.parent / "CLAUDE.md", agents.parent / "GEMINI.md"
    c, g, a = ler(claude), ler(gemini), ler(agents)
    tem = conjunto(a) | conjunto(ler(stub_tpl))  # o stub nunca conta como conteúdo do primário perdido
    inteiro = g is not None and not recuperavel(pasta)
    stub = c is not None and STUB in conjunto(c)
    if check:
        prim, sec = fontes(atual(pasta, "CLAUDE.md", c), g if g is not None else head(pasta, "GEMINI.md"))
        erros = ([] if stub else ["CLAUDE.md sem a linha @AGENTS.md"]) \
            + (["GEMINI.md ainda existe na raiz"] if g is not None else []) \
            + [f"falta no AGENTS.md: {x}" for x in faltas(prim, sec, tem | (conjunto(c) if stub else set()), inteiro)]
        for e in erros:
            print(e, file=sys.stderr)
        return 1 if erros else 0
    if stub and g is None:
        print("completo")
        return 0
    if a is None:
        print("recusado: AGENTS.md ausente (rode a HARNESS-05 antes)", file=sys.stderr)
        return 1
    falta = faltas(*fontes(c, g), tem, inteiro)
    if falta:
        for x in falta:
            print(f"recusado, falta no AGENTS.md: {x}", file=sys.stderr)
        return 1
    if not stub:  # stub já presente: preserva as linhas exclusivas do Claude abaixo dele
        claude.write_text(stub_tpl.read_text(encoding="utf-8"), encoding="utf-8")
    if g is not None:
        versionado = subprocess.run(["git", "ls-files", "--error-unmatch", "GEMINI.md"], cwd=pasta, capture_output=True).returncode == 0
        if versionado:
            r = subprocess.run(["git", "rm", "-q", "-f", "GEMINI.md"], cwd=pasta, capture_output=True, encoding="utf-8")
            if r.returncode:
                print(f"erro: git rm GEMINI.md falhou: {r.stderr.strip()}", file=sys.stderr)
                return 1
        else:
            gemini.unlink()
    print("migrado")
    return 0


def main(argv: list[str]) -> int:
    check = "--check" in argv
    if "--migrate" in argv:
        args = [a for a in argv if a not in ("--check", "--migrate")]
        if len(args) != 2:
            print(__doc__, file=sys.stderr)
            return 2
        return migrate(Path(args[0]), Path(args[1]), check)
    args = [a for a in argv if a != "--check"]
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    raw, alvo = Path(args[0]).read_text(encoding="utf-8"), Path(args[1])
    alvos = alvos_make(alvo.parent)
    template = prune(raw, alvos)
    target = alvo.read_text(encoding="utf-8") if alvo.exists() else None

    if check:
        if target is None:
            print(f"{alvo}: ausente", file=sys.stderr)
            return 1
        orfas_do_template = {line for line in raw.splitlines() if sem_alvo(line, alvos)}
        falta, perdidas = missing(template, target), lost_lines(alvo, target, orfas_do_template)
        orfas = [line for line in target.splitlines() if line in orfas_do_template]
        for h in falta:
            print(f"{alvo}: falta a seção {h}", file=sys.stderr)
        for line in perdidas:
            print(f"{alvo}: linha do projeto removida (restaure de git show HEAD:{alvo.name}): {line}", file=sys.stderr)
        for line in orfas:
            print(f"{alvo}: comando do template sem alvo no Makefile (apague a linha): {line}", file=sys.stderr)
        return 1 if falta or perdidas or orfas else 0

    if target is None:
        semente, fontes = seed(alvo.parent) if alvo.name == "AGENTS.md" else ("", [])
        if not fontes:
            alvo.write_text(template, encoding="utf-8")
            print("criado")
            return 0
        alvo.write_text(append(semente, missing(template, semente)), encoding="utf-8")
        print("migrado de " + ", ".join(fontes))
        return 0
    falta = missing(template, target)
    if not falta:
        print("completo")
        return 0
    alvo.write_text(append(target, falta), encoding="utf-8")
    print("mesclado: " + ", ".join(falta))
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows: pipe em cp1252 não tem ✅/⚠️/→ e o print quebraria
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
