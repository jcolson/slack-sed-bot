FROM alpine:3.11

RUN apk add nodejs
RUN apk add npm
RUN apk add git
RUN apk add imagemagick
RUN apk add ghostscript-fonts

COPY sedbot /
COPY sedbot.js /
COPY package.json /
COPY package-lock.json /

RUN npm install

#HEALTHCHECK CMD wget --quiet --tries=1 --spider http://localhost:8080/metrics || exit 1

CMD CONFIGDIR=/config /sedbot
