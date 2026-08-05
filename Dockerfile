# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Local sibling modules (file: deps). Build context should include them or
# pre-pack; for compose monorepo builds, copy package.json first.
COPY package.json ./
# When building with access to sibling modules, mount/copy Open-*-JS before npm install.
# Fallback: npm install works when Open-UI-JS / Open-Client-JS are available at ../
ARG VITE_API_URL=
ARG VITE_OPA_HUB_URL=
ARG VITE_OPA_DASHBOARD_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_OPA_HUB_URL=$VITE_OPA_HUB_URL
ENV VITE_OPA_DASHBOARD_URL=$VITE_OPA_DASHBOARD_URL

COPY . .
RUN npm install && npm run build

# Runtime stage
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# NAS/NFS docker storage can hang on the stock IPv6 listen probe script.
RUN rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
