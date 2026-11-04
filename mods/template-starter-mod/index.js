/**
 * Template Starter Mod - Ponto de Entrada Canônico
 * Demonstra a interceptação de ferramentas, renderização de UI e comandos customizados.
 */

// Estado interno do mod durante a sessão
const modState = {
  turnCount: 0,
  toolCallsCount: 0,
  blockedCalls: 0,
  lastAction: "Inicializado"
};

/**
 * Hook disparado ANTES da execução de qualquer ferramenta.
 * Pode permitir, bloquear ou solicitar confirmação com base em regras.
 * 
 * @param {Object} context Informações sobre a chamada da ferramenta
 * @returns {Promise<Object>} Diretiva de execução
 */
export async function onPreToolUse(context) {
  const { toolName, toolInput } = context;
  modState.toolCallsCount++;

  // Exemplo de inspeção de segurança:
  if (toolName === "Bash") {
    const cmd = toolInput?.command || "";
    if (cmd.includes("rm -rf /") || cmd.includes(":(){ :|:& };:")) {
      modState.blockedCalls++;
      modState.lastAction = `Bloqueado comando de alto risco: ${cmd.slice(0, 20)}...`;
      
      return {
        action: "block",
        reason: "Comando destrutivo crítico interceptado pelo Template Starter Mod.",
        renderModal: {
          title: "🛑 BLOQUEIO DE SEGURANÇA",
          message: `O comando '${cmd}' foi barrado preventivamente.`,
          options: ["OK"]
        }
      };
    }
  }

  modState.lastAction = `Executando ${toolName}`;
  return { action: "proceed" };
}

/**
 * Hook disparado APÓS a conclusão da ferramenta.
 */
export async function onPostToolUse(context) {
  const { toolName, result } = context;
  // Aqui você pode atualizar índices locais, auditar logs ou gravar métricas
}

/**
 * Hook disparado quando o turno completo do Claude Code termina.
 */
export async function onTurnComplete(summary) {
  modState.turnCount++;
  modState.lastAction = `Turno #${modState.turnCount} concluído`;
}

/**
 * Renderizador da banda de UI (Prompt Band) exibida acima da linha de digitação.
 * Retorna uma string com caracteres e cores ANSI (ou null para não desenhar).
 */
export function renderPromptBand() {
  const ansiCyan = "\x1b[36m";
  const ansiGreen = "\x1b[32m";
  const ansiYellow = "\x1b[33m";
  const ansiReset = "\x1b[0m";
  const ansiDim = "\x1b[2m";

  return `${ansiCyan}⚡ [Mod Starter]${ansiReset} Turnos: ${ansiGreen}${modState.turnCount}${ansiReset} | Calls: ${ansiYellow}${modState.toolCallsCount}${ansiReset} ${ansiDim}(/mod-status)${ansiReset}`;
}

/**
 * Handler do slash command `/mod-status`.
 */
export function handleStatus(args, cli) {
  cli.print(`
╔═══════════════════════════════════════════════════════════════╗
║               TEMPLATE STARTER MOD - STATUS                   ║
╠═══════════════════════════════════════════════════════════════╣
║  • Total de Turnos:      ${modState.turnCount.toString().padEnd(36)} ║
║  • Chamadas de Tools:    ${modState.toolCallsCount.toString().padEnd(36)} ║
║  • Bloqueios Preventivos:${modState.blockedCalls.toString().padEnd(36)} ║
║  • Último Status:        ${modState.lastAction.slice(0, 36).padEnd(36)} ║
╚═══════════════════════════════════════════════════════════════╝
  `);
}
