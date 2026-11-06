#!/usr/bin/env python3
"""check_ddd_pragmatico.py [--root DIR] [--extra-io NOME ...] [--self-test]

Fiscaliza o guia ddd-pragmatico (blocos opcionais Unit of Work e Use Cases) em projetos Python. Stdlib apenas,
Python 3.10+. Cada regra se auto-desliga se o seu bloco não existir no projeto.

Saída, uma linha por achado: `caminho:linha [DDDP-Rn] mensagem` (avisos: [DDDP-W0], [DDDP-W1]).
Exit: 0 sem violação R (avisos não contam); 1 com violação R; 2 erro interno ou --root inexistente.

  R1  .commit() com receptor uow/session/unit_of_work/db fora do arquivo do UnitOfWork e da camada dona
      (arquivos de Use Cases; service.py / services.py / services/ só no módulo sem Use Cases) [bloco UoW]
  R2  chamada a I/O externo (httpx, requests, aiohttp, smtplib, urllib.request, --extra-io) lexicamente
      dentro de `with`/`async with` do uow. Limitação: não segue chamadas indiretas         [bloco UoW]
  R3  arquivo que define *UnitOfWork importa BigQuery, pymongo, motor, redis, elasticsearch [bloco UoW]
  R4  arquivo de Use Cases importa fastapi, starlette, flask, django.http                   [bloco Use Cases]
  W1  use_cases.py com mais de 400 linhas                                                   [bloco Use Cases]
  W0  arquivo que não decodifica/parseia: avisa e pula (nunca derruba a execução)

Blocos: UoW = algum arquivo define `class [A-Za-z_]*UnitOfWork`; Use Cases = algum use_cases.py ou *.py sob use_cases/.
Arquivos: *.py de `git ls-files --cached --others --exclude-standard` (existentes em disco); sem git, varredura de
diretório. Excluídos: tests/, test_*.py, *_test.py, conftest.py, alembic/, migrations/, scripts/, seeds/, seed*.py e
.venv, venv, node_modules, vendor, dist, build, .git, .agents, __pycache__, .tox, site-packages (as mesmas listas de
templates/architecture/ddd_detect.sh: mude as duas juntas).
Supressão pontual: comentário `# ddd-pragmatico: allow Rn ADR-NNNN` na linha do achado remove aquele Rn.
Fonte canônica: templates/architecture/check_ddd_pragmatico.py (copiado para .agents/scripts/architecture/).
"""
from __future__ import annotations

import argparse
import ast
import io
import os
import re
import subprocess
import sys
import tempfile
import tokenize
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

PODADOS = frozenset({".venv", "venv", "node_modules", "vendor", "dist", "build", ".git", ".agents", "__pycache__",
                     ".tox", "site-packages"})
EXCLUIDOS = frozenset({"tests", "alembic", "migrations", "scripts", "seeds"})
IO_MODULOS = ("httpx", "requests", "aiohttp", "smtplib", "urllib.request")
STORES = ("google.cloud.bigquery", "pymongo", "motor", "redis", "elasticsearch")
HTTP_FRAMEWORKS = ("fastapi", "starlette", "flask", "django.http")
RECEPTOR_COMMIT = re.compile(r"uow|session|unit_of_work|(?:^|[._])db(?:$|[._])")  # db: convenção FastAPI `db: Session`
UOW_CLASSE = re.compile(r"[A-Za-z_]*UnitOfWork")
SUPRESSAO = re.compile(r"#\s*ddd-pragmatico:\s*allow\s+(R[1-4])\s+ADR-\d+")
MAX_LINHAS_USE_CASES = 400


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str
    msg: str


@dataclass
class _Arquivo:
    rel: str
    parts: tuple[str, ...]
    linhas: list[str]
    tree: ast.AST
    define_uow: bool = False
    aliases: dict[str, str] = field(default_factory=dict)


# ---------- descoberta de arquivos ----------

def _excluido(parts: tuple[str, ...]) -> bool:
    nome = parts[-1]
    if any(d in PODADOS or d in EXCLUIDOS for d in parts[:-1]):
        return True
    return (nome.startswith("test_") or nome.endswith("_test.py") or nome == "conftest.py"
            or nome.startswith("seed"))


def _e_use_cases(parts: tuple[str, ...]) -> bool:
    return parts[-1] == "use_cases.py" or "use_cases" in parts[:-1]


def _modulo(parts: tuple[str, ...]) -> tuple[str, ...]:
    """Pacote (módulo) que contém o arquivo: o diretório pai, descontando `services/` ou `use_cases/` aninhados."""
    dirs = parts[:-1]
    for i, d in enumerate(dirs):
        if d in ("services", "use_cases"):
            return dirs[:i]
    return dirs


