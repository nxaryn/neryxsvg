import os
import socket
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from colorama import Fore, Style, init

HOST = "127.0.0.1"
LAN_HOST = "0.0.0.0"
PORT = 8000

init(autoreset=True)

RESET = Style.RESET_ALL
RED = Fore.RED
YELLOW = Fore.YELLOW
GREEN = Fore.GREEN
CYAN = Fore.CYAN
GREY = Fore.LIGHTBLACK_EX
WHITE = Fore.WHITE

def info(message):
    print(f"{GREY}[INFO]{RESET} {message}")
def success(message):
    print(f"{GREEN}[ OK ]{RESET} {message}")
def warning(message):
    print(f"{YELLOW}[WARN]{RESET} {message}")
def error(message):
    print(f"{RED}[ERR ]{RESET} {message}")
def command_log(message):
    print(f"{CYAN}[CMD ]{RESET} {message}")
def get_local_ip():
    """
    Gets the computer's LAN IPv4 address.
    """
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return "127.0.0.1"
def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        """
        Custom HTTP logging.
        2xx -> green
        3xx -> grey
        4xx -> red
        5xx -> red
        """
        try:
            code = int(args[1])
        except (IndexError, ValueError):
            code = 0
        message = format % args
        if 200 <= code < 300:
            color = GREEN
        elif 300 <= code < 400:
            color = GREY
        elif 400 <= code < 500:
            color = RED
        elif 500 <= code < 600:
            color = RED
        else:
            color = GREY
        print(f"{color}[HTTP]{RESET} {message}")
    def send_error(self, code, message=None, explain=None):
        """
        Custom error handling.

        404 uses the project's 404.html.
        Other errors use the normal Python handler.
        """
        if code == 404:
            self.send_response(404)
            self.send_header(
                "Content-Type",
                "text/html; charset=utf-8"
            )
            self.end_headers()
            error_page = os.path.join(
                os.getcwd(),
                "404.html"
            )
            if os.path.exists(error_page):
                try:
                    with open(error_page, "rb") as file:
                        self.wfile.write(file.read())
                    return
                except Exception as exc:
                    error(
                        f"Could not load 404.html: {exc}"
                    )
            # Fallback if 404.html doesn't exist
            fallback = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>404 - Not Found</title>
            </head>
            <body>
                <h1>404</h1>
                <p>The requested page could not be found.</p>
            </body>
            </html>
            """
            self.wfile.write(fallback.encode("utf-8"))
            return
        super().send_error(code, message, explain)
class ServerManager:
    def __init__(self):
        self.local_server = None
        self.lan_server = None
        self.local_thread = None
        self.lan_thread = None
        self.running = True
    def start_local(self):
        if self.local_server is not None:
            warning("Localhost server is already running.")
            return
        try:
            self.local_server = ThreadingHTTPServer(
                (HOST, PORT),
                Handler
            )
            self.local_thread = threading.Thread(
                target=self.local_server.serve_forever,
                daemon=True
            )
            self.local_thread.start()
            success(
                f"Localhost server started at "
                f"http://localhost:{PORT}"
            )
        except OSError as exc:
            error(
                f"Could not start localhost server: {exc}"
            )
            self.local_server = None
    def start_lan(self):
        if self.lan_server is not None:
            warning("Network hosting is already enabled.")
            return
        try:
            self.lan_server = ThreadingHTTPServer(
                (LAN_HOST, PORT),
                Handler
            )
            self.lan_thread = threading.Thread(
                target=self.lan_server.serve_forever,
                daemon=True
            )
            self.lan_thread.start()
            ip = get_local_ip()
            success("Network hosting enabled.")
            print(
                f"       {CYAN}LAN:{RESET} "
                f"http://{ip}:{PORT}"
            )
        except OSError as exc:
            error(
                f"Could not start network hosting: {exc}"
            )
            self.lan_server = None
    def stop_lan(self):
        if self.lan_server is None:
            warning("Network hosting is not running.")
            return
        info("Stopping network hosting...")
        try:
            self.lan_server.shutdown()
            self.lan_server.server_close()
        except Exception as exc:
            error(
                f"Error stopping network server: {exc}"
            )
        self.lan_server = None
        self.lan_thread = None
        success("Network hosting stopped.")
    def stop_local(self):
        if self.local_server is None:
            return
        info("Stopping localhost server...")
        try:
            self.local_server.shutdown()
            self.local_server.server_close()
        except Exception as exc:
            error(
                f"Error stopping localhost server: {exc}"
            )
        self.local_server = None
        self.local_thread = None
        success("Localhost server stopped.")
    def restart(self):
        lan_was_running = self.lan_server is not None
        info("Restarting server...")
        self.stop_lan()
        self.stop_local()
        time.sleep(0.25)
        self.start_local()
        if lan_was_running:
            self.start_lan()
        success("Server restart complete.")
    def status(self):
        print()
        print(f"{CYAN}Server Status{RESET}")
        print("--------------------------------")
        if self.local_server:
            print(
                f"{GREEN}●{RESET} localhost "
                f"http://localhost:{PORT}"
            )
        else:
            print(
                f"{RED}●{RESET} localhost OFF"
            )
        if self.lan_server:
            ip = get_local_ip()

            print(
                f"{GREEN}●{RESET} network "
                f"http://{ip}:{PORT}"
            )
        else:
            print(
                f"{GREY}●{RESET} network OFF"
            )
        print("--------------------------------")
        print()
    def shutdown(self):
        if not self.running:
            return
        self.running = False
        print()
        info("Shutting down server...")
        self.stop_lan()
        self.stop_local()
        print()
        success("Everything stopped.")
        info("Goodbye.")
def banner():
    print()
    print(f"{CYAN}███╗   ██╗ ██████╗ ██╗  ██╗ █████╗ ██████╗ ██╗   ██╗███╗   ██╗{RESET}")
    print(f"{CYAN}████╗  ██║██╔═══██╗╚██╗██╔╝██╔══██╗██╔══██╗╚██╗ ██╔╝████╗  ██║{RESET}")
    print(f"{CYAN}██╔██╗ ██║██║   ██║ ╚███╔╝ ███████║██████╔╝ ╚████╔╝ ██╔██╗ ██║{RESET}")
    print(f"{CYAN}██║╚██╗██║██║   ██║ ██╔██╗ ██╔══██║██╔══██╗  ╚██╔╝  ██║╚██╗██║{RESET}")
    print(f"{CYAN}██║ ╚████║╚██████╔╝██╔╝ ██╗██║  ██║██║  ██║   ██║   ██║ ╚████║{RESET}")
    print(f"{CYAN}╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═══╝{RESET}")
    print()
    print(f"{GREY}              N O X A R Y N   D E V   S E R V E R{RESET}")
    print()
def show_help():
    print()
    print(f"{CYAN}Available commands{RESET}")
    print("--------------------------------")
    print(f"{WHITE}host{RESET}       Start network hosting")
    print(f"{WHITE}host-stop{RESET}  Stop network hosting")
    print(f"{WHITE}status{RESET}      Show server status")
    print(f"{WHITE}ip{RESET}          Show LAN IP address")
    print(f"{WHITE}restart{RESET}     Restart the server")
    print(f"{WHITE}clear{RESET}       Clear terminal")
    print(f"{WHITE}help{RESET}        Show commands")
    print(f"{WHITE}stop{RESET}        Stop everything")
    print("--------------------------------")
    print()
def choose_mode():
    print(
        f"{WHITE}How do you want to run the server?{RESET}"
    )
    print()
    print(
        f"{CYAN}[1]{RESET} localhost only"
    )
    print(
        f"{CYAN}[2]{RESET} localhost + network"
    )
    print()
    while True:
        choice = input(
            f"{CYAN}server › {RESET}"
        ).strip().lower()
        if choice in ("1", "localhost", "local"):
            return "localhost"
        if choice in ("2", "network", "lan", "host"):
            return "network"
        warning("Please choose 1 or 2.")
def main():
    clear_screen()
    banner()
    mode = choose_mode()
    manager = ServerManager()
    print()
    manager.start_local()
    if mode == "network":
        manager.start_lan()
    print()
    info("Type 'help' for available commands.")
    print()
    try:
        while manager.running:
            try:
                command = input(
                    f"{CYAN}server › {RESET}"
                ).strip().lower()
            except EOFError:
                manager.shutdown()
                break
            if not command:
                continue
            if command == "host":
                command_log("Starting network hosting...")
                manager.start_lan()
            elif command == "host-stop":
                command_log("Stopping network hosting...")
                manager.stop_lan()
            elif command == "status":
                manager.status()
            elif command == "ip":
                ip = get_local_ip()
                print(
                    f"{GREY}Local network IP:{RESET} "
                    f"{CYAN}{ip}{RESET}"
                )
                if manager.lan_server:
                    print(
                        f"{GREY}Network URL:{RESET} "
                        f"{CYAN}http://{ip}:{PORT}{RESET}"
                    )
            elif command == "restart":
                manager.restart()
            elif command == "clear":
                clear_screen()
                banner()
            elif command == "help":
                show_help()
            elif command in ("stop", "exit", "quit"):
                manager.shutdown()
            else:
                warning(
                    f"Unknown command: '{command}'. "
                    "Type 'help' for commands."
                )
    except KeyboardInterrupt:
        print()
        warning("Ctrl+C detected.")
        manager.shutdown()
    except Exception as exc:
        print()
        error(f"Unexpected server error: {exc}")
        manager.shutdown()
if __name__ == "__main__":
    main()
