const elements = {
  taskForm: document.getElementById("task-form"),
  taskInput: document.getElementById("task-input"),
  taskDate: document.getElementById("task-date"),
  taskPriority: document.getElementById("task-priority"),
  taskCategory: document.getElementById("task-category"),
  taskRecurrence: document.getElementById("task-recurrence"),
  taskList: document.getElementById("task-list"),
  toggleTheme: document.getElementById("toggle-theme"),
  toggleView: document.getElementById("toggle-view"),
  notificationsBtn: document.getElementById("notifications-btn"),
  reloadBtn: document.getElementById("reload-btn"),
  languageSelector: document.getElementById("language-selector"),
  customizeBtnTop: document.getElementById("customize-btn-top"),
  customizeModal: document.getElementById("customize-modal"),
  customThemeColor: document.getElementById("custom-theme-color"),
  customFont: document.getElementById("custom-font"),
  customBackground: document.getElementById("custom-background"),
  customGlassOpacity: document.getElementById("custom-glass-opacity"),
  customizeSave: document.getElementById("customize-save"),
  filterButtons: document.querySelectorAll(".filters button"),
  searchInput: document.getElementById("search-input"),
  sortSelector: document.getElementById("sort-selector"),
  downloadPdf: document.getElementById("download-pdf"),
  clearAll: document.getElementById("clear-all"),
  modalOverlay: document.getElementById("modal-overlay"),
  modalMessage: document.getElementById("modal-message"),
  modalConfirm: document.getElementById("modal-confirm"),
  modalCancel: document.getElementById("modal-cancel"),
};

let fpInstance = flatpickr(elements.taskDate, {
  enableTime: true,
  dateFormat: "Y-m-d H:i",
  minDate: "today",
  minTime: new Date().getHours() + ":" + new Date().getMinutes(),
  position: "below",
  positionElement: elements.taskDate,
  static: true,
  onOpen: function(selectedDates, dateStr, instance) {
    const now = new Date();
    if (instance.selectedDates.length === 0) {
      instance.set("minTime", now.getDate() === instance.currentDate.getDate() ? now.getHours() + ":" + now.getMinutes() : "00:00");
    }
  },
});

let tasks = JSON.parse(localStorage.getItem("tasks")) || [];
let currentFilter = "all";
let currentSort = "default";
let notificationsEnabled = false;
let isEditing = false;
let editingTaskId = null;

const translations = {
  fr: {
    title: "SmartFlow",
    addTaskPlaceholder: "Ajouter une tâche...",
    datePlaceholder: "Choisir une date/heure...",
    lowPriority: "Faible",
    mediumPriority: "Moyenne",
    highPriority: "Élevée",
    work: "Travail",
    personal: "Personnel",
    urgent: "Urgent",
    other: "Autre",
    noRecurrence: "Aucune",
    daily: "Quotidien",
    weekly: "Hebdomadaire",
    monthly: "Mensuel",
    addTask: "Ajouter",
    allTasks: "Tout",
    pendingTasks: "En cours",
    completedTasks: "Terminées",
    searchPlaceholder: "Rechercher...",
    sortDefault: "Par défaut",
    sortDateAsc: "Date croissante",
    sortDateDesc: "Date décroissante",
    downloadPDF: "PDF",
    clearAll: "Tout Effacer",
    confirm: "Confirmer",
    cancel: "Annuler",
    customize: "Personnalisation",
    save: "Sauvegarder",
    noTasks: "Aucune tâche à exporter",
    noTasksToClear: "Aucune tâche à effacer",
    dateRequired: "La date et l'heure sont obligatoires et doivent être dans le futur",
    editTask: "Modifier la tâche",
    ok: "OK",
  },
  en: {
    title: "SmartFlow",
    addTaskPlaceholder: "Add a task...",
    datePlaceholder: "Pick a date/time...",
    lowPriority: "Low",
    mediumPriority: "Medium",
    highPriority: "High",
    work: "Work",
    personal: "Personal",
    urgent: "Urgent",
    other: "Other",
    noRecurrence: "None",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    addTask: "Add",
    allTasks: "All",
    pendingTasks: "Pending",
    completedTasks: "Completed",
    searchPlaceholder: "Search...",
    sortDefault: "Default",
    sortDateAsc: "Date Ascending",
    sortDateDesc: "Date Descending",
    downloadPDF: "PDF",
    clearAll: "Clear All",
    confirm: "Confirm",
    cancel: "Cancel",
    customize: "Customize",
    save: "Save",
    noTasks: "No tasks to export",
    noTasksToClear: "No tasks to clear",
    dateRequired: "Date and time are required and must be in the future",
    editTask: "Edit task",
    ok: "OK",
  },
  ar: {
    title: "سمارت فلو",
    addTaskPlaceholder: "أضف مهمة...",
    datePlaceholder: "اختر تاريخ/وقت...",
    lowPriority: "منخفض",
    mediumPriority: "متوسط",
    highPriority: "عالي",
    work: "عمل",
    personal: "شخصي",
    urgent: "عاجل",
    other: "آخر",
    noRecurrence: "لا تكرار",
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
    addTask: "أضف",
    allTasks: "الكل",
    pendingTasks: "قيد الانتظار",
    completedTasks: "مكتمل",
    searchPlaceholder: "بحث...",
    sortDefault: "افتراضي",
    sortDateAsc: "تاريخ تصاعدي",
    sortDateDesc: "تاريخ تنازلي",
    downloadPDF: "PDF",
    clearAll: "مسح الكل",
    confirm: "تأكيد",
    cancel: "إلغاء",
    customize: "تخصيص",
    save: "حفظ",
    noTasks: "لا توجد مهام للتصدير",
    noTasksToClear: "لا توجد مهام للمسح",
    dateRequired: "التاريخ والوقت مطلوبان ويجب أن يكونا في المستقبل",
    editTask: "تعديل المهمة",
    ok: "موافق",
  },
};

