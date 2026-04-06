FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -o /out/ace-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot

LABEL org.opencontainers.image.source=https://github.com/aceobservability/ace

COPY --from=builder /out/ace-api /usr/local/bin/ace-api

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/ace-api"]
