# Stage 1: Build the React application
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files and install dependencies.
# --ignore-scripts skips onnxruntime-node's native NuGet download; the
# browser build uses onnxruntime-web via @huggingface/transformers instead.
COPY package*.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

# Copy the rest of the application files
COPY . .

# Build the production bundle
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
