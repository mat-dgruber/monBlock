---
title: Guia de Design System Mobile, Ergonomia de Toque e Acessibilidade
description: Diretrizes de design e engenharia ergonômica para interfaces móveis (iOS e Android), Fitts' Law, zonas do polegar (Thumb Zone), safe areas, Dynamic Type e acessibilidade WCAG/TalkBack/VoiceOver.
version: 1.0.0
date: 2026-10-18
author: Comitê Corporativo de Arquitetura & Engenharia de Software
---

<!-- markdownlint-disable MD022 MD025 MD031 MD032 MD040 MD026 -->

<!--
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO

| Data          | Autor                                                      | Descrição da Alteração                                                                 |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-10-18    | Comitê Corporativo de Arquitetura & Engenharia de Software | v1.0.0 — Criação do guia de design system, ergonomia e acessibilidade mobile (ADR 0006)|

=================================================================================
-->

# 🎨 Guia de Design System Mobile, Ergonomia de Toque e Acessibilidade

> **Princípio Fundamental:** *No ambiente móvel, a interface é operada por toques físicos em telas de vidro sob condições adversas de iluminação, movimento e atenção fragmentada. Um design móvel excelente respeita a biomecânica da mão humana (Thumb Zone), garante alvos de toque generosos para evitar erros acidentais, suporta Dynamic Type sem quebra de leiaute e integra a acessibilidade como pilar nativo de primeira classe.*

---

## 1. Ergonomia Biomecânica e a Lei de Fitts (Thumb Zone)

Mais de 75% das interações em smartphones ocorrem com o uso de uma única mão, onde o polegar atua como o principal atuador motor.

```text
+-----------------------+
|     ZONA DIFÍCIL      |  <-- Ações secundárias, configurações, perfis (topo da tela)
|   (Alcance Máximo)    |
+-----------------------+
|     ZONA NATURAL      |  <-- Leitura e conteúdo informativo navegável
|   (Alcance Confortável)|
+-----------------------+
|      ZONA FÁCIL       |  <-- Ações PRIMÁRIAS, botões de ação principal (CTA),
|  (Alcance Imediato)   |      navegação por abas inferiores (Bottom Navigation)
+-----------------------+
```

### Regras de Ouro da Ergonomia Móvel:
1. **Ações Críticas na Base:** O botão de ação primária (CTA), a barra de abas e os fluxos de confirmação devem sempre residir na **Zona Fácil** (inferior da tela).
2. **Ações Destrutivas na Zona Difícil:** Ações perigosas e irreversíveis (ex.: "Excluir Conta", "Apagar Dados") devem residir no topo da tela ou exigir confirmação modal em duas etapas para evitar toques acidentais.

---

## 2. Dimensões Mínimas de Alvos de Toque (Touch Targets)

O dedo humano não possui a precisão de um cursor de mouse. Quando um alvo de toque é menor que o volume físico da polpa do polegar, a taxa de erro (*fat-finger error*) cresce exponencialmente.

| Plataforma / Padrão | Dimensão Mínima Obrigatória | Espaçamento Mínimo Entre Alvos |
| :--- | :--- | :--- |
| **Android (Material Design 3)** | **$48 \times 48\text{ dp}$** | $\ge 8\text{ dp}$ |
| **Apple (Human Interface Guidelines)** | **$44 \times 44\text{ pt}$** | $\ge 8\text{ pt}$ |
| **WCAG 2.2 Nível AAA** | **$44 \times 44\text{ px}$** | $\ge 8\text{ px}$ |

> **Dica de Engenharia:** Se o ícone visual precisa ter $24 \times 24\text{ dp}$, expanda a área clicável (*touch delegate* / *padding*) para que o container interativo cumpra no mínimo $48 \times 48\text{ dp}$.

---

## 3. Gestão de Safe Areas e Insets de Hardware

Dispositivos modernos possuem recortes físicos intrusivos (Notch, Dynamic Island, câmeras sob a tela) e barras virtuais de navegação por gestos do sistema operacional.

- **Nunca adote margens fixas em pixels:** O topo e a base da tela devem ser calculados dinamicamente via APIs de Safe Area.
- **Tratamento de Teclado Virtual (Keyboard Insets):** Quando o teclado virtual abre, ele pode ocultar campos de formulário e botões de envio.
  - Utilize `KeyboardAvoidingView` com `behavior="padding"` (React Native / Expo).
  - Utilize `Modifier.imePadding()` (Jetpack Compose).
  - Utilize `Scaffold(resizeToAvoidBottomInset: true)` (Flutter).

---

## 4. Tipografia Escalável (Dynamic Type & Font Scaling)

Usuários com limitações visuais frequentemente configuram fontes ampliadas no sistema operacional (até 200% ou 300%).
- **Proibição de Alturas Fixas de Containers Textuais:** Containers que envolvem textos nunca devem possuir `height` estático. Se o texto for ampliado em 200%, a altura fixa causará truncamento ilegível (*text clipping*).
- **Proibição de `numberOfLines={1}` em Textos Chave:** Não force uma única linha em descrições importantes ou instruções de segurança. Permita que o texto quebre linhas graciosamente.

---

## 5. Acessibilidade com Leitores de Tela (VoiceOver & TalkBack)

