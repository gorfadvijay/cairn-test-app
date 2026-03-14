# Cairn test deploy

project "cairn-test" {
  runtime = "bun"
}

service "api" {
  command = "bun run src/index.ts"
  expose  = true
}

postgres "main" {
  version = "16"
}

redis "cache" {
  version = "7"
}
