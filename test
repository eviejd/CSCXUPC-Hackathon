import time
import pytest
import auction_app as app


@pytest.fixture
def registry():
    return app.UserRegistry(starting_points=10)


def test_user_creation_and_points():
    u = app.User("  Evie  ", "7")
    assert u.name == "Evie"
    assert u.points == 7
    assert u.assigned_tasks == []


def test_user_tasks_and_to_dict():
    u = app.User("Isobel", 5)
    u.assigned_tasks.extend(["task1", "task2"])
    assert u.tasks_assigned() == 2
    assert u.to_dict() == {"name": "Isobel", "points": 5,
                           "assigned_tasks": ["task1", "task2"]}


def test_registry_create_and_get(registry):
    e1 = registry.create_user(" Evie ")
    e2 = registry.create_user("Evie")
    assert e1 is e2
    assert registry.get_user("Evie") is e1
    assert [u.name for u in registry.list_users()] == ["Evie"]


def test_registry_ensure_user(registry):
    assert registry.get_user("Huanzhen") is None
    h = registry.ensure_user("Huanzhen")
    assert h.name == "Huanzhen"
    assert registry.get_user("Huanzhen") is h


def test_registry_get_user_strips_whitespace(registry):
    registry.create_user("Isobel")
    assert registry.get_user("  Isobel ") is registry.get_user("Isobel")


def test_registry_starting_points_applied():
    r = app.UserRegistry(starting_points=42)
    assert r.create_user("Evie").points == 42


def test_bid_records_timestamp_ms():
    before_ms = int(time.time() * 1000)
    b = app.Bid("Evie", 3)
    after_ms = int(time.time() * 1000)
    assert isinstance(b.timestamp_ms, int)
    assert before_ms <= b.timestamp_ms <= after_ms


def test_auction_open_and_close():
    a = app.Auction(task="wash dishes", duration_seconds=30)
    assert a.is_open()
    rem0 = a.seconds_remaining()
    assert 0 <= rem0 <= 30
    a.ends_at_time = time.time() - 1
    assert not a.is_open()
    assert a.seconds_remaining() == 0


def test_auction_min_duration_enforced():
    a = app.Auction(task="quick", duration_seconds=0)
    assert a.is_open()
    a.ends_at_time = time.time()
    assert not a.is_open()


def test_auction_exact_end_time_boundary():
    a = app.Auction(task="boundary", duration_seconds=5)
    a.ends_at_time = time.time()
    assert not a.is_open()
    assert a.seconds_remaining() == 0


def test_place_bid_validation_negative_bid(registry):
    a = app.Auction(task="vacuum", duration_seconds=10)
    with pytest.raises(ValueError, match="Bid must be >= 0"):
        a.place_bid("Isobel", -1, registry)


def test_place_bid_validation_exceeds_points(registry):
    a = app.Auction(task="vacuum", duration_seconds=10)
    registry.create_user("Isobel").points = 2
    with pytest.raises(ValueError):
        a.place_bid("Isobel", 3, registry)


def test_place_bid_when_closed_raises(registry):
    a = app.Auction(task="closed", duration_seconds=1)
    a.ends_at_time = time.time() - 1
    with pytest.raises(ValueError, match="not open"):
        a.place_bid("Evie", 1, registry)


def test_place_bid_boundary_equals_points_ok(registry):
    a = app.Auction(task="ok", duration_seconds=10)
    registry.create_user("Evie").points = 5
    a.place_bid("Evie", 5, registry)
    assert a.bids["Evie"].bid_amount == 5


def test_rebid_overwrites_previous_bid(registry):
    a = app.Auction(task="rebid", duration_seconds=10)
    registry.create_user("Evie").points = 10
    a.place_bid("Evie", 2, registry)
    a.place_bid("Evie", 4, registry)
    assert a.bids["Evie"].bid_amount == 4


def test_settle_no_bids_assigns_none(registry):
    a = app.Auction(task="cook", duration_seconds=10)
    a.settle_now(registry)
    assert a.status == "closed"
    assert a.assigned_user is None


def test_lowest_bid_wins_and_losers_lose_points(registry):
    a = app.Auction(task="laundry", duration_seconds=10)
    registry.create_user("Evie").points = 10
    registry.create_user("Isobel").points = 10
    registry.create_user("Huanzhen").points = 10
    a.place_bid("Evie", 5, registry)
    a.place_bid("Isobel", 3, registry)
    a.place_bid("Huanzhen", 7, registry)
    a.settle_now(registry)
    assert a.assigned_user == "Isobel"
    assert registry.get_user("Isobel").assigned_tasks == ["laundry"]
    assert registry.get_user("Evie").points == 5
    assert registry.get_user("Huanzhen").points == 3
    assert registry.get_user("Isobel").points == 10


def test_tie_breaker_fewest_tasks(registry, monkeypatch):
    e = registry.create_user("Evie")
    i = registry.create_user("Isobel")
    e.points = i.points = 10
    e.assigned_tasks = ["t1"]
    i.assigned_tasks = []
    a = app.Auction(task="take out trash", duration_seconds=10)
    a.place_bid("Evie", 2, registry)
    a.place_bid("Isobel", 2, registry)
    monkeypatch.setattr(app.random, "choice", lambda seq: seq[0])
    a.settle_now(registry)
    assert a.assigned_user == "Isobel"
    assert registry.get_user("Isobel").assigned_tasks == ["take out trash"]
    assert registry.get_user("Evie").points == 8
    assert registry.get_user("Isobel").points == 10


def test_tie_breaker_random_when_task_counts_equal(registry, monkeypatch):
    for n in ["Evie", "Isobel", "Huanzhen"]:
        registry.create_user(n).points = 10
    a = app.Auction(task="water plants", duration_seconds=10)
    for n in ["Evie", "Isobel", "Huanzhen"]:
        a.place_bid(n, 1, registry)
    monkeypatch.setattr(app.random, "choice", lambda seq: "Huanzhen")
    a.settle_now(registry)
    assert a.assigned_user == "Huanzhen"
    assert registry.get_user("Huanzhen").assigned_tasks == ["water plants"]
    assert registry.get_user("Evie").points == 9
    assert registry.get_user("Isobel").points == 9
    assert registry.get_user("Huanzhen").points == 10


def test_settle_now_idempotent(registry):
    a = app.Auction(task="idempotent", duration_seconds=10)
    registry.create_user("Evie").points = 10
    a.place_bid("Evie", 1, registry)
    a.settle_now(registry)
    first_assignee = a.assigned_user
    a.settle_now(registry)
    assert a.assigned_user == first_assignee
    assert a.status == "closed"
