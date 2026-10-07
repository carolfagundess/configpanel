# ConfigPanel — Frontend

SPA em React 19 + Vite. Hoje corresponde ao **Módulo de Ferramentas** (utilitários operacionais, client-side e sem estado).

## Estado atual

- **Implementado:** gerador de configuração de RouterBoard (`src/pages/RouterBoardForm.jsx`, com a lógica em `src/tools/gerarRouterboard.js`).
- **Placeholder ("Esta ferramenta ainda não foi portada"):** Ferramentas CIASC, Wifi Business, Calculadora IPv4 e Verificador de Equipamentos.
- **Ainda não existe:** telas do Módulo Desk (grid de protocolos B2B e formulário de abertura) e login. O frontend **não chama a API** do backend; `VITE_API_URL` está definida em `.env.example`, mas ainda não é usada no código.

## Estrutura

```
src/
├── App.jsx                 # layout (topbar + sidebar) e navegação por estado, sem router
├── components/Sidebar.jsx  # menu lateral
├── pages/                  # uma página por ferramenta
└── tools/                  # lógica pura das ferramentas (sem React)
```

## Como rodar

Normalmente via Docker Compose, a partir da raiz do repositório (veja o [README principal](../README.md)). O frontend sobe em http://localhost:5173.

Fora do Docker, dentro de `frontend/`:

| Comando           | Descrição                        |
|-------------------|----------------------------------|
| `npm run dev`     | Servidor de desenvolvimento      |
| `npm run build`   | Build de produção                |
| `npm run preview` | Serve o build localmente         |
| `npm run lint`    | ESLint                           |

## Variáveis de ambiente

| Variável       | Descrição                                   |
|----------------|---------------------------------------------|
| `VITE_API_URL` | URL base da API (ex.: `http://localhost:3001`) |
