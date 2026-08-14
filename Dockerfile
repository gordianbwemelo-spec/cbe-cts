# CBE Curriculum Tracking System — production container
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads
VOLUME ["/data"]
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
