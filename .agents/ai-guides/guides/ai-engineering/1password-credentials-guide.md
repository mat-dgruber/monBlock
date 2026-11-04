<!-- 
=================================================================================
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO
=================================================================================
Data       | Autor          | Descrição da Alteração
-----------|----------------|--------------------------------------------------
2026-08-31 | Matheus Diniz  | Incorporação e padronização do Guia Canônico de
           | (Antigravity)  | Gestão Segura de Segredos via 1Password CLI (`op`).
2026-09-18 | Eduardo Batista| Heurísticas Executáveis (slug 1password-credentials) consumidas
           |                | pelo /setup; prosa movida para Fundamentos; .env.example com
           |                | fonte canônica em templates/harness/env.example.
2026-10-14 | Eduardo Batista| AGENTS.md como instrução única: referência OP-05 passa a ser verificada no AGENTS.md. Bloco na versão 2.
=================================================================================
-->

# 🔑 Guia Geral e Curinga: Gestão Segura de Segredos com 1Password CLI

| Metadado | Detalhe |
| :--- | :--- |
| **Versão** | 1.0.0 (SemVer) |
| **Data** | 2026-08-31 |
| **Status** | **Ativo / Normativo** |
| **Escopo** | Gestão Segura de Segredos e Credenciais em Memória RAM (1Password CLI `op`) |
| **Autor** | Matheus Diniz |

---

Este documento serve como guia de referência técnica universal para a eliminação completa de segredos físicos e credenciais em texto puro nos ambientes de desenvolvimento. As credenciais passam a existir **apenas em memória RAM** durante a execução autorizada da aplicação, mitigando riscos de vazamento de arquivos de configuração.

Abaixo, o fluxo está dividido em três categorias claras:

1. **Etapas Universais** (Obrigatórias para todos os projetos e linguagens)
2. **Etapas para Projetos com Docker** (Específicas para infraestruturas containerizadas)
3. **Etapas para Projetos PHP / Laravel** (Restritas ao ecossistema Laravel)

---

## ⚙️ Heurísticas Executáveis

Bloco lido pelo `/setup` e por `skills/setup/scripts/verify_setup.py`. `when`/`verify` são shell (cwd = raiz do projeto, `AI_GUIDES_RUNTIME` aponta para `.agents/ai-guides`). O agente é bloqueado pelo hook `protect-secrets.sh` ao ler/editar `.env`, por isso as ações sobre `.env` são instruções ao desenvolvedor.

```yaml heuristics
guide: 1password-credentials
version: 2
requires: []
heuristics:
  - id: OP-01
    title: 1Password CLI (op) instalado
    when: "! command -v op >/dev/null 2>&1"
    do: |
      if command -v brew >/dev/null 2>&1; then brew install 1password-cli
      else echo "instale o 1Password CLI conforme a seção 1 (passo 1) do guia: Linux via repositório apt, Windows via choco/scoop"; exit 1; fi
    verify: "command -v op >/dev/null 2>&1"
    optional: true

  - id: OP-02
    title: .env fora do controle de versão
    when: "! grep -qxF '.env' .gitignore 2>/dev/null"
    do: "printf '\\n# ai-guides: segredos nunca versionados\\n.env\\n.env.*\\n!.env.example\\n' >> .gitignore"
    verify: "grep -qxF '.env' .gitignore"

  - id: OP-03
    title: .env sem segredos em texto puro (somente referências op://)
    when: "test -f .env && grep -E '^[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*=' .env | grep -vE '=op://|=\"?\"?$' | grep -q ."
    do: |
      agent: Não abra o .env (bloqueado pelo hook protect-secrets). Peça ao desenvolvedor que substitua cada segredo em
      texto puro por uma referência `op://<Cofre>/<Item>/<campo>` (seção 1, passo 4) e passe a executar a aplicação com
      `op run -- <comando>` (passo 5). Registre no relatório final quais variáveis foram apontadas pelo verify.
    verify: "! { test -f .env && grep -E '^[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY)[A-Z0-9_]*=' .env | grep -vE '=op://|=\"?\"?$' | grep -q .; }"
    optional: true

  - id: OP-04
    title: .env.example documenta o padrão op:// para segredos
    when: "! grep -qs 'op://' .env.example"
    do: |
      agent: Crie ou complete .env.example (base: "$AI_GUIDES_RUNTIME/templates/harness/env.example") listando as variáveis
      reais do projeto: públicas em texto puro, segredos como `op://<Cofre>/<Item>/<campo>`. Nunca copie valores de .env.
    verify: "grep -qs 'op://' .env.example"
    optional: true

  - id: OP-05
    title: AGENTS.md referencia o guia de credenciais 1Password
    when: "! grep -q '1password-credentials-guide' AGENTS.md 2>/dev/null"
    do: |
      agent: Acrescente ao AGENTS.md, na seção de segurança e credenciais, a linha:
      "- **Segredos:** nunca em texto puro; use referências `op://` e `op run -- <comando>` conforme
      `.agents/ai-guides/guides/ai-engineering/1password-credentials-guide.md`." Se AGENTS.md não existir, aplique antes o
      guia harness-commit-memoria.
    verify: "grep -q '1password-credentials-guide' AGENTS.md"
