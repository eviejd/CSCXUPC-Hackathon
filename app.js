"use strict";

var API_URL = "http://127.0.0.1:8080";
function $(id) { return document.getElementById(id); }
function requestJson(method, path, body) {
  return fetch(API_URL + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null
  }).then(function(r) { return r.json(); });
}

var users = [];
var tasks = [];
var poll_interval_id = null;
var lastPhase = null;
var lastActiveUser = null;

var soundEnabled = true;
var tickInterval = null;
var currentTimerElement = null;
var currentRingElement = null;

var audioContext;
var tickSound, gavelSound;

function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    createTickSound();
    createGavelSound();
  } catch (e) {
    soundEnabled = false;
  }
}

function createTickSound() {
  tickSound = function() {
    if (!soundEnabled || !audioContext) return;
    var osc = audioContext.createOscillator();
    var gain = audioContext.createGain();
    osc.connect(gain); 
    gain.connect(audioContext.destination);
    osc.frequency.setValueAtTime(800, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    osc.start(audioContext.currentTime);
    osc.stop(audioContext.currentTime + 0.1);
  };
}

function createGavelSound() {
  gavelSound = function() {
    if (!soundEnabled || !audioContext) return;
    var dur = 0.5;
    var size = audioContext.sampleRate * dur;
    var buffer = audioContext.createBuffer(1, size, audioContext.sampleRate);
    var out = buffer.getChannelData(0);
    for (var i = 0; i < size; i++) { 
      out[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / size, 2); 
    }
    var src = audioContext.createBufferSource();
    var gain = audioContext.createGain();
    var filt = audioContext.createBiquadFilter();
    src.buffer = buffer;
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(800, audioContext.currentTime);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(0.8, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    src.start(audioContext.currentTime);
  };
}

function stopTicking() {
  if (tickInterval) { 
    clearInterval(tickInterval); 
    tickInterval = null; 
  }
  if (currentTimerElement) { 
    currentTimerElement.classList.remove("ticking", "urgent"); 
  }
  if (currentRingElement) { 
    currentRingElement.classList.remove("urgent"); 
  }
  currentTimerElement = null;
  currentRingElement = null;
}

function startTicking(timerElement, ringElement) {
  stopTicking();
  currentTimerElement = timerElement;
  currentRingElement = ringElement;
  if (!timerElement) return;
  
  tickInterval = setInterval(function() {
    if (tickSound && soundEnabled) tickSound();
    timerElement.classList.remove("ticking");
    setTimeout(function() { 
      if (timerElement) timerElement.classList.add("ticking"); 
    }, 50);
  }, 1000);
}

function updateTimerRing(ringElement, secondsLeft, totalSeconds) {
  if (!ringElement) return;
  var circumference = 339.29;
  var progress = Math.max(0, Math.min(1, (totalSeconds ? secondsLeft / totalSeconds : 0)));
  var offset = circumference * (1 - progress);
  ringElement.style.strokeDashoffset = offset;
  
  if (secondsLeft <= 2 && secondsLeft > 0) {
    ringElement.classList.add("urgent");
    if (currentTimerElement) currentTimerElement.classList.add("urgent");
  } else {
    ringElement.classList.remove("urgent");
    if (currentTimerElement) currentTimerElement.classList.remove("urgent");
  }
}

function showGavelAnimation() {
  var container = $("gavelContainer");
  var gavel = container ? container.querySelector(".gavel") : null;
  if (!container || !gavel) return;
  
  container.style.display = "block";
  gavel.classList.remove("striking");
  
  setTimeout(function() {
    gavel.classList.add("striking");
    if (gavelSound && soundEnabled) gavelSound();
  }, 100);
  
  setTimeout(function() {
    container.style.display = "none";
    gavel.classList.remove("striking");
  }, 2000);
}

function showPage(id) {
  var pages = document.querySelectorAll(".page");
  for (var i = 0; i < pages.length; i++) { 
    pages[i].classList.remove("active"); 
  }
  var el = $(id); 
  if (el) el.classList.add("active");
  
  // Only stop ticking when manually navigating away from timer pages
  if (id === "homePage") {
    stopTicking();
  }
}
window.showPage = showPage;

function toggleSound() {
  soundEnabled = !soundEnabled;
  var btn = $("soundToggle");
  if (btn) {
    btn.textContent = soundEnabled ? "🔊" : "🔇";
    btn.classList.toggle("muted", !soundEnabled);
  }
}

document.addEventListener("DOMContentLoaded", function() {
  initAudio();
  wireEvents();
  renderHome();
  
  var soundBtn = $("soundToggle");
  if (soundBtn) soundBtn.addEventListener("click", toggleSound);
  
  var learn = document.querySelector(".learn-more-btn");
  if (learn) learn.addEventListener("click", function() {
    alert("Connected:\nStart Round → POST /api/start_round\nBid → POST /api/bid\nUI sync → GET /api/state");
  });
  bindPdfButtons();
});


function wireEvents(){
    var el;
    el = $("addUserBtn");    if (el) el.addEventListener("click", addUser);
    el = $("userNameInput"); if (el) el.addEventListener("keypress", function(e){ if(e.key==="Enter") addUser(); });
    el = $("addTaskBtn");    if (el) el.addEventListener("click", addTask);
    el = $("taskInput");     if (el) el.addEventListener("keypress", function(e){ if(e.key==="Enter") addTask(); });
    el = $("btnStartRound"); if (el) el.addEventListener("click", startRoundOnServer);
    el = $("submitBidBtn");  if (el) el.addEventListener("click", submitBidToServer);
    el = $("bidAmount");     if (el) el.addEventListener("keypress", function(e){ if(e.key==="Enter") submitBidToServer(); });
    el = $("nextRoundBtn");  if (el) el.addEventListener("click", startRoundOnServer);
    
    // Add event listener for the upcoming tasks page's next round button
    el = $("nextRoundBtnUpcoming"); 
    if (el) el.addEventListener("click", function() {
      if (tasks.length > 0) {
        startRoundOnServer();
      } else {
        alert("No more tasks to auction");
        showPage("homePage");
      }
    });
    
    // Fixed upcoming summary button handler
    el = $("upcomingSummaryBtn");
    if (el) el.addEventListener("click", function() {
      // Simplified version - just show the page with current tasks
      renderRemainingTasks();
      showPage("upcomingTasks");
    });
    
    var backBtn = document.querySelector("#resultsPage .btn.btn-secondary");
    if (backBtn) backBtn.addEventListener("click", function(){ showPage("homePage"); });
  }

function renderHome() {
  var usersList = $("usersList");
  if (usersList) {
    if (users.length) {
      var html = "";
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        html += '<div class="list-item"><div class="user-name">' + u.name +
          '</div><div class="user-points">' + (u.points != null ? u.points : 100) + ' pts</div></div>';
      }
      usersList.innerHTML = html;
    } else {
      usersList.innerHTML = '<div class="empty-state">No users yet</div>';
    }
  }

  var tasksList = $("tasksList");
  if (tasksList) {
    if (tasks.length) {
      var th = "";
      for (var t = 0; t < tasks.length; t++) { 
        th += '<div class="list-item"><div>' + tasks[t] + '</div></div>'; 
      }
      tasksList.innerHTML = th;
    } else {
      tasksList.innerHTML = '<div class="empty-state">No tasks yet</div>';
    }
  }

  var startBtn = $("btnStartRound");
  if (startBtn) { 
    startBtn.disabled = !(users.length && tasks.length); 
  }
}

function addUser() {
  var input = $("userNameInput");
  var err = $("userNameError");
  var name = (input && input.value) ? input.value.replace(/^\s+|\s+$/g, "") : "";
  if (!name) { 
    if (err) { err.textContent = "Name cannot be empty"; err.style.display = "block"; } 
    return; 
  }
  for (var i = 0; i < users.length; i++) {
    if (users[i].name.toLowerCase() === name.toLowerCase()) {
      if (err) { err.textContent = "User already exists"; err.style.display = "block"; }
      return;
    }
  }
  if (err) { err.style.display = "none"; }
  users.push({ name: name });
  if (input) input.value = "";
  renderHome();
}

function addTask() {
  var input = $("taskInput");
  var err = $("taskError");
  var task = (input && input.value) ? input.value.replace(/^\s+|\s+$/g, "") : "";
  if (!task) { 
    if (err) { err.textContent = "Task cannot be empty"; err.style.display = "block"; } 
    return; 
  }
  if (err) { err.style.display = "none"; }
  tasks.push(task);
  if (input) input.value = "";
  renderHome();
}

function startRoundOnServer() {
  if (!(users.length && tasks.length)) return;
  
  var task = tasks.shift();
  var order = []; 
  for (var i = 0; i < users.length; i++) { 
    order.push(users[i].name); 
  }
  
  requestJson("POST", "/api/start_round", { task: task, order: order })
    .then(function(res) {
      if (!res || !res.ok) {
        tasks.unshift(task);
        alert((res && res.error) || "Failed to start");
        return;
      }
      
      // Process the initial state from start_round response
      if (res.state) {
        processStateTransition(res.state, true);
      }
      
      // Start polling for ongoing updates
      beginPollingServerState();
    })
    .catch(function() {
      tasks.unshift(task);
      alert("Server not reachable at " + API_URL);
    });
  renderHome();
}

function beginPollingServerState() {
  if (poll_interval_id) clearInterval(poll_interval_id);
  
  poll_interval_id = setInterval(function() {
    requestJson("GET", "/api/state")
      .then(function(res) {
        if (!res || !res.ok) return;
        var s = res.state || {};

        var phaseChanged = (s.phase !== lastPhase);
        var activeChanged = (s.active_user !== lastActiveUser);

        // Only handle transitions if something actually changed
        if (phaseChanged || activeChanged) {
          processStateTransition(s, false);
        } else {
          // Just update timer displays if no phase change
          updateTimerDisplays(s);
        }
      })
      .catch(function() {
        stopTicking();
        clearInterval(poll_interval_id); 
        poll_interval_id = null;
      });
  }, 400);
}

// Separate function to update timer displays
function updateTimerDisplays(s) {
  if (s.phase === "handover") {
    var ht = $("handoverTimer"); 
    if (ht) ht.textContent = String(s.seconds_left || 0);
    var hr = $("handoverRing");
    updateTimerRing(hr, s.seconds_left || 0, 6);
  }
  else if (s.phase === "bid") {
    var btime = $("bidTimer"); 
    if (btime) btime.textContent = String(s.seconds_left || 0);
    var br = $("bidRing");
    updateTimerRing(br, s.seconds_left || 0, 11);
  }
}

function renderResultsFromState(s) {
  var rt = $("resultTask"); 
  if (rt) rt.textContent = s.task || "";
  var an = $("assignedName"); 
  if (an) an.textContent = s.assigned || "No one";
  
  var tbody = document.querySelector("#bidsTable tbody");
  if (tbody) {
    var rows = "", bids = s.bids || [];
    for (var i = 0; i < bids.length; i++) {
      rows += "<tr><td>" + bids[i].name + "</td><td>" + bids[i].amount + "</td></tr>";
    }
    tbody.innerHTML = rows;
  }
  
  var pointsList = $("pointsList");
  if (pointsList) {
    var people = s.users || [];
    var html = "";
    for (var j = 0; j < people.length; j++) {
      var u = people[j];
      html += '<div class="list-item">' +
        '<div>' +
        '<div class="user-name">' + u.name + '</div>' +
        '<div style="font-size:.9rem;color:#666">Tasks: ' + (u.assigned_tasks ? u.assigned_tasks.length : 0) + '</div>' +
        '</div>' +
        '<div class="user-points">' + u.points + ' pts</div>' +
        '</div>';
    }
    pointsList.innerHTML = html;
  }
  
  if (Array.isArray(s.users)) users = s.users;
  renderTasksByUserResults();
}

function escapeHtml(s) {
  return (s == null ? "" : String(s))
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTasksByUserResults() {
  var wrap = $("tasksByUserResults");
  if (!wrap) return;
  var list = Array.isArray(users) ? users : [];
  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No users yet</div>';
    return;
  }
  var html = list.map(function(u) {
    var tlist = Array.isArray(u.assigned_tasks) ? u.assigned_tasks : [];
    var items = tlist.length
      ? tlist.map(function(t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("")
      : '<li class="muted">No tasks assigned</li>';
    return (
      '<div class="user-tasks-card">' +
      '<div class="user-row">' +
      '<span class="user-name">' + escapeHtml(u.name) + '</span>' +
      '<span class="pill">' + tlist.length + ' task' + (tlist.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<ul class="task-list">' + items + '</ul>' +
      '</div>'
    );
  }).join("");
  wrap.innerHTML = html;
}

function beforeExport() {
  renderTasksByUserResults();
  return new Promise(function(resolve) {
    requestAnimationFrame(function() { setTimeout(resolve, 0); });
  });
}

function bindPdfButtons() {
  var resBtn = $("exportPdfResultsBtn");
  if (resBtn) resBtn.addEventListener("click", async function() {
    await beforeExport();
    window.print();
  });
  var howBtn = $("exportPdfHowToBtn");
  if (howBtn) howBtn.addEventListener("click", async function() {
    await beforeExport();
    window.print();
  });
}

function submitBidToServer() {
  console.log("Submit bid clicked");
  
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }

  var amount = parseInt(($("bidAmount") || { value: "" }).value, 10);
  var err = $("bidError");
  var btn = $("submitBidBtn");
  
  console.log("Bid amount:", amount);
  
  if (isNaN(amount) || amount < 0) {
    console.log("Invalid amount");
    if (err) { 
      err.textContent = "Amount must be ≥ 0"; 
      err.style.display = "block"; 
    }
    return;
  }

  // Disable button immediately to prevent double submission
  if (btn) btn.disabled = true;
  console.log("Button disabled, sending bid...");

  // Stop ticking immediately since we're transitioning
  stopTicking();

  requestJson("POST", "/api/bid", { amount })
    .then(function(res) {
      console.log("Bid response:", res);
      
      if (!res || !res.ok) {
        console.log("Bid failed:", res ? res.error : "Unknown error");
        if (err) { 
          err.textContent = (res && res.error) ? res.error : "Bid failed"; 
          err.style.display = "block"; 
        }
        // Re-enable button on error
        if (btn) btn.disabled = false;
        return;
      }
      
      console.log("Bid successful, new state:", res.state);
      
      // Clear error and input on success
      if (err) err.style.display = "none";
      var ba = $("bidAmount"); 
      if (ba) ba.value = "";
      
      // Process the state immediately - no polling conflicts
      if (res.state) {
        console.log("State from bid response:", res.state.phase, res.state.active_user);
        
        // Force immediate transition based on server response
        processStateTransition(res.state, true);
      }
    })
    .catch(function(error) {
      console.error("Bid request failed:", error);
      if (err) { 
        err.textContent = "Connection error"; 
        err.style.display = "block"; 
      }
      // Re-enable button on connection error
      if (btn) btn.disabled = false;
    });
}

// New function to process state transitions more reliably
function processStateTransition(state, fromBidResponse = false) {
  console.log("processStateTransition:", {
    phase: state.phase,
    active_user: state.active_user,
    fromBidResponse: fromBidResponse
  });
  
  // Update tracking variables
  lastPhase = state.phase;
  lastActiveUser = state.active_user;
  
  if (state.phase === "handover") {
    console.log("-> Transitioning to handover for:", state.active_user);
    var hn = $("handoverName"); 
    if (hn) hn.textContent = state.active_user || "";
    var ht = $("handoverTimer"); 
    if (ht) ht.textContent = String(state.seconds_left || 0);
    var hr = $("handoverRing");
    
    updateTimerRing(hr, state.seconds_left || 0, 6);
    showPage("handoverPage");
    startTicking(ht, hr);
    
  } else if (state.phase === "bid") {
    console.log("-> Transitioning to bid for:", state.active_user);
    var bt = $("bidTaskTitle"); 
    if (bt) bt.textContent = state.task || "";
    var bs = $("bidSubtitle"); 
    if (bs) bs.textContent = (state.active_user || "Player") + ", place your bid";
    var btime = $("bidTimer"); 
    if (btime) btime.textContent = String(state.seconds_left || 0);
    var br = $("bidRing");
    
    updateTimerRing(br, state.seconds_left || 0, 11);
    
    // Clear input and re-enable button for new bidder
    var be = $("bidError"); 
    if (be) be.style.display = "none";
    var bidInput = $("bidAmount"); 
    if (bidInput) bidInput.value = "";
    var submitBtn = $("submitBidBtn"); 
    if (submitBtn) submitBtn.disabled = false;
    
    showPage("bidPage");
    startTicking(btime, br);
    
  } else if (state.phase === "results") {
    console.log("-> Transitioning to results");
    stopTicking();
    showGavelAnimation();
    renderResultsFromState(state);
    showPage("resultsPage");
    // Stop polling when we reach results
    if (poll_interval_id) {
      clearInterval(poll_interval_id); 
      poll_interval_id = null;
    }
    
  } else if (state.phase === "idle") {
    console.log("-> Transitioning to idle/home");
    stopTicking();
    showPage("homePage");
    if (poll_interval_id) {
      clearInterval(poll_interval_id); 
      poll_interval_id = null;
    }
  }
  
  // Continue or restart polling only if not in terminal states
  if (state.phase !== "results" && state.phase !== "idle" && !fromBidResponse) {
    // Only restart polling if it's not already running
    if (!poll_interval_id) {
      beginPollingServerState();
    }
  }
}

// Initialize audio on first user interaction
document.addEventListener("click", function initAudioOnInteraction() {
  if (audioContext && audioContext.state === "suspended") { 
    audioContext.resume(); 
  }
  document.removeEventListener("click", initAudioOnInteraction);
});


function renderRemainingTasks() {
    // Update the task title if there's a current task
    var urt = $("upcomingResultTask"); 
    if (urt) {
        urt.textContent = tasks.length > 0 ? "Next Task: " + tasks[0] : "No upcoming tasks";
    }

    // Render the list of remaining tasks
    var remainingTasksList = $("remainingTasksList");
    if (remainingTasksList) {
        if (tasks && tasks.length > 0) {
            var html = "";
            for (var t = 0; t < tasks.length; t++) { 
                html += '<div class="list-item"><div>' + tasks[t] + '</div></div>'; 
            }
            remainingTasksList.innerHTML = html;
        } else {
            remainingTasksList.innerHTML = '<div class="empty-state">No tasks remain</div>';
        }
    }
}