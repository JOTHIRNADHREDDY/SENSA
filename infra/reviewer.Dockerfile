FROM caddy:2.10.2-alpine
COPY infra/Reviewer.Caddyfile /etc/caddy/Caddyfile
COPY reports /srv/reports
COPY demo/index.html demo/review.css demo/review.js /srv/demo/
COPY demo/evidence /srv/demo/evidence
COPY demo/sources /srv/demo/sources
COPY demo/walkthrough.mp4 /srv/demo/walkthrough.mp4
EXPOSE 8080
