FROM python:3.8.13-slim-bullseye@sha256:db831ae8c7e88ca6f69465a7c3f255c03678e830a1ad13c2a340bec9fc232d3e

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PYOPENGL_PLATFORM=osmesa LIBGL_ALWAYS_SOFTWARE=1 \
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 LP_NUM_THREADS=2
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    libosmesa6 libgl1 libglib2.0-0 libglfw3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/animated-drawings
COPY setup.py ./
COPY animated_drawings ./animated_drawings
COPY examples ./examples
RUN python -m pip install --only-binary=:all: . && python -m pip check
RUN mkdir /output && chmod 1777 /output
USER 65534:65534
ENTRYPOINT ["timeout", "--signal=TERM", "--kill-after=10s", "600s", "python", "-c", "import logging,sys; logging.basicConfig(level=logging.INFO); from animated_drawings import render; render.start(sys.argv[1])"]
CMD ["/sample.yaml"]
