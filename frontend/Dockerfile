FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000
# Run the Vite dev server (simple for a demo). For production use `npm run build`.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