```

---

---

## 📚 Fundamentos

### 1. Etapas Universais (Qualquer Projeto & Linguagem)

Essas etapas devem ser executadas por todos os desenvolvedores, independentemente da stack tecnológica ou arquitetura do projeto.

#### Passo 1: Instalar o 1Password CLI (`op`)

Instale o utilitário oficial de linha de comando do 1Password em sua máquina local.

* **macOS (via Homebrew):**
  ```bash
  brew install 1password-cli
  ```
* **Windows (via Chocolatey ou Scoop):**
  ```powershell
  choco install 1password-cli
  # ou
  scoop install 1password
  ```
* **Linux (Debian/Ubuntu):**
  ```bash
  curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" | sudo tee /etc/apt/sources.list.y/1password.list
  sudo apt update && sudo apt install 1password-cli
  ```

#### Passo 2: Autenticar no CLI

Após a instalação, você deve associar o CLI à sua conta corporativa.

1. Abra o aplicativo do 1Password Desktop, acesse **Configurações > Desenvolvedor** e marque a opção **Integrar com o 1Password CLI** (recomendado para autenticação biométrica via Touch ID/Windows Hello).
2. Se preferir autenticação manual via terminal, execute:
   ```bash
   op signin
   ```
3. Insira suas credenciais corporativas e conclua a validação do Multi-Factor Authentication (MFA).

#### Passo 3: Organizar os Cofres e Padronizar Itens

Os segredos devem ser armazenados de forma estruturada no painel web ou desktop do 1Password:

* **Isolamento por Ambiente:** Crie cofres distintos para cada estágio do ciclo de desenvolvimento:
  * `ERP-DEV` (Desenvolvimento)
  * `ERP-HOMOLOG` (Homologação)
  * `ERP-PROD` (Produção)
* **Padronização de Itens:** Utilize nomes lógicos e universais para os itens (ex: `MySQL`, `Redis`, `TOTVS_API`).
* **Aproveitamento de Campos:** Utilize os campos nativos (ex: `username`, `password`) ou crie campos de texto personalizados para chaves adicionais.

#### Passo 4: Alterar os Arquivos `.env` Locais

Substitua todos os segredos físicos em texto puro no arquivo `.env` do seu projeto por referências URI seguras fornecidas pelo 1Password. O formato universal de referência é:

```env
op://<Nome-do-Cofre>/<Nome-do-Item>/<Identificador-do-Campo>
```

##### Exemplo prático de um arquivo `.env` higienizado

```env
# Variáveis públicas (mantêm-se em texto puro)
APP_ENV=local
APP_DEBUG=true
DB_CONNECTION=mysql
DB_PORT=3306

