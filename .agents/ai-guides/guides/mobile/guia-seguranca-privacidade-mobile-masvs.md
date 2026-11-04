---
title: Guia de Segurança Defensiva e Privacidade Mobile (OWASP MASVS)
description: Framework de segurança para aplicações móveis corporativas baseado no OWASP Mobile Application Security (MASVS v2 & MASTG), blindagem de credenciais, criptografia de hardware, biometria e mitigação de engenharia reversa.
version: 1.0.0
date: 2026-10-18
author: Comitê Corporativo de Arquitetura & Engenharia de Software
---

<!-- markdownlint-disable MD022 MD025 MD031 MD032 MD040 MD026 -->

<!--
LOG DE MANUTENÇÃO E ALTERAÇÕES DO DOCUMENTO

| Data          | Autor                                                      | Descrição da Alteração                                                                 |
| ------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 2026-10-18    | Comitê Corporativo de Arquitetura & Engenharia de Software | v1.0.0 — Instituição do guia canônico de segurança defensiva mobile (ADR 0006).         |

=================================================================================
-->

# 🔒 Guia de Segurança Defensiva e Privacidade Mobile (OWASP MASVS)

> **Princípio Fundamental:** *O dispositivo móvel do usuário final é um território hostil e desprotegido. O binário do aplicativo é inspecionável por engenharia reversa, a memória pode sofrer inspeção por gdb/Frida, e as requisições de rede podem ser interceptadas por proxies MITM. Nenhuma premissa de segurança pode depender do sigilo do código cliente; toda autorização deve ser forçada pelo servidor, e todo segredo local deve ser ancorado em módulos criptográficos de hardware (Secure Enclave / TEE).*

---

## 1. O Framework OWASP MASVS v2 (Mobile Application Security)

O **OWASP MASVS** (*Mobile Application Security Verification Standard*) padroniza os controles de segurança em 7 categorias fundamentais:

```text
MASVS v2
├── MASVS-STORAGE    ──> Proteção de dados em repouso e isolamento de arquivos
├── MASVS-CRYPTO     ──> Práticas criptográficas ancoradas em hardware
├── MASVS-AUTH       ──> Autenticação robusta, biometria e gestão de tokens
├── MASVS-NETWORK    ──> Proteção de dados em trânsito e validação de certificados
├── MASVS-PLATFORM   ──> Interação segura com IPC, deep links, WebViews e permissões
├── MASVS-CODE       ──> Integridade de código, minificação e ofuscação
└── MASVS-RESILIENCE ──> Defesa ativa contra adulteração (tampering) e debugging
```

---

## 2. MASVS-STORAGE: Blindagem de Dados em Repouso

### O Erro Fatal do `AsyncStorage` / `SharedPreferences`
Armazenar tokens JWT, credenciais de usuário ou chaves privadas em `AsyncStorage` (React Native) ou `SharedPreferences` sem criptografia (Android) é uma **vulnerabilidade crítica**. No Android, esses arquivos residem em formato XML puro em `/data/data/<package>/shared_prefs/`, acessíveis instantaneamente em aparelhos rooteados ou via backups desprotegidos.

### Padrão de Armazenamento Seguro por Plataforma:

| Plataforma | API Segura Canônica | Mecanismo de Hardware Subjacente |
| :--- | :--- | :--- |
| **Apple (iOS / iPadOS)** | **Keychain Services** com acessibilidade `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` | Apple Secure Enclave |
| **Android (Kotlin)** | **Android Keystore** com `EncryptedSharedPreferences` / `MasterKey` (AES-256-GCM) | Trusted Execution Environment (TEE) / StrongBox |
| **Flutter** | `flutter_secure_storage` com criptografia Keychain / Keystore ativa | Secure Enclave / Android Keystore |
| **React Native / Expo** | `expo-secure-store` | Secure Enclave / Android Keystore |

```swift
// Exemplo em Swift: Gravação segura no Keychain com restrição de dispositivo
func saveSecureToken(token: String, account: String) -> Bool {
    guard let data = token.data(using: .utf8) else { return false }
    
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    ]
    
    SecItemDelete(query as CFDictionary)
    return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
}
```

---

## 3. MASVS-CRYPTO: Práticas Criptográficas Ancoradas em Hardware

O cliente móvel **nunca deve tentar criar seus próprios algoritmos criptográficos** (*"roll your own crypto"*). Toda operação deve recorrer a padrões industriais comprovados ancorados no hardware de segurança:

### Práticas Criptográficas Obrigatórias:
1. **Criptografia Simétrica (Dados Locais / Cache Sensível):**
   - Utilize **AES-256 no modo GCM (Galois/Counter Mode)**, fornecendo simultaneamente confidencialidade e autenticidade (cifra autenticada AEAD).
   - **Proibições Estritas:** É terminantemente proibido o uso de modo **ECB** (Electronic Codebook, que vaza padrões visuais dos blocos de dados) e modo **CBC sem HMAC** (vulnerável a ataques de padding oracle).
