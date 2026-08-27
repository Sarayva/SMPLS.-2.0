# CLAUDE.md — SMPLS.

Memória permanente do projeto. Leia este arquivo inteiro antes de continuar o desenvolvimento. Ele documenta tudo que foi decidido e construído até agora, para que qualquer sessão futura (ou após compactação de contexto) retome exatamente de onde paramos, sem repetir perguntas já respondidas ou desfazer decisões já tomadas.

**Data da última atualização deste arquivo:** 2026-08-27 (documentação criada a pedido explícito do usuário, antes de qualquer mudança de código/design ser aplicada).

---

## 1. Objetivo e propósito do projeto

O usuário (nome no Firebase/dados de teste sugere "Mellissa"; a conta Google/Firebase Console usada para criar o projeto mostrou "Gabriel" — possivelmente um casal/família usando o app junto, daí o requisito de "renda de quem") quer um app de **gestão financeira pessoal** chamado **SMPLS.** (o ponto final faz parte do nome/marca).

O projeto foi dividido pelo próprio usuário em partes:
- **Parte 1** — Contas fixas (água, luz, internet, gás, financiamento etc., **não** relacionadas a fatura de cartão). ✅ Concluída.
- **Parte 2** — Fatura de cartão de crédito. O usuário rejeitou explicitamente cadastro manual de parcelas ("não acho seguro, as informações devem ser exatas") e pediu **importação automática via PDF da fatura**. ✅ Concluída (Nubank).
- **Parte 3** (mencionada, não iniciada) — possivelmente outros bancos (Itaú foi cogitado) e/ou funcionalidades mais avançadas descritas em um whitepaper antigo (ver seção 15).

Depois da Parte 2, o usuário pediu uma lista adicional de funcionalidades (ver seção 3) que foi tratada como uma extensão da Parte 2, construída **uma tela por vez**.

Atualmente (momento desta documentação) o projeto está numa **pausa deliberada**: o usuário quer mudar a identidade visual do app e pediu para eu documentar tudo antes de mexer em qualquer código.

---

## 2. Visão geral da aplicação

SPA multi-página (cada tela é um `.html` próprio servido pelo Vite, não um router client-side) escrita em **Vanilla JS (ES Modules)**, sem framework (nem React, nem Vue), com **Firebase** (Authentication + Firestore) como backend. Roda 100% no navegador — não existe servidor próprio, backend customizado ou API própria.

Local do projeto: `C:\Users\Usuario\Desktop\smpls` (pasta reaproveitada — já continha assets visuais soltos antes de virar o projeto: `1.jpg`, `2.jpg`, dois `.zip` de background vetorial; mantidos, não usados no código ainda).

Repositório git: **local apenas**, inicializado nesta pasta (`git init` feito por mim). Usuário decidiu explicitamente **não** criar/conectar repositório remoto no GitHub por enquanto ("deixar só local por enquanto"). 6 commits feitos até agora (ver seção 20).

Telas existentes (todas atrás de autenticação, cada uma um `.html` na raiz + um módulo em `src/pages/`):

| Tela | Arquivo HTML | Módulo JS |
|---|---|---|
| Login/Cadastro | `login.html` | `src/pages/Login.js` |
| Contas fixas (Dashboard) | `index.html` | `src/pages/Dashboard.js` |
| Importar fatura | `fatura.html` | `src/pages/ImportarFatura.js` |
| Parcelamentos | `parcelamentos.html` | `src/pages/Parcelamentos.js` |
| Renda | `renda.html` | `src/pages/Renda.js` |
| Resumo do mês | `resumo.html` | `src/pages/Resumo.js` |
| Análises | `analises.html` | `src/pages/Analises.js` |

Todas as telas (exceto login) têm uma barra de navegação no topo com ícones de emoji linkando pras outras: 🏠 Contas fixas · 💳 Fatura · 📊 Parcelamentos · 💰 Renda · 🧮 Resumo · 📈 Análises · 🌙/☀️ alternar tema · ⏻ sair (só no Dashboard).

---

## 3. Funcionalidades já definidas (pedido original do usuário, literal)

Depois da Parte 2 (importação de fatura) funcionar, o usuário pediu, em uma única mensagem, tudo isto (preservando a essência do pedido original):

> "quando eu faço isso de importar, preciso que fique salvo as parcelas, para que eu acompanhe, e ai preciso tanbm, que o valor da fatura do cartao seja unido com as contas fixas do mes, que eu coloco manualmente, preciso ter um campo para colocar minha renda, e que seja feito os calculos de total devido naquele mes, e para colocar meu dinheiro tem que ter a opção de um unico salario ou mais de um, e poder definir de quem eh a grana, preciso saber quanto sera liberado do meu limite naquele mes, referetne as contas parceladas, e essa info de contas parceladas trazidas pela fatura, deve fica salva no meu usuario, e no proximo mes quando eu subir a proxima, as parcelas devem ser atualizadas, preciso poder deficar as minhas categorias, entao me sugira uma lista para compras no cartao e contas fixas, para que seja gerado um grafico e eu consiga analisar os meus gasttos... a cada mes, eu preciso ter um comparativo, desde que eu tenha dados anteriores que possam ser comparados... essa parte do cartao deve ser feita aparte da tela de contas, no sentido de que alteraç̧oes feitas nessa tela n atrapalhem a tela de contas fixas da casa"

Isso foi quebrado, com a concordância do usuário, na seguinte ordem de construção (uma tela por vez): **Parcelamentos → Renda → Resumo → Categorias → Análises**. Todas as 5 etapas foram concluídas.

**Correção importante feita no meio do caminho:** o usuário inicialmente pediu "poder definir minhas categorias" e eu entendi errado como uma tela dedicada de gestão de categorias (`categorias.html`, cheguei a construí-la). O usuário corrigiu: ele queria poder decidir a categoria **no momento de uso** (ao importar fatura, ao cadastrar conta fixa), **não** uma tela separada. A tela `categorias.html` foi **removida** e substituída por categorização embutida nos formulários existentes (ver seção 15, decisão registrada).

---

## 4. Funcionalidades já implementadas

### 4.1 Autenticação (`login.html` / `src/pages/Login.js`)
- Login e cadastro (abas) via Firebase Authentication, e-mail/senha.
- Cadastro pede nome (salvo como `displayName` no Firebase Auth), e-mail, senha, confirmação de senha (mínimo 6 caracteres, exigido pelo Firebase).
- Botão de mostrar/ocultar senha.
- Mensagens de erro traduzidas para PT-BR (e-mail já cadastrado, senha fraca, credenciais erradas, muitas tentativas).
- Alternância de tema claro/escuro.
- Redireciona para `index.html` se já autenticado.

