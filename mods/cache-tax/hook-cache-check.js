/**
 * Cache Tax Mod - Implementação de Referência
 * Gerencia a expiração de cache de prompt (TTL de 60 min em assinatura ou 5 min em API pura)
 */

let lastActiveTimestamp = Date.now();
let keepWarmTimer = null;
let keepWarmDurationMinutes = 0;

// Custo aproximado por milhão de tokens de contexto reprocessados
const PRICE_PER_MILLION_INPUT = 3.00; // Sonnet 3.5 base

/**
 * Hook interceptor disparado quando o usuário tenta submeter um prompt.
 * Se o cache expirou e o contexto for grande, exige confirmação antes de gastar.
 */
export async function checkPromptCacheStatus(context) {
  const now = Date.now();
  const elapsedMinutes = (now - lastActiveTimestamp) / (1000 * 60);
  const cacheTTLMinutes = context.isApiKey ? 5 : 60;

  // Atualiza timestamp
  lastActiveTimestamp = now;

  if (elapsedMinutes > cacheTTLMinutes) {
    const estimatedTokens = context.conversationTokenCount || 45000;
    const estimatedColdCost = ((estimatedTokens / 1000000) * PRICE_PER_MILLION_INPUT).toFixed(2);

    return {
      action: "pause",
      reason: `Cache expirou há ${(elapsedMinutes - cacheTTLMinutes).toFixed(0)} min!`,
      renderModal: {
        title: "❄️ AVISO DE CACHE FRIO (CACHE TAX)",
        message: `O cache da conversa expirou. Reenviar este turno custará aproximadamente $${estimatedColdCost} (vs ~$0.03 com cache aquecido). Deseja continuar?`,
        options: ["Continuar Mesmo Assim", "Novo Chat (/clear)", "Cancelar"]
      }
    };
  }

  return { action: "proceed" };
}

/**
 * Renderizador da banda de UI superior
 */
export function renderCacheBand(state) {
  const now = Date.now();
  const elapsedMin = ((now - lastActiveTimestamp) / (1000 * 60)).toFixed(0);
  
  if (keepWarmTimer) {
    return `\x1b[42m\x1b[30m 🔥 Keep-Warm ATIVO (${keepWarmDurationMinutes}m) \x1b[0m \x1b[32mCache Protegido\x1b[0m`;
  }

  if (elapsedMin > 45) {
    return `\x1b[43m\x1b[30m ⚠️ Cache prestes a expirar (${elapsedMin}m inativo) \x1b[0m \x1b[33m/keepwarm 90m\x1b[0m`;
  }

  return `\x1b[90m⚡ Cache: Quente (${elapsedMin}m atrás)\x1b[0m`;
}

/**
 * Handler do comando /keepwarm
 */
export function handleKeepWarm(args, cli) {
  const durationArg = args[0] || "60m";
  
  if (durationArg.toLowerCase() === "off") {
    if (keepWarmTimer) {
      clearInterval(keepWarmTimer);
      keepWarmTimer = null;
    }
    cli.print("❄️ Keep-warm desativado.");
    return;
  }

  const minutes = parseInt(durationArg, 10) || 60;
  keepWarmDurationMinutes = minutes;

  if (keepWarmTimer) clearInterval(keepWarmTimer);

  // Ping a cada 25 minutos para manter o cache aquecido
  keepWarmTimer = setInterval(() => {
    cli.pingCache();
  }, 25 * 60 * 1000);

  cli.print(`🔥 Keep-warm ativado para os próximos ${minutes} minutos. Pings automáticos iniciados.`);
}
