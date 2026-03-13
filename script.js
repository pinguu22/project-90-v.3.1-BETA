const APP_ID = window.APP_CONFIG?.appId || "project90-main";
const SUPABASE_URL = window.APP_CONFIG?.supabaseUrl;
const SUPABASE_KEY = window.APP_CONFIG?.supabaseAnonKey;

const SCHEDULED_DAYS = [1, 3, 5, 0]; // Montag, Mittwoch, Freitag, Sonntag
const APP_VERSION = window.APP_CONFIG?.version || "v3.1-beta";
const LAST_UPDATE = window.APP_CONFIG?.lastUpdate || "13.03.2026";
const APP_MODE = window.APP_CONFIG?.mode || "Beta";

function createDefaultState() {
  return {
    jm: {
      name: "Jan-Mattes",
      points: 0,
      completedDates: [],
      lastWorkout: null
    },
    jonas: {
      name: "Jonas",
      points: 0,
      completedDates: [],
      lastWorkout: null
    },
    teamStreak: 0,
    weekCompleted: 0,
    meta: {
      version: APP_VERSION,
      lastUpdate: LAST_UPDATE,
      mode: APP_MODE,
      currentWeekKey: ""
    }
  };
}

function normalizeState(raw) {
  const defaults = createDefaultState();
  const safe = raw && typeof raw === "object" ? raw : {};

  const jmCompleted = Array.isArray(safe?.jm?.completedDates)
    ? [...new Set(safe.jm.completedDates)].sort()
    : [];

  const jonasCompleted = Array.isArray(safe?.jonas?.completedDates)
    ? [...new Set(safe.jonas.completedDates)].sort()
    : [];

  return {
    jm: {
      name: safe?.jm?.name || defaults.jm.name,
      points: Number.isFinite(safe?.jm?.points) ? safe.jm.points : defaults.jm.points,
      completedDates: jmCompleted,
      lastWorkout: safe?.jm?.lastWorkout || jmCompleted[jmCompleted.length - 1] || null
    },
    jonas: {
      name: safe?.jonas?.name || defaults.jonas.name,
      points: Number.isFinite(safe?.jonas?.points) ? safe.jonas.points : defaults.jonas.points,
      completedDates: jonasCompleted,
      lastWorkout: safe?.jonas?.lastWorkout || jonasCompleted[jonasCompleted.length - 1] || null
    },
    teamStreak: Number.isFinite(safe?.teamStreak) ? safe.teamStreak : defaults.teamStreak,
    weekCompleted: Number.isFinite(safe?.weekCompleted) ? safe.weekCompleted : defaults.weekCompleted,
    meta: {
      version: safe?.meta?.version || APP_VERSION,
      lastUpdate: safe?.meta?.lastUpdate || LAST_UPDATE,
      mode: safe?.meta?.mode || APP_MODE,
      currentWeekKey: safe?.meta?.currentWeekKey || ""
    }
  };
}

let state = normalizeState(JSON.parse(localStorage.getItem("project90State")) || createDefaultState());

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isScheduledDate(date) {
  return SCHEDULED_DAYS.includes(date.getDay());
}

function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  return getLocalDateKey(monday);
}

function getCurrentWeekRange() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { monday, sunday };
}

function isDateInCurrentWeek(dateKey) {
  const { monday, sunday } = getCurrentWeekRange();
  const date = parseDateKey(dateKey);
  date.setHours(0, 0, 0, 0);
  return date >= monday && date <= sunday;
}

function getScheduledDatesInCurrentWeek() {
  const { monday } = getCurrentWeekRange();
  const scheduled = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (isScheduledDate(d)) {
      scheduled.push(getLocalDateKey(d));
    }
  }

  return scheduled;
}

function calculateWeekCompleted() {
  const scheduledDates = getScheduledDatesInCurrentWeek();

  return scheduledDates.filter((dateKey) => {
    return state.jm.completedDates.includes(dateKey) || state.jonas.completedDates.includes(dateKey);
  }).length;
}

function getLevel(points) {
  if (points >= 190) return "Project Beast";
  if (points >= 130) return "Summer Form";
  if (points >= 80) return "Discipline";
  if (points >= 40) return "Consistency";
  return "Starter";
}

function getReferenceDateForStreak(predicate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isScheduledDate(today) && predicate(getLocalDateKey(today))) {
    return today;
  }

  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);
  return cursor;
}

