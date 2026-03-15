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
}
