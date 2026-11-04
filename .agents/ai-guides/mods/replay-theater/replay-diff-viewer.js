/**
 * Replay Theater - Implementação de Referência
 * Captura edições de arquivos e renderiza navegador passo a passo de diffs
 */

const turnEdits = [];

/**
 * Registra edições feitas pelas ferramentas de escrita e edição
 */
export async function recordFileEdit(context) {
  const { toolName, toolInput } = context;

  if (["Edit", "Write", "MultiEdit"].includes(toolName)) {
    const filePath = toolInput.file_path || toolInput.filePath || toolInput.target_file || "arquivo";
    turnEdits.push({
      tool: toolName,
      file: filePath,
      timestamp: Date.now()
    });
  }
}

/**
 * Exibe dica na banda superior ao terminar o turno com arquivos editados
 */
export function renderReplayHintBand() {
  if (turnEdits.length === 0) return null;

  return `\x1b[45m\x1b[37m 🎬 Replay Theater \x1b[0m \x1b[35m${turnEdits.length} arquivo(s) modificado(s).\x1b[0m Pressione \x1b[1m'r'\x1b[0m ou digite \x1b[1m/replay\x1b[0m para auditar os diffs.`;
}

/**
 * Handler do comando /replay
 */
export function launchReplayViewer(args, cli) {
  if (turnEdits.length === 0) {
    cli.print("Nenhuma edição de arquivo registrada no turno recente.");
    return;
  }

  cli.print(`
╔══════════════════════════════════════════════════════════════════════╗
║                     🎬 REPLAY THEATER - DIFF VIEWER                  ║
╠══════════════════════════════════════════════════════════════════════╣
${turnEdits.map((e, idx) => `║ [${idx + 1}/${turnEdits.length}] ${e.tool.padEnd(10)} 📄 ${e.file.slice(-45).padEnd(45)} ║`).join("\n")}
╠══════════════════════════════════════════════════════════════════════╣
║ Controles: [n] Próximo diff  |  [p] Anterior  |  [q] Fechar auditoria ║
╚══════════════════════════════════════════════════════════════════════╝
  `);
}