function calculateScheduledStreak(predicate) {
  let cursor = getReferenceDateForStreak(predicate);
  let streak = 0;

  for (let i = 0; i < 365; i++) {
    if (isScheduledDate(cursor)) {
      const key = getLocalDateKey(cursor);
      if (predicate(key)) {
        streak++;
      } else {
        break;
      }
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function recalculateDerivedState() {
  state.jm.completedDates = [...new Set(state.jm.completedDates)].sort();
  state.jonas.completedDates = [...new Set(state.jonas.completedDates)].sort();

  state.jm.lastWorkout = state.jm.completedDates[state.jm.completedDates.length - 1] || null;
  state.jonas.lastWorkout = state.jonas.completedDates[state.jonas.completedDates.length - 1] || null;

  state.jm.streak = calculateScheduledStreak((dateKey) => state.jm.completedDates.includes(dateKey));
  state.jonas.streak = calculateScheduledStreak((dateKey) => state.jonas.completedDates.includes(dateKey));

  state.teamStreak = calculateScheduledStreak((dateKey) => {
    return state.jm.completedDates.includes(dateKey) && state.jonas.completedDates.includes(dateKey);
  });

  state.weekCompleted = calculateWeekCompleted();
  state.meta.currentWeekKey = getWeekKey();
  state.meta.version = APP_VERSION;
  state.meta.lastUpdate = LAST_UPDATE;
  state.meta.mode = APP_MODE;
}

function checkWeeklyReset() {
  const currentWeekKey = getWeekKey();

  if (state.meta.currentWeekKey !== currentWeekKey) {
    state.meta.currentWeekKey = currentWeekKey;
  }

  recalculateDerivedState();
}

async function loadRemoteState() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/project90_states?app_id=eq.${APP_ID}&select=*`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    const data = await res.json();

    if (Array.isArray(data) && data.length) {
      state = normalizeState(data[0].state);
      checkWeeklyReset();
      localStorage.setItem("project90State", JSON.stringify(state));
    }
  } catch (error) {
    console.log("Remote load failed, using local state.");
  }
}

async function pushRemoteState() {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/project90_states?on_conflict=app_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({
        app_id: APP_ID,
        state
      })
    });
  } catch (error) {
    console.log("Remote save failed.");
  }
}

function saveState() {
  recalculateDerivedState();
  localStorage.setItem("project90State", JSON.stringify(state));
  pushRemoteState();
}

function formatDateForDisplay(dateKey) {
  if (!dateKey) return "—";
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString("de-DE");
}

function getTodayWorkoutText(dayNumber) {
  const workoutMap = {
    1: "Oberkörper Training",
    3: "Core / Sixpack Training",
    5: "Oberkörper + Core",
    0: "Cardio / Lauf mit Jonas"
  };

  return workoutMap[dayNumber] || "Ruhetag / optional Mobility";
}

function updateTodayWorkout() {
  const now = new Date();
  const day = now.getDay();

  const dayNames = [
    "Sonntag",
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag"
  ];

  const titleEl = document.getElementById("todayTitle");
  const workoutEl = document.getElementById("todayWorkout");
  const dateEl = document.getElementById("todayDate");

  if (titleEl) titleEl.textContent = `Heute ist ${dayNames[day]}`;
  if (workoutEl) workoutEl.textContent = getTodayWorkoutText(day);
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  document.querySelectorAll(".workout-card").forEach((card) => card.classList.remove("today-workout-card"));
  const activeCard = document.getElementById(`workout-card-${day}`);
  if (activeCard) activeCard.classList.add("today-workout-card");

  const chipMap = {
    1: "chip-mon",
    3: "chip-wed",
    5: "chip-fri",
    0: "chip-sun"
  };

  document.querySelectorAll(".day-chip").forEach((chip) => chip.classList.remove("active-day"));
  if (chipMap[day]) {
    const activeChip = document.getElementById(chipMap[day]);
    if (activeChip) activeChip.classList.add("active-day");
  }
}

function updateVersionInfo() {
  const versionInfo = document.getElementById("versionInfo");
  const lastUpdateInfo = document.getElementById("lastUpdateInfo");
  const modeInfo = document.getElementById("modeInfo");

  if (versionInfo) versionInfo.textContent = `Version ${APP_VERSION}`;
  if (lastUpdateInfo) lastUpdateInfo.textContent = `Last Update: ${LAST_UPDATE}`;
  if (modeInfo) modeInfo.textContent = `Mode: ${APP_MODE}`;
}

function updateTodayStatuses() {
  const todayKey = getLocalDateKey();

  const jmDone = state.jm.completedDates.includes(todayKey);
  const jonasDone = state.jonas.completedDates.includes(todayKey);

  const jmStatus = document.getElementById("jmTodayStatus");
  const jonasStatus = document.getElementById("jonasTodayStatus");

  if (jmStatus) jmStatus.textContent = jmDone ? "Schon eingetragen ✅" : "Noch kein Eintrag";
  if (jonasStatus) jonasStatus.textContent = jonasDone ? "Schon eingetragen ✅" : "Noch kein Eintrag";
}

function updateUI() {
  recalculateDerivedState();

  document.getElementById("jmStreak").textContent = `${state.jm.streak} Tage`;
  document.getElementById("jonasStreak").textContent = `${state.jonas.streak} Tage`;
  document.getElementById("teamStreak").textContent = `${state.teamStreak} Tage`;

  document.getElementById("jmPoints").textContent = state.jm.points;
  document.getElementById("jonasPoints").textContent = state.jonas.points;

  document.getElementById("jmLevel").textContent = getLevel(state.jm.points);
  document.getElementById("jonasLevel").textContent = getLevel(state.jonas.points);

  document.getElementById("jmLastWorkout").textContent = `Letzter Check-in: ${formatDateForDisplay(state.jm.lastWorkout)}`;
  document.getElementById("jonasLastWorkout").textContent = `Letzter Check-in: ${formatDateForDisplay(state.jonas.lastWorkout)}`;

  const percent = Math.min((state.weekCompleted / 4) * 100, 100);
  document.getElementById("progressFill").style.width = `${percent}%`;
  document.getElementById("weekText").textContent = `${state.weekCompleted} / 4 Workouts geschafft`;
  document.getElementById("weekPercent").textContent = `${Math.round(percent)}%`;

  document.getElementById("teamSummary").textContent = `Team Streak: ${state.teamStreak}`;

  updateVersionInfo();
  updateTodayWorkout();
  updateTodayStatuses();
}

function addCheckIn(personKey, pointsToAdd) {
  const today = getLocalDateKey();

  if (state[personKey].completedDates.includes(today)) {
    alert("Für diese Person wurde heute schon ein Workout eingetragen.");
    return;
  }

  state[personKey].completedDates.push(today);
  state[personKey].points += pointsToAdd;
  state[personKey].lastWorkout = today;

  saveState();
  updateUI();
}

function addWorkout(personKey) {
  addCheckIn(personKey, 10);
}

function addRun(personKey) {
  addCheckIn(personKey, 15);
}

function addStreakBonus(personKey) {
  state[personKey].points += 20;
  saveState();
  updateUI();
}

function resetWeek() {
  const confirmed = confirm("Willst du wirklich alle Check-ins der aktuellen Woche entfernen?");
  if (!confirmed) return;

  state.jm.completedDates = state.jm.completedDates.filter((dateKey) => !isDateInCurrentWeek(dateKey));
  state.jonas.completedDates = state.jonas.completedDates.filter((dateKey) => !isDateInCurrentWeek(dateKey));

  saveState();
  updateUI();
}

function resetAllData() {
  const confirmed = confirm("Willst du wirklich alles zurücksetzen?");
  if (!confirmed) return;

  state = createDefaultState();
  saveState();
  updateUI();
}

function calculateNutrition() {
  const weight = parseFloat(document.getElementById("weightInput").value);
  const height = parseFloat(document.getElementById("heightInput").value);
  const goal = document.getElementById("goalInput").value;

  if (!weight || !height) {
    alert("Bitte Gewicht und Größe eingeben.");
    return;
  }

  const bmi = weight / ((height / 100) ** 2);

  let proteinPerKg = 1.8;
  let carbsPerKg = 3.5;
  let caloriesPerKg = 33;

  if (goal === "build") {
    proteinPerKg = 2.0;
    carbsPerKg = 4.5;
    caloriesPerKg = 36;
  }

  if (goal === "cut") {
    proteinPerKg = 2.1;
    carbsPerKg = 2.8;
    caloriesPerKg = 29;
  }

  const protein = Math.round(weight * proteinPerKg);
  const carbs = Math.round(weight * carbsPerKg);
  const calories = Math.round(weight * caloriesPerKg);
  const water = (weight * 0.035).toFixed(1);

  document.getElementById("bmiResult").textContent = bmi.toFixed(1);
  document.getElementById("proteinResult").textContent = `${protein} g`;
  document.getElementById("carbResult").textContent = `${carbs} g`;
  document.getElementById("calorieResult").textContent = `${calories} kcal`;
  document.getElementById("waterResult").textContent = `${water} l`;
}

function setupNavigation() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((btn) => btn.classList.remove("active"));
      document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));

      button.classList.add("active");
      const target = button.getAttribute("data-section");
      document.getElementById(target).classList.add("active");
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  checkWeeklyReset();
  updateUI();
  await loadRemoteState();
  updateUI();
  setInterval(loadRemoteState, 5000);
});

function toggleAdminPanel(){

const panel = document.getElementById("adminPanel")

if(panel.style.display === "flex"){
panel.style.display = "none"
}else{
panel.style.display = "flex"
}

}


function adminAddWorkout(){

const password = document.getElementById("adminPassword").value

if(password !== "ADMIN2026"){
alert("Kein Admin Zugriff")
return
}

const person = document.getElementById("adminPerson").value
const date = document.getElementById("adminDate").value
const type = document.getElementById("adminType").value

if(!date){
alert("Bitte Datum auswählen")
return
}

if(!state[person].completedDates.includes(date)){
state[person].completedDates.push(date)
}

if(type === "workout"){
state[person].points += 10
}

if(type === "run"){
state[person].points += 15
}

if(type === "bonus"){
state[person].points += 20
}

saveState()
updateUI()

alert("Training nachgetragen")

toggleAdminPanel()

}

function exportBackup(){

const data = JSON.stringify(state, null, 2)

const blob = new Blob([data], {type:"application/json"})

const url = URL.createObjectURL(blob)

const a = document.createElement("a")

a.href = url
a.download = "project90-backup.json"

a.click()

}

function importBackup(){

const input = document.createElement("input")
input.type = "file"
input.accept = "application/json"

input.onchange = function(e){

const file = e.target.files[0]

const reader = new FileReader()

reader.onload = function(){

state = JSON.parse(reader.result)

saveState()
updateUI()

alert("Backup erfolgreich geladen")

}

reader.readAsText(file)

}

input.click()

}
