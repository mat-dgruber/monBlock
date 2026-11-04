# 🧪 Padrões de Escrita de Testes Mobile

> **Fonte Normativa:** `guides/testing/mobile/test-writing-standards.md`  
> **Padrão Obrigatório:** Pirâmide de Testes Mobile & Convenção AAA (*Arrange, Act, Assert*)

---

## 1. O Padrão AAA (Arrange, Act, Assert)

Todo teste automatizado mobile deve estruturar-se em 3 blocos visuais e conceituais distintos:

1. **Arrange (Preparação):** Configuração do estado inicial, instanciação de Fakes/Mocks em memória e dados determinísticos.
2. **Act (Ação / Execução):** Disparo do evento do usuário, chamada do método do ViewModel ou clique no botão do widget.
3. **Assert (Verificação):** Validação de que a saída esperada ocorreu (estado da tela alterado, evento persistido no banco local ou navegação acionada).

---

## 2. Testes Unitários de Camada de Apresentação e Domínio

Testes unitários móveis não inicializam emuladores e executam em milissegundos na JVM ou runtime local.

### 2.1 Kotlin / Android (JUnit 5 + Coroutines Test)

```kotlin
@OptIn(ExperimentalCoroutinesApi::class)
class TaskViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val fakeRepository = FakeTaskRepository()
    private lateinit var viewModel: TaskViewModel

    @BeforeEach
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        viewModel = TaskViewModel(repository = fakeRepository)
    }

    @AfterEach
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `quando carregar tarefas com sucesso, deve emitir estado Success com a lista`() = runTest(testDispatcher) {
        // Arrange
        val expectedTasks = listOf(Task(id = "1", title = "Estudar Mobile"))
        fakeRepository.emitTasks(expectedTasks)

        // Act
        viewModel.loadTasks()
        testScheduler.advanceUntilIdle()

        // Assert
        val currentState = viewModel.uiState.value
        assertTrue(currentState is TaskUiState.Success)
        assertEquals(expectedTasks, (currentState as TaskUiState.Success).data)
    }
}
```

### 2.2 React Native / TypeScript (Vitest / Jest + RNTL)

```typescript
import { renderHook, act } from '@testing-library/react-native';
import { useTaskStore } from '../stores/taskStore';
import { FakeTaskRepository } from '../repositories/fakeTaskRepository';

describe('TaskStore', () => {
  it('deve adicionar uma nova tarefa com status pendente de sincronizacao', async () => {
    // Arrange
    const fakeRepo = new FakeTaskRepository();
    const { result } = renderHook(() => useTaskStore(fakeRepo));

    // Act
    await act(async () => {
      await result.current.addTask('Finalizar Relatório');
    });

    // Assert
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe('Finalizar Relatório');
    expect(result.current.tasks[0].syncStatus).toBe('PENDING_SYNC');
  });
});
```

### 2.3 Swift / iOS (Swift Testing Framework / XCTest)

```swift
import Testing
@testable import AppEnterprise

@Suite("Suíte de Testes do TaskListViewModel")
struct TaskListViewModelTests {

    @Test("Quando o repositório retornar tarefas, o estado deve ser Success com a contagem correta")
    func loadTasksSuccess() async throws {
        // Arrange
        let fakeRepo = FakeTaskRepository(initialTasks: [
            Task(id: UUID(), title: "Implementar Swift Testing", isCompleted: false)
        ])
        let viewModel = await TaskListViewModel(repository: fakeRepo)

        // Act
        await viewModel.loadTasks()

        // Assert
        #expect(viewModel.tasks.count == 1)
        #expect(viewModel.tasks.first?.title == "Implementar Swift Testing")
        #expect(viewModel.errorMessage == nil)
    }

    @Test("Quando a chamada falhar com erro de rede, deve expor a mensagem de erro amigável")
    func loadTasksFailure() async {
        // Arrange
        let fakeRepo = FakeTaskRepository(shouldThrowError: true)
        let viewModel = await TaskListViewModel(repository: fakeRepo)

        // Act
        await viewModel.loadTasks()

        // Assert
        #expect(viewModel.tasks.isEmpty)
        #expect(viewModel.errorMessage == "Falha na conexão com o servidor")
    }
}
```

---

## 3. Testes de Telas e Widgets (Component Tests)

Testam a renderização da interface e interação visual sem depender de backend real.

### 3.1 Flutter Widget Testing (`testWidgets`)

```dart
void main() {
  testWidgets('deve exibir mensagem de erro e botao de tentar novamente quando status for Error', (tester) async {
    // Arrange
    final errorState = TaskUiState.error(message: 'Falha de conexão');

    // Act
    await tester.pumpWidget(
      MaterialApp(
        home: TaskScreenView(state: errorState, onRetry: () {}),
      ),
    );

    // Assert
    expect(find.text('Falha de conexão'), findsOneWidget);
    expect(find.byType(ElevatedButton), findsOneWidget);
    expect(find.text('Tentar Novamente'), findsOneWidget);
  });
}
```

---

## 4. Testes E2E com Maestro (Dispositivos Reais & Emuladores)

O **Maestro** é o padrão canônico para testes E2E móveis multiplataforma, operando via fluxos declarativos em YAML com tolerância integrada a latências de rede e animações:

```yaml
# .maestro/login_and_checkout_flow.yaml
appId: com.cpb.enterprise.app
---
- launchApp:
    clearState: true

- assertVisible: "Bem-vindo"

- tapOn: "E-mail"
- inputText: "usuario@cpb.com.br"

- tapOn: "Senha"
- inputText: "SenhaSegura123!"

- tapOn: "Entrar"

- assertVisible: "Catálogo de Produtos"
- tapOn:
    text: "Comprar"
    index: 0

- tapOn: "Ir para o Carrinho"
- assertVisible: "Total: R$ 49,90"

- tapOn: "Finalizar Compra"
- assertVisible: "Pedido Confirmado com Sucesso"
```

---

## 5. Diretrizes Inegociáveis de Testes Mobile

1. **Nunca use `Thread.sleep()`:** Em testes assíncronos, utilize controladores de tempo determinísticos (`advanceUntilIdle`, `pumpAndSettle`, `waitFor`).
2. **Isole chamadas de rede externas:** Utilize servidores locais em memória (`MockWebServer`) ou repositórios falsos (*Fakes*). Testes não devem falhar por instabilidade de internet no ambiente de CI.
3. **Zere a duração de animações em testes de UI:** Desative animações do sistema operacional no emulador de CI para acelerar a execução e eliminar flakiness.