### 4.2 Contas fixas (`index.html` / `src/pages/Dashboard.js` + `src/components/ContaModal.js` + `src/services/contasService.js`)
- CRUD de contas fixas: nome, categoria (texto livre com sugestões — ver seção 14), valor, dia de vencimento, observações.
- **Valor fixo ou variável**: checkbox "O valor muda todo mês" — quando marcado, a conta não tem valor de criação; cada mês o valor é perguntado (via `prompt()`) no momento de marcar como paga, e fica salvo em `pagamentos[mes].valorPago`.
- Navegação por mês (setas + `<input type="month">`).
- Status calculado por conta/mês: `pago` / `pendente` / `atrasado` (atrasado = mês já passou, ou é o mês atual e o dia de vencimento já passou, e não está pago).
- Resumo do mês: Total, Pago, Pendente, Atrasado.
- Marcar/desmarcar como paga (clique no círculo ao lado do nome).
- Editar/excluir conta (clique no nome abre modal; excluir tem confirmação, some com o histórico de pagamentos junto).
- Categoria nova digitada no formulário é salva automaticamente como sugestão futura (ver seção 15).

### 4.3 Importar fatura (`fatura.html` / `src/pages/ImportarFatura.js` + `src/services/pdfService.js` + `src/parsers/nubank.js` + `src/services/categorizacaoService.js`)
- Upload de PDF (clique ou arrastar), **parse 100% no navegador** (pdf.js), nada é enviado a servidor algum.
- Suporta hoje **só faturas do Nubank**. Detecção de banco via `pareceSerFaturaNubank()` (procura "Nu Pagamentos" / "Nubank" no texto extraído).
- Extrai: valor total, vencimento, competência (derivada do vencimento, formato `YYYY-MM`), limite total, limite utilizado, pagamento mínimo, e a lista de transações (data, descrição, valor, parcela atual/total se houver, categoria auto-sugerida).
- Ignora automaticamente linhas de "Pagamento em ..." e de encargos/juros/multa/IOF/rotativo (não entram como transações/compras).
- **Prévia obrigatória antes de salvar**: mostra cards de resumo + tabela de transações; usuário pode reatribuir a categoria de qualquer transação digitando (campo com sugestões, aceita categoria nova) antes de confirmar.
- Botão "Confirmar e salvar": só então grava no Firestore (`faturas`) e mescla parcelas (`parcelamentos`, via `mesclarParcelas`) e categorias novas usadas.
- Erros tratados com mensagem amigável (PDF que não é do Nubank, PDF que não parece fatura, erro de leitura).

### 4.4 Parcelamentos (`parcelamentos.html` / `src/pages/Parcelamentos.js` + `src/services/parcelamentosService.js`)
- Lista de compras parceladas, persistidas e **atualizadas automaticamente a cada nova fatura importada** (não recriadas do zero).
- Separadas em **Ativos** (ordenados por mês de quitação estimado) e **Quitados**.
- Cada item: nome, categoria (badge clicável — vira campo editável na hora, com sugestões, aceita categoria nova), parcela atual/total, barra de progresso, valor da parcela, saldo devedor restante, mês estimado de quitação.
- **Detecção e correção de duplicatas legadas**: um bug anterior (ver seção 16) fazia a mesma compra aparecer em duas linhas quando o valor da parcela variava por arredondamento entre faturas. A tela detecta automaticamente grupos duplicados (mesma descrição + mesmo total de parcelas) e mostra um aviso com botão "Corrigir" — **exige confirmação explícita do usuário antes de apagar/mesclar qualquer dado real**.

### 4.5 Renda (`renda.html` / `src/pages/Renda.js` + `src/components/RendaModal.js` + `src/services/rendaService.js`)
- Cadastro de fontes de renda: nome, **"de quem é"** (rótulo de texto livre, ex: "Mellissa", "Gabriel" — **não** é um sistema de múltiplos logins, é só uma etiqueta dentro da mesma conta, confirmado explicitamente pelo usuário), valor mensal.
- Lista agrupada por dono, com subtotal por pessoa e total geral no topo.
- Editar (clique no item) / excluir.

### 4.6 Resumo do mês (`resumo.html` / `src/pages/Resumo.js`)
- Tela **só leitura**, junta dados de `contasService`, `faturasService`, `parcelamentosService`, `rendaService` — não modifica nada dessas outras telas.
- Navegação por mês.
- Mostra: Renda total, Contas fixas do mês, Fatura do cartão do mês, **Total devido** (contas fixas + fatura), **Saldo do mês** (renda − total devido, verde/vermelho), e **limite do cartão que libera naquele mês** (soma das parcelas cujo `mesQuitacaoEstimado` bate com o mês selecionado).

### 4.7 Categorização (embutida, não é uma tela própria)
- `src/services/categoriasService.js`: gerencia duas listas por usuário — categorias de "contas" e de "cartao" — cada uma semeada automaticamente com uma lista padrão sugerida na primeira vez que o usuário usa o app (`garantirCategoriasPadrao`, controlado por um doc `config/categorias` com `inicializado: true` pra nunca re-semear).
- Categorias padrão sugeridas:
  - **Contas fixas**: Aluguel/Financiamento, Condomínio, IPTU, Energia, Água, Gás, Internet, Celular, Streaming, Plano de saúde, Academia, Seguro, Educação, Outros.
  - **Cartão**: Alimentação, Combustível, Transporte, Mercado, Assinaturas, Saúde & Bem-estar, Compras Online, Outros.
- Categoria nova digitada em qualquer lugar (modal de conta fixa, prévia de fatura, badge de parcelamento) é automaticamente adicionada à lista da próxima vez.
- `src/services/categorizacaoService.js`: categorização automática **sugerida** por palavra-chave na descrição da transação importada (ex: "ifood" → Alimentação), só usada como valor inicial — o usuário pode sempre trocar.

### 4.8 Análises (`analises.html` / `src/pages/Analises.js` + `src/services/analisesService.js`)
- Tela só leitura, cruza `contasService` + `faturasService`.
- Gráfico de barras simples (HTML/CSS puro, **sem biblioteca de gráficos externa**) com o total gasto (contas fixas + fatura) nos últimos 6 meses corridos (a partir do mês atual).
- Comparativo por categoria entre o mês mais recente com dado e o anterior: valor atual vs anterior, variação percentual com seta ▲/▼ colorida (vermelho = subiu, verde = desceu), badge "Novo" para categoria que só apareceu agora.
- Se houver menos de 2 meses com dado, mostra aviso ("ainda não há dados de meses anteriores suficientes") em vez de comparativo vazio/enganoso.

### 4.9 Tema claro/escuro (`src/services/themeService.js`)
- Aplicado via atributo `data-theme` no `<html>`, persistido em `localStorage` (chave `smpls_theme`), com fallback pra preferência do sistema (`prefers-color-scheme`) na primeira visita.
- Presente em todas as telas via botão ☀️/🌙 no topo.

---

## 5. Funcionalidades planejadas (ainda não construídas)

