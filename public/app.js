const state = {
  token: localStorage.getItem("roblox_music_token") || "",
  user: JSON.parse(localStorage.getItem("roblox_music_user") || "null"),
  musics: [],
  search: "",
  category: "all",
  authMode: "login",
};

const elements = {
  authSection: document.getElementById("authSection"),
  addMusicSection: document.getElementById("addMusicSection"),
  authButton: document.getElementById("authButton"),
  authTitle: document.getElementById("authTitle"),
  authTabs: document.querySelectorAll(".tab"),
  authForm: document.getElementById("authForm"),
  musicForm: document.getElementById("musicForm"),
  searchInput: document.getElementById("searchInput"),
  categoryFilter: document.getElementById("categoryFilter"),
  usernameField: document.getElementById("usernameField"),
  username: document.getElementById("username"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  musicGrid: document.getElementById("musicGrid"),
  openAddMusicBtn: document.getElementById("openAddMusicBtn"),
  toast: document.getElementById("toast"),
};

const showToast = (message) => {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  setTimeout(() => elements.toast.classList.remove("show"), 2000);
};

const setAuthMode = (mode) => {
  state.authMode = mode;

  elements.authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.type === mode);
  });

  const isRegister = mode === "register";
  elements.authTitle.textContent = isRegister ? "Kayıt Ol" : "Giriş Yap";
  elements.usernameField.classList.toggle("hidden", !isRegister);
};

const updateAuthButton = () => {
  if (state.user) {
    elements.authButton.textContent = `Çıkış Yap (${state.user.username})`;
    elements.authButton.classList.remove("secondary-btn");
    elements.authButton.classList.add("primary-btn");
  } else {
    elements.authButton.textContent = "Giriş Yap";
    elements.authButton.classList.add("secondary-btn");
    elements.authButton.classList.remove("primary-btn");
  }
};

const renderMusic = () => {
  const filtered = state.musics.filter((music) => {
    const searchMatch = music.title.toLowerCase().includes(state.search.toLowerCase());
    const categoryMatch = state.category === "all" || music.category === state.category;

    return searchMatch && categoryMatch;
  });

  if (!filtered.length) {
    elements.musicGrid.innerHTML = `
      <div class="empty-state">
        <h3>Henüz müzik eklenmemiş.</h3>
        <p>İlk şarkıyı eklemek için müzik ekle butonunu kullanın.</p>
      </div>
    `;
    return;
  }

  elements.musicGrid.innerHTML = filtered
    .map((music) => {
      const userId = state.user ? state.user.id : null;
      const liked = music.likes?.includes(userId);
      const disliked = music.dislikes?.includes(userId);
      const statusClass = music.status === "working" ? "status-working" : "status-broken";
      const statusText = music.status === "working" ? "🟢 Çalışıyor" : "🔴 Silinmiş";

      return `
        <article class="music-card" data-id="${music._id}">
          <div class="music-card-header">
            <h3>${music.title}</h3>
            <div class="meta-row">
              <span class="category-badge">${music.category}</span>
              <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
          </div>

          <div class="music-body">
            <div class="roblox-id-box">
              <div>
                <strong>Roblox ID</strong>
                <span>${music.robloxId}</span>
              </div>
              <button class="copy-btn" data-copy-id="${music.robloxId}">Kopyala</button>
            </div>

            <div class="music-actions">
              <div class="vote-group">
                <button class="like-btn ${liked ? "active" : ""}" data-like-id="${music._id}">
                  👍 <span>${music.likes?.length || 0}</span>
                </button>
                <button class="dislike-btn ${disliked ? "active" : ""}" data-dislike-id="${music._id}">
                  👎 <span>${music.dislikes?.length || 0}</span>
                </button>
              </div>
            </div>
          </div>

          <div class="music-footer">
            <span>Ekleyen: ${music.addedBy?.username || "Bilinmeyen"}</span>
          </div>
        </article>
      `;
    })
    .join("");
};

const fetchMusics = async () => {
  try {
    const response = await fetch("/api/music");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Müzikler yüklenemedi.");
    }

    state.musics = data.musics || [];
    renderMusic();
  } catch (error) {
    console.error(error);
    showToast(error.message);
  }
};

