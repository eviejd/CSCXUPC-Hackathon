"use strict";

var API_URL = "http://127.0.0.1:8080";
function $(id){ return document.getElementById(id); }
function requestJson(method, path, body){
  return fetch(API_URL + path, {
    method,
    headers: { "Content-Type":"application/json" },
    body: body ? JSON.stringify(body) : null
  }).then(function(r){ return r.json(); });
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
    osc.connect(gain); gain.connect(audioContext.destination);
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
    for (var i=0;i<size;i++){ out[i] = (Math.random()*2-1)*Math.pow(1 - i/size, 2); }
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

function showPage(id){
  var pages = document.querySelectorAll(".page");
  for (var i=0;i<pages.length;i++){ pages[i].classList.remove("active"); }
  var el = $(id); if (el) el.classList.add("active");
  stopTicking();
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

function startTicking(timerElement, ringElement) {
  stopTicking();
  currentTimerElement = timerElement;
  currentRingElement = ringElement;
  if (!timerElement) return;
  tickInterval = setInterval(function() {
    if (tickSound && soundEnabled) tickSound();
    timerElement.classList.remove("ticking");
    setTimeout(function(){ if (timerElement) timerElement.classList.add("ticking"); }, 50);
  }, 1000);
}

function stopTicking() {
  if (tickInterval){ clearInterval(tickInterval); tickInterval = null; }
  if (currentTimerElement){ currentTimerElement.classList.remove("ticking","urgent"); }
  if (currentRingElement){ currentRingElement.classList.remove("urgent"); }
  currentTimerElement = null;
  currentRingElement = null;
}

function updateTimerRing(ringElement, secondsLeft, totalSeconds) {
  if (!ringElement) return;
  var circumference = 339.29;
  var progress = Math.max(0, Math.min(1, (totalSeconds ? secondsLeft/totalSeconds : 0)));
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
  setTimeout(function(){
    gavel.classList.add("striking");
    if (gavelSound && soundEnabled) gavelSound();
  }, 100);
  setTimeout(function(){
    container.style.display = "none";
    gavel.classList.remove("striking");
  }, 2000);
}

document.addEventListener("DOMContentLoaded", function(){
  initAudio();
  wireEvents();
  renderHome();
  var soundBtn = $("soundToggle");
  if (soundBtn) soundBtn.addEventListener("click", toggleSound);
  var learn = document.querySelector(".learn-more-btn");
  if (learn) learn.addEventListener("click", function(){
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
  var backBtn = document.querySelector("#resultsPage .btn.btn-secondary");
  if (backBtn) backBtn.addEventListener("click", function(){ showPage("homePage"); });
}

function renderHome(){
  var usersList = $("usersList");
  if (usersList){
    if (users.length){
      var html = "";
      for (var i=0;i<users.length;i++){
        var u = users[i];
        html += '<div class="list-item"><div class="user-name">'+u.name+
                '</div><div class="user-points">'+(u.points!=null?u.points:100)+' pts</div></div>';
      }
      usersList.innerHTML = html;
    } else {
      usersList.innerHTML = '<div class="empty-state">No users yet</div>';
    }
  }
  var tasksList = $("tasksList");
  if (tasksList){
    if (tasks.length){
      var th = "";
      for (var t=0;t<tasks.length;t++){ th += '<div class="list-item"><div>'+tasks[t]+'</div></div>'; }
      tasksList.innerHTML = th;
    } else {
      tasksList.innerHTML = '<div class="empty-state">No tasks yet</div>';
    }
  }
  var startBtn = $("btnStartRound");
  if (startBtn){ startBtn.disabled = !(users.length && tasks.length); }
}

function addUser(){
  var input = $("userNameInput");
  var err = $("userNameError");
  var name = (input && input.value) ? input.value.replace(/^\s+|\s+$/g,"") : "";
  if(!name){ if(err){ err.textContent="Name cannot be empty"; err.style.display="block"; } return; }
  for (var i=0;i<users.length;i++){
    if(users[i].name.toLowerCase()===name.toLowerCase()){
      if(err){ err.textContent="User already exists"; err.style.display="block"; }
      return;
    }
  }
  if(err){ err.style.display="none"; }
  users.push({ name: name });
  if(input) input.value = "";
  renderHome();
}

function addTask(){
  var input = $("taskInput");
  var err = $("taskError");
  var task = (input && input.value) ? input.value.replace(/^\s+|\s+$/g,"") : "";
  if(!task){ if(err){ err.textContent="Task cannot be empty"; err.style.display="block"; } return; }
  if(err){ err.style.display="none"; }
  tasks.push(task);
  if(input) input.value = "";
  renderHome();
}

function startRoundOnServer(){
  if (!(users.length && tasks.length)) return;
  var task = tasks.shift();
  var order = []; for (var i=0;i<users.length;i++){ order.push(users[i].name); }
  requestJson("POST", "/api/start_round", { task: task, order: order })
    .then(function(res){
      if (!res || !res.ok){
        tasks.unshift(task);
        alert((res && res.error) || "Failed to start");
        return;
      }
      beginPollingServerState();
    })
    .catch(function(){
      tasks.unshift(task);
      alert("Server not reachable at " + API_URL);
    });
  renderHome();
}

function beginPollingServerState(){
  if (poll_interval_id) clearInterval(poll_interval_id);
  poll_interval_id = setInterval(function(){
    requestJson("GET", "/api/state")
      .then(function(res){
        if (!res || !res.ok) return;
        var s = res.state || {};
        var phaseChanged  = (s.phase !== lastPhase);
        var activeChanged = (s.active_user !== lastActiveUser);
        if (s.phase === "handover"){
          var hn = $("handoverName"); if (hn) hn.textContent = s.active_user || "";
          var ht = $("handoverTimer"); if (ht) ht.textContent = String(s.seconds_left || 0);
          var hr = $("handoverRing");
          updateTimerRing(hr, s.seconds_left || 0, 3);
          if (phaseChanged){ showPage("handoverPage"); startTicking(ht, hr); }
        } else if (s.phase === "bid"){
          var bt = $("bidTaskTitle"); if (bt) bt.textContent = s.task || "";
          var bs = $("bidSubtitle");  if (bs) bs.textContent = (s.active_user || "Player") + ", place your bid";
          var btime = $("bidTimer");  if (btime) btime.textContent = String(s.seconds_left || 0);
          var br = $("bidRing");
          updateTimerRing(br, s.seconds_left || 0, 5);
          if (phaseChanged || activeChanged){
            var be = $("bidError"); if (be) be.style.display = "none";
          }
          if (phaseChanged){ showPage("bidPage"); startTicking(btime, br); }
        } else if (s.phase === "results"){
          stopTicking();
          showGavelAnimation();
          renderResultsFromState(s);
          showPage("resultsPage");
          clearInterval(poll_interval_id); poll_interval_id = null;
        } else if (s.phase === "idle"){
          stopTicking();
          showPage("homePage");
          clearInterval(poll_interval_id); poll_interval_id = null;
        }
        lastPhase = s.phase;
        lastActiveUser = s.active_user;
      })
      .catch(function(){
        stopTicking();
        clearInterval(poll_interval_id); poll_interval_id = null;
      });
  }, 500);
}

function renderResultsFromState(s){
  var rt = $("resultTask");   if (rt) rt.textContent = s.task || "";
  var an = $("assignedName"); if (an) an.textContent = s.assigned || "No one";
  var tbody = document.querySelector("#bidsTable tbody");
  if (tbody){
    var rows = "", bids = s.bids || [];
    for (var i=0;i<bids.length;i++){
      rows += "<tr><td>"+bids[i].name+"</td><td>"+bids[i].amount+"</td></tr>";
    }
    tbody.innerHTML = rows;
  }
  var pointsList = $("pointsList");
  if (pointsList){
    var people = s.users || [];
    var html = "";
    for (var j=0;j<people.length;j++){
      var u = people[j];
      html += '<div class="list-item">'
        +    '<div>'
        +      '<div class="user-name">' + u.name + '</div>'
        +      '<div style="font-size:.9rem;color:#666">Tasks: ' + (u.assigned_tasks ? u.assigned_tasks.length : 0) + '</div>'
        +    '</div>'
        +    '<div class="user-points">' + u.points + ' pts</div>'
        +  '</div>';
    }
    pointsList.innerHTML = html;
  }
  if (Array.isArray(s.users)) users = s.users;
  renderTasksByUserResults();
}

function escapeHtml(s){
  return (s==null ? "" : String(s))
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function renderTasksByUserResults(){
  var wrap = $("tasksByUserResults");
  if (!wrap) return;
  var list = Array.isArray(users) ? users : [];
  if (list.length === 0){
    wrap.innerHTML = '<div class="empty-state">No users yet</div>';
    return;
  }
  var html = list.map(function(u){
    var tlist = Array.isArray(u.assigned_tasks) ? u.assigned_tasks : [];
    var items = tlist.length
      ? tlist.map(function(t){ return "<li>"+escapeHtml(t)+"</li>"; }).join("")
      : '<li class="muted">No tasks assigned</li>';
    return (
      '<div class="user-tasks-card">'+
        '<div class="user-row">'+
          '<span class="user-name">'+escapeHtml(u.name)+'</span>'+
          '<span class="pill">'+tlist.length+' task'+(tlist.length===1?'':'s')+'</span>'+
        '</div>'+
        '<ul class="task-list">'+items+'</ul>'+
      '</div>'
    );
  }).join("");
  wrap.innerHTML = html;
}

function beforeExport(){
  renderTasksByUserResults();
  return new Promise(function(resolve){
    requestAnimationFrame(function(){ setTimeout(resolve, 0); });
  });
}

function bindPdfButtons() {
  var resBtn = $("exportPdfResultsBtn");
  if (resBtn) resBtn.addEventListener("click", async function(){
    await beforeExport();
    window.print();
  });
  var howBtn = $("exportPdfHowToBtn");
  if (howBtn) howBtn.addEventListener("click", async function(){
    await beforeExport();
    window.print();
  });
}

function submitBidToServer(){
  if (audioContext && audioContext.state === "suspended") { audioContext.resume(); }
  var amount = parseInt(( $("bidAmount") || {value:""} ).value, 10);
  var err = $("bidError");
  if (isNaN(amount) || amount < 0){
    if(err){ err.textContent = "Amount must be ≥ 0"; err.style.display = "block"; }
    return;
  }
  requestJson("POST", "/api/bid", { amount: amount })
    .then(function(res){
      if (!res || !res.ok){
        if(err){ err.textContent = (res && res.error) ? res.error : "Bid failed"; err.style.display = "block"; }
        return;
      }
      if(err){ err.style.display = "none"; }
      var ba = $("bidAmount"); if (ba) ba.value = "";
    })
    .catch(function(){
      if(err){ err.textContent = "Connection error"; err.style.display = "block"; }
    });
}

document.addEventListener("click", function initAudioOnInteraction() {
  if (audioContext && audioContext.state === "suspended") { audioContext.resume(); }
  document.removeEventListener("click", initAudioOnInteraction);
});
