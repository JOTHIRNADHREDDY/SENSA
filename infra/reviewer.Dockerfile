FROM caddy:2.10.2-alpine
COPY infra/Reviewer.Caddyfile /etc/caddy/Caddyfile
COPY reports /srv/reports
COPY demo /srv/demo
EXPOSE 8080
