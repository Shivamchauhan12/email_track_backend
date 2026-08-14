FROM node:20-bookworm-slim

WORKDIR /app

# Install OpenSSL required by Prisma
RUN apt-get update \
    && apt-get install -y openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY prisma ./prisma/

RUN npx prisma generate

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]