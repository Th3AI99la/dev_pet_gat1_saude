"""Serve somente os arquivos públicos do painel na máquina local."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Painel local PET-Saúde Clima")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    site = Path(__file__).resolve().parent / "site"
    if not (site / "index.html").is_file():
        parser.exit(1, "A pasta site está incompleta. Confira os arquivos do projeto.\n")
    handler = partial(SimpleHTTPRequestHandler, directory=str(site))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Painel local: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