function updateLanguage(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  fpInstance.set("locale", lang);
  fpInstance.redraw();
  const calendarContainer = fpInstance.calendarContainer;
  if (calendarContainer) {
    calendarContainer.style.direction = lang === "ar" ? "rtl" : "ltr";
  }
  Object.keys(translations[lang]).forEach((key) => {
    const elementsWithKey = document.querySelectorAll(`[data-i18n="${key}"]`);
    elementsWithKey.forEach((el) => (el.textContent = translations[lang][key]));
    const placeholders = document.querySelectorAll(`[data-i18n-placeholder="${key}"]`);
    placeholders.forEach((el) => el.setAttribute("placeholder", translations[lang][key]));
  });
  localStorage.setItem("lang", lang);
  renderTasks();
}

function handleFormSubmit(event) {
  event.preventDefault();
  event.stopPropagation();
  const taskText = elements.taskInput.value.trim();
  const taskDate = elements.taskDate.value;
  const taskPriority = elements.taskPriority.value;
  const taskCategory = elements.taskCategory.value;
  const taskRecurrence = elements.taskRecurrence.value;
  if (!taskText || !taskDate) {
    showErrorModal(translations[document.documentElement.lang].dateRequired || "La date et l'heure sont obligatoires et doivent être dans le futur");
    return;
  }
  const selectedDate = new Date(taskDate);
  const now = new Date();
  if (selectedDate <= now) {
    showErrorModal(translations[document.documentElement.lang].dateRequired || "La date et l'heure sont obligatoires et doivent être dans le futur");
    return;
  }
  const addButton = elements.taskForm.querySelector("#add-task");
  if (isEditing) {
    const task = tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.text = taskText;
      task.date = taskDate;
      task.priority = taskPriority;
      task.category = taskCategory;
      task.recurrence = taskRecurrence;
    }
  } else {
    const task = {
      id: Date.now(),
      text: taskText,
      date: taskDate,
      priority: taskPriority,
      category: taskCategory,
      recurrence: taskRecurrence,
      completed: false,
    };
    tasks.push(task);
  }
  localStorage.setItem("tasks", JSON.stringify(tasks));
  renderTasks();
  elements.taskForm.reset();
  elements.taskDate._flatpickr.clear();
  addButton.textContent = translations[document.documentElement.lang].addTask || "Ajouter";
  addButton.removeAttribute("data-editId");
  isEditing = false;
  editingTaskId = null;
}

function appendTaskToList(task) {
  const template = document.getElementById("task-template").content.cloneNode(true);
  const taskElement = template.querySelector(".glass-task");
  taskElement.dataset.id = task.id;
  taskElement.querySelector(".task-priority").textContent = task.priority.charAt(0).toUpperCase();
  taskElement.querySelector(".task-priority").classList.add(`priority-${task.priority}`);
  taskElement.querySelector(".due-date").textContent = task.date || translations[document.documentElement.lang].noDate || "Pas de date";
  taskElement.querySelector(".task-text").textContent = task.text;
  taskElement.querySelector(".task-category").textContent = translations[document.documentElement.lang][task.category] || task.category;
  taskElement.querySelector(".task-recurrence").textContent = translations[document.documentElement.lang][task.recurrence] || task.recurrence;
  if (task.completed) taskElement.classList.add("completed");
  if (task.date && new Date(task.date) < new Date() && !task.completed) taskElement.querySelector(".due-date").classList.add("overdue");
  taskElement.querySelector(".toggle-button").addEventListener("click", () => toggleTask(task.id));
  taskElement.querySelector(".edit-button").addEventListener("click", () => editTask(task.id));
  taskElement.querySelector(".delete-button").addEventListener("click", () => deleteTask(task.id));
  return taskElement;
}

