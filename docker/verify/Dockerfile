# Unabhängige Prüfwerkzeuge für Tests: pyHanko (PAdES), Poppler, qpdf, OpenSSL
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils qpdf openssl && rm -rf /var/lib/apt/lists/* \
 && pip install --no-cache-dir 'pyhanko[opentype]==0.29.*' pyhanko-cli 2>/dev/null || pip install --no-cache-dir pyhanko
WORKDIR /work
