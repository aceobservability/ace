# Pinned to the Go minor line so it tracks go.mod's `go 1.25` directive (see
# backend/Dockerfile) and never drifts on the patch version.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /telemetrygen ./cmd/seed-correlated

FROM alpine:3.21
COPY --from=build /telemetrygen /usr/local/bin/telemetrygen
ENTRYPOINT ["telemetrygen"]
