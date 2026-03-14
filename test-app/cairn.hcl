# Cairn test deploy

project "test-app" {
  runtime = "bun"
}

service "api" {
  command = "bun run src/index.ts"
  expose  = true
}

postgres "main" {
  version = "16"
}
