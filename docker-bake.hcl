variable "TAG" {
  default = "latest"
}

group "default" {
  targets = ["app"]
}

group "ci" {
  targets = ["app-ci"]
}

target "base" {
  context    = "."
  dockerfile = "./Dockerfile"
}

target "ci-base" {
  inherits = [ "base" ]
  platforms = [
    "linux/amd64",
    "linux/arm64"
  ]
}

target "app-base" {
  tags       = ["orochibraru/nuvio-web:latest", "orochibraru/nuvio-web:${TAG}"]
  cache-from = ["type=gha,scope=app"]
  cache-to   = ["type=gha,mode=max,scope=app"]
}

target "app" {
  inherits   = ["base", "app-base"]
}

target "app-ci" {
  inherits   = ["ci-base", "app-base"]
}