function renderTasks() {
  elements.taskList.innerHTML = "";
  let filteredTasks = tasks.filter((task) => {
    if (currentFilter === "all") return true;
    if (currentFilter === "pending") return !task.completed;
    if (currentFilter === "completed") return task.completed;
  });
  const searchTerm = elements.searchInput.value.toLowerCase();
  filteredTasks = filteredTasks.filter((task) => task.text.toLowerCase().includes(searchTerm));
  if (currentSort === "date-asc") {
    filteredTasks.sort((a, b) => new Date(a.date || "9999-12-31") - new Date(b.date || "9999-12-31"));
  } else if (currentSort === "date-desc") {
    filteredTasks.sort((a, b) => new Date(b.date || "0000-01-01") - new Date(a.date || "0000-01-01"));
  }
  filteredTasks.forEach((task) => elements.taskList.appendChild(appendTaskToList(task)));
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    localStorage.setItem("tasks", JSON.stringify(tasks));
    renderTasks();
    if (notificationsEnabled && task.completed) notify("Tâche terminée", task.text);
  }
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  isEditing = true;
  editingTaskId = id;
  window.scrollTo({ top: 0, behavior: "smooth" });
  elements.taskInput.value = task.text;
  elements.taskInput.focus();
  elements.taskDate._flatpickr.setDate(task.date);
  elements.taskPriority.value = task.priority;
  elements.taskCategory.value = task.category;
  elements.taskRecurrence.value = task.recurrence;
  const addButton = elements.taskForm.querySelector("#add-task");
  addButton.textContent = translations[document.documentElement.lang].editTask || "Modifier la tâche";
  addButton.dataset.editId = id;
}

function deleteTask(id) {
  showModal(translations[document.documentElement.lang].deleteConfirm || "Voulez-vous supprimer cette tâche ?", () => {
    tasks = tasks.filter(t => t.id !== id);
    localStorage.setItem("tasks", JSON.stringify(tasks));
    renderTasks();
  });
}

function showModal(message, onConfirm) {
  elements.modalMessage.textContent = message;
  elements.modalOverlay.setAttribute("aria-hidden", "false");
  elements.modalOverlay.querySelector(".modal").classList.remove("error");
  elements.modalConfirm.style.display = "inline-block";
  elements.modalCancel.style.display = "inline-block";
  elements.modalConfirm.textContent = translations[document.documentElement.lang].confirm || "Confirmer";
  elements.modalCancel.textContent = translations[document.documentElement.lang].cancel || "Annuler";
  elements.modalConfirm.onclick = () => {
    onConfirm();
    elements.modalOverlay.setAttribute("aria-hidden", "true");
  };
  elements.modalCancel.onclick = () => elements.modalOverlay.setAttribute("aria-hidden", "true");
}

function showErrorModal(message) {
  elements.modalMessage.textContent = message;
  elements.modalOverlay.setAttribute("aria-hidden", "false");
  elements.modalOverlay.querySelector(".modal").classList.add("error");
  elements.modalConfirm.style.display = "none";
  elements.modalCancel.style.display = "inline-block";
  elements.modalCancel.textContent = translations[document.documentElement.lang].ok || "OK";
  elements.modalCancel.onclick = () => elements.modalOverlay.setAttribute("aria-hidden", "true");
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme || "dark";
  document.documentElement.dataset.theme = currentTheme === "dark" ? "light" : "dark";
  elements.toggleTheme.querySelector("i").classList.toggle("fa-moon");
  elements.toggleTheme.querySelector("i").classList.toggle("fa-sun");
  localStorage.setItem("theme", document.documentElement.dataset.theme);
}

function toggleView() {
  const currentView = elements.taskList.dataset.view;
  elements.taskList.dataset.view = currentView === "list" ? "kanban" : "list";
  elements.toggleView.querySelector("i").classList.toggle("fa-th-list");
  elements.toggleView.querySelector("i").classList.toggle("fa-columns");
  if (elements.taskList.dataset.view === "kanban") renderKanban();
  else renderTasks();
}

function renderKanban() {
  elements.taskList.innerHTML = `
    <div class="kanban-columns">
      <div class="kanban-column"><h3>En cours</h3><ul id="pending-tasks"></ul></div>
      <div class="kanban-column"><h3>Terminées</h3><ul id="completed-tasks"></ul></div>
    </div>
  `;
  const pendingTasks = document.getElementById("pending-tasks");
  const completedTasks = document.getElementById("completed-tasks");
  tasks.forEach((task) => {
    const taskElement = appendTaskToList(task);
    if (task.completed) completedTasks.appendChild(taskElement);
    else pendingTasks.appendChild(taskElement);
  });
}