### O Contrato Semântico Móvel:
Todo componente interativo deve informar ao leitor de tela três elementos fundamentais:
1. **O que é? (Label):** Rótulo claro e conciso (ex.: `"Voltar"`, `"Adicionar ao Carrinho"`).
2. **Qual é o papel? (Role / Trait):** Se é um botão, link, checkbox, campo de texto ou cabeçalho.
3. **Qual é o estado? (State / Value):** Se está selecionado, desativado, expandido ou carregando.

#### 5.1. React Native / Expo:
```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel="Adicionar ao carrinho"
  accessibilityHint="Adiciona o produto selecionado ao seu carrinho de compras"
  accessibilityState={{ disabled: isAddingToCart }}
  onPress={handleAddToCart}
>
  <Text>Comprar</Text>
</Pressable>
```

#### 5.2. SwiftUI (Apple / VoiceOver):
```swift
Button(action: handleAddToCart) {
    Text("Comprar")
}
.accessibilityLabel("Adicionar ao carrinho")
.accessibilityHint("Adiciona o produto selecionado ao seu carrinho de compras")
.accessibilityAddTraits(.isButton)
.disabled(isAddingToCart)
```

#### 5.3. Jetpack Compose (Android / TalkBack):
```kotlin
Button(
    onClick = handleAddToCart,
    enabled = !isAddingToCart,
    modifier = Modifier.semantics {
        role = Role.Button
        contentDescription = "Adicionar ao carrinho"
        stateDescription = if (isAddingToCart) "Carregando" else "Disponível"
    }
) {
    Text("Comprar")
}
```

#### 5.4. Flutter (Semantics Widget):
```dart
Semantics(
  button: true,
  enabled: !isAddingToCart,
  label: 'Adicionar ao carrinho',
  hint: 'Adiciona o produto selecionado ao seu carrinho de compras',
  child: ElevatedButton(
    onPressed: isAddingToCart ? null : handleAddToCart,
    child: const Text('Comprar'),
  ),
)
```

---

## 6. Redução de Movimento (*Reduce Motion*) e Respeito ao Usuário

Muitas pessoas sofrem de cinetose, labirintite ou distúrbios vestibulares, nos quais transições rápidas de zoom, giros 3D ou efeitos intensos de paralaxe causam tontura, náusea e desconforto físico severo.

### Princípios Técnicos de Motion Acessível:
1. **Consulte a Preferência do Sistema Operacional:** Tanto o iOS quanto o Android oferecem a opção *"Reduzir Movimento"* nas configurações de Acessibilidade.
2. **Degradação Graciosa:** Quando a opção estiver ativada, **nunca desative a transição abruptamente deixando a tela estática sem feedback**. Substitua animações de translação e zoom por um **cross-fade sutil de opacidade**.

### Consulta da Preferência por Stack:

```swift
// SwiftUI: Respeitando Reduce Motion nativamente
struct AnimatedCardView: View {
    @Environment(\.accessibilityReduceMotion) var reduceMotion
    @State private var isVisible = false

    var body: some View {
        CardContent()
            .opacity(isVisible ? 1 : 0)
            .scaleEffect(reduceMotion ? 1.0 : (isVisible ? 1.0 : 0.8)) // Sem zoom se reduceMotion for true
            .animation(.easeInOut(duration: 0.3), value: isVisible)
    }
}
```

```typescript
// React Native: Verificação via AccessibilityInfo
import { AccessibilityInfo } from 'react-native';

const [reduceMotion, setReduceMotion] = useState(false);

useEffect(() => {
  AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
  return () => sub.remove();
}, []);
```

---

## 7. Feedback Háptico e Micro-Interações

O feedback tátil confirma ações físicas no vidro da tela:
- **Sucesso / Confirmação:** Impacto suave ou vibração dupla curta (ex.: pagamento aprovado, item salvo).
- **Alerta / Erro:** Vibração pulsante (ex.: falha de validação no formulário).
- **Seleção:** Clique sutil e imperceptível ao girar seletores (*pickers*) ou rolar listas longas.

---

## 8. Checklist de Ergonomia e Acessibilidade Mobile

- [ ] **Alvos de Toque:** Todos os botões e áreas interativas possuem dimensões mínimas de $48 \times 48\text{ dp}$ (Android) ou $44 \times 44\text{ pt}$ (iOS), com espaçamento $\ge 8\text{ dp}$?
- [ ] **Ergonomia do Polegar:** Elementos essenciais e botões de ação principal (CTA) estão alocados na Zona Fácil de alcance do polegar?
- [ ] **Contraste de Cores (WCAG 2.2 AA):** Todo texto em relação ao fundo mantém taxa de contraste mínima de **4.5:1** (texto normal) e **3.0:1** (texto grande $\ge 18\text{ pt}$ ou ícones interativos)?
- [ ] **Safe Areas:** Safe Area Insets são respeitados no topo e na base em todas as orientações e recortes de tela (Notch / Dynamic Island)?
- [ ] **Dynamic Type / Font Scaling:** O leiaute suporta ampliação de fonte de até 200% sem cortes de texto (*text clipping*), sem altura fixa de containers e sem sobreposição de elementos?
- [ ] **Leitores de Tela:** Todos os elementos interativos possuem label, role e state legíveis por VoiceOver e TalkBack, e imagens puramente decorativas estão ocultas?
- [ ] **Reduce Motion:** Animações de tela consultam a preferência de redução de movimento do sistema e oferecem alternativa suave em cross-fade?
