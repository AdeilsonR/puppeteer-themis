FROM node:20-slim

# Instala dependências que o Chrome precisa
RUN apt-get update && apt-get install -y \
  wget gnupg ca-certificates fonts-liberation \
  libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
  libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 \
  libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 \
  libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
  libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 \
  libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
  xdg-utils wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm install

EXPOSE 10000
CMD ["node", "index.js"]
