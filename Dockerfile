FROM node:20-slim

# Instala o Google Chrome e dependências necessárias
RUN apt-get update && apt-get install -y \
  wget gnupg ca-certificates fonts-liberation \
  libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
  libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
  libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 \
  libxrender1 libxss1 libxtst6 xdg-utils \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
  && apt-get update && apt-get install -y google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia os arquivos para dentro do container
COPY . .

# Instala dependências Node.js
RUN npm install

# Define variável de ambiente para o Chrome
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expõe a porta usada pelo servidor
EXPOSE 10000

# Inicia o servidor
CMD ["node", "index.js"]
