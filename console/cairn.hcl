project "cairn-console" {
  runtime = "bun"
}

service "console" {
  build   = "bun install"
  command = "bun run start"
  expose  = true
  dev {
    command = "bun --hot index.ts"
  }
  env {
    NODE_ENV    = "production"
    CONSOLE_URL = "https://console.cairn.dev"
  }
}

storage "data" {
  mount = "/data"
}