# Segredos confidenciais (convertidos em referências RAM)
DB_HOST=op://ERP-DEV/MySQL/host
DB_DATABASE=op://ERP-DEV/MySQL/database
DB_USERNAME=op://ERP-DEV/MySQL/username
DB_PASSWORD=op://ERP-DEV/MySQL/password
JWT_SECRET=op://ERP-DEV/JWT/secret_key
```

#### Passo 5: Executar Aplicações Locais via CLI

Para iniciar o seu servidor local ou scripts injetando as variáveis em tempo de execução diretamente na RAM, utilize o prefixo `op run --` precedendo seu comando tradicional de inicialização.

* **Node.js / React / Vue:**
  ```bash
  op run -- npm run dev
  ```
* **Python:**
  ```bash
  op run -- python main.py
  ```
* **Go:**
  ```bash
  op run -- go run main.go
  ```
* **PHP (sem Docker):**
  ```bash
  op run -- php artisan serve
  ```

#### Passo 6: Auditoria e Boas Práticas Contínuas

Para garantir a blindagem do repositório, siga as diretrizes abaixo:

* **Auditoria de Commits:** Utilize scanners estáticos de segredos como o `gitleaks` ou `trufflehog` localmente e em pipelines de CI para identificar se alguma senha antiga em texto puro ficou perdida no histórico do Git.
* **Políticas do `.env.example`:** Nunca, sob nenhuma circunstância, coloque referências reais do 1Password ou senhas físicas dentro do arquivo `.env.example`. Ele deve conter apenas chaves vazias ou valores fictícios públicos.
* **Menor Privilégio:** Conceda acesso aos cofres apenas aos desenvolvedores e deploys que de fato precisam interagir com aquelas credenciais.
* **Princípio de Não-Cópia:** Jamais copie segredos em texto puro para canais de chat, documentações internas (Wikis, Notion) ou comentários de código.

---

### 2. Etapas para Projetos com Docker

Quando a aplicação roda encapsulada dentro de containers do Docker, as referências do 1Password resolvidas no Host precisam ser transportadas corretamente para dentro da rede isolada do container sem expor o disco.

#### Passo A: Repasse de Runtime no `docker-compose.yml`

No arquivo `docker-compose.yml`, configure a seção de variáveis de ambiente do seu serviço para receber dinamicamente as variáveis herdadas do terminal do Host através de interpolação:

```yaml
services:
  web-app:
    image: node:18-alpine
    # ... outras configurações
    environment:
      - DB_HOST=${DB_HOST}
      - DB_DATABASE=${DB_DATABASE}
      - DB_USERNAME=${DB_USERNAME}
      - DB_PASSWORD=${DB_PASSWORD}
```

#### Passo B: Inicializar o Compose com Injeção de RAM

Para que o Docker Compose leia seu arquivo `.env` local, resolva as referências no 1Password e as injete na memória dos containers ao subirem, utilize o comando abaixo:

```bash
op run --env-file=.env -- docker compose up -d
```

> **Nota:** O parâmetro `--env-file=.env` força o `op` a ler o arquivo de ambiente especificado, resolver todas as URIs `op://` contidas nele e repassá-las descriptografadas em memória de sistema para o executável subsequente (`docker compose`).

#### Passo C: Gestão de Processos Internos com Preservação de Memória (`gosu`)

Se o seu container Docker utiliza um gerenciador de processos como o **Supervisord** para rodar daemons (como filas de background, workers ou cronjobs), o processo inicial geralmente roda como usuário `root`.

* **O Problema Comum:** Mudar o usuário do processo principal do Supervisor usando comandos tradicionais de shell (`su` ou `sudo`) limpa, purga ou corrompe as variáveis de ambiente em memória RAM, especialmente se as senhas contêm caracteres especiais como `@`, `%`, ou `,`.
* **A Solução Segura:** Utilize o **`gosu`** no seu script de entrada (`entrypoint.sh`) ou arquivo de configuração do Supervisord para rebaixar os privilégios para um usuário comum (como `node`, `sail` ou `www-data`). O `gosu` realiza o chaveamento de usuário do Linux preservando 100% das variáveis de ambiente na RAM interna do container de forma nativa e segura.

---

### 3. Etapas Restritas a Projetos PHP e Laravel

O ecossistema PHP e a arquitetura de inicialização do Laravel possuem peculiaridades de escopo de processos que exigem configurações adicionais.

