# Timelining Neo4j Docker image

Community Edition image used by propagate when provisioning Neo4j on Railway for timelining deployments.

Railway builds from this directory in the forked timelining repo (`rootDirectory: .docker`). `railway.toml` in this folder sets the Dockerfile builder so Railway does not default to Railpack at the repo root.

Neo4j data is persisted via a Railway Volume mounted at `/data` (declared in `railway.toml` as `requiredMountPath`). Do not use a Dockerfile `VOLUME` instruction — Railway rejects it. Propagate provisions the volume automatically during apply.

Local parity:

```bash
docker build -t timelining-neo4j .
docker run -p 7687:7687 -e NEO4J_AUTH=neo4j/neo4jtesting timelining-neo4j
```

See also `test/test-env/docker-compose.yml` for local test setup.
