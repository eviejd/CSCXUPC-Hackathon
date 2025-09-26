# routes.py
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from enum import Enum
import threading
import time

from app import UserRegistry, TaskQueue, Auction, Auction_State

app = FastAPI(title="Task Auction API", version="1.1.3")

# ---- In-memory state ----
LOCK = threading.Lock()
REGISTRY = UserRegistry(starting_points=10)          # tests assume 10
QUEUE = TaskQueue()
AUCTIONS: Dict[str, Auction] = {}                    # auction_id -> Auction
AUCTION_PARTICIPANTS: Dict[str, List[str]] = {}      # optional allowlist per auction

# ---- Schemas ----
class NewTaskIn(BaseModel):
    auction_id: str = Field(min_length=1)
    task: str = Field(min_length=1)
    duration_seconds: int = Field(ge=1, description="Auction open window in seconds")
    participants: Optional[List[str]] = Field(default=None)

class BidIn(BaseModel):
    auction_id: str
    user: str
    bid_amount: int = Field(ge=0)                    # <<< tests send bid_amount

class BidOut(BaseModel):
    user: str
    bid_amount: int
    timestamp_ms: int

class AuctionStatus(str, Enum):
    SCHEDULED = "SCHEDULED"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"

class AuctionOut(BaseModel):
    auction_id: str
    task: str
    status: AuctionStatus
    ends_at_time: float                               # <<< tests expect ends_at_time
    seconds_remaining: int                            # <<< tests expect seconds_remaining
    bids: List[BidOut]                                # tests treat bids as a list
    assigned_user: Optional[str] = None
    participants: Optional[List[str]] = None

class LeaderboardRow(BaseModel):
    name: str
    points: int
    tasks_assigned: int

class LeaderboardOut(BaseModel):
    leaderboard: List[LeaderboardRow]

# ---- helpers ----
def _to_status(a: Auction) -> AuctionStatus:
    return AuctionStatus[a.status.name] if isinstance(a.status, Auction_State) else AuctionStatus.CLOSED

def _seconds_remaining(a: Auction) -> int:
    try:
        return a.seconds_remaining()
    except Exception:
        return max(0, int(a.ends_at_time - time.time()))

def _auto_settle_if_ended(a: Auction) -> None:
    # use logical and, not bitwise &, and only when OPEN
    if a.status == Auction_State.OPEN and time.time() >= a.ends_at_time:
        a.settle_now(REGISTRY)

def _auction_to_out(auction_id: str, a: Auction) -> AuctionOut:
    # sort bids: lowest amount first, then earliest timestamp
    bids_sorted = sorted(a.bids.values(), key=lambda b: (b.bid_amount, b.timestamp_ms))
    return AuctionOut(
        auction_id=auction_id,
        task=a.task,
        status=_to_status(a),
        ends_at_time=a.ends_at_time,                 # <<< correct key
        seconds_remaining=_seconds_remaining(a),     # <<< correct key
        bids=[BidOut(user=b.user, bid_amount=b.bid_amount, timestamp_ms=b.timestamp_ms) for b in bids_sorted],
        assigned_user=a.assigned_user,
        participants=AUCTION_PARTICIPANTS.get(auction_id),
    )

def _ensure_auction_open(a: Auction):
    _auto_settle_if_ended(a)
    if a.status != Auction_State.OPEN:
        raise HTTPException(status_code=400, detail="Auction is not open.")

# ---- ROUTES ----
@app.post("/new_task", response_model=AuctionOut, status_code=201)
def new_task(pl: NewTaskIn):
    """Create an auction round for a task."""
    with LOCK:
        if pl.auction_id in AUCTIONS:
            raise HTTPException(status_code=409, detail="Auction already exists")
        auc = Auction(task=pl.task, duration_seconds=pl.duration_seconds)
        AUCTIONS[pl.auction_id] = auc

        # optional allowlist
        if pl.participants is not None:
            cleaned = []
            for name in pl.participants:
                if not name or not name.strip():
                    continue
                n = name.strip()
                REGISTRY.ensure_user(n)  # create if missing
                cleaned.append(n)
            AUCTION_PARTICIPANTS[pl.auction_id] = cleaned

        return _auction_to_out(pl.auction_id, auc)

@app.post("/bid", response_model=AuctionOut)
def bid(pl: BidIn):
    """Submit a bid to an active auction."""
    with LOCK:
        auc = AUCTIONS.get(pl.auction_id)
        if not auc:
            raise HTTPException(404, "Auction not found")

        _ensure_auction_open(auc)

        user = (pl.user or "").strip()
        if not user:
            raise HTTPException(400, "User name is required")

        allow = AUCTION_PARTICIPANTS.get(pl.auction_id)
        if allow is not None and user not in allow:
            raise HTTPException(403, "User not allowed to bid in this auction.")

        # reject duplicate bids by same user (test expects this)
        if user in auc.bids:
            raise HTTPException(400, "User has already bid in this auction.")

        try:
            auc.place_bid(name=user, bid_amount=pl.bid_amount, registry=REGISTRY)
        except ValueError as e:
            raise HTTPException(400, str(e))

        return _auction_to_out(pl.auction_id, auc)

@app.get("/results", response_model=AuctionOut)
def results(auction_id: str = Query(..., description="Auction identifier")):
    """Show current outcome; auto-settle if auction time elapsed."""
    with LOCK:
        auc = AUCTIONS.get(auction_id)
        if not auc:
            raise HTTPException(404, "Auction not found")
        _auto_settle_if_ended(auc)
        return _auction_to_out(auction_id, auc)

@app.get("/leaderboard", response_model=LeaderboardOut)
def leaderboard():
    """Live scoreboard: users by points desc, then fewer assigned tasks, then name."""
    with LOCK:
        users = REGISTRY.list_users()
        rows = sorted(
            (LeaderboardRow(name=u.name, points=u.points, tasks_assigned=len(u.assigned_tasks)) for u in users),
            key=lambda r: (-r.points, r.tasks_assigned, r.name.lower()),
        )
        return LeaderboardOut(leaderboard=rows)
