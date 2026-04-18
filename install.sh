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

${BLUE}         __________________${RESET}          ${BOLD}${CREAM}FilBucket${RESET}
${BLUE}        (                  )${RESET}         ${DIM}Dropbox for Filecoin.${RESET}
${BLUE}       ${CYAN}████████${CREAM} ƒ ${CYAN}████████${RESET}
${BLUE}       ${CYAN}██████████████████${RESET}          ${INK}one‑line install • calibration${RESET}
${BLUE}        ${CYAN}████████████████${RESET}
${BLUE}         ${CYAN}██████████████${RESET}
${BLUE}          ‾‾‾‾‾‾‾‾‾‾‾‾${RESET}

EOF
}

# Pick a quirky storage quote for the install finale.
filbucket_quote() {
  local quotes=(
    "Bits weigh less when somebody else holds them."
    "A file saved is a future self thanking a past self."
    "The only good hard drive is a proven one."
    "Storage is free. Retrieval is character."
    "Entropy is real; redundancy is polite."
    "Every upload is a small act of faith."
    "Filecoin never forgets. Don't test it."
    "Durability is just thoughtfulness, at scale."
    "One copy is a prayer. Two copies is a plan."
    "The bucket is deep. The bucket is patient."
    "Your files, kept safe in the background."
    "Cryptographic proofs, warm like bread."
    "Petabytes come and go. The hash remains."
    "Treat storage like a library, not a landfill."
    "Don't trust, verify. Then upload anyway."
    "PDP: Please Don't Panic."
    "The blockchain is the promise. The SP is the person."
  )
  # /dev/urandom + awk trick so bash versions without RANDOM behave
  local n=${#quotes[@]}
  local i=$(( $(od -An -N2 -tu2 /dev/urandom 2>/dev/null | tr -d ' ' || echo 0) % n ))
  printf '%s' "${quotes[$i]}"
}
FB_QUOTE="$(filbucket_quote)"
export FB_QUOTE

step()  { printf "${BOLD}${BLUE}▸${RESET} %s\n" "$*"; }
ok()    { printf "  ${GREEN}✓${RESET} ${DIM}%s${RESET}\n" "$*"; }
warn()  { printf "  ${ORANGE}!${RESET} %s\n" "$*"; }
fail()  { printf "  ${RED}✗${RESET} ${BOLD}%s${RESET}\n" "$*"; exit 1; }
info()  { printf "  ${DIM}%s${RESET}\n" "$*"; }
ask()   {
  local prompt="$1" default="${2:-y}" answer
  if [[ "${FILBUCKET_YES:-}" == "1" ]]; then return 0; fi
  # If we have no controlling TTY (e.g. `curl | bash` in some shells, or piped
  # stdin from a script), fall back to the default rather than dying.
  if [[ ! -r /dev/tty ]]; then
    [[ "$default" == "y" ]] && return 0 || return 1
  fi
  if [[ "$default" == "y" ]]; then
    printf "  ${CYAN}?${RESET} %s ${DIM}[Y/n]${RESET} " "$prompt"
  else
    printf "  ${CYAN}?${RESET} %s ${DIM}[y/N]${RESET} " "$prompt"
  fi
  read -r answer </dev/tty 2>/dev/null || answer=""
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

# Read just the tFIL balance.
read_fil() {
  ( cd "$INSTALL_DIR/apps/server" && node -e "
    const { createPublicClient, http, formatEther } = require('viem');
    const { filecoinCalibration } = require('viem/chains');
    const c = createPublicClient({ chain: filecoinCalibration, transport: http('https://api.calibration.node.glif.io/rpc/v1') });
    c.getBalance({ address: process.argv[1] }).then(b => console.log(formatEther(b))).catch(() => console.log('0'));
  " "$1" 2>/dev/null )
}

read_usdfc() {
  ( cd "$INSTALL_DIR/apps/server" && node -e "
    const { createPublicClient, http, formatUnits } = require('viem');
    const { filecoinCalibration } = require('viem/chains');
    const c = createPublicClient({ chain: filecoinCalibration, transport: http('https://api.calibration.node.glif.io/rpc/v1') });
    const USDFC = '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0';
    c.readContract({ address: USDFC, abi: [{ name:'balanceOf', type:'function', stateMutability:'view', inputs:[{name:'a',type:'address'}], outputs:[{type:'uint256'}] }], functionName:'balanceOf', args:[process.argv[1]] }).then(b => console.log(formatUnits(b, 18))).catch(() => console.log('0'));
  " "$1" 2>/dev/null )
}

# Poll for tFIL only (after the faucet step). Optional 2nd arg overrides timeout.
poll_tfil() {
  local addr="$1"
  local timeout="${2:-${FILBUCKET_FAUCET_TIMEOUT:-600}}"
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local start=$(date +%s)
  local i=0
  trap 'printf "\n"; trap - INT; return 130' INT
  while true; do
    local elapsed=$(( $(date +%s) - start ))
    (( elapsed > timeout )) && { printf "\n"; warn "Timed out after ${timeout}s."; trap - INT; return 1; }
    if (( elapsed % 10 == 0 )) || (( i == 0 )); then
      local bal
      bal=$(read_fil "$addr")
      [[ "$bal" =~ ^[0-9]+\.[0-9]{0,4} ]] && bal="${BASH_REMATCH[0]}"
      bal=$(printf '%s' "$bal" | sed -E 's/0+$//; s/\.$//')
      [[ -z "$bal" ]] && bal="0"
      if [[ "$bal" != "0" ]]; then
        printf "\n"
        ok "tFIL landed! $bal tFIL"
        trap - INT
        return 0
      fi
    fi
    printf "\r  ${BLUE}%s${RESET} waiting on tFIL  ${RED}·${RESET} ${BOLD}%s${RESET}  ${DIM}(%ss)${RESET}    " \
      "${frames[$((i % 10))]}" "${bal:-0}" "$elapsed"
    sleep 1
    i=$((i + 1))
  done
}

# Poll for USDFC only (after mint or faucet drip). Optional 2nd arg overrides timeout.
poll_usdfc() {
  local addr="$1"
  local timeout="${2:-${FILBUCKET_FAUCET_TIMEOUT:-900}}"
  local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  local start=$(date +%s)
  local i=0
  trap 'printf "\n"; trap - INT; return 130' INT
  while true; do
    local elapsed=$(( $(date +%s) - start ))
    (( elapsed > timeout )) && { printf "\n"; warn "Timed out after ${timeout}s."; trap - INT; return 1; }
    if (( elapsed % 10 == 0 )) || (( i == 0 )); then
      local bal
      bal=$(read_usdfc "$addr")
      [[ "$bal" =~ ^[0-9]+\.[0-9]{0,4} ]] && bal="${BASH_REMATCH[0]}"
      bal=$(printf '%s' "$bal" | sed -E 's/0+$//; s/\.$//')
      [[ -z "$bal" ]] && bal="0"
      if [[ "$bal" != "0" ]]; then
        printf "\n"
        ok "USDFC landed! $bal USDFC"
        trap - INT
        return 0
      fi
    fi
    printf "\r  ${BLUE}%s${RESET} waiting on USDFC  ${RED}·${RESET} ${BOLD}%s${RESET}  ${DIM}(%ss)${RESET}    " \
      "${frames[$((i % 10))]}" "${bal:-0}" "$elapsed"
    sleep 1
    i=$((i + 1))
  done
}

# Legacy combined poller — kept for backward compat but unused in main flow now.
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
# minio is plain Homebrew formula now, not the legacy minio/stable/ tap.
if ! brew list minio            >/dev/null 2>&1; then to_install+=(minio); fi
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

# MinIO: run as a nohup background process under the user, not brew services.
# brew services + minio's launchd wiring is fragile (env vars don't carry, slow
# startup, opaque failures). A plain nohup with a launcher script is rock solid.
if curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
  ok "MinIO already responding on :9000"
else
  mkdir -p "$MINIO_DIR"
  LAUNCHER="$HOME/.filbucket/launch-minio.sh"
  mkdir -p "$(dirname "$LAUNCHER")"
  cat > "$LAUNCHER" <<MINIO_EOF
#!/usr/bin/env bash
export MINIO_ROOT_USER="${MINIO_ROOT_USER:-filbucket}"
export MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-filbucketsecret}"
exec /opt/homebrew/bin/minio server "$MINIO_DIR" --address :9000 --console-address :9001
MINIO_EOF
  chmod +x "$LAUNCHER"
  nohup "$LAUNCHER" > "$HOME/.filbucket/minio.log" 2>&1 &
  disown
  printf "  ${BLUE}⋯${RESET} ${DIM}Starting minio (this can take ~10s)${RESET}"
  for i in {1..40}; do
    if curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
      printf "\r  ${GREEN}✓${RESET} ${DIM}minio started (PID via nohup, logs in ~/.filbucket/minio.log)${RESET}%*s\n" 20 ''
      break
    fi
    printf "."
    sleep 0.5
  done
  if ! curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
    printf "\n"
    fail "minio didn't come up in 20s. Check ~/.filbucket/minio.log"
  fi
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
  EXISTING_ADDR="$(grep '^FILBUCKET_OPS_ADDRESS=' "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')"
  ok ".env exists with an ops wallet (${EXISTING_ADDR:-address not stored})"

  # Even if the wallet's there, check whether it's funded + approved. If yes,
  # nothing to do. If no, walk the user through the funding flow.
  if [[ -n "$EXISTING_ADDR" ]]; then
    EX_FIL="$(read_fil "$EXISTING_ADDR")"
    EX_USDFC="$(read_usdfc "$EXISTING_ADDR")"
    EX_FIL_HUMAN="${EX_FIL%.*}"
    EX_USDFC_HUMAN="${EX_USDFC%.*}"
    info "  Current chain balances:  tFIL ${BOLD}${EX_FIL_HUMAN}${RESET}   USDFC ${BOLD}${EX_USDFC_HUMAN}${RESET}"
    if [[ "$EX_FIL_HUMAN" == "0" ]] || [[ "$EX_USDFC_HUMAN" == "0" ]]; then
      warn "Wallet exists but isn't fully funded yet — finishing the funding now."

      # Try the FilBucket faucet first if BOTH are missing (clean fresh wallet).
      # Single drip covers tFIL + USDFC.
      if [[ "$EX_FIL_HUMAN" == "0" ]] && [[ "$EX_USDFC_HUMAN" == "0" ]]; then
        echo
        step "Trying FilBucket faucet (one-shot tFIL + USDFC drip)"
        FAUCET_URL="${FILBUCKET_FAUCET_URL:-http://157.180.16.39:8002}"
        info "  Hitting $FAUCET_URL/drip…"
        DRIP_RESP="$(curl -sS -X POST "$FAUCET_URL/drip" \
          -H 'content-type: application/json' \
          -d "{\"address\":\"$EXISTING_ADDR\"}" 2>&1)"
        DRIP_OK="$(printf '%s' "$DRIP_RESP" | grep -o '"ok":true' || true)"
        if [[ -n "$DRIP_OK" ]]; then
          ok "Faucet drip sent. Both txs broadcast."
          info "  Waiting for confirmation (~30-60s on calibration)…"
          sleep 30
          poll_tfil "$EXISTING_ADDR" 60 || true
          poll_usdfc "$EXISTING_ADDR" 60 || true
        else
          warn "Faucet unavailable. Response: $DRIP_RESP"
        fi
      fi

      # Re-read balances after the drip attempt.
      EX_FIL="$(read_fil "$EXISTING_ADDR")"
      EX_USDFC="$(read_usdfc "$EXISTING_ADDR")"
      EX_FIL_HUMAN="${EX_FIL%.*}"
      EX_USDFC_HUMAN="${EX_USDFC%.*}"

      # If we still need tFIL, the user has to do the faucet click — the
      # FilBucket faucet won't drip again to the same address.
      if [[ "$EX_FIL_HUMAN" == "0" ]]; then
        echo
        warn "Still no tFIL. Open the chainsafe faucet manually:"
        if command -v pbcopy >/dev/null 2>&1; then
          printf '%s' "$EXISTING_ADDR" | pbcopy
          ok "  Address copied to clipboard."
        fi
        open "https://faucet.calibnet.chainsafe-fil.io/funds.html" 2>/dev/null || true
        info "  ⌘V → click Send Funds. Polling chain every 10s."
        poll_tfil "$EXISTING_ADDR" || true
        EX_FIL="$(read_fil "$EXISTING_ADDR")"
        EX_FIL_HUMAN="${EX_FIL%.*}"
      fi

      # If we have tFIL but no USDFC, try the FilBucket faucet first (cheap,
      # no collateral lock). Only fall back to the Trove mint if the faucet
      # rejects (already used, dry, etc.).
      if [[ "$EX_FIL_HUMAN" != "0" ]] && [[ "$EX_USDFC_HUMAN" == "0" ]]; then
        echo
        step "Trying FilBucket faucet for the USDFC top-up"
        FAUCET_URL="${FILBUCKET_FAUCET_URL:-http://157.180.16.39:8002}"
        DRIP_RESP="$(curl -sS -X POST "$FAUCET_URL/drip" \
          -H 'content-type: application/json' \
          -d "{\"address\":\"$EXISTING_ADDR\"}" 2>&1)"
        DRIP_OK="$(printf '%s' "$DRIP_RESP" | grep -o '"ok":true' || true)"
        if [[ -n "$DRIP_OK" ]]; then
          ok "Faucet drip sent. Waiting for USDFC to land…"
          sleep 30
          poll_usdfc "$EXISTING_ADDR" 60 || true
        else
          warn "Faucet declined: $DRIP_RESP"
          # Fall back to Trove mint — needs ~200 tFIL of collateral, so check first.
          EX_FIL="$(read_fil "$EXISTING_ADDR")"
          EX_FIL_INT="${EX_FIL%.*}"
          if [[ "${EX_FIL_INT:-0}" -lt 200 ]]; then
            warn "Need at least 200 tFIL to mint USDFC via Trove (you have $EX_FIL_INT)."
            info "  Get more tFIL from https://faucet.calibnet.chainsafe-fil.io/funds.html and re-run."
          else
            echo
            step "Minting USDFC via Trove (collateralizes ~150 tFIL)"
            if ( cd "$INSTALL_DIR" && pnpm --filter @filbucket/server mint-usdfc 2>&1 | tail -25 ); then
              ok "USDFC minted"
            else
              warn "USDFC mint failed. Retry: cd $INSTALL_DIR && pnpm --filter @filbucket/server mint-usdfc"
            fi
          fi
        fi
      fi

      # And finally, approve FWSS.
      echo
      step "Running setup-wallet (Filecoin Pay + FWSS approval)"
      if ( cd "$INSTALL_DIR" && pnpm --filter @filbucket/server setup-wallet 2>&1 | tail -20 ); then
        ok "Ops wallet approved + ready for uploads"
        WALLET_READY=1
      fi
    fi
  fi
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
    # In non-interactive mode (FILBUCKET_YES=1) we deliberately skip the browser
    # step — there's no human to click submit, so polling would just hang. Print
    # the funding instructions and continue.
    if [[ "${FILBUCKET_YES:-}" == "1" ]]; then
      warn "Non-interactive mode — skipping wallet funding."
      info "  Fund + boot manually:"
      info "  1. Get tFIL: paste address at https://faucet.calibnet.chainsafe-fil.io/funds.html"
      info "  2. cd $INSTALL_DIR && pnpm --filter @filbucket/server mint-usdfc"
      info "  3. cd $INSTALL_DIR && pnpm --filter @filbucket/server setup-wallet"
      info "  Address: ${BOLD}$OPS_ADDR${RESET}"
    elif ask "Fund the wallet now?" y; then
      echo
      step "Trying FilBucket faucet (one-shot tFIL + USDFC drip)"
      FAUCET_URL="${FILBUCKET_FAUCET_URL:-http://157.180.16.39:8002}"
      info "  Hitting $FAUCET_URL/drip…"
      DRIP_RESP="$(curl -sS -X POST "$FAUCET_URL/drip" \
        -H 'content-type: application/json' \
        -d "{\"address\":\"$OPS_ADDR\"}" 2>&1)"
      DRIP_OK="$(printf '%s' "$DRIP_RESP" | grep -o '"ok":true' || true)"
      if [[ -n "$DRIP_OK" ]]; then
        ok "Faucet drip sent. Both txs broadcast."
        info "  Waiting for confirmation (calibration ~30-60s)…"
        # Quick poll for both balances.
        sleep 30
        if poll_tfil "$OPS_ADDR" 60 && poll_usdfc "$OPS_ADDR" 60; then
          ok "Wallet funded via FilBucket faucet."
        fi
      else
        warn "Faucet unavailable. Falling back to manual tFIL + Trove mint."
        info "  Faucet response: $DRIP_RESP"
        echo
        if command -v pbcopy >/dev/null 2>&1; then
          printf '%s' "$OPS_ADDR" | pbcopy
          ok "Address copied to clipboard."
        fi
        open "https://faucet.calibnet.chainsafe-fil.io/funds.html" 2>/dev/null || true
        info "  Browser opened. ⌘V to paste address → click Send Funds (100 tFIL)."
        info "  Polling chain every 10s for tFIL. Ctrl-C to skip."
        echo
        if poll_tfil "$OPS_ADDR"; then
          echo
          step "Minting USDFC by collateralizing tFIL (Trove fallback)"
          info "  Deposits ~150 tFIL of collateral, borrows 220 USDFC. ~90s."
          echo
          if ( cd "$INSTALL_DIR" && pnpm --filter @filbucket/server mint-usdfc 2>&1 | tail -25 ); then
            ok "USDFC minted via Trove"
          else
            warn "USDFC mint failed. Retry: cd $INSTALL_DIR && pnpm --filter @filbucket/server mint-usdfc"
          fi
        else
          warn "tFIL polling cancelled."
        fi
      fi
      # Either path: try setup-wallet now if we have funds.
      echo
      step "Running setup-wallet (Filecoin Pay + FWSS approval)"
      if ( cd "$INSTALL_DIR" && pnpm --filter @filbucket/server setup-wallet 2>&1 | tail -20 ); then
        ok "Ops wallet is approved + ready for uploads"
        WALLET_READY=1
      fi
    else
      warn "Skipping. Fund + boot manually before first upload:"
      info "  1. tFIL: paste $OPS_ADDR at https://faucet.calibnet.chainsafe-fil.io/funds.html"
      info "  2. cd $INSTALL_DIR && pnpm --filter @filbucket/server mint-usdfc"
      info "  3. cd $INSTALL_DIR && pnpm --filter @filbucket/server setup-wallet"
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

# ─── all done ──────────────────────────────────────────────────────────
cat <<EOF

${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}
${BOLD}${CREAM}  Your bucket is ready.${RESET}  ${DIM}Go fill it up.${RESET}
${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}

${BLUE}           _____________________${RESET}
${BLUE}          (                     )${RESET}        ${DIM}${FB_QUOTE}${RESET}
${BLUE}        ${CYAN}▓▓▓▓▓▓▓▓▓▓${CREAM} ƒ ${CYAN}▓▓▓▓▓▓▓▓▓▓${RESET}
${BLUE}        ${CYAN}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${RESET}
${BLUE}         ${CYAN}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${RESET}
${BLUE}          ${CYAN}▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓${RESET}
${BLUE}           ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾${RESET}

  ${BOLD}Repo${RESET}     $INSTALL_DIR
  ${BOLD}Web${RESET}      ${BLUE}http://localhost:3010${RESET}
  ${BOLD}API${RESET}      ${BLUE}http://localhost:4000${RESET}
  ${BOLD}Console${RESET}  ${BLUE}http://localhost:9001${RESET}  ${DIM}(minio · filbucket / filbucketsecret)${RESET}

EOF

# Conditional "next steps" block — only shown if wallet isn't fully ready.
if [[ "${WALLET_READY:-0}" != "1" ]]; then
  cat <<EOF
  ${BOLD}Next${RESET}
  ${DIM}# fund the ops wallet + approve FWSS (one-time)${RESET}
  cd $INSTALL_DIR && pnpm --filter @filbucket/server setup-wallet

EOF
fi

cat <<EOF
  ${DIM}Source: https://github.com/Reiers/filbucket${RESET}

EOF

# ─── auto-boot dev stack ───────────────────────────────────────────
LOG_DIR="$HOME/.filbucket"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev.log"
PID_FILE="$LOG_DIR/dev.pid"

# Double-check the web env vars exist in .env; Next.js crashes in silence
# if NEXT_PUBLIC_DEV_USER_ID or NEXT_PUBLIC_DEFAULT_BUCKET_ID are missing.
WEB_ENV_OK=1
for v in NEXT_PUBLIC_DEV_USER_ID NEXT_PUBLIC_DEFAULT_BUCKET_ID NEXT_PUBLIC_API_URL; do
  if ! grep -q "^$v=[^[:space:]].*" "$ENV_FILE" 2>/dev/null; then
    warn "$v missing from .env — web will compile but show an empty library."
    WEB_ENV_OK=0
  fi
done
[[ "$WEB_ENV_OK" == "1" ]] && ok "Web env vars look good"

# Kill any stale pnpm-dev / next-dev / tsx-watch from prior installer attempts.
# This is the #1 source of port :3010 / :4000 conflicts.
if lsof -nP -iTCP:3010 -sTCP:LISTEN 2>/dev/null | grep -q node; then
  warn "Something's already on :3010 — killing it first"
  lsof -nP -iTCP:3010 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u | xargs -r kill -9 2>/dev/null || true
  sleep 1
fi
if lsof -nP -iTCP:4000 -sTCP:LISTEN 2>/dev/null | grep -q node; then
  warn "Something's already on :4000 — killing it first"
  lsof -nP -iTCP:4000 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u | xargs -r kill -9 2>/dev/null || true
  sleep 1
fi

step "Starting the dev stack in the background"
# macOS default ulimit -n is 256 which Next.js watcher blows through immediately.
# Bump to 10240 for the child process.
(
  ulimit -n 10240 2>/dev/null || true
  cd "$INSTALL_DIR"
  nohup pnpm dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  disown $! 2>/dev/null || true
)
ok "Launched (log: $LOG_FILE)"
info "  Waiting for web :3010 to respond (up to 90s)…"
READY=0
for i in {1..90}; do
  if curl -sf http://localhost:3010 >/dev/null 2>&1; then READY=1; break; fi
  # Early-exit if the process died.
  if [[ -f "$PID_FILE" ]] && ! kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [[ "$READY" == "1" ]]; then
  ok "Web is up at ${BLUE}http://localhost:3010${RESET}"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    open http://localhost:3010 2>/dev/null || true
  fi
else
  warn "Web didn't respond. Last 30 lines of the log:"
  echo
  tail -30 "$LOG_FILE" 2>/dev/null | sed 's/^/    /'
  echo
  info "  Full log:  tail -f $LOG_FILE"
  info "  Retry:     cd $INSTALL_DIR && pnpm dev"
fi

cat <<EOF

${DIM}──────────────────────────────────────────────────────${RESET}
  ${BOLD}Controls${RESET}
  ${DIM}· Stop:     kill \$(cat $PID_FILE)${RESET}
  ${DIM}· Logs:     tail -f $LOG_FILE${RESET}
  ${DIM}· Restart:  kill \$(cat $PID_FILE); cd $INSTALL_DIR && pnpm dev${RESET}

EOF

