# Procrastinauction - CPC X UPC Hackathon 🕒💸🦆

Procrastinauction is an auction-style task manager designed to make everyday jobs less boring.  
From **household chores** to **group projects** to **event plannning**, it turns your group to-do list into a game where you *bid* for the right to NOT complete a task.

---

## Features
- Works for **designed for roup projects, but works for household chore division, event planning, or any team tasks**.
- Web-based front end built with **HTML, CSS, and JavaScript**.
- Python backend to handle auctions, bidding, and task logic.
- Real-time countdown timers for each auction round.
- Bid submission with your name
- Export tasks and assignments as a well-formatted **PDF**.
- Extendable functions to add more gamified features.

---

## How To Run
1. Start the server of app.py (terminal: 'python app.py')
2. Run the index.html file (terminal: 'python -m http.server 5050')

---

## How To Use
1. Add users by entering their names and clicking "Add User".

2. Add tasks to the queue by entering task descriptions and clicking "Add Task".

3. Once you have at least one user and one task, the "Start Round" button will be enabled.
  
4. Click "Start Round" to begin the bidding process.

5. Recieve your set tasks once bidding concludes.

---

## Skills Demonstrated

- **Frontend development**
  - Semantic HTML structure
  - Responsive layouts with CSS Grid & Flexbox
  - DOM manipulation and event-driven UI in vanilla JavaScript
  - Media queries and accessibility-friendly styles

- **Backend development**
  - Python HTTP server with `http.server` + `ThreadingMixIn`
  - JSON API design (`/api/state`, `/api/start_round`, `/api/bid`)
  - State management for auctions, users, bids, and tasks
  - Fair tie-breaking logic in competitive scenarios

- **Integration**
  - Frontend ↔ Backend communication via `fetch` and JSON
  - Cross-Origin Resource Sharing (CORS) headers
  - Handling async flows and error states gracefully

- **UX Enhancements**
  - Countdown timers with CSS animations
  - Audio cues via Web Audio API (tick + gavel strike)
  - Exporting structured results to clean paginated PDFs

- **Software engineering practices**
  - Modular code structure
  - Enum-based state machines (phases, tasks, auctions)
  - Defensive programming with validation and error handling
  - Automated testing with `pytest`

- **Collaboration**
  - GitHub project workflow
  - Clear separation of roles: frontend, backend, testing, docs
  - Hackathon-style time management and iteration

---


