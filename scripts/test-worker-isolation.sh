#!/usr/bin/env sh
# OPERATOR-RUN: test the actual Linux coding worker; not tested on Ahmed's host.
set -eu
command -v docker >/dev/null 2>&1 || { echo 'BLOCKED: docker unavailable'; exit 70; }
command -v node >/dev/null 2>&1 || { echo 'BLOCKED: node unavailable'; exit 70; }
: "${WORKER_CONTAINER:?Specify running coding-worker container name}"
CANARY_PORT="${CANARY_PORT:-18937}"
PRIVATE_TEST_HOST="${PRIVATE_TEST_HOST:-192.168.1.1}"
docker inspect "$WORKER_CONTAINER" >/dev/null || exit 70
network=$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$WORKER_CONTAINER")
readonly=$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$WORKER_CONTAINER")
privileged=$(docker inspect --format '{{.HostConfig.Privileged}}' "$WORKER_CONTAINER")
user=$(docker inspect --format '{{.Config.User}}' "$WORKER_CONTAINER")
caps=$(docker inspect --format '{{json .HostConfig.CapDrop}}' "$WORKER_CONTAINER")
mounts=$(docker inspect --format '{{json .Mounts}}' "$WORKER_CONTAINER")
[ "$network" = none ] || { echo 'FAIL: network namespace not isolated'; exit 8; }
[ "$readonly" = true ] || { echo 'FAIL: root filesystem writable'; exit 8; }
[ "$privileged" = false ] || { echo 'FAIL: privileged container'; exit 8; }
[ -n "$user" ] && [ "$user" != root ] && [ "$user" != 0 ] || { echo 'FAIL: root user'; exit 8; }
printf '%s' "$caps" | grep -qi ALL || { echo 'FAIL: capabilities not dropped'; exit 8; }
if printf '%s' "$mounts" | grep -q docker.sock; then echo 'FAIL: docker socket mounted'; exit 8; fi
node -e "require('node:http').createServer((_,r)=>r.end('HOST_CANARY')).listen($CANARY_PORT,'127.0.0.1')" &
CANARY_PID=$!
trap 'kill "$CANARY_PID" 2>/dev/null || true' EXIT INT TERM
sleep 1
kill -0 "$CANARY_PID" 2>/dev/null || { echo 'BLOCKED: host canary not running'; exit 70; }
PROBE="
const fs=require('node:fs'),net=require('node:net');
async function canConnect(host,port){return new Promise(resolve=>{
 const s=net.createConnection({host,port});let done=false;
 const finish=(ok)=>{if(done)return;done=true;s.destroy();resolve(ok)};
 s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.setTimeout(1500,()=>finish(false));
})}
(async()=>{
 let ok=true;
 if(process.getuid&&process.getuid()===0){console.error('FAIL: root');ok=false;}
 if(fs.existsSync('/var/run/docker.sock')||fs.existsSync('/run/docker.sock')){console.error('FAIL: socket');ok=false;}
 for(const key of Object.keys(process.env)){
  if(/^(GITHUB_TOKEN|GH_TOKEN|N8N_WEBHOOK_SECRET|STRIPE_SECRET|APP_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/.test(key)){
   console.error('FAIL: credential variable '+key);ok=false;
  }
 }
 for(const [host,port] of [['127.0.0.1',$CANARY_PORT],['$PRIVATE_TEST_HOST',80],['1.1.1.1',443]]){
  if(await canConnect(host,port)){console.error('FAIL: forbidden destination '+host);ok=false;}
 }
 console.log(ok?'WORKER_NAMESPACE_ISOLATED':'WORKER_NAMESPACE_UNSAFE');
 process.exit(ok?0:8);
})().catch(e=>{console.error(e.message);process.exit(9)});
"
docker exec "$WORKER_CONTAINER" node -e "$PROBE"