function toggleNotifications() {
  if (!("Notification" in window)) {
    alert("Les notifications ne sont pas supportées par ce navigateur.");
    return;
  }
  notificationsEnabled = !notificationsEnabled;
  elements.notificationsBtn.querySelector("i").classList.toggle("fa-bell");
  elements.notificationsBtn.querySelector("i").classList.toggle("fa-bell-slash");
  if (notificationsEnabled) Notification.requestPermission();
}

function notify(title, body) {
  if (notificationsEnabled && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

elements.taskForm.addEventListener("submit", handleFormSubmit);
elements.toggleTheme.addEventListener("click", toggleTheme);
elements.toggleView.addEventListener("click", toggleView);
elements.notificationsBtn.addEventListener("click", toggleNotifications);
elements.reloadBtn.addEventListener("click", () => location.reload());
elements.languageSelector.addEventListener("change", (e) => updateLanguage(e.target.value));
elements.customizeBtnTop.addEventListener("click", () => elements.customizeModal.setAttribute("aria-hidden", "false"));

elements.customizeSave.addEventListener("click", () => {
  const themeColor = elements.customThemeColor.value;
  const font = elements.customFont.value;
  const opacity = elements.customGlassOpacity.value;
  const backgroundFile = elements.customBackground.files[0];
  document.documentElement.style.setProperty("--primary-color", themeColor);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", themeColor);
  document.body.style.fontFamily = font;
  document.documentElement.style.setProperty("--glass-bg", `rgba(255, 255, 255, ${opacity})`);
  if (backgroundFile) {
    const reader = new FileReader();
    reader.onload = (e) => document.body.style.backgroundImage = `url(${e.target.result})`;
    reader.readAsDataURL(backgroundFile);
  }
  localStorage.setItem("customThemeColor", themeColor);
  localStorage.setItem("customFont", font);
  localStorage.setItem("customGlassOpacity", opacity);
  elements.customizeModal.setAttribute("aria-hidden", "true");
});

elements.filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    elements.filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    renderTasks();
  });
});

elements.searchInput.addEventListener("input", renderTasks);
elements.sortSelector.addEventListener("change", (e) => {
  currentSort = e.target.value;
  renderTasks();
});

elements.downloadPdf.addEventListener("click", () => {
  if (tasks.length === 0) {
    showErrorModal(translations[document.documentElement.lang].noTasks || "Aucune tâche à exporter");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  const isArabicText = (text) => /[\u0600-\u06FF]/.test(text);
  const lang = document.documentElement.lang;
  const title = translations[lang].title + " - " + (lang === "ar" ? "قائمة المهام" : "Liste des tâches");
  if (lang === "ar") {
    doc.text(title, 190, 10, { align: "right" });
  } else {
    doc.text(title, 10, 10);
  }
  let y = 20;
  tasks.forEach((task, index) => {
    const status = task.completed ? translations[lang].completedTasks : translations[lang].pendingTasks;
    const dateText = task.date || (lang === "ar" ? "لا تاريخ" : "Pas de date");
    const taskText = `${index + 1}. ${task.text} (${dateText}) [${status}]`;
    if (isArabicText(task.text) || lang === "ar") {
      const reversedText = taskText.split("").reverse().join("");
      doc.text(reversedText, 190, y, { align: "right" });
    } else {
      doc.text(taskText, 10, y);
    }
    y += 10;
  });
  doc.save("smartflow_tasks.pdf");
});

elements.clearAll.addEventListener("click", () => {
  if (tasks.length === 0) {
    showErrorModal(translations[document.documentElement.lang].noTasksToClear || "Aucune tâche à effacer");
    return;
  }
  showModal(translations[document.documentElement.lang].clearAllConfirm || "Voulez-vous effacer toutes les tâches ?", () => {
    tasks = [];
    localStorage.setItem("tasks", JSON.stringify(tasks));
    renderTasks();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.dataset.theme = savedTheme;
  if (savedTheme === "light") toggleTheme();
  const savedLang = localStorage.getItem("lang") || "fr";
  elements.languageSelector.value = savedLang;
  updateLanguage(savedLang);
  const customThemeColor = localStorage.getItem("customThemeColor");
  const customFont = localStorage.getItem("customFont");
  const customGlassOpacity = localStorage.getItem("customGlassOpacity");
  if (customThemeColor) document.documentElement.style.setProperty("--primary-color", customThemeColor);
  if (customFont) document.body.style.fontFamily = customFont;
  if (customGlassOpacity) document.documentElement.style.setProperty("--glass-bg", `rgba(255, 255, 255, ${customGlassOpacity})`);
  renderTasks();
});