const saveTokenAndUser = (token, user) => {
  state.token = token;
  state.user = user;
  localStorage.setItem("roblox_music_token", token);
  localStorage.setItem("roblox_music_user", JSON.stringify(user));
  updateAuthButton();
};

const clearAuth = () => {
  state.token = "";
  state.user = null;
  localStorage.removeItem("roblox_music_token");
  localStorage.removeItem("roblox_music_user");
  updateAuthButton();
  elements.authSection.classList.remove("hidden");
  elements.addMusicSection.classList.add("hidden");
};

const authRequest = async (endpoint, payload) => {
  const response = await fetch(`/api/auth/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "İşlem başarısız.");
  }

  return data;
};

const handleAuthSubmit = async (event) => {
  event.preventDefault();

  const payload = {
    email: elements.email.value,
    password: elements.password.value,
  };

  if (state.authMode === "register") {
    payload.username = elements.username.value;
  }

  try {
    const endpoint = state.authMode === "register" ? "register" : "login";
    const data = await authRequest(endpoint, payload);

    saveTokenAndUser(data.token, data.user);

    elements.authForm.reset();
    elements.authSection.classList.add("hidden");
    showToast(data.message);

    if (state.user) {
      fetchMusics();
    }
  } catch (error) {
    showToast(error.message);
  }
};

const handleMusicSubmit = async (event) => {
  event.preventDefault();

  if (!state.user || !state.token) {
    showToast("Müzik eklemek için giriş yapmalısınız.");
    elements.authSection.classList.remove("hidden");
    return;
  }

  const payload = {
    title: document.getElementById("musicTitle").value,
    robloxId: document.getElementById("musicRobloxId").value,
    category: document.getElementById("musicCategory").value,
  };

  try {
    const response = await fetch("/api/music", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Müzik eklenemedi.");
    }

    elements.musicForm.reset();
    elements.addMusicSection.classList.add("hidden");
    showToast("Müzik başarıyla eklendi.");
    fetchMusics();
  } catch (error) {
    showToast(error.message);
  }
};

const handleLikeDislike = async (event) => {
  if (!state.user || !state.token) {
    showToast("Oy vermek için giriş yapmalısınız.");
    elements.authSection.classList.remove("hidden");
    return;
  }

  const likeBtn = event.target.closest("[data-like-id]");
  const dislikeBtn = event.target.closest("[data-dislike-id]");

  if (!likeBtn && !dislikeBtn) return;

  const musicId = likeBtn ? likeBtn.dataset.likeId : dislikeBtn.dataset.dislikeId;
  const endpoint = likeBtn ? "like" : "dislike";

  try {
    const response = await fetch(`/api/music/${musicId}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Oyunuz işlenemedi.");
    }

    fetchMusics();
  } catch (error) {
    showToast(error.message);
  }
};

const handleCopy = async (event) => {
  const copyBtn = event.target.closest("[data-copy-id]");
  if (!copyBtn) return;

  const id = copyBtn.dataset.copyId;
  try {
    await navigator.clipboard.writeText(id);
    showToast("Roblox ID kopyalandı.");
  } catch (error) {
    showToast("Panoya kopyalanamadı.");
  }
};

elements.authTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setAuthMode(tab.dataset.type);
  });
});

elements.authButton.addEventListener("click", () => {
  if (state.user) {
    clearAuth();
    return;
  }

  elements.authSection.classList.toggle("hidden");
});

elements.openAddMusicBtn.addEventListener("click", () => {
  if (!state.user || !state.token) {
    showToast("Müzik eklemek için giriş yapmalısınız.");
    elements.authSection.classList.remove("hidden");
    return;
  }

  elements.addMusicSection.classList.toggle("hidden");
});

elements.searchInput.addEventListener("input", (e) => {
  state.search = e.target.value;
  renderMusic();
});

elements.categoryFilter.addEventListener("change", (e) => {
  state.category = e.target.value;
  renderMusic();
});

elements.authForm.addEventListener("submit", handleAuthSubmit);
elements.musicForm.addEventListener("submit", handleMusicSubmit);
elements.musicGrid.addEventListener("click", (event) => {
  handleCopy(event);
  handleLikeDislike(event);
});

updateAuthButton();
setAuthMode("login");
fetchMusics();
