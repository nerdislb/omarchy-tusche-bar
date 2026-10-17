# Omi follows your shell: source this from ~/.bashrc, after any other prompt setup (starship, direnv, ...),
# because it has to run last:
#
#   source /path/to/omarchy-tusche-bar/setup/omi-shell.bash
#
# A command that runs longer than OMI_AFTER seconds (2) makes the shared Omi busy (thinking); when it ends
# Omi is happy (success) for a moment, or sad when it failed, then idle again. A command stopped with
# Ctrl+C just goes back to idle, and closing the shell while one runs leaves Omi idle, not busy.
# The shared Omi lives in the shell's Omi seal (option "Omi follows the shared Omi"); this needs socat or
# nc to reach it and does nothing without them or without the service.
#
#   omi thinking        set the shared Omi by hand
#   omi laughing 2      for 2 seconds, then back to idle
#
# Settings, before sourcing:  OMI_AFTER=2 (seconds before a command counts as long), OMI_BUSY=thinking
#
# The idea and the shape follow upstream's examples/bash/omi.bashrc (tahayvr/omi, MIT), which this adds
# the exit handling to: upstream's timer outlives the shell, so `exit` left Omi thinking for good.

[[ $- == *i* ]] || return 0
[[ -z ${__omi_hooked-} ]] || return 0
__omi_hooked=1

: "${OMI_AFTER:=2}" "${OMI_BUSY:=thinking}"

# Where the service listens: $OMI_SOCKET, else $XDG_RUNTIME_DIR/omi.sock.
__omi_socket() {
  if [[ -n ${OMI_SOCKET-} ]]; then echo "$OMI_SOCKET"
  elif [[ -n ${XDG_RUNTIME_DIR-} ]]; then echo "$XDG_RUNTIME_DIR/omi.sock"
  fi
}
# One message, in the background so the prompt never waits for it.
__omi_send() {
  local sock
  sock=$(__omi_socket)
  [[ -n $sock && -S $sock ]] || return 0
  if command -v socat >/dev/null; then
    (printf '%s\n' "$1" | socat -t 1 - "UNIX-CONNECT:$sock" >/dev/null 2>&1 &)
  elif command -v nc >/dev/null; then
    (printf '%s\n' "$1" | nc -U -w 1 "$sock" >/dev/null 2>&1 &)
  fi
}
# omi <mode> [seconds]: set the shared Omi, for that long and then idle
omi() {
  [[ -n ${1-} ]] || { echo "usage: omi <mode> [seconds]" >&2; return 1; }
  [[ $1 =~ ^[A-Za-z0-9-]+$ ]] || { echo "omi: not a mode id" >&2; return 1; }
  if [[ -n ${2-} ]]; then
    [[ $2 =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo "omi: seconds expected" >&2; return 1; }
    __omi_send "{\"type\":\"set\",\"mode\":\"$1\",\"for\":$2,\"then\":\"idle\"}"
  else
    __omi_send "{\"type\":\"set\",\"mode\":\"$1\"}"
  fi
}

# Before a command (the DEBUG trap) and after it (PROMPT_COMMAND). Only the first simple command of a line
# starts the timer; the prompt's own commands, from __omi_status (the first) to __omi_prompt (the last), do not.
__omi_armed=0 __omi_running=0 __omi_busy=0 __omi_code=0 __omi_start=0 __omi_timer=""
__omi_before() {
  if [[ $BASH_COMMAND == __omi_status ]]; then __omi_armed=0; return; fi
  ((__omi_armed)) || return
  [[ -n ${COMP_LINE-} ]] && return # tab completion
  __omi_armed=0 __omi_running=1 __omi_busy=0 __omi_start=$SECONDS
  # busy once the command has run OMI_AFTER seconds; __omi_prompt stops this if it ends sooner
  { (sleep "$OMI_AFTER" && omi "$OMI_BUSY") & } 2>/dev/null
  __omi_timer=$!
  disown "$__omi_timer" 2>/dev/null
}
__omi_status() { __omi_code=$?; return $__omi_code; }
__omi_prompt() {
  if ((__omi_running)); then
    __omi_running=0
    kill "$__omi_timer" 2>/dev/null
    if ((SECONDS - __omi_start >= OMI_AFTER)); then
      case $__omi_code in
        0) omi success 2 ;;
        130) omi idle ;;
        *) omi sad 3 ;;
      esac
    fi
  fi
  __omi_armed=1
  return $__omi_code
}
# The shell ends (exit, a closed terminal): the timer must not fire for a shell that is gone, and Omi
# must not stay busy for a command that will never finish.
__omi_exit() {
  kill "$__omi_timer" 2>/dev/null
  if ((__omi_running)) && ((SECONDS - __omi_start >= OMI_AFTER)); then omi idle; fi
}

__omi_pc=${PROMPT_COMMAND-}
while [[ $__omi_pc == *[\;\ ] ]]; do __omi_pc=${__omi_pc%?}; done
PROMPT_COMMAND="__omi_status${__omi_pc:+;$__omi_pc};__omi_prompt"
unset __omi_pc
trap __omi_before DEBUG
trap __omi_exit EXIT
