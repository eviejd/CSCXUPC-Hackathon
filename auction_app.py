
import time
import json
import random
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn


class User:
    def __init__(self, name, points): self.name = name.strip(
    ); self.points = int(points); self.assigned_tasks = []
    def tasks_assigned(self): return len(self.assigned_tasks)
    def to_dict(self): return {
        "name": self.name, "points": self.points, "assigned_tasks": list(self.assigned_tasks)}


class UserRegistry:
    def __init__(self, starting_points): self.users = {
    }; self.starting_points = int(starting_points)

    def ensure_user(self, name):
        k = (name or "").strip()
        if k not in self.users:
            self.users[k] = User(k, self.starting_points)
        return self.users[k]

    def list_users(self): return list(self.users.values())


class Bid:
    def __init__(self, user, bid_amount): self.user = user; self.bid_amount = int(
        bid_amount); self.timestamp_ms = int(time.time()*1000)


class Auction:
    def __init__(self, task, duration_seconds):
        self.task = task
        self.status = "open"
        self.ends_at_time = time.time()+max(1, int(duration_seconds))
        self.bids = {}
        self.assigned_user = None

    def is_open(self): return self.status == "open" and time.time(
    ) < self.ends_at_time

    def seconds_remaining(self): return max(
        0, int(self.ends_at_time-time.time())) if self.status == "open" else 0

    def place_bid(self, name, bid_amount, registry):
        if not self.is_open():
            raise ValueError("Auction is not open.")
        if bid_amount < 0:
            raise ValueError("Bid must be >= 0.")
        bidder = registry.ensure_user(name)
        if bid_amount > bidder.points:
            raise ValueError(f"Bid exceeds user's points ({bidder.points}).")
        self.bids[bidder.name] = Bid(bidder.name, bid_amount)

    def _pick_assignee_with_fair_tie(self, registry):
        bids = list(self.bids.values())
        lowest = min(b.bid_amount for b in bids)
        group = [b for b in bids if b.bid_amount == lowest]
        if len(group) == 1:
            return group[0].user
        users = [registry.ensure_user(b.user) for b in group]
        min_tasks = min(u.tasks_assigned() for u in users)
        fewest = [u.name for u in users if u.tasks_assigned() == min_tasks]
        return random.choice(fewest)

    def settle_now(self, registry):
        if self.status == "closed":
            return
        self.status = "closed"
        if not self.bids:
            self.assigned_user = None
            return
        self.assigned_user = self._pick_assignee_with_fair_tie(registry)
        assignee = registry.ensure_user(self.assigned_user)
        assignee.assigned_tasks.append(self.task)
        for b in self.bids.values():
            if b.user == self.assigned_user:
                continue
            user = registry.ensure_user(b.user)
            user.points = max(0, user.points-b.bid_amount)


class TurnController:
    def __init__(self, registry):
        self.registry = registry
        self.auction = None
        self.turn_order = []
        self.current_index = -1
        self.phase = "idle"
        self.phase_ends_at = None
        self.handover_seconds = 3
        self.bid_window_seconds = 5
        self.one_bid_per_user = True

    def start_round(self, task, order):
        self.auction = Auction(task=task, duration_seconds=3600)
        self.turn_order = [self.registry.ensure_user(n).name for n in order]
        self.current_index = 0 if self.turn_order else -1
        self.phase = "handover" if self.turn_order else "results"
        self.phase_ends_at = time.time() + (self.handover_seconds if self.turn_order else 0)

    def _active_user(self):
        return self.turn_order[self.current_index] if 0 <= self.current_index < len(self.turn_order) else None

    def _advance(self):
        if self.phase in ("idle", "results") or self.phase_ends_at is None:
            return
        now = time.time()
        if now < self.phase_ends_at:
            return
        if self.phase == "handover":
            self.phase = "bid"
            self.phase_ends_at = now+self.bid_window_seconds
            return
        if self.phase == "bid":
            self.current_index += 1
            if self.current_index < len(self.turn_order):
                self.phase = "handover"
                self.phase_ends_at = now+self.handover_seconds
                return
            self.auction.settle_now(self.registry)
            self.phase = "results"
            self.phase_ends_at = None

    def state(self):
        self._advance()
        left = int(self.phase_ends_at-time.time()) if self.phase_ends_at else 0
        left = max(0, left)
        return {
            "task": self.auction.task if self.auction else None,
            "phase": self.phase,
            "active_user": self._active_user(),
            "seconds_left": left,
            "bids": [{"name": b.user, "amount": b.bid_amount} for b in (self.auction.bids.values() if self.auction else [])],
            "assigned": self.auction.assigned_user if self.auction else None,
            "users": [u.to_dict() for u in self.registry.list_users()],
            "order": list(self.turn_order),
            "index": self.current_index
        }

    def bid_active(self, amount):
        self._advance()
        if self.phase != "bid":
            raise ValueError("Not in bid phase.")
        active = self._active_user()
        if not active:
            raise ValueError("No active user.")
        if self.one_bid_per_user and active in self.auction.bids:
            raise ValueError("Already bid.")
        self.auction.place_bid(active, int(amount), self.registry)


REGISTRY = UserRegistry(starting_points=100)
TURN = TurnController(REGISTRY)


def send_json(h, obj, status=200):
    data = json.dumps(obj).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json")
    h.send_header("Access-Control-Allow-Origin", "*")
    h.send_header("Content-Length", str(len(data)))
    h.end_headers()
    h.wfile.write(data)


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/state":
            send_json(self, {"ok": True, "state": TURN.state()})
            return
        self.send_error(404, "Not Found")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except:
            payload = {}
        if self.path == "/api/start_round":
            task = (payload.get("task") or "").strip()
            order = payload.get("order") or []
            if not task:
                send_json(self, {"ok": False, "error": "task required"}, 400)
                return
            if not isinstance(order, list) or not order:
                send_json(
                    self, {"ok": False, "error": "order (list) required"}, 400)
                return
            TURN.start_round(task, order)
            send_json(self, {"ok": True, "state": TURN.state()})
            return
        if self.path == "/api/bid":
            name = (payload.get("name") or "").strip()
            try:
                amount = int(payload.get("amount"))
            except:
                send_json(
                    self, {"ok": False, "error": "amount must be integer"}, 400)
                return
            if not name:
                send_json(self, {"ok": False, "error": "name required"}, 400)
                return
            try:
                TURN.bid(name, amount)
                send_json(self, {"ok": True, "state": TURN.state()})
            except Exception as e:
                send_json(self, {"ok": False, "error": str(
                    e), "state": TURN.state()}, 400)
            return
        self.send_error(404, "Not Found")


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    random.seed()
    srv = ThreadedHTTPServer(("127.0.0.1", 8080), Handler)
    print("Server on http://127.0.0.1:8080")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
