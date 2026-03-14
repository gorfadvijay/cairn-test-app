# My first Cairn app

project "hello-world" {
  runtime = "bun"
}

service "api" {
  build   = "bun install"
  command = "bun run src/index.ts"
  expose  = true

  dev {
    command = "bun run --watch src/index.ts"
  }
}

postgres "main" {
  version = "16"
}

redis "cache" {
  version = "7"
}

storage "uploads" {}

auth "main" {
  providers = ["email", "google", "github"]
  session   = "jwt"
}
