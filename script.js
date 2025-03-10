document.addEventListener("DOMContentLoaded", () => {
  const MAX_TASKS = 1000;
  const VERSION = "v2.0.0";

  const elements = {
    taskForm: document.getElementById("task-form"),
    taskInput: document.getElementById("task-input"),
    taskDate: document.getElementById("task-date"),
    taskPriority: document.getElementById("task-priority"),
    taskCategory: document.getElementById("task-category"),
    taskRecurrence: document.getElementById("task-recurrence"),
    addTaskBtn: document.getElementById("add-task"),
    taskList: document.getElementById("task-list"),
    filterButtons: document.querySelectorAll(".filters button"),
    toggleThemeBtn: document.getElementById("toggle-theme"),
    toggleViewBtn: document.getElementById("toggle-view"),
    customizeBtn: document.getElementById("customize-btn"),
    notificationsBtn: document.getElementById("notifications-btn"),
    searchInput: document.getElementById("search-input"),
    sortSelector: document.getElementById("sort-selector"),
    downloadPDF: document.getElementById("download-pdf"),
    clearAllBtn: document.getElementById("clear-all"),
    modalOverlay: document.getElementById("modal-overlay"),
    modalMessage: document.getElementById("modal-message"),
    modalConfirm: document.getElementById("modal-confirm"),
    modalCancel: document.getElementById("modal-cancel"),
    customizeModal: document.getElementById("customize-modal"),
    customThemeColor: document.getElementById("custom-theme-color"),
    customFont: document.getElementById("custom-font"),
    customBackground: document.getElementById("custom-background"),
    customGlassOpacity: document.getElementById("custom-glass-opacity"),
    customizeSave: document.getElementById("customize-save"),
    languageSelector: document.getElementById("language-selector"),
  };

  const requiredElements = ['taskForm', 'taskList', 'taskInput', 'addTaskBtn', 'toggleViewBtn', 'customGlassOpacity'];
  for (const el of requiredElements) {
    if (!elements[el]) {
      console.error(`Erreur : ${el} non trouvé dans le DOM`);
      return;
    }
  }

  let tasks = [];
  let currentFilter = "all";
  let currentView = "list";
  let currentLanguage = localStorage.getItem("language") || "fr";
  let isNotificationsEnabled = localStorage.getItem("notifications") === "true" || false;
  let notificationTimeouts = new Map();
  let hasUserInteracted = false;

  document.addEventListener("click", () => hasUserInteracted = true, { once: true });

  const promisifyRequest = (request) => {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const openDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("TaskDB", 2);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("tasks")) {
          db.createObjectStore("tasks", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const loadTasksFromDB = async () => {
    try {
      const db = await openDB();
      const tx = db.transaction("tasks", "readwrite"); // Changed to readwrite for migration
      const store = tx.objectStore("tasks");
      const request = store.getAll();
      tasks = (await promisifyRequest(request)) || [];
      // Migrate old date formats
      tasks = tasks.map(task => {
        if (!task.date.includes("T")) { // Old "dd-mm-YYYY HH:mm" format
          const dateObj = flatpickr.parseDate(task.date, "d-m-Y H:i");
          task.date = dateObj ? dateObj.toISOString() : new Date().toISOString();
          store.put(task); // Update in DB
        }
        return task;
      });
      await tx.commit();
      renderTasks();
      if (isNotificationsEnabled) tasks.forEach(task => scheduleNotification(task));
    } catch (error) {
      console.error("Erreur chargement tâches:", error);
      showModal("Erreur de chargement des tâches.");
    }
  };

  const saveTaskToDB = async (task) => {
    try {
      const db = await openDB();
      const tx = db.transaction("tasks", "readwrite");
      const store = tx.objectStore("tasks");
      await promisifyRequest(store.put(task));
      await tx.commit();
      triggerSync();
    } catch (error) {
      console.error("Erreur sauvegarde tâche:", error);
      showModal("Erreur lors de la sauvegarde.");
    }
  };

  const deleteTaskFromDB = async (id) => {
    try {
      const db = await openDB();
      const tx = db.transaction("tasks", "readwrite");
      const store = tx.objectStore("tasks");
      await promisifyRequest(store.delete(id));
      await tx.commit();
      triggerSync();
    } catch (error) {
      console.error("Erreur suppression tâche:", error);
      showModal("Erreur lors de la suppression.");
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    if (tasks.length >= MAX_TASKS) return showModal(localizedMessages[currentLanguage].maxTasks);
    
    const text = elements.taskInput.value.trim();
    const selectedDate = fpInstance.selectedDates[0]; // Get Date object directly from Flatpickr
    if (!text) return showModal("Veuillez entrer une tâche.");
    if (!selectedDate || selectedDate < new Date()) return showModal("Veuillez entrer une date/heure future valide.");

    const suggestedPriority = suggestPriority(text);
    const task = {
      id: Date.now().toString(),
      text,
      date: selectedDate.toISOString(), // Store as ISO string
      priority: elements.taskPriority.value || suggestedPriority,
      category: elements.taskCategory.value || "other",
      recurrence: elements.taskRecurrence.value || "none",
      completed: false,
      createdAt: new Date().toISOString(),
    };

    tasks.push(task);
    await saveTaskToDB(task);
    renderTasks();
    handleRecurrence(task); // Line 142
    resetForm();

    if (typeof gsap !== "undefined") {
      requestAnimationFrame(() => {
        gsap.from(`[data-id="${task.id}"]`, { y: -30, opacity: 0, duration: 0.2, ease: "power2.out" });
      });
    }

    if (isNotificationsEnabled) {
      scheduleNotification(task);
      checkOverdueTasks();
    }

    elements.taskInput.focus();
  };

  const suggestPriority = (text) => {
    const urgencyKeywords = {
      high: ["urgent", "maintenant", "immédiat", "now", "immediately"],
      medium: ["bientôt", "important", "vite", "soon", "important", "quick"],
      low: ["plus tard", "facile", "optionnel", "later", "easy", "optional"]
    };
    text = text.toLowerCase();
    for (const [priority, keywords] of Object.entries(urgencyKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) return priority;
    }
    return "medium";
  };

  const handleRecurrence = async (task) => {
    if (task.recurrence === "none") return;
    const nextDate = new Date(task.date); // task.date is now ISO format
    if (isNaN(nextDate.getTime())) {
      console.error("Invalid date in handleRecurrence:", task.date);
      return; // Prevent further processing
    }
    switch (task.recurrence) {
      case "daily": nextDate.setDate(nextDate.getDate() + 1); break;
      case "weekly": nextDate.setDate(nextDate.getDate() + 7); break;
      case "monthly": nextDate.setMonth(nextDate.getMonth() + 1); break;
    }
    const newTask = { 
      ...task, 
      id: Date.now().toString(), 
      date: nextDate.toISOString(), // Line 180: Now safe
      completed: false 
    };
    tasks.push(newTask);
    await saveTaskToDB(newTask);
    renderTasks();
    if (isNotificationsEnabled) scheduleNotification(newTask);
  };

  const toggleTask = async (task, li) => {
    task.completed = !task.completed;
    await saveTaskToDB(task);
    renderTasks();

    if (task.completed && isNotificationsEnabled) {
      const timeoutId = notificationTimeouts.get(task.id);
      if (timeoutId) clearTimeout(timeoutId);
      notificationTimeouts.delete(task.id);
    }
    if (isNotificationsEnabled) checkOverdueTasks();
  };

  const editTask = (task) => {
    elements.taskInput.value = task.text;
    elements.taskDate.value = flatpickr.formatDate(new Date(task.date), "d-m-Y H:i"); // Convert ISO back to Flatpickr format
    elements.taskPriority.value = task.priority;
    elements.taskCategory.value = task.category;
    elements.taskRecurrence.value = task.recurrence;
    elements.addTaskBtn.textContent = localizedMessages[currentLanguage].update;
    elements.addTaskBtn.onclick = async (e) => {
      e.preventDefault();
      const newText = elements.taskInput.value.trim();
      const selectedDate = fpInstance.selectedDates[0];
      if (!newText || !selectedDate || selectedDate < new Date()) return showModal("Veuillez entrer une tâche et une date/heure valide.");
      task.text = newText;
      task.date = selectedDate.toISOString();
      task.priority = elements.taskPriority.value;
      task.category = elements.taskCategory.value;
      task.recurrence = elements.taskRecurrence.value;
      await saveTaskToDB(task);
      renderTasks();
      resetForm();
      if (isNotificationsEnabled) {
        const timeoutId = notificationTimeouts.get(task.id);
        if (timeoutId) clearTimeout(timeoutId);
        scheduleNotification(task);
        checkOverdueTasks();
      }
    };
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteTask = (task) => {
    showModal(localizedMessages[currentLanguage].deleteConfirm, async () => {
      tasks = tasks.filter(t => t.id !== task.id);
      await deleteTaskFromDB(task.id);
      renderTasks();
      if (isNotificationsEnabled) {
        const timeoutId = notificationTimeouts.get(task.id);
        if (timeoutId) clearTimeout(timeoutId);
        notificationTimeouts.delete(task.id);
      }
    });
  };

  const clearAllTasks = () => {
    if (tasks.length === 0) {
      showModal(localizedMessages[currentLanguage].noTasks);
    } else {
      showModal(localizedMessages[currentLanguage].clearConfirm, async () => {
        tasks = [];
        const db = await openDB();
        const tx = db.transaction("tasks", "readwrite");
        const store = tx.objectStore("tasks");
        await promisifyRequest(store.clear());
        await tx.commit();
        triggerSync();
        renderTasks();
        if (isNotificationsEnabled) notificationTimeouts.forEach((id) => clearTimeout(id));
        notificationTimeouts.clear();
      });
    }
  };

  const renderTasks = () => {
    elements.taskList.innerHTML = "";
    const filteredTasks = tasks
      .filter(t => currentFilter === "all" ? true : currentFilter === "pending" ? !t.completed : t.completed)
      .filter(t => t.text.toLowerCase().includes(elements.searchInput.value.toLowerCase()))
      .sort((a, b) => {
        if (elements.sortSelector.value === "date-asc") return new Date(a.date) - new Date(b.date);
        if (elements.sortSelector.value === "date-desc") return new Date(b.date) - new Date(a.date);
        return 0;
      });

    if (filteredTasks.length === 0) {
      elements.taskList.innerHTML = `<p data-i18n="noTasks">${localizedMessages[currentLanguage].noTasks}</p>`;
      return;
    }

    elements.taskList.dataset.view = currentView;
    if (currentView === "kanban") {
      const pending = filteredTasks.filter(t => !t.completed);
      const completed = filteredTasks.filter(t => t.completed);
      const kanbanContainer = document.createElement("div");
      kanbanContainer.className = "kanban-columns";
      ["pending", "completed"].forEach(status => {
        const column = document.createElement("div");
        column.className = `kanban-column ${status}`;
        column.innerHTML = `<h3>${localizedMessages[currentLanguage][status + "Tasks"]}</h3>`;
        const ul = document.createElement("ul");
        (status === "pending" ? pending : completed).forEach(t => appendTaskToList(t, ul));
        column.appendChild(ul);
        kanbanContainer.appendChild(column);
      });
      elements.taskList.appendChild(kanbanContainer);
    } else {
      filteredTasks.forEach(t => appendTaskToList(t));
    }
  };

  const appendTaskToList = (task, container = elements.taskList) => {
    if (!shouldDisplayTask(task)) return;
    try {
      const template = document.getElementById("task-template");
      if (!template) throw new Error("Template tâche introuvable");
      const li = template.content.cloneNode(true).querySelector("li");
      li.dataset.id = task.id;
      li.classList.toggle("completed", task.completed);
      li.querySelector(".task-priority").textContent = localizedMessages[currentLanguage][`${task.priority}Priority`][0];
      li.querySelector(".task-priority").classList.add(`priority-${task.priority}`);
      li.querySelector(".due-date").textContent = new Date(task.date).toLocaleString(currentLanguage, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      li.querySelector(".due-date").classList.toggle("overdue", new Date(task.date) < new Date() && !task.completed);
      li.querySelector(".task-text").textContent = task.text;
      li.querySelector(".task-category").textContent = localizedMessages[currentLanguage][task.category];
      li.querySelector(".task-recurrence").textContent = localizedMessages[currentLanguage][task.recurrence];

      li.querySelector(".toggle-button").onclick = () => toggleTask(task, li);
      li.querySelector(".edit-button").onclick = () => editTask(task);
      li.querySelector(".delete-button").onclick = () => deleteTask(task);

      container.appendChild(li);

      if (typeof Draggable !== "undefined" && currentView === "list") {
        Draggable.create(li, {
          type: "y",
          bounds: elements.taskList,
          onDragEnd: () => reorderTasks(),
        });
      }
    } catch (error) {
      console.error("Erreur appendTaskToList:", error);
    }
  };

  const shouldDisplayTask = (task) => {
    return (
      (currentFilter === "all" || (currentFilter === "pending" && !task.completed) || (currentFilter === "completed" && task.completed)) &&
      task.text.toLowerCase().includes(elements.searchInput.value.toLowerCase())
    );
  };

  const reorderTasks = async () => {
    const newOrder = Array.from(elements.taskList.children).map(li => tasks.find(t => t.id === li.dataset.id));
    tasks = newOrder.filter(Boolean);
    for (const task of tasks) await saveTaskToDB(task);
    renderTasks();
  };

  const resetForm = () => {
    elements.taskForm.reset();
    elements.addTaskBtn.textContent = localizedMessages[currentLanguage].addTask;
    elements.addTaskBtn.onclick = addTask;
    fpInstance.clear(); // Clear Flatpickr selection
  };

  const syncThemeWithSystem = () => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    document.documentElement.dataset.theme = localStorage.getItem("theme") || (prefersDark.matches ? "dark" : "light");
    elements.toggleThemeBtn.querySelector("i").className = document.documentElement.dataset.theme === "dark" ? "fas fa-moon" : "fas fa-sun";
    updateThemeBackground();
    prefersDark.addEventListener("change", (e) => {
      document.documentElement.dataset.theme = e.matches ? "dark" : "light";
      localStorage.setItem("theme", document.documentElement.dataset.theme);
      updateThemeBackground();
    });
  };

  const updateThemeBackground = () => {
    const customBg = localStorage.getItem("customBackground");
    if (customBg) {
      document.body.classList.add("custom-background");
      document.body.style.backgroundImage = `url(${customBg})`;
    } else {
      document.body.classList.remove("custom-background");
      document.body.style.backgroundImage = "none";
      document.body.style.backgroundColor = document.documentElement.dataset.theme === "dark" ? "#000000" : "#ffffff";
    }
  };

  const updateThemeColor = (color) => {
    document.querySelector('meta[name="theme-color"]').setAttribute("content", color);
    document.documentElement.style.setProperty("--primary-color", color);
    localStorage.setItem("themeColor", color);
  };

  const updateFont = (font) => {
    document.body.classList.remove("custom-font-roboto", "custom-font-arial", "custom-font-montserrat");
    document.body.classList.add(`custom-font-${font.toLowerCase()}`);
    localStorage.setItem("font", font);
  };

  const updateGlassOpacity = (opacity) => {
    document.documentElement.style.setProperty("--glass-bg", `rgba(255, 255, 255, ${opacity})`);
    localStorage.setItem("glassOpacity", opacity);
  };

  const showModal = (msg, onConfirm) => {
    elements.modalMessage.textContent = msg;
    elements.modalOverlay.setAttribute("aria-hidden", "false");
    elements.modalConfirm.onclick = () => {
      elements.modalOverlay.setAttribute("aria-hidden", "true");
      if (onConfirm) onConfirm();
    };
    elements.modalCancel.onclick = () => elements.modalOverlay.setAttribute("aria-hidden", "true");
    elements.modalConfirm.style.display = onConfirm ? "inline-block" : "none";
  };

  const customizeApp = () => {
    elements.customizeModal.setAttribute("aria-hidden", "false");
    elements.customThemeColor.value = localStorage.getItem("themeColor") || "#4b5e95";
    elements.customFont.value = localStorage.getItem("font") || "Roboto";
    elements.customGlassOpacity.value = localStorage.getItem("glassOpacity") || "0.05";
    elements.customizeSave.onclick = () => {
      updateThemeColor(elements.customThemeColor.value);
      updateFont(elements.customFont.value);
      updateGlassOpacity(elements.customGlassOpacity.value);
      if (elements.customBackground.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const url = e.target.result;
          document.body.style.backgroundImage = `url(${url})`;
          localStorage.setItem("customBackground", url);
          document.body.classList.add("custom-background");
        };
        reader.readAsDataURL(elements.customBackground.files[0]);
      } else if (!elements.customBackground.value) {
        localStorage.removeItem("customBackground");
        updateThemeBackground();
      }
      elements.customizeModal.setAttribute("aria-hidden", "true");
    };
  };

  const generatePDF = () => {
    if (tasks.length === 0) return showModal(localizedMessages[currentLanguage].noTasksMessage);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(localizedMessages[currentLanguage].title, 10, 10);
    doc.setFontSize(12);

    const pageWidth = doc.internal.pageSize.getWidth() - 20;
    let yPosition = 20;

    tasks.forEach((t, i) => {
      const status = t.completed ? localizedMessages[currentLanguage].completedTasks : localizedMessages[currentLanguage].pendingTasks;
      const taskText = `${i + 1}. ${t.text} (${status}) - ${new Date(t.date).toLocaleString(currentLanguage, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })}`;
      const splitText = doc.splitTextToSize(taskText, pageWidth);
      
      splitText.forEach((line, lineIndex) => {
        if (yPosition + 10 > doc.internal.pageSize.getHeight() - 10) {
          doc.addPage();
          yPosition = 10;
        }
        doc.text(line, 10, yPosition);
        yPosition += 10;
      });
    });

    doc.save("task-list.pdf");
  };

  const updateLocalization = () => {
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = localizedMessages[currentLanguage][el.dataset.i18n] || el.dataset.i18n;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      el.placeholder = localizedMessages[currentLanguage][el.dataset.i18nPlaceholder] || el.dataset.i18nPlaceholder;
    });
    const title = localizedMessages[currentLanguage].title;
    document.querySelector("h1[data-i18n='title']").textContent = title;
    renderTasks();
  };

  const localizedMessages = {
    fr: {
      title: "SmartFlow",
      addTask: "Ajouter",
      update: "Mettre à jour",
      confirm: "Confirmer",
      cancel: "Annuler",
      allTasks: "Tout",
      pendingTasks: "En cours",
      completedTasks: "Terminées",
      downloadPDF: "Télécharger en PDF",
      clearAll: "Tout Effacer",
      customize: "Personnalisation",
      save: "Sauvegarder",
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
      addTaskPlaceholder: "Ajouter une tâche...",
      searchPlaceholder: "Rechercher une tâche...",
      sortDefault: "Par défaut",
      sortDateAsc: "Date croissante",
      sortDateDesc: "Date décroissante",
      deleteConfirm: "Supprimer cette tâche ?",
      clearConfirm: "Effacer toutes les tâches ?",
      maxTasks: "Limite de tâches atteinte !",
      noTasks: "Aucune tâche trouvée.",
      noTasksMessage: "Aucune tâche à exporter !",
      enableNotifications: "Notifications activées",
      notificationGranted: "Notifications activées !",
      notificationDenied: "Notifications désactivées !",
      offlineWarning: "Vous êtes hors ligne."
    },
    en: {
      title: "SmartFlow",
      addTask: "Add",
      update: "Update",
      confirm: "Confirm",
      cancel: "Cancel",
      allTasks: "All",
      pendingTasks: "Pending",
      completedTasks: "Completed",
      downloadPDF: "Download as PDF",
      clearAll: "Clear All",
      customize: "Customize",
      save: "Save",
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
      addTaskPlaceholder: "Add a task...",
      searchPlaceholder: "Search for a task...",
      sortDefault: "Default",
      sortDateAsc: "Date ascending",
      sortDateDesc: "Date descending",
      deleteConfirm: "Delete this task?",
      clearConfirm: "Clear all tasks?",
      maxTasks: "Task limit reached!",
      noTasks: "No tasks found.",
      noTasksMessage: "No tasks to export!",
      enableNotifications: "Notifications enabled",
      notificationGranted: "Notifications enabled!",
      notificationDenied: "Notifications disabled!",
      offlineWarning: "You are offline."
    },
    ar: {
      title: "تطبيق المهام",
      addTask: "إضافة",
      update: "تحديث",
      confirm: "تأكيد",
      cancel: "إلغاء",
      allTasks: "الكل",
      pendingTasks: "قيد الانتظار",
      completedTasks: "مكتملة",
      downloadPDF: "تحميل بصيغة PDF",
      clearAll: "مسح الكل",
      customize: "تخصيص",
      save: "حفظ",
      lowPriority: "منخفض",
      mediumPriority: "متوسط",
      highPriority: "مرتفع",
      work: "عمل",
      personal: "شخصي",
      urgent: "عاجل",
      other: "آخر",
      noRecurrence: "لا تكرار",
      daily: "يومي",
      weekly: "أسبوعي",
      monthly: "شهري",
      addTaskPlaceholder: "أضف مهمة...",
      searchPlaceholder: "ابحث عن مهمة...",
      sortDefault: "الافتراضي",
      sortDateAsc: "التاريخ تصاعدي",
      sortDateDesc: "التاريخ تنازلي",
      deleteConfirm: "حذف هذه المهمة؟",
      clearConfirm: "مسح جميع المهام؟",
      maxTasks: "تم الوصول إلى الحد الأقصى للمهام!",
      noTasks: "لا توجد مهام.",
      noTasksMessage: "لا توجد مهام للتصدير!",
      enableNotifications: "الإشعارات مفعلة",
      notificationGranted: "تم تفعيل الإشعارات!",
      notificationDenied: "تم تعطيل الإشعارات!",
      offlineWarning: "أنت غير متصل بالإنترنت."
    },
  };

  const toggleNotifications = () => {
    if (!("Notification" in window)) return showModal("Notifications non supportées par ce navigateur.");
    
    if (!isNotificationsEnabled) {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          isNotificationsEnabled = true;
          localStorage.setItem("notifications", "true");
          elements.notificationsBtn.classList.add("active");
          elements.notificationsBtn.title = localizedMessages[currentLanguage].notificationGranted;
          checkOverdueTasks();
          tasks.forEach(task => !task.completed && scheduleNotification(task));
        }
      });
    } else {
      isNotificationsEnabled = false;
      localStorage.setItem("notifications", "false");
      elements.notificationsBtn.classList.remove("active");
      elements.notificationsBtn.title = localizedMessages[currentLanguage].notificationDenied;
      notificationTimeouts.forEach((id) => clearTimeout(id));
      notificationTimeouts.clear();
    }
  };

  const scheduleNotification = (task) => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !isNotificationsEnabled || task.completed) return;
    const notificationTime = new Date(task.date).getTime() - 15 * 60 * 1000;
    if (notificationTime > Date.now()) {
      const timeoutId = setTimeout(() => {
        new Notification("Tâche imminente", {
          body: `${task.text} est due bientôt !`,
          icon: "/icon.png",
        });
        notificationTimeouts.delete(task.id);
      }, notificationTime - Date.now());
      notificationTimeouts.set(task.id, timeoutId);
    }
  };

  const checkOverdueTasks = () => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !hasUserInteracted || !isNotificationsEnabled) return;
    tasks.forEach(task => {
      if (!task.completed && new Date(task.date) < new Date() && !notificationTimeouts.has(task.id)) {
        new Notification("Tâche en retard", {
          body: `${task.text} est en retard !`,
          icon: "/icon.png",
        });
        notificationTimeouts.set(task.id, null);
      }
    });
  };

  const toggleView = () => {
    currentView = currentView === "list" ? "kanban" : "list";
    elements.toggleViewBtn.querySelector("i").className = currentView === "list" ? "fas fa-th-list" : "fas fa-columns";
    renderTasks();
  };

  const triggerSync = () => {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.sync.register('sync-tasks')
          .then(() => console.log('Synchronisation en arrière-plan enregistrée'))
          .catch((err) => console.error('Échec de l’enregistrement de la synchronisation:', err));
      });
    }
  };

  elements.taskForm.onsubmit = addTask;
  elements.filterButtons.forEach(btn => {
    btn.onclick = () => {
      currentFilter = btn.dataset.filter;
      elements.filterButtons.forEach(b => b.classList.toggle("active", b === btn));
      renderTasks();
    };
  });
  elements.toggleThemeBtn.onclick = () => {
    document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", document.documentElement.dataset.theme);
    elements.toggleThemeBtn.querySelector("i").className = document.documentElement.dataset.theme === "dark" ? "fas fa-moon" : "fas fa-sun";
    updateThemeBackground();
  };
  elements.toggleViewBtn.onclick = toggleView;
  elements.customizeBtn.onclick = customizeApp;
  elements.downloadPDF.onclick = generatePDF;
  elements.clearAllBtn.onclick = clearAllTasks;
  elements.searchInput.oninput = renderTasks;
  elements.sortSelector.onchange = renderTasks;
  elements.languageSelector.onchange = (e) => {
    currentLanguage = e.target.value;
    localStorage.setItem("language", currentLanguage);
    updateLocalization();
  };
  elements.notificationsBtn.onclick = toggleNotifications;

  const localeMap = {
    fr: "fr",
    en: "en",
    ar: "ar"
  };

  let fpInstance = flatpickr(elements.taskDate, {
    enableTime: true,
    dateFormat: "d-m-Y H:i",
    minDate: "today",
    time_24hr: true,
    minuteIncrement: 1,
    onChange: (selectedDates, dateStr) => {
      elements.taskDate.value = dateStr; // Update input with formatted string
    },
    locale: localeMap[currentLanguage]
  });

  elements.calendarIcon = document.querySelector(".calendar-icon");
  elements.calendarIcon.addEventListener("click", () => {
    fpInstance.open();
  });

  elements.languageSelector.addEventListener("change", () => {
    fpInstance.destroy();
    fpInstance = flatpickr(elements.taskDate, {
      enableTime: true,
      dateFormat: "d-m-Y H:i",
      minDate: "today",
      time_24hr: true,
      minuteIncrement: 1,
      onChange: (selectedDates, dateStr) => {
        elements.taskDate.value = dateStr;
      },
      locale: localeMap[currentLanguage]
    });
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data.type === "TASKS_SYNCED") {
        tasks = event.data.tasks;
        renderTasks();
      }
    });
  }

  window.addEventListener("offline", () => showModal(localizedMessages[currentLanguage].offlineWarning));

  syncThemeWithSystem();
  loadTasksFromDB();
  elements.languageSelector.value = currentLanguage;
  updateLocalization();
  elements.customThemeColor.value = localStorage.getItem("themeColor") || "#4b5e95";
  updateFont(localStorage.getItem("font") || "Roboto");
  updateGlassOpacity(localStorage.getItem("glassOpacity") || "0.05");
  elements.notificationsBtn.classList.toggle("active", isNotificationsEnabled);
  elements.notificationsBtn.title = isNotificationsEnabled
    ? localizedMessages[currentLanguage].notificationGranted
    : localizedMessages[currentLanguage].notificationDenied;
});