2. **Criptografia Assimétrica e Assinatura Digital:**
   - Chaves assimétricas geradas no dispositivo devem residir no Secure Enclave (Apple) ou Android Keystore / StrongBox com curvas elípticas modernas (**ECDSA / P-256** ou **Ed25519**) ou RSA com chave mínima de **3072 bits**.
3. **Funções de Derivação de Chaves (KDF):**
   - Para transformar senhas ou PINs de usuário em chaves criptográficas, utilize funções que introduzem custo computacional de CPU e memória: **Argon2id**, **PBKDF2 com no mínimo 600.000 iterações** (SHA-256) ou **scrypt**.
   - Nunca utilize funções simples de hash (SHA-256, SHA-512) para derivar chaves ou validar senhas locais.
4. **Geração de Entropia e Números Pseudoaleatórios:**
   - Gere vetores de inicialização (IV), nonces e sais utilizando geradores de alta entropia criptográfica do sistema operacional (`SecRandomCopyBytes` no iOS e `java.security.SecureRandom` com `/dev/urandom` no Android).
5. **Algoritmos Criptográficos Proibidos:**
   - MD5, SHA-1, DES, 3DES, RC4 e RSA com chaves inferiores a 2048 bits.

---

## 4. MASVS-AUTH: Autenticação Biométrica Robusta

A biometria móvel (Face ID, Touch ID, BiometricPrompt) deve atuar como uma chave de desbloqueio para credenciais protegidas no hardware criptográfico, nunca como um mero "booleano de tela".

- **Padrão Errado (Inseguro):** A tela pergunta à API do sistema se o Face ID foi reconhecido; se retornar `true`, a UI navega para a tela interna sem validar tokens. *(Facilmente burlado por hooking de funções via Frida).*
- **Padrão Correto (Criptográfico):** O token secreto é armazenado no Keychain/Keystore protegido pela flag `UserPresence` / `BiometryCurrentSet`. O hardware só libera a chave privada ou descriptografa o token se a autenticação biométrica for bem-sucedida no sensor físico. Se a biometria for alterada no sistema (novo dedo ou face cadastrada), a chave é invalidada automaticamente.

---

## 5. MASVS-NETWORK: Comunicação em Trânsito e SSL Pinning

1. **App Transport Security (ATS) & Network Security Config:**
   - No iOS, `NSAppTransportSecurity` deve bloquear conexões HTTP em texto puro (`NSAllowsArbitraryLoads = false`).
   - No Android, `res/xml/network_security_config.xml` deve proibir tráfego em texto puro (`cleartextTrafficPermitted="false"`).
2. **Certificate Pinning (SSL Pinning):**
   - Para fluxos altamente sensíveis (bancários e transacionais), vincule o aplicativo à chave pública do certificado (*Public Key Pinning*). Isso impede interceptações por certificados maliciosos instalados em dispositivos rooteados.
   - Sempre configure certificados de contingência (*backup pins*) para evitar indisponibilidade do app durante rotações programadas de certificado de servidor.
3. **Certificate Transparency (CT):**
   - Como defesa complementar ao pinning clássico, utilize validação de Certificate Transparency para auditar que o certificado TLS foi registrado publicamente em logs de transparência imutáveis mantidos por consórcios de segurança.

---

## 6. MASVS-PLATFORM: Fronteiras de Entrada, IPC e Deep Links

Qualquer evento externo vindo do sistema operacional deve ser tratado como entrada potencialmente maliciosa:
1. **Universal Links (iOS) e App Links (Android):**
   - Prefira sempre Universal Links e App Links vinculados a domínios verificados criptograficamente via arquivos de associação (`apple-app-site-association` e `.well-known/assetlinks.json`).
   - Evite URL schemes customizados (`app://`), pois qualquer aplicativo instalado no aparelho pode registrar o mesmo esquema e interceptar parâmetros confidenciais.
2. **WebViews Seguras:**
   - Desative suporte a arquivos locais em WebViews (`allowFileAccess = false`).
   - Desative interfaces JavaScript desnecessárias (`javaScriptEnabled = false` se a página for apenas leitura).
   - Bloqueie navegação para domínios externos não homologados via interceptação de URLs (`shouldOverrideUrlLoading`).
3. **Isolamento de Componentes Android (IPC):**
   - Não exporte Activities, Services ou Broadcast Receivers sem necessidade (`android:exported="false"`).
   - Componentes exportados devem exigir permissões de assinatura personalizadas (`android:protectionLevel="signature"`).

