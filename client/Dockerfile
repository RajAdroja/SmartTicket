FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

# Copy the built React app from the builder stage
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copy our custom Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose both the customer port and agent port
EXPOSE 5173
EXPOSE 5174

CMD ["nginx", "-g", "daemon off;"]
