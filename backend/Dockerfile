FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE 8080

# Start the application (replace pm2 with direct node command)
CMD ["node", "index.js"]