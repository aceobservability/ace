FROM golang:1.25.9-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /telemetrygen ./cmd/seed-correlated

FROM alpine:3.21
COPY --from=build /telemetrygen /usr/local/bin/telemetrygen
ENTRYPOINT ["telemetrygen"]