---

## 7. MASVS-CODE: Integridade, Minificação e Ofuscação de Binários

O código cliente compilado não deve fornecer informações arquiteturais que facilitem engenharia reversa automatizada:

1. **Minificação e Ofuscação com R8 / ProGuard (Android):**
   - Ative `isMinifyEnabled = true` e `isShrinkResources = true` em todos os builds de release.
   - Configure dicionários de ofuscação para renomear pacotes, classes, métodos e campos para identificadores de um único caractere sem significado semântico.
2. **Remoção de Símbolos Nativos (Symbol Stripping):**
   - Em bibliotecas compiladas C/C++ (`.so` / `.dylib`), aplique stripping de símbolos para remover tabelas de exportação de funções de negócio.
3. **Limpeza Radical de Logs em Release:**
   - O compilador deve descartar chamadas de log em tempo de compilação. No ProGuard/R8, aplique `-assumenosideeffects class android.util.Log { *; }`. No iOS, certifique-se de que `NSLog` e `print` não emitam dados sensíveis em esquemas de Release.
4. **Atestação de Integridade do Aplicativo:**
   - Implemente **Google Play Integrity API** no Android e **App Attest / DeviceCheck** no iOS para verificar se o aplicativo em execução é o binário autêntico distribuído pela loja oficial, e não um binário modificado ou recompilado com bibliotecas injetadas.

---

## 8. MASVS-RESILIENCE: Defesa Ativa Contra Adulteração e Debugging

Para aplicações corporativas que processam pagamentos, identidades ou dados médicos regulados, o app deve incorporar mecanismos defensivos ativos em tempo de execução:

1. **Detecção Multicamadas de Root / Jailbreak:**
   - **Android:** Verifique a presença de binários `su` em diretórios de sistema (`/system/bin/su`, `/system/xbin/su`), chaves de compilação de teste do kernel (`test-keys`), presença de instaladores de modificação (Magisk, KernelSU, APatch) e permissões de escrita na partição `/system`.
   - **iOS:** Inspecione caminhos comuns de pacotes de jailbreak (`/Applications/Cydia.app`, `/Library/MobileSubstrate/`), tente gravar em `/private` fora do sandbox do app e verifique a resolução de URL schemes conhecidos (`cydia://`, `sileo://`).
2. **Detecção de Depuradores e Ptrace:**
   - Impeça a anexação de depuradores dinâmicos via `ptrace(PT_DENY_ATTACH, 0, 0, 0)` no iOS e inspecione o campo `TracerPid` no arquivo `/proc/self/status` no Android. Se `TracerPid != 0`, um processo externo está depurando o aplicativo.
3. **Detecção de Frameworks de Hooking Dinâmico (Frida / Xposed):**
   - Monitore portas de rede padrão utilizadas por servidores Frida (ex.: porta TCP 27042).
   - Inspecione a tabela de bibliotecas carregadas em `/proc/self/maps` procurando por referências a `frida-agent.so`, `substrate.so` ou módulos Xposed.
   - Realize checagens de integridade de código em memória para identificar modificações nos primeiros bytes de funções críticas de criptografia (*trampoline hooks*).
4. **Estratégia de Reação Proporcional:**
   - Quando um ambiente comprometido for detectado, evite alertas espalhafatosos que orientem o invasor sobre como contornar o teste. Limpe imediatamente as credenciais locais, encerre a sessão no servidor via token revogado e finalize o aplicativo graciosamente.

---

## 9. Checklist de Segurança Defensiva Mobile

- [ ] **MASVS-STORAGE:** Tokens, chaves e credenciais residem exclusivamente no Keychain (iOS) ou Keystore/MasterKey (Android) com flags de restrição física?
- [ ] **MASVS-CRYPTO:** Todos os algoritmos criptográficos em repouso utilizam AES-256-GCM com vetores de inicialização aleatórios e chaves derivadas via KDF robusto?
- [ ] **MASVS-AUTH:** A biometria opera como gate criptográfico do hardware, invalidando chaves caso novas biometrias sejam cadastradas no SO?
- [ ] **MASVS-NETWORK:** Tráfego em texto puro (HTTP) está bloqueado nas políticas de rede do app, com SSL Pinning e backup pins em fluxos críticos?
- [ ] **MASVS-PLATFORM:** Universal Links / App Links são validados criptograficamente, e componentes IPC não essenciais estão com `exported="false"`?
- [ ] **MASVS-CODE:** R8/ProGuard está ativado em release com stripping de símbolos nativos, e todos os logs foram podados em compilação?
- [ ] **MASVS-RESILIENCE:** O aplicativo possui defesas ativas contra Root, Jailbreak, depuradores em execução e injeção dinâmica via Frida?
