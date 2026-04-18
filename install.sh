#!/usr/bin/env bash
# ─── FilBucket installer ───
#   curl -fsSL https://get.filbucket.ai | bash
#
#   Installs FilBucket locally: infra (Postgres + Redis + MinIO via Homebrew),
#   clones the repo, runs migrations, and starts the dev stack.
#
#   Safe by default: asks before doing anything destructive. Idempotent —
#   re-running skips what's already done.

set -euo pipefail

# ─── colors + banners ────────────────────────────────────────────────────
if [[ -t 1 ]] && [[ "${TERM:-}" != "dumb" ]] && [[ -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  BLUE=$'\033[38;5;39m'; CYAN=$'\033[38;5;87m'
  ORANGE=$'\033[38;5;208m'; CREAM=$'\033[38;5;223m'
  GREEN=$'\033[38;5;71m'; RED=$'\033[38;5;203m'
  INK=$'\033[38;5;240m'
else
  BOLD=''; DIM=''; RESET=''
  BLUE=''; CYAN=''; ORANGE=''; CREAM=''
  GREEN=''; RED=''; INK=''
fi

print_banner() {
  cat <<EOF

${BLUE}        ╭─────────────╮${RESET}
${BLUE}        │  ${CYAN}████████${BLUE}   │${RESET}    ${BOLD}${CREAM}FilBucket${RESET}
${BLUE}        │  ${CYAN}██${CREAM}ƒ${CYAN}█████${BLUE}   │${RESET}    ${DIM}Dropbox for Filecoin${RESET}
${BLUE}        │  ${CYAN}████████${BLUE}   │${RESET}
${BLUE}        │  ${CYAN}████████${BLUE}   │${RESET}    ${INK}Local installer · v0.1${RESET}
${BLUE}        ╰─────┬─┬─────╯${RESET}
${BLUE}              └─┘${RESET}

EOF
}

step()  { printf "${BOLD}${BLUE}▸${RESET} %s\n" "$*"; }
ok()    { printf "  ${GREEN}✓${RESET} ${DIM}%s${RESET}\n" "$*"; }
warn()  { printf "  ${ORANGE}!${RESET} %s\n" "$*"; }
fail()  { printf "  ${RED}✗${RESET} ${BOLD}%s${RESET}\n" "$*"; exit 1; }
info()  { printf "  ${DIM}%s${RESET}\n" "$*"; }
ask()   {
  local prompt="$1" default="${2:-y}" answer
  if [[ "${FILBUCKET_YES:-}" == "1" ]]; then return 0; fi
  if [[ "$default" == "y" ]]; then
    printf "  ${CYAN}?${RESET} %s ${DIM}[Y/n]${RESET} " "$prompt"
  else
    printf "  ${CYAN}?${RESET} %s ${DIM}[y/N]${RESET} " "$prompt"
  fi
  read -r answer </dev/tty
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

# Poll calibration balances for an address until both tFIL > 0 and USDFC > 0.
# Uses the project's own viem from apps/server's node_modules so we don't
# drag in a separate dep. Times out after 10 minutes by default.
poll_balances() {
  local addr="$1"
  local timeout="${FILBUCKET_FAUCET_TIMEOUT:-600}"
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local start=$(date +%s)
  local i=0 fil_done=0 usdfc_done=0 fil_str='—' usdfc_str='—'
  trap 'printf "\n"; return 130' INT
  while true; do
    local now=$(date +%s)
    local elapsed=$((now - start))
    if (( elapsed > timeout )); then
      printf "\n"
      warn "Timed out after ${timeout}s. Fund manually and re-run setup-wallet."
      return 1
    fi
    # Read balances every 10s, animate spinner every 100ms in between.
    if (( elapsed % 10 == 0 )) || (( i == 0 )); then
      local out
      out=$( cd "$INSTALL_DIR/apps/server" && node -e "
        const { createPublicClient, http, formatEther, formatUnits } = require('viem');
        const { filecoinCalibration } = require('viem/chains');
        const c = createPublicClient({ chain: filecoinCalibration, transport: http('https://api.calibration.node.glif.io/rpc/v1') });
        const USDFC = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0';
        Promise.all([
          c.getBalance({ address: process.argv[1] }),
          c.readContract({ address: USDFC, abi: [{ name:'balanceOf', type:'function', stateMutability:'view', inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}] }], functionName:'balanceOf', args:[process.argv[1]] })
        ]).then(([f,u]) => console.log(formatEther(f) + '|' + formatUnits(u, 18))).catch(() => console.log('0|0'));
      " "$addr" 2>/dev/null )
      fil_str="${out%|*}"
      usdfc_str="${out#*|}"
      # Trim to 4 decimals.
      fil_str="${fil_str%.*}.${fil_str#*.}"
      [[ "$fil_str" =~ ^[0-9]+\.[0-9]{0,4} ]] && fil_str="${BASH_REMATCH[0]}"
      [[ "$usdfc_str" =~ ^[0-9]+\.[0-9]{0,4} ]] && usdfc_str="${BASH_REMATCH[0]}"
      # Strip trailing zeros after the decimal
      fil_str=$(printf '%s' "$fil_str" | sed -E 's/0+$//; s/\.$//')
      usdfc_str=$(printf '%s' "$usdfc_str" | sed -E 's/0+$//; s/\.$//')
      [[ -z "$fil_str" ]] && fil_str="0"
      [[ -z "$usdfc_str" ]] && usdfc_str="0"
      # Done?
      [[ "$fil_str" != "0" ]] && fil_done=1
      [[ "$usdfc_str" != "0" ]] && usdfc_done=1
    fi
    local fil_mark="${RED}·${RESET}"; local usdfc_mark="${RED}·${RESET}"
    (( fil_done == 1 )) && fil_mark="${GREEN}✓${RESET}"
    (( usdfc_done == 1 )) && usdfc_mark="${GREEN}✓${RESET}"
    printf "\r  ${BLUE}%s${RESET} waiting on chain  ${fil_mark} tFIL ${BOLD}%s${RESET}  ${usdfc_mark} USDFC ${BOLD}%s${RESET}  ${DIM}(%ss)${RESET}    " \
      "${frames[$((i % 10))]}" "$fil_str" "$usdfc_str" "$elapsed"
    if (( fil_done == 1 && usdfc_done == 1 )); then
      printf "\n"
      ok "Funded! tFIL=$fil_str  USDFC=$usdfc_str"
      trap - INT
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
}

# Spinner while a command runs. Usage: `spinner "Installing foo" brew install foo`
spinner() {
  local label="$1"; shift
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local tmp
  tmp=$(mktemp)
  ("$@" >"$tmp" 2>&1) &
  local pid=$!
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    printf "\r  ${BLUE}%s${RESET} %s" "${frames[$((i % 10))]}" "$label"
    i=$((i + 1))
    sleep 0.1
  done
  wait "$pid"; local status=$?
  if [[ $status -eq 0 ]]; then
    printf "\r  ${GREEN}✓${RESET} ${DIM}%s${RESET}%*s\n" "$label" 20 ''
    rm -f "$tmp"
  else
    printf "\r  ${RED}✗${RESET} ${BOLD}%s${RESET}\n" "$label"
    cat "$tmp"
    rm -f "$tmp"
    exit "$status"
  fi
}

# ─── preflight ───────────────────────────────────────────────────────────
print_banner

OS="$(uname -s)"
ARCH="$(uname -m)"

if [[ "$OS" != "Darwin" ]]; then
  warn "This installer is optimized for macOS. Linux support is coming."
  warn "For now, follow docs.filbucket.ai/self-host for manual setup."
  exit 1
fi

step "Checking prerequisites"

# Homebrew
if ! command -v brew >/dev/null 2>&1; then
  fail "Homebrew not found. Install it from https://brew.sh first."
fi
ok "Homebrew"

# Node 22+
if ! command -v node >/dev/null 2>&1; then
  warn "Node not found. Will install via Homebrew."
  NEED_NODE=1
else
  NODE_VER="$(node -p 'process.versions.node.split(".").map(Number)[0]')"
  if [[ "$NODE_VER" -lt 22 ]]; then
    warn "Node $NODE_VER detected. FilBucket needs Node 22+."
    NEED_NODE=1
  else
    ok "Node $(node -v)"
  fi
fi

# pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  NEED_PNPM=1
  warn "pnpm not found, will install"
else
  ok "pnpm $(pnpm -v)"
fi

# git
command -v git >/dev/null || fail "git not found. Install Xcode command line tools."
ok "git"

# librsvg (for logo/icon generation)
command -v rsvg-convert >/dev/null || NEED_LIBRSVG=1

# ─── paths ───────────────────────────────────────────────────────────────
INSTALL_DIR="${FILBUCKET_INSTALL_DIR:-$HOME/FilBucket}"
MINIO_DIR="${FILBUCKET_MINIO_DIR:-$HOME/.filbucket/minio-data}"
REPO_URL="${FILBUCKET_REPO_URL:-https://github.com/Reiers/filbucket.git}"
GIT_REF="${FILBUCKET_GIT_REF:-main}"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"

step "Install location"
info "Repo:   ${BOLD}$INSTALL_DIR${RESET}"
info "MinIO:  ${BOLD}$MINIO_DIR${RESET}"
echo

if ! ask "Proceed?" y; then
  info "Aborted. Nothing changed."
  exit 0
fi

# ─── dependencies via Homebrew ───────────────────────────────────────────
step "Installing dependencies"

to_install=()
if [[ "${NEED_NODE:-0}" == "1" ]]; then to_install+=(node@22); fi
if ! brew list postgresql@16 >/dev/null 2>&1; then to_install+=(postgresql@16); fi
if ! brew list redis           >/dev/null 2>&1; then to_install+=(redis); fi
if ! brew list minio/stable/minio >/dev/null 2>&1; then to_install+=(minio/stable/minio); fi
if ! brew list minio-mc         >/dev/null 2>&1; then to_install+=(minio-mc); fi
if [[ "${NEED_LIBRSVG:-0}" == "1" ]]; then to_install+=(librsvg); fi

if [[ ${#to_install[@]} -gt 0 ]]; then
  spinner "Installing ${to_install[*]}" brew install "${to_install[@]}"
else
  ok "All Homebrew deps already installed"
fi

if [[ "${NEED_PNPM:-0}" == "1" ]]; then
  spinner "Installing pnpm" npm install -g pnpm
fi

# ─── bring up services ───────────────────────────────────────────────────
step "Starting services"

ensure_service() {
  local name="$1"
  if brew services list | grep -qE "^$name\s+started"; then
    ok "$name already running"
  else
    spinner "Starting $name" brew services start "$name"
  fi
}

ensure_service postgresql@16
ensure_service redis

# MinIO runs under brew services. If something else (like a manual `minio server`)
# is already listening on :9000, don't fight it — use what's there.
if curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
  ok "MinIO already responding on :9000"
elif brew services list | grep -qE "^minio\s+started"; then
  ok "minio already running"
else
  export MINIO_ROOT_USER="${MINIO_ROOT_USER:-filbucket}"
  export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-filbucketsecret}"
  export MINIO_VOLUMES="$MINIO_DIR"
  mkdir -p "$MINIO_DIR"
  spinner "Starting minio" brew services start minio/stable/minio
  # Wait for it
  for _ in {1..20}; do
    if curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
fi

# Wait for Postgres to accept connections
info "Waiting for Postgres…"
for _ in {1..20}; do
  if "$PG_BIN/pg_isready" -h localhost -q 2>/dev/null; then break; fi
  sleep 0.5
done
"$PG_BIN/pg_isready" -h localhost -q || fail "Postgres didn't come up in 10s."
ok "Postgres ready"

# Create role + db (idempotent)
if ! "$PG_BIN/psql" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='filbucket'" | grep -q 1; then
  "$PG_BIN/psql" -d postgres -c "CREATE USER filbucket WITH PASSWORD 'filbucket' CREATEDB;" >/dev/null
  ok "Created DB role filbucket"
else
  ok "DB role filbucket exists"
fi
if ! "$PG_BIN/psql" -d postgres -lqt | cut -d \| -f1 | grep -qw filbucket; then
  "$PG_BIN/psql" -d postgres -c "CREATE DATABASE filbucket OWNER filbucket;" >/dev/null
  ok "Created DB filbucket"
else
  ok "DB filbucket exists"
fi

# MinIO bucket
if ! /opt/homebrew/bin/mc alias list local 2>/dev/null | grep -q filbucket-hot; then
  /opt/homebrew/bin/mc alias set local http://localhost:9000 filbucket filbucketsecret >/dev/null 2>&1 || true
fi
/opt/homebrew/bin/mc mb --ignore-existing local/filbucket-hot >/dev/null 2>&1 && \
  ok "MinIO bucket filbucket-hot ready"

# ─── clone + build ───────────────────────────────────────────────────────
step "Fetching FilBucket source"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  ok "Repo already cloned at $INSTALL_DIR"
  (cd "$INSTALL_DIR" && git fetch --quiet && git checkout --quiet "$GIT_REF" && git pull --quiet --ff-only) && \
    ok "Updated to latest $GIT_REF"
else
  spinner "Cloning $REPO_URL" git clone --depth 1 --branch "$GIT_REF" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

spinner "Installing workspace dependencies" pnpm install --silent

# ─── ops wallet ──────────────────────────────────────────────────────────
step "Ops wallet"

ENV_FILE="$INSTALL_DIR/.env"

if [[ -f "$ENV_FILE" ]] && grep -q '^FILBUCKET_OPS_PK=0x[0-9a-fA-F]' "$ENV_FILE"; then
  ok ".env exists with an ops wallet"
else
  info "FilBucket needs a Filecoin calibration wallet (tFIL + USDFC)."
  info "We can generate one now; you'll fund it from the calibration faucets."

  if ask "Generate a fresh ops wallet?" y; then
    # Generate wallet via the server app (viem already installed).
    PK_FILE="$(mktemp)"
    ( cd apps/server && node -e "
      const { generatePrivateKey, privateKeyToAccount } = require('viem/accounts');
      const pk = generatePrivateKey();
      const addr = privateKeyToAccount(pk).address;
      const fs = require('fs');
      fs.writeFileSync(process.argv[1], pk + '\n' + addr);
    " "$PK_FILE" )
    OPS_PK="$(sed -n 1p "$PK_FILE")"
    OPS_ADDR="$(sed -n 2p "$PK_FILE")"
    rm -f "$PK_FILE"

    # Write .env (only if not already present).
    if [[ ! -f "$ENV_FILE" ]]; then
      cp "$INSTALL_DIR/.env.example" "$ENV_FILE" 2>/dev/null || true
    fi
    touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
    # Upsert the key variables.
    update_env() {
      local key="$1" val="$2"
      if grep -q "^$key=" "$ENV_FILE"; then
        # macOS sed inline
        sed -i '' "s|^$key=.*|$key=$val|" "$ENV_FILE"
      else
        echo "$key=$val" >> "$ENV_FILE"
      fi
    }
    update_env FILBUCKET_OPS_PK "$OPS_PK"
    update_env FILBUCKET_OPS_ADDRESS "$OPS_ADDR"
    update_env FILBUCKET_CHAIN calibration
    update_env FILBUCKET_RPC_URL https://api.calibration.node.glif.io/rpc/v1
    update_env DATABASE_URL 'postgres://filbucket:filbucket@localhost:5432/filbucket'
    update_env REDIS_URL 'redis://localhost:6379'
    update_env S3_ENDPOINT http://localhost:9000
    update_env S3_REGION us-east-1
    update_env S3_ACCESS_KEY filbucket
    update_env S3_SECRET_KEY filbucketsecret
    update_env S3_BUCKET filbucket-hot
    update_env S3_FORCE_PATH_STYLE true
    update_env SERVER_PORT 4000
    update_env WEB_PORT 3010
    update_env NEXT_PUBLIC_API_URL http://localhost:4000

    ok "Wallet generated — address: ${BOLD}$OPS_ADDR${RESET}"
    echo
    info "Faucets are rate-limited but normally hands-free in a real browser."
    info "We'll open both, you paste ⌘V, click submit. Done."
    echo
    if ask "Open faucets in browser and wait for funding?" y; then
      # Put the address on the clipboard so the user only has to ⌘V it.
      if command -v pbcopy >/dev/null 2>&1; then
        printf '%s' "$OPS_ADDR" | pbcopy
        ok "Address copied to clipboard."
      fi
      open "https://faucet.calibnet.chainsafe-fil.io/funds.html" 2>/dev/null || true
      sleep 2
      open "https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc" 2>/dev/null || true
      info "  Two browser tabs opened. In each: ⌘V → click submit."
      info "  Polling chain every 10s. Ctrl-C to skip and finish later."
      echo
      if poll_balances "$OPS_ADDR"; then
        # Wallet is funded — chain it into setup-wallet so the user can boot dev right away.
        echo
        step "Running setup-wallet"
        ( cd "$INSTALL_DIR" && pnpm --filter @filbucket/server setup-wallet 2>&1 | tail -20 ) && \
          ok "Ops wallet is approved + ready for uploads"
        WALLET_READY=1
      else
        warn "Polling cancelled."
      fi
    else
      warn "Skipping. Fund manually before first upload:"
      info "  tFIL  →  https://faucet.calibnet.chainsafe-fil.io/funds.html"
      info "  USDFC →  https://forest-explorer.chainsafe.dev/faucet/calibnet_usdfc"
    fi
    echo
    info "Then run:  ${BOLD}cd $INSTALL_DIR && pnpm --filter @filbucket/server setup-wallet${RESET}"
  fi
fi

# ─── schema + seed ───────────────────────────────────────────────────────
step "Applying schema"

spinner "Running Drizzle migrations" bash -c "cd '$INSTALL_DIR' && pnpm --filter @filbucket/server exec drizzle-kit push --force"

# Seed if no dev user yet.
if ! grep -q '^DEV_USER_ID=[0-9a-f-]' "$ENV_FILE" 2>/dev/null; then
  SEED_OUT="$(cd "$INSTALL_DIR" && pnpm --filter @filbucket/server db:seed 2>&1 | tail -6)"
  DEV_USER="$(echo "$SEED_OUT" | grep 'DEV_USER_ID=' | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  BUCKET_ID="$(echo "$SEED_OUT" | grep 'NEXT_PUBLIC_DEFAULT_BUCKET_ID=' | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  if [[ -n "$DEV_USER" ]] && [[ -n "$BUCKET_ID" ]]; then
    update_env() {
      local key="$1" val="$2"
      if grep -q "^$key=" "$ENV_FILE"; then
        sed -i '' "s|^$key=.*|$key=$val|" "$ENV_FILE"
      else
        echo "$key=$val" >> "$ENV_FILE"
      fi
    }
    update_env DEV_USER_ID "$DEV_USER"
    update_env NEXT_PUBLIC_DEV_USER_ID "$DEV_USER"
    update_env NEXT_PUBLIC_DEFAULT_BUCKET_ID "$BUCKET_ID"
    ok "Seeded dev user + default bucket"
  else
    warn "Seed ran but ids didn't parse — run it manually if the library shows empty."
  fi
else
  ok "Dev user already configured"
fi

# ─── all done ────────────────────────────────────────────────────────────
cat <<EOF

${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}
${BOLD}${CREAM}  FilBucket is installed.${RESET}
${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}

  Repo:    ${BOLD}$INSTALL_DIR${RESET}
  Web:     ${BOLD}${BLUE}http://localhost:3010${RESET}
  API:     ${BOLD}${BLUE}http://localhost:4000${RESET}
  Console: ${BOLD}${BLUE}http://localhost:9001${RESET}  ${DIM}(minio, filbucket / filbucketsecret)${RESET}

${BOLD}Next:${RESET}
$(if [[ "${WALLET_READY:-0}" != "1" ]]; then cat <<NEXT
  ${DIM}# One-time: fund the ops wallet + approve FWSS operator${RESET}
  cd $INSTALL_DIR
  pnpm --filter @filbucket/server setup-wallet

  ${DIM}# Then boot the stack${RESET}
NEXT
fi)
  pnpm dev

${BOLD}Native Mac app:${RESET}
  cd apps/mac && ./Scripts/compile_and_run.sh

${DIM}Docs: https://docs.filbucket.ai${RESET}
${DIM}Source: https://github.com/Reiers/filbucket${RESET}

EOF

if ask "Launch \`pnpm dev\` now?" n; then
  exec pnpm -C "$INSTALL_DIR" dev
fi
