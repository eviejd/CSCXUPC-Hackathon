
var API_URL = "http://127.0.0.1:8080"; 


function $(id){ return document.getElementById(id); }
function requestJson(method, path, body){
    return fetch(API_URL + path, {
    method: method,
    headers: { "Content-Type":"application/json" },
    body: body ? JSON.stringify(body) : null
    }).then(function(r){ return r.json(); });
}


var users = [];  
var tasks = [];  
var poll_interval_id = null;
var lastPhase = null;
var lastActiveUser = null;


function showPage(id){
    var pages = document.querySelectorAll(".page");
    for (var i=0;i<pages.length;i++){ pages[i].classList.remove("active"); }
    var el = $(id); if (el) el.classList.add("active");
}
window.showPage = showPage;


document.addEventListener("DOMContentLoaded", function(){
    wireEvents();
    renderHome();
    var learn = document.querySelector(".learn-more-btn");
    if (learn) learn.addEventListener("click", function(){
    alert("Connected:\nStart Round → POST /api/start_round\nBid → POST /api/bid\nUI sync → GET /api/state");
    });
});


function wireEvents(){
    var el;

    el = $("addUserBtn"); if (el) el.addEventListener("click", addUser);
    el = $("userNameInput"); if (el) el.addEventListener("keypress", function(e){ if(e.key==="Enter") addUser(); });

    el = $("addTaskBtn"); if (el) el.addEventListener("click", addTask);
    el = $("taskInput"); if (el) el.addEventListener("keypress", function(e){ if(e.key==="Enter") addTask(); });

    el = $("btnStartRound"); if (el) el.addEventListener("click", startRoundOnServer);

    el = $("submitBidBtn"); if (el) el.addEventListener("click", submitBidToServer);
    el = $("bidAmount"); if (el) el.addEventListener("keypress", function(e){ if(e.key==="Enter") submitBidToServer(); });

    el = $("nextRoundBtn"); if (el) el.addEventListener("click", startRoundOnServer);

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
            html += '<div class="list-item"><div class="user-name">' + u.name +
                    '</div><div class="user-points">' + (u.points!=null?u.points:100) + ' pts</div></div>';
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
        for (var t=0;t<tasks.length;t++){ th += '<div class="list-item"><div>' + tasks[t] + '</div></div>'; }
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
    users.push({ name: name }); // backend gives points later in results
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
        if (!res || !res.ok){ tasks.unshift(task); alert((res && res.error) || "Failed to start"); return; }
        beginPollingServerState();
        })
        .catch(function(){
        tasks.unshift(task);
        alert("Server not reachable");
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
            if (phaseChanged) showPage("handoverPage");
        }
        else if (s.phase === "bid"){
            var bt = $("bidTaskTitle"); if (bt) bt.textContent = s.task || "";
            var bs = $("bidSubtitle"); if (bs) bs.textContent = (s.active_user || "Player") + ", place your bid";
            var btime = $("bidTimer"); if (btime) btime.textContent = String(s.seconds_left || 0);


            if (phaseChanged || activeChanged){
            var be = $("bidError"); if (be) be.style.display = "none";
            }

            if (phaseChanged) showPage("bidPage");
        }
        else if (s.phase === "results"){
            renderResultsFromState(s);
            showPage("resultsPage");
            clearInterval(poll_interval_id); poll_interval_id = null;
        }
        else if (s.phase === "idle"){
            showPage("homePage");
            clearInterval(poll_interval_id); poll_interval_id = null;
        }


        lastPhase = s.phase;
        lastActiveUser = s.active_user;
        })
    .catch(function(){
        clearInterval(poll_interval_id); poll_interval_id = null;
        });
    }, 500);
}


function renderResultsFromState(s){
    var rt = $("resultTask"); if (rt) rt.textContent = s.task || "";
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
}


function submitBidToServer(){
    var amount = parseInt(($( "bidAmount")||{value:""}).value,10);
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

    // Export PDF // 
    function bindPdfButtons() {
        const byId = (id) => document.getElementById(id);
      
        const resBtn = byId('exportPdfResultsBtn');
        if (resBtn) resBtn.addEventListener('click', () => {
          // Ensure the Results page is active before printing (if you navigate dynamically)
          // showPage('resultsPage'); // if you have this helper already
          window.print();
        });
      
        const howBtn = byId('exportPdfHowToBtn');
        if (howBtn) howBtn.addEventListener('click', () => {
          // showPage('howTo'); // only if you swap pages programmatically
          window.print();
        });
      }
      
      // Call once after DOM is ready / after you render pages:
      document.addEventListener('DOMContentLoaded', bindPdfButtons);
      
}
