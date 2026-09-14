# Estágio único por enquanto — o projeto é pequeno o suficiente
# para não precisar de multi-stage ainda (sem etapa de build/transpile no backend)
FROM node:24-alpine

WORKDIR /app

# Copia só os manifestos primeiro — aproveita cache do Docker:
# se só o código mudar (não as dependências), essa camada não rebuilda
COPY package*.json ./
RUN npm install --omit=dev

# Agora copia o resto do código
COPY . .

EXPOSE 3001

CMD ["node", "src/index.js"]