def _listar_git(root: Path) -> list[str] | None:
    try:
        r = subprocess.run(["git", "-c", "core.quotepath=false", "ls-files", "-z", "--cached", "--others",
                            "--exclude-standard"], cwd=root, capture_output=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return None
    if r.returncode != 0:
        return None
    nomes = {n.decode("utf-8", "surrogateescape") for n in r.stdout.split(b"\0") if n}
    return [n for n in nomes if n.endswith(".py") and (root / n).is_file()]  # o índice lista arquivo já removido


def _listar_diretorio(root: Path) -> list[str]:
    achados = []
    for base, dirs, nomes in os.walk(root):
        dirs[:] = [d for d in dirs if d not in PODADOS]
        for n in nomes:
            if n.endswith(".py"):
                achados.append(Path(base, n).relative_to(root).as_posix())
    return achados


def _listar(root: Path, use_git: bool) -> list[str]:
    arquivos = _listar_git(root) if use_git else None
    if arquivos is None:
        arquivos = _listar_diretorio(root)
    return sorted(a.replace(os.sep, "/") for a in arquivos)


def _ler(root: Path, rel: str) -> tuple[list[str], ast.AST]:
    dados = (root / rel).read_bytes()
    texto = dados.decode(tokenize.detect_encoding(io.BytesIO(dados).readline)[0])
    # Numera linhas como o Python (só \n, \r, \r\n); str.splitlines() também quebra em \f, \x1c-\x1e, \x85, U+2028/9.
    linhas = re.split(r"\r\n|\r|\n", texto)
    if linhas[-1] == "":
        linhas.pop()
    with warnings.catch_warnings():  # SyntaxWarning (ex.: "\d" em string não-raw) não pode sujar o stderr do CI
        warnings.simplefilter("ignore")
        return linhas, ast.parse(texto)


# ---------- análise ----------

def _qualificados(no: ast.AST) -> list[str]:
    """Nomes absolutos importados por um Import/ImportFrom (`from google.cloud import bigquery` -> google.cloud.bigquery)."""
    if isinstance(no, ast.Import):
        return [a.name for a in no.names]
    if isinstance(no, ast.ImportFrom) and no.level == 0 and no.module:
        return [f"{no.module}.{a.name}" for a in no.names]
    return []


def _aliases(tree: ast.AST) -> dict[str, str]:
    """Nome local -> módulo/objeto absoluto que ele referencia (import a.b -> a; import a.b as x -> x=a.b; from a import b -> b=a.b)."""
    mapa: dict[str, str] = {}
    for no in ast.walk(tree):
        if isinstance(no, ast.Import):
            for a in no.names:
                if a.asname:
                    mapa[a.asname] = a.name
                else:
                    mapa[a.name.split(".")[0]] = a.name.split(".")[0]
        elif isinstance(no, ast.ImportFrom) and no.level == 0 and no.module:
            for a in no.names:
                mapa[a.asname or a.name] = f"{no.module}.{a.name}"
    return mapa


def _casa(nome: str, prefixos: Sequence[str]) -> bool:
    return any(nome == p or nome.startswith(p + ".") for p in prefixos)


def _cadeia(no: ast.AST) -> list[str]:
    """Nomes de `a.b().c.d` da raiz para fora, atravessando chamadas: [a, b, c, d]. Vazio se a raiz não é um nome."""
    nomes: list[str] = []
    while True:
        if isinstance(no, ast.Attribute):
            nomes.append(no.attr)
            no = no.value
        elif isinstance(no, ast.Call):
            no = no.func
        elif isinstance(no, (ast.Subscript, ast.Await)):
            no = no.value
        elif isinstance(no, ast.Name):
            nomes.append(no.id)
            return nomes[::-1]
        else:
            return []


def _texto(no: ast.AST) -> str:
    try:
        return ast.unparse(no).lower()
    except (ValueError, RecursionError):
        return ""


def _menciona_uow(expr: ast.AST) -> bool:
    t = _texto(expr)
    return "uow" in t or "unit_of_work" in t or "unitofwork" in t


def _suprimido(a: _Arquivo, no: ast.AST, regra: str) -> bool:
    ini = getattr(no, "lineno", 1)
    fim = getattr(no, "end_lineno", None) or ini
    for i in range(ini, fim + 1):
        if 1 <= i <= len(a.linhas) and any(m.group(1) == regra for m in SUPRESSAO.finditer(a.linhas[i - 1])):
            return True
    return False


def _chamadas_io(a: _Arquivo, call: ast.Call, extra_io: Sequence[str]) -> str | None:
    cadeia = _cadeia(call.func)
    if not cadeia:
        return None
    dotted = ".".join(cadeia)
    base = a.aliases.get(cadeia[0])
    if base and _casa(".".join([base, *cadeia[1:]]), IO_MODULOS):
        return dotted
    if any(e in cadeia or _casa(dotted, [e]) for e in extra_io):
        return dotted
    return None


def _analisar(a: _Arquivo, tem_uow: bool, tem_uc: bool, extra_io: Sequence[str],
              modulos_uc: frozenset[tuple[str, ...]] = frozenset()) -> list[Finding]:
    achados: list[Finding] = []
    uc = _e_use_cases(a.parts)

    def add(no: ast.AST, regra: str, msg: str) -> None:
        if not _suprimido(a, no, regra):
            achados.append(Finding(a.rel, getattr(no, "lineno", 1), f"DDDP-{regra}", msg))

    if tem_uc and uc and a.parts[-1] == "use_cases.py" and len(a.linhas) > MAX_LINHAS_USE_CASES:
        achados.append(Finding(a.rel, 1, "DDDP-W1", f"use_cases.py com {len(a.linhas)} linhas (limite "
                               f"{MAX_LINHAS_USE_CASES}); divida em um pacote use_cases/ por caso de uso"))

    if tem_uc and uc or tem_uow and a.define_uow:
        for no in ast.walk(a.tree):
            qs = _qualificados(no)
            if tem_uc and uc and any(_casa(q, HTTP_FRAMEWORKS) for q in qs):
                add(no, "R4", "use case importa framework HTTP; a camada de aplicação não conhece HTTP "
                              "(levante exceção de domínio e traduza no router)")
            if tem_uow and a.define_uow and any(_casa(q, STORES) for q in qs):
                add(no, "R3", "o UnitOfWork não atravessa outros stores; deixe esse acesso fora da transação "
                              "(ou registre ADR e suprima)")

    if tem_uow:
        uc_no_modulo = _modulo(a.parts) in modulos_uc
        # dono do commit por módulo: use cases sempre; service só se o PRÓPRIO módulo não tem Use Cases
        dona = uc or (not uc_no_modulo and (a.parts[-1] in ("service.py", "services.py") or "services" in a.parts[:-1]))
        for no in ast.walk(a.tree):
            if (not a.define_uow and not dona and isinstance(no, ast.Call) and isinstance(no.func, ast.Attribute)
                    and no.func.attr == "commit"):
                recep = _texto(no.func.value)
                if RECEPTOR_COMMIT.search(recep):
                    camada = "use cases" if uc_no_modulo else "service"
                    add(no, "R1", f"commit fora da camada dona ({camada}); quem orquestra a transação é quem chama o commit")
            if isinstance(no, (ast.With, ast.AsyncWith)) and any(_menciona_uow(i.context_expr) for i in no.items):
                for stmt in no.body:
                    for c in ast.walk(stmt):
                        if isinstance(c, ast.Call):
                            io = _chamadas_io(a, c, extra_io)
                            if io:
                                add(c, "R2", f"I/O externo ({io}) dentro da transação do UnitOfWork; "
                                             "faça a chamada antes ou depois do bloco `with uow`")
    return achados


def scan(root: Path, extra_io: Sequence[str] = (), *, use_git: bool = True) -> list[Finding]:
    root = Path(root)
    achados: set[Finding] = set()
    arquivos: list[_Arquivo] = []
    tem_uc = False
    modulos_uc: set[tuple[str, ...]] = set()
    for rel in _listar(root, use_git):
        parts = tuple(rel.split("/"))
        if _excluido(parts):
            continue
        if _e_use_cases(parts):
            tem_uc = True
            modulos_uc.add(_modulo(parts))
        try:
            linhas, tree = _ler(root, rel)
            a = _Arquivo(rel, parts, linhas, tree)
            a.aliases = _aliases(tree)
            a.define_uow = any(isinstance(n, ast.ClassDef) and UOW_CLASSE.match(n.name) for n in ast.walk(tree))
        except (SyntaxError, UnicodeDecodeError, LookupError, ValueError, RecursionError, MemoryError, OSError) as e:
            linha = getattr(e, "lineno", None) or 1
            achados.add(Finding(rel, linha, "DDDP-W0", f"parse: {type(e).__name__}; arquivo ignorado"))
            continue
        arquivos.append(a)
    tem_uow = any(a.define_uow for a in arquivos)
    for a in arquivos:
        try:
            achados.update(_analisar(a, tem_uow, tem_uc, extra_io, frozenset(modulos_uc)))
        except RecursionError:
            achados.add(Finding(a.rel, 1, "DDDP-W0", "parse: RecursionError; arquivo ignorado"))
    unicos: dict[tuple[str, int, str], Finding] = {}  # um achado por (arquivo, linha, regra): `httpx.Client().post()` casa duas vezes
    for f in sorted(achados, key=lambda f: (f.path, f.line, f.rule, f.msg)):
        unicos.setdefault((f.path, f.line, f.rule), f)
    return list(unicos.values())


# ---------- self-test ----------

_SELF_TEST_ARQUIVOS: dict[str, str | bytes] = {
    "app/core/unit_of_work.py": ("from redis import Redis\n"
                                 "class SqlUnitOfWork:\n"
                                 "    async def commit(self):\n"
                                 "        await self.session.commit()\n"),
    "app/orders/use_cases.py": ("import httpx\n"
                                "from fastapi import HTTPException\n"
                                "\n"
                                "async def criar(uow):\n"
                                "    async with uow:\n"
                                "        await httpx.post('x')\n"
                                "    await uow.commit()\n"),
    "app/orders/repository.py": "async def g(self):\n    await self.session.commit()\n",
    "app/orders/outro.py": "async def h(self):\n    await self.session.commit()  # ddd-pragmatico: allow R1 ADR-0001\n",
    "app/leads/service.py": "async def k(self):\n    await self._session.commit()\n",
    "app/pay/services.py": "async def p(uow):\n    await uow.commit()\n",
    "app/orders/router.py": "def r(db, feedback):\n    db.commit()\n    feedback.commit()\n",
    "app/orders/orders_test.py": "class FakeUnitOfWork:\n    pass\n",
    "app/big/use_cases.py": "x = 1\n" * (MAX_LINHAS_USE_CASES + 1),
    "app/latin.py": b"# \xe9\n",
    "tests/use_cases.py": "from fastapi import X\n",
}
_SELF_TEST_ESPERADO = [
    ("app/big/use_cases.py", 1, "DDDP-W1"),
    ("app/core/unit_of_work.py", 1, "DDDP-R3"),
    ("app/latin.py", 1, "DDDP-W0"),
    ("app/orders/repository.py", 2, "DDDP-R1"),
    ("app/orders/router.py", 2, "DDDP-R1"),
    ("app/orders/use_cases.py", 2, "DDDP-R4"),
    ("app/orders/use_cases.py", 6, "DDDP-R2"),
]


def self_test() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        for rel, conteudo in _SELF_TEST_ARQUIVOS.items():
            f = base / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(conteudo if isinstance(conteudo, bytes) else conteudo.encode("utf-8"))
        obtido = [(f.path, f.line, f.rule) for f in scan(base, use_git=False)]
    if obtido != _SELF_TEST_ESPERADO:
        print(f"self-test FALHOU\n  esperado: {_SELF_TEST_ESPERADO}\n  obtido:   {obtido}", file=sys.stderr)
        return 1
    print("self-test ok")
    return 0


# ---------- CLI ----------

def main(argv: list[str] | None = None) -> int:
    for s in (sys.stdout, sys.stderr):  # Windows (Git Bash): pipe em cp1252 não tem os acentos
        try:
            s.reconfigure(encoding="utf-8")
            s.reconfigure(errors="replace")  # nomes de arquivo não-UTF-8 (surrogateescape) não podem quebrar o print
        except (AttributeError, ValueError, OSError):
            pass
    try:
        ap = argparse.ArgumentParser(prog="check_ddd_pragmatico.py", description="Fiscaliza o guia ddd-pragmatico.")
        ap.add_argument("--root", default=".", help="raiz do projeto (padrão: cwd)")
        ap.add_argument("--extra-io", nargs="+", action="extend", default=[], metavar="NOME",
                        help="nomes extras tratados como I/O externo na regra R2")
        ap.add_argument("--self-test", action="store_true", help="roda fixtures embutidas e sai")
        args = ap.parse_args(argv)
        if args.self_test:
            return self_test()
        root = Path(args.root)
        if not root.is_dir():
            print(f"check_ddd_pragmatico: --root não é um diretório: {root}", file=sys.stderr)
            return 2
        achados = scan(root, args.extra_io)
        for f in achados:
            print(f"{f.path}:{f.line} [{f.rule}] {f.msg}")
        return 1 if any(re.fullmatch(r"DDDP-R\d", f.rule) for f in achados) else 0
    except Exception as e:  # noqa: BLE001 - exit 2 é reservado a erro interno; nunca um traceback no CI do projeto
        print(f"check_ddd_pragmatico: erro interno: {type(e).__name__}: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
