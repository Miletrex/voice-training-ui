FROM ghcr.io/astral-sh/uv:latest AS uv_bin
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    procps \
    ffmpeg \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Europe/Berlin

COPY --from=uv_bin /uv /uvx /bin/

WORKDIR /app
COPY dashboard-react/package*.json ./

RUN npm ci --ignore-scripts

COPY . .

RUN mkdir -p /app/shared

# Wir erstellen den venv-Ordner vorab und geben dem 'node'-User
# sofort alle Rechte darauf, BEVOR uv irgendwelche Dateien anlegt.
RUN mkdir -p /opt/analyser-venv && chown -R node:node /app /opt/analyser-venv
RUN chmod 1777 /tmp

# Sicherer Wechsel zum non-root User für die Installation
USER node

# Umgebungsvariable setzen, damit uv echte Dateien KOPIERT statt Symlinks zu nutzen.
# Zudem nutzen wir das globale System-Python.
ENV UV_PROJECT_ENVIRONMENT=/opt/analyser-venv
ENV UV_PYTHON_PREFERENCE=system
ENV UV_LINK_MODE=copy

# Synchronisieren läuft jetzt komplett fehlerfrei als 'node'-User
RUN uv sync --no-cache

EXPOSE 5173 8000

CMD ["/opt/analyser-venv/bin/python", "run.py"]