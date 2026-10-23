# Small, dependency-free image: Node runs the server, which also serves the static site.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package.json ./
COPY server ./server
COPY src ./src
COPY assets ./assets
COPY categories ./categories
COPY themes ./themes
COPY data ./data
COPY index.html manifest.webmanifest sw.js config.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/index.mjs"]
