FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /srv
COPY requirements.txt ./requirements.txt
COPY app/requirements.txt ./app/requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt \
    && useradd --uid 10001 --create-home --shell /usr/sbin/nologin luklaan

COPY --chown=10001:10001 app/ ./app/
RUN mkdir -p /srv/app/.runtime && chown 10001:10001 /srv/app/.runtime
USER 10001:10001
EXPOSE 5173
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5173/api/health',timeout=3).read()"]
CMD ["python", "app/server.py", "--host", "0.0.0.0", "--port", "5173"]
