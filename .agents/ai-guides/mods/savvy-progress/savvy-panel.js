/**
 * Savvy Progress - Implementação de Referência
 * Telemetria de subagentes com progresso visual e estimativa de custos
 */

let panelVisible = false;

// Mock de subagentes ativos durante uma tarefa orquestrada
const activeSubagents = [
  { id: "agent-1", role: "Frontend Architect", model: "Sonnet 3.5", progress: 75, tokens: 14200, costEst: 0.042 },
  { id: "agent-2", role: "Security Reviewer", model: "Haiku 3.5", progress: 90, tokens: 4100, costEst: 0.004 },
  { id: "agent-3", role: "Database Designer", model: "Sonnet 3.5", progress: 40, tokens: 8900, costEst: 0.026 }
];

/**
 * Renderizador da barra de progresso no topo da caixa de prompt
 */
export function renderProgressBand() {
  const avgProgress = Math.round(activeSubagents.reduce((acc, a) => acc + a.progress, 0) / activeSubagents.length);
  const totalCost = activeSubagents.reduce((acc, a) => acc + a.costEst, 0).toFixed(3);

  const progressBar = "█".repeat(Math.floor(avgProgress / 10)) + "░".repeat(10 - Math.floor(avgProgress / 10));

  return `\x1b[36m🦀 Subagentes [${progressBar}] ${avgProgress}%\x1b[0m | Custo Est: \x1b[32m~$${totalCost}\x1b[0m \x1b[90m(/agents-info)\x1b[0m`;
}

/**
 * Alterna visualização do painel no comando /agents-info
 */
export function toggleAgentsInfoPanel(args, cli) {
  panelVisible = !panelVisible;

  cli.print(`
╔══════════════════════════════════════════════════════════════════════╗
║               🦀 SAVVY PROGRESS - TELEMETRIA DE SUBAGENTES           ║
╠══════════════════════════════════════════════════════════════════════╣
${activeSubagents.map(a => `║ [${a.progress}%] ${a.role.padEnd(20)} │ ${a.model.padEnd(10)} │ Tokens: ${a.tokens.toString().padEnd(6)} │ ~$${a.costEst.toFixed(3)} ║`).join("\n")}
╠══════════════════════════════════════════════════════════════════════╣
║ Total Estimado: ~$${activeSubagents.reduce((acc, a) => acc + a.costEst, 0).toFixed(3).padEnd(6)} │ Use /agents-info para recolher este painel. ║
╚══════════════════════════════════════════════════════════════════════╝
  `);
}
