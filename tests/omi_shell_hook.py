#!/usr/bin/env python3
"""setup/omi-shell.bash against the real service (an isolated, offscreen Quickshell, see omi_share_runtime.py).

An interactive bash sources the hook and runs commands; a listening app sees what Omi is told:
  a quick command says nothing; a long one makes him think, then success (or sad when it failed) for a
  moment; and the shell ending, quietly or killed while busy, never leaves him busy.
"""
import os
from pathlib import Path
import pty
import signal
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import omi_share_runtime as share  # noqa: E402

HOOK = share.ROOT / 'setup/omi-shell.bash'


def bash(env, script):
    """An interactive bash fed a script on stdin, run to its end."""
    process = subprocess.Popen(['bash', '--norc', '-i'], stdin=subprocess.PIPE, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               start_new_session=True)   # (its own process group)
    process.stdin.write(script.encode())
    process.stdin.close()
    process.wait(timeout=40)


def terminal(env, script, close_after):
    """A bash on a real pty that is closed while it runs a command, as closing a terminal window does:
    the kernel hangs up the session (a bash without a terminal would just die, running no traps)."""
    pid, master = pty.fork()
    if pid == 0:
        os.environ.update(env)
        os.execvp('bash', ['bash', '--norc', '-i'])
    time.sleep(0.5)
    os.write(master, script.encode())
    time.sleep(close_after)
    os.close(master)
    deadline = time.time() + 10
    while time.time() < deadline:
        done, _ = os.waitpid(pid, os.WNOHANG)
        if done:
            return
        time.sleep(0.1)
    os.kill(pid, signal.SIGKILL)


def modes(client, wait=1.5):
    return [m.get('mode') for m in client.read(20, wait) if m.get('type') == 'state']


def run():
    if not share.shutil.which('quickshell'):
        print('SKIP: quickshell is not installed')
        return
    with tempfile.TemporaryDirectory(prefix='tusche-omi-hook-') as folder:
        os.chmod(folder, 0o700)
        shell = share.Shell(folder)
        try:
            shell.dump(lambda d: d['role'] == 'serving')
            client = share.Client(shell.sock)
            client.read()
            env = {**os.environ, 'OMI_SOCKET': str(shell.sock)}
            source = f'source {HOOK}\n'

            bash(env, source + 'true\nexit\n')
            assert modes(client, 3.5) == [], 'a quick command and exit say nothing'

            bash(env, source + 'sleep 3\nexit\n')
            seen = modes(client, 3.5)
            assert seen == ['thinking', 'success', 'idle'], seen

            bash(env, source + 'sleep 3; false\nexit\n')
            seen = modes(client, 5.5)
            assert seen == ['thinking', 'sad', 'idle'], seen

            bash(env, source + 'omi sad 1\nexit\n')
            assert modes(client, 2.5) == ['sad', 'idle'], 'omi <mode> <seconds> by hand'
            bash(env, source + 'omi "x\\"y"\nomi thinking nope\nexit\n')
            assert modes(client, 0.8) == [], 'a bad mode or seconds is refused by the function, nothing is sent'

            # killed (a closed terminal) while a long command runs: Omi is not left busy
            terminal(env, source + 'sleep 8\n', close_after=3.5)
            seen = modes(client, 2.0)
            assert seen[:1] == ['thinking'] and seen[-1] == 'idle', seen
            client.send({'type': 'get'})
            assert client.read()[0]['mode'] == 'idle'
            client.close()
            print('PASS: the shell hook (quick, long, failed, by hand, bad input, closed while busy)')
        finally:
            shell.stop()


if __name__ == '__main__':
    run()
