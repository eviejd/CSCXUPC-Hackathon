import time
import random
from enum import Enum, auto
import heapq
import itertools

class User:
    def __init__(self, name, points):
        self.name = name.strip()
        self.points = int(points)
        self.assigned_tasks = []

    def tasks_assigned(self):
        return len(self.assigned_tasks)

    def to_dict(self):
        return {"name": self.name, "points": self.points, "assigned_tasks": list(self.assigned_tasks)}


class UserRegistry:
    def __init__(self, starting_points):
        self.users = {}
        self.starting_points = int(starting_points)

    def create_user(self, name):
        clean_name = (name or "").strip()
        if clean_name not in self.users:
            self.users[clean_name] = User(clean_name, self.starting_points)
        return self.users[clean_name]

    def ensure_user(self, name):
        return self.create_user(name)

    def get_user(self, name):
        return self.users.get((name or "").strip())

    def list_users(self):
        return list(self.users.values())


class Bid:
    def __init__(self, user, bid_amount):
        self.user = user
        self.bid_amount = int(bid_amount)
        self.timestamp_ms = int(time.time() * 1000)

class Auction_State(Enum):
    SCHEDULED = auto()
    OPEN = auto()
    CLOSED = auto()
    CANCELLED = auto()


class Auction:
    def __init__(self, task, duration_seconds):
        self.task = task
        self.status = Auction_State.OPEN
        self.ends_at_time = time.time() + max(1, int(duration_seconds))
        self.bids = {}
        self.assigned_user = None

    def is_open(self):
        return self.status == Auction_State.OPEN and time.time() < self.ends_at_time

    def seconds_remaining(self):
        if self.status != Auction_State.OPEN:
            return 0
        return max(0, int(self.ends_at_time - time.time()))

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
        all_bids = list(self.bids.values())
        lowest_amount = min(bid.bid_amount for bid in all_bids)
        lowest_group = [
            bid for bid in all_bids if bid.bid_amount == lowest_amount]

        if len(lowest_group) == 1:
            return lowest_group[0].user

        tied_users = [registry.get_user(bid.user) for bid in lowest_group]
        min_task_count = min(user_obj.tasks_assigned()
                             for user_obj in tied_users)
        fewest_task_names = [
            user_obj.name for user_obj in tied_users if user_obj.tasks_assigned() == min_task_count
        ]

        if len(fewest_task_names) == 1:
            return fewest_task_names[0]

        return random.choice(fewest_task_names)

    def settle_now(self, registry):
        if self.status == Auction_State.CLOSED:
            return

        self.status = Auction_State.CLOSED

        if not self.bids:
            self.assigned_user = None
            return

        self.assigned_user = self._pick_assignee_with_fair_tie(registry)

        assignee_user = registry.get_user(self.assigned_user)
        if assignee_user:
            assignee_user.assigned_tasks.append(self.task)

        for bid in self.bids.values():
            if bid.user == self.assigned_user:
                continue
            bidder_user = registry.get_user(bid.user)
            if bidder_user:
                bidder_user.points = max(
                    0, bidder_user.points - bid.bid_amount)
                

class Task_State(Enum):
    QUEUED = auto()
    AUCTIONED = auto()
    ASSIGNED = auto()
    IN_PROGRESS = auto()
    DONE = auto()
    EXPIRED = auto()
                

class Task: 
    def __init__(self, id, name, description, deadline, priority, user):
        self.id = id
        self.name = name
        self.description = description
        self.deadline = deadline
        self.priority = priority
        self.status = Task_State.QUEUED
        self.user = user

    def __repr__(self):
        return f"Task(id={self.id}, name={self.name}, status={self.status}, user={self.user}, priority={self.priority})"
    

class TaskQueue: 
    def __init__(self): 
        self._heap = []
        # self.iter = itertools.count()

    def add_task(self, task): 
        # count = next(self.iter)
        heapq.heappush(self._heap, (-task.priority, task.id, task))

    def get_next_task(self) -> Task: 
        if not self._heap: 
            return None
        
        _, _, task = heapq.heappop(self._heap)
        return task
 
    
    def peek_next_task(self) -> Task:
        if not self._heap: 
            return None
        return self._heap[0][2]
    
    def __len__(self): 
        return len(self._heap)



 
    

        