- **Redesenho visual completo**, usando como base o documento `SMPLS_Identidade_Visual_e_Proposta(1).docx` (em `C:\Users\Usuario\Desktop\`). Analisado e aprovado pelo usuário como direção ("acho que é o estilo que eu queria mesmo"), mas **nenhuma mudança de código foi aplicada ainda** — está pausado aguardando a autorização que o usuário disse que daria depois desta documentação. Detalhes completos na seção 14.
- Suporte a outros bancos além do Nubank no importador de fatura (Itaú foi mencionado como possibilidade, mas **não há parser Itaú construído neste projeto** — existe um parser Itaú de 21 linhas em `Desktop/analise fatura/parsers/itau.js`, de um projeto anterior não relacionado, nunca portado nem analisado a fundo).
- Qualquer elemento do "whitepaper" antigo (`Desktop/smpls_documentation.md`) — leitura de PDF com parsers multi-banco (parcialmente já temos, só Nubank), GridStack.js (widgets arrastáveis), ApexCharts, Firebase App Check + reCAPTCHA, cache-first localStorage — **tudo isso foi explicitamente adiado**, não é escopo atual.

---

## 6. Regras de negócio

- **Conta fixa**: `valor` fixo definido na criação, OU `valorVariavel: true` com `valor: null` — nesse caso o valor de cada mês é perguntado ao marcar como paga e fica em `pagamentos["YYYY-MM"].valorPago`.
- **Status de conta fixa** (`statusConta` em `contasService.js`): `pago` se `pagamentos[mes].pago === true`; senão `atrasado` se o mês já passou ou (é o mês atual e `diaVencimento` já passou); senão `pendente`.
- **Competência de fatura**: derivada do dia de vencimento (`vencimento.slice(0,7)`), não do texto "fatura de agosto" (mais confiável).
- **Data de transação de fatura**: o Nubank lista transações sem ano; o ano é inferido a partir do ano de vencimento, com heurística de virada de ano (se o mês da transação for mais de 1 mês à frente do mês de vencimento, assume ano anterior) — em `src/parsers/nubank.js`, função `dataTransacaoISO`.
- **Parcelamento — chave de mesclagem** (regra corrigida após bug real, ver seção 16): duas transações parceladas são consideradas "a mesma compra" se tiverem a **mesma descrição normalizada (minúsculo, sem espaço nas pontas) + o mesmo total de parcelas**. **NUNCA usar o valor da parcela na chave de mesclagem** — o Nubank arredonda valores de parcela de forma diferente entre faturas de meses diferentes para a mesma compra (ex: R$ 62,68 numa fatura, R$ 62,66 noutra).
- **Mês de quitação estimado de um parcelamento**: `competência_da_fatura_atual + (parcelaTotal - parcelaAtual)` meses.
- **Limite liberado num mês** (tela Resumo): soma de `valorParcela` de todos os parcelamentos cujo `mesQuitacaoEstimado` é igual ao mês selecionado.
- **Total devido de um mês** (tela Resumo): total de contas fixas daquele mês + valor total de fatura(s) com aquela `competencia`.
- **Categorização automática de transação de fatura**: por palavra-chave na descrição (`categorizacaoService.js`), só como sugestão inicial editável.
- **Toda categoria nova usada** (em qualquer formulário) é persistida automaticamente na lista de sugestões daquele tipo (`contas` ou `cartao`) — não existe uma ação separada de "criar categoria".
- **Transações de fatura ignoradas na importação**: linhas cuja descrição contenha "pagamento em"/"pagamento recebido" (pagamento da própria fatura) ou "rotativo"/"juros"/"multa"/"iof"/"encargos"/"saldo restante"/"encerramento de d" (encargos) — não entram como compras.
- **Renda "dono"**: campo de texto livre, só rótulo visual/organizacional. Confirmado explicitamente: **não** é multi-usuário/multi-login — é uma conta só (a do usuário), com rendas rotuladas.

---

## 7. Estrutura e arquitetura do projeto

```
Desktop/smpls/
├── CLAUDE.md                    # este arquivo
├── index.html                   # Contas fixas (protegida por auth)
├── login.html                   # Login/cadastro
├── fatura.html                  # Importar fatura
├── parcelamentos.html           # Parcelamentos
├── renda.html                   # Renda
├── resumo.html                  # Resumo do mês
├── analises.html                # Análises
├── package.json / package-lock.json
├── vite.config.js               # multi-page build (rollupOptions.input com todas as .html acima)
├── .env                         # credenciais Firebase reais (gitignored)
├── .env.example                 # placeholders documentando as chaves
├── .gitignore                   # node_modules, dist, .env
├── firestore.rules              # regra: cada usuário só lê/escreve seus próprios dados
├── 1.jpg, 2.jpg, *.zip           # assets visuais pré-existentes na pasta, não usados no código ainda
└── src/
    ├── firebase/
    │   ├── config.js             # initializeApp, initializeFirestore com persistentLocalCache
    │   ├── auth.js                # signUp, signIn, signOut, onAuthChange
    │   └── firestore.js           # re-exporta funções do Firestore + db (ponto único de import)
    ├── pages/                     # um módulo por tela, cada um é o entry point do seu .html
    │   ├── Login.js
    │   ├── Dashboard.js
    │   ├── ImportarFatura.js
    │   ├── Parcelamentos.js
    │   ├── Renda.js
    │   ├── Resumo.js
    │   └── Analises.js
    ├── components/                # elementos de UI reutilizáveis (modais)
    │   ├── ContaModal.js
    │   └── RendaModal.js
    ├── parsers/
    │   └── nubank.js               # parseNubank(linhas, categorizar), pareceSerFaturaNubank(linhas)
    ├── services/                   # lógica de negócio + acesso a dados (Firestore), sem DOM
    │   ├── contasService.js
    │   ├── faturasService.js
    │   ├── parcelamentosService.js
    │   ├── rendaService.js
    │   ├── categoriasService.js
    │   ├── categorizacaoService.js
    │   ├── analisesService.js
    │   ├── pdfService.js           # extrairLinhas(arquivo) via pdf.js
    │   ├── securityService.js      # escapeHTML
    │   └── themeService.js
    └── styles/                     # um .css por tela/componente + global.css com os tokens
        ├── global.css              # variáveis de cor (tema claro/escuro), .elevated-card, botões, inputs
        ├── login.css, dashboard.css, fatura.css, parcelamentos.css, renda.css, resumo.css, analises.css, modal.css
```

**Padrão arquitetural**: `pages/*.js` orquestram (montam HTML via template strings, ligam eventos, chamam `services/`); `services/*.js` são a única camada que fala com o Firestore (nenhuma página importa `firebase/firestore.js` diretamente); `components/*.js` são pop-ups/modais reutilizados entre páginas; `parsers/*.js` são puros (recebem texto/linhas, devolvem dados estruturados, sem I/O).

---

## 8. Tecnologias, frameworks, bibliotecas e versões

- **Vite** `^5.4.0` — build tool e dev server. Multi-page via `rollupOptions.input` no `vite.config.js` (uma entrada por `.html`).
- **Firebase** `^10.12.2` — `firebase/app`, `firebase/auth`, `firebase/firestore`.
  - Firestore inicializado com `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` — **não** é o `getFirestore()` padrão (decisão importante, ver seção 15/16).
- **pdfjs-dist** `^6.2.108` — parsing de PDF 100% client-side. Worker resolvido localmente via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href` (não usa CDN).
- **Sem framework de UI** (nada de React/Vue/Svelte) — DOM manipulado diretamente via template strings + `innerHTML` + `escapeHTML()` em todo dado do usuário.
- **Sem TypeScript.**
- **Sem biblioteca de gráficos** — o gráfico de Análises é HTML/CSS puro (barras via `div` com `height` percentual).
- **Sem CSS framework** (Tailwind, Bootstrap etc.) — CSS próprio por arquivo, com custom properties (`:root`, `[data-theme]`) para tema.
- **node_modules não versionado** (`.gitignore`), `package-lock.json` versionado.

---

## 9. Banco de dados (Firestore) e estrutura dos dados

Sem SQL, sem schema formal — Firestore (NoSQL). Todos os dados do usuário ficam sob `users/{uid}/...`, isolados por `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### `users/{uid}/contasFixas/{contaId}`
```
nome: string
categoria: string
valor: number | null          // null quando valorVariavel = true
valorVariavel: boolean
diaVencimento: number (1-31)
observacoes: string
ativa: boolean
createdAt: ISOString
pagamentos: {
  "2026-08": { pago: true, valorPago: number, dataPagamento: "2026-08-05" }
}
```

### `users/{uid}/faturas/{faturaId}`
```
banco: 'nubank'
vencimento: "2026-08-13"       // ISO
competencia: "2026-08"          // YYYY-MM
valorTotal: number
limiteTotal: number
limiteUtilizado: number
pagamentoMinimo: number
importadoEm: ISOString
transacoes: [
  { data: "2026-07-06", descricao: string, valor: number, parcelaAtual: number|null, parcelaTotal: number|null, categoria: string }
]
```
*(Campos deliberadamente fora do escopo — não extraídos — para não sobrecarregar o parser: fatura anterior, projeção da próxima fatura, saldo em aberto total, tabela de CET/juros.)*

### `users/{uid}/parcelamentos/{parcelamentoId}`
```
banco: 'nubank'
descricao: string
categoria: string
parcelaTotal: number
parcelaAtual: number
valorParcela: number             // valor da parcela mais recente conhecida
valorTotalEstimado: number       // valorParcela * parcelaTotal (aproximado)
primeiraCompetencia: "2026-03"
ultimaCompetencia: "2026-08"
mesQuitacaoEstimado: "2027-02"
quitado: boolean
atualizadoEm: ISOString
```

### `users/{uid}/rendas/{rendaId}`
```
nome: string
dono: string          // rótulo livre, ex: "Mellissa"
valor: number
ativa: boolean
createdAt: ISOString
```

### `users/{uid}/categorias/{categoriaId}`
```
nome: string
tipo: 'contas' | 'cartao'
createdAt: ISOString
```

### `users/{uid}/config/categorias` (documento único, flag de controle)
```
inicializado: boolean       // true depois da primeira semeadura das categorias padrão
```

---

## 10. APIs, integrações e serviços externos

- **Firebase Authentication** — e-mail/senha. Projeto Firebase real: **`smpls-001`** (criado do zero pelo usuário nesta conversa — decisão explícita de **não** reaproveitar o projeto Firebase antigo `smpls-c6a52` de um protótipo anterior).
- **Cloud Firestore** — banco de dados. Mesmo projeto `smpls-001`.
- **pdf.js** (`pdfjs-dist`) — não é bem uma "integração externa" em runtime (roda local no navegador), mas é a peça central da importação de fatura.
- **Nenhuma outra API externa.** Sem backend próprio, sem serverless functions, sem serviço de e-mail, sem analytics, sem Sentry/logging externo.
- Credenciais do Firebase ficam em `.env` (gitignored) seguindo `.env.example`:
  ```
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_STORAGE_BUCKET=
  VITE_FIREBASE_MESSAGING_SENDER_ID=
  VITE_FIREBASE_APP_ID=
  ```
  (Essas chaves do Firebase client são públicas por natureza — não são segredo de servidor —, mas o arquivo é gitignored mesmo assim por padrão de boa prática.)

---

## 11. Autenticação e permissões

- Único mecanismo: **Firebase Authentication, e-mail/senha**. Sem login social (Google/Apple), sem MFA, sem magic link.
- **Modelo é single-user por conta** — cada Firebase Auth user vê só seus próprios dados (via `firestore.rules`). Não existe conceito de conta compartilhada/família com múltiplos logins acessando os mesmos dados — isso foi perguntado explicitamente ao usuário e ele confirmou que **não** quer isso; o campo "dono" da Renda é só um rótulo dentro da mesma conta.
- Toda página protegida (todas exceto `login.html`) usa `onAuthChange(user => { if (!user) redireciona pra login })`.
- **Guarda contra corrida de autenticação**: em `Dashboard.js` e `ImportarFatura.js`, os botões de ação principais ficam `disabled` até o `uid` estar confirmado (ver bug corrigido, seção 16) — evita erro `Cannot read properties of null` se o usuário clicar antes do Firebase confirmar a sessão.
- `document.body.dataset.authReady = 'true'` é setado quando a autenticação resolve — usado como sinal de "pronto" nos testes automatizados (Playwright espera por `body[data-auth-ready="true"]`).

---

## 12. Padrões de código e arquitetura

- **Nomes em português** em todo o código (variáveis, funções, arquivos de serviço) — ex: `salvarConta`, `mesclarParcelas`, `ouvirCategorias`, `formatarMoeda`. Consistente em todo o projeto, deve continuar assim.
- **ES Modules puros**, `import`/`export`, sem bundler de componentes — cada `pages/*.js` é o script de entrada carregado via `<script type="module" src="...">` no `.html` correspondente.
- **Camada de serviço é a única que importa `firebase/firestore.js`** — páginas e componentes nunca chamam Firestore diretamente, sempre via uma função de `services/`.
- **`escapeHTML()`** (de `securityService.js`) é usado em **todo** dado vindo do usuário/Firestore antes de ir para `innerHTML`, para evitar XSS. Padrão a manter sempre que adicionar renderização nova.
- **Padrão de modal**: `abrirModalX(uid, itemOuNull, ...dadosAuxiliares)` cria um `#modal-overlay` no `document.body`, remove no fechar; `fecharModal()` local a cada componente. Ver `ContaModal.js` e `RendaModal.js`.
- **Padrão de listener em tempo real**: `ouvirX(uid, callback)` retorna a função de unsubscribe do `onSnapshot`; páginas guardam isso numa variável (`pararDeOuvir`) e chamam antes de re-inscrever, para não vazar listeners.
- **Padrão de "categoria editável inline"**: um `<input list="...">` com `<datalist>` de sugestões, aceita digitar valor novo livremente; ao salvar, se o valor não estiver na lista conhecida (comparação case-insensitive), a categoria nova é persistida via `adicionarCategoria`. Esse é o padrão preferido do usuário — **não** criar telas de gestão/CRUD separadas para esse tipo de dado auxiliar (ver decisão na seção 15).
- **Padrão de "botão desabilitado até estado assíncrono resolver"**: usado sempre que uma ação depende de `uid` e/ou dados carregados de Firestore que ainaind não chegaram — evita bugs de corrida (ver seção 16).
- **Testes**: não há testes automatizados dentro do repositório do projeto. Toda a verificação foi feita via scripts Playwright **fora do projeto**, na pasta de scratchpad da sessão (`C:\Users\Usuario\AppData\Local\Temp\claude\...\scratchpad\pw-test\`) — não fazem parte do código versionado. Ver seção 20 para como replicar.

---

## 13. Padrões visuais/UI/UX definidos

- **Tema claro/escuro** obrigatório em toda tela nova, via `initTheme()` + `toggleTheme()` de `themeService.js`, e um botão ☀️/🌙 no topo.
- **"Elevated card"**: classe `.elevated-card` (fundo semitransparente + blur + sombra suave) é o container visual padrão de qualquer bloco de conteúdo — cards de resumo, itens de lista, modais.
- **Navegação por mês**: componente reaproveitado em várias telas (Dashboard, Resumo) — setas ← → + `<input type="month">`, todas seguindo o mesmo HTML/CSS (`.month-nav`).
- **Barra de navegação superior (`.topbar`)**: título + subtítulo à esquerda, ícones de emoji circulares (`.icon-btn`) à direita linkando pras outras telas + tema. Foi crescendo incrementalmente conforme novas telas foram criadas — **sempre que uma tela nova for criada, adicionar seu ícone de navegação em todas as telas existentes**, e vice-versa.
- **Modais**: overlay escurecido com blur, card centralizado, cabeçalho com título + botão fechar (×), formulário, área de erro (`.form-error`), ações no rodapé (excluir à esquerda se for edição, cancelar/salvar à direita).
- **Preferência explícita do usuário**: dados auxiliares simples (categorias) devem ser editáveis **no contexto de uso**, não em telas de administração separadas. Extrapolar esse princípio para decisões de design futuras similares.
- **Preferência explícita do usuário sobre processo**: construir **uma tela por vez**, testar, reportar, e só então seguir pra próxima — nunca empacotar várias telas numa entrega só (ver seção 15).
- **Mudanças em uma tela não podem quebrar as outras** — princípio explícito do usuário, reforçado com testes de regressão completos (todas as telas relevantes) toda vez que um arquivo compartilhado (`contasService.js`, `firebase/config.js` etc.) era alterado.

---

## 14. Cores, tipografia e identidade visual

### 14.1 Estado atual do código (implementado, em uso agora)

`src/styles/global.css`:
```css
:root {
  --primary: #4f6df5;
  --primary-hover: #3d5adf;
  --success: #16a34a;
  --success-bg: rgba(22, 163, 74, 0.12);
  --danger: #dc2626;
  --danger-bg: rgba(220, 38, 38, 0.1);
  --attention: #d97706;
  --attention-bg: rgba(217, 119, 6, 0.12);
  --radius: 14px;
  --shadow-sm: 0 4px 20px rgba(0, 0, 0, 0.06);
}
[data-theme='light'] {
  --bg-main: #f2f3f7;
  --bg-card: rgba(255, 255, 255, 0.75);
  --bg-card-sec: rgba(0, 0, 0, 0.04);
  --text-main: #14161a;
  --text-sec: #6b7280;
  --border-color: rgba(0, 0, 0, 0.08);
}
[data-theme='dark'] {
  --bg-main: #0e0f13;
  --bg-card: rgba(255, 255, 255, 0.05);
  --bg-card-sec: rgba(255, 255, 255, 0.06);
  --text-main: #f5f5f7;
  --text-sec: #a3a3a3;
  --border-color: rgba(255, 255, 255, 0.08);
}
body { font-family: 'Manrope', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
```
**Achado importante**: `'Manrope'` já está declarado como primeira fonte da pilha, mas **a fonte nunca foi carregada** (nenhum link do Google Fonts nem `@font-face` existe em nenhum `.html`) — então, na prática, todo o app está renderizando no fallback do sistema (`-apple-system`/`Segoe UI`) até hoje. Isso precisa ser corrigido ao aplicar a identidade visual.

### 14.2 Identidade visual definida pelo usuário (documento, ainda NÃO aplicada ao código)

Fonte: `C:\Users\Usuario\Desktop\SMPLS_Identidade_Visual_e_Proposta(1).docx`. O usuário confirmou que esse documento reflete o estilo que ele quer ("acho que é o estilo que eu queria mesmo"). Conteúdo extraído e analisado por mim; **nenhuma linha de CSS foi alterada ainda** — está pendente de autorização.

**Marca**
- Nome: **"SMPLS."** — o ponto final faz parte da identidade (já é assim no login).
- Símbolo/ícone da marca: **ainda não definido** pelo usuário — não inventar um.
- Personalidade: minimalista, moderna, tecnológica, confiável, premium. Sensação: clareza, controle, tranquilidade, simplicidade. Evitar aparência de "banco tradicional" ou app financeiro genérico (nada de ícone de cifrão/carteira/moedas).

**Tipografia**
- **Manrope** para tudo. Pesos: Logo = ExtraBold, Títulos = Bold, Subtítulos = SemiBold, Interface/corpo = Regular/Medium, Valores financeiros = Bold.
- Precisa ser carregada de verdade (Google Fonts ou self-host) — ver achado acima.

**Paleta base (cor, uso)**
| Cor | HEX | Uso |
|---|---|---|
| Preto principal | `#111111` | Marca, títulos, alto contraste |
| Branco | `#FFFFFF` | Fundo/superfícies do tema claro |
| Cinza claro | `#F5F5F5` | Áreas secundárias, fundos suaves |
| Cinza médio | `#737373` | Textos secundários |
| Teal de referência | `#14B8A6` | "Destaque alternativo/apoio visual da identidade" |

**Cores semânticas** (mantidas iguais nos dois temas, conceito): Verde = entradas/positivo, Vermelho = despesas/negativo, Amarelo/âmbar = atenção (contas perto do vencimento), Azul = "destaque de interface, especialmente no Dark Mode".

**Tema claro**
- Fundo: `#F7F8FA` · Superfície: `#FFFFFF` · Texto: `#171717` · Texto secundário: `#737373`.
- Cor de destaque a usar com moderação (documento não dá um HEX específico de destaque exclusivo do tema claro — ver ambiguidade abaixo).

**Tema escuro**
| Elemento | HEX |
|---|---|
| Fundo principal | `#202020` |
| Superfície / cards | `#2D2D2D` |
| Superfície elevada | `#383838` |
| Texto principal | `#FFFFFF` |
| Texto secundário | `#C5C5C5` |
| Bordas | `#454545` |
| Azul de destaque | `#60CDFF` |
| Azul forte | `#0078D4` |

> Texto do documento: *"O Dark Mode utiliza uma paleta de pretos e cinzas profundos combinada com um azul luminoso de destaque... transmitir tecnologia, confiança e sofisticação."* Note que isso é **bem diferente** do preto atual do código (`#0e0f13`, quase preto puro) — a proposta é mais "cinza profundo" (`#202020`/`#2D2D2D`) do que preto absoluto.

**Direção visual do produto** (dashboard) — mais orientação de produto/conteúdo do que de CSS puro: cards simples e espaçados, hierarquia forte pra saldo atual/projetado, gráficos limpos evitando excesso de cor, azul de destaque com moderação, verde/vermelho/amarelo só com significado financeiro, responsivo, "tema claro e escuro com a mesma identidade, não dois produtos diferentes", evitar visual carregado. Elementos de dashboard citados (alguns já existem, outros são aspiracionais): saldo atual, saldo projetado, entradas do período, despesas do período, contas próximas do vencimento, **fluxo financeiro (gráfico)**, resumo de comprometimento da renda, parcelamentos e compromissos futuros, atalhos rápidos pra adicionar entrada/despesa/conta.

**Regra de negócio confirmada pelo documento** (já implementada do nosso jeito): usuário não digita valor de parcela manualmente, informa total + quantidade de parcelas, sistema calcula e distribui — inclusive suporta cadastrar parcelamento já em andamento (N/M parcelas já pagas). Isso já é exatamente o que fazemos ao importar fatura (extraímos parcela atual/total direto do PDF).

**Tom de voz**: direto, objetivo, sem jargão bancário. Exemplos citados no documento: *"Seu saldo está saudável este mês."*, *"Você tem R$ 1.340 em contas nos próximos 7 dias."*, *"Atenção: seu saldo pode ficar abaixo de R$ 500 no dia 23."* — ainda não implementado (é conteúdo de UX writing, não crítico pro redesign visual).

### 14.3 Ambiguidade em aberto (perguntei ao usuário, resposta ainda não recebida)

O documento cita **duas** cores de destaque diferentes: o teal `#14B8A6` (na paleta base geral) e o azul `#60CDFF`/`#0078D4` (explicitamente descrito como do Dark Mode). Minha proposta, ainda **não confirmada pelo usuário**: usar **teal no tema claro** e **azul no tema escuro**. Essa foi a última pergunta feita antes de o usuário pedir esta documentação — **retomar essa pergunta antes de aplicar as cores**.

### 14.4 Escopo do redesenho (o que muda, o que não muda)

- Muda: valores das custom properties de cor em `global.css` (e possivelmente pequenos ajustes de tom nos `.css` de cada tela pra bater com a nova paleta), carregamento real da fonte Manrope.
- **Não muda**: nenhuma lógica JS, nenhum modelo de dado, nenhuma estrutura de arquivo, nenhum comportamento funcional. É uma troca de tokens visuais, risco baixo, mas ainda assim deve ser verificada visualmente (prints) e com a bateria de testes de regressão antes de considerar concluída.

---

## 15. Decisões importantes já tomadas (e o motivo)

1. **Reconstruir do zero, mas com a arquitetura do protótipo antigo (Vite + Firebase)** — em vez de continuar o repositório antigo (`Sarayva/SMPLS.`) ou usar o app simples Node/Express/JSON que eu tinha feito antes nesta mesma conversa (pasta `Desktop/Contas Claude`, **abandonado**, não faz mais parte do projeto ativo). Motivo: o usuário queria a base evoluir pra visão completa do SMPLS, e a arquitetura Firebase já validada era a mais adequada.
2. **Projeto Firebase novo (`smpls-001`)**, não reaproveitar o antigo (`smpls-c6a52`). Decisão explícita do usuário.
3. **Construir uma tela por vez**, sempre reportando antes de seguir pra próxima. Instrução explícita e repetida do usuário — regra de processo permanente, não só daquele momento.
4. **Importação de fatura via PDF, não cadastro manual de parcelas.** Motivo explícito do usuário: precisão dos dados (limite, parcelas, compras) importa mais que a conveniência de digitar; digitação manual introduz erro.
5. **Categorização embutida nos formulários, não uma tela de gestão separada.** Correção do usuário depois que eu construí a tela `categorias.html` por engano — ele deixou claro que queria decidir categoria no momento de uso. A tela foi removida (commit `1fed459`).
6. **Renda com "dono" é só rótulo, não multi-usuário real.** Confirmado explicitamente via pergunta direta — evita uma arquitetura muito mais complexa (múltiplos logins compartilhando dados) que não era o que o usuário queria.
7. **Mesclagem de parcelamento não pode depender do valor da parcela**, só descrição + total de parcelas — corrigido depois que o usuário percebeu duplicação real nos dados dele (ver bug na seção 16).
8. **Firestore com cache persistente (`persistentLocalCache` + `persistentMultipleTabManager`)**, não o `getFirestore()` padrão — corrigido depois de um bug real de perda de escrita ao navegar rápido entre páginas (ver seção 16). Essa configuração deve ser mantida; não reverter para `getFirestore()` simples.
9. **Sem biblioteca de gráficos externa** — o gráfico de Análises foi feito em HTML/CSS puro, decisão minha (justificada e aceita implicitamente pelo usuário ao não pedir mudança) pra manter o app leve e sem dependência nova, consistente com o resto do projeto.
10. **GitHub: só local por enquanto.** Usuário perguntou se eu já tinha commitado (eu não tinha até aquele ponto), pediu pra eu commitar localmente, mas quando perguntado sobre criar/conectar um repositório remoto, escolheu explicitamente "deixar só local por enquanto".
11. **Correções de dados reais do usuário sempre com confirmação visível** — ao construir a detecção de parcelamentos duplicados, o padrão adotado foi: nunca apagar/mesclar nada automaticamente sem o usuário ver o aviso e clicar num botão + confirmar num diálogo. Esse padrão deve ser repetido em qualquer futura funcionalidade de "limpeza"/migração de dados.
12. **Testes**: toda funcionalidade nova (e toda correção de bug) foi verificada com testes automatizados de ponta a ponta via Playwright (Chromium headless), incluindo contra **PDFs de fatura reais** do usuário (pasta `Desktop/faturas nubank`), não só dados fictícios. Sempre que um arquivo compartilhado entre telas foi alterado, rodei a bateria completa de regressão antes de considerar a mudança concluída. Manter esse padrão.
13. **Identidade visual do documento `.docx` é a direção aprovada pelo usuário** para o redesenho — mas a aplicação está pausada até autorização explícita (pedido desta mesma mensagem que gerou este `CLAUDE.md`).

---

## 16. Problemas já encontrados e como foram resolvidos

| # | Problema | Causa raiz | Correção | Commit |
|---|---|---|---|---|
| 1 | `Cannot read properties of null (reading 'indexOf')` ao clicar "+ Nova conta" rápido demais | `uid` só é setado dentro do callback assíncrono do `onAuthChange`; botão ficava clicável antes disso | Botão `disabled` até `uid` confirmado; guarda `if (!uid) return` nos handlers | (parte do build da Parte 1) |
| 2 | `FirebaseError: getDocument - expected either data, range, or url parameter` ao importar PDF | Chamada `pdfjsLib.getDocument(arrayBuffer)` incompatível com a versão instalada do pdf.js | Trocado para `pdfjsLib.getDocument({ data: arrayBuffer })` | build da tela de fatura |
| 3 | "99 Oticas Maringa" (e outras compras parceladas) apareciam **duas vezes** na lista de Parcelamentos | Mesclagem exigia valor de parcela idêntico; Nubank arredonda o valor da parcela de forma levemente diferente entre faturas de meses diferentes pra mesma compra | Chave de mesclagem mudada pra descrição + total de parcelas, sem o valor | `a5dd6bc` (correção do código) — **dados legados no Firestore do usuário continuaram duplicados**, tratados separadamente (problema #6) |
| 4 | Categoria nova criada não aparecia na lista de sugestões até recarregar a página | `categoriasContas`/`categoriasCartao` eram buscadas **uma vez só** no login e nunca atualizadas | `Dashboard.js` passou a rebuscar a lista toda vez que o modal de conta é aberto | `1fed459` |
| 5 | Escrita no Firestore (ex: categoria nova) podia se perder se o usuário navegasse pra outra página rápido demais logo depois | Firestore inicializado sem persistência offline (`getFirestore()` puro); escrita local "otimista" aparecia na tela antes do round-trip real com o servidor terminar, e uma navegação de página completa podia abortar esse round-trip | `src/firebase/config.js` passou a usar `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` | `48c118f` |
| 6 | Duplicatas de parcelamento **já existentes** nos dados reais do usuário (criadas antes da correção #3) continuavam aparecendo mesmo depois do código corrigido | A correção de matching só evita duplicata **nova**, não limpa retroativamente o que já existia no banco | Tela de Parcelamentos passou a detectar grupos duplicados (`encontrarDuplicatas`) e oferecer um botão "Corrigir" que mescla com confirmação explícita do usuário (`mesclarDuplicata`) | `a5dd6bc` |
| 7 | (Falso alarme, não era bug) Comparação de texto em teste automatizado falhando | `toLocaleString('pt-BR', {style:'currency'})` usa espaço não-quebrável (U+00A0) entre "R$" e o valor; string literal do teste usava espaço normal (U+0020) | Corrigido só no script de teste (normalizar espaços antes de comparar) — **não** era um bug do app | n/a (teste, fora do repositório) |

**Status da correção retroativa (#6) na conta real do usuário**: eu pedi pro usuário recarregar `/parcelamentos.html` e clicar em "Corrigir" — **não recebi confirmação explícita de que ele fez isso** antes da conversa seguir pra outros assuntos. **Verificar isso na próxima sessão** se for relevante.

---

## 17. Problemas conhecidos que ainda precisam ser resolvidos / verificados

- **Confirmar se o usuário já clicou em "Corrigir duplicatas" na conta real dele** (problema #6 acima) — não confirmado.
- **Decisão de cor pendente**: teal (claro) vs azul (escuro) como interpretação da identidade visual — perguntei, não obtive resposta ainda (ver seção 14.3).
- **Suporte a bancos além do Nubank** não existe — se o usuário tiver fatura de outro banco, a importação vai falhar com a mensagem "esse PDF não parece ser uma fatura do Nubank".
- **Tela de Análises usa gráfico simples (HTML/CSS)**, não uma biblioteca de gráficos — se o usuário quiser visualizações mais elaboradas (o documento de identidade visual menciona "fluxo financeiro" em formato de gráfico de linha, por exemplo), isso ainda não existe.
- **Fonte Manrope declarada mas nunca carregada** — todo o app tem renderizado no fallback do sistema até agora (ver seção 14.1). Corrigir isso faz parte do redesenho pendente.
- **Sem testes automatizados dentro do repositório** — toda a cobertura de teste existe só como scripts ad-hoc fora do projeto (scratchpad da sessão), não versionados, não reproduzíveis por outra pessoa sem eu recriá-los.

---

## 18. O que NÃO deve ser alterado sem autorização explícita do usuário

- **Não criar/conectar um repositório remoto no GitHub** sem perguntar — decisão explícita de ficar "só local por enquanto".
- **Não reintroduzir uma tela dedicada de gestão de categorias** — foi pedido e depois explicitamente rejeitado pelo usuário.
- **Não trocar a chave de mesclagem de parcelamentos para incluir o valor da parcela novamente** — foi a causa de um bug real já corrigido.
- **Não trocar `initializeFirestore` com `persistentLocalCache` de volta pro `getFirestore()` simples** — corrige um bug real de perda de dados.
- **Não apagar/mesclar dados reais do usuário (contas, faturas, parcelamentos, renda) sem uma ação visível e confirmação explícita dele na interface** — padrão estabelecido com a funcionalidade de correção de duplicatas.
- **Não adicionar GridStack.js, ApexCharts, Firebase App Check/reCAPTCHA, parsers de outros bancos, ou qualquer item do "whitepaper" antigo** sem o usuário pedir explicitamente — está deliberadamente fora do escopo atual (ver seção 5).
- **Não inventar/assumir um símbolo/ícone de marca** — o documento de identidade visual diz explicitamente que isso "ainda não está definido" e "não deve ser definido por suposição durante o desenvolvimento".
- **Não misturar/empacotar múltiplas telas numa entrega só** — construir e reportar uma de cada vez continua sendo a regra.
- **Não aplicar as mudanças de cor/fonte da seção 14 até o usuário autorizar** — ele pediu explicitamente para eu documentar tudo primeiro e esperar autorização antes de qualquer mudança de código.

---

## 19. Arquivos/componentes importantes e suas responsabilidades

| Arquivo | Responsabilidade |
|---|---|
| `src/firebase/config.js` | Inicializa Firebase App, Auth e Firestore (com cache persistente). Único lugar que lê `import.meta.env.VITE_FIREBASE_*`. |
| `src/firebase/auth.js` | `signUp`, `signIn`, `signOut`, `onAuthChange` — wrapper fino sobre o Firebase Auth. |
| `src/firebase/firestore.js` | Re-exporta as funções do SDK do Firestore + `db` — ponto único de import pras camadas de serviço. |
| `src/services/contasService.js` | CRUD de contas fixas, `statusConta`, `calcularTotais` (usado por Dashboard e Resumo), `mesAtualISO`. |
| `src/services/faturasService.js` | `salvarFatura`, `ouvirFaturas`. |
| `src/parsers/nubank.js` | `parseNubank(linhas, categorizar)`, `pareceSerFaturaNubank(linhas)` — todo o regex de extração da fatura Nubank. |
| `src/services/pdfService.js` | `extrairLinhas(arquivo)` — abre o PDF com pdf.js e reconstrói linhas de texto a partir da posição (Y) dos fragmentos. |
| `src/services/parcelamentosService.js` | `mesclarParcelas`, `ouvirParcelamentos`, `atualizarCategoriaParcelamento`, `encontrarDuplicatas`, `mesclarDuplicata`. Contém a lógica de negócio mais sensível do projeto (chave de mesclagem). |
| `src/services/rendaService.js` | CRUD de rendas. |
| `src/services/categoriasService.js` | `garantirCategoriasPadrao`, `buscarCategorias`, `adicionarCategoria`, `removerCategoria`, `ouvirCategorias`, listas `PADRAO_CONTAS`/`PADRAO_CARTAO`. |
| `src/services/categorizacaoService.js` | `categorizar(descricao)` — sugestão automática de categoria por palavra-chave. |
| `src/services/analisesService.js` | `calcularGastosPorMes(contas, faturas, qtdMeses)` — agregação por mês/categoria usada só pela tela de Análises. |
| `src/services/securityService.js` | `escapeHTML` — usado antes de qualquer `innerHTML` com dado do usuário. |
| `src/services/themeService.js` | `initTheme`, `toggleTheme`, `getTheme`. |
| `src/components/ContaModal.js` | Modal de criar/editar conta fixa — inclui a lógica de categoria nova auto-salva. |
| `src/components/RendaModal.js` | Modal de criar/editar renda. |
| `src/pages/*.js` | Um por tela — ver seção 4 pra detalhe de cada um. |
| `firestore.rules` | Regra de segurança: usuário só acessa `users/{seu-uid}/**`. |
| `vite.config.js` | Declara as 7 entradas HTML do build multi-página. |

---

## 20. Comandos importantes

```bash
# Instalar dependências
cd "C:\Users\Usuario\Desktop\smpls"
npm install

# Rodar em desenvolvimento (http://localhost:5173)
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

**Git** (repositório local, sem remoto configurado):
```bash
cd "C:\Users\Usuario\Desktop\smpls"
git status
git log --oneline
```

Histórico de commits até agora (mais recente primeiro):
```
c0a212e feat: análises comparativas de gastos por mês
a5dd6bc feat: detectar e corrigir parcelamentos duplicados
abc0dc8 feat: categoria clicável e editável na tela de Parcelamentos
1fed459 refactor: categorização embutida em vez de tela separada
48c118f feat: resumo mensal combinado e categorias personalizáveis
8445e93 feat: primeira versão do SMPLS (contas fixas, fatura, parcelamentos, renda)
```

**Testes manuais/automatizados** (não fazem parte do repositório — eram scripts Playwright criados ad-hoc na pasta de scratchpad da sessão do Claude Code, ex: `C:\Users\Usuario\AppData\Local\Temp\claude\...\scratchpad\pw-test\test-*.js`). Padrão usado, caso precise recriar:
```js
const { chromium } = require('playwright');
// cria usuário de teste via /login.html (cadastro), navega pras telas,
// interage via seletores de id/classe, confirma valores/])textos esperados,
// captura screenshot, verifica console sem erros.
```
Fatura reais do Nubank usadas para testar (dados reais do usuário): `C:\Users\Usuario\Desktop\faturas nubank\Nubank_2026-0{1,5,6,7,8}-13*.pdf`.

**Firebase Console**: projeto `smpls-001` (console.firebase.google.com) — Authentication (Email/senha ativado), Firestore Database (modo produção, regras customizadas publicadas).

---

## 21. Estado atual do desenvolvimento

- ✅ Parte 1 (Contas fixas) — completa, testada.
- ✅ Parte 2 (Importar fatura Nubank) — completa, testada com PDFs reais.
- ✅ Extensão da Parte 2 — Parcelamentos, Renda, Resumo, Categorização embutida, Análises — todas completas e testadas.
- ⏸️ **Pausado agora**: redesenho visual (identidade do documento `.docx`) — análise feita, aplicação **não iniciada**, aguardando autorização do usuário (que disse que daria essa autorização logo depois de eu terminar este `CLAUDE.md`).
- ❓ Pendente de confirmação do usuário: se ele já corrigiu as duplicatas de parcelamento na conta real dele, e qual das duas leituras da cor de destaque (teal no claro / azul no escuro) ele quer.

---

## 22. Próximos passos (assim que houver autorização)

1. Confirmar com o usuário a interpretação teal(claro)/azul(escuro) — ou a preferência dele, se diferente — antes de tocar em qualquer CSS.
2. Aplicar a paleta de cores nova em `global.css` (`:root` + `[data-theme='light']` + `[data-theme='dark']`), mantendo a estrutura de custom properties já existente (só trocar valores, não a arquitetura de tokens).
3. Carregar a fonte **Manrope de verdade** (Google Fonts, via `<link>` em cada `.html`, ou outra abordagem se o usuário preferir self-host) — hoje ela é só um nome na pilha de fontes sem estar carregada.
4. Revisar visualmente (prints, nos dois temas) todas as 7 telas depois da troca, e rodar a bateria de regressão funcional pra garantir que nada quebrou (mudança deve ser só visual).
5. Perguntar se o usuário quer ir além da paleta/tipografia (ex: elementos de "Direção visual do produto" do documento — saldo projetado, gráfico de fluxo financeiro — que são pedidos de produto, não só de estilo) ou se o redesenho fica só no nível de cor/fonte por agora.

Depois disso, não há uma "próxima parte" combinada — o que vier depois (Parte 3, outros bancos, etc.) precisa ser definido com o usuário quando ele quiser retomar.

---

## 23. TODOs e pendências (lista objetiva)

- [ ] Confirmar escolha de cor de destaque por tema (teal claro / azul escuro) com o usuário.
- [ ] Aplicar paleta de cores + Manrope (redesenho visual) — só depois de autorização.
- [ ] Confirmar com o usuário se ele corrigiu as duplicatas legadas de parcelamento na conta real.
- [ ] (Sem prazo/prioridade definida) Avaliar suporte a outros bancos no importador de fatura.
- [ ] (Sem prazo/prioridade definida) Avaliar se algum elemento do "whitepaper" antigo entra em algum momento (GridStack, ApexCharts, App Check) — só se o usuário pedir.

---

## 24. Outras informações relevantes

- **Projetos antigos/relacionados encontrados no disco** durante esta conversa, usados só como **referência/inspiração**, não como base de código copiada:
  - `Desktop/contas mensais - Copia` — protótipo anterior do SMPLS (Vite + Firebase), repo real `github.com/Sarayva/SMPLS.` (com projeto Firebase `smpls-c6a52`, **não reaproveitado**).
  - `Desktop/analise fatura` (+ cópias) — continha um parser Nubank **já funcional e testado** (`parsers/nubank.js`, dentro de `fatura_app.js`), cuja lógica de reconstrução de linhas do PDF.js e regex de extração foi **portada e adaptada** (não copiada literalmente) pro nosso `src/parsers/nubank.js` e `src/services/pdfService.js`. Também tinha um parser Itaú (`parsers/itau.js`, 21 linhas) nunca analisado/portado.
  - `Desktop/smpls_documentation.md` — whitepaper de uma versão bem mais avançada (leitura de PDF multi-banco, GridStack, ApexCharts, App Check) — usado só pra entender a "visão completa", **não** é o escopo atual.
  - `Desktop/Contas Claude` — app local simples (Node/Express + JSON, sem nuvem) que eu construí no **início** desta mesma conversa, **antes** de descobrir os projetos SMPLS anteriores. Foi abandonado assim que a visão do SMPLS ficou clara; não faz parte do projeto ativo.
- **Faturas reais do usuário** usadas pra testar (Nubank, titular "Mellissa Santana Martins Silva"): `Desktop/faturas nubank/Nubank_2026-01-13.pdf`, `2026-05-13.pdf`, `2026-06-13.pdf`, `2026-07-13.pdf`, `2026-08-13 (1).pdf`. Há cópias dessas mesmas faturas em outras pastas (`Desktop/analise fatura*`, `Desktop/Nubank_2026-08-13.pdf` solto) — mesma origem, não são faturas diferentes.
- **Contexto de "renda de quem"**: a conta Firebase/Google usada pra criar o projeto mostrou o nome "Gabriel" no console; os dados de teste de Renda usaram "Mellissa" e "Gabriel" como dois donos — sugere que o app pode ser usado por duas pessoas (provavelmente um casal), mas a estrutura de dados continua sendo **uma conta só**, com "dono" sendo só um rótulo (ver seção 6/11).
- **Idioma**: toda a interface, nomes de variáveis/funções, commits e comunicação com o usuário são em **português do Brasil**. Manter esse padrão.
- **Ambiente**: Windows, PowerShell/Git Bash, sem WSL. Caminhos usam `C:\Users\Usuario\...`.
