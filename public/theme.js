// Applies the saved dark theme before the app paints, so there is no flash of the light theme.
try {
  if (localStorage.getItem("op-theme") === "dark") {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
} catch (e) {}
