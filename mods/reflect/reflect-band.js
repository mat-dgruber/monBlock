/**
 * Reflect Mod - Implementação de Referência
 * Detecta correções e permite salvá-las como regras permanentes
 */

let pendingRule = null;

/**
 * Hook disparado após o usuário enviar um prompt.
 * Analisa se a mensagem parece uma correção diretiva.
 */
export async function detectCorrectionRule(promptText, llmClient) {
  const correctionTriggers = [
    "não use", "sempre use", "lembre-se", "regra:", "aqui usamos", 
    "no this repo", "we always use", "don't use", "never use"
  ];

  const lower = promptText.toLowerCase();
  const isCorrection = correctionTriggers.some(trigger => lower.includes(trigger));

  if (isCorrection) {
    // Em produção, o mod faz uma chamada rápida ao Haiku para sintetizar a regra.
    // Aqui simulamos a síntese determinística:
    pendingRule = {
      rawPrompt: promptText,
      synthesizedRule: `- Convenção detectada: ${promptText.trim()}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Renderizador da barra superior com botões de ação interativos
 */
export function renderReflectBand() {
  if (!pendingRule) return null;

  const bgBlue = "\x1b[44m\x1b[37m";
  const bgGreen = "\x1b[42m\x1b[30m";
  const bgYellow = "\x1b[43m\x1b[30m";
  const reset = "\x1b[0m";

  return `${bgBlue} 💡 Reflect: Salvar nova regra em CLAUDE.md? ${reset} ` +
         `"${pendingRule.synthesizedRule.slice(0, 40)}..." ` +
         `[${bgGreen} 1: Salvar Local ${reset}] [${bgYellow} 2: Salvar Global ${reset}] [ 3: Ignorar ]`;
}

/**
 * Ações acionadas pelo usuário no teclado ou botões
 */
export async function handleReflectAction(actionKey, fsHelper) {
  if (!pendingRule) return;

  if (actionKey === "1") {
    // Salva no CLAUDE.md do repositório
    await fsHelper.appendToFile("CLAUDE.md", `\n${pendingRule.synthesizedRule}\n`);
    pendingRule = null;
    return "Regra salva com sucesso em CLAUDE.md!";
  } else if (actionKey === "2") {
    // Salva nas regras globais do usuário (~/.claude/CLAUDE.md)
    await fsHelper.appendToFile("~/.claude/CLAUDE.md", `\n${pendingRule.synthesizedRule}\n`);
    pendingRule = null;
    return "Regra salva globalmente!";
  } else {
    pendingRule = null;
    return "Ignorado.";
  }
}