#### Passo A: O Problema do Escopo do `artisan serve`

Ao executar o comando tradicional de desenvolvimento `php artisan serve`, o Artisan cria um subprocesso de rede independente para rodar o servidor HTTP nativo do PHP (`php -S`).

* **O Obstáculo:** Por padrão, o Laravel filtra e bloqueia o repasse de variáveis de ambiente do terminal para este subprocesso web, fazendo com que a aplicação web no navegador receba variáveis vazias ou as URIs cruas (`op://...`) ao invés do valor real em RAM.
* **A Solução (Passthrough de Variáveis):**
  Edite o arquivo `app/Providers/AppServiceProvider.php` e adicione no método `boot()` a liberação explícita de tráfego para as variáveis de ambiente personalizadas que devem ser transmitidas para o subprocesso HTTP do PHP:

```php
namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Foundation\Console\ServeCommand;

class AppServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Libera o passthrough de variáveis de ambiente do Host para o servidor web local do PHP
        if ($this->app->runningInConsole()) {
            ServeCommand::$passthroughVariables[] = 'DB_HOST';
            ServeCommand::$passthroughVariables[] = 'DB_DATABASE';
            ServeCommand::$passthroughVariables[] = 'DB_USERNAME';
            ServeCommand::$passthroughVariables[] = 'DB_PASSWORD';
            ServeCommand::$passthroughVariables[] = 'JWT_SECRET';
        }
    }
}
```

#### Passo B: Consumo Seguro e Retrocompatibilidade

Para que o projeto continue compatível com outros desenvolvedores que ainda não adotaram o 1Password CLI localmente (utilizando senhas em texto puro legadas), implemente os métodos de leitura de ambiente com fallbacks explícitos.

##### 1. Consumo Geral de Recursos Externos (Operador Elvis PHP)

Para variáveis simples do sistema, utilize a função `getenv()` nativa do PHP como prioritária, recorrendo ao helper tradicional `env()` como fallback caso a primeira não esteja em memória:

```php
// config/services.php
'totvs' => [
    'user' => getenv('TOTVS_USER') ?: env('TOTVS_USER'),
    'pass' => getenv('TOTVS_PASS') ?: env('TOTVS_PASS'),
],
```

##### 2. Consumo de Conexões de Banco de Dados (`db_env()`)

Se um desenvolvedor rodar o Laravel sem o CLI, as strings brutas de referência `op://...` podem passar diretamente para as bibliotecas de conexão de banco de dados (como PDO/SQL Server/MySQL), resultando em crashes obscuros de infraestrutura.

Para mitigar isso, crie um helper resiliente chamado `db_env()` e use-o no arquivo de configuração do seu banco de dados (`config/database.php`). O helper avalia se a string resultante começa com `op://` e a descarta, retornando o valor padrão ou nulo de forma limpa.

###### Implementação do Helper (no topo de `config/database.php`)

```php
if (! function_exists('db_env')) {
    /**
     * Recupera variáveis de ambiente tratando referências não-resolvidas do 1Password.
     */
    function db_env($key, $default = null) {
        $val = getenv($key);
        // Se a variável resolvida no sistema existe e não é uma referência crua
        if ($val !== false && ! str_starts_with($val, 'op://')) {
            return $val;
        }
      
        $envVal = env($key, $default);
        // Se o fallback do .env local contém uma string op:// não-resolvida, ignora-a e usa o default
        if ($envVal !== null && str_starts_with($envVal, 'op://')) {
            return $default;
        }
      
        return $envVal;
    }
}
```

###### Aplicação Prática na Configuração de Conexão

```php
// config/database.php
'mysql' => [
    'driver' => 'mysql',
    'host' => db_env('DB_HOST', '127.0.0.1'),
    'port' => db_env('DB_PORT', '3306'),
    'database' => db_env('DB_DATABASE', 'forge'),
    'username' => db_env('DB_USERNAME', 'forge'),
    'password' => db_env('DB_PASSWORD', ''),
    // ...
],
```

Esta arquitetura garante robustez, segurança, portabilidade multiplataforma e 100% de flexibilidade para o fluxo de desenvolvimento do time.
